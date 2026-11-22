import { describe, expect, it } from 'vitest'
import { KIT_BY_KEY } from '../src/core/catalog'
import { sanitizeDoc } from '../src/core/doc'
import { footprint } from '../src/core/geom'
import { starterDoc } from '../src/core/starter'
import { buildWalls, roomAt, wallForOpening } from '../src/core/walls'

describe('starter project', () => {
  const doc = starterDoc()

  it('survives sanitizing unchanged', () => {
    expect(sanitizeDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })

  it('uses only catalog models and keeps every item inside a room', () => {
    for (const it of doc.items) {
      const k = KIT_BY_KEY.get(it.src.key)
      expect(k, it.src.key).toBeTruthy()
      const room = roomAt(doc.rooms, it.x, it.z)
      expect(room, `${it.src.key} is outside rooms`).toBeTruthy()
      const half = footprint({ x: k!.w, z: k!.d }, it.rot)
      expect(Math.abs(it.x - room!.x) + half.hx, `${it.src.key} crosses a wall on x`).toBeLessThanOrEqual(room!.w / 2 + 0.001)
      expect(Math.abs(it.z - room!.z) + half.hz, `${it.src.key} crosses a wall on z`).toBeLessThanOrEqual(room!.d / 2 + 0.001)
    }
  })

  it('every door and window sits on a wall', () => {
    const walls = buildWalls(doc.rooms)
    for (const o of doc.openings) expect(wallForOpening(walls, o), o.id).toBeTruthy()
  })
})
