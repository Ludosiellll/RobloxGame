// Значок программы: рисуется кодом → desktop/icon.png (1024) и desktop/icon.ico
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const browser = await chromium.launch()
const page = await browser.newPage()
const png = await page.evaluate(() => {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  // коврик со скруглёнными углами и сеткой
  const r = 190
  g.beginPath()
  g.roundRect(0, 0, S, S, r)
  g.clip()
  g.fillStyle = '#2f6257'
  g.fillRect(0, 0, S, S)
  g.strokeStyle = 'rgba(214,236,224,0.20)'
  g.lineWidth = 3
  for (let i = 0; i <= S; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke()
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke()
  }
  g.strokeStyle = 'rgba(214,236,224,0.42)'
  g.lineWidth = 5
  for (let i = 0; i <= S; i += 256) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke()
    g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke()
  }
  // изометрия: комната 4×4, стены высотой 2.6
  const U = 104
  const ox = S / 2
  const oy = 640
  const P = (x, y, z) => [ox + (x - z) * U * 0.866, oy + (x + z) * U * 0.5 - y * U]
  const poly = (pts, fill) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = fill; g.fill() }
  const A = 2, H = 2.7
  // тень макета на коврике
  poly([P(-A - 0.1, 0, A + 0.35), P(A + 0.5, 0, A + 0.35), P(A + 0.5, 0, -A + 0.4), P(-A - 0.1, 0, -A + 0.4)], 'rgba(10,30,26,0.28)')
  // пол
  poly([P(-A, 0, -A), P(A, 0, -A), P(A, 0, A), P(-A, 0, A)], '#c79a6b')
  g.save()
  g.beginPath(); [P(-A, 0, -A), P(A, 0, -A), P(A, 0, A), P(-A, 0, A)].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.clip()
  g.strokeStyle = 'rgba(90,55,25,0.28)'; g.lineWidth = 4
  for (let k = -A; k <= A; k += 0.5) { const [x1, y1] = P(-A, 0, k); const [x2, y2] = P(A, 0, k); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke() }
  g.restore()
  // две дальние стены из пенокартона
  poly([P(-A, 0, -A), P(A, 0, -A), P(A, H, -A), P(-A, H, -A)], '#f4f3ee')
  poly([P(-A, 0, -A), P(-A, 0, A), P(-A, H, A), P(-A, H, -A)], '#dcdbd3')
  // срез стен сверху
  const T = 0.16
  poly([P(-A, H, -A), P(A, H, -A), P(A, H, -A - T), P(-A - T, H, -A - T), P(-A - T, H, A), P(-A, H, A)], '#c3c4ba')
  // окно в задней стене
  poly([P(-0.2, 1.0, -A), P(1.3, 1.0, -A), P(1.3, 2.05, -A), P(-0.2, 2.05, -A)], '#8fc3cf')
  poly([P(0.52, 1.0, -A), P(0.58, 1.0, -A), P(0.58, 2.05, -A), P(0.52, 2.05, -A)], '#f4f3ee')
  // жёлтый предмет — цвет инструмента
  const box = (x0, z0, x1, z1, h, top, left, right) => {
    poly([P(x0, h, z0), P(x1, h, z0), P(x1, h, z1), P(x0, h, z1)], top)
    poly([P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1)], left)
    poly([P(x1, 0, z0), P(x1, 0, z1), P(x1, h, z1), P(x1, h, z0)], right)
  }
  box(-0.9, -0.2, 0.9, 1.0, 0.75, '#f7d154', '#f4c430', '#d2a200')
  box(-0.9, -0.5, 0.9, -0.2, 1.3, '#f7d154', '#f4c430', '#d2a200')
  return c.toDataURL('image/png')
})
await browser.close()
const file = join(ROOT, 'desktop/icon.png')
writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'))
execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(r'${file}').convert('RGBA')
im.save(r'${join(ROOT, 'desktop/icon.ico')}', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])`])
console.log('desktop/icon.png, desktop/icon.ico')
