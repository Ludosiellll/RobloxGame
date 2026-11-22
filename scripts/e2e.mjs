// Сквозная проверка в настоящем браузере: выбор, перетаскивание, отмена, каталог, комнаты, проёмы, импорт, сохранение.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'
import { serve, GL_ARGS } from './serve.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
mkdirSync(join(ROOT, 'shots'), { recursive: true })
const { server, url } = await serve(join(ROOT, 'dist'))
const browser = await chromium.launch({ args: GL_ARGS })
const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, locale: 'ru-RU' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++ }
const shot = (name) => page.screenshot({ path: join(ROOT, 'shots', `${name}.png`) })
const state = () => page.evaluate(() => { const m = window.__maket; const d = m.store.doc; return { items: d.items.length, rooms: d.rooms.map((r) => ({ id: r.id, x: r.x, z: r.z, w: r.w, d: r.d })), openings: d.openings.length, sel: m.store.selection, user: m.userModels.list.length } })
const screenOf = (x, y, z) => page.evaluate(([x, y, z]) => { const m = window.__maket; const p = m.stage.project(new m.THREE.Vector3(x, y, z)); const r = m.stage.renderer.domElement.getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top } }, [x, y, z])
const item = (key) => page.evaluate((key) => window.__maket.store.doc.items.find((i) => i.src.key === key), key)

await page.goto(url)
await page.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await page.waitForTimeout(2500)

// 1. выбор щелчком
let sofa = await item('loungeSofa')
let p = await screenOf(sofa.x, 0.5, sofa.z)
await page.mouse.click(p.x, p.y)
let s = await state()
check('щелчок выбирает диван', s.sel?.kind === 'item' && s.sel.id === sofa.id, JSON.stringify(s.sel))

// 2. перетаскивание и отмена
await page.mouse.move(p.x, p.y)
await page.mouse.down()
await page.mouse.move(p.x - 20, p.y - 4, { steps: 4 })
await page.mouse.move(p.x - 42, p.y - 8, { steps: 4 })
await page.mouse.up()
const moved = await item('loungeSofa')
check('диван передвинулся', Math.hypot(moved.x - sofa.x, moved.z - sofa.z) > 0.15, `${sofa.x},${sofa.z} → ${moved.x},${moved.z}`)
check('привязка к сетке 5 см', Math.abs(moved.x * 20 - Math.round(moved.x * 20)) < 1e-6 && Math.abs(moved.z * 20 - Math.round(moved.z * 20)) < 1e-6, `${moved.x},${moved.z}`)
await page.keyboard.press('Control+z')
const back = await item('loungeSofa')
check('отмена возвращает на место одним шагом', back.x === sofa.x && back.z === sofa.z, `${back.x},${back.z}`)

// 3. поворот клавишей и копия
await page.keyboard.press('KeyR')
check('R поворачивает на 90°', (await item('loungeSofa')).rot === (sofa.rot + 90) % 360)
await page.keyboard.press('Control+z')
const before = (await state()).items
await page.keyboard.press('Control+d')
check('Ctrl+D делает копию', (await state()).items === before + 1)
await page.keyboard.press('Delete')
check('Delete удаляет', (await state()).items === before)

// 4. каталог
await page.click('.tile >> nth=0')
await page.waitForTimeout(700)
s = await state()
check('плитка каталога добавляет предмет', s.items === before + 1 && s.sel?.kind === 'item')
await page.keyboard.press('Delete')

