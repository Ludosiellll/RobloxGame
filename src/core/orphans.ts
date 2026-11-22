// Предметы, оставшиеся без модели: её нет в каталоге или среди своих моделей.

import type { ItemSrc } from './doc'

export interface ModelsKnown {
  kit: (key: string) => boolean
  user: (key: string) => boolean
  /** свои модели уже прочитаны из хранилища браузера */
  userReady: boolean
}

/** Пока свои модели не прочитаны из хранилища, судить о них нельзя: предмет не считается потерянным. */
export function isOrphan(src: ItemSrc, known: ModelsKnown): boolean {
  if (src.kind === 'kit') return !known.kit(src.key)
  return known.userReady && !known.user(src.key)
}
