// Состояние приложения: проект с историей, выделение, язык. Автосохранение в браузере.

import { sanitizeDoc, type Doc } from './core/doc'
import { History } from './core/history'
import { starterDoc } from './core/starter'

export type Selection = { kind: 'item' | 'room' | 'opening'; id: string } | null
export type Lang = 'ru' | 'en'
type Change = 'doc' | 'selection' | 'lang'

const DOC_KEY = 'maket.project.v1'
const LANG_KEY = 'maket.lang'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // хранилище недоступно — работаем без сохранения
  }
}

function initialLang(): Lang {
  const saved = read(LANG_KEY)
  if (saved === 'ru' || saved === 'en') return saved
  const code = (navigator.language || 'ru').slice(0, 2).toLowerCase()
  return ['ru', 'be', 'uk', 'kk', 'uz', 'ky', 'hy', 'az', 'tg'].includes(code) ? 'ru' : 'en'
}

export class Store {
  private readonly history: History<Doc>
  private listeners: Array<(c: Change) => void> = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private counter = 0
  selection: Selection = null
  lang: Lang = initialLang()
  /** был ли загружен сохранённый проект (иначе показан стартовый) */
  readonly restored: boolean

  constructor() {
    let doc: Doc | null = null
    const raw = read(DOC_KEY)
    if (raw) {
      try {
        doc = sanitizeDoc(JSON.parse(raw))
      } catch {
        doc = null
      }
    }
    this.restored = doc !== null
    this.history = new History(doc ?? starterDoc())
  }

  get doc(): Doc {
    return this.history.present
  }
  get canUndo(): boolean {
    return this.history.canUndo
  }
  get canRedo(): boolean {
    return this.history.canRedo
  }

  on(fn: (c: Change) => void): void {
    this.listeners.push(fn)
  }
  private emit(c: Change): void {
    for (const fn of this.listeners) fn(c)
  }

  newId(prefix: string): string {
    this.counter++
    return `${prefix}${Date.now().toString(36)}${this.counter.toString(36)}`
  }

  /** transient — промежуточный шаг перетаскивания; итог фиксирует commit(). */
  update(fn: (d: Doc) => Doc, transient = false): void {
    const next = fn(this.doc)
    if (next === this.doc) return
    this.history.set(next, transient)
    this.emit('doc')
    this.scheduleSave()
  }

  commit(): void {
    this.history.seal()
    this.emit('doc')
  }

  undo(): void {
    if (this.history.undo() === null) return
    this.fixSelection()
    this.emit('doc')
    this.scheduleSave()
  }

  redo(): void {
    if (this.history.redo() === null) return
    this.fixSelection()
    this.emit('doc')
    this.scheduleSave()
  }

  /** Открыть другой проект: история начинается заново. */
  replace(doc: Doc): void {
    this.history.reset(doc)
    this.selection = null
    this.emit('selection')
    this.emit('doc')
    this.scheduleSave()
  }

  select(sel: Selection): void {
    if (sel?.kind === this.selection?.kind && sel?.id === this.selection?.id) return
    this.selection = sel
    this.emit('selection')
  }

  private fixSelection(): void {
    const s = this.selection
    if (!s) return
    const d = this.doc
    const alive = s.kind === 'item' ? d.items.some((i) => i.id === s.id) : s.kind === 'room' ? d.rooms.some((r) => r.id === s.id) : d.openings.some((o) => o.id === s.id)
    if (!alive) {
      this.selection = null
      this.emit('selection')
    }
  }

  setLang(lang: Lang): void {
    if (lang === this.lang) return
    this.lang = lang
    write(LANG_KEY, lang)
    this.emit('lang')
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => write(DOC_KEY, JSON.stringify(this.doc)), 400)
  }
}
