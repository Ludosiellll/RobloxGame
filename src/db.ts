// Хранилище в браузере (IndexedDB): свои модели и картинки планов.

const DB = 'maket-db'
export type StoreName = 'models' | 'images'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of ['models', 'images'] as StoreName[]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Одна операция с хранилищем. Если оно недоступно (закрытый режим, запрет) — возвращает null. */
export async function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await open()
    try {
      return await new Promise((resolve, reject) => {
        const req = run(db.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}
