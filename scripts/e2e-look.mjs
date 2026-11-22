// Проверки вида «обычная программа»: то, что нашла независимая проверка кода после смены раскладки.
// Вызывается из e2e.mjs; отдельно: node scripts/e2e-look.mjs (нужна сборка в dist/).
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

export async function lookChecks({ browser, url, check, errors }) {
  const open = async (viewport, opts = {}) => {
    const ctx = await browser.newContext({ viewport, locale: 'ru-RU', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('maket.tour', 'done') } catch {} })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errors.push('вид: ' + String(e)))
    await p.goto(url)
    await p.waitForFunction(() => window.__maket, null, { timeout: 20000 })
    await p.waitForFunction(() => { const m = window.__maket; return m.items.pickables().length === m.store.doc.items.length && !m.items.pickables().some((g) => g.children.some((c) => c.userData.ghost)) }, null, { timeout: 20000 }).catch(() => {})
    await p.waitForTimeout(600)
    return { ctx, p }
  }
  const st = (p) => p.evaluate(() => { const m = window.__maket; const d = m.store.doc; return { items: d.items.length, rooms: d.rooms.length, sel: m.store.selection, undo: m.store.canUndo, drawing: m.interact.drawing, view: m.stage.view } })
  const screenOf = (p, x, y, z) => p.evaluate(([x, y, z]) => { const m = window.__maket; const q = m.stage.project(new m.THREE.Vector3(x, y, z)); const r = m.stage.renderer.domElement.getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top } }, [x, y, z])
  const itemOf = (p, key) => p.evaluate((key) => window.__maket.store.doc.items.find((i) => i.src.key === key), key)
  const rectOf = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null }, sel)
  const overlap = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

  // ---------- компьютер ----------
  const { ctx: desk, p: page } = await open({ width: 1440, height: 860 })
  let s0 = await st(page)

  // плитка, отпущенная мимо сцены, ничего не добавляет
  const tile = await page.locator('.tile >> nth=2').boundingBox()
  const toolbar = await page.locator('.toolbar').boundingBox()
  await page.mouse.move(tile.x + 30, tile.y + 30)
  await page.mouse.down()
  await page.mouse.move(tile.x + 60, tile.y + 10, { steps: 4 })
  await page.mouse.move(toolbar.x + toolbar.width / 2, toolbar.y + toolbar.height / 2, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  let s = await st(page)
  check('плитка, отпущенная над панелью инструментов, ничего не добавляет', s.items === s0.items && !s.undo && s.sel === null, JSON.stringify(s))
  // вытащили в сцену и вернули на панель свойств — тоже ничего
  const mid = await screenOf(page, -1.2, 0, 1.75)
  const insp = await page.locator('.inspector').boundingBox()
  await page.mouse.move(tile.x + 30, tile.y + 30)
  await page.mouse.down()
  await page.mouse.move(tile.x + 60, tile.y + 10, { steps: 4 })
  await page.mouse.move(mid.x, mid.y, { steps: 8 })
  await page.mouse.move(insp.x + insp.width / 2, insp.y + 200, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  s = await st(page)
  check('плитка, пронесённая через сцену и отпущенная над панелью свойств, ничего не добавляет', s.items === s0.items && !s.undo && s.sel === null, JSON.stringify(s))
  // вытащили в сцену: одна вещь и один шаг отмены
  await page.mouse.move(tile.x + 30, tile.y + 30)
  await page.mouse.down()
  await page.mouse.move(tile.x + 60, tile.y + 10, { steps: 4 })
  await page.mouse.move(mid.x, mid.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  s = await st(page)
  const placed = s.items === s0.items + 1
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  s = await st(page)
  check('вещь, вытащенная из каталога в сцену, отменяется одним Ctrl+Z', placed && s.items === s0.items && !s.undo, JSON.stringify(s))
  // щелчок по плитке: тоже один шаг отмены
  await page.locator('.tile >> nth=0').click()
  await page.waitForTimeout(1200)
  const clicked = (await st(page)).items === s0.items + 1
  await page.locator('.statusbar').click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  s = await st(page)
  check('вещь, добавленная щелчком по плитке, отменяется одним Ctrl+Z', clicked && s.items === s0.items && !s.undo, JSON.stringify(s))

  // окно-диалог перекрывает клавиши сцены; Esc закрывает только верхний слой
  let sofa = await itemOf(page, 'loungeSofa')
  await page.evaluate((id) => window.__maket.store.select({ kind: 'item', id }), sofa.id)
  await page.click('[data-menu="help"]')
  await page.click('#menu-about')
  await page.waitForTimeout(200)
  await page.keyboard.press('Delete')
  await page.keyboard.press('r')
  await page.waitForTimeout(200)
  let after = await itemOf(page, 'loungeSofa')
  check('при открытом окне Delete и R не трогают вещь в сцене', !!after && after.rot === sofa.rot && (await st(page)).items === s0.items, JSON.stringify(after))
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab')
  check('Tab не уходит из открытого окна', await page.evaluate(() => !!document.activeElement?.closest('.modal')))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  s = await st(page)
  check('Esc закрывает окно и оставляет вещь выделенной', (await page.evaluate(() => !document.querySelector('.modal-veil'))) && s.sel?.id === sofa.id, JSON.stringify(s.sel))
  if (!after) await page.keyboard.press('Control+z')
  await page.evaluate((id) => window.__maket.store.select({ kind: 'item', id }), sofa.id)
  await page.click('[data-menu="edit"]')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  s = await st(page)
  check('Esc закрывает меню и оставляет вещь выделенной', (await page.evaluate(() => !document.querySelector('.menu-list'))) && s.sel?.id === sofa.id, JSON.stringify(s.sel))
  await page.click('.inspector .chip')
  await page.waitForTimeout(150)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  s = await st(page)
  check('Esc закрывает выбор цвета и возвращает свойства вещи', (await page.evaluate(() => document.querySelector('.picker')?.hidden !== false && !!document.querySelector('#f-rot'))) && s.sel?.id === sofa.id, JSON.stringify(s.sel))

  // после ползунка клавиши продолжают работать
  await page.evaluate((id) => window.__maket.store.select({ kind: 'item', id }), sofa.id)
  await page.focus('#f-rot')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  const turned = await itemOf(page, 'loungeSofa')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  after = await itemOf(page, 'loungeSofa')
  check('Ctrl+Z работает, пока в фокусе ползунок', turned.rot !== sofa.rot && after.rot === sofa.rot, `${sofa.rot} → ${turned.rot} → ${after.rot}`)

  // выбор цвета не показывает отменённый цвет и не остаётся от прошлого проекта
  await page.evaluate((id) => window.__maket.store.select({ kind: 'item', id }), sofa.id)
  await page.click('.inspector .chip')
  await page.waitForTimeout(150)
  const hex0 = await page.inputValue('#picker-hex')
  await page.locator('.swatch:not(.is-on) >> nth=5').click()
  await page.waitForTimeout(150)
  const hex1 = await page.inputValue('#picker-hex')
  await page.locator('.picker-title').click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  const hex2 = await page.evaluate(() => document.querySelector('.picker')?.hidden === false ? document.querySelector('#picker-hex').value : 'closed')
  check('после отмены выбор цвета показывает цвет из проекта', hex1 !== hex0 && (hex2 === hex0 || hex2 === 'closed'), `${hex0} → ${hex1} → ${hex2}`)
  await page.evaluate(() => window.__maket.store.select(null))
  await page.click('.inspector .chip')
  await page.waitForTimeout(150)
  await page.evaluate(() => { const m = window.__maket; m.store.replace({ ...m.store.doc, walls: { ...m.store.doc.walls, color: '#00ff00' } }) })
  await page.waitForTimeout(200)
  check('открытие другого проекта закрывает выбор цвета', await page.evaluate(() => document.querySelector('.picker')?.hidden !== false))

  // рисование комнаты выключается при уходе из вида сверху и при замене проекта
  await page.click('#draw-room')
  await page.waitForFunction(() => !window.__maket.stage.tween, null, { timeout: 8000 }).catch(() => {})
  const drawOn = (await st(page)).drawing
  await page.locator('.seg-btn >> nth=0').click()
  await page.waitForTimeout(300)
  s = await st(page)
  check('кнопка «3D» выключает рисование комнаты', drawOn && !s.drawing && s.view === '3d', JSON.stringify(s))
  await page.waitForFunction(() => !window.__maket.stage.tween, null, { timeout: 8000 }).catch(() => {})
  await page.click('#draw-room')
  await page.waitForTimeout(300)
  await page.click('[data-menu="file"]')
  await page.click('#menu-new')
  await page.waitForTimeout(200)
  check('в окне «Новый проект» в фокусе не кнопка удаления', await page.evaluate(() => !!document.activeElement?.closest('.modal') && document.activeElement.id !== 'new-yes'))
  await page.click('#new-yes')
  await page.waitForTimeout(400)
  s = await st(page)
  check('новый проект выключает рисование комнаты', !s.drawing && (await rectOf(page, '.mode-bar')) === null, JSON.stringify(s))
  // «Открыть пример» спрашивает, прежде чем заменить проект
  await page.click('[data-menu="file"]')
  await page.click('#menu-demo')
  await page.waitForTimeout(200)
  s = await st(page)
  const asked = await page.evaluate(() => !!document.querySelector('.modal-veil #demo-yes'))
  check('«Открыть пример» сначала спрашивает', asked && s.items === 0, JSON.stringify(s))
  if (asked) await page.click('#demo-yes')
  await page.waitForTimeout(600)
  check('после подтверждения пример открыт', (await st(page)).items === s0.items)

  // подсказка в строке состояния: в виде сверху вид не поворачивается
  await page.waitForFunction(() => !window.__maket.stage.tween, null, { timeout: 8000 }).catch(() => {})
  const hint3d = await page.textContent('.status-hint')
  await page.locator('.seg-btn >> nth=1').click()
  await page.waitForTimeout(300)
  const hintPlan = await page.textContent('.status-hint')
  check('в виде сверху строка состояния не предлагает повернуть вид', /повернуть/.test(hint3d) && !/повернуть/.test(hintPlan), `${hint3d} | ${hintPlan}`)
  await desk.close()

  // ---------- обучение: окно не закрывает то, на что показывает ----------
  for (const size of [{ width: 1280, height: 720 }, { width: 960, height: 620 }]) {
    const { ctx, p } = await open(size)
    await p.evaluate(() => window.__maket.tour.begin())
    await p.waitForTimeout(500)
    const bad = []
    for (const step of ['add', 'move', 'turn', 'paint', 'room']) {
      await p.click('#tour-skip')
      await p.waitForFunction((step) => document.querySelector('.tour-panel')?.dataset.step === step, step, { timeout: 5000 }).catch(() => {})
      await p.waitForTimeout(500)
      const panel = await rectOf(p, '.tour-panel')
      const mark = await rectOf(p, '.tour-mark')
      if (!mark || overlap(panel, mark)) bad.push(`${step}: ${JSON.stringify({ panel, mark })}`)
    }
    check(`обучение в окне ${size.width}×${size.height}: окно шага не закрывает отметку`, bad.length === 0, bad.join(' ; ').slice(0, 400))
    await ctx.close()
  }

  // ---------- обучение: мелочи ----------
  {
    const { ctx, p } = await open({ width: 1440, height: 860 })
    await p.evaluate(() => window.__maket.tour.begin())
    await p.waitForTimeout(800)
    const src0 = await p.evaluate(() => document.querySelector('.tour-video')?.getAttribute('src'))
    await p.evaluate(() => window.__maket.store.setLang('en'))
    await p.waitForTimeout(400)
    const src1 = await p.evaluate(() => document.querySelector('.tour-video')?.getAttribute('src'))
    check('обучение: при смене языка запись берётся на новом языке', src0 === 'tour/look-ru.mp4' && src1 === 'tour/look-en.mp4', `${src0} → ${src1}`)
    await p.evaluate(() => window.__maket.store.setLang('ru'))
    // покрасили стены на шаге «цвет» и оставили выбор цвета открытым: шаг «свет» всё равно показывает ползунок времени
    await p.evaluate(() => window.__maket.store.select(null))
    for (let i = 0; i < 4; i++) { await p.click('#tour-skip'); await p.waitForTimeout(250) }
    await p.evaluate(() => window.__maket.store.select(null))
    await p.waitForTimeout(200)
    await p.click('.inspector .chip')
    await p.waitForTimeout(200)
    const pickerWasOpen = await p.evaluate(() => document.querySelector('.picker')?.hidden === false)
    await p.click('#tour-skip')
    await p.waitForTimeout(250)
    await p.click('#tour-skip')
    await p.waitForFunction(() => document.querySelector('.tour-panel')?.dataset.step === 'light', null, { timeout: 5000 }).catch(() => {})
    await p.waitForTimeout(500)
    const light = await p.evaluate(() => ({ step: document.querySelector('.tour-panel')?.dataset.step, time: !!document.querySelector('#f-time'), mark: !document.querySelector('.tour-mark').hidden }))
    check('обучение: шаг «свет» показывает ползунок, даже если был открыт выбор цвета', pickerWasOpen && light.step === 'light' && light.time && light.mark, JSON.stringify({ pickerWasOpen, ...light }))
    // закрыли обучение — запись не играет
    await p.click('#tour-end')
    await p.waitForTimeout(300)
    check('обучение: после закрытия запись не проигрывается', await p.evaluate(() => [...document.querySelectorAll('video')].every((v) => v.paused)))
    await ctx.close()
  }
  {
    // записи не загрузились: остаётся текст, запросы не повторяются
    const { ctx, p } = await open({ width: 1440, height: 860 })
    let asked = 0
    await p.route('**/tour/*.mp4', (route) => { asked++; return route.abort() })
    await p.evaluate(() => window.__maket.tour.begin())
    await p.waitForTimeout(800)
    await p.evaluate(() => window.__maket.store.setLang('en'))
    await p.waitForTimeout(500)
    await p.evaluate(() => window.__maket.store.setLang('ru'))
    await p.waitForTimeout(500)
    await p.evaluate(() => window.__maket.store.setLang('en'))
    await p.waitForTimeout(500)
    const clip = await p.evaluate(() => !!document.querySelector('.tour-clip'))
    check('обучение без записей: остаётся текст, каждая запись запрошена один раз', !clip && asked === 2 && (await p.evaluate(() => !!document.querySelector('.tour-body h2'))), JSON.stringify({ clip, asked }))
    await ctx.close()
  }

  // ---------- планшет в портретной ориентации ----------
  {
    const { ctx, p } = await open({ width: 768, height: 1024 })
    const view = await rectOf(p, '.view')
    check('при ширине 768 сцена не зажата между двумя панелями', !!view && view.r - view.l >= 600, JSON.stringify(view))
    await ctx.close()
  }

  // ---------- телефон ----------
  const { ctx: phone, p: ph } = await open({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const cdp = await phone.newCDPSession(ph)
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) })
  const panelOpen = () => ph.evaluate(() => (document.querySelector('.inspector').classList.contains('is-open') ? 'props' : document.querySelector('.catalog').classList.contains('is-open') ? 'catalog' : null))
  const meter = () => ph.evaluate(() => { const m = window.__maket; const a = m.stage.project(new m.THREE.Vector3(0, 0, 0)); const b = m.stage.project(new m.THREE.Vector3(1, 0, 0)); return Math.hypot(a.x - b.x, a.y - b.y) })
  // первое перетаскивание пальцем: панели ещё нет, вещь едет за пальцем
  sofa = await itemOf(ph, 'loungeSofa')
  const scale0 = await meter()
  const grab = await screenOf(ph, sofa.x, 0.35, sofa.z)
  const none = await panelOpen()
  await touch('touchStart', [[grab.x, grab.y]])
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[grab.x + i * 4, grab.y + i * 2]]); await ph.waitForTimeout(30) }
  const midPanel = await panelOpen()
  await touch('touchEnd', [])
  await ph.waitForTimeout(500)
  after = await itemOf(ph, 'loungeSofa')
  const went = Math.hypot(after.x - sofa.x, after.z - sofa.z)
  check('на телефоне первое перетаскивание пальцем двигает вещь за пальцем, а не отбрасывает', none === null && went > 0.05 && went < 2.5, JSON.stringify({ было: [sofa.x, sofa.z], стало: [after.x, after.z], went }))
  check('на телефоне свойства открываются после того, как палец отпущен', midPanel === null && (await panelOpen()) === 'props', JSON.stringify({ midPanel, after: await panelOpen() }))
  const scale1 = await meter()
  check('на телефоне сцена не мельчает, когда под ней открывается панель', scale1 / scale0 > 0.85 && scale1 / scale0 < 1.2, `${scale0.toFixed(1)} → ${scale1.toFixed(1)} px/м`)
  // выбор цвета открывается с начала, «назад» возвращает прокрутку
  await ph.evaluate(() => { const el = document.querySelector('.inspector'); el.scrollTop = 170 })
  const scrolled = await ph.evaluate(() => document.querySelector('.inspector').scrollTop)
  await ph.evaluate(() => document.querySelector('.inspector .chip').click())
  await ph.waitForTimeout(250)
  const back = await rectOf(ph, '#picker-back')
  const inspBox = await rectOf(ph, '.inspector')
  const top = await ph.evaluate(() => document.querySelector('.inspector').scrollTop)
  check('на телефоне выбор цвета открывается с начала: кнопка «назад» на виду', scrolled > 50 && top === 0 && !!back && back.t >= inspBox.t - 1 && back.b <= inspBox.b, JSON.stringify({ scrolled, top, back, inspBox }))
  await ph.evaluate(() => document.querySelector('#picker-back').click())
  await ph.waitForTimeout(250)
  check('на телефоне «назад» из выбора цвета возвращает прокрутку панели', Math.abs((await ph.evaluate(() => document.querySelector('.inspector').scrollTop)) - scrolled) < 4)
  // обучение на телефоне: окно шага не закрывает отметку, рамка не вылезает из панели
  await ph.evaluate(() => { const m = window.__maket; m.store.select(null); m.tour.begin() })
  await ph.waitForTimeout(500)
  const badPhone = []
  for (const step of ['add', 'move', 'turn', 'paint', 'room']) {
    await ph.evaluate(() => document.querySelector('#tour-skip').click())
    await ph.waitForFunction((step) => document.querySelector('.tour-panel')?.dataset.step === step, step, { timeout: 5000 }).catch(() => {})
    await ph.waitForTimeout(600)
    const panel = await rectOf(ph, '.tour-panel')
    const mark = await rectOf(ph, '.tour-mark')
    if (!mark || overlap(panel, mark)) badPhone.push(`${step}: ${JSON.stringify({ panel, mark })}`)
  }
  check('на телефоне окно шага обучения не закрывает отметку', badPhone.length === 0, badPhone.join(' ; ').slice(0, 400))
  await ph.evaluate(() => window.__maket.tour.end())
  // масштаб плана: после второй точки открывается панель с полем расстояния
  await ph.setInputFiles('#plan-file', join(ROOT, 'tests/fixtures/plan.png'))
  await ph.waitForFunction(() => window.__maket.underlay.shown, null, { timeout: 15000 }).catch(() => {})
  await ph.waitForTimeout(1200)
  await ph.evaluate(() => document.querySelector('#plan-calibrate').click())
  await ph.waitForTimeout(300)
  await ph.evaluate(() => document.querySelector('[data-dock="props"]').click())
  await ph.waitForFunction(() => !window.__maket.stage.tween, null, { timeout: 8000 }).catch(() => {})
  await ph.waitForTimeout(400)
  const hidden = await panelOpen()
  const plan = await ph.evaluate(() => window.__maket.store.doc.scene.underlay)
  const t1 = await screenOf(ph, plan.x - plan.w * 0.3, 0.03, plan.z)
  const t2 = await screenOf(ph, plan.x + plan.w * 0.3, 0.03, plan.z)
  await ph.touchscreen.tap(t1.x, t1.y)
  await ph.waitForTimeout(300)
  await ph.touchscreen.tap(t2.x, t2.y)
  await ph.waitForTimeout(500)
  const dist = await rectOf(ph, '#plan-distance')
  check('на телефоне после второй точки масштаба открывается поле расстояния', hidden === null && (await panelOpen()) === 'props' && !!dist && dist.b <= 844, JSON.stringify({ hidden, panel: await panelOpen(), dist, points: await ph.evaluate(() => window.__maket.interact.calibration?.points.length ?? null) }))
  await phone.close()
}

// запуск отдельно от общей проверки
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url)
  const { chromium } = require('playwright')
  const { serve, GL_ARGS } = await import('./serve.mjs')
  const { server, url } = await serve(join(ROOT, 'dist'))
  const browser = await chromium.launch({ args: GL_ARGS })
  const errors = []
  let failed = 0
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++ }
  try {
    await lookChecks({ browser, url, check, errors })
    check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 4).join(' | '))
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} проверок не прошли` : '\nвсе проверки прошли')
  process.exit(failed ? 1 : 0)
}
