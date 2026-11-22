// Файл проекта: архив с описанием (maket.json) и файлами своих моделей. Здесь — только описание, без чтения архива.

import { sanitizeDoc, type Doc } from './doc'

export const PROJECT_MANIFEST = 'maket.json'
export const PROJECT_FORMAT = 1

export interface ProjectModel {
  id: string
  name: string
  main: string
  tilt: number
  files: string[]
}

export interface ProjectManifest {
  app: 'maket'
  format: number
  doc: Doc
  models: ProjectModel[]
}

export type ParseResult = { ok: true; doc: Doc; models: ProjectModel[] } | { ok: false; reason: 'not_project' | 'newer' | 'broken' }

/** Свои модели, которые стоят в сцене, в порядке первого появления. */
export function usedUserModels(doc: Doc): string[] {
  return [...new Set(doc.items.filter((i) => i.src.kind === 'user').map((i) => i.src.key))]
}

/** Описание проекта для записи в файл: в него попадают только модели, которые стоят в сцене. */
export function buildManifest(doc: Doc, models: ProjectModel[]): ProjectManifest {
  const used = new Set(usedUserModels(doc))
  return {
    app: 'maket',
    format: PROJECT_FORMAT,
    doc,
    models: models.filter((m) => used.has(m.id)).map((m) => ({ id: m.id, name: m.name, main: m.main, tilt: m.tilt, files: [...m.files] })),
  }
}

export function modelFilePath(id: string, name: string): string {
  return `models/${id}/${name}`
}

/** Имя файла модели как путь внутри архива: прямые косые черты, без диска, без выхода наверх. */
export function archivePath(name: string): string {
  return name
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:/, '')
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join('/')
}

/** Где в архиве лежит картинка плана квартиры. */
export function imageFilePath(key: string): string {
  return `images/${key}`
}

const isSafeId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)
/** Путь внутри архива: относительный, без выхода наверх. */
const isSafePath = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 300 && !v.startsWith('/') && !v.includes('\\') && !/^[A-Za-z]:/.test(v) && v.split('/').every((part) => part !== '' && part !== '..' && part !== '.')

function cleanModel(raw: unknown): ProjectModel | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isSafeId(o.id) || !Array.isArray(o.files)) return null
  const files = o.files.filter(isSafePath)
  if (files.length !== o.files.length || typeof o.main !== 'string' || !files.includes(o.main)) return null
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 120) : 'Model'
  const tilt = typeof o.tilt === 'number' && Number.isInteger(o.tilt) && o.tilt >= 0 && o.tilt <= 3 ? o.tilt : 0
  return { id: o.id, name, main: o.main, tilt, files }
}

/** Прочитать описание проекта. Сам проект чинится так же, как сохранённый в браузере. */
export function parseManifest(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'broken' }
  }
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== 'maket') return { ok: false, reason: 'not_project' }
  const o = raw as Record<string, unknown>
  if (typeof o.format !== 'number' || !o.doc || typeof o.doc !== 'object') return { ok: false, reason: 'broken' }
  if (o.format > PROJECT_FORMAT) return { ok: false, reason: 'newer' }
  const models = (Array.isArray(o.models) ? o.models : []).map(cleanModel).filter((m): m is ProjectModel => m !== null)
  return { ok: true, doc: sanitizeDoc(o.doc), models }
}

export function projectFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `maket-project-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.zip`
}
