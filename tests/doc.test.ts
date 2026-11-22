import { describe, expect, it } from 'vitest'
import { addItem, addOpening, addRoom, defaultDoc, duplicateItem, normDeg, removeItem, removeRoom, sanitizeDoc, setItemColor, setWalls, updateItem, updateOpening, updateRoom } from '../src/core/doc'

describe('doc', () => {
  it('starts with an empty room of a sane size', () => {
    const d = defaultDoc()
    expect(d.items).toEqual([])
    expect(d.rooms.length).toBe(1)
    expect(d.rooms[0].w).toBeGreaterThan(2)
    expect(d.rooms[0].d).toBeGreaterThan(2)
  })

  it('addItem returns a new doc and leaves the old one untouched', () => {
    const d0 = defaultDoc()
    const d1 = addItem(d0, { kind: 'kit', key: 'chair' }, 'a1', { x: 1, z: -0.5 })
    expect(d0.items.length).toBe(0)
    expect(d1.items).toEqual([{ id: 'a1', src: { kind: 'kit', key: 'chair' }, x: 1, z: -0.5, y: 0, rot: 0, scale: 1, lift: false, colors: {} }])
  })

  it('updateItem patches one item and normalises rotation', () => {
    let d = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a1')
    d = addItem(d, { kind: 'kit', key: 'table' }, 'a2')
    d = updateItem(d, 'a1', { x: 2, rot: 450 })
    expect(d.items[0].x).toBe(2)
    expect(d.items[0].rot).toBe(90)
    expect(d.items[1].x).toBe(0)
  })

  it('clamps scale and elevation', () => {
    let d = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a1')
    d = updateItem(d, 'a1', { scale: 99, y: -3 })
    expect(d.items[0].scale).toBe(5)
    expect(d.items[0].y).toBe(0)
  })

  it('duplicate copies colours and offsets the copy', () => {
    let d = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a1', { x: 1, z: 1 })
    d = setItemColor(d, 'a1', 'wood', '#112233')
    d = duplicateItem(d, 'a1', 'a2')
    expect(d.items.length).toBe(2)
    expect(d.items[1].id).toBe('a2')
    expect(d.items[1].colors).toEqual({ wood: '#112233' })
    expect(d.items[1].colors).not.toBe(d.items[0].colors)
    expect(d.items[1].x).not.toBe(d.items[0].x)
  })

  it('setItemColor with null removes the override', () => {
    let d = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a1')
    d = setItemColor(d, 'a1', 'wood', '#112233')
    d = setItemColor(d, 'a1', 'wood', null)
    expect(d.items[0].colors).toEqual({})
  })

  it('removeItem drops only that item', () => {
    let d = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a1')
    d = addItem(d, { kind: 'kit', key: 'table' }, 'a2')
    d = removeItem(d, 'a1')
    expect(d.items.map((i) => i.id)).toEqual(['a2'])
  })

  it('rooms: add, resize with clamping, and the last room cannot be removed', () => {
    let d = addRoom(defaultDoc(), 'r2', { x: 4.5, z: 0, w: 4, d: 4 })
    expect(d.rooms.length).toBe(2)
    expect(d.rooms[1].floor).toEqual(d.rooms[0].floor)
    d = updateRoom(d, 'r2', { w: 100, d: 0.2, floor: { color: '#112233' } })
    expect(d.rooms[1].w).toBe(14)
    expect(d.rooms[1].d).toBe(1.2)
    expect(d.rooms[1].floor.color).toBe('#112233')
    expect(d.rooms[1].floor.kind).toBe(d.rooms[0].floor.kind)
    d = removeRoom(d, 'r2')
    expect(d.rooms.length).toBe(1)
    expect(removeRoom(d, d.rooms[0].id).rooms.length).toBe(1)
  })

  it('resizing a room by one edge keeps the opposite wall exactly in place', () => {
    // западная стена едет с −3 на −4,05; восточная стена должна остаться на 2,4
    const d = updateRoom(addRoom(defaultDoc(), 'r2', { x: -0.3, z: 0, w: 5.4, d: 4.4 }), 'r2', { x: (-4.05 + 2.4) / 2, w: 2.4 + 4.05 })
    const r = d.rooms[1]
    expect(r.x + r.w / 2).toBeCloseTo(2.4, 9)
    expect(r.x - r.w / 2).toBeCloseTo(-4.05, 9)
  })

  it('walls: height is clamped, bad colours ignored', () => {
    const d = setWalls(defaultDoc(), { h: 9, color: 'red' })
    expect(d.walls.h).toBe(4)
    expect(d.walls.color).toBe(defaultDoc().walls.color)
  })

  it('openings: add and resize with clamping', () => {
    let d = addOpening(defaultDoc(), { id: 'o1', kind: 'door', axis: 'x', x: 0, z: -2, width: 0.9 })
    d = updateOpening(d, 'o1', { width: 10, x: 1.234 })
    expect(d.openings[0].width).toBe(3)
    expect(d.openings[0].x).toBe(1.23)
  })

  it('normDeg wraps into 0..360', () => {
    expect(normDeg(-90)).toBe(270)
    expect(normDeg(720)).toBe(0)
  })

  it('sanitizeDoc repairs broken saves', () => {
    const d = sanitizeDoc({
      rooms: [{ id: 'r1', x: 0, z: 0, w: 5, d: 'x' }, { id: 'r2', x: 1, z: 1, w: 3, d: 3, floor: { kind: 'lava', color: 7 } }],
      walls: { h: 'tall', color: 42 },
      openings: [{ id: 'o1', kind: 'door', axis: 'x', x: 0, z: 0, width: 0.9 }, { id: 'o2', kind: 'portal', axis: 'x' }],
      items: [
        { id: 'ok', src: { kind: 'kit', key: 'chair' }, x: 1, z: 2, rot: 90, scale: 1 },
        { id: 'bad-src', src: { kind: 'nope', key: 'chair' } },
        { src: { kind: 'kit', key: 'chair' } },
        'junk',
        { id: 'ok', src: { kind: 'kit', key: 'table' } },
      ],
    })
    expect(d.rooms.map((r) => r.id)).toEqual(['r2'])
    expect(d.rooms[0].floor).toEqual(defaultDoc().rooms[0].floor)
    expect(d.walls).toEqual(defaultDoc().walls)
    expect(d.openings.map((o) => o.id)).toEqual(['o1'])
    expect(d.items.length).toBe(1)
    expect(d.items[0]).toMatchObject({ id: 'ok', x: 1, z: 2, y: 0, rot: 90, lift: false, colors: {} })
    expect(sanitizeDoc(null)).toEqual(defaultDoc())
    expect(sanitizeDoc({ rooms: [] }).rooms.length).toBe(1)
  })
})
