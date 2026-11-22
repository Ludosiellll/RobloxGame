import { describe, expect, it } from 'vitest'
import { harmonies, hexToHsl, hslToHex, projectColors, turnHue } from '../src/core/color'
import { addItem, addRoom, defaultDoc, setItemColor, setWalls, updateRoom } from '../src/core/doc'

describe('цвет', () => {
  it('переводит цвет в тон, насыщенность и светлоту и обратно', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 1, l: 0.5 })
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 1 })
    for (const hex of ['#2f6257', '#f4c430', '#c79a6b', '#1d2226', '#bfe0ea']) expect(hslToHex(hexToHsl(hex))).toBe(hex)
  })

  it('поворачивает тон по кругу художника: напротив красного — зелёный, синего — оранжевый, жёлтого — фиолетовый', () => {
    expect(turnHue('#ff0000', 180)).toBe('#00ff00')
    expect(turnHue('#0000ff', 180)).toBe('#ff8000')
    expect(turnHue('#ffff00', 180)).toBe('#aa00ff')
    expect(turnHue('#ff0000', 360)).toBe('#ff0000')
    expect(turnHue('#ff0000', -120)).toBe('#0000ff')
  })

  it('триада красного — жёлтый и синий', () => {
    const triad = harmonies('#ff0000').find((g) => g.id === 'triad')
    expect(triad?.colors).toEqual(['#ffff00', '#0000ff'])
  })

  it('даёт триаду, контраст, соседние и оттенки, сохраняя насыщенность и светлоту основы', () => {
    const base = hexToHsl('#2f6257')
    const groups = harmonies('#2f6257')
    expect(groups.map((g) => [g.id, g.colors.length])).toEqual([['triad', 2], ['contrast', 3], ['analogous', 2], ['shades', 3]])
    for (const g of groups.filter((q) => q.id !== 'shades')) {
      for (const hex of g.colors) {
        const c = hexToHsl(hex)
        expect(Math.abs(c.s - base.s)).toBeLessThan(0.02)
        expect(Math.abs(c.l - base.l)).toBeLessThan(0.02)
        expect(hex).not.toBe('#2f6257')
      }
    }
  })

  it('у серого и белого нет сочетаний по кругу — только оттенки', () => {
    expect(harmonies('#808080').map((g) => g.id)).toEqual(['shades'])
    expect(harmonies('#f1f0ea').map((g) => g.id)).toEqual(['shades'])
  })

  it('оттенки: светлее, темнее и приглушённый — и не выходят за белое и чёрное', () => {
    const [lighter, darker, muted] = harmonies('#2f6257').find((g) => g.id === 'shades')!.colors
    const base = hexToHsl('#2f6257')
    expect(hexToHsl(lighter).l).toBeGreaterThan(base.l)
    expect(hexToHsl(darker).l).toBeLessThan(base.l)
    expect(hexToHsl(muted).s).toBeLessThan(base.s)
    for (const hex of [...harmonies('#ffffff')[0].colors, ...harmonies('#000000')[0].colors]) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('собирает цвета проекта без повторов: стены, полы, перекрашенные предметы', () => {
    let doc = setWalls(defaultDoc(), { color: '#aabbcc' })
    doc = addRoom(doc, 'r2', { x: 6, z: 0, w: 3, d: 3 })
    doc = updateRoom(doc, 'r2', { floor: { kind: 'plain', color: '#112233' } })
    doc = addItem(doc, { kind: 'kit', key: 'chair' }, 'a', { x: 0, z: 0 })
    doc = setItemColor(doc, 'a', 'wood', '#AABBCC')
    doc = setItemColor(doc, 'a', 'fabric', '#445566')
    expect(projectColors(doc)).toEqual(['#aabbcc', '#c79a6b', '#112233', '#445566'])
  })
})
