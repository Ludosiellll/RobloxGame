// Превью загруженной модели: отдельный маленький рендер.

import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200)

export function renderThumb(root: THREE.Object3D, px = 192): string {
  try {
    if (!renderer || !scene) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NeutralToneMapping
      scene = new THREE.Scene()
      const pmrem = new THREE.PMREMGenerator(renderer)
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
      scene.environmentIntensity = 0.3
      const sun = new THREE.DirectionalLight(0xffffff, 2.2)
      sun.position.set(2.5, 4, 3)
      scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x8d9aa0, 0.75))
    }
    renderer.setSize(px, px)
    const copy = root.clone(true)
    scene.add(copy)
    const box = new THREE.Box3().setFromObject(copy)
    const center = box.getCenter(new THREE.Vector3())
    const dir = new THREE.Vector3(1, 0.82, 1).normalize()
    cam.position.copy(center).addScaledVector(dir, 50)
    cam.lookAt(center)
    cam.updateMatrixWorld()
    let half = 0.01
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse)
      half = Math.max(half, Math.abs(p.x), Math.abs(p.y))
    }
    half *= 1.12
    cam.left = -half
    cam.right = half
    cam.top = half
    cam.bottom = -half
    cam.updateProjectionMatrix()
    renderer.render(scene, cam)
    scene.remove(copy)
    return renderer.domElement.toDataURL('image/webp', 0.85)
  } catch {
    return ''
  }
}
