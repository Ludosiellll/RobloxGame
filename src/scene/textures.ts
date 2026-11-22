// Покрытия пола, нарисованные кодом в светлых тонах: цвет комнаты умножается на рисунок.

import * as THREE from 'three'
import type { FloorKind } from '../core/doc'

/** Сколько метров занимает один повтор рисунка. */
export const FLOOR_TILE_M: Record<FloorKind, number> = { planks: 2.4, tile: 1.2, plain: 2, carpet: 1 }

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function draw(kind: FloorKind): HTMLCanvasElement {
  const S = 512
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')!
  const r = rng(kind.length * 977 + 13)
  ctx.fillStyle = '#f2f2f2'
  ctx.fillRect(0, 0, S, S)
  if (kind === 'planks') {
    // 12 рядов досок по 20 см, длина доски 1,2 м, стыки со сдвигом
    const rows = 12
    const rowH = S / rows
    for (let i = 0; i < rows; i++) {
      const shift = (i % 3) * (S / 6) + r() * 30
      for (let k = -1; k < 3; k++) {
        const x = k * (S / 2) + shift
        const tone = 222 + Math.floor(r() * 30)
        ctx.fillStyle = `rgb(${tone},${tone},${tone})`
        ctx.fillRect(x, i * rowH, S / 2, rowH)
        // волокна
        ctx.globalAlpha = 0.07
        ctx.strokeStyle = '#000'
        for (let g = 0; g < 5; g++) {
          const y = i * rowH + 4 + r() * (rowH - 8)
          ctx.beginPath()
          ctx.moveTo(x + 4, y)
          ctx.bezierCurveTo(x + S / 6, y + r() * 4 - 2, x + S / 3, y + r() * 4 - 2, x + S / 2 - 4, y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.fillRect(x, i * rowH, 1.5, rowH)
      }
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      ctx.fillRect(0, i * rowH, S, 1.5)
    }
  } else if (kind === 'tile') {
    const n = 2
    const t = S / n
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const tone = 232 + Math.floor(r() * 18)
        ctx.fillStyle = `rgb(${tone},${tone},${tone})`
        ctx.fillRect(i * t, j * t, t, t)
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    for (let i = 0; i <= n; i++) {
      ctx.fillRect(i * t - 2, 0, 4, S)
      ctx.fillRect(0, i * t - 2, S, 4)
    }
  } else {
    const dots = kind === 'carpet' ? 26000 : 5000
    const alpha = kind === 'carpet' ? 0.1 : 0.035
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 1.6})`
      const s = kind === 'carpet' ? 2 : 3
      ctx.fillRect(r() * S, r() * S, s, s)
    }
  }
  return c
}

const cache = new Map<FloorKind, HTMLCanvasElement>()

export function floorTexture(kind: FloorKind, w: number, d: number, anisotropy: number): THREE.CanvasTexture {
  let canvas = cache.get(kind)
  if (!canvas) {
    canvas = draw(kind)
    cache.set(kind, canvas)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(w / FLOOR_TILE_M[kind], d / FLOOR_TILE_M[kind])
  tex.anisotropy = anisotropy
  return tex
}
