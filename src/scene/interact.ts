// Управление сценой: выбор, перетаскивание предметов, проёмов и комнат, клавиши, рамка выделения.

import * as THREE from 'three'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { addItem, addOpening, addRoom, duplicateItem, LIMITS, removeItem, removeOpening, removeRoom, setUnderlay, updateItem, updateOpening, updateRoom, updateUnderlay, type Doc, type ItemSrc, type Room } from '../core/doc'
import { clampToRoom, footprint, snap, wallSnap } from '../core/geom'
import { fmt, tr } from '../core/i18n'
import { underlayContains, underlaySize } from '../core/underlay'
import { roomAt, roomFromDrag, snapOpening } from '../core/walls'
import type { Store } from '../store'
import { WALL_T, type RoomsView } from './rooms'
import type { Stage } from './stage'
import { UNDERLAY_Y } from './underlay'
import { itemIdOf, type ItemsView } from './view'

const YELLOW = '#f4c430'
const STEP = 0.05
type Edge = 'n' | 's' | 'w' | 'e'

type Drag =
  | { kind: 'item'; id: string; ox: number; oz: number; moved: boolean; fresh: boolean }
  | { kind: 'opening'; id: string; moved: boolean }
  | { kind: 'roomMove'; id: string; px: number; pz: number; room: Room; items: { id: string; x: number; z: number }[]; openings: { id: string; x: number; z: number }[]; moved: boolean }
  | { kind: 'roomEdge'; id: string; edge: Edge; moved: boolean }
  | { kind: 'underlay'; ox: number; oz: number; moved: boolean }
  | { kind: 'draw'; a: { x: number; z: number }; rect: ReturnType<typeof roomFromDrag> | null; moved: boolean }

type P = { x: number; z: number }

export class Interact {
  private drag: Drag | null = null
  private down: { x: number; y: number } | null = null
  private readonly outline: LineSegments2
  private readonly lineMat = new LineMaterial({ color: YELLOW, linewidth: 2.5, depthTest: false, transparent: true })
  private readonly handles = new THREE.Group()
  private readonly tags: HTMLElement[] = []
  private pointerId: number | null = null
  /** масштаб плана по двум точкам: пока идёт, щелчки ставят точки */
  private calib: { points: P[] } | null = null
  private readonly calibLine: LineSegments2
  private readonly calibDots: THREE.Mesh[] = []
  /** вызывается, когда меняется состояние разметки масштаба */
  onCalibration: () => void = () => {}
  /** рисование комнат: пока включено, нажатие и протяжка по коврику создают комнату */
  private drawOn = false
  /** вызывается, когда рисование комнат включается или выключается */
  onDrawing: () => void = () => {}

