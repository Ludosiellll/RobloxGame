// Комнаты в 3D: полы, стены с вырезами под двери и окна, опускание стен со стороны камеры.

import * as THREE from 'three'
import type { Doc, Opening } from '../core/doc'
import { buildWalls, wallForOpening, wallLowered, type WallSeg } from '../core/walls'
import { floorTexture } from './textures'
import type { Stage } from './stage'

export const WALL_T = 0.1
const LOW = 0.14
const DOOR_H = 2.05
const WIN_SILL = 0.9
const WIN_TOP = 2.1

interface Piece {
  mesh: THREE.Mesh
  y0: number
  y1: number
}

interface WallView {
  seg: WallSeg
  pieces: Piece[]
  /** рамы, полотна, стёкла: видны только при поднятой стене */
  extras: THREE.Object3D[]
  /** мишени для выбора проёмов: при опущенной стене прижимаются к полу */
  targets: { mesh: THREE.Mesh; y0: number; top: number }[]
  /** текущая видимая высота */
  h: number
}

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)

export class RoomsView {
  readonly group = new THREE.Group()
  private walls: WallView[] = []
  private key = ''
  private wallH = 2.7
  private readonly sideMat = new THREE.MeshStandardMaterial({ roughness: 0.92 })
  private readonly coreMat = new THREE.MeshStandardMaterial({ roughness: 1 })
  private readonly frameMat = new THREE.MeshStandardMaterial({ color: '#fafaf7', roughness: 0.6 })
  private readonly doorMat = new THREE.MeshStandardMaterial({ color: '#b98a5e', roughness: 0.7 })
  private readonly glassMat = new THREE.MeshStandardMaterial({ color: '#bfe0ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false })
  /** объекты для выбора мышью */
  readonly floors: THREE.Mesh[] = []
  readonly openingTargets: THREE.Mesh[] = []
  segs: WallSeg[] = []

  constructor(private readonly stage: Stage) {
    stage.world.add(this.group)
    stage.onFrame((dt) => this.animate(dt))
  }

  sync(doc: Doc): void {
    const key = JSON.stringify([doc.rooms, doc.walls, doc.openings])
    if (key === this.key) return
    this.key = key
    this.wallH = doc.walls.h
    this.rebuild(doc)
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh && m.geometry !== unitBox) m.geometry.dispose()
        if (m.isMesh && m.userData.ownMaterial) {
          const mat = m.material as THREE.MeshStandardMaterial
          mat.map?.dispose()
          mat.dispose()
        }
      })
    }
    this.floors.length = 0
    this.openingTargets.length = 0
  }

  private rebuild(doc: Doc): void {
    const previous = new Map(this.walls.map((w) => [segKey(w.seg), w.h]))
    this.clear()
    this.sideMat.color.set(doc.walls.color)
    this.coreMat.color.set(doc.walls.color).multiplyScalar(0.78)

    doc.rooms.forEach((room, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: room.floor.color,
        roughness: room.floor.kind === 'tile' ? 0.35 : room.floor.kind === 'planks' ? 0.6 : 0.95,
        map: floorTexture(room.floor.kind, room.w, room.d, this.stage.maxAnisotropy),
      })
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.w, room.d), mat)
      floor.rotation.x = -Math.PI / 2
      floor.position.set(room.x, 0.004 + i * 0.0008, room.z)
      floor.receiveShadow = true
      floor.userData.roomId = room.id
      floor.userData.ownMaterial = true
      this.group.add(floor)
      this.floors.push(floor)
    })

    this.segs = buildWalls(doc.rooms)
    const byWall = new Map<WallSeg, Opening[]>()
    for (const o of doc.openings) {
      const seg = wallForOpening(this.segs, o)
      if (!seg) continue
      const list = byWall.get(seg)
      if (list) list.push(o)
      else byWall.set(seg, [o])
    }

    this.walls = this.segs.map((seg) => {
      const view: WallView = { seg, pieces: [], extras: [], targets: [], h: previous.get(segKey(seg)) ?? doc.walls.h }
      const openings = (byWall.get(seg) ?? []).slice().sort((p, q) => along(seg, p) - along(seg, q))
      // стена удлиняется на половину толщины, чтобы закрыть углы
      let cursor = seg.a - WALL_T / 2
      const end = seg.b + WALL_T / 2
      for (const o of openings) {
        const c = along(seg, o)
        const a = c - o.width / 2
        const b = c + o.width / 2
        if (a > cursor) this.addPiece(view, cursor, a, 0, doc.walls.h)
        if (o.kind === 'door') {
          if (doc.walls.h > DOOR_H) this.addPiece(view, a, b, DOOR_H, doc.walls.h)
        } else {
          this.addPiece(view, a, b, 0, WIN_SILL)
          if (doc.walls.h > WIN_TOP) this.addPiece(view, a, b, WIN_TOP, doc.walls.h)
        }
        this.addOpening(view, o, a, b)
        cursor = b
      }
      if (end > cursor) this.addPiece(view, cursor, end, 0, doc.walls.h)
      return view
    })
    this.layout(true)
    this.stage.invalidate()
  }

  private place(obj: THREE.Object3D, seg: WallSeg, t: number, y: number): void {
    if (seg.axis === 'x') obj.position.set(t, y, seg.c)
    else {
      obj.position.set(seg.c, y, t)
      obj.rotation.y = Math.PI / 2
    }
  }

  private addPiece(view: WallView, a: number, b: number, y0: number, y1: number): void {
    const mesh = new THREE.Mesh(unitBox, [this.sideMat, this.sideMat, this.coreMat, this.sideMat, this.sideMat, this.sideMat])
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.wall = true
    this.place(mesh, view.seg, (a + b) / 2, y0)
    mesh.scale.set(b - a, y1 - y0, WALL_T)
    this.group.add(mesh)
    view.pieces.push({ mesh, y0, y1 })
  }

  private addOpening(view: WallView, o: Opening, a: number, b: number): void {
    const seg = view.seg
    const mid = (a + b) / 2
    const w = b - a
    const holder = new THREE.Group()
    this.place(holder, seg, mid, 0)
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(unitBox, mat)
      m.scale.set(sx, sy, sz)
      m.position.set(x, y, z)
      m.castShadow = true
      holder.add(m)
      return m
    }
    const f = 0.05
    if (o.kind === 'door') {
      box(f, DOOR_H, WALL_T + 0.03, -w / 2 + f / 2, 0, 0, this.frameMat)
      box(f, DOOR_H, WALL_T + 0.03, w / 2 - f / 2, 0, 0, this.frameMat)
      box(w, f, WALL_T + 0.03, 0, DOOR_H - f, 0, this.frameMat)
      // полотно приоткрыто на петле у левого косяка
      const hinge = new THREE.Group()
      hinge.position.set(-w / 2 + f, 0, 0)
      hinge.rotation.y = -1.15
      const leaf = new THREE.Mesh(unitBox, this.doorMat)
      leaf.scale.set(w - f * 2, DOOR_H - f, 0.04)
      leaf.position.set((w - f * 2) / 2, 0, 0)
      leaf.castShadow = true
      hinge.add(leaf)
      holder.add(hinge)
    } else {
      const hgt = WIN_TOP - WIN_SILL
      box(f, hgt, WALL_T + 0.03, -w / 2 + f / 2, WIN_SILL, 0, this.frameMat)
      box(f, hgt, WALL_T + 0.03, w / 2 - f / 2, WIN_SILL, 0, this.frameMat)
      box(w, f, WALL_T + 0.03, 0, WIN_TOP - f, 0, this.frameMat)
      box(w + 0.08, 0.04, WALL_T + 0.12, 0, WIN_SILL, 0, this.frameMat)
      box(0.035, hgt, 0.04, 0, WIN_SILL, 0, this.frameMat)
      const glass = box(w - f * 2, hgt - f, 0.012, 0, WIN_SILL + 0.02, 0, this.glassMat)
      glass.castShadow = false
    }
    this.group.add(holder)
    view.extras.push(holder)

    // невидимая мишень для выбора и перетаскивания проёма
    const top = o.kind === 'door' ? DOOR_H : WIN_TOP
    const y0 = o.kind === 'door' ? 0 : WIN_SILL
    const target = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ visible: false }))
    this.place(target, seg, mid, y0)
    target.scale.set(w, top - y0, WALL_T + 0.3)
    target.userData.openingId = o.id
    target.userData.ownMaterial = true
    this.group.add(target)
    this.openingTargets.push(target)
    view.targets.push({ mesh: target, y0, top })
  }

  /** Высота стены, к которой она стремится при текущем положении камеры. */
  private targetHeight(seg: WallSeg): number {
    if (this.stage.view === 'plan') return LOW
    const cam = this.stage.camera.position
    const t = this.stage.controls.target
    return wallLowered(seg, { x: cam.x, z: cam.z }, { x: t.x, z: t.z }) ? LOW : this.wallH
  }

  private layout(snapNow: boolean): boolean {
    let moving = false
    for (const w of this.walls) {
      const goal = this.targetHeight(w.seg)
      if (snapNow) w.h = goal
      if (Math.abs(goal - w.h) > 0.002) moving = true
      for (const p of w.pieces) {
        const visible = Math.min(p.y1, w.h) - p.y0
        p.mesh.visible = visible > 0.004
        if (p.mesh.visible) p.mesh.scale.y = visible
      }
      const up = w.h > this.wallH - 0.35
      for (const e of w.extras) e.visible = up
      // у опущенной стены проём выбирается по зазору у пола, а не по невидимой двери в воздухе
      for (const t of w.targets) {
        const low = w.h < t.top
        t.mesh.position.y = low ? 0 : t.y0
        t.mesh.scale.y = low ? Math.max(LOW, Math.min(w.h, 0.3)) : t.top - t.y0
      }
    }
    return moving
  }

  private animate(dt: number): boolean {
    let moving = false
    for (const w of this.walls) {
      const goal = this.targetHeight(w.seg)
      const d = goal - w.h
      if (Math.abs(d) > 0.002) {
        w.h += d * Math.min(1, dt * 11)
        if (Math.abs(goal - w.h) <= 0.002) w.h = goal
        moving = true
      }
    }
    if (moving) this.layout(false)
    return moving
  }

  bounds(doc: Doc): THREE.Box3 {
    const box = new THREE.Box3()
    for (const r of doc.rooms) {
      box.expandByPoint(new THREE.Vector3(r.x - r.w / 2, 0, r.z - r.d / 2))
      box.expandByPoint(new THREE.Vector3(r.x + r.w / 2, doc.walls.h, r.z + r.d / 2))
    }
    return box
  }
}

const along = (seg: WallSeg, o: Opening) => (seg.axis === 'x' ? o.x : o.z)
const segKey = (s: WallSeg) => `${s.axis}:${s.c}:${s.a}:${s.b}`
