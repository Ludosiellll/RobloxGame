// Обставить комнату: готовые наборы мебели и расстановка вдоль стен без наложений.
// Предмет при повороте 0° смотрит на +z; у северной стены (меньший z) он стоит спиной к ней.

import { KIT_BY_KEY } from './catalog'
import { dropItems, type Doc, type Item, type Opening, type Room } from './doc'
import { roomAt } from './walls'

export type RoomKind = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'office'
type Edge = 'n' | 's' | 'w' | 'e'

/** Одна вещь набора и то, как её поставить. */
export interface Pick {
  /** ключ каталога; несколько — пробуем по очереди, пока один не поместится */
  key: string | string[]
  /**
   * wall — спиной к свободной стене; opposite — к стене напротив предмета ref; beside — рядом с ref у той же стены;
   * above — на стене над ref (на высоте y); near — рядом с ref с указанной стороны; center — в середине комнаты;
   * on — на предмете ref; corner — в свободный угол.
   */
  place: 'wall' | 'opposite' | 'beside' | 'above' | 'near' | 'center' | 'on' | 'corner'
  /** номер вещи в наборе, к которой привязана эта */
  ref?: number
  /** beside: с какой стороны вдоль стены, −1 или 1 */
  side?: -1 | 1
  /** wall: start — встать в угол, чтобы от него пошёл ряд (кухня) */
  anchor?: 'start'
  /** near: с какой стороны от ref, если смотреть как он */
  dir?: 'front' | 'back' | 'left' | 'right'
  gap?: number
  /** near: сдвиг вбок, м; on: сдвиг вперёд (минус — к стене) */
  shift?: number
  /** near: повернуть лицом к ref */
  facing?: boolean
  /** высота над полом для above */
  y?: number
  colors?: Record<string, string>
}

export interface Furnished {
  key: string
  x: number
  z: number
  y: number
  rot: number
  lift: boolean
  colors: Record<string, string>
}

export interface BusyBox {
  x0: number
  x1: number
  z0: number
  z1: number
}

type Size = { w: number; d: number; h: number }

const SOFA = { carpet: '#5f7f78' }
const RUG = { carpet: '#d9d2c3', carpetDarker: '#b7ad98' }

