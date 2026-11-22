import { LIMITS, addRoom, defaultDoc } from '../src/core/doc'
import { describe, expect, it } from 'vitest'
import { buildWalls, floorArea, roomAt, snapOpening, wallLowered, type Rect, roomFromDrag } from '../src/core/walls'

// прямоугольник по углам для наглядности тестов
const rect = (id: string, x0: number, z0: number, x1: number, z1: number): Rect => ({ id, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 })
const key = (s: { axis: string; c: number; a: number; b: number; exterior: boolean }) => `${s.axis}@${s.c}:${s.a}..${s.b}:${s.exterior ? 'ext' : 'int'}`

describe('buildWalls', () => {
  it('one room has four outer walls with outward normals', () => {
    const walls = buildWalls([rect('a', 0, 0, 4, 3)])
    expect(walls.map(key).sort()).toEqual(['x@0:0..4:ext', 'x@3:0..4:ext', 'z@0:0..3:ext', 'z@4:0..3:ext'])
    const north = walls.find((w) => w.axis === 'x' && w.c === 0)!
    expect(north.outward).toEqual({ x: 0, z: -1 })
    const east = walls.find((w) => w.axis === 'z' && w.c === 4)!
    expect(east.outward).toEqual({ x: 1, z: 0 })
  })

  it('two rooms side by side share one inner wall and merge collinear outer walls', () => {
    const walls = buildWalls([rect('a', 0, 0, 4, 3), rect('b', 4, 0, 8, 3)])
    expect(walls.map(key).sort()).toEqual(['x@0:0..8:ext', 'x@3:0..8:ext', 'z@0:0..3:ext', 'z@4:0..3:int', 'z@8:0..3:ext'])
  })

  it('a partly shared edge is split into outer and inner parts', () => {
    const walls = buildWalls([rect('a', 0, 0, 4, 3), rect('b', 4, 1, 7, 5)])
    const onLine = walls.filter((w) => w.axis === 'z' && w.c === 4).map(key).sort()
    expect(onLine).toEqual(['z@4:0..1:ext', 'z@4:1..3:int', 'z@4:3..5:ext'])
  })

  it('overlapping rooms merge into one space without a wall between them', () => {
    const walls = buildWalls([rect('a', 0, 0, 4, 3), rect('b', 3, 0, 6, 3)])
    expect(walls.map(key).sort()).toEqual(['x@0:0..6:ext', 'x@3:0..6:ext', 'z@0:0..3:ext', 'z@6:0..3:ext'])
  })
})

describe('roomAt', () => {
  it('finds the room under a point', () => {
    const rooms = [rect('a', 0, 0, 4, 3), rect('b', 4, 0, 8, 3)]
    expect(roomAt(rooms, 1, 1)?.id).toBe('a')
    expect(roomAt(rooms, 6, 2)?.id).toBe('b')
    expect(roomAt(rooms, 20, 2)).toBe(null)
  })
})

describe('wallLowered', () => {
  const walls = buildWalls([rect('a', -2, -2, 2, 2), rect('b', 2, -2, 6, 2)])
  const find = (axis: string, c: number) => walls.find((w) => w.axis === axis && w.c === c)!
  it('lowers outer walls that face the camera and keeps the far ones', () => {
    const cam = { x: 2, z: 10 }
    const target = { x: 2, z: 0 }
    expect(wallLowered(find('x', 2), cam, target)).toBe(true)
    expect(wallLowered(find('x', -2), cam, target)).toBe(false)
  })
  it('lowers an outer wall that faces away but stands between the camera and the target', () => {
    // выступ: комната c торчит ниже комнаты a, её западная стена смотрит от камеры, но загораживает вид
    const w2 = buildWalls([rect('a', -3, -2, 2, 2), rect('c', 2, 1, 6, 4)])
    const stub = w2.find((w) => w.axis === 'z' && w.c === 2 && w.a === 2 && w.b === 4)!
    expect(stub.exterior).toBe(true)
    expect(stub.outward).toEqual({ x: -1, z: 0 })
    expect(wallLowered(stub, { x: 9, z: 10 }, { x: 1, z: 0.5 })).toBe(true)
    // та же стена далеко за точкой обзора остаётся поднятой
    expect(wallLowered(stub, { x: 9, z: 10 }, { x: 5, z: 6 })).toBe(false)
  })

  it('lowers an inner wall only when it stands between the camera and the target', () => {
    const inner = find('z', 2)
    expect(wallLowered(inner, { x: 12, z: 0 }, { x: 0, z: 0 })).toBe(true)
    expect(wallLowered(inner, { x: 12, z: 0 }, { x: 4, z: 0 })).toBe(false)
    expect(wallLowered(inner, { x: 2, z: 12 }, { x: 0, z: 0 })).toBe(false)
  })
})

