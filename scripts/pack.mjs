// Склеивает модели каталога в один файл данных: public/models/kit.json (ключ → GLB в base64).
// JSON, а не двоичный файл, потому что площадка публикации отдаёт только обычные веб-типы.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dir = join(ROOT, 'assets/kit')
const keys = readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort()
const models = {}
for (const key of keys) models[key] = readFileSync(join(dir, `${key}.glb`)).toString('base64')
const out = JSON.stringify({ v: 1, license: 'Kenney Furniture Kit, CC0', models })
writeFileSync(join(ROOT, 'public/models/kit.json'), out)
console.log(`${keys.length} моделей → public/models/kit.json (${(out.length / 1048576).toFixed(2)} МБ)`)
