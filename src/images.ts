// Картинки планов квартиры: подготовка (уменьшение) и хранение в браузере.

import { tx } from './db'

interface Row {
  id: string
  blob: Blob
  /** когда положили; у картинок из первых версий этого поля нет */
  added?: number
}

const WEEK = 7 * 24 * 60 * 60 * 1000

/** Картинки держим и в памяти: так подложка работает, даже когда хранилище браузера недоступно. */
export class ImageStore {
  private readonly cache = new Map<string, Blob>()

  /** Сохранить картинку под новым ключом. Запись в хранилище не держит интерфейс дольше полутора секунд. */
  async put(blob: Blob): Promise<string> {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    this.cache.set(id, blob)
    const written = tx('images', 'readwrite', (s) => s.put({ id, blob, added: Date.now() } satisfies Row))
    await Promise.race([written, new Promise((r) => setTimeout(r, 1500))])
    return id
  }

  async get(id: string): Promise<Blob | null> {
    const cached = this.cache.get(id)
    if (cached) return cached
    const row = await tx<Row | undefined>('images', 'readonly', (s) => s.get(id))
    if (row?.blob) this.cache.set(id, row.blob)
    return row?.blob ?? null
  }

  /**
   * Убрать из хранилища картинки, на которые проект не ссылается, если они старше maxAgeMs.
   * Недавние оставляем: к ним может вернуть «Отменить» — здесь или в другой открытой вкладке.
   */
  async keepOnly(id: string | null, maxAgeMs = WEEK): Promise<void> {
    const rows = (await tx<Row[]>('images', 'readonly', (s) => s.getAll())) ?? []
    const now = Date.now()
    for (const row of rows) {
      if (row.id !== id && now - (row.added ?? now) >= maxAgeMs) await tx('images', 'readwrite', (s) => s.delete(row.id))
    }
  }
}

/** Привести картинку к разумному размеру. Возвращает null, если файл не читается как картинка. */
export async function prepareImage(file: Blob, max = 2048): Promise<{ blob: Blob; ratio: number } | null> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) return null
  // прозрачный фон плана становится белой бумагой
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, w, h)
  g.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
  return blob ? { blob, ratio: h / w } : null
}
