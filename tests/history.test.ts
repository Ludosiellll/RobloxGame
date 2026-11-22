import { describe, expect, it } from 'vitest'
import { History } from '../src/core/history'

describe('History', () => {
  it('undoes and redoes committed states', () => {
    const h = new History('a')
    h.set('b')
    h.set('c')
    expect(h.present).toBe('c')
    expect(h.undo()).toBe('b')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBe(null)
    expect(h.redo()).toBe('b')
    expect(h.canRedo).toBe(true)
  })

  it('a new change after undo clears redo', () => {
    const h = new History('a')
    h.set('b')
    h.undo()
    h.set('c')
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe('a')
  })

  it('a drag made of many transient steps is one undo step', () => {
    const h = new History('start')
    h.set('drag1', true)
    h.set('drag2', true)
    h.set('drag3', true)
    expect(h.present).toBe('drag3')
    h.seal()
    expect(h.undo()).toBe('start')
    expect(h.undo()).toBe(null)
    expect(h.redo()).toBe('drag3')
  })

  it('ignores a change equal to the current state', () => {
    const h = new History({ n: 1 })
    h.set({ n: 1 })
    expect(h.canUndo).toBe(false)
  })

  it('keeps at most `limit` undo steps', () => {
    const h = new History(0, 3)
    for (let i = 1; i <= 10; i++) h.set(i)
    let steps = 0
    while (h.undo() !== null) steps++
    expect(steps).toBe(3)
  })

  it('amend replaces the present state without touching undo or redo', () => {
    const h = new History('a')
    h.set('b')
    h.set('c')
    h.undo()
    h.amend('b2')
    expect(h.present).toBe('b2')
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toBe('c')
    expect(h.undo()).toBe('b2')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBe(null)
  })

  it('amend in the middle of a drag keeps the drag as one undo step from its start', () => {
    const h = new History('a')
    h.set('a1', true)
    h.amend('a2')
    h.seal()
    expect(h.present).toBe('a2')
    expect(h.undo()).toBe('a')
  })

  it('abort drops an unfinished drag and returns to the state before it', () => {
    const h = new History({ n: 0 })
    h.set({ n: 1 })
    h.set({ n: 5 }, true)
    h.set({ n: 6 }, true)
    h.abort()
    expect(h.present).toEqual({ n: 1 })
    // the dropped drag left no trace: one undo goes back to the start, nothing to redo
    expect(h.undo()).toEqual({ n: 0 })
    expect(h.canUndo).toBe(false)
    h.redo()
    expect(h.present).toEqual({ n: 1 })
  })

  it('abort without an unfinished drag changes nothing', () => {
    const h = new History({ n: 0 })
    h.set({ n: 1 })
    h.abort()
    expect(h.present).toEqual({ n: 1 })
    expect(h.canUndo).toBe(true)
  })
})
