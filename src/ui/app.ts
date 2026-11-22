// Интерфейс: верхняя панель, каталог, панель свойств, сообщения, приём файлов.

import { projectColors } from '../core/color'
import { CATEGORIES, KIT, KIT_BY_KEY, KIT_THUMB, SLOT_NAMES, type CatId } from '../core/catalog'
import { addRoom, defaultDoc, dropItems, LIMITS, setItemColor, setLight, setScene, setUnderlay, setWalls, updateItem, updateOpening, updateRoom, updateUnderlay, type Doc, type FloorKind, type Item, type MatKind } from '../core/doc'
import { furnishRoom, roomHolds, type RoomKind } from '../core/furnish'
import { fmt, tr, type TextKey } from '../core/i18n'
import { isArchive, isImageFile } from '../core/importPick'
import { isOrphan } from '../core/orphans'
import { projectFileName } from '../core/projectFile'
import { starterDoc } from '../core/starter'
import { calibrate, defaultUnderlay, underlaySize } from '../core/underlay'
import { floorArea, snapOpening } from '../core/walls'
import { prepareImage, type ImageStore } from '../images'
import { saveFile } from '../platform'
import { packProject, readProject, type OpenedProject } from '../projectFile'
import type { Interact } from '../scene/interact'
import { MAT_COLORS } from '../scene/mat'
import type { RoomsView } from '../scene/rooms'
import type { Stage } from '../scene/stage'
import type { ItemsView } from '../scene/view'
import type { Store } from '../store'
import type { UserModels } from '../userModels'
import { h, ICON } from './dom'
import { ColorPicker } from './colorpicker'

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
  images: ImageStore
  toaster: Toaster
}

interface Control {
  el: HTMLElement
  sync?: (doc: Doc) => void
}

type Tab = CatId | 'my'
const ACCEPT = '.glb,.gltf,.fbx,.obj,.mtl,.stl,.dae,.ply,.3mf,.zip,.bin,.png,.jpg,.jpeg,.webp'

type PhonePanel = 'catalog' | 'props' | null
interface MenuItem {
  label: string
  /** сочетание клавиш — показывается справа */
  key?: string
  id?: string
  disabled?: boolean
  run: () => void
}

export class Ui {
  private readonly menubar = h('nav', { class: 'menubar', role: 'menubar' })
  private readonly toolbar = h('div', { class: 'toolbar', role: 'toolbar' })
  private readonly catalog = h('aside', { class: 'catalog' })
  private readonly inspector = h('aside', { class: 'inspector' })
  private readonly statusbar = h('footer', { class: 'statusbar' })
  /** на телефоне каталог и свойства открываются по очереди — этими вкладками */
  private readonly dock = h('div', { class: 'dock-tabs' })
  private readonly drop = h('div', { class: 'dropzone', hidden: true })
  /** полоса режима: видна всегда, пока включено рисование комнаты или разметка масштаба */
  private readonly modeBar = h('div', { class: 'mode-bar', hidden: true, role: 'status' })
  private readonly picker: ColorPicker
  private readonly file = h('input', { type: 'file', id: 'model-file', multiple: true, accept: ACCEPT, hidden: true })
  private readonly projectFile = h('input', { type: 'file', id: 'project-file', accept: '.zip', hidden: true })
  private readonly planFile = h('input', { type: 'file', id: 'plan-file', accept: 'image/png,image/jpeg,image/webp', hidden: true })
  private tilesEl = h('div', { class: 'tiles' })
  private search = ''
  private phonePanel: PhonePanel = null
  private menuOpen: string | null = null
  /** открытое окно-диалог: пока оно есть, клавиши до сцены не доходят */
  private modal: { el: HTMLElement; close: () => void } | null = null
  /** на телефоне свойства выбранного открываются, когда палец отпущен: иначе вид меняет размер посреди перетаскивания */
  private panelAfterRelease = false
  /** прокрутка панели свойств до открытия выбора цвета и чьи это были свойства */
  private inspScroll: { top: number; of: string } | null = null
  private tab: Tab = 'living'
  private controls: Control[] = []
  private signature = ''
  /** в комнате уже есть мебель: ждём ответа, заменить её или добавить новую */
  private furnishAsk: { room: string; kind: RoomKind } | null = null
  /** открыть обучение (подключается при запуске) */
  onTour: () => void = () => {}

