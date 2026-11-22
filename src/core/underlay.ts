// Подложка — картинка плана квартиры на коврике. Здесь только расчёты.

import { LIMITS, type Underlay } from './doc'

type P = { x: number; z: number }

const turned = (u: Underlay) => u.rot === 90 || u.rot === 270

/** Сколько места подложка занимает на коврике с учётом поворота. */
export function underlaySize(u: Underlay): { w: number; d: number } {
  const d = u.w * u.ratio
  return turned(u) ? { w: d, d: u.w } : { w: u.w, d }
}

export function underlayContains(u: Underlay, p: P): boolean {
  const s = underlaySize(u)
  return Math.abs(p.x - u.x) <= s.w / 2 && Math.abs(p.z - u.z) <= s.d / 2
}

/** Задать масштаб: между точками a и b на плане должно быть meters метров. Точка a остаётся на месте. */
export function calibrate(u: Underlay, a: P, b: P, meters: number): Underlay {
  const dist = Math.hypot(b.x - a.x, b.z - a.z)
  if (!(dist > 1e-3) || !(meters > 0) || !Number.isFinite(meters)) return u
  const w = Math.min(LIMITS.underMax, Math.max(LIMITS.underMin, (u.w * meters) / dist))
  const k = w / u.w
  return { ...u, w, x: a.x + (u.x - a.x) * k, z: a.z + (u.z - a.z) * k }
}

/** Новая подложка: шириной 10 м, но не длиннее 12 м в глубину, чтобы поместиться на коврик. */
export function defaultUnderlay(image: string, ratio: number, at: P): Underlay {
  const w = Math.min(10, 12 / ratio)
  return { image, x: at.x, z: at.z, w, ratio, rot: 0, opacity: 0.6 }
}
