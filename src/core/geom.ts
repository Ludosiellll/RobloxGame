// Геометрия расстановки: привязка, границы комнаты, какие стены прятать, свет по времени суток.
// Комната стоит центром в начале координат: X — ширина, Z — глубина.

export const snap = (v: number, step: number): number => Math.round(v / step) * step

/** Половины сторон прямоугольника, описанного вокруг повёрнутого основания предмета. */
export function footprint(size: { x: number; z: number }, rotDeg: number): { hx: number; hz: number } {
  const a = (rotDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  return { hx: round((size.x * c + size.z * s) / 2), hz: round((size.x * s + size.z * c) / 2) }
}

type RoomRect = { x: number; z: number; w: number; d: number }
type P = { x: number; z: number }

function clampAxis(v: number, half: number, limit: number): number {
  const max = limit - half
  if (max <= 0) return 0
  return Math.min(max, Math.max(-max, v))
}

/** Не даём предмету пройти сквозь стены комнаты, в которой он стоит. room = null — предмет на коврике снаружи. */
export function clampToRoom(pos: P, half: { hx: number; hz: number }, room: RoomRect | null, wallHalf = 0): P {
  if (!room) return pos
  return {
    x: room.x + clampAxis(pos.x - room.x, half.hx, room.w / 2 - wallHalf),
    z: room.z + clampAxis(pos.z - room.z, half.hz, room.d / 2 - wallHalf),
  }
}

/** Прижать край предмета к стене комнаты, если до неё меньше dist. */
export function wallSnap(pos: P, half: { hx: number; hz: number }, room: RoomRect | null, dist = 0.12, wallHalf = 0): P {
  if (!room) return pos
  const axis = (v: number, h: number, limit: number) => {
    const max = limit - h
    if (max <= 0) return v
    if (max - v >= 0 && max - v < dist) return max
    if (v + max >= 0 && v + max < dist) return -max
    return v
  }
  return {
    x: room.x + axis(pos.x - room.x, half.hx, room.w / 2 - wallHalf),
    z: room.z + axis(pos.z - room.z, half.hz, room.d / 2 - wallHalf),
  }
}

/** Привязать край одной комнаты к краям других, когда они рядом (по одной оси). */
export function snapEdge(value: number, candidates: number[], dist = 0.15): number {
  let best = value
  let bestD = dist
  for (const c of candidates) {
    const d = Math.abs(c - value)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/** Масштаб для загруженной модели: правдоподобный размер оставляем, остальное приводим к 1,2 м. */
export function fitScale(maxDim: number): number {
  if (!(maxDim > 0)) return 1
  if (maxDim >= 0.05 && maxDim <= 8) return 1
  return 1.2 / maxDim
}

export interface Sun {
  /** направление в плане, радианы */
  azimuth: number
  /** высота над горизонтом, радианы */
  elevation: number
  intensity: number
  /** 0 — холодный дневной, 1 — тёплый вечерний */
  warmth: number
  /** общий рассеянный свет */
  ambient: number
  lamps: boolean
}

/** t: 0 — утро, 0.5 — полдень, 1 — поздний вечер. */
export function sunFromTime(t: number): Sun {
  const k = Math.min(1, Math.max(0, t))
  const arc = Math.sin(k * Math.PI) // 0 → 1 → 0
  const evening = Math.max(0, (k - 0.72) / 0.28)
  return {
    azimuth: -2.2 + k * 2.6,
    elevation: 0.3 + arc * 0.95,
    intensity: 0.35 + arc * 2.4 - evening * 0.25,
    warmth: Math.min(1, (1 - arc) * 0.75 + evening * 0.4),
    ambient: 0.28 + arc * 0.55,
    lamps: k > 0.8,
  }
}
