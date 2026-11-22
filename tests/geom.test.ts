import { describe, expect, it } from 'vitest'
import { clampToRoom, fitScale, footprint, snap, snapEdge, sunFromTime, wallSnap } from '../src/core/geom'

describe('geom', () => {
  it('snap rounds to the step', () => {
    expect(snap(0.12, 0.05)).toBeCloseTo(0.1)
    expect(snap(0.13, 0.05)).toBeCloseTo(0.15)
    expect(snap(-0.26, 0.5)).toBeCloseTo(-0.5)
  })

  it('footprint swaps extents at 90 degrees and grows at 45', () => {
    const size = { x: 2, z: 1 }
    expect(footprint(size, 0)).toEqual({ hx: 1, hz: 0.5 })
    const r90 = footprint(size, 90)
    expect(r90.hx).toBeCloseTo(0.5)
    expect(r90.hz).toBeCloseTo(1)
    const r45 = footprint(size, 45)
    expect(r45.hx).toBeCloseTo(1.0607, 3)
    expect(r45.hz).toBeCloseTo(1.0607, 3)
  })

  it('keeps an item inside its room', () => {
    const room = { x: 0, z: 0, w: 4, d: 3 }
    expect(clampToRoom({ x: 1.9, z: 0 }, { hx: 0.5, hz: 0.5 }, room)).toEqual({ x: 1.5, z: 0 })
    expect(clampToRoom({ x: 0, z: -1.4 }, { hx: 0.5, hz: 0.5 }, room)).toEqual({ x: 0, z: -1 })
    expect(clampToRoom({ x: 11.9, z: 5 }, { hx: 0.5, hz: 0.5 }, { x: 10, z: 5, w: 4, d: 3 })).toEqual({ x: 11.5, z: 5 })
  })

  it('accounts for wall thickness', () => {
    expect(clampToRoom({ x: 1.9, z: 0 }, { hx: 0.5, hz: 0.5 }, { x: 0, z: 0, w: 4, d: 3 }, 0.05).x).toBeCloseTo(1.45)
  })

  it('leaves items on the mat outside any room alone', () => {
    expect(clampToRoom({ x: 3, z: 0 }, { hx: 0.5, hz: 0.5 }, null)).toEqual({ x: 3, z: 0 })
  })

  it('an item bigger than the room is centred on that axis', () => {
    expect(clampToRoom({ x: 0.3, z: 0 }, { hx: 3, hz: 0.5 }, { x: 0, z: 0, w: 4, d: 3 })).toEqual({ x: 0, z: 0 })
  })

  it('snaps an edge to a nearby wall', () => {
    const room = { x: 0, z: 0, w: 4, d: 3 }
    expect(wallSnap({ x: 1.42, z: 0 }, { hx: 0.5, hz: 0.5 }, room, 0.12).x).toBeCloseTo(1.5)
    expect(wallSnap({ x: 1.2, z: 0 }, { hx: 0.5, hz: 0.5 }, room, 0.12).x).toBeCloseTo(1.2)
    expect(wallSnap({ x: 0, z: -0.93 }, { hx: 0.5, hz: 0.5 }, room, 0.12).z).toBeCloseTo(-1)
  })

  it('snapEdge picks the nearest candidate within reach', () => {
    expect(snapEdge(2.08, [2, 5])).toBe(2)
    expect(snapEdge(2.4, [2, 5])).toBe(2.4)
    expect(snapEdge(4.9, [2, 5, 4.95])).toBe(4.95)
  })

  it('fitScale leaves realistic sizes and rescales absurd ones', () => {
    expect(fitScale(1.8)).toBe(1)
    expect(fitScale(180)).toBeCloseTo(1.2 / 180)
    expect(fitScale(0.002)).toBeCloseTo(1.2 / 0.002)
    expect(fitScale(0)).toBe(1)
  })

  it('sunFromTime: high bright sun at noon, low warm light in the evening', () => {
    const noon = sunFromTime(0.5)
    const evening = sunFromTime(0.95)
    expect(noon.elevation).toBeGreaterThan(evening.elevation)
    expect(noon.intensity).toBeGreaterThan(evening.intensity)
    expect(evening.warmth).toBeGreaterThan(noon.warmth)
    expect(evening.lamps).toBe(true)
    expect(noon.lamps).toBe(false)
  })
})
