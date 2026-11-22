// Сквозная проверка в настоящем браузере: выбор, перетаскивание, отмена, каталог, комнаты, проёмы, импорт, сохранение.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
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

// правка за мгновение до закрытия окна не должна теряться
await page.evaluate(() => window.__maket.store.update((d) => ({ ...d, light: { time: 0.77 } })))
await page.reload()
await page.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await page.waitForTimeout(1500)
check('правка перед самым закрытием сохраняется', (await page.evaluate(() => window.__maket.store.doc.light.time)) === 0.77)
await page.evaluate(() => window.__maket.store.update((d) => ({ ...d, light: { time: 0.42 } })))
await page.waitForTimeout(600)

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

// 9в. план квартиры: загрузить картинку, задать масштаб по двум точкам, подвинуть, сохранить в проекте
const planOf = () => page.evaluate(() => window.__maket.store.doc.scene.underlay)
await page.keyboard.press('Escape')
await page.setInputFiles('#plan-file', join(ROOT, 'tests/fixtures/plan.png'))
await page.waitForFunction(() => window.__maket.underlay.shown, null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(1200)
let plan = await planOf()
s = await state()
check('картинка плана ложится на коврик и выбрана', !!plan && Math.abs(plan.ratio - 800 / 1100) < 0.01 && plan.w === 10 && s.sel?.kind === 'underlay' && (await page.evaluate(() => window.__maket.underlay.shown)), JSON.stringify(plan))
await shot('e2e-plan-loaded')
// на картинке верхняя стена идёт от (100, 100) до (1000, 100) пикселей и по подписи равна 9 м
const onPlan = (px, py) => screenOf(plan.x + (px / 1100 - 0.5) * plan.w, 0.03, plan.z + (py / 800 - 0.5) * plan.w * plan.ratio)
await page.click('#plan-calibrate')
await page.waitForTimeout(400)
const pa = await onPlan(100, 100)
const pb = await onPlan(1000, 100)
await page.mouse.click(pa.x, pa.y)
await page.waitForTimeout(200)
await page.mouse.click(pb.x, pb.y)
await page.waitForTimeout(300)
await shot('e2e-plan-points')
await page.fill('#plan-distance', '9,0')
await page.click('#plan-apply')
await page.waitForTimeout(400)
const scaled = await planOf()
check('масштаб по двум точкам: 9 м на плане становятся 9 м на коврике', Math.abs(scaled.w - 11) < 0.06, `ширина ${scaled.w}`)
check('первая точка разметки осталась на месте', Math.abs(scaled.x - (plan.x + (100 / 1100 - 0.5) * plan.w) - (0.5 - 100 / 1100) * scaled.w) < 0.03, `${plan.x} → ${scaled.x}`)
plan = scaled
// перетащить план мышью
const grab = await onPlan(880, 700)
await page.mouse.move(grab.x, grab.y)
await page.mouse.down()
await page.mouse.move(grab.x + 30, grab.y + 10, { steps: 4 })
await page.mouse.move(grab.x + 60, grab.y + 20, { steps: 4 })
await page.mouse.up()
const dragged = await planOf()
check('план двигается мышью', Math.hypot(dragged.x - plan.x, dragged.z - plan.z) > 0.2 && dragged.w === plan.w, `${plan.x},${plan.z} → ${dragged.x},${dragged.z}`)
await page.keyboard.press('Control+z')
const undone = await planOf()
check('перетаскивание плана отменяется одним шагом', undone.x === plan.x && undone.z === plan.z)
// щелчок по комнате при выбранном плане выбирает комнату
const livingNow = (await state()).rooms.find((r) => r.id === 'living')
const floorSpot = await screenOf(livingNow.x + livingNow.w / 2 - 0.3, 0.03, livingNow.z + livingNow.d / 2 - 0.3)
await page.mouse.click(floorSpot.x, floorSpot.y)
await page.waitForTimeout(200)
check('щелчок по комнате при выбранном плане выбирает комнату', (await state()).sel?.kind === 'room', JSON.stringify((await state()).sel))
await page.keyboard.press('Escape')
await shot('e2e-plan-scaled')
// большой план должен помещаться в вид сверху целиком, между панелями
await page.evaluate(() => window.__maket.store.update((d) => ({ ...d, scene: { ...d.scene, underlay: { ...d.scene.underlay, w: 24 } } })))
await page.click('#select-plan')
await page.waitForTimeout(1600)
const big = await planOf()
const corners = await Promise.all([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => screenOf(big.x + (sx * big.w) / 2, 0.03, big.z + (sz * big.w * big.ratio) / 2)))
check('большой план целиком виден в виде сверху', corners.every((c) => c.x > 16 && c.x < 1132 && c.y > 60 && c.y < 668), JSON.stringify(corners.map((c) => [Math.round(c.x), Math.round(c.y)])))
await shot('e2e-plan-big')
await page.keyboard.press('Control+z')
await page.keyboard.press('Escape')
// план сохраняется в файле проекта вместе с картинкой
const [planDownload] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('Control+s')])
const planProject = join(tmp, 'project-plan.zip')
await planDownload.saveAs(planProject)
await page.click('#select-plan')
await page.click('#plan-remove')
await page.waitForTimeout(300)
check('план убирается', (await planOf()) === null && !(await page.evaluate(() => window.__maket.underlay.shown)))
await page.evaluate(() => window.__maket.images.keepOnly(null, 0))
await page.setInputFiles('#project-file', planProject)
await page.waitForFunction(() => window.__maket.underlay.ready, null, { timeout: 15000 }).catch(() => {})
const reopened = await planOf()
check('файл проекта возвращает план вместе с картинкой', !!reopened && reopened.w === plan.w && (await page.evaluate(() => window.__maket.underlay.ready)), JSON.stringify(reopened))
await page.reload()
await page.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await page.waitForFunction(() => window.__maket.underlay.ready, null, { timeout: 15000 }).catch(() => {})
check('план сохраняется между открытиями', (await page.evaluate(() => window.__maket.underlay.ready)) && (await planOf())?.w === plan.w)
// в объёмном виде план не мешает: он виден в виде сверху или пока выбран
const planShown = () => page.evaluate(() => window.__maket.underlay.shown)
check('в объёмном виде план скрыт, пока не выбран', !(await planShown()))
await page.click('.seg-btn >> nth=1')
await page.waitForTimeout(300)
check('в виде сверху план виден', await planShown())
await page.click('.seg-btn >> nth=0')
await page.waitForTimeout(300)
check('после возврата в объёмный вид план снова скрыт', !(await planShown()))
await page.evaluate(() => window.__maket.store.select({ kind: 'underlay', id: 'underlay' }))
check('выбранный план виден и в объёмном виде', await planShown())
await page.keyboard.press('Escape')
await page.click('#select-plan')
await page.click('#plan-remove')
await page.evaluate(() => window.__maket.stage.setView('3d', true))
await page.waitForTimeout(800)

