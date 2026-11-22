// Записи для обучения: настоящие действия в собранном приложении, снятые кадр за кадром.
// node scripts/clips.mjs [ru en] [шаг ...] — пишет public/tour/<шаг>-<язык>.mp4. Перед запуском нужен npm run build.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, GL_ARGS } from './serve.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const OUT = join(ROOT, 'public/tour')
const args = process.argv.slice(2)
const LANGS = args.filter((a) => a === 'ru' || a === 'en')
const ONLY = args.filter((a) => a !== 'ru' && a !== 'en')
const W = 1200
const H = 750
/** размер ролика: в панели обучения он показывается вдвое мельче, поэтому остаётся чётким */
const CW = 600
const CH = 376
const FPS = 20

const { server, url } = await serve(join(ROOT, 'dist'))
const browser = await chromium.launch({ args: GL_ARGS })
mkdirSync(OUT, { recursive: true })

for (const lang of LANGS.length ? LANGS : ['ru', 'en']) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, locale: lang === 'ru' ? 'ru-RU' : 'en-US', deviceScaleFactor: 1 })
  // обучение в кадре не нужно; указатель мыши в записи рисуем сами — у браузера без окна его нет
  await context.addInitScript(() => {
    try {
      localStorage.setItem('maket.tour', 'done')
    } catch {}
    window.addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div')
      c.id = 'rec-cursor'
      c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:22px;height:22px;transform:translate(-100px,-100px)'
      c.innerHTML = '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M3 2v15.2l4.2-3.7 2.9 6.3 2.5-1.1-2.9-6.2h5.6z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>'
      document.documentElement.append(c)
      window.addEventListener('mousemove', (e) => (c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`), true)
    })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  const fresh = async () => {
    await page.evaluate(() => { try { localStorage.removeItem('maket.project.v1') } catch {} }).catch(() => {})
    await page.goto(url)
    await page.waitForFunction(() => window.__maket, null, { timeout: 20000 })
    await page.waitForFunction(() => { const m = window.__maket; return m.items.pickables().every((g) => !g.children.some((c) => c.userData.ghost)) }, null, { timeout: 20000 })
    await page.waitForTimeout(600)
  }
  /** точка сцены на экране */
  const at = (x, y, z) => page.evaluate(([x, y, z]) => { const m = window.__maket; const p = m.stage.project(new m.THREE.Vector3(x, y, z)); const r = m.stage.renderer.domElement.getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top } }, [x, y, z])
  const mid = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)
  /** кадр ролика вокруг заданных точек: чтобы все они были видны */
  const frameAround = (pts, bias = { x: 0, y: 0 }) => {
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2 + bias.x
    const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2 + bias.y
    return { x: Math.round(Math.min(W - CW, Math.max(0, cx - CW / 2))), y: Math.round(Math.min(H - CH, Math.max(0, cy - CH / 2))), width: CW, height: CH }
  }

  /** состояние приложения: по разнице до и после видно, сработало ли действие, которое показывает ролик */
  const probe = () => page.evaluate(() => {
    const m = window.__maket
    const d = m.store.doc
    return { items: d.items.length, pos: d.items.map((i) => `${i.x},${i.z}`).join(';'), rot: d.items.map((i) => i.rot).join(), colors: JSON.stringify(d.items.map((i) => i.colors)), rooms: d.rooms.map((r) => `${r.w}x${r.d}`).join(), time: d.light.time, view: m.stage.view, az: m.stage.controls.getAzimuthalAngle(), sel: m.store.selection?.kind ?? null, lastRot: d.items[d.items.length - 1]?.rot, lastColors: JSON.stringify(d.items[d.items.length - 1]?.colors ?? {}) }
  })
  const CHECKS = {
    look: (a, b) => Math.abs(a.az - b.az) > 0.2,
    add: (a, b) => b.items === a.items + 1,
    move: (a, b) => a.pos !== b.pos && a.items === b.items,
    // кресло для этих шагов добавляется повёрнутым на 90° и без своих цветов
    turn: (a, b) => b.items === a.items + 1 && b.lastRot === 270,
    paint: (a, b) => b.items === a.items + 1 && b.lastColors !== '{}',
    room: (a, b) => a.rooms !== b.rooms && b.sel === 'room',
    light: (a, b) => Math.abs(a.time - b.time) > 0.2,
    plan: (a, b) => a.view === '3d' && b.view === 'plan',
  }

  const record = async (name, run) => {
    if (ONLY.length && !ONLY.includes(name)) return
    await fresh()
    const frames = []
    let clip = { x: 0, y: 0, width: CW, height: CH }
    let cur = { x: 0, y: 0 }
    const snap = async () => {
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      frames.push(await page.screenshot({ clip, type: 'png' }))
    }
    const api = {
      setClip: (c) => (clip = c),
      jump: async (p) => { cur = p; await page.mouse.move(p.x, p.y) },
      hold: async (n) => { for (let i = 0; i < n; i++) await snap() },
      /** плавно провести мышь в точку: быстрее в середине пути, как рука */
      glide: async (to, n) => {
        const from = cur
        for (let i = 1; i <= n; i++) {
          const t = i / n
          const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
          await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k)
          await snap()
        }
        cur = to
      },
      down: () => page.mouse.down(),
      up: () => page.mouse.up(),
      click: async () => { await page.mouse.down(); await snap(); await page.mouse.up(); await snap() },
    }
    const before = await probe()
    await run(api)
    const after = await probe()
    const worked = CHECKS[name](before, after)
    if (!worked) throw new Error(`ролик «${name}» (${lang}): действие в кадре не сработало — ${JSON.stringify({ before, after })}`)
    const dir = mkdtempSync(join(tmpdir(), 'maket-clip-'))
    frames.forEach((buf, i) => writeFileSync(join(dir, `f${String(i).padStart(4, '0')}.png`), buf))
    const file = join(OUT, `${name}-${lang}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, 'f%04d.png'), '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'veryslow', '-movflags', '+faststart', '-an', file])
    rmSync(dir, { recursive: true, force: true })
    console.log(`${name}-${lang}.mp4  кадров ${frames.length}  ${(statSync(file).size / 1024).toFixed(0)} КБ`)
  }

  // вещь для шагов «повернуть» и «покрасить»: кресло в свободном углу спальни, справа в кадре — рядом с панелью свойств
  const addChair = () => page.evaluate(async () => {
    const m = window.__maket
    const id = m.interact.addItem({ kind: 'kit', key: 'loungeChair' }, { x: 3.15, z: 0.3 })
    m.store.update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, rot: 90 } : i)) }))
    for (let n = 0; n < 100 && !m.items.size(id); n++) await new Promise((r) => setTimeout(r, 100))
    await new Promise((r) => setTimeout(r, 400))
    return id
  })

  await record('look', async (a) => {
    const v = await mid('.view')
    a.setClip(frameAround([v]))
    await a.jump({ x: v.x - 190, y: v.y + 120 })
    await a.hold(5)
    await a.glide({ x: v.x - 150, y: v.y + 130 }, 6)
    await a.down()
    await a.glide({ x: v.x + 90, y: v.y + 120 }, 30)
    await a.up()
    await a.hold(14)
  })

  await record('add', async (a) => {
    const tile = await page.evaluate(() => { const t = [...document.querySelectorAll('.tiles .tile')].find((el) => /^(Кресло|Armchair)$/.test(el.textContent.trim())); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 } })
    const spot = await at(-1.6, 0, 1.3)
    a.setClip(frameAround([tile, spot], { x: 0, y: 30 }))
    await a.jump({ x: tile.x + 150, y: tile.y + 90 })
    await a.hold(4)
    await a.glide(tile, 12)
    await a.hold(3)
    await a.down()
    await a.glide({ x: tile.x + 14, y: tile.y + 4 }, 3)
    await a.glide(spot, 26)
    await a.hold(3)
    await a.up()
    await a.hold(16)
  })

  await record('move', async (a) => {
    const from = await at(-2.2, 0.45, -0.3)
    const to = await at(-1.4, 0.45, 1.5)
    a.setClip(frameAround([from, to]))
    await a.jump({ x: from.x - 120, y: from.y + 100 })
    await a.hold(4)
    await a.glide(from, 12)
    await a.down()
    await a.hold(2)
    await a.glide(to, 28)
    await a.up()
    await a.hold(14)
  })

  await record('turn', async (a) => {
    await addChair()
    const item = await at(3.15, 0.5, 0.3)
    const btn = await mid('[data-tour="rotate"] .btn:last-child')
    a.setClip(frameAround([item, btn], { x: 0, y: 30 }))
    await a.jump({ x: item.x + 60, y: item.y + 70 })
    await a.hold(5)
    await a.glide(btn, 18)
    await a.hold(3)
    await a.click()
    await a.hold(10)
    await a.click()
    await a.hold(16)
  })

  await record('paint', async (a) => {
    await addChair()
    const item = await at(3.15, 0.5, 0.3)
    const chip = await mid('[data-tour="colors"] .chip')
    a.setClip(frameAround([item, chip], { x: 0, y: 40 }))
    await a.jump({ x: item.x + 60, y: item.y + 70 })
    await a.hold(5)
    await a.glide(chip, 16)
    await a.hold(3)
    await a.click()
    await a.hold(6)
    const sw = await page.evaluate(() => { const els = [...document.querySelectorAll('.picker .swatch')]; const pick = (n) => { const r = els[n].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }; return [pick(53), pick(28), pick(40)] })
    for (const p of sw) {
      await a.glide(p, 12)
      await a.click()
      await a.hold(9)
    }
    await a.hold(8)
  })

  await record('room', async (a) => {
    // свободное место пола перед диваном; тянем ближний край гостиной наружу
    const floor = await at(-0.9, 0, 1.9)
    const edge = await at(-0.3, 0.04, 2.2)
    const out = await at(-0.3, 0.04, 3.3)
    a.setClip(frameAround([floor, edge, out], { x: 40, y: -40 }))
    await a.jump({ x: floor.x - 110, y: floor.y + 70 })
    await a.hold(4)
    await a.glide(floor, 12)
    await a.click()
    await a.hold(8)
    await a.glide(edge, 14)
    await a.down()
    await a.hold(2)
    await a.glide(out, 26)
    await a.up()
    await a.hold(14)
  })

  await record('light', async (a) => {
    const input = await page.evaluate(() => { const el = document.querySelector('#f-time'); const r = el.getBoundingClientRect(); const v = (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)); return { x: r.left + 8 + (r.width - 16) * v, y: r.top + r.height / 2, right: r.right - 10 } })
    const scene = await at(2.6, 0.8, 0)
    a.setClip(frameAround([{ x: input.x, y: input.y }, scene], { x: 40, y: 60 }))
    await a.jump({ x: input.x - 110, y: input.y + 110 })
    await a.hold(5)
    await a.glide({ x: input.x, y: input.y }, 14)
    await a.down()
    await a.hold(2)
    await a.glide({ x: input.right, y: input.y }, 34)
    await a.up()
    await a.hold(16)
  })

  await record('plan', async (a) => {
    const btn = await mid('.toolbar .seg .seg-btn:last-child')
    a.setClip({ x: Math.round(Math.min(W - CW, Math.max(0, btn.x - 120))), y: 28, width: CW, height: CH })
    await a.jump({ x: btn.x + 150, y: btn.y + 170 })
    await a.hold(5)
    await a.glide(btn, 16)
    await a.hold(3)
    await a.click()
    await a.hold(26)
  })

  if (errors.length) console.log(`ошибки страницы (${lang}):`, errors.slice(0, 3).join(' | '))
  await context.close()
}
await browser.close()
server.close()