  constructor(
    private readonly stage: Stage,
    private readonly store: Store,
    private readonly rooms: RoomsView,
    private readonly items: ItemsView,
    private readonly tagsEl: HTMLElement,
    private readonly toast: (text: string) => void,
  ) {
    this.outline = new LineSegments2(new LineSegmentsGeometry(), this.lineMat)
    this.outline.renderOrder = 20
    this.outline.visible = false
    this.outline.frustumCulled = false
    this.calibLine = new LineSegments2(new LineSegmentsGeometry(), this.lineMat)
    this.calibLine.renderOrder = 22
    this.calibLine.visible = false
    this.calibLine.frustumCulled = false
    stage.overlay.add(this.outline, this.handles, this.calibLine)
    const handleMat = new THREE.MeshBasicMaterial({ color: YELLOW, depthTest: false, toneMapped: false })
    const dot = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 20)
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(dot, handleMat)
      m.renderOrder = 23
      m.visible = false
      this.calibDots.push(m)
      stage.overlay.add(m)
    }
    const bar = new THREE.BoxGeometry(1, 0.05, 0.28)
    for (const edge of ['n', 's', 'w', 'e'] as Edge[]) {
      const m = new THREE.Mesh(bar, handleMat)
      m.userData.handle = edge
      m.renderOrder = 21
      this.handles.add(m)
    }
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 28), handleMat)
    grip.userData.handle = 'move'
    grip.renderOrder = 21
    this.handles.add(grip)
    this.handles.visible = false

    const el = stage.renderer.domElement
    el.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true })
    window.addEventListener('pointermove', (e) => this.onMove(e))
    window.addEventListener('pointerup', (e) => this.onUp(e))
    window.addEventListener('pointercancel', (e) => this.onUp(e))
    window.addEventListener('keydown', (e) => this.onKey(e))
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    stage.onFrame(() => this.refreshOverlay())
    store.on(() => {
      if (this.calib && this.store.selection?.kind !== 'underlay') this.stopCalibration()
      if (this.drawOn && this.store.selection) this.stopDrawing()
      this.rebuildOutline()
      stage.invalidate()
    })
    items.onLoaded = () => this.rebuildOutline()
  }

  // ---------- выбор ----------

  private cast(e: { clientX: number; clientY: number }): THREE.Raycaster {
    const rc = this.stage.raycaster
    rc.setFromCamera(this.stage.ndc(e.clientX, e.clientY), this.stage.camera)
    return rc
  }

  private floorPoint(e: { clientX: number; clientY: number }, y = 0): THREE.Vector3 | null {
    return this.stage.pointOnPlane(e.clientX, e.clientY, y)
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    this.down = { x: e.clientX, y: e.clientY }
    // рисование комнаты: первый угол — там, где нажали
    if (this.drawOn) {
      const p = this.floorPoint(e)
      if (!p) return
      this.drag = { kind: 'draw', a: { x: p.x, z: p.z }, rect: null, moved: false }
      return this.capture(e)
    }
    const rc = this.cast(e)
    const sel = this.store.selection

    if (this.handles.visible && sel?.kind === 'room') {
      const hit = rc.intersectObjects(this.handles.children, false)[0]
      const room = this.store.doc.rooms.find((r) => r.id === sel.id)
      if (hit && room) {
        const handle = hit.object.userData.handle as Edge | 'move'
        const p = this.floorPoint(e)
        if (handle === 'move' && p) {
          const doc = this.store.doc
          this.drag = {
            kind: 'roomMove',
            id: room.id,
            px: p.x,
            pz: p.z,
            room: { ...room },
            items: doc.items.filter((i) => roomAt(doc.rooms, i.x, i.z)?.id === room.id).map((i) => ({ id: i.id, x: i.x, z: i.z })),
            openings: doc.openings.filter((o) => onRoomEdge(room, o)).map((o) => ({ id: o.id, x: o.x, z: o.z })),
            moved: false,
          }
        } else if (handle !== 'move') {
          this.drag = { kind: 'roomEdge', id: room.id, edge: handle, moved: false }
        }
        if (this.drag) return this.capture(e)
      }
    }

    // пока размечается масштаб, щелчки ставят точки, а перетаскивание двигает камеру
    if (this.calib) return
    const under = this.store.doc.scene.underlay
    if (sel?.kind === 'underlay' && under) {
      const p = this.floorPoint(e, UNDERLAY_Y)
      if (p && underlayContains(under, p)) {
        this.drag = { kind: 'underlay', ox: under.x - p.x, oz: under.z - p.z, moved: false }
        return this.capture(e)
      }
    }

    const hits = rc.intersectObjects([...this.items.pickables(), ...this.rooms.openingTargets], true)
    const first = hits.find((h) => itemIdOf(h.object) || h.object.userData.openingId)
    if (first) {
      const itemId = itemIdOf(first.object)
      if (itemId) {
        const item = this.store.doc.items.find((i) => i.id === itemId)
        if (!item) return
        this.store.select({ kind: 'item', id: itemId })
        const p = this.floorPoint(e, item.y) ?? new THREE.Vector3(item.x, 0, item.z)
        this.drag = { kind: 'item', id: itemId, ox: item.x - p.x, oz: item.z - p.z, moved: false, fresh: false }
      } else {
        const id = first.object.userData.openingId as string
        this.store.select({ kind: 'opening', id })
        this.drag = { kind: 'opening', id, moved: false }
      }
      this.capture(e)
    }
  }

  private capture(e: PointerEvent): void {
    this.stage.controls.enabled = false
    this.pointerId = e.pointerId
    e.stopPropagation()
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag
    if (!d || (this.pointerId !== null && e.pointerId !== this.pointerId)) return
    if (!d.moved && this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5) return
    d.moved = true
    if (d.kind === 'item') this.dragItem(d, e)
    else if (d.kind === 'opening') this.dragOpening(d, e)
    else if (d.kind === 'roomMove') this.dragRoom(d, e)
    else if (d.kind === 'roomEdge') this.dragEdge(d, e)
    else if (d.kind === 'underlay') this.dragUnderlay(d, e)
    else this.dragDraw(d, e)
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag
    if (d) {
      if (this.pointerId !== null && e.pointerId !== this.pointerId) return
      this.drag = null
      this.pointerId = null
      this.stage.controls.enabled = true
      if (d.kind === 'draw') {
        this.down = null
        return this.finishDraw(d)
      }
      if (d.moved || (d.kind === 'item' && d.fresh)) this.store.commit()
      this.down = null
      // по плану щёлкнули, а не потащили его: выбрать то, что под указателем
      if (d.kind === 'underlay' && !d.moved) this.pickAt(e)
      return
    }
    // щелчок по пустому месту: выбрать комнату под указателем или снять выделение
    if (!this.down || e.target !== this.stage.renderer.domElement) return
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y)
    this.down = null
    if (moved > 5 || this.drawOn) return
    if (this.calib) {
      const p = this.floorPoint(e, UNDERLAY_Y)
      if (p) this.addCalibrationPoint({ x: p.x, z: p.z })
      return
    }
    this.pickAt(e)
  }

  /** Выбрать то, что под указателем: предмет или проём, затем комнату, затем план квартиры. */
  private pickAt(e: { clientX: number; clientY: number }): void {
    const rc = this.cast(e)
    const first = rc.intersectObjects([...this.items.pickables(), ...this.rooms.openingTargets], true).find((h) => itemIdOf(h.object) || h.object.userData.openingId)
    if (first) {
      const itemId = itemIdOf(first.object)
      return this.store.select(itemId ? { kind: 'item', id: itemId } : { kind: 'opening', id: first.object.userData.openingId as string })
    }
    const roomId = rc.intersectObjects(this.rooms.floors, false)[0]?.object.userData.roomId as string | undefined
    if (roomId) return this.store.select({ kind: 'room', id: roomId })
    const under = this.store.doc.scene.underlay
    const p = under ? this.floorPoint(e, UNDERLAY_Y) : null
    this.store.select(under && p && underlayContains(under, p) ? { kind: 'underlay', id: 'underlay' } : null)
  }

  // ---------- рисование комнаты ----------

  get drawing(): boolean {
    return this.drawOn
  }

  startDrawing(): void {
    this.stopCalibration()
    this.store.select(null)
    this.drawOn = true
    this.stage.renderer.domElement.style.cursor = 'crosshair'
    this.onDrawing()
  }

  stopDrawing(): void {
    if (!this.drawOn) return
    this.drawOn = false
    this.stage.renderer.domElement.style.cursor = ''
    this.outline.visible = false
    this.setTags([])
    this.stage.invalidate()
    this.onDrawing()
  }

  /** Пока тянут: рамка будущей комнаты и её размеры. */
  private dragDraw(d: Extract<Drag, { kind: 'draw' }>, e: PointerEvent): void {
    const p = this.floorPoint(e)
    if (!p) return
    const r = roomFromDrag(d.a, { x: p.x, z: p.z }, this.store.doc.rooms)
    d.rect = r
    this.setBox(new THREE.Vector3(r.x - r.w / 2, 0.04, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, 0.04, r.z + r.d / 2))
    this.outline.position.set(0, 0, 0)
    this.outline.rotation.set(0, 0, 0)
    this.outline.visible = true
    const lang = this.store.lang
    this.setTags([
      { text: `${fmt(lang, r.w)} ${tr(lang, 'm')}`, at: new THREE.Vector3(r.x, 0.05, r.z + r.d / 2 + 0.38) },
      { text: `${fmt(lang, r.d)} ${tr(lang, 'm')}`, at: new THREE.Vector3(r.x + r.w / 2 + 0.5, 0.05, r.z) },
    ])
    this.stage.invalidate()
  }

  private finishDraw(d: Extract<Drag, { kind: 'draw' }>): void {
    this.outline.visible = false
    this.setTags([])
    this.stage.invalidate()
    const r = d.rect
    if (!d.moved || !r) return
    if (!r.ok) return this.toast(tr(this.store.lang, 'drawRoomSmall'))
    const id = this.store.newId('r')
    this.store.update((doc) => addRoom(doc, id, { x: r.x, z: r.z, w: r.w, d: r.d }))
  }

  // ---------- масштаб плана по двум точкам ----------

  get calibration(): { points: P[] } | null {
    return this.calib
  }

  startCalibration(): void {
    this.stopDrawing()
    this.calib = { points: [] }
    this.calibrationChanged()
  }

  stopCalibration(): void {
    if (!this.calib) return
    this.calib = null
    this.calibrationChanged()
  }

  /** Поставить точку разметки. Третья точка начинает разметку заново. */
  addCalibrationPoint(p: P): void {
    if (!this.calib) return
    this.calib.points = this.calib.points.length >= 2 ? [p] : [...this.calib.points, p]
    this.calibrationChanged()
  }

  private calibrationChanged(): void {
    const pts = this.calib?.points ?? []
    this.calibLine.visible = pts.length === 2
    if (pts.length === 2) {
      this.calibLine.geometry.dispose()
      this.calibLine.geometry = new LineSegmentsGeometry().setPositions([pts[0].x, UNDERLAY_Y + 0.01, pts[0].z, pts[1].x, UNDERLAY_Y + 0.01, pts[1].z])
    }
    this.calibDots.forEach((m, i) => {
      m.visible = i < pts.length
      if (pts[i]) m.position.set(pts[i].x, UNDERLAY_Y + 0.01, pts[i].z)
    })
    this.refreshOverlay()
    this.stage.invalidate()
    this.onCalibration()
  }

  // ---------- перетаскивание ----------

  /** Положение предмета с привязкой к сетке, стенам и границам комнаты. */
  private settle(doc: Doc, id: string, x: number, z: number, free: boolean): { x: number; z: number } {
    const item = doc.items.find((i) => i.id === id)
    const size = this.items.size(id)
    let pos = { x: free ? x : snap(x, STEP), z: free ? z : snap(z, STEP) }
    if (!item || !size) return pos
    const half = footprint({ x: size.x, z: size.z }, item.rot)
    const room = roomAt(doc.rooms, pos.x, pos.z)
    if (!free) pos = wallSnap(pos, half, room, 0.12, WALL_T / 2)
    return clampToRoom(pos, half, room, WALL_T / 2)
  }

  private dragItem(d: Extract<Drag, { kind: 'item' }>, e: PointerEvent): void {
    const doc = this.store.doc
    const item = doc.items.find((i) => i.id === d.id)
    if (!item) return
    const size = this.items.size(d.id)
    let y = item.lift ? item.y : 0
    let px: number | null = null
    let pz: number | null = null
    // мелкие вещи встают на поверхность мебели под указателем
    if (!item.lift && size && Math.max(size.x, size.z) < 1.05) {
      const self = this.items.object(d.id)
      const hits = this.cast(e).intersectObjects(this.items.pickables(), true)
      for (const h of hits) {
        if (!h.face || itemIdOf(h.object) === d.id || (self && isInside(h.object, self))) continue
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
        if (n.y > 0.6 && h.point.y > 0.06) {
          y = Math.round(h.point.y * 1000) / 1000
          px = h.point.x
          pz = h.point.z
        }
        break
      }
    }
    if (px === null || pz === null) {
      const p = this.floorPoint(e, y)
      if (!p) return
      px = p.x + d.ox
      pz = p.z + d.oz
    }
    const pos = y > 0 && !item.lift ? { x: px, z: pz } : this.settle(doc, d.id, px, pz, e.altKey)
    this.store.update((doc0) => updateItem(doc0, d.id, { x: pos.x, z: pos.z, y }), true)
  }

  private dragUnderlay(d: Extract<Drag, { kind: 'underlay' }>, e: PointerEvent): void {
    const p = this.floorPoint(e, UNDERLAY_Y)
    if (p) this.store.update((doc) => updateUnderlay(doc, { x: p.x + d.ox, z: p.z + d.oz }), true)
  }

  private dragOpening(d: Extract<Drag, { kind: 'opening' }>, e: PointerEvent): void {
    const p = this.floorPoint(e)
    const o = this.store.doc.openings.find((q) => q.id === d.id)
    if (!p || !o) return
    const s = snapOpening(this.rooms.segs, { x: p.x, z: p.z }, o.width, 1.5)
    if (s) this.store.update((doc) => updateOpening(doc, d.id, { axis: s.axis, x: snapAlong(s.x, s.axis === 'x'), z: snapAlong(s.z, s.axis === 'z') }), true)
  }

  private dragRoom(d: Extract<Drag, { kind: 'roomMove' }>, e: PointerEvent): void {
    const p = this.floorPoint(e)
    if (!p) return
    const others = this.store.doc.rooms.filter((r) => r.id !== d.id)
    let dx = snap(p.x - d.px, STEP)
    let dz = snap(p.z - d.pz, STEP)
    const r = d.room
    dx += nearest([r.x + dx - r.w / 2, r.x + dx + r.w / 2], others.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2]))
    dz += nearest([r.z + dz - r.d / 2, r.z + dz + r.d / 2], others.flatMap((o) => [o.z - o.d / 2, o.z + o.d / 2]))
    this.store.update((doc) => {
      let next = updateRoom(doc, d.id, { x: r.x + dx, z: r.z + dz })
      for (const it of d.items) next = updateItem(next, it.id, { x: it.x + dx, z: it.z + dz })
      for (const o of d.openings) next = updateOpening(next, o.id, { x: o.x + dx, z: o.z + dz })
      return next
    }, true)
  }

  private dragEdge(d: Extract<Drag, { kind: 'roomEdge' }>, e: PointerEvent): void {
    const p = this.floorPoint(e)
    const doc = this.store.doc
    const room = doc.rooms.find((r) => r.id === d.id)
    if (!p || !room) return
    const others = doc.rooms.filter((r) => r.id !== d.id)
    const horizontal = d.edge === 'w' || d.edge === 'e'
    const lo = horizontal ? room.x - room.w / 2 : room.z - room.d / 2
    const hi = horizontal ? room.x + room.w / 2 : room.z + room.d / 2
    const cands = others.flatMap((o) => (horizontal ? [o.x - o.w / 2, o.x + o.w / 2] : [o.z - o.d / 2, o.z + o.d / 2]))
    let v = snap(horizontal ? p.x : p.z, STEP)
    v += nearest([v], cands)
    const positive = d.edge === 'e' || d.edge === 's'
    const old = positive ? hi : lo
    if (positive) v = Math.min(lo + LIMITS.roomMax, Math.max(lo + LIMITS.roomMin, v))
    else v = Math.max(hi - LIMITS.roomMax, Math.min(hi - LIMITS.roomMin, v))
    if (Math.abs(v - old) < 1e-6) return
    const a = positive ? lo : v
    const b = positive ? v : hi
    this.store.update((doc0) => {
      let next = horizontal ? updateRoom(doc0, d.id, { x: (a + b) / 2, w: b - a }) : updateRoom(doc0, d.id, { z: (a + b) / 2, d: b - a })
      // проёмы на передвинутой стене едут вместе с ней
      for (const o of doc0.openings) {
        if (horizontal && o.axis === 'z' && Math.abs(o.x - old) < 0.03 && Math.abs(o.z - room.z) <= room.d / 2) next = updateOpening(next, o.id, { x: v })
        if (!horizontal && o.axis === 'x' && Math.abs(o.z - old) < 0.03 && Math.abs(o.x - room.x) <= room.w / 2) next = updateOpening(next, o.id, { z: v })
      }
      return next
    }, true)
  }

  // ---------- действия ----------

  /** Точка на полу в центре вида. */
  private viewCenter(): { x: number; z: number } {
    const t = this.stage.controls.target
    return { x: t.x, z: t.z }
  }

  /** Добавить предмет в центр вида. Возвращает id. */
  addItem(src: ItemSrc, at?: { x: number; z: number }): string {
    const id = this.store.newId('i')
    const c = at ?? this.viewCenter()
    this.store.update((doc) => addItem(doc, src, id, { x: snap(c.x, STEP), z: snap(c.z, STEP) }))
    this.store.select({ kind: 'item', id })
    // когда модель загрузится и станет известен размер — вписать в комнату
    const fit = () => {
      const doc = this.store.doc
      const item = doc.items.find((i) => i.id === id)
      if (!item) return
      const pos = this.settle(doc, id, item.x, item.z, false)
      if (pos.x !== item.x || pos.z !== item.z) this.store.update((d) => updateItem(d, id, pos), true)
      this.store.commit()
    }
    if (this.items.size(id)) fit()
    else {
      const prev = this.items.onLoaded
      this.items.onLoaded = (loaded) => {
        prev(loaded)
        if (loaded === id) {
          this.items.onLoaded = prev
          fit()
        }
      }
    }
    return id
  }

  /** Начать перетаскивание нового предмета из каталога. */
  startPlaceDrag(src: ItemSrc, e: PointerEvent): void {
    const p = this.floorPoint(e)
    const id = this.addItem(src, p ? { x: p.x, z: p.z } : undefined)
    this.drag = { kind: 'item', id, ox: 0, oz: 0, moved: true, fresh: true }
    this.down = { x: e.clientX, y: e.clientY }
    this.stage.controls.enabled = false
    this.pointerId = e.pointerId
  }

  addOpening(kind: 'door' | 'window'): void {
    const width = kind === 'door' ? 0.9 : 1.2
    const s = snapOpening(this.rooms.segs, this.viewCenter(), width, 60)
    if (!s) return this.toast(tr(this.store.lang, 'noWallNear'))
    const id = this.store.newId('o')
    this.store.update((doc) => addOpening(doc, { id, kind, axis: s.axis, x: s.x, z: s.z, width }))
    this.store.select({ kind: 'opening', id })
  }

  rotateSelected(deg: number): void {
    const sel = this.store.selection
    if (sel?.kind !== 'item') return
    const item = this.store.doc.items.find((i) => i.id === sel.id)
    if (!item) return
    this.store.update((doc) => {
      const turned = updateItem(doc, sel.id, { rot: item.rot + deg })
      const size = this.items.size(sel.id)
      if (!size) return turned
      const half = footprint({ x: size.x, z: size.z }, item.rot + deg)
      const pos = clampToRoom({ x: item.x, z: item.z }, half, roomAt(doc.rooms, item.x, item.z), WALL_T / 2)
      return updateItem(turned, sel.id, pos)
    })
  }

  duplicateSelected(): void {
    const sel = this.store.selection
    if (sel?.kind !== 'item') return
    const id = this.store.newId('i')
    this.store.update((doc) => duplicateItem(doc, sel.id, id))
    this.store.select({ kind: 'item', id })
  }

  deleteSelected(): void {
    const sel = this.store.selection
    if (!sel) return
    this.store.select(null)
    this.store.update((doc) => (sel.kind === 'item' ? removeItem(doc, sel.id) : sel.kind === 'opening' ? removeOpening(doc, sel.id) : sel.kind === 'room' ? removeRoom(doc, sel.id) : setUnderlay(doc, null)))
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) this.store.redo()
      else this.store.undo()
    } else if (mod && e.code === 'KeyY') {
      e.preventDefault()
      this.store.redo()
    } else if (mod && e.code === 'KeyD') {
      e.preventDefault()
      this.duplicateSelected()
    } else if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.store.selection) {
        e.preventDefault()
        this.deleteSelected()
      }
    } else if (e.code === 'KeyR' && !mod) {
      this.rotateSelected(e.shiftKey ? -90 : 90)
    } else if (e.code === 'Escape') {
      if (this.drawOn) this.stopDrawing()
      else if (this.calib) this.stopCalibration()
      else this.store.select(null)
    } else if (e.code.startsWith('Arrow')) {
      const sel = this.store.selection
      if (sel?.kind === 'underlay') {
        // план двигается по сантиметру (с Shift — по 10 см), по осям экрана в виде сверху
        e.preventDefault()
        const u = this.store.doc.scene.underlay
        if (!u) return
        const step = e.shiftKey ? 0.1 : 0.01
        const dx = e.code === 'ArrowRight' ? step : e.code === 'ArrowLeft' ? -step : 0
        const dz = e.code === 'ArrowDown' ? step : e.code === 'ArrowUp' ? -step : 0
        this.store.update((doc) => updateUnderlay(doc, { x: u.x + dx, z: u.z + dz }))
        return
      }
      if (sel?.kind !== 'item') return
      e.preventDefault()
      const item = this.store.doc.items.find((i) => i.id === sel.id)
      if (!item) return
      // стрелки двигают относительно взгляда камеры, по ближайшей оси
      const f = new THREE.Vector3()
      this.stage.camera.getWorldDirection(f)
      const forward = Math.abs(f.x) > Math.abs(f.z) ? { x: Math.sign(f.x), z: 0 } : { x: 0, z: Math.sign(f.z) || -1 }
      const right = { x: -forward.z, z: forward.x }
      const step = e.shiftKey ? 0.5 : STEP
      const dir = e.code === 'ArrowUp' ? forward : e.code === 'ArrowDown' ? { x: -forward.x, z: -forward.z } : e.code === 'ArrowRight' ? right : { x: -right.x, z: -right.z }
      const pos = this.settle(this.store.doc, sel.id, item.x + dir.x * step, item.z + dir.z * step, true)
      this.store.update((doc) => updateItem(doc, sel.id, pos))
    }
  }

  // ---------- рамка выделения, ручки и подписи размеров ----------

  private setBox(min: THREE.Vector3, max: THREE.Vector3): void {
    const [x0, y0, z0, x1, y1, z1] = [min.x, min.y, min.z, max.x, max.y, max.z]
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ]
    const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7]
    const pos: number[] = []
    for (const i of edges) pos.push(...c[i])
    this.outline.geometry.dispose()
    this.outline.geometry = new LineSegmentsGeometry().setPositions(pos)
  }

  private rebuildOutline(): void {
    const sel = this.store.selection
    const doc = this.store.doc
    this.outline.visible = false
    this.handles.visible = false
    this.outline.position.set(0, 0, 0)
    this.outline.rotation.set(0, 0, 0)
    if (!sel) return this.setTags([])
    if (sel.kind === 'item') {
      const size = this.items.size(sel.id)
      const item = doc.items.find((i) => i.id === sel.id)
      if (!size || !item) return this.setTags([])
      this.setBox(new THREE.Vector3(-size.x / 2, 0.01, -size.z / 2), new THREE.Vector3(size.x / 2, size.y, size.z / 2))
      this.outline.position.set(item.x, item.y, item.z)
      this.outline.rotation.y = (item.rot * Math.PI) / 180
      this.outline.visible = true
    } else if (sel.kind === 'room') {
      const r = doc.rooms.find((q) => q.id === sel.id)
      if (!r) return this.setTags([])
      this.setBox(new THREE.Vector3(r.x - r.w / 2, 0.02, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, 0.02, r.z + r.d / 2))
      this.outline.visible = true
      this.handles.visible = true
    } else if (sel.kind === 'underlay') {
      const u = doc.scene.underlay
      if (!u) return this.setTags([])
      const size = underlaySize(u)
      this.setBox(new THREE.Vector3(u.x - size.w / 2, UNDERLAY_Y + 0.005, u.z - size.d / 2), new THREE.Vector3(u.x + size.w / 2, UNDERLAY_Y + 0.005, u.z + size.d / 2))
      this.outline.visible = true
    } else {
      const o = doc.openings.find((q) => q.id === sel.id)
      if (!o) return this.setTags([])
      const t = WALL_T / 2 + 0.06
      const y0 = o.kind === 'door' ? 0.01 : 0.9
      const hx = o.axis === 'x' ? o.width / 2 : t
      const hz = o.axis === 'x' ? t : o.width / 2
      this.setBox(new THREE.Vector3(o.x - hx, y0, o.z - hz), new THREE.Vector3(o.x + hx, o.kind === 'door' ? 2.05 : 2.1, o.z + hz))
      this.outline.visible = true
    }
    this.refreshOverlay()
  }

  private setTags(list: { text: string; at: THREE.Vector3 }[]): void {
    while (this.tags.length < list.length) {
      const el = document.createElement('div')
      el.className = 'tag'
      this.tagsEl.appendChild(el)
      this.tags.push(el)
    }
    this.tags.forEach((el, i) => {
      const t = list[i]
      if (!t) {
        el.hidden = true
        return
      }
      const p = this.stage.project(t.at)
      el.hidden = !p.visible
      el.textContent = t.text
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`
    })
  }

  /** Каждый кадр: ручки держат размер на экране, подписи следуют за объектом. */
  private refreshOverlay(): void {
    const sel = this.store.selection
    const doc = this.store.doc
    const lang = this.store.lang
    if (!sel) return
    if (sel.kind === 'underlay') {
      const u = doc.scene.underlay
      if (!u) return this.setTags([])
      const size = underlaySize(u)
      const pts = this.calib?.points ?? []
      // точки разметки держат размер на экране
      for (const m of this.calibDots) {
        if (!m.visible) continue
        const k = THREE.MathUtils.clamp(this.stage.camera.position.distanceTo(m.position) * 0.012, 0.06, 0.5)
        m.scale.set(k, 1, k)
      }
      const tags = [{ text: `${fmt(lang, size.w)} × ${fmt(lang, size.d)} ${tr(lang, 'm')}`, at: new THREE.Vector3(u.x, UNDERLAY_Y, u.z + size.d / 2 + 0.4) }]
      if (pts.length === 2) tags.push({ text: `${fmt(lang, Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z))} ${tr(lang, 'm')}`, at: new THREE.Vector3((pts[0].x + pts[1].x) / 2, UNDERLAY_Y + 0.05, (pts[0].z + pts[1].z) / 2) })
      return this.setTags(tags)
    }
    if (sel.kind === 'item') {
      const size = this.items.size(sel.id)
      const item = doc.items.find((i) => i.id === sel.id)
      if (!size || !item) return this.setTags([])
      const cm = (v: number) => Math.round(v * 100)
      this.setTags([{ text: `${cm(size.x)} × ${cm(size.z)} × ${cm(size.y)} ${tr(lang, 'cm')}`, at: new THREE.Vector3(item.x, item.y + size.y + 0.22, item.z) }])
    } else if (sel.kind === 'room') {
      const r = doc.rooms.find((q) => q.id === sel.id)
      if (!r) return this.setTags([])
      const dist = this.stage.camera.position.distanceTo(new THREE.Vector3(r.x, 0, r.z))
      const k = THREE.MathUtils.clamp(dist * 0.045, 0.35, 1.4)
      for (const h of this.handles.children) {
        const edge = h.userData.handle as Edge | 'move'
        if (edge === 'move') {
          h.position.set(r.x, 0.04, r.z)
          h.scale.set(k * 0.5, 1, k * 0.5)
        } else {
          const horizontal = edge === 'w' || edge === 'e'
          h.position.set(edge === 'w' ? r.x - r.w / 2 : edge === 'e' ? r.x + r.w / 2 : r.x, 0.04, edge === 'n' ? r.z - r.d / 2 : edge === 's' ? r.z + r.d / 2 : r.z)
          h.rotation.y = horizontal ? Math.PI / 2 : 0
          h.scale.set(k * 0.9, 1, k)
        }
      }
      this.setTags([
        { text: `${fmt(lang, r.w)} ${tr(lang, 'm')}`, at: new THREE.Vector3(r.x, 0.05, r.z + r.d / 2 + 0.38) },
        { text: `${fmt(lang, r.d)} ${tr(lang, 'm')}`, at: new THREE.Vector3(r.x + r.w / 2 + 0.5, 0.05, r.z) },
      ])
    } else {
      const o = doc.openings.find((q) => q.id === sel.id)
      if (!o) return this.setTags([])
      this.setTags([{ text: `${Math.round(o.width * 100)} ${tr(lang, 'cm')}`, at: new THREE.Vector3(o.x, 2.35, o.z) }])
    }
  }
}

function isInside(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj
  while (o) {
    if (o === root) return true
    o = o.parent
  }
  return false
}

/** Поправка, чтобы ближайший край встал на край другой комнаты. */
function nearest(edges: number[], cands: number[], dist = 0.15): number {
  let best = 0
  let bd = dist
  for (const e of edges) {
    for (const c of cands) {
      const d = c - e
      if (Math.abs(d) < bd) {
        bd = Math.abs(d)
        best = d
      }
    }
  }
  return best
}

const snapAlong = (v: number, along: boolean) => (along ? snap(v, STEP) : v)

function onRoomEdge(r: Room, o: { axis: 'x' | 'z'; x: number; z: number }): boolean {
  const e = 0.03
  if (o.axis === 'x') return Math.abs(o.x - r.x) <= r.w / 2 && (Math.abs(o.z - (r.z - r.d / 2)) < e || Math.abs(o.z - (r.z + r.d / 2)) < e)
  return Math.abs(o.z - r.z) <= r.d / 2 && (Math.abs(o.x - (r.x - r.w / 2)) < e || Math.abs(o.x - (r.x + r.w / 2)) < e)
}
