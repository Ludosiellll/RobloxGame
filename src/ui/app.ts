// Интерфейс: верхняя панель, каталог, панель свойств, сообщения, приём файлов.

import { CATEGORIES, KIT, KIT_BY_KEY, KIT_THUMB, SLOT_NAMES, type CatId } from '../core/catalog'
import { addRoom, defaultDoc, LIMITS, setItemColor, setLight, setScene, setWalls, updateItem, updateOpening, updateRoom, type Doc, type FloorKind, type Item, type MatKind } from '../core/doc'
import { fmt, tr, type TextKey } from '../core/i18n'
import { starterDoc } from '../core/starter'
import { snapOpening } from '../core/walls'
import { saveFile } from '../platform'
import type { Interact } from '../scene/interact'
import { MAT_COLORS } from '../scene/mat'
import type { RoomsView } from '../scene/rooms'
import type { Stage } from '../scene/stage'
import type { ItemsView } from '../scene/view'
import type { Store } from '../store'
import type { UserModels } from '../userModels'
import { h, ICON } from './dom'
import { FanDeck } from './fandeck'

export class Toaster {
  readonly el = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
  show(text: string, kind: 'info' | 'error' = 'info', ms = 3600): void {
    const t = h('div', { class: `toast${kind === 'error' ? ' is-error' : ''}` }, text)
    this.el.replaceChildren(t)
    setTimeout(() => t.isConnected && t.remove(), kind === 'error' ? ms * 2 : ms)
  }
}

export interface UiDeps {
  store: Store
  stage: Stage
  interact: Interact
  items: ItemsView
  rooms: RoomsView
  userModels: UserModels
  toaster: Toaster
}

interface Control {
  el: HTMLElement
  sync?: (doc: Doc) => void
}

type Tab = CatId | 'my'
const ACCEPT = '.glb,.gltf,.fbx,.obj,.mtl,.stl,.dae,.ply,.3mf,.zip,.bin,.png,.jpg,.jpeg,.webp'

export class Ui {
  private readonly top = h('div', { class: 'top' })
  private readonly inspector = h('aside', { class: 'inspector board' })
  private readonly tray = h('section', { class: 'tray board' })
  private readonly drop = h('div', { class: 'dropzone', hidden: true })
  private readonly helpEl = h('div', { class: 'help board', hidden: true })
  private readonly fan: FanDeck
  private readonly file = h('input', { type: 'file', id: 'model-file', multiple: true, accept: ACCEPT, hidden: true })
  private tab: Tab = 'living'
  private controls: Control[] = []
  private signature = ''
  private confirmReset = false
  private trayOpen = true
  private sceneOpen = false

  constructor(root: HTMLElement, private readonly d: UiDeps) {
    this.fan = new FanDeck(() => d.store.lang)
    root.append(this.top, this.inspector, this.fan.el, this.tray, this.helpEl, d.toaster.el, this.drop, this.file)
    this.file.addEventListener('change', () => {
      const files = [...(this.file.files ?? [])]
      this.file.value = ''
      if (files.length) void this.importFiles(files)
    })
    this.bindDrop()
    d.store.on((c) => {
      if (c === 'lang') {
        this.fan.close()
        this.renderTop()
        this.renderTray()
        this.signature = ''
      }
      if (c === 'selection') this.fan.close()
      this.renderTopState()
      this.renderInspector()
    })
    d.userModels.onChange = () => this.renderTray()
    const loaded = d.items.onLoaded
    d.items.onLoaded = (id) => {
      loaded(id)
      if (d.store.selection?.id === id) {
        this.signature = ''
        this.renderInspector()
      }
    }
    this.renderTop()
    this.renderTray()
    this.renderInspector()
  }

  private t(key: TextKey, vars?: Record<string, string | number>): string {
    return tr(this.d.store.lang, key, vars)
  }

  // ---------- верхняя панель ----------

  private undoBtn!: HTMLButtonElement
  private redoBtn!: HTMLButtonElement
  private viewBtns: HTMLButtonElement[] = []

