// Слой платформы: всё общение игры с Яндекс Играми идёт через этот объект.
// Без SDK (локально, в превью) работает так же, только без рекламы и облака.

import { AdGate, newerSave, pickLang, type Lang } from './logic'
import type { AdvCallbacks, YPayments, YPlayer, YProduct, YPurchase, YSDK } from './types'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface PlatformOptions {
  sdk: YSDK | null
  storage: KeyValueStorage | null
  saveKey: string
  languages: readonly Lang[]
  adGapMs?: number
  cloudDelayMs?: number
  now?: () => number
}

export type Device = 'desktop' | 'mobile' | 'tablet' | 'tv'
type Listener = () => void

export interface Platform {
  readonly lang: Lang
  readonly device: Device
  readonly onYandex: boolean
  readonly paused: boolean
  ready(): void
  gameplayStart(): void
  gameplayStop(): void
  showInterstitial(): Promise<boolean>
  showRewarded(): Promise<boolean>
  load<T extends object>(defaults: T): Promise<T>
  save(data: object): void
  flush(): Promise<void>
  onPause(fn: Listener): void
  onResume(fn: Listener): void
  setPaused(reason: string, on: boolean): void
  purchase(id: string): Promise<YPurchase | null>
  purchases(): Promise<YPurchase[]>
  consume(token: string): Promise<void>
  catalog(): Promise<YProduct[]>
  setScore(board: string, score: number): Promise<void>
  requestReview(): Promise<boolean>
}

function deviceOf(sdk: YSDK | null): Device {
  const t = sdk?.deviceInfo?.type
  if (t === 'mobile' || t === 'tablet' || t === 'tv') return t
  if (t === 'desktop') return t
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return 'mobile'
  return 'desktop'
}

function browserLang(): string {
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') return navigator.language
  return 'ru'
}

