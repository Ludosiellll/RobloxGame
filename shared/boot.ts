// Запуск игры: подключение к Яндекс Играм (или заглушке вне платформы) и создание слоя платформы.

import type { Lang } from './platform/logic'
import { connectYandex, createPlatform, type Platform } from './platform/platform'
import { createMockSdk } from './platform/mock'

declare global {
  interface Window {
    __platform?: Platform
    __gameReady?: boolean
  }
}

export async function boot(options: { saveKey: string; languages: readonly Lang[]; adGapMs?: number }): Promise<Platform> {
  // На Яндекс Играх /sdk.js всегда есть. Если его нет совсем — мы не на платформе, берём заглушку.
  // Если скрипт есть, но init не ответил, работаем без SDK: заглушку в бою не показываем.
  const onPlatform = typeof window.YaGames !== 'undefined'
  const sdk = onPlatform ? await connectYandex() : createMockSdk()
  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch {
    storage = null
  }
  const platform = createPlatform({ sdk, storage, saveKey: options.saveKey, languages: options.languages, adGapMs: options.adGapMs })
  window.__platform = platform
  return platform
}

// Вызвать, когда первый экран готов к игре: сообщает Яндексу «загрузка завершена».
export function markReady(platform: Platform) {
  platform.ready()
  window.__gameReady = true
}
