// Чистые правила слоя платформы: язык, выбор сохранения, интервал рекламы.

export type Lang = 'ru' | 'en' | 'tr'

// Языки, носители которых на Яндекс Играх обычно понимают русский интерфейс.
const RUSSIAN_SPEAKING = new Set(['ru', 'be', 'uk', 'kk', 'uz', 'ky', 'tg', 'hy', 'az', 'ka', 'tk', 'mo'])

export function pickLang(raw: string, supported: readonly Lang[]): Lang {
  const code = (raw || '').slice(0, 2).toLowerCase()
  let wanted: Lang = 'en'
  if (RUSSIAN_SPEAKING.has(code)) wanted = 'ru'
  else if (code === 'tr') wanted = 'tr'
  if (supported.includes(wanted)) return wanted
  if (supported.includes('en')) return 'en'
  return supported[0] ?? 'ru'
}

type Stamped = { savedAt?: unknown }

function stampOf(save: Stamped | null | undefined): number | null {
  if (!save || typeof save !== 'object') return null
  return typeof save.savedAt === 'number' && Number.isFinite(save.savedAt) ? save.savedAt : null
}

export function newerSave<T extends Stamped>(a: T | null | undefined, b: T | null | undefined): T | null {
  const sa = stampOf(a)
  const sb = stampOf(b)
  if (sa === null && sb === null) return null
  if (sa === null) return b ?? null
  if (sb === null) return a ?? null
  return sb > sa ? (b as T) : (a as T)
}

// Наш собственный минимальный интервал между полноэкранной рекламой.
// Яндекс ограничивает частоту и сам, но лишние вызовы SDK нам не нужны.
export class AdGate {
  private last = Number.NEGATIVE_INFINITY
  constructor(private readonly gapMs: number) {}
  canShow(now: number): boolean {
    return now - this.last >= this.gapMs
  }
  mark(now: number): void {
    this.last = now
  }
}
