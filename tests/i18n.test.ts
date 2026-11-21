import { describe, expect, it } from 'vitest'
import { createI18n } from '@shared/i18n'

describe('i18n', () => {
  const dicts = { ru: { hi: 'Привет, {name}', only: 'только ru' }, en: { hi: 'Hi, {name}' } }
  it('uses the chosen language and fills variables', () => {
    expect(createI18n(dicts, 'en')('hi', { name: 'Den' })).toBe('Hi, Den')
  })
  it('falls back to russian, then to the key', () => {
    expect(createI18n(dicts, 'en')('only')).toBe('только ru')
    expect(createI18n(dicts, 'tr')('hi', { name: 'A' })).toBe('Привет, A')
    expect(createI18n(dicts, 'ru')('missing')).toBe('missing')
  })
})