  /** app — корень окна (сетка: меню, панель инструментов, каталог, вид, свойства, строка состояния); overlay — слой поверх вида. */
  constructor(private readonly app: HTMLElement, overlay: HTMLElement, private readonly d: UiDeps) {
    this.picker = new ColorPicker(() => d.store.lang)
    const view = overlay.parentElement ?? app
    app.prepend(this.menubar, this.toolbar)
    app.insertBefore(this.catalog, view)
    view.after(this.inspector)
    app.append(this.dock, this.statusbar, this.file, this.projectFile, this.planFile)
    // выбор цвета занимает место свойств, пока открыт
    this.picker.onToggle = () => {
      const of = this.selectionKey()
      if (this.picker.isOpen) this.inspScroll = { top: this.inspector.scrollTop, of }
      this.signature = ''
      this.renderInspector()
      if (this.picker.isOpen) this.inspector.scrollTop = 0
      else {
        // вернулись к тем же свойствам — на то же место
        if (this.inspScroll?.of === of) this.inspector.scrollTop = this.inspScroll.top
        this.inspScroll = null
      }
    }
    overlay.append(this.modeBar, d.toaster.el, this.drop)
    // меню закрывается щелчком мимо и клавишей Esc
    document.addEventListener('pointerdown', (e) => {
      if (this.menuOpen && !this.menubar.contains(e.target as Node)) {
        this.menuOpen = null
        this.renderMenubar()
      }
    }, true)
    // клавиши сначала достаются верхнему слою — окну, открытому меню, выбору цвета — и до сцены не доходят
    window.addEventListener('keydown', (e) => this.layerKey(e), true)
    this.file.addEventListener('change', () => {
      const files = [...(this.file.files ?? [])]
      this.file.value = ''
      if (files.length) void this.importFiles(files)
    })
    this.projectFile.addEventListener('change', () => {
      const file = this.projectFile.files?.[0]
      this.projectFile.value = ''
      if (file) void this.importFiles([file], true)
    })
    this.planFile.addEventListener('change', () => {
      const file = this.planFile.files?.[0]
      this.planFile.value = ''
      if (file) void this.loadPlan(file)
    })
    d.interact.onCalibration = () => {
      // обе точки стоят: дальше нужно поле расстояния, а оно в панели свойств (на телефоне она может быть свёрнута)
      if (d.interact.calibration?.points.length === 2) this.showPanel('props')
      this.renderInspector()
      this.renderMode()
      this.renderStatus()
    }
    d.interact.onRelease = () => {
      if (!this.panelAfterRelease) return
      this.panelAfterRelease = false
      if (d.store.selection) this.showPanel('props')
    }
    d.interact.onDrawing = () => { this.renderInspector(); this.renderMode(); this.renderToolbarState(); this.renderStatus() }
    // Ctrl+S — проект в файл, Ctrl+O — открыть файл проекта
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.code === 'KeyS') {
        e.preventDefault()
        void this.saveProject()
      } else if (e.code === 'KeyO') {
        e.preventDefault()
        this.projectFile.click()
      }
    })
    d.stage.onView((view) => {
      // комнаты рисуют в виде сверху: в объёмном протяжка должна снова поворачивать вид
      if (view !== 'plan') d.interact.stopDrawing()
      this.renderToolbarState()
      this.renderStatus()
    })
    this.bindDrop()
    d.store.on((c) => {
      if (c === 'lang') {
        this.renderMode()
        this.picker.close()
        this.renderMenubar()
        this.renderToolbar()
        this.renderCatalog()
        this.renderDock()
        this.signature = ''
      }
      if (c === 'replace') this.picker.close()
      if (c === 'selection') {
        this.picker.close()
        // на телефоне выбранное показывает свои свойства; если палец ещё на экране — после того, как его отпустят
        if (d.store.selection) {
          if (d.interact.pressed) this.panelAfterRelease = true
          else this.showPanel('props')
        }
      }
      // отмена или другая правка могли изменить цвет, который сейчас выбирают
      if (c === 'doc') this.picker.sync()
      this.renderToolbarState()
      this.renderInspector()
      this.renderStatus()
    })
    d.userModels.onChange = () => this.renderCatalog()
    const loaded = d.items.onLoaded
    d.items.onLoaded = (id) => {
      loaded(id)
      if (d.store.selection?.id === id) {
        this.signature = ''
        this.renderInspector()
      }
    }
    this.renderMenubar()
    this.renderToolbar()
    this.renderCatalog()
    this.renderDock()
    this.renderInspector()
    this.renderStatus()
  }

  private t(key: TextKey, vars?: Record<string, string | number>): string {
    return tr(this.d.store.lang, key, vars)
  }

  // ---------- меню ----------

  private menus(): { id: string; label: string; items: (MenuItem | null)[] }[] {
    const { store, stage, interact } = this.d
    const sel = store.selection
    return [
      {
        id: 'file',
        label: this.t('menuFile'),
        items: [
          { label: this.t('menuNew'), id: 'menu-new', run: () => this.newProject() },
          { label: this.t('loadDemo'), id: 'menu-demo', run: () => this.openDemo() },
          null,
          { label: this.t('menuOpen'), key: 'Ctrl+O', id: 'menu-open', run: () => this.projectFile.click() },
          { label: this.t('menuSave'), key: 'Ctrl+S', id: 'menu-save', run: () => void this.saveProject() },
          null,
          { label: this.t('menuAddModel'), id: 'menu-model', run: () => this.file.click() },
          { label: this.t('menuLoadPlan'), id: 'menu-plan', run: () => this.planFile.click() },
          null,
          { label: this.t('menuSnapshot'), id: 'menu-snapshot', run: () => void this.snapshot() },
        ],
      },
      {
        id: 'edit',
        label: this.t('menuEdit'),
        items: [
          { label: this.t('undo'), key: 'Ctrl+Z', disabled: !store.canUndo, run: () => store.undo() },
          { label: this.t('redo'), key: 'Ctrl+Shift+Z', disabled: !store.canRedo, run: () => store.redo() },
          null,
          { label: this.t('duplicate'), key: 'Ctrl+D', disabled: sel?.kind !== 'item', run: () => interact.duplicateSelected() },
          { label: this.t('menuRotate'), key: 'R', disabled: sel?.kind !== 'item', run: () => interact.rotateSelected(90) },
          { label: this.t('remove'), key: 'Delete', disabled: !sel, run: () => interact.deleteSelected() },
        ],
      },
      {
        id: 'view',
        label: this.t('menuView'),
        items: [
          { label: this.t('menuView3d'), run: () => stage.setView('3d') },
          { label: this.t('menuViewPlan'), run: () => stage.setView('plan') },
          null,
          { label: this.t('language'), id: 'menu-lang', run: () => store.setLang(store.lang === 'ru' ? 'en' : 'ru') },
        ],
      },
      {
        id: 'help',
        label: this.t('menuHelp'),
        items: [
          { label: this.t('tourOpen'), id: 'menu-tour', run: () => this.onTour() },
          { label: this.t('help'), id: 'menu-howto', run: () => this.showHelp() },
          null,
          { label: this.t('menuAbout'), id: 'menu-about', run: () => this.showAbout() },
        ],
      },
    ]
  }

  private renderMenubar(): void {
    const open = this.menuOpen
    const toggle = (id: string) => {
      this.menuOpen = this.menuOpen === id ? null : id
      this.renderMenubar()
    }
    this.menubar.replaceChildren(
      ...this.menus().map((m) =>
        h(
          'div',
          { class: `menu${open === m.id ? ' is-open' : ''}` },
          h('button', {
            class: 'menu-btn',
            type: 'button',
            'aria-haspopup': 'true',
            'aria-expanded': open === m.id ? 'true' : 'false',
            'data-menu': m.id,
            onclick: () => toggle(m.id),
            // пока одно меню открыто, соседние открываются наведением — как в обычных программах
            onpointerenter: (e: PointerEvent) => {
              if (e.pointerType === 'mouse' && this.menuOpen && this.menuOpen !== m.id) toggle(m.id)
            },
          }, m.label),
          open === m.id
            ? h('div', { class: 'menu-list', role: 'menu' }, ...m.items.map((it) =>
                it
                  ? h('button', { class: 'menu-item', type: 'button', role: 'menuitem', id: it.id, disabled: it.disabled === true, onclick: () => { this.menuOpen = null; this.renderMenubar(); it.run() } }, h('span', {}, it.label), it.key ? h('span', { class: 'menu-key' }, it.key) : null)
                  : h('div', { class: 'menu-sep', role: 'separator' }),
              ))
            : null,
        ),
      ),
    )
  }

  private selectionKey(): string {
    const sel = this.d.store.selection
    return sel ? `${sel.kind}:${sel.id}` : 'scene'
  }

  /** Клавиша для верхнего слоя. Окно забирает все клавиши; меню и выбор цвета — только Esc. */
  private layerKey(e: KeyboardEvent): void {
    const modal = this.modal
    if (modal) {
      if (e.key === 'Escape') {
        e.preventDefault()
        modal.close()
      } else if (e.key === 'Tab') {
        // фокус ходит по кругу внутри окна
        const stops = [...modal.el.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]')].filter((el) => !el.hasAttribute('disabled'))
        const at = stops.indexOf(document.activeElement as HTMLElement)
        const next = stops[at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]
        e.preventDefault()
        next?.focus()
      }
      e.stopPropagation()
      return
    }
    if (e.key !== 'Escape') return
    if (this.menuOpen) {
      this.menuOpen = null
      this.renderMenubar()
      e.stopPropagation()
    } else if (this.picker.isOpen) {
      this.picker.close()
      e.stopPropagation()
    }
  }

  /** Обычное окно с заголовком, текстом и кнопками. */
  private dialog(title: string, body: (Node | string)[], buttons: { label: string; id?: string; kind?: 'primary' | 'danger'; run?: () => void }[]): void {
    this.modal?.close()
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const close = (): void => {
      veil.remove()
      if (this.modal?.el === veil) this.modal = null
      if (back?.isConnected) back.focus()
    }
    const veil: HTMLElement = h(
      'div',
      { class: 'modal-veil', onpointerdown: (e: Event) => e.target === veil && close() },
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('header', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': this.t('cancel'), title: this.t('cancel'), html: ICON.close, onclick: close })),
        h('div', { class: 'modal-body' }, ...body),
        h('footer', { class: 'modal-foot' }, ...buttons.map((b) => h('button', { class: `btn${b.kind === 'primary' ? ' btn-primary' : b.kind === 'danger' ? ' btn-danger' : ''}`, type: 'button', id: b.id, onclick: () => { close(); b.run?.() } }, b.label))),
      ),
    )
    this.modal = { el: veil, close }
    this.app.append(veil)
    // в фокусе — безопасная кнопка: случайный Enter ничего не удаляет
    const foot = veil.querySelector<HTMLElement>('.modal-foot')
    ;(foot?.querySelector<HTMLElement>('.btn-primary') ?? foot?.querySelector<HTMLElement>('.btn:not(.btn-danger)') ?? foot?.querySelector<HTMLElement>('.btn'))?.focus()
  }

  /** Открыть пример квартиры вместо текущего проекта — с вопросом: отменить это нельзя. */
  private openDemo(): void {
    const { store, stage } = this.d
    this.dialog(this.t('loadDemo'), [h('p', {}, this.t('demoConfirm'))], [
      { label: this.t('demoYes'), kind: 'danger', id: 'demo-yes', run: () => { store.replace(starterDoc()); stage.setView('3d') } },
      { label: this.t('cancel') },
    ])
  }

  private newProject(): void {
    const { store, stage } = this.d
    this.dialog(this.t('menuNew'), [h('p', {}, this.t('startOverConfirm'))], [
      { label: this.t('startOverYes'), kind: 'danger', id: 'new-yes', run: () => { store.replace(defaultDoc()); stage.setView('3d') } },
      { label: this.t('cancel') },
    ])
  }

  private showHelp(): void {
    this.dialog(this.t('helpTitle'), [h('ul', { class: 'help-list' }, ...(['helpMove', 'helpOrbit', 'helpRooms', 'helpPlan', 'helpImport', 'helpProject', 'helpKeys'] as TextKey[]).map((k) => h('li', {}, this.t(k))))], [
      { label: this.t('tourOpen'), kind: 'primary', id: 'help-tour', run: () => this.onTour() },
      { label: this.t('close') },
    ])
  }

  private showAbout(): void {
    this.dialog(this.t('menuAbout'), [h('p', {}, `${this.t('aboutName')} ${__APP_VERSION__}`), h('p', { class: 'hint' }, this.t('aboutText')), h('p', { class: 'hint' }, this.t('kitCredit'))], [{ label: this.t('close') }])
  }

  // ---------- панель инструментов ----------

  private undoBtn!: HTMLButtonElement
  private redoBtn!: HTMLButtonElement
  private drawBtn!: HTMLButtonElement
  private viewBtns: HTMLButtonElement[] = []

  private renderToolbar(): void {
    const { store, stage, interact } = this.d
    const tool = (id: string, icon: string, label: string, title: string, run: () => void): HTMLButtonElement =>
      h('button', { class: 'tool', id, type: 'button', title, onclick: run }, h('span', { class: 'tool-ico', html: icon }), h('span', { class: 'tool-label' }, label))
    const sep = () => h('span', { class: 'tool-sep', role: 'separator' })
    this.undoBtn = h('button', { class: 'tool tool-icon', id: 'tool-undo', type: 'button', title: `${this.t('undo')} (Ctrl+Z)`, 'aria-label': this.t('undo'), html: ICON.undo, onclick: () => store.undo() })
    this.redoBtn = h('button', { class: 'tool tool-icon', id: 'tool-redo', type: 'button', title: `${this.t('redo')} (Ctrl+Shift+Z)`, 'aria-label': this.t('redo'), html: ICON.redo, onclick: () => store.redo() })
    this.drawBtn = tool('draw-room', ICON.pen, this.t('toolDraw'), this.t('toolDrawTitle'), () => this.toggleDraw())
    this.viewBtns = (['3d', 'plan'] as const).map((v) =>
      h('button', { class: 'seg-btn', type: 'button', onclick: () => (stage.setView(v), this.renderToolbarState()) }, this.t(v === '3d' ? 'view3d' : 'viewPlan')),
    )
    this.toolbar.replaceChildren(
      this.undoBtn,
      this.redoBtn,
      sep(),
      tool('tool-room', ICON.room, this.t('toolRoom'), this.t('addRoom'), () => this.addRoom()),
      this.drawBtn,
      tool('tool-door', ICON.doorSmall, this.t('door'), this.t('toolDoorTitle'), () => interact.addOpening('door')),
      tool('tool-window', ICON.windowSmall, this.t('window'), this.t('toolWindowTitle'), () => interact.addOpening('window')),
      sep(),
      h('div', { class: 'seg', role: 'group', 'aria-label': this.t('menuView') }, ...this.viewBtns),
      sep(),
      tool('tool-snapshot', ICON.camera, this.t('snapshot'), this.t('menuSnapshot'), () => void this.snapshot()),
    )
    this.renderToolbarState()
  }

  private renderToolbarState(): void {
    this.undoBtn.disabled = !this.d.store.canUndo
    this.redoBtn.disabled = !this.d.store.canRedo
    this.viewBtns.forEach((b, i) => b.classList.toggle('is-on', (i === 0) === (this.d.stage.view === '3d')))
    this.drawBtn.classList.toggle('is-on', this.d.interact.drawing)
    this.drawBtn.setAttribute('aria-pressed', this.d.interact.drawing ? 'true' : 'false')
  }

  /** Рисование комнаты включается и выключается одной кнопкой. */
  private toggleDraw(): void {
    const { interact, stage } = this.d
    if (interact.drawing) return interact.stopDrawing()
    stage.setView('plan')
    interact.startDrawing()
  }

  /** Добавить комнату справа от самой правой. */
  private addRoom(): void {
    const { store } = this.d
    const cur = store.doc
    const right = cur.rooms.reduce((a, b) => (b.x + b.w / 2 > a.x + a.w / 2 ? b : a))
    const id = store.newId('r')
    store.update((d) => addRoom(d, id, { x: right.x + right.w / 2 + 1.75, z: right.z, w: 3.5, d: Math.min(right.d, 4) }))
    store.select({ kind: 'room', id })
  }

  // ---------- строка состояния и вкладки телефона ----------

  private renderStatus(): void {
    const { store, interact } = this.d
    const doc = store.doc
    const sel = store.selection
    const cal = interact.calibration
    const hint: TextKey = interact.drawing ? 'statusDraw' : cal ? 'statusScale' : sel?.kind === 'item' ? 'statusItem' : sel?.kind === 'room' ? 'statusRoom' : sel?.kind === 'opening' ? 'statusOpening' : sel?.kind === 'underlay' ? 'statusPlan' : this.d.stage.view === 'plan' ? 'statusIdlePlan' : 'statusIdle'
    this.statusbar.replaceChildren(
      h('span', { class: 'status-hint' }, this.t(hint)),
      h('span', { class: 'status-stats' }, this.t('statusStats', { rooms: doc.rooms.length, area: fmt(store.lang, floorArea(doc.rooms), 1), items: doc.items.length })),
    )
  }

  private renderDock(): void {
    const tab = (id: Exclude<PhonePanel, null>, label: string) =>
      h('button', { class: `dock-tab${this.phonePanel === id ? ' is-on' : ''}`, type: 'button', 'data-dock': id, 'aria-pressed': this.phonePanel === id ? 'true' : 'false', onclick: () => this.showPanel(this.phonePanel === id ? null : id) }, label)
    this.dock.replaceChildren(tab('catalog', this.t('catalog')), tab('props', this.t('properties')))
  }

  /** На телефоне на экране помещается одна панель: каталог или свойства. На компьютере видны обе. */
  showPanel(which: PhonePanel): void {
    const host = this.d.stage.renderer.domElement.parentElement
    const before = host?.clientHeight ?? 0
    this.phonePanel = which
    this.catalog.classList.toggle('is-open', which === 'catalog')
    this.inspector.classList.toggle('is-open', which === 'props')
    this.renderDock()
    // на телефоне панель отнимает высоту у вида; камера придвигается, чтобы квартира не стала мелкой
    const after = host?.clientHeight ?? 0
    if (before > 0 && after > 0 && before !== after) this.d.stage.keepScale(after / before)
  }

  /** Закрыть выбор цвета (обучению нужна сама панель свойств). */
  closePicker(): void {
    this.picker.close()
  }

  private async snapshot(): Promise<void> {
    const blob = await this.d.stage.snapshot(2)
    if (!blob) return this.d.toaster.show(this.t('snapshotFailed'), 'error')
    const outcome = await saveFile('maket.png', blob)
    if (outcome === 'saved') this.d.toaster.show(this.t('snapshotSaved'))
    else if (outcome === 'failed') this.d.toaster.show(this.t('snapshotFailed'), 'error')
  }

  // ---------- каталог ----------

  private renderCatalog(): void {
    const { store } = this.d
    const lang = store.lang
    const cats: { id: Tab; label: string }[] = [...CATEGORIES.map((c) => ({ id: c.id as Tab, label: lang === 'ru' ? c.ru : c.en })), { id: 'my', label: this.t('myModels') }]
    const select = h(
      'select',
      { id: 'catalog-cat', class: 'select', 'aria-label': this.t('category'), onchange: (e: Event) => { this.tab = (e.target as HTMLSelectElement).value as Tab; this.search = ''; this.renderCatalog() } },
      ...cats.map((c) => h('option', { value: c.id, selected: c.id === this.tab }, c.label)),
    )
    const search = h('input', { type: 'search', id: 'catalog-search', class: 'text', placeholder: this.t('search'), 'aria-label': this.t('search'), value: this.search, oninput: (e: Event) => { this.search = (e.target as HTMLInputElement).value; this.renderTiles() } })
    this.tilesEl = h('div', { class: 'tiles' })
    this.catalog.replaceChildren(h('div', { class: 'pane-head' }, this.t('catalog')), h('div', { class: 'catalog-tools' }, search, select), this.tilesEl)
    this.renderTiles()
  }

  /** Плитки каталога: выбранная категория или, если что-то набрано в поиске, найденное по всему каталогу. */
  private renderTiles(): void {
    const { store, userModels } = this.d
    const lang = store.lang
    const q = this.search.trim().toLowerCase()
    const tiles: HTMLElement[] = []
    const T = 72
    const rows = Math.ceil(KIT_THUMB.count / KIT_THUMB.cols)
    const kitTile = (k: (typeof KIT)[number]) =>
      this.tile(lang === 'ru' ? k.ru : k.en, { kind: 'kit', key: k.key }, h('span', {
        class: 'thumb',
        style: {
          backgroundImage: 'url(models/kit-thumbs.webp)',
          backgroundSize: `${KIT_THUMB.cols * T}px ${rows * T}px`,
          backgroundPosition: `-${(k.i % KIT_THUMB.cols) * T}px -${Math.floor(k.i / KIT_THUMB.cols) * T}px`,
        },
      }))
    if (q) {
      for (const k of KIT.filter((x) => (lang === 'ru' ? x.ru : x.en).toLowerCase().includes(q))) tiles.push(kitTile(k))
    } else if (this.tab === 'my') {
      tiles.push(h('button', { class: 'tile tile-add', type: 'button', onclick: () => this.file.click() }, h('span', { class: 'thumb', html: ICON.upload }), h('span', { class: 'tile-name' }, this.t('addModel'))))
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
      for (const k of KIT.filter((x) => x.cat === this.tab)) tiles.push(kitTile(k))
    }
    const note = q && !tiles.length ? this.t('searchEmpty') : !q && this.tab === 'my' ? this.t('addModelHint') : null
    this.tilesEl.replaceChildren(...tiles, ...(note ? [h('p', { class: 'hint tiles-note' }, note)] : []))
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
        // вещь появляется, когда указатель дошёл до сцены: над панелями ей негде стоять
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 8 && interact.overView(ev)) {
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

  /** Полоса над сценой говорит, какой режим включён, и даёт из него выйти — панель при этом может быть свёрнута. */
  private renderMode(): void {
    const { interact } = this.d
    const cal = interact.calibration
    const text = interact.drawing ? this.t('modeDraw') : cal && cal.points.length < 2 ? this.t(cal.points.length === 0 ? 'modeCal1' : 'modeCal2') : null
    this.modeBar.hidden = text === null
    if (text === null) return
    const stop = interact.drawing ? () => interact.stopDrawing() : () => interact.stopCalibration()
    this.modeBar.replaceChildren(h('span', {}, text), h('button', { class: 'btn btn-small', type: 'button', id: 'mode-done', onclick: stop, onpointerup: (e: PointerEvent) => e.pointerType === 'touch' && stop() }, this.t(interact.drawing ? 'drawRoomDone' : 'cancel')))
  }

  /** Сохранить проект вместе со своими моделями в один файл. */
  async saveProject(): Promise<void> {
    const { store, userModels, toaster } = this.d
    try {
      const plan = store.doc.scene.underlay
      const blob = await packProject(store.doc, userModels.list, plan ? await this.d.images.get(plan.image) : null)
      const outcome = await saveFile(projectFileName(new Date()), blob)
      if (outcome === 'saved') toaster.show(this.t('projectSaved'))
      else if (outcome === 'failed') toaster.show(this.t('projectSaveFailed'), 'error')
    } catch {
      toaster.show(this.t('projectSaveFailed'), 'error')
    }
  }

  private async openProject(project: OpenedProject): Promise<void> {
    const { store, userModels, toaster, stage } = this.d
    let failed = (await userModels.adopt(project.models)) + project.missing
    let doc = project.doc
    // картинка плана пришла из чужого файла: уменьшаем её как обычную и кладём под своим ключом
    const plan = doc.scene.underlay
    if (plan) {
      const prepared = project.image ? await prepareImage(project.image.blob) : null
      if (prepared) doc = setUnderlay(doc, { ...plan, image: await this.d.images.put(prepared.blob), ratio: prepared.ratio })
      else {
        doc = setUnderlay(doc, null)
        failed++
      }
    }
    // предметы, для которых в файле не нашлось модели, в проект не попадают
    const known = { kit: (key: string) => KIT_BY_KEY.has(key), user: (key: string) => userModels.list.some((m) => m.id === key), userReady: true }
    const kept = dropItems(doc, (i) => isOrphan(i.src, known))
    failed += doc.items.length - kept.items.length
    store.select(null)
    // обычная правка, а не новый проект: «Отменить» вернёт прежний
    store.update(() => kept)
    stage.setView('3d')
    this.renderCatalog()
    if (failed) toaster.show(this.t('projectOpenedPartly'), 'error')
    else toaster.show(this.t('projectOpened'))
  }

  /** Положить картинку на коврик как план квартиры. */
  async loadPlan(file: Blob): Promise<void> {
    const { store, stage, toaster, images } = this.d
    toaster.show(this.t('reading'), 'info', 60_000)
    const prepared = await prepareImage(file)
    if (!prepared) return toaster.show(this.t('planBad'), 'error')
    const id = await images.put(prepared.blob)
    const old = store.doc.scene.underlay
    const c = stage.controls.target
    // новая картинка встаёт на место прежней, с тем же масштабом по ширине
    store.update((d) => setUnderlay(d, old ? { ...old, image: id, ratio: prepared.ratio } : defaultUnderlay(id, prepared.ratio, { x: c.x, z: c.z })))
    store.select({ kind: 'underlay', id: 'underlay' })
    stage.setView('plan')
    toaster.show(this.t('planLoaded'))
  }

  /** Принять файлы: проект «Макета» открывается, одна картинка становится планом квартиры, остальное считается моделями. */
  async importFiles(files: File[], projectOnly = false): Promise<void> {
    const { toaster, userModels, interact } = this.d
    if (!projectOnly && files.length === 1 && isImageFile(files[0].name)) return this.loadPlan(files[0])
    toaster.show(this.t('reading'), 'info', 60_000)
    if (projectOnly || (files.length === 1 && isArchive(files[0].name))) {
      const res = await readProject(files[0])
      if (res.ok) return this.openProject(res.project)
      if (res.reason !== 'not_project' || projectOnly) {
        const key: TextKey = res.reason === 'newer' ? 'errProjectNewer' : res.reason === 'broken' ? 'errProjectBroken' : 'errNotProject'
        return toaster.show(this.t(key), 'error')
      }
    }
    const res = await userModels.importFiles(files)
    this.tab = 'my'
    this.renderCatalog()
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
    if (!sel) sig += `|${doc.rooms.map((r) => r.id).join(',')}|${doc.scene.underlay !== null}`
    if (sel?.kind === 'underlay') sig += `|${this.d.interact.calibration?.points.length ?? 'off'}`
    if (sel?.kind === 'item') sig += `|${items.template(sel.id)?.slots.join(',') ?? '…'}`
    if (sel?.kind === 'room') sig += `|${doc.rooms.length}|${this.furnishAsk?.room === sel.id ? this.furnishAsk.kind : ''}`
    if (this.picker.isOpen) {
      if (this.inspector.firstElementChild !== this.picker.el) this.inspector.replaceChildren(this.picker.el)
      this.signature = ''
      return
    }
    if (sig !== this.signature) {
      this.signature = sig
      this.controls = []
      const body = !sel ? this.sceneView(doc) : sel.kind === 'item' ? this.itemView(doc, sel.id) : sel.kind === 'room' ? this.roomView(doc, sel.id) : sel.kind === 'opening' ? this.openingView(doc, sel.id) : this.underlayView()
      this.inspector.replaceChildren(...body)
      this.inspector.scrollTop = 0
    }
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
      this.picker.open({ title: label, current: cur, read: () => get(this.d.store.doc), onPick, onReset, palette: () => projectColors(this.d.store.doc) })
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

  /** Заголовок панели. live — подзаголовок, который пересчитывается при каждой правке (площадь). */
  private head(title: string, sub?: string, live?: (d: Doc) => string): HTMLElement {
    const { store } = this.d
    const subEl = sub || live ? h('div', { class: 'sub' }, sub ?? '') : null
    if (subEl && live) this.controls.push({ el: subEl, sync: (d) => { subEl.textContent = live(d) } })
    return h(
      'header',
      { class: 'insp-head' },
      h('div', {}, h('h2', {}, title), subEl),
      store.selection ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': this.t('cancel'), html: ICON.close, onclick: () => store.select(null) }) : null,
    )
  }

  private sceneView(doc: Doc): HTMLElement[] {
    const { store, interact } = this.d
    const lang = store.lang
    const mats: [MatKind, TextKey][] = [['light', 'matLight'], ['graphite', 'matGraphite'], ['green', 'matGreen'], ['blue', 'matBlue'], ['sand', 'matSand']]
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
    const addRoomBtn = h('button', { class: 'btn with-icon', type: 'button', id: 'add-room', onclick: () => this.addRoom() }, h('span', { html: ICON.plus }), this.t('addRoom'))

    const planMeta = h('span', { class: 'code' })
    this.controls.push({ el: planMeta, sync: (d) => { const u = d.scene.underlay; if (u) { const size = underlaySize(u); planMeta.textContent = `${fmt(lang, size.w)} × ${fmt(lang, size.d)} ${this.t('m')}` } } })
    const plan = doc.scene.underlay
      ? [h('button', { class: 'row-btn', type: 'button', id: 'select-plan', onclick: () => { store.select({ kind: 'underlay', id: 'underlay' }); this.d.stage.setView('plan') } }, h('span', {}, this.t('plan')), planMeta)]
      : [h('button', { class: 'btn with-icon', type: 'button', id: 'load-plan', onclick: () => this.planFile.click() }, h('span', { html: ICON.plus }), this.t('planLoad')), h('p', { class: 'hint' }, this.t('planHint'))]

    void interact
    return [
      this.head(this.t('scene'), undefined, (d) => `${this.t('areaTotal')} ${fmt(lang, floorArea(d.rooms), 1)} ${this.t('m2')}`),
      this.section(this.t('light'),
        this.slider({ id: 'f-time', label: this.t('timeOfDay'), min: 0, max: 1, step: 0.01, get: (d) => d.light.time, set: (v) => store.update((d) => setLight(d, v), true), show: (v) => this.t(v < 0.3 ? 'morning' : v < 0.72 ? 'noon' : 'evening') }),
      ),
      this.section(this.t('mat'), h('div', { class: 'mat-row' }, ...matBtns)),
      this.section(this.t('walls'),
        this.slider({ id: 'f-wallh', label: this.t('wallHeight'), min: LIMITS.hMin, max: LIMITS.hMax, step: 0.05, get: (d) => d.walls.h, set: (v) => store.update((d) => setWalls(d, { h: v }), true), show: (v) => `${fmt(lang, v)} ${this.t('m')}` }),
        this.chip(this.t('wallColor'), (d) => d.walls.color, (hex) => store.update((d) => setWalls(d, { color: hex }))),
      ),
      this.section(this.t('rooms'), ...roomRows, addRoomBtn),
      this.section(this.t('plan'), ...plan),
    ]
  }

  private underlayView(): HTMLElement[] {
    const { store, interact, toaster } = this.d
    const lang = store.lang
    const cal = interact.calibration
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => interact.stopCalibration() }, this.t('cancel'))
    let scale: HTMLElement
    if (!cal) {
      scale = h('button', { class: 'btn', type: 'button', id: 'plan-calibrate', onclick: () => { this.d.stage.setView('plan'); interact.startCalibration() } }, this.t('planCalibrate'))
    } else if (cal.points.length < 2) {
      scale = h('div', { class: 'confirm' }, h('p', {}, this.t(cal.points.length === 0 ? 'planCalStep1' : 'planCalStep2')), h('div', { class: 'btn-row' }, cancel))
    } else {
      const [a, b] = cal.points
      const input = h('input', { type: 'text', id: 'plan-distance', class: 'num-input wide', inputMode: 'decimal', autocomplete: 'off', placeholder: lang === 'ru' ? '3,5' : '3.5' })
      const form = h('form', { class: 'confirm' },
        h('label', { for: 'plan-distance' }, this.t('planCalDistance')),
        input,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', type: 'submit', id: 'plan-apply' }, this.t('planCalApply')), cancel))
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const meters = Number(input.value.trim().replace(',', '.'))
        const u = store.doc.scene.underlay
        if (!u || !(meters > 0) || !Number.isFinite(meters)) return toaster.show(this.t('planCalBad'), 'error')
        store.update((d) => setUnderlay(d, calibrate(u, a, b, meters)))
        interact.stopCalibration()
        toaster.show(this.t('planCalDone'))
      })
      scale = form
      setTimeout(() => input.focus(), 0)
    }
    const u0 = (d: Doc) => d.scene.underlay
    return [
      this.head(this.t('plan')),
      this.section(this.t('planScale'),
        scale,
        this.slider({ id: 'plan-width', label: this.t('planWidth'), min: LIMITS.underMin, max: LIMITS.underMax, step: 0.1, get: (d) => u0(d)?.w ?? null, set: (v) => store.update((d) => updateUnderlay(d, { w: v }), true), show: (v) => `${fmt(lang, v)} ${this.t('m')}` }),
      ),
      this.section(this.t('planLook'),
        this.slider({ id: 'plan-opacity', label: this.t('planOpacity'), min: 10, max: 100, step: 5, get: (d) => { const u = u0(d); return u ? Math.round(u.opacity * 100) : null }, set: (v) => store.update((d) => updateUnderlay(d, { opacity: v / 100 }), true), show: (v) => `${v}%` }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', id: 'plan-rotate', onclick: () => store.update((d) => updateUnderlay(d, { rot: (u0(d)?.rot ?? 0) + 90 })) }, this.t('planRotate')),
          h('button', { class: 'btn', type: 'button', onclick: () => this.planFile.click() }, this.t('planReplace'))),
      ),
      this.section(this.t('planPlace'),
        h('p', { class: 'hint' }, this.t('planMoveHint')),
        h('button', { class: 'btn with-icon', type: 'button', id: 'draw-on-plan', onclick: () => { this.d.stage.setView('plan'); interact.startDrawing() } }, h('span', { html: ICON.pen }), this.t('drawRoomOnPlan')),
        h('button', { class: 'btn btn-danger', type: 'button', id: 'plan-remove', onclick: () => interact.deleteSelected() }, this.t('planRemove'))),
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
        h('div', { class: 'btn-row', 'data-tour': 'rotate' },
          h('button', { class: 'btn with-icon', type: 'button', title: 'Shift+R', onclick: () => interact.rotateSelected(-90) }, h('span', { html: ICON.rotL }), '90°'),
          h('button', { class: 'btn with-icon', type: 'button', title: 'R', onclick: () => interact.rotateSelected(90) }, h('span', { html: ICON.rotR }), '90°')),
        this.slider({ id: 'f-rot', label: this.t('rotate'), min: 0, max: 345, step: 15, get: (d) => cur(d)?.rot ?? null, set: (v) => store.update((d) => updateItem(d, id, { rot: v }), true), show: (v) => `${Math.round(v)}°` }),
      ),
      this.section(this.t('size'),
        this.slider({ id: 'f-scale', label: this.t('size'), min: 0.25, max: 3, step: 0.05, get: (d) => { const it = cur(d); return it ? Math.min(3, it.scale) : null }, set: (v) => store.update((d) => updateItem(d, id, { scale: v }), true), show: (v) => `${Math.round(v * 100)}%` }),
        heightField,
        this.slider({ id: 'f-lift', label: this.t('lift'), min: 0, max: 2.6, step: 0.05, get: (d) => cur(d)?.y ?? null, set: (v) => store.update((d) => updateItem(d, id, { y: v, lift: v > 0 }), true), show: (v) => `${Math.round(v * 100)} ${this.t('cm')}` }),
      ),
      slots.length ? this.section(this.t('colors'), h('div', { class: 'chip-list', 'data-tour': 'colors' }, ...colorRows)) : null,
      this.section(this.t('actions'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn with-icon', type: 'button', title: 'Ctrl+D', onclick: () => interact.duplicateSelected() }, h('span', { html: ICON.copy }), this.t('duplicate')),
          h('button', { class: 'btn btn-danger with-icon', type: 'button', title: 'Delete', onclick: () => interact.deleteSelected() }, h('span', { html: ICON.trash }), this.t('remove'))),
        user ? h('button', { class: 'btn with-icon', type: 'button', title: this.t('flipHint'), onclick: async () => { await userModels.tilt(user.id); items.reload((k) => k === `user:${user.id}`) } }, h('span', { html: ICON.flip }), this.t('flip')) : null,
      ),
    ].filter((x): x is HTMLElement => !!x)
  }

  /** Поставить в комнату готовый набор мебели — одним шагом отмены. */
  private furnish(roomId: string, kind: RoomKind, replace: boolean): void {
    const { store, items, toaster } = this.d
    const res = furnishRoom(store.doc, roomId, kind, {
      replace,
      newId: () => store.newId('i'),
      // размеры стоящей мебели: у каталога они известны, у своих моделей их знает сцена
      sizeOf: (i) => {
        const kit = i.src.kind === 'kit' ? KIT_BY_KEY.get(i.src.key) : null
        if (kit) return kit
        const s = items.size(i.id)
        return s ? { w: s.x / i.scale, d: s.z / i.scale, h: s.y / i.scale } : null
      },
    })
    if (!res.placed) {
      toaster.show(this.t('furnishNone'), 'error')
      return this.renderInspector()
    }
    store.update(() => res.doc)
    toaster.show(this.t('furnished', { n: res.placed }))
    this.renderInspector()
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
    // обставить комнату готовым набором
    const sets: [RoomKind, TextKey][] = [['living', 'furnishLiving'], ['bedroom', 'furnishBedroom'], ['kitchen', 'furnishKitchen'], ['bath', 'furnishBath'], ['office', 'furnishOffice']]
    const ask = this.furnishAsk?.room === id ? this.furnishAsk : null
    const closeAsk = () => { this.furnishAsk = null; this.renderInspector() }
    const furnishUi = ask
      ? h('div', { class: 'confirm' }, h('p', {}, this.t('furnishAsk')), h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', type: 'button', id: 'furnish-replace', onclick: () => { this.furnishAsk = null; this.furnish(id, ask.kind, true) } }, this.t('furnishReplace')),
          h('button', { class: 'btn', type: 'button', id: 'furnish-add', onclick: () => { this.furnishAsk = null; this.furnish(id, ask.kind, false) } }, this.t('furnishAdd')),
          h('button', { class: 'btn', type: 'button', onclick: closeAsk }, this.t('cancel'))))
      : h('div', { class: 'btn-row' }, ...sets.map(([kind, key]) => h('button', { class: 'btn btn-small', type: 'button', 'data-furnish': kind, onclick: () => {
          const d = store.doc
          const here = d.rooms.find((r) => r.id === id)
          if (here && d.items.some((i) => roomHolds(here, i))) { this.furnishAsk = { room: id, kind }; this.renderInspector() } else this.furnish(id, kind, false)
        } }, this.t(key))))
    return [
      this.head(`${this.t('room')} ${index + 1}`, undefined, (d) => { const r = cur(d); return r ? `${fmt(lang, r.w * r.d, 1)} ${this.t('m2')}` : '' }),
      this.section(this.t('furnish'), furnishUi),
      this.section(this.t('size'),
        this.slider({ id: 'f-rw', label: this.t('width'), min: LIMITS.roomMin, max: 10, step: 0.05, get: (d) => { const r = cur(d); return r ? Math.min(10, r.w) : null }, set: (v) => store.update((d) => updateRoom(d, id, { w: v }), true), show: m }),
        this.slider({ id: 'f-rd', label: this.t('depth'), min: LIMITS.roomMin, max: 10, step: 0.05, get: (d) => { const r = cur(d); return r ? Math.min(10, r.d) : null }, set: (v) => store.update((d) => updateRoom(d, id, { d: v }), true), show: m }),
      ),
      this.section(this.t('floor'),
        h('div', { class: 'seg seg-wide', role: 'group' }, ...kindBtns),
        this.chip(this.t('floorColor'), (d) => cur(d)?.floor.color ?? null, (hex) => store.update((d) => updateRoom(d, id, { floor: { color: hex } }))),
      ),
      doc.rooms.length > 1 ? this.section(this.t('actions'), h('button', { class: 'btn btn-danger with-icon', type: 'button', onclick: () => interact.deleteSelected() }, h('span', { html: ICON.trash }), this.t('deleteRoom'))) : null,
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
      this.section(this.t('actions'), h('button', { class: 'btn btn-danger with-icon', type: 'button', onclick: () => interact.deleteSelected() }, h('span', { html: ICON.trash }), this.t('remove'))),
    ]
  }
}
