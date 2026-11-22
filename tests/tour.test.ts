import { describe, expect, it } from 'vitest'
import { addItem, addRoom, defaultDoc, setItemColor, setLight, setWalls, updateItem, updateRoom } from '../src/core/doc'
import { TOUR_STEPS, snapOf, stepDone, tourAdvance, tourStart, type TourView } from '../src/core/tour'

const view = (patch: Partial<TourView> = {}): TourView => ({ mode: '3d', azimuth: 0.7, polar: 0.9, distance: 20, ...patch })
const base = () => addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a', { x: 0, z: 0 })

describe('обучение', () => {
  it('идёт по шагам: осмотреться, добавить, подвинуть, повернуть, покрасить, комната, свет, вид сверху', () => {
    expect(TOUR_STEPS).toEqual(['look', 'add', 'move', 'turn', 'paint', 'room', 'light', 'plan'])
  })

  it('«осмотреться» засчитывается, когда вид повернули, наклонили или приблизили', () => {
    const start = snapOf(base(), view())
    expect(stepDone('look', start, snapOf(base(), view()))).toBe(false)
    expect(stepDone('look', start, snapOf(base(), view({ azimuth: 0.72 })))).toBe(false)
    expect(stepDone('look', start, snapOf(base(), view({ azimuth: 1.1 })))).toBe(true)
    expect(stepDone('look', start, snapOf(base(), view({ polar: 0.6 })))).toBe(true)
    expect(stepDone('look', start, snapOf(base(), view({ distance: 16 })))).toBe(true)
  })

  it('поворот вида через границу круга считается малым, если он малый', () => {
    const start = snapOf(base(), view({ azimuth: 3.1 }))
    expect(stepDone('look', start, snapOf(base(), view({ azimuth: -3.1 })))).toBe(false)
  })

  it('«добавить» — в проекте появился новый предмет', () => {
    const start = snapOf(base(), view())
    expect(stepDone('add', start, snapOf(base(), view()))).toBe(false)
    expect(stepDone('add', start, snapOf(addItem(base(), { kind: 'kit', key: 'table' }, 'b', { x: 1, z: 1 }), view()))).toBe(true)
  })

  it('«подвинуть» — предмет заметно сдвинулся; новый предмет сдвигом не считается', () => {
    const start = snapOf(base(), view())
    expect(stepDone('move', start, snapOf(updateItem(base(), 'a', { x: 0.05 }), view()))).toBe(false)
    expect(stepDone('move', start, snapOf(updateItem(base(), 'a', { x: 0.4 }), view()))).toBe(true)
    expect(stepDone('move', start, snapOf(addItem(base(), { kind: 'kit', key: 'table' }, 'b', { x: 2, z: 2 }), view()))).toBe(false)
  })

  it('«повернуть» — у предмета изменился поворот', () => {
    const start = snapOf(base(), view())
    expect(stepDone('turn', start, snapOf(updateItem(base(), 'a', { x: 1 }), view()))).toBe(false)
    expect(stepDone('turn', start, snapOf(updateItem(base(), 'a', { rot: 90 }), view()))).toBe(true)
  })

  it('«покрасить» — изменился цвет предмета, стен или пола', () => {
    const start = snapOf(base(), view())
    expect(stepDone('paint', start, snapOf(base(), view()))).toBe(false)
    expect(stepDone('paint', start, snapOf(setItemColor(base(), 'a', 'wood', '#112233'), view()))).toBe(true)
    expect(stepDone('paint', start, snapOf(setWalls(base(), { color: '#112233' }), view()))).toBe(true)
    expect(stepDone('paint', start, snapOf(updateRoom(base(), 'room1', { floor: { color: '#112233' } }), view()))).toBe(true)
  })

  it('«комната» — изменился размер или место комнаты, или комнат стало больше', () => {
    const start = snapOf(base(), view())
    expect(stepDone('room', start, snapOf(updateRoom(base(), 'room1', { floor: { color: '#112233' } }), view()))).toBe(false)
    expect(stepDone('room', start, snapOf(updateRoom(base(), 'room1', { w: 6 }), view()))).toBe(true)
    expect(stepDone('room', start, snapOf(addRoom(base(), 'r2', { x: 6, z: 0, w: 3, d: 3 }), view()))).toBe(true)
  })

  it('«свет» — время суток заметно сдвинули', () => {
    const start = snapOf(base(), view())
    expect(stepDone('light', start, snapOf(setLight(base(), 0.43), view()))).toBe(false)
    expect(stepDone('light', start, snapOf(setLight(base(), 0.8), view()))).toBe(true)
  })

  it('«вид сверху» — включён план; если он уже был включён, шаг сразу засчитан', () => {
    const start = snapOf(base(), view())
    expect(stepDone('plan', start, snapOf(base(), view()))).toBe(false)
    expect(stepDone('plan', start, snapOf(base(), view({ mode: 'plan' })))).toBe(true)
  })

  it('шаги идут по порядку, пропуск тоже ведёт дальше, после последнего обучение окончено', () => {
    let st = tourStart()
    expect(st).toEqual({ index: 0, passed: [], finished: false })
    st = tourAdvance(st, true)
    st = tourAdvance(st, false)
    expect(st).toEqual({ index: 2, passed: [true, false], finished: false })
    for (let i = 2; i < TOUR_STEPS.length; i++) st = tourAdvance(st, true)
    expect(st.finished).toBe(true)
    expect(st.passed.length).toBe(TOUR_STEPS.length)
    expect(tourAdvance(st, true)).toEqual(st)
  })
})