describe('snapOpening', () => {
  const walls = buildWalls([rect('a', 0, 0, 4, 3)])
  it('snaps a door to the nearest wall and keeps it inside the wall', () => {
    const s = snapOpening(walls, { x: 2, z: 0.3 }, 0.9)!
    expect(s.axis).toBe('x')
    expect(s.z).toBe(0)
    expect(s.x).toBe(2)
    const nearCorner = snapOpening(walls, { x: 0.1, z: 0.2 }, 0.9)!
    expect(nearCorner.axis === 'x' ? nearCorner.x : nearCorner.z).toBeCloseTo(0.55)
  })
  it('returns null far from any wall or when the wall is too short', () => {
    expect(snapOpening(walls, { x: 2, z: 1.5 }, 0.9)).toBe(null)
    expect(snapOpening(buildWalls([rect('s', 0, 0, 0.8, 0.8)]), { x: 0.4, z: 0 }, 0.9)).toBe(null)
  })

  describe('комната, нарисованная мышью', () => {
    const other = { id: 'a', x: 0, z: 0, w: 5, d: 4, floor: { kind: 'planks' as const, color: '#c79a6b' } }

    it('два угла дают прямоугольник с привязкой к сетке 5 см', () => {
      expect(roomFromDrag({ x: 10.02, z: 10.01 }, { x: 13.98, z: 13.02 }, [])).toEqual({ x: 12, z: 11.5, w: 4, d: 3, ok: true })
    })

    it('тянуть можно в любую сторону', () => {
      expect(roomFromDrag({ x: 13.98, z: 13.02 }, { x: 10.02, z: 10.01 }, [])).toEqual({ x: 12, z: 11.5, w: 4, d: 3, ok: true })
    })

    it('слишком маленький прямоугольник комнатой не становится', () => {
      const r = roomFromDrag({ x: 10, z: 10 }, { x: 10.6, z: 13 }, [])
      expect(r.ok).toBe(false)
      expect(r.w).toBeCloseTo(0.6)
    })

    it('слишком большой обрезается до наибольшей комнаты от первого угла', () => {
      const r = roomFromDrag({ x: 20, z: 20 }, { x: -30, z: 60 }, [])
      expect(r).toEqual({ x: 20 - LIMITS.roomMax / 2, z: 20 + LIMITS.roomMax / 2, w: LIMITS.roomMax, d: LIMITS.roomMax, ok: true })
    })

    it('края прилипают к краям соседних комнат', () => {
      // соседняя комната занимает x от -2,5 до 2,5 и z от -2 до 2
      const r = roomFromDrag({ x: 2.58, z: -1.93 }, { x: 6, z: 2.11 }, [other])
      expect(r).toEqual({ x: 4.25, z: 0, w: 3.5, d: 4, ok: true })
    })
  })

  describe('площадь', () => {
    it('одна комната — ширина на глубину', () => {
      expect(floorArea([rect('a', 0, 0, 4, 3)])).toBeCloseTo(12)
    })

    it('комнаты рядом складываются', () => {
      expect(floorArea([rect('a', 0, 0, 4, 3), rect('b', 4, 0, 6, 3)])).toBeCloseTo(18)
    })

    it('общая часть перекрывающихся комнат считается один раз', () => {
      expect(floorArea([rect('a', 0, 0, 4, 3), rect('b', 2, 1, 6, 4)])).toBeCloseTo(12 + 12 - 4)
    })

    it('без комнат площадь ноль', () => {
      expect(floorArea([])).toBe(0)
    })
  })

  it('комната, нарисованная вплотную к соседней с краем на 1,525, делит с ней одну стену', () => {
    const a = rect('a', -1.525, -2, 1.525, 2)
    const drawn = roomFromDrag({ x: 1.6, z: -2 }, { x: 4, z: 2 }, [a])
    const doc = addRoom({ ...defaultDoc(), rooms: [{ ...a, floor: { kind: 'planks', color: '#c79a6b' } }] }, 'b', drawn)
    const walls = buildWalls(doc.rooms)
    const between = walls.filter((w) => w.axis === 'z' && Math.abs(w.c - 1.525) < 0.01)
    expect(between.map((w) => [w.c, w.a, w.b, w.exterior])).toEqual([[1.525, -2, 2, false]])
  })
})
