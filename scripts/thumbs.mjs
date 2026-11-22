// Превью встроенных моделей одним листом и их размеры: public/models/kit-thumbs.webp + src/core/kit-data.json
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { serve, GL_ARGS } from './serve.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const KIT_SCALE = 2.1
const TILE = 128
const COLS = 12

const keys = readdirSync(join(ROOT, 'public/models/kit')).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort()
const { server, url } = await serve(ROOT)
const browser = await chromium.launch({ args: GL_ARGS })
const page = await browser.newPage()
page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()))
await page.goto(url + 'scripts/blank.html')
const result = await page.evaluate(async ({ keys, base, TILE, COLS, KIT_SCALE }) => {
  const THREE = await import('three')
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js')
  const S = TILE * 2
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(S, S)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  const scene = new THREE.Scene()
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.3
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(2.5, 4, 3)
  scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8d9aa0, 0.75))
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
  const loader = new GLTFLoader()
  const atlas = document.getElementById('atlas')
  atlas.width = COLS * TILE
  atlas.height = Math.ceil(keys.length / COLS) * TILE
  const ctx = atlas.getContext('2d')
  const data = {}
  for (let i = 0; i < keys.length; i++) {
    const gltf = await loader.loadAsync(`${base}public/models/kit/${keys[i]}.glb`)
    const obj = gltf.scene
    scene.add(obj)
    const box = new THREE.Box3().setFromObject(obj)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const slots = []
    obj.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!slots.includes(m.name)) slots.push(m.name) })
    const r3 = (v) => Math.round(v * KIT_SCALE * 1000) / 1000
    data[keys[i]] = { i, w: r3(size.x), h: r3(size.y), d: r3(size.z), slots }
    const dir = new THREE.Vector3(1, 0.82, 1).normalize()
    cam.position.copy(center).addScaledVector(dir, 20)
    cam.lookAt(center)
    cam.updateMatrixWorld()
    // вписываем модель в кадр по проекции её углов
    let half = 0.01
    const inv = cam.matrixWorldInverse
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv)
      half = Math.max(half, Math.abs(p.x), Math.abs(p.y))
    }
    half *= 1.12
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half
    cam.updateProjectionMatrix()
    renderer.render(scene, cam)
    ctx.drawImage(renderer.domElement, (i % COLS) * TILE, Math.floor(i / COLS) * TILE, TILE, TILE)
    scene.remove(obj)
  }
  return { data, png: atlas.toDataURL('image/png') }
}, { keys, base: url, TILE, COLS, KIT_SCALE })
await browser.close()
server.close()

const tmp = join(mkdtempSync(join(tmpdir(), 'thumbs-')), 'atlas.png')
writeFileSync(tmp, Buffer.from(result.png.split(',')[1], 'base64'))
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-c:v', 'libwebp', '-quality', '88', join(ROOT, 'public/models/kit-thumbs.webp')])
writeFileSync(join(ROOT, 'src/core/kit-data.json'), JSON.stringify({ tile: TILE, cols: COLS, scale: KIT_SCALE, items: result.data }))
console.log(`${keys.length} моделей → public/models/kit-thumbs.webp, src/core/kit-data.json`)