export const PRESETS: Record<RoomKind, Pick[]> = {
  living: [
    { key: ['rugRectangle', 'rugSquare'], place: 'center', colors: RUG },
    { key: ['loungeSofa', 'loungeChair'], place: 'wall', colors: SOFA },
    { key: ['cabinetTelevision', 'sideTable'], place: 'opposite', ref: 1 },
    { key: 'televisionModern', place: 'on', ref: 2 },
    { key: ['tableCoffee', 'tableCoffeeSquare'], place: 'near', ref: 1, dir: 'front', gap: 0.45 },
    { key: 'lampRoundFloor', place: 'beside', ref: 1, side: 1 },
    { key: 'loungeChair', place: 'wall', colors: { carpet: '#d9a441' } },
    { key: ['bookcaseOpen', 'bookcaseOpenLow'], place: 'wall' },
    { key: 'pottedPlant', place: 'corner' },
    { key: 'books', place: 'on', ref: 4 },
  ],
  bedroom: [
    { key: ['rugRound', 'rugDoormat'], place: 'center', colors: { carpet: '#c9b8a6', carpetDarker: '#a8957f' } },
    { key: ['bedDouble', 'bedSingle'], place: 'wall', colors: { carpet: '#7c8fa6' } },
    { key: 'cabinetBedDrawer', place: 'beside', ref: 1, side: -1 },
    { key: 'cabinetBedDrawer', place: 'beside', ref: 1, side: 1 },
    { key: 'lampRoundTable', place: 'on', ref: 2 },
    { key: ['bookcaseClosedWide', 'bookcaseClosedDoors'], place: 'opposite', ref: 1 },
    { key: 'benchCushionLow', place: 'near', ref: 1, dir: 'front', gap: 0.08 },
    { key: 'pottedPlant', place: 'corner' },
  ],
  kitchen: [
    { key: ['kitchenFridge', 'kitchenFridgeSmall'], place: 'wall', anchor: 'start' },
    { key: 'kitchenSink', place: 'beside', ref: 0, side: 1, gap: 0.03 },
    { key: 'kitchenStoveElectric', place: 'beside', ref: 1, side: 1, gap: 0.03 },
    { key: 'kitchenCabinetDrawer', place: 'beside', ref: 2, side: 1, gap: 0.03 },
    { key: 'kitchenCabinet', place: 'beside', ref: 3, side: 1, gap: 0.03 },
    { key: 'hoodModern', place: 'above', ref: 2, y: 1.62 },
    { key: 'kitchenCabinetUpper', place: 'above', ref: 1, y: 1.5 },
    { key: 'kitchenCabinetUpperDouble', place: 'above', ref: 3, y: 1.5 },
    { key: 'kitchenMicrowave', place: 'on', ref: 3 },
    { key: 'table', place: 'center' },
    { key: 'chairCushion', place: 'near', ref: 9, dir: 'front', gap: 0.05, shift: -0.42, facing: true },
    { key: 'chairCushion', place: 'near', ref: 9, dir: 'front', gap: 0.05, shift: 0.42, facing: true },
    { key: 'chairCushion', place: 'near', ref: 9, dir: 'back', gap: 0.05, shift: -0.42, facing: true },
    { key: 'chairCushion', place: 'near', ref: 9, dir: 'back', gap: 0.05, shift: 0.42, facing: true },
  ],
  bath: [
    { key: ['bathtub', 'shower'], place: 'wall' },
    { key: ['bathroomSinkSquare', 'bathroomSink'], place: 'wall' },
    { key: ['toilet', 'toiletSquare'], place: 'wall' },
    { key: ['washer'], place: 'wall' },
    { key: 'trashcan', place: 'corner' },
    { key: 'rugDoormat', place: 'center', colors: { carpet: '#cfd8d6', carpetDarker: '#aebbb8' } },
  ],
  office: [
    { key: ['rugSquare', 'rugDoormat'], place: 'center', colors: { carpet: '#cdd3cf', carpetDarker: '#a9b3ad' } },
    { key: 'desk', place: 'wall' },
    { key: 'chairDesk', place: 'near', ref: 1, dir: 'front', gap: 0.05, facing: true },
    { key: 'computerScreen', place: 'on', ref: 1, shift: -0.22 },
    { key: 'computerKeyboard', place: 'on', ref: 1, shift: 0.14 },
    { key: 'lampSquareFloor', place: 'beside', ref: 1, side: -1 },
    { key: ['bookcaseOpen', 'bookcaseOpenLow'], place: 'wall' },
    { key: 'loungeChair', place: 'wall', colors: SOFA },
    { key: 'pottedPlant', place: 'corner' },
  ],
}

/** отступ мебели от оси стены: половина толщины стены и зазор */
const INSET = 0.08
const DOOR_DEPTH = 0.9
/** выше этого предмет закрывает окно (подоконник на 0,9 м; мойка со смесителем под окном — обычное дело) */
const TALL = 1.25
const r2 = (v: number) => Math.round(v * 100) / 100
/** между предметами остаётся хотя бы такой зазор — тогда округление до сантиметра не сдвинет их друг на друга */
const GAP = 0.02
const hits = (a: BusyBox, b: BusyBox) => a.x0 < b.x1 + GAP && b.x0 < a.x1 + GAP && a.z0 < b.z1 + GAP && b.z0 < a.z1 + GAP

const EDGE_ROT: Record<Edge, number> = { n: 0, w: 90, s: 180, e: 270 }
const OPPOSITE: Record<Edge, Edge> = { n: 's', s: 'n', w: 'e', e: 'w' }
const EDGES: Edge[] = ['n', 'w', 'e', 's']
/** куда смотрит предмет при таком повороте */
const FRONT: Record<number, [number, number]> = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }
/** где у него правый бок */
const RIGHT: Record<number, [number, number]> = { 0: [1, 0], 90: [0, -1], 180: [-1, 0], 270: [0, 1] }

interface Spot {
  key: string
  size: Size
  x: number
  z: number
  y: number
  rot: number
  /** стена, у которой стоит, и место вдоль неё */
  edge: Edge | null
  t: number
}

