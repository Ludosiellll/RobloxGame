import { describe, expect, it } from 'vitest'
import { fmt, tr } from '../src/core/i18n'
import { DECKS, findSwatch, isDark } from '../src/core/palette'

describe('i18n', () => {
  it('fills variables and switches language', () => {
    expect(tr('ru', 'added', { name: 'Стул' })).toBe('Добавлено: Стул')
    expect(tr('en', 'added', { name: 'Chair' })).toBe('Added: Chair')
  })
  it('formats numbers with a comma in Russian', () => {
    expect(fmt('ru', 5.4)).toBe('5,4')
    expect(fmt('en', 5.4)).toBe('5.4')
    expect(fmt('ru', 3)).toBe('3')
    expect(fmt('ru', 2.75)).toBe('2,75')
  })
})

describe('palette', () => {
  it('has unique valid colours with names in both languages', () => {
    const seen = new Set<string>()
    for (const d of DECKS) {
      expect(d.swatches.length).toBe(12)
      for (const w of d.swatches) {
        expect(w.hex).toMatch(/^#[0-9a-f]{6}$/)
        expect(seen.has(w.hex), w.hex).toBe(false)
        seen.add(w.hex)
        expect(w.ru.length > 1 && w.en.length > 1).toBe(true)
      }
    }
  })
  it('finds a swatch by colour and knows dark from light', () => {
    expect(findSwatch('#C79A6B')?.ru).toBe('Дуб')
    expect(findSwatch('#123456')).toBe(null)
    expect(isDark('#26292b')).toBe(true)
    expect(isDark('#fbfaf6')).toBe(false)
  })
})
