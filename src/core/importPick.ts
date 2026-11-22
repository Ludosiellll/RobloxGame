// Выбор файла модели из набора загруженных файлов (в том числе из архива Sketchfab).

export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'dae', '3mf', 'stl', 'ply'] as const
export type ModelExt = (typeof MODEL_EXTS)[number]

export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(i + 1).toLowerCase() : ''
}

export const isModelFile = (name: string): boolean => (MODEL_EXTS as readonly string[]).includes(extOf(name))
/** Картинка, которую можно положить на коврик как план квартиры. */
export const isImageFile = (name: string): boolean => ['png', 'jpg', 'jpeg', 'webp'].includes(extOf(name))
export const isArchive = (name: string): boolean => extOf(name) === 'zip'

const isJunk = (path: string) => /(^|\/)(__MACOSX|\.[^/]*)(\/|$)/.test(path) || /(^|\/)\._/.test(path)

/** Главный файл модели: glb, затем gltf и остальные форматы; из равных — тот, что ближе к корню. */
export function pickMainFile(names: string[]): string | null {
  const candidates = names.filter((n) => !isJunk(n) && isModelFile(n))
  if (!candidates.length) return null
  const rank = (n: string) => (MODEL_EXTS as readonly string[]).indexOf(extOf(n))
  const depth = (n: string) => n.split('/').length
  return [...candidates].sort((a, b) => rank(a) - rank(b) || depth(a) - depth(b) || a.localeCompare(b))[0]
}

export function titleFromFile(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '')
  const words = base.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return 'Model'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const norm = (p: string) => {
  let s = p
  try {
    s = decodeURIComponent(p)
  } catch {
    // оставляем как есть
  }
  return s.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

/** Найти файл, на который ссылается модель (текстура, .bin, .mtl), среди загруженных. */
export function resolveSibling(names: string[], requested: string, mainFile: string): string | null {
  const want = norm(requested)
  const dir = mainFile.includes('/') ? mainFile.slice(0, mainFile.lastIndexOf('/') + 1).toLowerCase() : ''
  const exact = names.find((n) => n.toLowerCase() === dir + want)
  if (exact) return exact
  const base = want.split('/').pop() ?? want
  const byBase = names.filter((n) => (n.toLowerCase().split('/').pop() ?? '') === base)
  if (!byBase.length) return null
  return byBase.find((n) => n.toLowerCase().startsWith(dir)) ?? byBase[0]
}

/** Ссылка из модели, для которой нет загруженного файла: наружу не ходим, подставляем пустышку. */
export function offlineRef(url: string): string {
  if (/^(data|blob):/i.test(url)) return url
  const path = url.split(/[?#]/)[0]
  // прозрачная точка 1×1: материал остаётся без рисунка, но загрузка не ломается
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga', 'ktx2'].includes(extOf(path))) return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  return 'data:application/octet-stream;base64,'
}