// 9г. находки проверки кода: потеря данных и недоверенные файлы
const ghostCount = (pg) => pg.evaluate(() => window.__maket.items.pickables().filter((g) => g.children.some((c) => c.userData.ghost)).length)
const imageRows = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('maket-db'); r.onsuccess = () => { const q = r.result.transaction('images').objectStore('images').count(); q.onsuccess = () => { r.result.close(); res(q.result) } } }))
// хранилище браузера отвечает позже, чем приложение успевает запуститься (или не отвечает вовсе)
const slowStorage = (ms) => `(() => { const real = IDBFactory.prototype.open; IDBFactory.prototype.open = function (...a) { const fake = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null }; const go = () => { const r = real.apply(this, a); r.onupgradeneeded = () => { fake.result = r.result; fake.onupgradeneeded && fake.onupgradeneeded() }; r.onsuccess = () => { fake.result = r.result; fake.onsuccess && fake.onsuccess() }; r.onerror = () => { fake.error = r.error; fake.onerror && fake.onerror() } }; ${Number.isFinite(ms) ? `setTimeout(go, ${ms})` : ''}; return fake } })()`
await page.waitForTimeout(700)
const steady = await state()
const slow = await context.newPage()
await slow.addInitScript({ content: slowStorage(4500) })
await slow.goto(url)
await slow.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await slow.waitForTimeout(6500)
const slowState = await slow.evaluate(() => { const m = window.__maket; return { items: m.store.doc.items.length, user: m.userModels.list.length } })
check('медленное хранилище: предметы со своими моделями не пропадают', slowState.items === steady.items && slowState.user === 2 && (await ghostCount(slow)) === 0, JSON.stringify({ было: steady.items, стало: slowState.items, моделей: slowState.user, заготовок: await ghostCount(slow) }))
await slow.close()
const hung = await context.newPage()
await hung.addInitScript({ content: slowStorage(Infinity) })
await hung.goto(url)
await hung.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await hung.setInputFiles('#plan-file', join(ROOT, 'tests/fixtures/plan.png'))
const hungShown = await hung.waitForFunction(() => window.__maket.underlay.shown, null, { timeout: 6000 }).then(() => true, () => false)
const hungItems = await hung.evaluate(() => window.__maket.store.doc.items.length)
check('хранилище не отвечает: план всё равно ложится на коврик, предметы целы', hungShown && hungItems === steady.items, JSON.stringify({ план: hungShown, предметов: hungItems }))
await hung.evaluate(() => window.__maket.store.update((d) => ({ ...d, scene: { ...d.scene, underlay: null } })))
await hung.waitForTimeout(700)
await hung.close()