  private renderTop(): void {
    const { store, stage } = this.d
    this.undoBtn = h('button', { class: 'icon-btn board', type: 'button', title: `${this.t('undo')} (Ctrl+Z)`, 'aria-label': this.t('undo'), html: ICON.undo, onclick: () => store.undo() })
    this.redoBtn = h('button', { class: 'icon-btn board', type: 'button', title: `${this.t('redo')} (Ctrl+Shift+Z)`, 'aria-label': this.t('redo'), html: ICON.redo, onclick: () => store.redo() })
    this.viewBtns = (['3d', 'plan'] as const).map((v) =>
      h('button', { class: 'seg-btn', type: 'button', onclick: () => (stage.setView(v), this.renderTopState()) }, this.t(v === '3d' ? 'view3d' : 'viewPlan')),
    )
    this.top.replaceChildren(
      h('div', { class: 'top-left' }, h('div', { class: 'tape-wrap' }, h('h1', { class: 'tape' }, this.t('appName'))), this.undoBtn, this.redoBtn),
      h(
        'div',
        { class: 'top-right' },
        h('div', { class: 'seg board', role: 'group' }, ...this.viewBtns),
        h('button', { class: 'btn board with-icon', type: 'button', onclick: () => void this.snapshot() }, h('span', { html: ICON.camera }), h('span', { class: 'btn-text' }, this.t('snapshot'))),
        h('button', { class: 'btn board lang', type: 'button', onclick: () => store.setLang(store.lang === 'ru' ? 'en' : 'ru') }, store.lang === 'ru' ? 'EN' : 'RU'),
        h('button', { class: 'icon-btn board', type: 'button', 'aria-label': this.t('help'), title: this.t('help'), html: ICON.help, onclick: () => this.toggleHelp() }),
      ),
    )
    this.renderTopState()
  }

  private renderTopState(): void {
    this.undoBtn.disabled = !this.d.store.canUndo
    this.redoBtn.disabled = !this.d.store.canRedo
    this.viewBtns.forEach((b, i) => b.classList.toggle('is-on', (i === 0) === (this.d.stage.view === '3d')))
  }

