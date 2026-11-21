// Часть Yandex Games SDK v2, которой пользуются игры. Сверено с официальным
// локальным адаптером yastatic.net/s3/games-static/sdk-dev/yandex-dev-adapter.js (2026-11-21).

export interface AdvCallbacks {
  onOpen?: () => void
  onClose?: (wasShown?: boolean) => void
  onError?: (error: unknown) => void
  onOffline?: () => void
  onRewarded?: () => void
}

export interface YPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>
}

export interface YPurchase {
  productID: string
  purchaseToken: string
  developerPayload?: string
}

export interface YProduct {
  id: string
  title: string
  description: string
  price: string
  priceValue: string
  priceCurrencyCode: string
}

export interface YPayments {
  purchase(options: { id: string; developerPayload?: string }): Promise<YPurchase>
  getPurchases(): Promise<YPurchase[]>
  consumePurchase(purchaseToken: string): Promise<void>
  getCatalog(): Promise<YProduct[]>
}

export interface YSDK {
  environment: { i18n: { lang: string; tld?: string }; app?: { id: string } }
  deviceInfo?: { type: string }
  adv: {
    showFullscreenAdv(options: { callbacks: AdvCallbacks }): void
    showRewardedVideo(options: { callbacks: AdvCallbacks }): void
    showBannerAdv?(): Promise<unknown>
    hideBannerAdv?(): Promise<unknown>
  }
  features?: {
    LoadingAPI?: { ready(): void }
    GameplayAPI?: { start(): void; stop(): void }
  }
  getPlayer(options?: { scopes?: boolean }): Promise<YPlayer>
  payments?: YPayments
  getPayments?(): Promise<YPayments>
  leaderboards?: { setScore(name: string, score: number, extraData?: string): Promise<void> }
  getLeaderboards?(): Promise<{ setLeaderboardScore(name: string, score: number, extraData?: string): Promise<void> }>
  feedback?: {
    canReview(): Promise<{ value: boolean; reason?: string }>
    requestReview(): Promise<{ feedbackSent: boolean }>
  }
  on?(event: string, callback: () => void): () => void
  serverTime?(): number
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YSDK> }
  }
}
