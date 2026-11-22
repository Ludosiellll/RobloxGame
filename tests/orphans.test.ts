import { describe, expect, it } from 'vitest'
import { addItem, defaultDoc, dropItems } from '../src/core/doc'
import { isOrphan, type ModelsKnown } from '../src/core/orphans'

const known = (userReady: boolean): ModelsKnown => ({ kit: (key) => key === 'chair', user: (key) => key === 'mine', userReady })

describe('предметы без модели', () => {
  it('предмет каталога с неизвестным ключом остался без модели', () => {
    expect(isOrphan({ kind: 'kit', key: 'chair' }, known(false))).toBe(false)
    expect(isOrphan({ kind: 'kit', key: 'net-takogo' }, known(false))).toBe(true)
  })

  it('пока свои модели не прочитаны из хранилища, предмет со своей моделью не считается потерянным', () => {
    expect(isOrphan({ kind: 'user', key: 'propala' }, known(false))).toBe(false)
  })

  it('когда свои модели прочитаны, предмет без модели потерян, а с моделью — нет', () => {
    expect(isOrphan({ kind: 'user', key: 'propala' }, known(true))).toBe(true)
    expect(isOrphan({ kind: 'user', key: 'mine' }, known(true))).toBe(false)
  })

  it('dropItems убирает названные предметы и не трогает документ, если убирать нечего', () => {
    let doc = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'a', { x: 0, z: 0 })
    doc = addItem(doc, { kind: 'user', key: 'propala' }, 'b', { x: 1, z: 0 })
    expect(dropItems(doc, (i) => i.src.kind === 'user').items.map((i) => i.id)).toEqual(['a'])
    expect(dropItems(doc, () => false)).toBe(doc)
  })
})
