import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from 'vite'

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const GAMES = join(ROOT, 'games')

export function gameIds() {
  return readdirSync(GAMES).filter((d) => existsSync(join(GAMES, d, 'index.html')))
}

export function pickGames(arg) {
  const all = gameIds()
  if (!arg || arg === 'all') return all
  if (!all.includes(arg)) throw new Error(`Нет игры games/${arg}. Есть: ${all.join(', ')}`)
  return [arg]
}

// Предупреждение про <script src="/sdk.js"> ожидаемое: этот тег Vite и не должен трогать.
const logger = createLogger('warn')
const warn = logger.warn
logger.warn = (msg, opts) => {
  if (!msg.includes('/sdk.js')) warn(msg, opts)
}

export function viteConfig(id) {
  return {
    customLogger: logger,
    configFile: false,
    root: join(GAMES, id),
    base: './',
    logLevel: 'warn',
    resolve: { alias: { '@shared': join(ROOT, 'shared') } },
    build: {
      outDir: join(ROOT, 'dist', id),
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 0,
      reportCompressedSize: false,
    },
  }
}

export function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

// Требования Яндекс Игр к архиву (п. 1.7, 1.21, 1.22 полного списка, сверено 2026-11-21).
export function checkBuild(dir) {
  const problems = []
  const files = walk(dir)
  if (!existsSync(join(dir, 'index.html'))) problems.push('нет index.html в корне')
  let total = 0
  for (const f of files) {
    const rel = relative(dir, f)
    total += statSync(f).size
    if (/[\s]/.test(rel) || /[^\x00-\x7F]/.test(rel)) problems.push(`пробел или не латиница в имени: ${rel}`)
    if (/\.(js|html|css|json)$/.test(f) && readFileSync(f, 'utf8').includes('games.s3.yandex.net')) {
      problems.push(`абсолютный адрес games.s3.yandex.net в ${rel} (архив отклонят с SERVICE_STORAGE_URL_DETECTED)`)
    }
  }
  const html = existsSync(join(dir, 'index.html')) ? readFileSync(join(dir, 'index.html'), 'utf8') : ''
  if (!html.includes('src="/sdk.js"')) problems.push('в index.html нет <script src="/sdk.js">')
  if (total > 100 * 1024 * 1024) problems.push(`размер ${(total / 1048576).toFixed(1)} МБ больше 100 МБ`)
  return { problems, total, files: files.length }
}