/** Расставить набор в комнате. busy — места, занятые мебелью, которая уже стоит. */
export function furnish(room: Room, openings: Opening[], busy: BusyBox[], picks: Pick[], sizeOf: (key: string) => Size | null): { items: Furnished[]; skipped: number } {
  const B = { x0: room.x - room.w / 2 + INSET, x1: room.x + room.w / 2 - INSET, z0: room.z - room.d / 2 + INSET, z1: room.z + room.d / 2 - INSET }
  const horizontal = (e: Edge) => e === 'n' || e === 's'
  const span = (e: Edge): [number, number] => (horizontal(e) ? [B.x0, B.x1] : [B.z0, B.z1])
  /** место у стены: t — середина вдоль стены, a — размер вдоль, dep — глубина от стены */
  const wallBox = (e: Edge, t: number, a: number, dep: number): BusyBox =>
    e === 'n' ? { x0: t - a / 2, x1: t + a / 2, z0: B.z0, z1: B.z0 + dep } : e === 's' ? { x0: t - a / 2, x1: t + a / 2, z0: B.z1 - dep, z1: B.z1 } : e === 'w' ? { x0: B.x0, x1: B.x0 + dep, z0: t - a / 2, z1: t + a / 2 } : { x0: B.x1 - dep, x1: B.x1, z0: t - a / 2, z1: t + a / 2 }

  // двери и окна этой комнаты по стенам
  const doors: Record<Edge, number[]> = { n: [], s: [], w: [], e: [] }
  const windows: Record<Edge, [number, number][]> = { n: [], s: [], w: [], e: [] }
  const taken: BusyBox[] = [...busy]
  for (const o of openings) {
    let edge: Edge | null = null
    if (o.axis === 'x' && Math.abs(o.x - room.x) <= room.w / 2) edge = Math.abs(o.z - (room.z - room.d / 2)) < 0.08 ? 'n' : Math.abs(o.z - (room.z + room.d / 2)) < 0.08 ? 's' : null
    if (o.axis === 'z' && Math.abs(o.z - room.z) <= room.d / 2) edge = Math.abs(o.x - (room.x - room.w / 2)) < 0.08 ? 'w' : Math.abs(o.x - (room.x + room.w / 2)) < 0.08 ? 'e' : null
    if (!edge) continue
    const at = horizontal(edge) ? o.x : o.z
    if (o.kind === 'door') {
      doors[edge].push(at)
      // перед дверью оставляем проход
      taken.push(wallBox(edge, at, o.width + 0.2, DOOR_DEPTH))
    } else windows[edge].push([at - o.width / 2, at + o.width / 2])
  }

  const inside = (b: BusyBox) => b.x0 >= B.x0 - 0.001 && b.x1 <= B.x1 + 0.001 && b.z0 >= B.z0 - 0.001 && b.z1 <= B.z1 + 0.001
  const free = (b: BusyBox) => inside(b) && !taken.some((q) => hits(b, q))
  const boxAround = (x: number, z: number, size: Size, rot: number): BusyBox => {
    const turned = rot === 90 || rot === 270
    const hw = (turned ? size.d : size.w) / 2
    const hd = (turned ? size.w : size.d) / 2
    return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd }
  }
  const centerOf = (b: BusyBox) => ({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 })

  /** Свободное место у стены, ближайшее к желаемому t0. */
  const slot = (e: Edge, size: Size, t0: number): number | null => {
    const [lo, hi] = span(e)
    const a = size.w
    if (hi - lo < a) return null
    const clampT = (t: number) => Math.min(hi - a / 2, Math.max(lo + a / 2, t))
    const ok = (t: number) => {
      if (!free(wallBox(e, t, a, size.d))) return false
      return size.h <= TALL || !windows[e].some(([w0, w1]) => t - a / 2 < w1 && w0 < t + a / 2)
    }
    const start = clampT(t0)
    if (ok(start)) return start
    for (let k = 1; k * 0.1 <= hi - lo; k++) {
      for (const t of [start + k * 0.1, start - k * 0.1]) if (t >= lo + a / 2 - 1e-6 && t <= hi - a / 2 + 1e-6 && ok(t)) return t
    }
    return null
  }

  const spots: (Spot | null)[] = []
  const used: Record<Edge, number> = { n: 0, s: 0, w: 0, e: 0 }
  /** насколько мебель у каждой стены выступает в комнату */
  const depth: Record<Edge, number> = { n: 0, s: 0, w: 0, e: 0 }
  const put = (key: string, size: Size, e: Edge, t: number, y = 0): Spot => {
    const c = centerOf(wallBox(e, t, size.w, size.d))
    if (y === 0) {
      taken.push(wallBox(e, t, size.w, size.d))
      used[e]++
      depth[e] = Math.max(depth[e], size.d)
    }
    return { key, size, x: c.x, z: c.z, y, rot: EDGE_ROT[e], edge: e, t }
  }

  const place = (p: Pick, key: string, size: Size): Spot | null => {
    const ref = p.ref !== undefined ? spots[p.ref] : null
    if (p.ref !== undefined && !ref) return null
    const flat = size.h < 0.05

    if (p.place === 'wall' || (p.place === 'opposite' && ref && !ref.edge)) {
      let best: { e: Edge; t: number; score: number } | null = null
      for (const e of EDGES) {
        const [lo, hi] = span(e)
        // обычно встаём посередине стены; ряд начинается от угла
        const targets = p.anchor === 'start' ? [lo + size.w / 2, hi - size.w / 2] : [(lo + hi) / 2]
        for (const target of targets) {
          const t = slot(e, size, target)
          if (t === null) continue
          // длинная стена без двери лучше; главный предмет хорошо смотрится напротив входа; мебель расходится по разным стенам
          const score = hi - lo - (doors[e].length ? 1.5 : 0) + (doors[OPPOSITE[e]].length ? 0.6 : 0) - Math.abs(t - target) - used[e] * 0.8
          if (!best || score > best.score + 1e-9) best = { e, t, score }
        }
      }
      return best ? put(key, size, best.e, best.t) : null
    }

    if (p.place === 'opposite' && ref?.edge) {
      const e = OPPOSITE[ref.edge]
      const t = slot(e, size, ref.t)
      if (t !== null) return put(key, size, e, t)
      return place({ ...p, place: 'wall', ref: undefined }, key, size)
    }

    if (p.place === 'beside' && ref?.edge) {
      const e = ref.edge
      for (const side of [p.side ?? 1, -(p.side ?? 1)]) {
        const t = ref.t + side * (ref.size.w / 2 + size.w / 2 + (p.gap ?? 0.05))
        const box = wallBox(e, t, size.w, size.d)
        const blocksWindow = size.h > TALL && windows[e].some(([w0, w1]) => t - size.w / 2 < w1 && w0 < t + size.w / 2)
        if (free(box) && !blocksWindow) return put(key, size, e, t)
      }
      return null
    }

    if (p.place === 'above' && ref?.edge) {
      // навесное не вешаем поверх окна
      const e = ref.edge
      if (windows[e].some(([w0, w1]) => ref.t - size.w / 2 < w1 && w0 < ref.t + size.w / 2)) return null
      return put(key, size, e, ref.t, p.y ?? 1.5)
    }

    if (p.place === 'on' && ref) {
      const [fx, fz] = FRONT[ref.rot]
      const s = p.shift ?? 0
      return { key, size, x: ref.x + fx * s, z: ref.z + fz * s, y: ref.y + ref.size.h, rot: ref.rot, edge: null, t: 0 }
    }

    if (p.place === 'near' && ref) {
      const [fx, fz] = FRONT[ref.rot]
      const [rx, rz] = RIGHT[ref.rot]
      const dir = p.dir ?? 'front'
      const sign = dir === 'front' || dir === 'right' ? 1 : -1
      const lengthwise = dir === 'front' || dir === 'back'
      const [dx, dz] = lengthwise ? [fx * sign, fz * sign] : [rx * sign, rz * sign]
      const [sx, sz] = lengthwise ? [rx, rz] : [fx, fz]
      // лицом к опорному — значит смотреть навстречу направлению, в котором от него отошли
      const rot = p.facing ? [0, 90, 180, 270].find((r) => FRONT[r][0] === -dx && FRONT[r][1] === -dz)! : ref.rot
      const own = rot === ref.rot || rot === (ref.rot + 180) % 360 ? (lengthwise ? size.d : size.w) : lengthwise ? size.w : size.d
      const dist = (lengthwise ? ref.size.d : ref.size.w) / 2 + (p.gap ?? 0.1) + own / 2
      const x = ref.x + dx * dist + sx * (p.shift ?? 0)
      const z = ref.z + dz * dist + sz * (p.shift ?? 0)
      const box = boxAround(x, z, size, rot)
      if (!free(box)) return null
      taken.push(box)
      return { key, size, x, z, y: 0, rot, edge: null, t: 0 }
    }

    if (p.place === 'center') {
      // длинной стороной вдоль длинной стороны комнаты
      const rot = room.d > room.w === size.w > size.d ? 90 : 0
      // ковёр ложится в середину комнаты, стол — в середину свободного места между мебелью у стен
      const x = flat ? (B.x0 + B.x1) / 2 : (B.x0 + depth.w + B.x1 - depth.e) / 2
      const z = flat ? (B.z0 + B.z1) / 2 : (B.z0 + depth.n + B.z1 - depth.s) / 2
      if (flat) return inside(boxAround(x, z, size, rot)) ? { key, size, x, z, y: 0, rot, edge: null, t: 0 } : null
      // если середина занята (проход к двери, мебель) — ближайшее свободное место рядом с ней
      let best: { x: number; z: number; far: number } | null = null
      for (let i = -10; i <= 10; i++) {
        for (let j = -10; j <= 10; j++) {
          const far = Math.hypot(i, j)
          if (best && far >= best.far) continue
          if (free(boxAround(x + i * 0.1, z + j * 0.1, size, rot))) best = { x: x + i * 0.1, z: z + j * 0.1, far }
        }
      }
      if (!best) return null
      taken.push(boxAround(best.x, best.z, size, rot))
      return { key, size, x: best.x, z: best.z, y: 0, rot, edge: null, t: 0 }
    }

    if (p.place === 'corner') {
      const corners: [Edge, 'lo' | 'hi'][] = [['n', 'lo'], ['n', 'hi'], ['s', 'lo'], ['s', 'hi']]
      for (const [e, end] of corners) {
        const [lo, hi] = span(e)
        const t = end === 'lo' ? lo + size.w / 2 : hi - size.w / 2
        const blocksWindow = size.h > TALL && windows[e].some(([w0, w1]) => t - size.w / 2 < w1 && w0 < t + size.w / 2)
        if (free(wallBox(e, t, size.w, size.d)) && !blocksWindow) return put(key, size, e, t)
      }
      return null
    }
    return null
  }

  let skipped = 0
  const items: Furnished[] = []
  for (const p of picks) {
    let spot: Spot | null = null
    for (const key of Array.isArray(p.key) ? p.key : [p.key]) {
      const size = sizeOf(key)
      if (!size) continue
      spot = place(p, key, size)
      if (spot) break
    }
    spots.push(spot)
    if (!spot) {
      skipped++
      continue
    }
    items.push({ key: spot.key, x: r2(spot.x), z: r2(spot.z), y: r2(spot.y), rot: spot.rot, lift: p.place === 'above', colors: { ...(p.colors ?? {}) } })
  }
  return { items, skipped }
}

