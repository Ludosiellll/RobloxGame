import { describe, expect, it } from 'vitest'
import { addItem, defaultDoc } from '../src/core/doc'
import { PROJECT_FORMAT, archivePath, buildManifest, modelFilePath, parseManifest, projectFileName, usedUserModels, type ProjectModel } from '../src/core/projectFile'

const model = (id: string, extra: Partial<ProjectModel> = {}): ProjectModel => ({ id, name: 'Кресло', main: 'chair.glb', tilt: 0, files: ['chair.glb'], ...extra })

function docWithUser(...keys: string[]) {
  let doc = addItem(defaultDoc(), { kind: 'kit', key: 'chair' }, 'k1', { x: 0, z: 0 })
  keys.forEach((key, i) => {
    doc = addItem(doc, { kind: 'user', key }, `u${i}`, { x: 0.5, z: 0.5 })
  })
  return doc
}

describe('файл проекта', () => {
  it('перечисляет свои модели, которые стоят в сцене, без повторов', () => {
    expect(usedUserModels(docWithUser('a', 'b', 'a'))).toEqual(['a', 'b'])
    expect(usedUserModels(defaultDoc())).toEqual([])
  })

  it('кладёт в описание только модели, которые есть в сцене', () => {
    const manifest = buildManifest(docWithUser('a'), [model('a'), model('lishnyaya')])
    expect(manifest.app).toBe('maket')
    expect(manifest.format).toBe(PROJECT_FORMAT)
    expect(manifest.models.map((m) => m.id)).toEqual(['a'])
  })

  it('сохранённое описание читается обратно тем же проектом', () => {
    const doc = docWithUser('a')
    const back = parseManifest(JSON.stringify(buildManifest(doc, [model('a', { tilt: 2, files: ['chair.glb', 'tex/wood.png'] })])))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.doc).toEqual(doc)
    expect(back.models).toEqual([model('a', { tilt: 2, files: ['chair.glb', 'tex/wood.png'] })])
  })

  it('чужой и испорченный файл не открывается', () => {
    expect(parseManifest('не json')).toEqual({ ok: false, reason: 'broken' })
    expect(parseManifest(JSON.stringify({ name: 'package' }))).toEqual({ ok: false, reason: 'not_project' })
    expect(parseManifest(JSON.stringify({ app: 'maket', format: 1 }))).toEqual({ ok: false, reason: 'broken' })
  })

  it('файл из более новой версии программы не открывается молча', () => {
    const manifest = { ...buildManifest(defaultDoc(), []), format: PROJECT_FORMAT + 1 }
    expect(parseManifest(JSON.stringify(manifest))).toEqual({ ok: false, reason: 'newer' })
  })

  it('испорченные места проекта чинятся при открытии', () => {
    const manifest = buildManifest(defaultDoc(), [])
    const raw = { ...manifest, doc: { ...manifest.doc, walls: { h: 99, color: 'red' } } }
    const back = parseManifest(JSON.stringify(raw))
    expect(back.ok && back.doc.walls).toEqual({ h: 4, color: '#f1f0ea' })
  })

  it('отбрасывает модели с опасными путями и без главного файла', () => {
    const doc = docWithUser('a', 'b', 'c', 'd')
    const raw = {
      ...buildManifest(doc, []),
      models: [
        model('a', { files: ['../../etc/passwd'], main: '../../etc/passwd' }),
        model('b', { files: ['/abs/chair.glb'], main: '/abs/chair.glb' }),
        model('c', { main: 'net-takogo.glb' }),
        model('../d'),
        model('e', { tilt: 7 }),
      ],
    }
    const back = parseManifest(JSON.stringify(raw))
    expect(back.ok && back.models).toEqual([model('e', { tilt: 0 })])
  })

  it('путь файла модели внутри архива', () => {
    expect(modelFilePath('u1abc', 'tex/wood.png')).toBe('models/u1abc/tex/wood.png')
  })

  it('имена файлов модели приводятся к безопасным путям архива', () => {
    expect(archivePath('tex\\wood.png')).toBe('tex/wood.png')
    expect(archivePath('../../tex/./wood.png')).toBe('tex/wood.png')
    expect(archivePath('/abs/chair.glb')).toBe('abs/chair.glb')
    expect(archivePath('C:\\models\\chair.glb')).toBe('models/chair.glb')
    expect(archivePath('chair.glb')).toBe('chair.glb')
  })

  it('имя файла проекта содержит дату и расширение zip', () => {
    expect(projectFileName(new Date(2026, 10, 22, 9, 5))).toBe('maket-project-2026-11-22-0905.zip')
  })
})
