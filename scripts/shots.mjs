// Снимки собранного приложения: node scripts/shots.mjs [имя] [--phone] [--tour] [--eval "js"]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, GL_ARGS } from './serve.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--')) ?? 'shot'
const phone = args.includes('--phone')
const evalIdx = args.indexOf('--eval')
const script = evalIdx >= 0 ? args[evalIdx + 1] : null
const waitIdx = args.indexOf('--wait')
const wait = waitIdx >= 0 ? Number(args[waitIdx + 1]) : 1500

const { server, url } = await serve(join(ROOT, 'dist'))
const browser = await chromium.launch({ args: GL_ARGS })
const locale = args.includes('--ru') ? 'ru-RU' : 'en-US'
const context = await browser.newContext(phone ? { viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, locale } : { viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1, locale })
// обучение предлагается при первом запуске; в обычных снимках оно мешает, поэтому показывается только с --tour
if (!args.includes('--tour')) await context.addInitScript(() => { try { localStorage.setItem('maket.tour', 'done') } catch {} })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
await page.goto(url)
await page.waitForFunction(() => window.__maket, null, { timeout: 20000 }).catch(() => errors.push('app did not start'))
await page.waitForTimeout(wait)
if (script) {
  const out = await page.evaluate(script).catch((e) => `eval error: ${e}`)
  if (out !== undefined) console.log('eval:', typeof out === 'string' ? out : JSON.stringify(out))
  await page.waitForTimeout(900)
}
mkdirSync(join(ROOT, 'shots'), { recursive: true })
const file = join(ROOT, 'shots', `${name}${phone ? '-phone' : ''}.png`)
await page.screenshot({ path: file })
console.log(file)
console.log(errors.length ? `errors:\n  ${errors.slice(0, 12).join('\n  ')}` : 'no console errors')
await browser.close()
server.close()
