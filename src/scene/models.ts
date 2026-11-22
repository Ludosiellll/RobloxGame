// Библиотека моделей: встроенные (Kenney) и загруженные. Приводит модель к метрам,
// ставит основанием на пол и по центру, раздаёт копии с возможностью перекраски.

import * as THREE from 'three'
import { KIT_BY_KEY, KIT_SCALE } from '../core/catalog'
import type { ItemSrc } from '../core/doc'
import { fitScale } from '../core/geom'
import { gltfLoader, loadFromFiles, type FileSet } from './importers'

export interface Template {
  /** корень с моделью: основание на y=0, центр по x и z */
  root: THREE.Object3D
  size: THREE.Vector3
  /** имена материалов, которые можно перекрасить */
  slots: string[]
  /** исходные цвета материалов */
  baseColors: Record<string, string>
  hasLamp: boolean
}

export interface UserModel {
  id: string
  name: string
  main: string
  files: FileSet
  thumb: string
  /** поворот «на бок» шагами по 90°, если модель импортирована лежащей */
  tilt: number
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Дать материалам уникальные понятные имена и вернуть список. */
function nameSlots(root: THREE.Object3D): { slots: string[]; base: Record<string, string> } {
  const seen = new Map<THREE.Material, string>()
  const used = new Set<string>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of materialsOf(mesh)) {
      if (seen.has(m)) continue
      let name = (m.name || '').trim() || `Материал ${seen.size + 1}`
      if (used.has(name)) {
        let n = 2
        while (used.has(`${name} ${n}`)) n++
        name = `${name} ${n}`
      }
      used.add(name)
      m.name = name
      seen.set(m, name)
    }
  })
  const base: Record<string, string> = {}
  for (const [m, name] of seen) {
    const c = (m as THREE.MeshStandardMaterial).color
    base[name] = c ? `#${c.getHexString()}` : '#cccccc'
  }
  return { slots: [...seen.values()], base }
}

function normalize(object: THREE.Object3D, scale: number): { root: THREE.Group; size: THREE.Vector3 } {
  const holder = new THREE.Group()
  holder.add(object)
  holder.scale.setScalar(scale)
  holder.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(holder)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  holder.position.set(-center.x, -box.min.y, -center.z)
  const root = new THREE.Group()
  root.add(holder)
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  return { root, size }
}

/** Привести материалы встроенного набора к приятному виду при нашем свете. */
function tuneKitMaterials(root: THREE.Object3D): void {
  const done = new Set<THREE.Material>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of materialsOf(mesh)) {
      if (done.has(m)) continue
      done.add(m)
      const s = m as THREE.MeshStandardMaterial
      const n = s.name
      if (n.startsWith('metal')) {
        s.roughness = 0.38
        s.metalness = 0.55
      } else if (n === 'glass') {
        s.transparent = true
        s.opacity = 0.35
        s.roughness = 0.05
        s.metalness = 0.1
        s.depthWrite = false
      } else if (n === 'lamp') {
        s.roughness = 0.6
        s.emissive = new THREE.Color('#ffd9a0')
        s.emissiveIntensity = 0
      } else if (n.startsWith('wood')) {
        s.roughness = 0.7
      } else {
        s.roughness = 0.9
      }
    }
  })
}

export class ModelLibrary {
  private readonly cache = new Map<string, Promise<Template>>()
  readonly user = new Map<string, UserModel>()
  private readonly loader = gltfLoader()

  private keyOf(src: ItemSrc): string {
    return `${src.kind}:${src.key}`
  }

  has(src: ItemSrc): boolean {
    return src.kind === 'kit' ? KIT_BY_KEY.has(src.key) : this.user.has(src.key)
  }

  get(src: ItemSrc): Promise<Template> {
    const key = this.keyOf(src)
    let p = this.cache.get(key)
    if (!p) {
      p = src.kind === 'kit' ? this.loadKit(src.key) : this.loadUser(src.key)
      this.cache.set(key, p)
      p.catch(() => this.cache.delete(key))
    }
    return p
  }

  private async loadKit(key: string): Promise<Template> {
    const gltf = await this.loader.loadAsync(new URL(`models/kit/${key}.glb`, document.baseURI).href)
    const { slots, base } = nameSlots(gltf.scene)
    tuneKitMaterials(gltf.scene)
    const { root, size } = normalize(gltf.scene, KIT_SCALE)
    return { root, size, slots, baseColors: base, hasLamp: slots.includes('lamp') }
  }

  private async loadUser(id: string): Promise<Template> {
    const model = this.user.get(id)
    if (!model) throw new Error(`unknown model ${id}`)
    const { object } = await loadFromFiles(model.files, model.main)
    return this.templateFromObject(object, model.tilt)
  }

  /** Шаблон из только что прочитанного объекта (используется и при импорте). */
  templateFromObject(object: THREE.Object3D, tilt = 0): Template {
    const { slots, base } = nameSlots(object)
    const tilted = new THREE.Group()
    tilted.add(object)
    tilted.rotation.x = (tilt * Math.PI) / 2
    tilted.updateMatrixWorld(true)
    const raw = new THREE.Box3().setFromObject(tilted).getSize(new THREE.Vector3())
    const { root, size } = normalize(tilted, fitScale(Math.max(raw.x, raw.y, raw.z)))
    return { root, size, slots: slots.slice(0, 16), baseColors: base, hasLamp: false }
  }

  registerUser(model: UserModel, template?: Template): void {
    this.user.set(model.id, model)
    this.cache.delete(`user:${model.id}`)
    if (template) this.cache.set(`user:${model.id}`, Promise.resolve(template))
  }

  removeUser(id: string): void {
    this.user.delete(id)
    this.cache.delete(`user:${id}`)
  }

  /** Сбросить кеш шаблона (после смены наклона модели). */
  invalidate(src: ItemSrc): void {
    this.cache.delete(this.keyOf(src))
  }
}

/** Копия шаблона для сцены. Геометрия общая, материалы клонируются при перекраске. */
export function instantiate(template: Template): THREE.Object3D {
  return template.root.clone(true)
}

/** Применить перекраску к копии. Материалы копии клонируются один раз и дальше переиспользуются. */
export function applyColors(instance: THREE.Object3D, template: Template, colors: Record<string, string>, lampsOn: boolean): void {
  const own: Map<string, THREE.Material> = (instance.userData.ownMats ??= new Map())
  instance.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const list = materialsOf(mesh)
    const next = list.map((m) => {
      const name = m.name
      const wanted = colors[name]
      const isLamp = name === 'lamp' && template.hasLamp
      if (wanted === undefined && !isLamp && !own.has(name)) return m
      let mine = own.get(name)
      if (!mine) {
        mine = m.clone()
        mine.name = name
        own.set(name, mine)
      }
      const s = mine as THREE.MeshStandardMaterial
      if (s.color) s.color.set(wanted ?? template.baseColors[name] ?? '#cccccc')
      if (isLamp) s.emissiveIntensity = lampsOn ? 1.6 : 0
      return mine
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
