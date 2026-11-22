// Готовит страницу для публикации артефактом: artifact/maket.html + список файлов рядом с ней.
// Страница без doctype/html/head/body (их добавляет площадка), стили встроены, скрипт и модели — отдельными файлами.
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const parts = [...html.matchAll(/<!--page-->([\s\S]*?)<!--\/page-->/g)].map((m) => m[1].trim())
if (parts.length !== 2) throw new Error('в index.html должны быть два блока <!--page-->')
const css = readFileSync(join(DIST, 'assets/style.css'), 'utf8')
const head = parts[0]
const page = `${head}\n<style>\n${css}\n</style>\n${parts[1]}\n<script type="module" src="app.js"></script>\n`
mkdirSync(join(ROOT, 'artifact'), { recursive: true })
writeFileSync(join(ROOT, 'artifact/maket.html'), page)

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = {}
let bytes = 0
for (const f of walk(DIST)) {
  const rel = relative(DIST, f).split('\\').join('/')
  // страница и стили уже внутри maket.html; запасные копии декодера из сборки не нужны
  if (rel === 'index.html' || rel.startsWith('assets/')) continue
  files[rel] = relative(ROOT, f).split('\\').join('/')
  bytes += statSync(f).size
}
writeFileSync(join(ROOT, 'artifact/files.json'), JSON.stringify(files, null, 1))
console.log(`artifact/maket.html ${(page.length / 1024).toFixed(1)} КБ; файлов рядом: ${Object.keys(files).length}, ${(bytes / 1048576).toFixed(2)} МБ`)
