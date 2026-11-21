import { describe, expect, it } from 'vitest'
import { AdGate, newerSave, pickLang } from '@shared/platform/logic'

describe('pickLang', () => {
  it('russian-speaking regions get ru', () => {
    for (const raw of ['ru', 'be', 'uk', 'kk', 'uz', 'ky', 'tg', 'hy', 'az']) {
      expect(pickLang(raw, ['ru', 'en', 'tr'])).toBe('ru')
    }
  })
  it('turkish gets tr only when the game has it', () => {
    expect(pickLang('tr', ['ru', 'en', 'tr'])).toBe('tr')
    expect(pickLang('tr', ['ru', 'en'])).toBe('en')
  })
  it('everything else falls back to en, then to the first supported', () => {
    expect(pickLang('de', ['ru', 'en'])).toBe('en')
    expect(pickLang('', ['ru', 'en'])).toBe('en')
    expect(pickLang('de', ['ru'])).toBe('ru')
  })
})

describe('newerSave', () => {
  it('picks the save with the later savedAt', () => {
    const a = { savedAt: 10, coins: 1 }
    const b = { savedAt: 20, coins: 2 }
    expect(newerSave(a, b)).toBe(b)
    expect(newerSave(b, a)).toBe(b)
  })
  it('ignores missing or broken saves', () => {
    const a: { savedAt?: number; coins?: number } = { savedAt: 10 }
    expect(newerSave(a, null)).toBe(a)
    expect(newerSave(undefined, a)).toBe(a)
    expect(newerSave({ coins: 1 }, a)).toBe(a)
    expect(newerSave(null, undefined)).toBe(null)
  })
})

describe('AdGate', () => {
  it('allows the first ad and blocks the next one inside the gap', () => {
    const gate = new AdGate(60_000)
    expect(gate.canShow(0)).toBe(true)
    gate.mark(0)
    expect(gate.canShow(59_999)).toBe(false)
    expect(gate.canShow(60_000)).toBe(true)
  })
})
