import { describe, expect, it } from 'vitest'
import { buildWalls, roomAt, snapOpening, wallLowered, type Rect } from '../src/core/walls'

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
})
