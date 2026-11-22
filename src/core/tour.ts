// Обучение: шаги и правила, по которым шаг считается пройденным. Сам показ — в ui/tour.ts.

import type { Doc } from './doc'

export type TourStepId = 'look' | 'add' | 'move' | 'turn' | 'paint' | 'room' | 'light' | 'plan'

/** Порядок выбран так, чтобы обучение проходилось в любом проекте, даже в пустой комнате: сначала вещь добавляют, потом двигают. */
export const TOUR_STEPS: TourStepId[] = ['look', 'add', 'move', 'turn', 'paint', 'room', 'light', 'plan']

export interface TourView {
  mode: '3d' | 'plan'
  /** поворот вида вокруг вертикали, радианы */
  azimuth: number
  /** наклон вида, радианы */
  polar: number
  /** расстояние от камеры до точки, на которую она смотрит */
  distance: number
}

/** Что было в начале шага и что стало — по разнице видно, сделал ли человек действие. */
export interface TourSnap {
  doc: Doc
  view: TourView
}

export interface TourState {
  index: number
  /** пройден ли каждый из уже оставленных позади шагов (false — пропущен) */
  passed: boolean[]
  finished: boolean
}

export function snapOf(doc: Doc, view: TourView): TourSnap {
  return { doc, view }
}

/** Наименьший угол между двумя направлениями, с учётом перехода через границу круга. */
function turn(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2)
  return d > Math.PI ? Math.PI * 2 - d : d
}

export function stepDone(step: TourStepId, start: TourSnap, now: TourSnap): boolean {
  const a = start.doc
  const b = now.doc
  const before = new Map(a.items.map((i) => [i.id, i]))
  switch (step) {
    case 'look':
      return turn(start.view.azimuth, now.view.azimuth) > 0.25 || Math.abs(start.view.polar - now.view.polar) > 0.15 || Math.abs(now.view.distance / start.view.distance - 1) > 0.12
    case 'add':
      return b.items.some((i) => !before.has(i.id))
    case 'move':
      return b.items.some((i) => {
        const was = before.get(i.id)
        return !!was && Math.hypot(i.x - was.x, i.z - was.z) >= 0.15
      })
    case 'turn':
      return b.items.some((i) => {
        const was = before.get(i.id)
        return !!was && was.rot !== i.rot
      })
    case 'paint':
      return (
        a.walls.color !== b.walls.color ||
        b.rooms.some((r) => a.rooms.find((q) => q.id === r.id)?.floor.color !== r.floor.color && a.rooms.some((q) => q.id === r.id)) ||
        b.items.some((i) => {
          const was = before.get(i.id)
          return !!was && JSON.stringify(was.colors) !== JSON.stringify(i.colors)
        })
      )
    case 'room':
      return b.rooms.length !== a.rooms.length || b.rooms.some((r) => {
        const was = a.rooms.find((q) => q.id === r.id)
        return !!was && (was.x !== r.x || was.z !== r.z || was.w !== r.w || was.d !== r.d)
      })
    case 'light':
      return Math.abs(a.light.time - b.light.time) >= 0.05
    case 'plan':
      return now.view.mode === 'plan'
  }
}

export function tourStart(): TourState {
  return { index: 0, passed: [], finished: false }
}

/** Перейти к следующему шагу. passed = false — шаг пропустили. */
export function tourAdvance(state: TourState, passed: boolean): TourState {
  if (state.finished) return state
  const done = [...state.passed, passed]
  const index = state.index + 1
  return { index, passed: done, finished: index >= TOUR_STEPS.length }
}
