import { describe, expect, it } from 'vitest'
// @ts-expect-error — модуль оболочки программы, без описания типов
import { byteRange } from '../desktop/range.cjs'

describe('byteRange — какую часть файла просит проигрыватель', () => {
  it('без заголовка отдаём файл целиком', () => {
    expect(byteRange(null, 1000)).toBeNull()
    expect(byteRange('', 1000)).toBeNull()
  })
  it('с начала и до конца файла', () => {
    expect(byteRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(byteRange('bytes=200-', 1000)).toEqual({ start: 200, end: 999 })
  })
  it('кусок из середины; конец не дальше размера файла', () => {
    expect(byteRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
    expect(byteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })
  it('последние N байт', () => {
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(byteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })
  it('начало за концом файла — ошибка, а не пустой ответ', () => {
    expect(byteRange('bytes=1000-', 1000)).toBe('bad')
    expect(byteRange('bytes=500-100', 1000)).toBe('bad')
    expect(byteRange('bytes=-0', 1000)).toBe('bad')
  })
  it('непонятный заголовок и несколько кусков сразу — отдаём целиком', () => {
    expect(byteRange('lines=1-2', 1000)).toBeNull()
    expect(byteRange('bytes=0-1,5-6', 1000)).toBeNull()
    expect(byteRange('bytes=-', 1000)).toBeNull()
  })
})
