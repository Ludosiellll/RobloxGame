// Стены из комнат-прямоугольников. Общая грань двух комнат — одна внутренняя стена;
// грань внутри другой комнаты пропадает (комнаты сливаются в одно пространство).

import { LIMITS } from './doc'

export interface Rect {
  id: string
  /** центр */
  x: number
  z: number
  w: number
  d: number
}

export interface WallSeg {
  /** вдоль какой оси идёт стена: 'x' — линия z = c, 'z' — линия x = c */
  axis: 'x' | 'z'
  c: number
  a: number
  b: number
  exterior: boolean
  /** наружная нормаль для внешней стены */
  outward: { x: number; z: number } | null
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4

interface Edge {
  axis: 'x' | 'z'
  c: number
  a: number
  b: number
  sign: 1 | -1
  room: Rect
}

function edgesOf(r: Rect): Edge[] {
  const x0 = r4(r.x - r.w / 2)
  const x1 = r4(r.x + r.w / 2)
  const z0 = r4(r.z - r.d / 2)
  const z1 = r4(r.z + r.d / 2)
  return [
    { axis: 'x', c: z0, a: x0, b: x1, sign: -1, room: r },
    { axis: 'x', c: z1, a: x0, b: x1, sign: 1, room: r },
    { axis: 'z', c: x0, a: z0, b: z1, sign: -1, room: r },
    { axis: 'z', c: x1, a: z0, b: z1, sign: 1, room: r },
  ]
}

function strictlyInside(r: Rect, x: number, z: number): boolean {
  const e = 1e-4
  return x > r.x - r.w / 2 + e && x < r.x + r.w / 2 - e && z > r.z - r.d / 2 + e && z < r.z + r.d / 2 - e
}

export function buildWalls(rooms: Rect[]): WallSeg[] {
  const lines = new Map<string, Edge[]>()
  for (const room of rooms) {
    for (const e of edgesOf(room)) {
      const k = `${e.axis}:${e.c}`
      const list = lines.get(k)
      if (list) list.push(e)
      else lines.set(k, [e])
    }
  }
  const out: WallSeg[] = []
  for (const edges of lines.values()) {
    const { axis, c } = edges[0]
    const cuts = [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort((p, q) => p - q)
    let run: WallSeg | null = null
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i]
      const b = cuts[i + 1]
      const mid = (a + b) / 2
      const cover = edges.filter((e) => e.a <= mid && e.b >= mid)
      const px = axis === 'x' ? mid : c
      const pz = axis === 'x' ? c : mid
      const swallowed = rooms.some((r) => strictlyInside(r, px, pz))
      let seg: WallSeg | null = null
      if (cover.length && !swallowed) {
        const plus = cover.some((e) => e.sign === 1)
        const minus = cover.some((e) => e.sign === -1)
        const exterior = !(plus && minus)
        const sign = plus ? 1 : -1
        seg = { axis, c, a, b, exterior, outward: exterior ? (axis === 'x' ? { x: 0, z: sign } : { x: sign, z: 0 }) : null }
      }
      if (seg && run && run.b === seg.a && run.exterior === seg.exterior && run.outward?.x === seg.outward?.x && run.outward?.z === seg.outward?.z) {
        run.b = seg.b
      } else {
        if (run) out.push(run)
        run = seg
      }
    }
    if (run) out.push(run)
  }
  return out
}

export function roomAt<T extends Rect>(rooms: T[], x: number, z: number): T | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i]
    if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return r
  }
  return null
}

type P = { x: number; z: number }

/** Опускать ли стену, чтобы она не закрывала интерьер от камеры. */
export function wallLowered(seg: WallSeg, cam: P, target: P): boolean {
  const dx = cam.x - target.x
  const dz = cam.z - target.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return false
  const dir = { x: dx / len, z: dz / len }
  // внешняя стена, обращённая к камере, опускается всегда
  if (seg.exterior && seg.outward && seg.outward.x * dir.x + seg.outward.z * dir.z > 0.2) return true
  // остальные — только если стоят поперёк взгляда между камерой и точкой обзора
  const facing = Math.abs(seg.axis === 'x' ? dir.z : dir.x) > 0.35
  if (!facing) return false
  const mid = (seg.a + seg.b) / 2
  const mx = seg.axis === 'x' ? mid : seg.c
  const mz = seg.axis === 'x' ? seg.c : mid
  return (mx - target.x) * dir.x + (mz - target.z) * dir.z > (seg.exterior ? 0.3 : 0)
}

export interface OpeningSnap {
  axis: 'x' | 'z'
  x: number
  z: number
}

/** Ближайшее место на стене для двери или окна шириной width. */
export function snapOpening(walls: WallSeg[], p: P, width: number, maxDist = 0.7, margin = 0.1): OpeningSnap | null {
  let best: { dist: number; snap: OpeningSnap } | null = null
  for (const w of walls) {
    const along = w.axis === 'x' ? p.x : p.z
    const across = w.axis === 'x' ? p.z : p.x
    const dist = Math.abs(across - w.c)
    if (dist > maxDist) continue
    const lo = w.a + width / 2 + margin
    const hi = w.b - width / 2 - margin
    if (hi < lo) continue
    if (along < w.a - maxDist || along > w.b + maxDist) continue
    const t = r4(Math.min(hi, Math.max(lo, along)))
    const snap: OpeningSnap = w.axis === 'x' ? { axis: 'x', x: t, z: w.c } : { axis: 'z', x: w.c, z: t }
    if (!best || dist < best.dist) best = { dist, snap }
  }
  return best ? best.snap : null
}

/** Стена, на которой стоит проём (с допуском), и её границы. */
export function wallForOpening(walls: WallSeg[], o: { axis: 'x' | 'z'; x: number; z: number; width: number }): WallSeg | null {
  const c = o.axis === 'x' ? o.z : o.x
  const t = o.axis === 'x' ? o.x : o.z
  return walls.find((w) => w.axis === o.axis && Math.abs(w.c - c) < 0.03 && t - o.width / 2 >= w.a - 1e-3 && t + o.width / 2 <= w.b + 1e-3) ?? null
}

/** Комната из двух углов, отмеченных мышью: углы встают на сетку и прилипают к краям соседних комнат. ok = false, если она меньше допустимой. */
export function roomFromDrag(a: { x: number; z: number }, b: { x: number; z: number }, others: Rect[], step = 0.05, stick = 0.15): { x: number; z: number; w: number; d: number; ok: boolean } {
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  const grid = (v: number) => Math.round(v / step) * step
  const xs = others.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2])
  const zs = others.flatMap((o) => [o.z - o.d / 2, o.z + o.d / 2])
  const place = (v: number, edges: number[]) => {
    let best = grid(v)
    let bd = stick
    for (const e of edges) {
      const d = Math.abs(e - grid(v))
      if (d < bd) {
        bd = d
        best = e
      }
    }
    return best
  }
  // второй угол не дальше наибольшей комнаты от первого
  const reach = (from: number, to: number) => from + Math.sign(to - from) * Math.min(Math.abs(to - from), LIMITS.roomMax)
  const ax = place(a.x, xs)
  const az = place(a.z, zs)
  const bx = reach(ax, place(b.x, xs))
  const bz = reach(az, place(b.z, zs))
  const width = r3(Math.abs(bx - ax))
  const depth = r3(Math.abs(bz - az))
  return { x: r3((ax + bx) / 2), z: r3((az + bz) / 2), w: width, d: depth, ok: width >= LIMITS.roomMin && depth >= LIMITS.roomMin }
}
