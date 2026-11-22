import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES, KIT, KIT_THUMB, SLOT_NAMES } from '../src/core/catalog'

describe('catalog', () => {
  const files = readdirSync('assets/kit').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4))

  it('every model file is in the catalog exactly once', () => {
    const keys = KIT.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual([...files].sort())
    expect(KIT_THUMB.count).toBe(files.length)
  })

  it('the model pack holds every catalog model, byte for byte', () => {
    const pack = JSON.parse(readFileSync('public/models/kit.json', 'utf8')) as { models: Record<string, string> }
    expect(Object.keys(pack.models).sort()).toEqual([...files].sort())
    for (const k of KIT) {
      const packed = Buffer.from(pack.models[k.key], 'base64')
      expect(packed.equals(readFileSync(`assets/kit/${k.key}.glb`)), k.key).toBe(true)
    }
  })

  it('every item has names, a known category and a real size', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id))
    for (const k of KIT) {
      expect(k.ru.length, k.key).toBeGreaterThan(1)
      expect(k.en.length, k.key).toBeGreaterThan(1)
      expect(cats.has(k.cat), k.key).toBe(true)
      expect(k.w > 0 && k.h > 0 && k.d > 0, k.key).toBe(true)
    }
  })

  it('every material slot of the kit has a label', () => {
    for (const k of KIT) for (const s of k.slots) expect(SLOT_NAMES[s], `${k.key}: ${s}`).toBeTruthy()
  })
})
