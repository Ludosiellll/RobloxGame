// Проект как чистые данные. Все операции возвращают новый документ и не трогают старый.

export type ItemSrc = { kind: 'kit' | 'user'; key: string }

export interface Item {
  id: string
  src: ItemSrc
  x: number
  z: number
  /** высота над полом, м */
  y: number
  /** поворот вокруг вертикали, градусы 0..360 */
  rot: number
  scale: number
  /** высота задана вручную (полки, бра): при перетаскивании её не сбрасываем */
  lift: boolean
  /** перекраска: имя материала → #rrggbb */
  colors: Record<string, string>
}

export type FloorKind = 'planks' | 'tile' | 'plain' | 'carpet'
export type MatKind = 'green' | 'graphite' | 'blue' | 'sand'

/** Комната-прямоугольник: x, z — центр. */
export interface Room {
  id: string
  x: number
  z: number
  w: number
  d: number
  floor: { kind: FloorKind; color: string }
}

/** Дверь или окно в стене. axis — вдоль какой оси идёт стена. */
export interface Opening {
  id: string
  kind: 'door' | 'window'
  axis: 'x' | 'z'
  x: number
  z: number
  width: number
}

/** Картинка плана квартиры, лежащая на коврике под комнатами. */
export interface Underlay {
  /** ключ картинки в хранилище */
  image: string
  /** центр на коврике, м */
  x: number
  z: number
  /** ширина картинки в метрах — это и есть масштаб */
  w: number
  /** высота картинки, делённая на ширину */
  ratio: number
  /** поворот шагами по 90° */
  rot: number
  opacity: number
}

export interface Doc {
  v: 1
  rooms: Room[]
  walls: { h: number; color: string }
  openings: Opening[]
  /** время суток 0..1: 0 — утро, 0.5 — полдень, 1 — поздний вечер */
  light: { time: number }
  scene: { mat: MatKind; underlay: Underlay | null }
  items: Item[]
}

export const LIMITS = { roomMin: 1.2, roomMax: 14, hMin: 2.2, hMax: 4, scaleMin: 0.1, scaleMax: 5, liftMax: 4, openMin: 0.5, openMax: 3, underMin: 1, underMax: 80 }
const FLOOR_KINDS: FloorKind[] = ['planks', 'tile', 'plain', 'carpet']
const MAT_KINDS: MatKind[] = ['green', 'graphite', 'blue', 'sand']
const DEFAULT_FLOOR = { kind: 'planks' as FloorKind, color: '#c79a6b' }

