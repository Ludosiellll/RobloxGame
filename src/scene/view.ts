// Предметы проекта в 3D: создаёт, двигает и перекрашивает объекты по данным документа.

import * as THREE from 'three'
import type { Doc, Item } from '../core/doc'
import { applyColors, instantiate, type ModelLibrary, type Template } from './models'
import type { Stage } from './stage'

interface Entry {
  group: THREE.Group
  srcKey: string
  template: Template | null
  instance: THREE.Object3D | null
  light: THREE.PointLight | null
  colorsKey: string
  failed: boolean
}

const MAX_LAMPS = 8

export class ItemsView {
  readonly group = new THREE.Group()
  private readonly entries = new Map<string, Entry>()
  private doc: Doc | null = null
  private lampsOn = false
  /** вызывается, когда модель догрузилась (нужно обновить рамку выделения, размеры) */
  onLoaded: (id: string) => void = () => {}

  constructor(private readonly stage: Stage, private readonly models: ModelLibrary) {
    stage.world.add(this.group)
  }

  sync(doc: Doc): void {
    this.doc = doc
    const alive = new Set<string>()
    for (const item of doc.items) {
      alive.add(item.id)
      let e = this.entries.get(item.id)
      const srcKey = `${item.src.kind}:${item.src.key}`
      if (e && e.srcKey !== srcKey) {
        this.drop(item.id)
        e = undefined
      }
      if (!e) e = this.create(item, srcKey)
      e.group.position.set(item.x, item.y, item.z)
      e.group.rotation.y = (item.rot * Math.PI) / 180
      e.group.scale.setScalar(item.scale)
      this.paint(e, item)
    }
    for (const id of [...this.entries.keys()]) if (!alive.has(id)) this.drop(id)
    this.updateLamps()
    this.stage.invalidate()
  }

  private create(item: Item, srcKey: string): Entry {
    const group = new THREE.Group()
    group.userData.itemId = item.id
    const e: Entry = { group, srcKey, template: null, instance: null, light: null, colorsKey: '', failed: false }
    this.entries.set(item.id, e)
    this.group.add(group)
    // пока модель грузится — полупрозрачная заготовка
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: '#f4c430', transparent: true, opacity: 0.35 }))
    ghost.userData.ghost = true
    group.add(ghost)
    this.models
      .get(item.src)
      .then((template) => {
        if (this.entries.get(item.id) !== e) return
        group.remove(ghost)
        e.template = template
        e.instance = instantiate(template)
        group.add(e.instance)
        if (template.hasLamp) {
          e.light = new THREE.PointLight('#ffd49a', 0, 6.5, 1.6)
          e.light.position.set(0, template.size.y * 0.82, 0)
          group.add(e.light)
        }
        const current = this.doc?.items.find((i) => i.id === item.id)
        if (current) this.paint(e, current, true)
        this.updateLamps()
        this.onLoaded(item.id)
        this.stage.invalidate()
      })
      .catch(() => {
        e.failed = true
        ;(ghost.material as THREE.MeshStandardMaterial).color.set('#d9482b')
        this.stage.invalidate()
      })
    return e
  }

  private paint(e: Entry, item: Item, force = false): void {
    if (!e.instance || !e.template) return
    const key = JSON.stringify(item.colors) + (this.lampsOn ? '1' : '0')
    if (!force && key === e.colorsKey) return
    e.colorsKey = key
    applyColors(e.instance, e.template, item.colors, this.lampsOn)
  }

  private drop(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    this.group.remove(e.group)
    const own = e.instance?.userData.ownMats as Map<string, THREE.Material> | undefined
    own?.forEach((m) => m.dispose())
    this.entries.delete(id)
  }

  /** Сбросить объект, чтобы он пересоздался (после замены модели). */
  reload(predicate: (srcKey: string) => boolean): void {
    for (const [id, e] of [...this.entries]) if (predicate(e.srcKey)) this.drop(id)
    if (this.doc) this.sync(this.doc)
  }

  setLamps(on: boolean): void {
    if (on === this.lampsOn) return
    this.lampsOn = on
    if (this.doc) for (const item of this.doc.items) {
      const e = this.entries.get(item.id)
      if (e) this.paint(e, item)
    }
    this.updateLamps()
  }

  private updateLamps(): void {
    let n = 0
    for (const e of this.entries.values()) {
      if (!e.light) continue
      const on = this.lampsOn && n < MAX_LAMPS
      if (on) n++
      e.light.intensity = on ? 9 : 0
      e.light.visible = on
    }
  }

  object(id: string): THREE.Group | null {
    return this.entries.get(id)?.group ?? null
  }

  template(id: string): Template | null {
    return this.entries.get(id)?.template ?? null
  }

  /** Размер предмета в метрах с учётом масштаба (до поворота). */
  size(id: string): THREE.Vector3 | null {
    const e = this.entries.get(id)
    if (!e?.template) return null
    return e.template.size.clone().multiplyScalar(e.group.scale.x)
  }

  /** Все объекты предметов для выбора мышью. */
  pickables(): THREE.Object3D[] {
    return this.group.children
  }
}

/** Найти id предмета по объекту, в который попал луч. */
export function itemIdOf(obj: THREE.Object3D | null): string | null {
  let o: THREE.Object3D | null = obj
  while (o) {
    if (typeof o.userData.itemId === 'string') return o.userData.itemId
    o = o.parent
  }
  return null
}
