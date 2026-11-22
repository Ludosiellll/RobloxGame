// Оболочка «Макета» для компьютера: окно, в котором открывается собранное приложение из папки dist.
// Файлы отдаются по собственному адресу app://maket/, чтобы работали загрузка моделей и хранение данных.

const { app, BrowserWindow, protocol, shell, Menu, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { byteRange } = require('./range.cjs')

const DIST = path.join(__dirname, '..', 'dist')
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// проверочный режим: MAKET_SHOT=путь.png — сделать снимок окна и выйти
const shotPath = process.env.MAKET_SHOT
if (shotPath) app.commandLine.appendSwitch('enable-unsafe-swiftshader')

function serve() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    let rel = decodeURIComponent(url.pathname)
    if (rel === '/' || rel === '') rel = '/index.html'
    const file = path.normalize(path.join(DIST, rel))
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('forbidden', { status: 403 })
    try {
      const data = await fs.promises.readFile(file)
      const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
      // видео проигрыватель запрашивает кусками
      const part = byteRange(request.headers.get('range'), data.length)
      if (part === 'bad') return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } })
      if (part) return new Response(data.subarray(part.start, part.end + 1), { status: 206, headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${part.start}-${part.end}/${data.length}` } })
      return new Response(data, { headers: { 'content-type': type, 'accept-ranges': 'bytes' } })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}

// размер и место окна запоминаются между запусками
const stateFile = () => path.join(app.getPath('userData'), 'window.json')
function readWindowState() {
  try {
    const st = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    if (![st.x, st.y, st.width, st.height].every(Number.isFinite)) return null
    // окно должно попадать на подключённый сейчас экран
    const visible = screen.getAllDisplays().some(({ workArea: a }) => st.x < a.x + a.width - 80 && st.x + st.width > a.x + 80 && st.y >= a.y - 10 && st.y < a.y + a.height - 80)
    return visible ? st : null
  } catch {
    return null
  }
}
function saveWindowState(win) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() }))
  } catch {
    // не получилось записать — в следующий раз окно откроется по умолчанию
  }
}

function createWindow() {
  const saved = shotPath ? null : readWindowState()
  const win = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 620,
    title: 'Макет',
    backgroundColor: '#f3f3f3',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  Menu.setApplicationMenu(null)
  win.once('ready-to-show', () => {
    // первый запуск — на весь экран: сцене нужно место
    if (!shotPath && (!saved || saved.max)) win.maximize()
    win.show()
  })
  win.on('close', () => !shotPath && saveWindowState(win))
  // ссылки наружу открываются в обычном браузере, а не внутри программы
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://maket/')) e.preventDefault()
  })
  void win.loadURL('app://maket/index.html')

  if (shotPath) {
    // ждём, пока загрузятся все модели сцены (но не дольше 60 с), снимаем окно и пишем рядом состояние
    const errors = []
    win.webContents.on('console-message', (e) => (e.level === 'warning' || e.level === 'error') && errors.push(e.message))
    const probe = `(async () => { const m = window.__maket; if (!m) return null; const runs = Number(localStorage.getItem('maket.probe') ?? 0); return { items: m.store.doc.items.length, loaded: m.items.pickables().filter((g) => !g.children.some((c) => c.userData.ghost)).length, layout: !!(document.querySelector('.menubar .menu-btn') && document.querySelector('.catalog .tile') && document.querySelector('.inspector .sec')), clip: await new Promise((done) => { const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; const end = (ok) => { v.removeAttribute('src'); done(ok) }; v.onloadeddata = () => end(v.videoWidth > 0); v.onerror = () => end(false); setTimeout(() => end(false), 5000); v.src = 'tour/look-ru.mp4' }), lang: m.store.lang, runsBefore: runs, db: (await indexedDB.databases()).map((d) => d.name), contextLost: m.stage.renderer.getContext().isContextLost() } })()`
    const started = Date.now()
    const finish = async (state) => {
      await win.webContents.executeJavaScript(`localStorage.setItem('maket.probe', String(Number(localStorage.getItem('maket.probe') ?? 0) + 1))`).catch(() => {})
      const image = await win.webContents.capturePage()
      fs.writeFileSync(shotPath, image.toPNG())
      const report = JSON.stringify({ state, size: image.getSize(), errors: errors.slice(0, 5) })
      fs.writeFileSync(shotPath + '.json', report)
      console.log(report)
      app.quit()
    }
    const poll = async () => {
      const state = await win.webContents.executeJavaScript(probe).catch(() => null)
      const ready = state && state.items > 0 && state.loaded === state.items && state.layout && state.clip && !state.contextLost
      if (process.env.MAKET_TRACE) console.log(Date.now() - started, JSON.stringify(state))
      if (ready) setTimeout(() => void finish(state), 2000)
      else if (Date.now() - started > 60000) void finish(state)
      else setTimeout(poll, 500)
    }
    win.webContents.once('did-finish-load', () => setTimeout(poll, 1000))
  }
}

app.setAppUserModelId('app.maket.desktop')
const single = app.requestSingleInstanceLock()
if (!single) app.quit()
else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  app.whenReady().then(() => {
    serve()
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