  private toggleHelp(): void {
    if (!this.helpEl.hidden) {
      this.helpEl.hidden = true
      return
    }
    this.helpEl.replaceChildren(
      h('header', { class: 'fan-head' }, h('div', { class: 'label' }, this.t('helpTitle')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': this.t('cancel'), html: ICON.close, onclick: () => (this.helpEl.hidden = true) })),
      h('ul', { class: 'help-list' }, ...(['helpMove', 'helpOrbit', 'helpRooms', 'helpImport', 'helpKeys'] as TextKey[]).map((k) => h('li', {}, this.t(k)))),
      h('p', { class: 'credit' }, this.t('kitCredit')),
    )
    this.helpEl.hidden = false
  }

  private async snapshot(): Promise<void> {
    const blob = await this.d.stage.snapshot(2)
    if (!blob) return this.d.toaster.show(this.t('snapshotFailed'), 'error')
    const outcome = await saveFile('maket.png', blob)
    if (outcome === 'saved') this.d.toaster.show(this.t('snapshotSaved'))
    else if (outcome === 'failed') this.d.toaster.show(this.t('snapshotFailed'), 'error')
  }

  // ---------- каталог ----------

  private renderTray(): void {
    const { store, interact, userModels } = this.d
    const lang = store.lang
    const tabs: { id: Tab; label: string }[] = [...CATEGORIES.map((c) => ({ id: c.id as Tab, label: lang === 'ru' ? c.ru : c.en })), { id: 'my', label: this.t('myModels') }]
    const tabEls = tabs.map((t) =>
      h('button', { class: `tab${t.id === this.tab ? ' is-on' : ''}${t.id === 'my' ? ' tab-my' : ''}`, type: 'button', role: 'tab', 'aria-selected': t.id === this.tab ? 'true' : 'false', onclick: () => ((this.tab = t.id), (this.trayOpen = true), this.renderTray()) }, t.label),
    )
    const tiles: HTMLElement[] = []
    const T = 72
    const rows = Math.ceil(KIT_THUMB.count / KIT_THUMB.cols)
    if (this.tab === 'my') {
      tiles.push(
        h('button', { class: 'tile tile-add', type: 'button', onclick: () => this.file.click() }, h('span', { class: 'thumb', html: ICON.upload }), h('span', { class: 'tile-name' }, this.t('addModel'))),
      )
      for (const m of userModels.list) {
        const tile = this.tile(m.name, { kind: 'user', key: m.id }, h('span', { class: 'thumb', style: m.thumb ? { backgroundImage: `url(${m.thumb})`, backgroundSize: 'contain' } : {} }))
        tile.append(
          h('span', {
            class: 'tile-x',
            role: 'button',
            tabIndex: 0,
            title: this.t('deleteModel'),
            'aria-label': this.t('deleteModel'),
            html: ICON.close,
            onclick: (e: Event) => {
              e.stopPropagation()
              // убрать модель и все её копии из сцены
              store.update((doc) => ({ ...doc, items: doc.items.filter((i) => !(i.src.kind === 'user' && i.src.key === m.id)) }))
              userModels.remove(m.id)
            },
          }),
        )
        tiles.push(tile)
      }
    } else {
      if (this.tab === 'build') {
        for (const kind of ['door', 'window'] as const) {
          tiles.push(h('button', { class: 'tile tile-draw', type: 'button', onclick: () => interact.addOpening(kind) }, h('span', { class: 'thumb', html: ICON[kind] }), h('span', { class: 'tile-name' }, this.t(kind))))
        }
      }
      for (const k of KIT.filter((q) => q.cat === this.tab)) {
        const thumb = h('span', {
          class: 'thumb',
          style: {
            backgroundImage: 'url(models/kit-thumbs.webp)',
            backgroundSize: `${KIT_THUMB.cols * T}px ${rows * T}px`,
            backgroundPosition: `-${(k.i % KIT_THUMB.cols) * T}px -${Math.floor(k.i / KIT_THUMB.cols) * T}px`,
          },
        })
        tiles.push(this.tile(lang === 'ru' ? k.ru : k.en, { kind: 'kit', key: k.key }, thumb))
      }
    }
    this.tray.classList.toggle('is-closed', !this.trayOpen)
    this.tray.replaceChildren(
      h(
        'div',
        { class: 'tabs', role: 'tablist' },
        ...tabEls,
        h('button', { class: `icon-btn tray-toggle${this.trayOpen ? '' : ' is-closed'}`, type: 'button', 'aria-label': this.t('catalog'), 'aria-expanded': this.trayOpen ? 'true' : 'false', html: ICON.chevron, onclick: () => ((this.trayOpen = !this.trayOpen), this.renderTray()) }),
      ),
      h('div', { class: 'tiles' }, ...tiles),
      ...(this.tab === 'my' ? [h('p', { class: 'tray-hint' }, this.t('addModelHint'))] : []),
    )
  }

  /** Плитка каталога: щелчок добавляет в центр вида, мышью можно вытащить прямо в сцену. */
  private tile(name: string, src: Item['src'], thumb: HTMLElement): HTMLElement {
    const { interact } = this.d
    let start: { x: number; y: number } | null = null
    let dragged = false
    const el = h('button', { class: 'tile', type: 'button', title: name }, thumb, h('span', { class: 'tile-name' }, name))
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      start = { x: e.clientX, y: e.clientY }
      dragged = false
      const move = (ev: PointerEvent) => {
        if (!start || dragged) return
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8) {
          dragged = true
          interact.startPlaceDrag(src, ev)
        }
      }
      const up = () => {
        start = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
    el.addEventListener('click', () => {
      if (dragged) {
        dragged = false
        return
      }
      interact.addItem(src)
    })
    return el
  }

  // ---------- приём файлов ----------

  private bindDrop(): void {
    let depth = 0
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return
      depth++
      this.drop.textContent = this.t('dropHere')
      this.drop.hidden = false
    })
    window.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1)
      if (!depth) this.drop.hidden = true
    })
    window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault())
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      this.drop.hidden = true
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length) void this.importFiles(files)
    })
  }

  async importFiles(files: File[]): Promise<void> {
    const { toaster, userModels, interact } = this.d
    toaster.show(this.t('reading'), 'info', 60_000)
    const res = await userModels.importFiles(files)
    this.tab = 'my'
    this.renderTray()
    res.added.forEach((m, i) => {
      const c = this.d.stage.controls.target
      interact.addItem({ kind: 'user', key: m.id }, { x: c.x + i * 0.6, z: c.z + i * 0.6 })
    })
    if (res.errors.length) {
      const key: TextKey = res.errors[0] === 'no_model' ? 'errNoModel' : res.errors[0] === 'unsupported' ? 'errUnsupported' : res.errors[0] === 'empty' ? 'errEmpty' : 'errBroken'
      toaster.show(this.t(key), 'error')
    } else if (res.added.length) {
      toaster.show(this.t('added', { name: res.added.map((m) => m.name).join(', ') }))
    }
  }

  // ---------- панель свойств ----------

  private renderInspector(): void {
    const { store, items } = this.d
    const sel = store.selection
    const doc = store.doc
    let sig = `${store.lang}|${sel?.kind ?? 'scene'}|${sel?.id ?? ''}`
    if (!sel) sig += `|${doc.rooms.map((r) => r.id).join(',')}|${this.confirmReset}`
    if (sel?.kind === 'item') sig += `|${items.template(sel.id)?.slots.join(',') ?? '…'}`
    if (sel?.kind === 'room') sig += `|${doc.rooms.length}`
    if (sig !== this.signature) {
      this.signature = sig
      this.controls = []
      const body = !sel ? this.sceneView(doc) : sel.kind === 'item' ? this.itemView(doc, sel.id) : sel.kind === 'room' ? this.roomView(doc, sel.id) : this.openingView(doc, sel.id)
      this.inspector.replaceChildren(...body)
      this.inspector.scrollTop = 0
    }
    // на телефоне панель сцены свёрнута до заголовка, пока её не открыли или что-то не выбрали
    this.inspector.classList.toggle('is-min', !sel && !this.sceneOpen)
    for (const c of this.controls) c.sync?.(doc)
  }

  private section(label: string, ...children: (HTMLElement | null)[]): HTMLElement {
    return h('div', { class: 'sec' }, h('div', { class: 'label' }, label), ...children)
  }

  private slider(o: { id: string; label: string; min: number; max: number; step: number; get: (d: Doc) => number | null; set: (v: number) => void; show: (v: number) => string }): HTMLElement {
    const { store } = this.d
    const out = h('output', { class: 'num', for: o.id })
    const input = h('input', { type: 'range', id: o.id, class: 'ruler', min: String(o.min), max: String(o.max), step: String(o.step) })
    input.addEventListener('input', () => {
      const v = Number(input.value)
      out.textContent = o.show(v)
      o.set(v)
    })
    input.addEventListener('change', () => store.commit())
    const el = h('div', { class: 'field' }, h('label', { for: o.id }, o.label), out, input)
    this.controls.push({
      el,
      sync: (doc) => {
        const v = o.get(doc)
        if (v === null) return
        if (document.activeElement !== input) input.value = String(v)
        out.textContent = o.show(v)
      },
    })
    return el
  }

  private chip(label: string, get: (d: Doc) => string | null, onPick: (hex: string) => void, onReset?: () => void): HTMLElement {
    const sw = h('span', { class: 'sw' })
    const code = h('span', { class: 'code' })
    const btn = h('button', { class: 'chip', type: 'button' }, sw, h('span', { class: 'chip-label' }, label), code)
    btn.addEventListener('click', () => {
      const cur = get(this.d.store.doc) ?? '#cccccc'
      this.fan.open({ title: label, current: cur, onPick, onReset })
    })
    this.controls.push({
      el: btn,
      sync: (doc) => {
        const v = get(doc) ?? '#cccccc'
        sw.style.background = v
        code.textContent = v
      },
    })
    return btn
  }

  private head(title: string, sub?: string): HTMLElement {
    const { store } = this.d
    return h(
      'header',
      { class: 'insp-head', onclick: () => { if (!store.selection) { this.sceneOpen = !this.sceneOpen; this.renderInspector() } } },
      h('div', {}, h('h2', {}, title), sub ? h('div', { class: 'sub' }, sub) : null),
      store.selection ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': this.t('cancel'), html: ICON.close, onclick: () => store.select(null) }) : null,
    )
  }

  private sceneView(doc: Doc): HTMLElement[] {
    const { store, interact } = this.d
    const lang = store.lang
    const mats: [MatKind, TextKey][] = [['green', 'matGreen'], ['graphite', 'matGraphite'], ['blue', 'matBlue'], ['sand', 'matSand']]
    const matBtns = mats.map(([kind, key]) => {
      const b = h('button', { class: 'mat-sw', type: 'button', title: this.t(key), 'aria-label': this.t(key), style: { background: MAT_COLORS[kind].base }, onclick: () => store.update((d) => setScene(d, { mat: kind })) })
      this.controls.push({ el: b, sync: (d) => b.classList.toggle('is-on', d.scene.mat === kind) })
      return b
    })
    const roomRows = doc.rooms.map((r, i) => {
      const meta = h('span', { class: 'code' })
      this.controls.push({ el: meta, sync: (d) => { const q = d.rooms.find((x) => x.id === r.id); if (q) meta.textContent = `${fmt(lang, q.w)} × ${fmt(lang, q.d)} ${this.t('m')}` } })
      return h('button', { class: 'row-btn', type: 'button', onclick: () => store.select({ kind: 'room', id: r.id }) }, h('span', {}, `${this.t('room')} ${i + 1}`), meta)
    })
    const addRoomBtn = h('button', { class: 'btn with-icon', type: 'button', onclick: () => {
      const cur = store.doc
      const right = cur.rooms.reduce((a, b) => (b.x + b.w / 2 > a.x + a.w / 2 ? b : a))
      const id = store.newId('r')
      store.update((d) => addRoom(d, id, { x: right.x + right.w / 2 + 1.75, z: right.z, w: 3.5, d: Math.min(right.d, 4) }))
      store.select({ kind: 'room', id })
    } }, h('span', { html: ICON.plus }), this.t('addRoom'))

    const project = this.confirmReset
      ? h('div', { class: 'confirm' }, h('p', {}, this.t('startOverConfirm')), h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { this.confirmReset = false; store.replace(defaultDoc()); this.d.stage.setView('3d') } }, this.t('startOverYes')),
          h('button', { class: 'btn', type: 'button', onclick: () => { this.confirmReset = false; this.renderInspector() } }, this.t('cancel'))))
      : h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { this.confirmReset = true; this.renderInspector() } }, this.t('startOver')),
          h('button', { class: 'btn', type: 'button', onclick: () => { store.replace(starterDoc()); this.d.stage.setView('3d') } }, this.t('loadDemo')))

    void interact
    return [
      this.head(this.t('scene')),
      this.section(this.t('light'),
        this.slider({ id: 'f-time', label: this.t('timeOfDay'), min: 0, max: 1, step: 0.01, get: (d) => d.light.time, set: (v) => store.update((d) => setLight(d, v), true), show: (v) => this.t(v < 0.3 ? 'morning' : v < 0.72 ? 'noon' : 'evening') }),
      ),
      this.section(this.t('mat'), h('div', { class: 'mat-row' }, ...matBtns)),
      this.section(this.t('walls'),
        this.slider({ id: 'f-wallh', label: this.t('wallHeight'), min: LIMITS.hMin, max: LIMITS.hMax, step: 0.05, get: (d) => d.walls.h, set: (v) => store.update((d) => setWalls(d, { h: v }), true), show: (v) => `${fmt(lang, v)} ${this.t('m')}` }),
        this.chip(this.t('wallColor'), (d) => d.walls.color, (hex) => store.update((d) => setWalls(d, { color: hex }))),
      ),
      this.section(this.t('rooms'), ...roomRows, addRoomBtn),
      this.section(this.t('project'), project, h('button', { class: 'btn lang-inline', type: 'button', onclick: () => store.setLang(lang === 'ru' ? 'en' : 'ru') }, this.t('language'))),
    ]
  }

  private itemView(doc: Doc, id: string): HTMLElement[] {
    const { store, interact, items, userModels } = this.d
    const lang = store.lang
    const item = doc.items.find((i) => i.id === id)
    if (!item) return [this.head('—')]
    const kit = item.src.kind === 'kit' ? KIT_BY_KEY.get(item.src.key) : null
    const user = item.src.kind === 'user' ? userModels.list.find((m) => m.id === item.src.key) : null
    const name = kit ? (lang === 'ru' ? kit.ru : kit.en) : user?.name ?? '—'
    const cat = kit ? CATEGORIES.find((c) => c.id === kit.cat) : null
    const template = items.template(id)
    const slots = template?.slots ?? kit?.slots ?? []
    const cur = (d: Doc) => d.items.find((i) => i.id === id) ?? null

    const colorRows = slots.map((slot) => {
      const label = SLOT_NAMES[slot] ? (lang === 'ru' ? SLOT_NAMES[slot].ru : SLOT_NAMES[slot].en) : slot
      return this.chip(
        label,
        (d) => cur(d)?.colors[slot] ?? template?.baseColors[slot] ?? null,
        (hex) => store.update((d) => setItemColor(d, id, slot, hex)),
        () => store.update((d) => setItemColor(d, id, slot, null)),
      )
    })

    const heightField = user && template ? (() => {
      const input = h('input', { type: 'number', id: 'f-height', class: 'num-input', min: '1', max: '2000', step: '1', inputMode: 'numeric' })
      input.addEventListener('change', () => {
        const cm = Number(input.value)
        if (cm > 0) store.update((d) => updateItem(d, id, { scale: cm / 100 / template.size.y }))
      })
      this.controls.push({ el: input, sync: (d) => { const it = cur(d); if (it && document.activeElement !== input) input.value = String(Math.round(template.size.y * it.scale * 100)) } })
      return h('div', { class: 'field field-inline' }, h('label', { for: 'f-height' }, this.t('heightCm')), input)
    })() : null

    return [
      this.head(name, cat ? (lang === 'ru' ? cat.ru : cat.en) : user ? this.t('myModels') : undefined),
      this.section(this.t('rotate'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn with-icon', type: 'button', title: 'Shift+R', onclick: () => interact.rotateSelected(-90) }, h('span', { html: ICON.rotL }), '90°'),
          h('button', { class: 'btn with-icon', type: 'button', title: 'R', onclick: () => interact.rotateSelected(90) }, h('span', { html: ICON.rotR }), '90°')),
        this.slider({ id: 'f-rot', label: this.t('rotate'), min: 0, max: 345, step: 15, get: (d) => cur(d)?.rot ?? null, set: (v) => store.update((d) => updateItem(d, id, { rot: v }), true), show: (v) => `${Math.round(v)}°` }),
      ),
      this.section(this.t('size'),
        this.slider({ id: 'f-scale', label: this.t('size'), min: 0.25, max: 3, step: 0.05, get: (d) => { const it = cur(d); return it ? Math.min(3, it.scale) : null }, set: (v) => store.update((d) => updateItem(d, id, { scale: v }), true), show: (v) => `${Math.round(v * 100)}%` }),
        heightField,
        this.slider({ id: 'f-lift', label: this.t('lift'), min: 0, max: 2.6, step: 0.05, get: (d) => cur(d)?.y ?? null, set: (v) => store.update((d) => updateItem(d, id, { y: v, lift: v > 0 }), true), show: (v) => `${Math.round(v * 100)} ${this.t('cm')}` }),
      ),
      slots.length ? this.section(this.t('colors'), ...colorRows) : null,
      this.section(this.t('project'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn with-icon', type: 'button', title: 'Ctrl+D', onclick: () => interact.duplicateSelected() }, h('span', { html: ICON.copy }), this.t('duplicate')),
          h('button', { class: 'btn btn-danger with-icon', type: 'button', title: 'Delete', onclick: () => interact.deleteSelected() }, h('span', { html: ICON.trash }), this.t('remove'))),
        user ? h('button', { class: 'btn with-icon', type: 'button', title: this.t('flipHint'), onclick: async () => { await userModels.tilt(user.id); items.reload((k) => k === `user:${user.id}`) } }, h('span', { html: ICON.flip }), this.t('flip')) : null,
      ),
    ].filter((x): x is HTMLElement => !!x)
  }

  private roomView(doc: Doc, id: string): HTMLElement[] {
    const { store, interact } = this.d
    const lang = store.lang
    const index = doc.rooms.findIndex((r) => r.id === id)
    const cur = (d: Doc) => d.rooms.find((r) => r.id === id) ?? null
    const kinds: [FloorKind, TextKey][] = [['planks', 'planks'], ['tile', 'tile'], ['plain', 'plain'], ['carpet', 'carpet']]
    const kindBtns = kinds.map(([kind, key]) => {
      const b = h('button', { class: `seg-btn floor-${kind}`, type: 'button', onclick: () => store.update((d) => updateRoom(d, id, { floor: { kind } })) }, this.t(key))
      this.controls.push({ el: b, sync: (d) => b.classList.toggle('is-on', cur(d)?.floor.kind === kind) })
      return b
    })
    const m = (v: number) => `${fmt(lang, v)} ${this.t('m')}`
    return [
      this.head(`${this.t('room')} ${index + 1}`),
      this.section(this.t('size'),
        this.slider({ id: 'f-rw', label: this.t('width'), min: LIMITS.roomMin, max: 10, step: 0.05, get: (d) => { const r = cur(d); return r ? Math.min(10, r.w) : null }, set: (v) => store.update((d) => updateRoom(d, id, { w: v }), true), show: m }),
        this.slider({ id: 'f-rd', label: this.t('depth'), min: LIMITS.roomMin, max: 10, step: 0.05, get: (d) => { const r = cur(d); return r ? Math.min(10, r.d) : null }, set: (v) => store.update((d) => updateRoom(d, id, { d: v }), true), show: m }),
      ),
      this.section(this.t('floor'),
        h('div', { class: 'seg seg-wide', role: 'group' }, ...kindBtns),
        this.chip(this.t('floorColor'), (d) => cur(d)?.floor.color ?? null, (hex) => store.update((d) => updateRoom(d, id, { floor: { color: hex } }))),
      ),
      doc.rooms.length > 1 ? this.section(this.t('project'), h('button', { class: 'btn btn-danger with-icon', type: 'button', onclick: () => interact.deleteSelected() }, h('span', { html: ICON.trash }), this.t('deleteRoom'))) : null,
    ].filter((x): x is HTMLElement => !!x)
  }

  private openingView(doc: Doc, id: string): HTMLElement[] {
    const { store, interact, rooms } = this.d
    const o = doc.openings.find((q) => q.id === id)
    if (!o) return [this.head('—')]
    const cur = (d: Doc) => d.openings.find((q) => q.id === id) ?? null
    return [
      this.head(this.t(o.kind)),
      this.section(this.t('size'),
        this.slider({
          id: 'f-ow', label: this.t('openingWidth'), min: 0.6, max: 2.4, step: 0.05,
          get: (d) => cur(d)?.width ?? null,
          set: (v) => {
            const now = cur(store.doc)
            if (!now) return
            // проём должен по-прежнему помещаться в стену
            const s = snapOpening(rooms.segs, { x: now.x, z: now.z }, v, 0.3)
            if (s) store.update((d) => updateOpening(d, id, { width: v, x: s.x, z: s.z, axis: s.axis }), true)
          },
          show: (v) => `${Math.round(v * 100)} ${this.t('cm')}`,
        }),
      ),
      this.section(this.t('project'), h('button', { class: 'btn btn-danger with-icon', type: 'button', onclick: () => interact.deleteSelected() }, h('span', { html: ICON.trash }), this.t('remove'))),
    ]
  }
}