export function createPlatform(opts: PlatformOptions): Platform {
  const { sdk, storage, saveKey } = opts
  const now = opts.now ?? (() => Date.now())
  const gate = new AdGate(opts.adGapMs ?? 60_000)
  const cloudDelay = opts.cloudDelayMs ?? 2_500
  const reasons = new Set<string>()
  const pauseFns: Listener[] = []
  const resumeFns: Listener[] = []
  let readySent = false
  let player: YPlayer | null = null
  let pending: Record<string, unknown> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let paymentsP: Promise<YPayments | null> | null = null

  const setPaused = (reason: string, on: boolean) => {
    const was = reasons.size > 0
    if (on) reasons.add(reason)
    else reasons.delete(reason)
    const is = reasons.size > 0
    if (!was && is) pauseFns.forEach((fn) => fn())
    if (was && !is) resumeFns.forEach((fn) => fn())
  }

  sdk?.on?.('game_api_pause', () => setPaused('platform', true))
  sdk?.on?.('game_api_resume', () => setPaused('platform', false))
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => setPaused('hidden', document.visibilityState === 'hidden'))
  }
  // Пункт 1.3 требований: при потере фокуса звук останавливается.
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', () => setPaused('blur', true))
    window.addEventListener('focus', () => setPaused('blur', false))
  }

  const writeLocal = (data: Record<string, unknown>) => {
    try {
      storage?.setItem(saveKey, JSON.stringify(data))
    } catch {
      // приватный режим или переполнено хранилище — облако всё равно попробуем
    }
  }

  const readLocal = (): Record<string, unknown> | null => {
    try {
      const raw = storage?.getItem(saveKey)
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
    } catch {
      return null
    }
  }

  const pushCloud = async () => {
    timer = null
    const data = pending
    pending = null
    if (!data || !player) return
    try {
      await player.setData(data, true)
    } catch {
      // облако недоступно: локальная копия уже записана
    }
  }

  const ad = (kind: 'fullscreen' | 'rewarded'): Promise<boolean> =>
    new Promise((resolve) => {
      if (!sdk) return resolve(false)
      let rewarded = false
      let done = false
      const finish = (result: boolean) => {
        if (done) return
        done = true
        setPaused('ad', false)
        resolve(result)
      }
      const callbacks: AdvCallbacks = {
        onOpen: () => setPaused('ad', true),
        onClose: (wasShown) => finish(kind === 'rewarded' ? rewarded : wasShown !== false),
        onError: () => finish(false),
        onOffline: () => finish(false),
        onRewarded: () => {
          rewarded = true
        },
      }
      try {
        if (kind === 'fullscreen') sdk.adv.showFullscreenAdv({ callbacks })
        else sdk.adv.showRewardedVideo({ callbacks })
      } catch {
        finish(false)
      }
    })

  const payments = (): Promise<YPayments | null> => {
    if (!paymentsP) {
      paymentsP = (async () => {
        if (!sdk) return null
        if (sdk.payments) return sdk.payments
        try {
          return (await sdk.getPayments?.()) ?? null
        } catch {
          return null
        }
      })()
    }
    return paymentsP
  }

  return {
    lang: pickLang(sdk?.environment?.i18n?.lang ?? browserLang(), opts.languages),
    device: deviceOf(sdk),
    onYandex: sdk !== null,
    get paused() {
      return reasons.size > 0
    },
    ready() {
      if (readySent) return
      readySent = true
      sdk?.features?.LoadingAPI?.ready()
    },
    gameplayStart() {
      sdk?.features?.GameplayAPI?.start()
    },
    gameplayStop() {
      sdk?.features?.GameplayAPI?.stop()
    },
    async showInterstitial() {
      if (!sdk || !gate.canShow(now())) return false
      gate.mark(now())
      return ad('fullscreen')
    },
    showRewarded() {
      return ad('rewarded')
    },
    async load<T extends object>(defaults: T): Promise<T> {
      const local = readLocal()
      let cloud: Record<string, unknown> | null = null
      if (sdk) {
        try {
          player = await sdk.getPlayer({ scopes: false })
          cloud = await player.getData()
        } catch {
          player = null
        }
      }
      const best = newerSave(local, cloud) ?? local ?? cloud ?? {}
      return { ...defaults, ...best } as T
    },
    save(data: object) {
      const stamped = { ...(data as Record<string, unknown>), savedAt: now() }
      writeLocal(stamped)
      if (!player) return
      pending = stamped
      if (timer === null) timer = setTimeout(() => void pushCloud(), cloudDelay)
    },
    async flush() {
      if (timer !== null) clearTimeout(timer)
      await pushCloud()
    },
    onPause(fn) {
      pauseFns.push(fn)
    },
    onResume(fn) {
      resumeFns.push(fn)
    },
    setPaused,
    async purchase(id) {
      const p = await payments()
      if (!p) return null
      try {
        return await p.purchase({ id })
      } catch {
        return null
      }
    },
    async purchases() {
      const p = await payments()
      try {
        return p ? await p.getPurchases() : []
      } catch {
        return []
      }
    },
    async consume(token) {
      const p = await payments()
      await p?.consumePurchase(token)
    },
    async catalog() {
      const p = await payments()
      try {
        return p ? await p.getCatalog() : []
      } catch {
        return []
      }
    },
    async setScore(board, score) {
      if (!sdk) return
      try {
        if (sdk.leaderboards) await sdk.leaderboards.setScore(board, score)
        else await (await sdk.getLeaderboards?.())?.setLeaderboardScore(board, score)
      } catch {
        // лидерборд не настроен в консоли или игрок не вошёл
      }
    },
    async requestReview() {
      if (!sdk?.feedback) return false
      try {
        const { value } = await sdk.feedback.canReview()
        if (!value) return false
        return (await sdk.feedback.requestReview()).feedbackSent
      } catch {
        return false
      }
    },
  }
}

// Подключение к Яндекс Играм. На платформе window.YaGames даёт скрипт /sdk.js из index.html.
// Локально его нет — игра работает без SDK.
export async function connectYandex(timeoutMs = 8_000): Promise<YSDK | null> {
  const yg = typeof window !== 'undefined' ? window.YaGames : undefined
  if (!yg) return null
  try {
    return await Promise.race([
      yg.init(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
  } catch {
    return null
  }
}
