import type { Lang } from './platform/logic'

export type Dict = Record<string, string>

export function createI18n(dicts: Partial<Record<Lang, Dict>> & { ru: Dict }, lang: Lang) {
  const main = dicts[lang] ?? dicts.ru
  return (key: string, vars: Record<string, string | number> = {}): string => {
    const raw = main[key] ?? dicts.ru[key] ?? key
    return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
  }
}
