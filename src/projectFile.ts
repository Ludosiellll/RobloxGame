// Проект файлом: архив zip с описанием проекта и файлами своих моделей. Разбор описания — в core/projectFile.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Doc } from './core/doc'
import { PROJECT_MANIFEST, archivePath, buildManifest, imageFilePath, modelFilePath, parseManifest, type ProjectModel } from './core/projectFile'
import type { FileSet } from './scene/importers'
import type { UserModel } from './scene/models'

export interface OpenedProject {
  doc: Doc
  models: { meta: ProjectModel; files: FileSet }[]
  /** сколько моделей из описания не нашлось в архиве */
  missing: number
  /** картинка плана квартиры, если она есть в архиве; сырая, из недоверенного файла */
  image: { id: string; blob: Blob } | null
}

export type OpenResult = { ok: true; project: OpenedProject } | { ok: false; reason: 'not_project' | 'newer' | 'broken' }

/** Собрать архив проекта. planImage — картинка плана квартиры, если она есть в проекте. */
export async function packProject(doc: Doc, models: UserModel[], planImage: Blob | null): Promise<Blob> {
  const named = models.map((m) => ({ model: m, files: [...m.files].map(([name, blob]) => ({ path: archivePath(name), blob })) }))
  const manifest = buildManifest(
    doc,
    named.map(({ model: m, files }) => ({ id: m.id, name: m.name, main: archivePath(m.main), tilt: m.tilt, files: files.map((f) => f.path) })),
  )
  const entries: Record<string, Uint8Array> = { [PROJECT_MANIFEST]: strToU8(JSON.stringify(manifest)) }
  for (const meta of manifest.models) {
    const src = named.find((n) => n.model.id === meta.id)
    for (const f of src?.files ?? []) entries[modelFilePath(meta.id, f.path)] = new Uint8Array(await f.blob.arrayBuffer())
  }
  const plan = doc.scene.underlay
  if (plan && planImage) entries[imageFilePath(plan.image)] = new Uint8Array(await planImage.arrayBuffer())
  return new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: 'application/zip' })
}

export async function readProject(file: Blob): Promise<OpenResult> {
  let bytes: Uint8Array
  let head: Record<string, Uint8Array>
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
    // сначала достаём только описание: обычный архив с моделью не распаковываем дважды
    head = unzipSync(bytes, { filter: (f) => f.name === PROJECT_MANIFEST })
  } catch {
    return { ok: false, reason: 'not_project' }
  }
  if (!head[PROJECT_MANIFEST]) return { ok: false, reason: 'not_project' }
  const parsed = parseManifest(strFromU8(head[PROJECT_MANIFEST]))
  if (!parsed.ok) return parsed
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes, { filter: (f) => f.name.startsWith('models/') || f.name.startsWith('images/') })
  } catch {
    return { ok: false, reason: 'broken' }
  }
  const models: OpenedProject['models'] = []
  let missing = 0
  for (const meta of parsed.models) {
    const files: FileSet = new Map()
    for (const name of meta.files) {
      const data = entries[modelFilePath(meta.id, name)]
      if (data) files.set(name, new Blob([data as BlobPart]))
    }
    if (files.size === meta.files.length) models.push({ meta, files })
    else missing++
  }
  const plan = parsed.doc.scene.underlay
  const planBytes = plan ? entries[imageFilePath(plan.image)] : undefined
  const image = plan && planBytes ? { id: plan.image, blob: new Blob([planBytes as BlobPart]) } : null
  return { ok: true, project: { doc: parsed.doc, models, missing, image } }
}
