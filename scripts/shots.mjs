// Скриншоты собранной игры на компьютере и телефоне + проверка ошибок в консоли.
// npm run shots -- <id>   (сначала npm run build -- <id>). Файлы: shots/<id>/*.png
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { ROOT, pickGames } from './lib.mjs'

const require = createRequire(import.meta.url)
const { chromium, devices } = require('playwright')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' }

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '')
      const file = join(dir, path || 'index.html')
      if (!file.startsWith(dir) || !existsSync(file)) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const VIEWS = [
  { name: 'desktop', options: { viewport: { width: 1280, height: 720 } } },
  { name: 'phone-portrait', options: { ...devices['Pixel 7'], deviceScaleFactor: 1 } },
  { name: 'phone-landscape', options: { ...devices['Pixel 7 landscape'], deviceScaleFactor: 1 } },
]

let failed = false
for (const id of pickGames(process.argv[2])) {
  const dir = join(ROOT, 'dist', id)
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`Нет dist/${id}: сначала npm run build -- ${id}`)
  const server = await serve(dir)
  const base = `http://127.0.0.1:${server.address().port}/`
  const out = join(ROOT, 'shots', id)
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  for (const lang of ['ru', 'en']) {
    for (const view of VIEWS) {
      if (lang !== 'ru' && view.name !== 'desktop') continue
      const context = await browser.newContext(view.options)
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      page.on('console', (m) => {
        if (m.type() === 'error' && !/sdk\.js|404/.test(m.text())) errors.push(m.text())
      })
      await page.goto(`${base}?lang=${lang}&adms=300`)
      try {
        await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 15_000 })
      } catch {
        errors.push('игра не вызвала markReady() за 15 секунд')
      }
      await page.waitForTimeout(700)
      const scroll = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight }))
      if (scroll.x || scroll.y) errors.push(`у страницы есть прокрутка ${JSON.stringify(scroll)}`)
      const file = join(out, `${view.name}-${lang}.png`)
      await page.screenshot({ path: file })
      console.log(`${id} ${view.name} ${lang}: ${errors.length ? 'ОШИБКИ' : 'ok'} → shots/${id}/${view.name}-${lang}.png`)
      for (const e of errors) console.error(`  ✗ ${e}`)
      if (errors.length) failed = true
      await context.close()
    }
  }
  await browser.close()
  server.close()
}
process.exit(failed ? 1 : 0)
