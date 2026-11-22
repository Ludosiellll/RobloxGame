// Сцена: рендер, камера, свет, коврик. Рисуем кадр только когда что-то изменилось.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { MatKind } from '../core/doc'
import { sunFromTime } from '../core/geom'
import { Mat, MAT_COLORS } from './mat'

export type ViewMode = '3d' | 'plan'

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400)
  readonly controls: OrbitControls
  readonly mat = new Mat()
  /** всё, что относится к проекту: комнаты и предметы */
  readonly world = new THREE.Group()
  /** вспомогательное: выделение, ручки */
  readonly overlay = new THREE.Group()
  readonly maxAnisotropy: number
  lampsOn = false

  private readonly sun = new THREE.DirectionalLight(0xffffff, 2)
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x4a5a55, 0.6)
  private dirty = true
  private readonly frameHooks: Array<(dt: number) => boolean | void> = []
  private last = performance.now()
  private matKind: MatKind = 'green'
  private time = 0.42
  private tween: { from: THREE.Spherical; to: THREE.Spherical; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null
  view: ViewMode = '3d'
  private bounds = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 3, 3))

  constructor(readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy()
    host.appendChild(this.renderer.domElement)
    this.renderer.domElement.setAttribute('aria-label', '3D scene')

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.3
    pmrem.dispose()

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 5
    this.scene.add(this.sun, this.sun.target, this.hemi, this.mat.group, this.world, this.overlay)

    this.camera.position.set(8.5, 8, 10)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0.6, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09
    this.controls.screenSpacePanning = false
    this.controls.minDistance = 2.5
    this.controls.maxDistance = 46
    this.controls.maxPolarAngle = Math.PI * 0.47
    this.controls.zoomToCursor = true
    this.controls.addEventListener('change', () => this.invalidate())

    this.applyMat()
    this.applyLight()
    const ro = new ResizeObserver(() => this.resize())
    ro.observe(host)
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  invalidate(): void {
    this.dirty = true
  }

  /** hook возвращает true, пока ему нужны следующие кадры (идёт анимация). */
  onFrame(hook: (dt: number) => boolean | void): void {
    this.frameHooks.push(hook)
  }

  private frame(): void {
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    if (this.tween) {
      const tw = this.tween
      tw.t = Math.min(1, tw.t + dt / 0.55)
      const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2
      const s = new THREE.Spherical(
        THREE.MathUtils.lerp(tw.from.radius, tw.to.radius, k),
        THREE.MathUtils.lerp(tw.from.phi, tw.to.phi, k),
        THREE.MathUtils.lerp(tw.from.theta, tw.to.theta, k),
      )
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k)
      this.camera.position.setFromSpherical(s).add(this.controls.target)
      this.camera.lookAt(this.controls.target)
      if (tw.t >= 1) this.tween = null
      this.dirty = true
    }
    if (this.controls.update()) this.dirty = true
    let busy = false
    for (const hook of this.frameHooks) if (hook(dt)) busy = true
    if (busy) this.dirty = true
    if (!this.dirty) return
    this.dirty = false
    this.renderer.render(this.scene, this.camera)
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    // сдвигаем кадр, чтобы центр сцены был в свободной части экрана, а не под панелями
    const phone = w <= 760
    const right = phone ? 0 : 304
    const bottom = phone ? Math.min(230, h * 0.3) : 150
    this.camera.setViewOffset(w, h, right / 2, bottom / 2, w, h)
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  setMat(kind: MatKind): void {
    if (kind === this.matKind) return
    this.matKind = kind
    this.applyMat()
  }

  setTime(t: number): void {
    if (t === this.time) return
    this.time = t
    this.applyLight()
  }

  /** Границы проекта: под них ставим тени и камеру. */
  setBounds(box: THREE.Box3): void {
    this.bounds.copy(box)
    this.applyLight()
  }

  private applyMat(): void {
    this.mat.setKind(this.matKind, this.maxAnisotropy)
    this.applyLight()
  }

  private applyLight(): void {
    const s = sunFromTime(this.time)
    const c = MAT_COLORS[this.matKind]
    const center = this.bounds.getCenter(new THREE.Vector3())
    const size = this.bounds.getSize(new THREE.Vector3())
    const reach = Math.max(size.x, size.z) / 2 + 3
    const dir = new THREE.Vector3(Math.cos(s.azimuth) * Math.cos(s.elevation), Math.sin(s.elevation), Math.sin(s.azimuth) * Math.cos(s.elevation))
    this.sun.position.copy(center).addScaledVector(dir, reach * 3)
    this.sun.target.position.set(center.x, 0, center.z)
    const cam = this.sun.shadow.camera
    cam.left = cam.bottom = -reach
    cam.right = cam.top = reach
    cam.near = 0.5
    cam.far = reach * 6
    cam.updateProjectionMatrix()
    this.sun.intensity = s.intensity
    this.sun.color.setHSL(0.09, 0.15 + s.warmth * 0.75, 0.97 - s.warmth * 0.22)
    this.hemi.intensity = s.ambient
    this.hemi.color.setHSL(0.58 - s.warmth * 0.5, 0.25, 0.96 - s.warmth * 0.2)
    this.hemi.groundColor.set(c.base).multiplyScalar(0.5)
    this.lampsOn = s.lamps
    // вечером фон и коврик уходят в темноту
    const dusk = Math.max(0, (this.time - 0.72) / 0.28)
    const bg = new THREE.Color(c.deep).multiplyScalar(1 - dusk * 0.62)
    this.scene.background = bg
    this.scene.fog = new THREE.Fog(bg, 30, 95)
    this.scene.environmentIntensity = 0.3 - dusk * 0.18
    this.invalidate()
  }

  /** Плавно перевести камеру: общий вид или план сверху. */
  setView(view: ViewMode, immediate = false): void {
    this.view = view
    const center = this.bounds.getCenter(new THREE.Vector3())
    const size = this.bounds.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z * 1.25, 4)
    const target = new THREE.Vector3(center.x, view === 'plan' ? 0 : 0.6, center.z)
    const fit = (span / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * (this.camera.aspect < 1 ? 1.25 / this.camera.aspect : 1.25)
    const to = view === 'plan' ? new THREE.Spherical(fit * 1.05, 0.0008, 0) : new THREE.Spherical(fit * 1.12, 0.92, 0.72)
    this.controls.enableRotate = view !== 'plan'
    this.controls.maxPolarAngle = view === 'plan' ? 0.001 : Math.PI * 0.47
    const from = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target))
    // кратчайший поворот по азимуту
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2
    if (immediate) {
      this.controls.target.copy(target)
      this.camera.position.setFromSpherical(to).add(target)
      this.camera.lookAt(target)
      this.controls.update()
      this.invalidate()
      return
    }
    this.tween = { from, to, fromT: this.controls.target.clone(), toT: target, t: 0 }
  }

  /** Точка на полу под указателем (в координатах холста, 0..1 не нужны: передаём NDC). */
  raycaster = new THREE.Raycaster()
  ndc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect()
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  }

  pointOnPlane(clientX: number, clientY: number, y = 0): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const p = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null
  }

  /** Экранные координаты точки мира (в пикселях относительно холста). */
  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera)
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, visible: v.z < 1 && v.z > -1 }
  }

  /** PNG текущего вида. */
  async snapshot(scale = 2): Promise<Blob | null> {
    const el = this.renderer.domElement
    const pr = this.renderer.getPixelRatio()
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    const overlayWas = this.overlay.visible
    this.overlay.visible = false
    this.renderer.setPixelRatio(Math.min(3, Math.max(pr, scale)))
    this.renderer.setSize(w, h)
    this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    const blob = await new Promise<Blob | null>((resolve) => el.toBlob(resolve, 'image/png'))
    this.overlay.visible = overlayWas
    this.renderer.setPixelRatio(pr)
    this.resize()
    return blob
  }
}
