import { describe, expect, it, vi } from 'vitest'
import { createPlatform } from '@shared/platform/platform'
import type { AdvCallbacks, YSDK } from '@shared/platform/types'

type AdScript = (cb: AdvCallbacks) => void

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: m,
  }
}

function fakeSdk(opts: { fullscreen?: AdScript; rewarded?: AdScript; cloud?: Record<string, unknown> } = {}) {
  const cloud = { data: opts.cloud ?? {} }
  const handlers = new Map<string, () => void>()
  const calls = { ready: 0, start: 0, stop: 0, setData: [] as Array<Record<string, unknown>> }
  const sdk: YSDK = {
    environment: { i18n: { lang: 'ru' } },
    deviceInfo: { type: 'mobile' },
    adv: {
      showFullscreenAdv: ({ callbacks }) => (opts.fullscreen ?? ((cb) => { cb.onOpen?.(); cb.onClose?.(true) }))(callbacks),
      showRewardedVideo: ({ callbacks }) => (opts.rewarded ?? ((cb) => { cb.onOpen?.(); cb.onRewarded?.(); cb.onClose?.() }))(callbacks),
    },
    features: {
      LoadingAPI: { ready: () => void calls.ready++ },
      GameplayAPI: { start: () => void calls.start++, stop: () => void calls.stop++ },
    },
    getPlayer: async () => ({
      getData: async () => cloud.data,
      setData: async (d: Record<string, unknown>) => { calls.setData.push(d); cloud.data = d },
    }),
    on: (event, cb) => { handlers.set(event, cb); return () => handlers.delete(event) },
  }
  return { sdk, calls, handlers, cloud }
}

function make(sdk: YSDK | null, storage = memoryStorage(), now = () => 1_000_000) {
  return createPlatform({ sdk, storage, now, saveKey: 'test', languages: ['ru', 'en'], adGapMs: 60_000 })
}

describe('platform', () => {
  it('reads language and device from the SDK', async () => {
    const { sdk } = fakeSdk()
    const p = make(sdk)
    expect(p.lang).toBe('ru')
    expect(p.device).toBe('mobile')
    expect(p.onYandex).toBe(true)
  })

  it('ready() reports loading once, gameplay start/stop go to GameplayAPI', () => {
    const { sdk, calls } = fakeSdk()
    const p = make(sdk)
    p.ready()
    p.ready()
    p.gameplayStart()
    p.gameplayStop()
    expect(calls.ready).toBe(1)
    expect(calls.start).toBe(1)
    expect(calls.stop).toBe(1)
  })

  it('rewarded resolves true only when the reward callback fired', async () => {
    const watched = make(fakeSdk().sdk)
    expect(await watched.showRewarded()).toBe(true)
    const skipped = make(fakeSdk({ rewarded: (cb) => { cb.onOpen?.(); cb.onClose?.() } }).sdk)
    expect(await skipped.showRewarded()).toBe(false)
    const broken = make(fakeSdk({ rewarded: (cb) => cb.onError?.(new Error('no fill')) }).sdk)
    expect(await broken.showRewarded()).toBe(false)
  })

  it('pauses the game while an ad is open and resumes after', async () => {
    let close: (() => void) | undefined
    const { sdk } = fakeSdk({ fullscreen: (cb) => { cb.onOpen?.(); close = () => cb.onClose?.(true) } })
    const p = make(sdk)
    const log: string[] = []
    p.onPause(() => log.push('pause'))
    p.onResume(() => log.push('resume'))
    const shown = p.showInterstitial()
    expect(log).toEqual(['pause'])
    expect(p.paused).toBe(true)
    close?.()
    expect(await shown).toBe(true)
    expect(log).toEqual(['pause', 'resume'])
    expect(p.paused).toBe(false)
  })

  it('a platform pause during an ad does not resume early', () => {
    let close: (() => void) | undefined
    const { sdk, handlers } = fakeSdk({ fullscreen: (cb) => { cb.onOpen?.(); close = () => cb.onClose?.(true) } })
    const p = make(sdk)
    void p.showInterstitial()
    handlers.get('game_api_pause')?.()
    close?.()
    expect(p.paused).toBe(true)
    handlers.get('game_api_resume')?.()
    expect(p.paused).toBe(false)
  })

  it('does not call the SDK for a second interstitial inside the gap', async () => {
    let shown = 0
    let t = 1_000_000
    const { sdk } = fakeSdk({ fullscreen: (cb) => { shown++; cb.onOpen?.(); cb.onClose?.(true) } })
    const p = make(sdk, memoryStorage(), () => t)
    expect(await p.showInterstitial()).toBe(true)
    t += 30_000
    expect(await p.showInterstitial()).toBe(false)
    t += 30_000
    expect(await p.showInterstitial()).toBe(true)
    expect(shown).toBe(2)
  })

  it('save writes local storage at once and the cloud after a pause', async () => {
    vi.useFakeTimers()
    try {
      const storage = memoryStorage()
      const { sdk, calls } = fakeSdk()
      const p = make(sdk, storage)
      await p.load({ coins: 0 })
      p.save({ coins: 5 })
      expect(JSON.parse(storage.getItem('test') ?? '{}').coins).toBe(5)
      expect(calls.setData.length).toBe(0)
      p.save({ coins: 6 })
      await vi.advanceTimersByTimeAsync(3_000)
      expect(calls.setData.length).toBe(1)
      expect(calls.setData[0].coins).toBe(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('load takes the newer of cloud and local and fills defaults', async () => {
    const storage = memoryStorage()
    storage.setItem('test', JSON.stringify({ savedAt: 5, coins: 1 }))
    const { sdk } = fakeSdk({ cloud: { savedAt: 9, coins: 3 } })
    const p = make(sdk, storage)
    expect(await p.load({ coins: 0, level: 1 })).toEqual({ savedAt: 9, coins: 3, level: 1 })
  })

  it('works without the SDK: no ads, local saves only', async () => {
    const storage = memoryStorage()
    const p = make(null, storage)
    expect(p.onYandex).toBe(false)
    expect(await p.showRewarded()).toBe(false)
    expect(await p.load({ coins: 2 })).toEqual({ coins: 2 })
    p.save({ coins: 4 })
    expect(JSON.parse(storage.getItem('test') ?? '{}').coins).toBe(4)
  })
})
