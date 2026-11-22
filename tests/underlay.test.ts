import { describe, expect, it } from 'vitest'
import { LIMITS, defaultDoc, sanitizeDoc, setScene, setUnderlay, updateUnderlay, type Underlay } from '../src/core/doc'
import { calibrate, defaultUnderlay, underlayContains, underlaySize } from '../src/core/underlay'

const base: Underlay = { image: 'p1', x: 0, z: 0, w: 10, ratio: 0.5, rot: 0, opacity: 0.6 }

describe('подложка с планом квартиры', () => {
  it('в новом проекте подложки нет', () => {
    expect(defaultDoc().scene.underlay).toBeNull()
  })

  it('подложка кладётся в проект, а размер, прозрачность и поворот приводятся к допустимым', () => {
    const d = setUnderlay(defaultDoc(), { ...base, w: 500, opacity: 5, rot: 450 })
    expect(d.scene.underlay).toEqual({ ...base, w: LIMITS.underMax, opacity: 1, rot: 90 })
  })

  it('смена коврика не убирает подложку', () => {
    const d = setScene(setUnderlay(defaultDoc(), base), { mat: 'blue' })
    expect(d.scene).toEqual({ mat: 'blue', underlay: base })
  })

  it('правка подложки меняет только названное', () => {
    const d = updateUnderlay(setUnderlay(defaultDoc(), base), { opacity: 0.3, x: 1.2345 })
    expect(d.scene.underlay).toEqual({ ...base, opacity: 0.3, x: 1.235 })
  })

  it('правка без подложки ничего не делает', () => {
    const d = defaultDoc()
    expect(updateUnderlay(d, { opacity: 0.3 })).toBe(d)
  })

  it('подложку можно убрать', () => {
    expect(setUnderlay(setUnderlay(defaultDoc(), base), null).scene.underlay).toBeNull()
  })

  it('сохранённая подложка чинится при чтении', () => {
    const raw = (underlay: unknown) => ({ ...defaultDoc(), scene: { mat: 'green', underlay } })
    expect(sanitizeDoc(raw(base)).scene.underlay).toEqual(base)
    expect(sanitizeDoc(raw({ ...base, image: '../secret' })).scene.underlay).toBeNull()
    expect(sanitizeDoc(raw({ ...base, w: 'много' })).scene.underlay).toBeNull()
    expect(sanitizeDoc(raw({ ...base, opacity: -3 })).scene.underlay).toEqual({ ...base, opacity: 0.1 })
    // проект, сохранённый до появления подложки
    expect(sanitizeDoc({ ...defaultDoc(), scene: { mat: 'green' } }).scene.underlay).toBeNull()
  })

  it('размер на коврике учитывает поворот', () => {
    expect(underlaySize(base)).toEqual({ w: 10, d: 5 })
    expect(underlaySize({ ...base, rot: 90 })).toEqual({ w: 5, d: 10 })
    expect(underlaySize({ ...base, rot: 180 })).toEqual({ w: 10, d: 5 })
  })

  it('понимает, попала ли точка в подложку', () => {
    expect(underlayContains(base, { x: 4.9, z: 2.4 })).toBe(true)
    expect(underlayContains(base, { x: 4.9, z: 2.6 })).toBe(false)
    expect(underlayContains({ ...base, rot: 90, x: 1 }, { x: 3.4, z: 4.9 })).toBe(true)
    expect(underlayContains({ ...base, rot: 90, x: 1 }, { x: 3.6, z: 4.9 })).toBe(false)
  })

  it('масштаб по двум точкам: расстояние становится заданным, первая точка остаётся на месте', () => {
    const u = calibrate({ ...base, x: 2, z: 0 }, { x: 1, z: 1 }, { x: 3, z: 1 }, 5)
    expect(u.w).toBeCloseTo(25)
    expect(u.x).toBeCloseTo(3.5)
    expect(u.z).toBeCloseTo(-1.5)
    expect(u.ratio).toBe(base.ratio)
  })

  it('масштаб не меняется, если точки совпали или расстояние не задано', () => {
    expect(calibrate(base, { x: 1, z: 1 }, { x: 1, z: 1 }, 5)).toEqual(base)
    expect(calibrate(base, { x: 1, z: 1 }, { x: 3, z: 1 }, 0)).toEqual(base)
    expect(calibrate(base, { x: 1, z: 1 }, { x: 3, z: 1 }, Number.NaN)).toEqual(base)
  })

  it('масштаб упирается в наибольший размер, и точка всё равно остаётся на месте', () => {
    const u = calibrate(base, { x: 2, z: 0 }, { x: 3, z: 0 }, 1000)
    expect(u.w).toBe(LIMITS.underMax)
    // множитель 8, центр уезжает от точки (2, 0) в 8 раз дальше
    expect(u.x).toBeCloseTo(2 + (0 - 2) * 8)
    expect(u.z).toBeCloseTo(0)
  })

  it('новая подложка по умолчанию помещается на коврик', () => {
    expect(defaultUnderlay('p1', 0.5, { x: 1, z: 2 })).toEqual({ image: 'p1', x: 1, z: 2, w: 10, ratio: 0.5, rot: 0, opacity: 0.6 })
    const tall = defaultUnderlay('p2', 2, { x: 0, z: 0 })
    expect(tall.w).toBe(6)
    expect(underlaySize(tall).d).toBe(12)
  })
})
