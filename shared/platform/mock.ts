// Заглушка SDK для запуска вне Яндекс Игр (локально, в превью, на скриншотах).
// Показывает плашку вместо рекламы, «облако» хранит в localStorage. Язык: ?lang=ru|en|tr.

import type { AdvCallbacks, YPurchase, YSDK } from './types'

function overlay(text: string, ms: number, done: () => void) {
  const el = document.createElement('div')
  el.textContent = text
  el.setAttribute('data-mock-ad', '')
  el.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,.85);color:#fff;font:600 22px system-ui,sans-serif;text-align:center;padding:24px'
  document.body.appendChild(el)
  setTimeout(() => {
    el.remove()
    done()
  }, ms)
}

export function createMockSdk(): YSDK {
  const params = new URLSearchParams(location.search)
  const adMs = Number(params.get('adms') ?? 1200)
  const cloudKey = 'mock-cloud'
  const purchases: YPurchase[] = []
  const play = (cb: AdvCallbacks, rewarded: boolean) => {
    cb.onOpen?.()
    overlay(rewarded ? 'Тестовая реклама за награду' : 'Тестовая реклама', adMs, () => {
      if (rewarded) cb.onRewarded?.()
      cb.onClose?.(true)
    })
  }
  return {
    environment: { i18n: { lang: params.get('lang') ?? navigator.language.slice(0, 2) } },
    deviceInfo: { type: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop' },
    adv: {
      showFullscreenAdv: ({ callbacks }) => play(callbacks, false),
      showRewardedVideo: ({ callbacks }) => play(callbacks, true),
    },
    features: {
      LoadingAPI: { ready: () => console.info('[mock-sdk] LoadingAPI.ready') },
      GameplayAPI: { start: () => console.info('[mock-sdk] GameplayAPI.start'), stop: () => console.info('[mock-sdk] GameplayAPI.stop') },
    },
    getPlayer: async () => ({
      getData: async () => JSON.parse(localStorage.getItem(cloudKey) ?? '{}'),
      setData: async (data) => localStorage.setItem(cloudKey, JSON.stringify(data)),
    }),
    payments: {
      purchase: async ({ id }) => {
        const p = { productID: id, purchaseToken: `mock-${id}-${purchases.length}` }
        purchases.push(p)
        return p
      },
      getPurchases: async () => purchases.slice(),
      consumePurchase: async (token) => {
        const i = purchases.findIndex((p) => p.purchaseToken === token)
        if (i >= 0) purchases.splice(i, 1)
      },
      getCatalog: async () => [],
    },
    leaderboards: { setScore: async (name, score) => console.info('[mock-sdk] setScore', name, score) },
    on: () => () => {},
  }
}