export function defaultDoc(): Doc {
  return {
    v: 1,
    rooms: [{ id: 'room1', x: 0, z: 0, w: 5, d: 4, floor: { ...DEFAULT_FLOOR } }],
    walls: { h: 2.7, color: '#f1f0ea' },
    openings: [],
    light: { time: 0.42 },
    scene: { mat: 'green', underlay: null },
    items: [],
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

export function normDeg(deg: number): number {
  const d = deg % 360
  return d < 0 ? d + 360 : d === 0 ? 0 : d
}

function cleanItem(i: Item): Item {
  return {
    ...i,
    rot: normDeg(i.rot),
    scale: clamp(i.scale, LIMITS.scaleMin, LIMITS.scaleMax),
    y: clamp(i.y, 0, LIMITS.liftMax),
  }
}

export function addItem(doc: Doc, src: ItemSrc, id: string, at: { x: number; z: number } = { x: 0, z: 0 }): Doc {
  const item: Item = { id, src: { ...src }, x: at.x, z: at.z, y: 0, rot: 0, scale: 1, lift: false, colors: {} }
  return { ...doc, items: [...doc.items, item] }
}

export function updateItem(doc: Doc, id: string, patch: Partial<Omit<Item, 'id' | 'src'>>): Doc {
  return { ...doc, items: doc.items.map((i) => (i.id === id ? cleanItem({ ...i, ...patch }) : i)) }
}

export function removeItem(doc: Doc, id: string): Doc {
  return { ...doc, items: doc.items.filter((i) => i.id !== id) }
}

export function duplicateItem(doc: Doc, id: string, newId: string, offset = 0.4): Doc {
  const src = doc.items.find((i) => i.id === id)
  if (!src) return doc
  const copy: Item = { ...src, id: newId, src: { ...src.src }, colors: { ...src.colors }, x: src.x + offset, z: src.z + offset }
  return { ...doc, items: [...doc.items, copy] }
}

export function setItemColor(doc: Doc, id: string, slot: string, hex: string | null): Doc {
  return {
    ...doc,
    items: doc.items.map((i) => {
      if (i.id !== id) return i
      const colors = { ...i.colors }
      if (hex === null) delete colors[slot]
      else colors[slot] = hex
      return { ...i, colors }
    }),
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100

// центр комнаты — до миллиметра: при шаге стен 5 см он попадает на 2,5 см, и округление до сантиметра сдвигало бы стену
const r3 = (v: number) => Math.round(v * 1000) / 1000

function cleanRoom(r: Room): Room {
  return {
    ...r,
    x: r3(r.x),
    z: r3(r.z),
    w: r3(clamp(r.w, LIMITS.roomMin, LIMITS.roomMax)),
    d: r3(clamp(r.d, LIMITS.roomMin, LIMITS.roomMax)),
    floor: { kind: FLOOR_KINDS.includes(r.floor.kind) ? r.floor.kind : DEFAULT_FLOOR.kind, color: isHex(r.floor.color) ? r.floor.color : DEFAULT_FLOOR.color },
  }
}

export function addRoom(doc: Doc, id: string, rect: { x: number; z: number; w: number; d: number }, floor?: Room['floor']): Doc {
  const like = doc.rooms[doc.rooms.length - 1]?.floor ?? DEFAULT_FLOOR
  return { ...doc, rooms: [...doc.rooms, cleanRoom({ id, ...rect, floor: { ...(floor ?? like) } })] }
}

export function updateRoom(doc: Doc, id: string, patch: Partial<Omit<Room, 'id' | 'floor'>> & { floor?: Partial<Room['floor']> }): Doc {
  return {
    ...doc,
    rooms: doc.rooms.map((r) => (r.id === id ? cleanRoom({ ...r, ...patch, floor: { ...r.floor, ...(patch.floor ?? {}) } }) : r)),
  }
}

/** Последнюю комнату удалить нельзя. */
export function removeRoom(doc: Doc, id: string): Doc {
  if (doc.rooms.length <= 1) return doc
  return { ...doc, rooms: doc.rooms.filter((r) => r.id !== id) }
}

export function setWalls(doc: Doc, patch: { h?: number; color?: string }): Doc {
  return {
    ...doc,
    walls: { h: clamp(num(patch.h, doc.walls.h), LIMITS.hMin, LIMITS.hMax), color: isHex(patch.color) ? patch.color : doc.walls.color },
  }
}

function cleanOpening(o: Opening): Opening {
  return { ...o, x: r2(o.x), z: r2(o.z), width: r2(clamp(o.width, LIMITS.openMin, LIMITS.openMax)) }
}

export function addOpening(doc: Doc, o: Opening): Doc {
  return { ...doc, openings: [...doc.openings, cleanOpening(o)] }
}

export function updateOpening(doc: Doc, id: string, patch: Partial<Omit<Opening, 'id' | 'kind'>>): Doc {
  return { ...doc, openings: doc.openings.map((o) => (o.id === id ? cleanOpening({ ...o, ...patch }) : o)) }
}

export function removeOpening(doc: Doc, id: string): Doc {
  return { ...doc, openings: doc.openings.filter((o) => o.id !== id) }
}

export function setScene(doc: Doc, patch: { mat?: MatKind }): Doc {
  return { ...doc, scene: { ...doc.scene, mat: patch.mat && MAT_KINDS.includes(patch.mat) ? patch.mat : doc.scene.mat } }
}

const isImageKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)

function cleanUnderlay(u: Underlay): Underlay {
  return {
    image: u.image,
    x: r3(clamp(u.x, -60, 60)),
    z: r3(clamp(u.z, -60, 60)),
    w: r3(clamp(u.w, LIMITS.underMin, LIMITS.underMax)),
    ratio: clamp(u.ratio, 0.05, 20),
    rot: normDeg(Math.round(u.rot / 90) * 90),
    opacity: r2(clamp(u.opacity, 0.1, 1)),
  }
}

export function setUnderlay(doc: Doc, underlay: Underlay | null): Doc {
  return { ...doc, scene: { ...doc.scene, underlay: underlay ? cleanUnderlay(underlay) : null } }
}

export function updateUnderlay(doc: Doc, patch: Partial<Omit<Underlay, 'image' | 'ratio'>>): Doc {
  const u = doc.scene.underlay
  if (!u) return doc
  return { ...doc, scene: { ...doc.scene, underlay: cleanUnderlay({ ...u, ...patch }) } }
}

function readUnderlay(raw: unknown): Underlay | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isImageKey(o.image)) return null
  const nums = [o.x, o.z, o.w, o.ratio, o.rot, o.opacity]
  if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const [x, z, w, ratio, rot, opacity] = nums as number[]
  return cleanUnderlay({ image: o.image, x, z, w, ratio, rot, opacity })
}

export function setLight(doc: Doc, time: number): Doc {
  return { ...doc, light: { time: clamp(num(time, doc.light.time), 0, 1) } }
}

/** Чинит документ, прочитанный из хранилища или файла: неизвестное заменяет значениями по умолчанию. */
export function sanitizeDoc(raw: unknown): Doc {
  const base = defaultDoc()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

  const rooms: Room[] = []
  const roomIds = new Set<string>()
  for (const it of Array.isArray(r.rooms) ? r.rooms : []) {
    const o = obj(it)
    if (typeof o.id !== 'string' || !o.id || roomIds.has(o.id)) continue
    if (![o.x, o.z, o.w, o.d].every((v) => typeof v === 'number' && Number.isFinite(v))) continue
    roomIds.add(o.id)
    const f = obj(o.floor)
    rooms.push(cleanRoom({ id: o.id, x: o.x as number, z: o.z as number, w: o.w as number, d: o.d as number, floor: { kind: f.kind as FloorKind, color: f.color as string } }))
  }

  const walls = obj(r.walls)
  const light = obj(r.light)
  const scene = obj(r.scene)

  const openings: Opening[] = []
  const openIds = new Set<string>()
  for (const it of Array.isArray(r.openings) ? r.openings : []) {
    const o = obj(it)
    if (typeof o.id !== 'string' || !o.id || openIds.has(o.id)) continue
    if ((o.kind !== 'door' && o.kind !== 'window') || (o.axis !== 'x' && o.axis !== 'z')) continue
    openIds.add(o.id)
    openings.push(cleanOpening({ id: o.id, kind: o.kind, axis: o.axis, x: num(o.x, 0), z: num(o.z, 0), width: num(o.width, 0.9) }))
  }

  const seen = new Set<string>()
  const items: Item[] = []
  for (const it of Array.isArray(r.items) ? r.items : []) {
    const o = obj(it)
    const src = obj(o.src)
    if (typeof o.id !== 'string' || !o.id || seen.has(o.id)) continue
    if ((src.kind !== 'kit' && src.kind !== 'user') || typeof src.key !== 'string' || !src.key) continue
    seen.add(o.id)
    const colors: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj(o.colors))) if (isHex(v)) colors[k] = v
    items.push(
      cleanItem({
        id: o.id,
        src: { kind: src.kind, key: src.key },
        x: num(o.x, 0),
        z: num(o.z, 0),
        y: num(o.y, 0),
        rot: num(o.rot, 0),
        scale: num(o.scale, 1),
        lift: o.lift === true,
        colors,
      }),
    )
  }

  return {
    v: 1,
    rooms: rooms.length ? rooms : base.rooms,
    walls: { h: clamp(num(walls.h, base.walls.h), LIMITS.hMin, LIMITS.hMax), color: isHex(walls.color) ? walls.color : base.walls.color },
    openings,
    light: { time: clamp(num(light.time, base.light.time), 0, 1) },
    scene: { mat: MAT_KINDS.includes(scene.mat as MatKind) ? (scene.mat as MatKind) : base.scene.mat, underlay: readUnderlay(scene.underlay) },
    items,
  }
}
