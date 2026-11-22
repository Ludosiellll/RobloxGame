// Модели пользователя: импорт файлов, превью, хранение в браузере (IndexedDB).

import { isArchive, isModelFile, pickMainFile, titleFromFile } from './core/importPick'
import type { ProjectModel } from './core/projectFile'
import { expandFiles, ImportError, loadFromFiles, type FileSet } from './scene/importers'
import type { ModelLibrary, UserModel } from './scene/models'
import { renderThumb } from './scene/thumb'

const DB = 'maket-db'
const STORE = 'models'

interface Row {
  id: string
  name: string
  main: string
  tilt: number
  thumb: string
  added: number
  files: { name: string; blob: Blob }[]
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export type ImportResult = { added: UserModel[]; errors: ImportError['code'][] }

export class UserModels {
  list: (UserModel & { added: number })[] = []
  onChange: () => void = () => {}

  constructor(private readonly models: ModelLibrary) {}

  /** Вернуть модели, сохранённые в прошлый раз. */
  async restore(): Promise<void> {
    const rows = (await tx<Row[]>('readonly', (s) => s.getAll())) ?? []
    rows.sort((a, b) => a.added - b.added)
    for (const r of rows) {
      const files: FileSet = new Map(r.files.map((f) => [f.name, f.blob]))
      const model = { id: r.id, name: r.name, main: r.main, tilt: r.tilt, thumb: r.thumb, files, added: r.added }
      this.list.push(model)
      this.models.registerUser(model)
    }
    this.onChange()
  }

  private persist(m: UserModel & { added: number }): void {
    const row: Row = { id: m.id, name: m.name, main: m.main, tilt: m.tilt, thumb: m.thumb, added: m.added, files: [...m.files].map(([name, blob]) => ({ name, blob })) }
    void tx('readwrite', (s) => s.put(row))
  }

  async importFiles(files: File[]): Promise<ImportResult> {
    const result: ImportResult = { added: [], errors: [] }
    let set: FileSet
    try {
      set = await expandFiles(files)
    } catch (e) {
      result.errors.push(e instanceof ImportError ? e.code : 'broken')
      return result
    }
    const names = [...set.keys()]
    const fromArchive = files.some((f) => isArchive(f.name))
    // несколько отдельных файлов моделей — несколько моделей; архив — одна модель
    let mains = fromArchive ? [] : names.filter((n) => isModelFile(n))
    if (mains.length <= 1) {
      const main = pickMainFile(names)
      mains = main ? [main] : []
    }
    if (!mains.length) {
      result.errors.push('no_model')
      return result
    }
    for (const main of mains) {
      try {
        const { object } = await loadFromFiles(set, main)
        const template = this.models.templateFromObject(object, 0)
        // сохраняем только нужное этой модели: её файл и всё, что не является другой моделью
        const own: FileSet = new Map([...set].filter(([n]) => n === main || !isModelFile(n)))
        const sourceName = fromArchive && files.length === 1 && /^scene\./i.test(main.split('/').pop() ?? '') ? files[0].name : main
        const model = {
          id: `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name: titleFromFile(sourceName),
          main,
          tilt: 0,
          thumb: renderThumb(template.root),
          files: own,
          added: Date.now(),
        }
        this.list.push(model)
        this.models.registerUser(model, template)
        this.persist(model)
        result.added.push(model)
      } catch (e) {
        result.errors.push(e instanceof ImportError ? e.code : 'broken')
      }
    }
    if (result.added.length) this.onChange()
    return result
  }

  /** Принять модели из файла проекта. Те, что уже есть, не трогаем. Возвращает, сколько моделей не прочиталось. */
  async adopt(incoming: { meta: ProjectModel; files: FileSet }[]): Promise<number> {
    let failed = 0
    for (const { meta, files } of incoming) {
      if (this.list.some((m) => m.id === meta.id)) continue
      const model = { id: meta.id, name: meta.name, main: meta.main, tilt: meta.tilt, thumb: '', files, added: Date.now() }
      this.models.registerUser(model)
      try {
        const t = await this.models.get({ kind: 'user', key: meta.id })
        model.thumb = renderThumb(t.root)
      } catch {
        this.models.removeUser(meta.id)
        failed++
        continue
      }
      this.list.push(model)
      this.persist(model)
    }
    this.onChange()
    return failed
  }

  remove(id: string): void {
    this.list = this.list.filter((m) => m.id !== id)
    this.models.removeUser(id)
    void tx('readwrite', (s) => s.delete(id))
    this.onChange()
  }

  /** Повернуть модель «на другой бок» и обновить превью. */
  async tilt(id: string): Promise<void> {
    const m = this.list.find((q) => q.id === id)
    if (!m) return
    m.tilt = (m.tilt + 1) % 4
    this.models.registerUser(m)
    try {
      const t = await this.models.get({ kind: 'user', key: id })
      m.thumb = renderThumb(t.root) || m.thumb
    } catch {
      // модель не читается — оставляем прежнее превью
    }
    this.persist(m)
    this.onChange()
  }
}
