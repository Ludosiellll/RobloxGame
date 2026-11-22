// Подложка: картинка плана квартиры лежит на коврике как калька — поверх полов, под мебелью и стенами.
// Видна в виде сверху; в объёмном виде — только пока выбрана, чтобы не мешать смотреть на результат.

import * as THREE from 'three'
import type { Doc } from '../core/doc'
import type { Stage } from './stage'

export const UNDERLAY_Y = 0.03

export class UnderlayView {
  private readonly group = new THREE.Group()
  private readonly material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  private readonly mesh: THREE.Mesh
  private key = ''
  private wanted = true

  constructor(
    private readonly stage: Stage,
    private readonly load: (id: string) => Promise<Blob | null>,
  ) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.renderOrder = 2
    this.group.add(this.mesh)
    this.group.visible = false
    stage.scene.add(this.group)
  }

  /** Картинка сейчас видна в сцене. */
  get shown(): boolean {
    return this.group.visible
  }

  /** Картинка загружена (даже если сейчас скрыта). */
  get ready(): boolean {
    return this.key !== '' && this.material.map !== null
  }

  sync(doc: Doc, wanted: boolean): void {
    this.wanted = wanted
    const u = doc.scene.underlay
    if (!u) {
      this.group.visible = false
      this.key = ''
      return
    }
    this.group.position.set(u.x, UNDERLAY_Y, u.z)
    this.group.rotation.y = (u.rot * Math.PI) / 180
    this.mesh.scale.set(u.w, u.w * u.ratio, 1)
    this.material.opacity = u.opacity
    if (u.image === this.key) {
      this.group.visible = wanted && this.material.map !== null
      return
    }
    // картинка сменилась: прежнюю убираем сразу, чтобы она не показалась вместо новой, если та не загрузится
    this.key = u.image
    this.group.visible = false
    this.material.map?.dispose()
    this.material.map = null
    this.material.needsUpdate = true
    void this.show(u.image)
  }

  private async show(id: string): Promise<void> {
    const blob = await this.load(id)
    if (!blob || this.key !== id) return
    const url = URL.createObjectURL(blob)
    try {
      const texture = await new THREE.TextureLoader().loadAsync(url)
      if (this.key !== id) return texture.dispose()
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = this.stage.maxAnisotropy
      this.material.map?.dispose()
      this.material.map = texture
      this.material.needsUpdate = true
      this.group.visible = this.wanted
      this.stage.invalidate()
    } catch {
      // картинка не читается — подложка просто не показывается
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}