// проект, в котором нет файла одной из моделей: её предметы отбрасываются, а «Отменить» возвращает прежний проект целиком
const saved = unzipSync(new Uint8Array(readFileSync(projectPath)))
const savedManifest = JSON.parse(new TextDecoder().decode(saved['maket.json']))
const victim = savedManifest.models[0].id
writeFileSync(join(tmp, 'project-broken.zip'), zipSync(Object.fromEntries(Object.entries(saved).filter(([name]) => !name.startsWith(`models/${victim}/`)))))
// модель удаляем так же, как это делает кнопка в каталоге: сначала её предметы, потом саму модель
await page.evaluate((id) => { const m = window.__maket; m.store.update((d) => ({ ...d, items: d.items.filter((i) => !(i.src.kind === 'user' && i.src.key === id)) })); m.userModels.remove(id) }, victim)
await page.waitForTimeout(400)
const beforeBroken = await state()
await page.setInputFiles('#project-file', join(tmp, 'project-broken.zip'))
await page.waitForTimeout(1500)
const afterBroken = await state()
const lostInFile = savedManifest.doc.items.filter((i) => i.src.kind === 'user' && i.src.key === victim).length
const brokenToast = await page.textContent('.toast.is-error').catch(() => '')
check('проект без файла модели открывается без её предметов и говорит об этом', afterBroken.items === savedManifest.doc.items.length - lostInFile && lostInFile > 0 && brokenToast.includes('не прочитались'), JSON.stringify({ items: afterBroken.items, toast: brokenToast }))
await page.keyboard.press('Control+z')
check('после такого открытия «Отменить» возвращает прежний проект целиком', (await state()).items === beforeBroken.items, `${(await state()).items} из ${beforeBroken.items}`)
await page.keyboard.press('Control+Shift+z')
check('и «Вернуть» снова открывает проект из файла', (await state()).items === afterBroken.items)

// картинка плана из чужого файла проекта уменьшается и получает свой ключ
const kitOnly = { ...savedManifest.doc, items: savedManifest.doc.items.filter((i) => i.src.kind === 'kit'), scene: { mat: 'green', underlay: { image: 'bigplan', x: 0, z: 0, w: 10, ratio: 0.5, rot: 0, opacity: 0.6 } } }
writeFileSync(join(tmp, 'project-bigplan.zip'), zipSync({ 'maket.json': new TextEncoder().encode(JSON.stringify({ app: 'maket', format: 1, doc: kitOnly, models: [] })), 'images/bigplan': new Uint8Array(readFileSync(join(ROOT, 'tests/fixtures/plan-big.png'))) }))
await page.setInputFiles('#project-file', join(tmp, 'project-bigplan.zip'))
await page.waitForFunction(() => window.__maket.underlay.ready, null, { timeout: 15000 }).catch(() => {})
const bigPlan = await page.evaluate(() => { const m = window.__maket; return { key: m.store.doc.scene.underlay?.image, width: m.underlay.material.map?.image.width ?? 0 } })
check('картинка плана из файла проекта уменьшается до 2048 точек и хранится под своим ключом', bigPlan.width > 0 && bigPlan.width <= 2048 && bigPlan.key !== 'bigplan', JSON.stringify(bigPlan))
// план ссылается на картинку, которой нет: прежняя картинка не должна показываться вместо неё
await page.evaluate(() => window.__maket.store.update((d) => ({ ...d, scene: { ...d.scene, underlay: { ...d.scene.underlay, image: 'net-takoy' } } })))
await page.waitForTimeout(600)
const dangling = await page.evaluate(() => { const m = window.__maket; return { ready: m.underlay.ready, map: m.underlay.material.map !== null } })
check('если картинки плана нет, прежняя не показывается вместо неё', !dangling.ready && !dangling.map, JSON.stringify(dangling))
await page.evaluate(() => window.__maket.store.update((d) => ({ ...d, scene: { ...d.scene, underlay: null } })))
await page.waitForTimeout(700)
// недавние картинки планов не удаляются при запуске: их может ждать отмена в другой вкладке
const rowsBefore = await imageRows()
await page.reload()
await page.waitForFunction(() => window.__maket, null, { timeout: 20000 })
await page.waitForTimeout(1500)
check('недавние картинки планов при запуске не удаляются', rowsBefore > 0 && (await imageRows()) === rowsBefore, `${rowsBefore} → ${await imageRows()}`)

// модель со ссылкой на чужой сайт: наружу приложение не ходит
const outside = []
page.on('request', (r) => { if (r.url().includes('tracker.invalid')) outside.push(r.url()) })
const tri = Buffer.concat([Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), Buffer.from(new Float32Array([0, 0, 1, 0, 0, 1]).buffer)])
writeFileSync(join(tmp, 'phone-home.gltf'), JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], textures: [{ source: 0 }], images: [{ uri: 'https://tracker.invalid/t.png' }], buffers: [{ byteLength: 60, uri: 'data:application/octet-stream;base64,' + tri.toString('base64') }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }] }))
const usersBefore = (await state()).user
await page.setInputFiles('#model-file', join(tmp, 'phone-home.gltf'))
await page.waitForFunction((n) => window.__maket.userModels.list.length === n + 1, usersBefore, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(800)
check('модель со ссылкой на чужой сайт импортируется, а наружу запросов нет', (await state()).user === usersBefore + 1 && outside.length === 0, JSON.stringify({ user: (await state()).user, outside }))
await page.evaluate(() => { const m = window.__maket; const last = m.userModels.list[m.userModels.list.length - 1]; m.userModels.remove(last.id) })
await page.waitForTimeout(500)

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
