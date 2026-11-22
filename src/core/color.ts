// Цвет: тон, насыщенность, светлота и сочетания по цветовому кругу художника (красный — жёлтый — синий).

import type { Doc } from './doc'

export interface Hsl {
  /** тон, градусы 0..360 */
  h: number
  s: number
  l: number
}

export type HarmonyId = 'triad' | 'contrast' | 'analogous' | 'shades'
export interface Harmony {
  id: HarmonyId
  colors: string[]
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const mod360 = (v: number) => ((v % 360) + 360) % 360

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: mod360(h * 60), s, l }
}

export function hslToHex(c: Hsl): string {
  const s = clamp01(c.s)
  const l = clamp01(c.l)
  const k = (n: number) => (n + mod360(c.h) / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  const to = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

// Круг художника: красный, оранжевый, жёлтый, зелёный, синий, фиолетовый идут через равные 60°.
// На экранном круге те же цвета стоят неравномерно, поэтому тон пересчитывается по опорным точкам.
const SCREEN = [0, 30, 60, 120, 240, 280, 360]
const ARTIST = [0, 60, 120, 180, 240, 300, 360]

function remap(v: number, from: number[], to: number[]): number {
  const x = mod360(v)
  for (let i = 0; i < from.length - 1; i++) {
    if (x <= from[i + 1]) return to[i] + ((x - from[i]) / (from[i + 1] - from[i])) * (to[i + 1] - to[i])
  }
  return x
}

/** Повернуть тон на deg градусов по кругу художника, сохранив насыщенность и светлоту. */
export function turnHue(hex: string, deg: number): string {
  const c = hexToHsl(hex)
  return hslToHex({ ...c, h: remap(remap(c.h, SCREEN, ARTIST) + deg, ARTIST, SCREEN) })
}

/** Сочетания для цвета-основы. У серых и белых тона нет — для них остаются только оттенки. */
export function harmonies(hex: string): Harmony[] {
  const c = hexToHsl(hex)
  const shades: Harmony = {
    id: 'shades',
    colors: [hslToHex({ ...c, l: c.l + (c.l > 0.8 ? -0.1 : 0.16) }), hslToHex({ ...c, l: c.l + (c.l < 0.2 ? 0.1 : -0.16) }), hslToHex({ ...c, s: c.s * 0.45, l: c.l + (c.l > 0.5 ? -0.06 : 0.06) })],
  }
  // цветность — разница между самым ярким и самым слабым каналом; у почти белых насыщенность обманчиво велика
  const chroma = c.s * (1 - Math.abs(2 * c.l - 1))
  if (chroma < 0.1) return [shades]
  return [
    { id: 'triad', colors: [turnHue(hex, 120), turnHue(hex, -120)] },
    { id: 'contrast', colors: [turnHue(hex, 150), turnHue(hex, 180), turnHue(hex, 210)] },
    { id: 'analogous', colors: [turnHue(hex, 30), turnHue(hex, -30)] },
    shades,
  ]
}

/** Цвета, уже использованные в проекте: стены, полы, перекрашенные предметы — без повторов. */
export function projectColors(doc: Doc): string[] {
  const all = [doc.walls.color, ...doc.rooms.map((r) => r.floor.color), ...doc.items.flatMap((i) => Object.values(i.colors))]
  return [...new Set(all.map((c) => c.toLowerCase()))]
}