/**
 * Обставить комнату проекта набором. replace — убрать мебель, которая в ней уже стоит; иначе новая встаёт вокруг неё.
 * sizeOf — размеры уже стоящих предметов (для своих моделей их знает только сцена).
 */
export function furnishRoom(
  doc: Doc,
  roomId: string,
  kind: RoomKind,
  opts: { replace: boolean; sizeOf: (item: Item) => Size | null; newId: () => string; sizeOfKey?: (key: string) => Size | null },
): { doc: Doc; placed: number; skipped: number } {
  const room = doc.rooms.find((r) => r.id === roomId)
  if (!room) return { doc, placed: 0, skipped: 0 }
  const inRoom = (i: Item) => roomAt(doc.rooms, i.x, i.z)?.id === roomId
  const base = opts.replace ? dropItems(doc, inRoom) : doc
  const busy: BusyBox[] = base.items.filter((i) => inRoom(i) && i.y < 0.3).flatMap((i) => {
    const s = opts.sizeOf(i) ?? { w: 0.6, d: 0.6, h: 0.6 }
    if (s.h < 0.05) return []
    const turned = Math.round(i.rot / 90) % 2 !== 0
    const hw = ((turned ? s.d : s.w) * i.scale) / 2
    const hd = ((turned ? s.w : s.d) * i.scale) / 2
    return [{ x0: i.x - hw, x1: i.x + hw, z0: i.z - hd, z1: i.z + hd }]
  })
  const sizeOfKey = opts.sizeOfKey ?? ((key: string) => KIT_SIZES(key))
  const res = furnish(room, doc.openings, busy, PRESETS[kind], sizeOfKey)
  const added: Item[] = res.items.map((f) => ({ id: opts.newId(), src: { kind: 'kit', key: f.key }, x: f.x, z: f.z, y: f.y, rot: f.rot, scale: 1, lift: f.lift, colors: f.colors }))
  return { doc: { ...base, items: [...base.items, ...added] }, placed: added.length, skipped: res.skipped }
}

const KIT_SIZES = (key: string): Size | null => KIT_BY_KEY.get(key) ?? null