// 4б. вытащить плитку мышью прямо в сцену
const tileBox = await page.locator('.tile >> nth=2').boundingBox()
const dropAt = await screenOf(-1.2, 0, 1.75)
await page.mouse.move(tileBox.x + 30, tileBox.y + 30)
await page.mouse.down()
await page.mouse.move(tileBox.x + 30, tileBox.y - 40, { steps: 5 })
await page.mouse.move(dropAt.x, dropAt.y, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(700)
s = await state()
const dropped = await page.evaluate(() => { const m = window.__maket; return m.store.doc.items.find((i) => i.id === m.store.selection?.id) })
check('плитку можно вытащить в сцену', s.items === before + 1 && dropped && Math.hypot(dropped.x + 1.2, dropped.z - 1.75) < 1.2, dropped ? `${dropped.x},${dropped.z}` : 'нет предмета')
await page.keyboard.press('Delete')
check('после удаления предметов столько же', (await state()).items === before)

// 5. комната: выбор по полу и ручка размера
const rooms0 = (await state()).rooms
const living = rooms0.find((r) => r.id === 'living')
p = await screenOf(living.x - 0.7, 0, living.z + 1.9)
await page.mouse.click(p.x, p.y)
s = await state()
check('щелчок по полу выбирает комнату', s.sel?.kind === 'room' && s.sel.id === 'living', JSON.stringify(s.sel))
const hw = await screenOf(living.x - living.w / 2, 0.04, living.z)
const hw2 = await screenOf(living.x - living.w / 2 - 1, 0.04, living.z)
await page.mouse.move(hw.x, hw.y)
await page.mouse.down()
await page.mouse.move((hw.x + hw2.x) / 2, (hw.y + hw2.y) / 2, { steps: 5 })
await page.mouse.move(hw2.x, hw2.y, { steps: 5 })
await page.mouse.up()
const living2 = (await state()).rooms.find((r) => r.id === 'living')
check('ручка меняет ширину комнаты', Math.abs(living2.w - (living.w + 1)) < 0.11, `${living.w} → ${living2.w}`)
check('правая стена осталась на месте', Math.abs(living2.x + living2.w / 2 - (living.x + living.w / 2)) < 1e-6)
await shot('e2e-room')
await page.keyboard.press('Control+z')
await page.keyboard.press('Escape')

// 6. двери и окна
await page.click('.tab:has-text("Лестницы")')
const o0 = (await state()).openings
await page.click('.tile:has-text("Дверь")')
s = await state()
check('дверь встаёт в стену', s.openings === o0 + 1 && s.sel?.kind === 'opening')
await page.keyboard.press('Delete')

// 7. план сверху и вечер
await page.click('.seg-btn:has-text("План")')
await page.waitForTimeout(1200)
await shot('e2e-plan')
await page.click('.seg-btn:has-text("3D")')
await page.evaluate(() => { const m = window.__maket; m.store.update((d) => ({ ...d, light: { time: 0.95 } })) })
await page.waitForTimeout(1200)
await shot('e2e-evening')
await page.evaluate(() => { const m = window.__maket; m.store.update((d) => ({ ...d, light: { time: 0.42 } })) })

// 8. импорт: отдельный GLB и ZIP
const tmp = mkdtempSync(join(tmpdir(), 'maket-'))
const glb = readFileSync(join(ROOT, 'assets/kit/bear.glb'))
writeFileSync(join(tmp, 'my_teddy-bear.glb'), glb)
writeFileSync(join(tmp, 'pack.zip'), zipSync({ 'source/readme.txt': new TextEncoder().encode('hi'), 'model/scene.glb': new Uint8Array(readFileSync(join(ROOT, 'assets/kit/pottedPlant.glb'))) }))
writeFileSync(join(tmp, 'notes.txt'), 'not a model')
const items0 = (await state()).items
await page.setInputFiles('#model-file', join(tmp, 'my_teddy-bear.glb'))
await page.waitForFunction(() => window.__maket.userModels.list.length === 1, null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(600)
s = await state()
check('GLB импортируется и встаёт в сцену', s.user === 1 && s.items === items0 + 1, JSON.stringify({ user: s.user, items: s.items }))
check('название из имени файла', await page.evaluate(() => window.__maket.userModels.list[0].name) === 'My teddy bear')
await page.setInputFiles('#model-file', join(tmp, 'pack.zip'))
await page.waitForFunction(() => window.__maket.userModels.list.length === 2, null, { timeout: 15000 }).catch(() => {})
check('ZIP-архив импортируется', (await state()).user === 2)
await page.setInputFiles('#model-file', join(tmp, 'notes.txt'))
await page.waitForTimeout(800)
check('файл без модели даёт понятную ошибку', (await page.textContent('.toast.is-error').catch(() => '')).includes('нет модели'))
await page.waitForTimeout(500)
await shot('e2e-import')

// 9. сохранение между открытиями
await page.waitForTimeout(700)
const beforeReload = await state()
await page.reload()
await page.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await page.waitForTimeout(2000)
const afterReload = await state()
check('проект и свои модели сохраняются', afterReload.items === beforeReload.items && afterReload.user === 2, JSON.stringify({ items: afterReload.items, user: afterReload.user }))

// 9б. проект файлом: сохранить, всё стереть, открыть обратно
const beforeSave = await state()
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('Control+s')])
const projectPath = join(tmp, 'project.zip')
await download.saveAs(projectPath)
check('Ctrl+S сохраняет проект файлом', /^maket-project-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/.test(download.suggestedFilename()), download.suggestedFilename())
await page.evaluate(() => {
  const m = window.__maket
  for (const u of [...m.userModels.list]) m.userModels.remove(u.id)
  m.store.update((d) => ({ ...d, items: [], openings: [] }))
})
await page.waitForTimeout(300)
check('перед открытием сцена пустая и своих моделей нет', (await state()).items === 0 && (await state()).user === 0)
await page.setInputFiles('#project-file', projectPath)
await page.waitForFunction((n) => window.__maket.store.doc.items.length === n, beforeSave.items, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(1500)
const opened = await state()
const ghosts = await page.evaluate(() => window.__maket.items.pickables().filter((g) => g.children.some((c) => c.userData.ghost)).length)
check('файл проекта открывается вместе со своими моделями', opened.items === beforeSave.items && opened.openings === beforeSave.openings && opened.user === 2 && ghosts === 0, JSON.stringify({ items: opened.items, user: opened.user, ghosts }))
await page.keyboard.press('Control+z')
check('«Отменить» возвращает проект, который был до открытия', (await state()).items === 0)
await page.keyboard.press('Control+Shift+z')
check('«Вернуть» снова открывает проект из файла', (await state()).items === beforeSave.items)
await page.setInputFiles('#project-file', join(tmp, 'pack.zip'))
await page.waitForTimeout(800)
check('чужой архив не открывается как проект', (await page.textContent('.toast.is-error').catch(() => '')).includes('не файл проекта') && (await state()).items === beforeSave.items)
await page.waitForTimeout(400)

// 10. сброс видеокарты (сон, смена драйвера): сцена должна нарисоваться заново и выглядеть так же
const stageLook = async () => {
  const png = (await page.screenshot({ clip: { x: 300, y: 120, width: 600, height: 420 } })).toString('base64')
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob())
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const g = c.getContext('2d')
    g.drawImage(bmp, 0, 0)
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722
    return sum / (d.length / 4)
  }, png)
}
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
const lookBefore = await stageLook()
await page.evaluate(async () => {
  const gl = window.__maket.stage.renderer.getContext()
  const ext = gl.getExtension('WEBGL_lose_context')
  ext.loseContext()
  await new Promise((r) => setTimeout(r, 300))
  ext.restoreContext()
})
await page.waitForTimeout(1500)
const lookAfter = await stageLook()
check('после сброса видеокарты сцена выглядит так же', Math.abs(lookAfter - lookBefore) < 1.5, `яркость ${lookBefore.toFixed(1)} → ${lookAfter.toFixed(1)}`)
await shot('e2e-restored')

check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 4).join(' | '))
await browser.close()
server.close()
console.log(failed ? `\n${failed} проверок не прошли` : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
