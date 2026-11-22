// Чтение моделей разных форматов из набора файлов: GLB, glTF, FBX, OBJ(+MTL), DAE, 3MF, STL, PLY и ZIP-архивы.

import * as THREE from 'three'
import { unzipSync } from 'fflate'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js'
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js'
import { extOf, isArchive, pickMainFile, resolveSibling } from '../core/importPick'

export type FileSet = Map<string, Blob>

export class ImportError extends Error {
  constructor(readonly code: 'no_model' | 'unsupported' | 'broken' | 'empty') {
    super(code)
  }
}

let draco: DRACOLoader | null = null
function dracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader()
    draco.setDecoderPath(new URL('draco/', document.baseURI).href)
  }
  return draco
}

export function gltfLoader(manager?: THREE.LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(manager)
  loader.setDRACOLoader(dracoLoader())
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

/** Раскрыть архивы и собрать плоский набор файлов «путь → содержимое». */
export async function expandFiles(files: File[]): Promise<FileSet> {
  const set: FileSet = new Map()
  for (const f of files) {
    if (isArchive(f.name)) {
      let entries: Record<string, Uint8Array>
      try {
        entries = unzipSync(new Uint8Array(await f.arrayBuffer()))
      } catch {
        throw new ImportError('broken')
      }
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/') || !data.length) continue
        set.set(path, new Blob([data as BlobPart]))
      }
    } else {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath
      set.set(rel || f.name, f)
    }
  }
  return set
}

/** Прочитать модель из набора файлов. Возвращает объект в исходных единицах и ориентации. */
export async function loadFromFiles(set: FileSet, main?: string): Promise<{ object: THREE.Object3D; main: string }> {
  const names = [...set.keys()]
  const mainName = main && set.has(main) ? main : pickMainFile(names)
  if (!mainName) throw new ImportError('no_model')
  const blob = set.get(mainName)!
  const urls: string[] = []
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => {
    if (url.startsWith('data:')) return url
    const clean = url.replace(/^blob:[^/]*\/\/[^/]+\//, '').replace(/^blob:/, '')
    const hit = resolveSibling(names, clean, mainName)
    if (!hit) return url
    const u = URL.createObjectURL(set.get(hit)!)
    urls.push(u)
    return u
  })
  const ext = extOf(mainName)
  try {
    let object: THREE.Object3D
    if (ext === 'glb' || ext === 'gltf') {
      const data = ext === 'glb' ? await blob.arrayBuffer() : await blob.text()
      const gltf = await gltfLoader(manager).parseAsync(data, '')
      object = gltf.scene
    } else if (ext === 'fbx') {
      object = new FBXLoader(manager).parse(await blob.arrayBuffer(), '')
    } else if (ext === 'obj') {
      const loader = new OBJLoader(manager)
      const base = mainName.replace(/\.[^.]+$/, '').toLowerCase()
      const mtlName = names.find((n) => n.toLowerCase() === `${base}.mtl`) ?? names.find((n) => extOf(n) === 'mtl')
      if (mtlName) {
        const materials = new MTLLoader(manager).parse(await set.get(mtlName)!.text(), '')
        materials.preload()
        loader.setMaterials(materials)
      }
      object = loader.parse(await blob.text())
    } else if (ext === 'dae') {
      const res = new ColladaLoader(manager).parse(await blob.text(), '')
      if (!res) throw new ImportError('broken')
      object = res.scene
    } else if (ext === '3mf') {
      object = new ThreeMFLoader(manager).parse(await blob.arrayBuffer())
      object.rotation.x = -Math.PI / 2
    } else if (ext === 'stl' || ext === 'ply') {
      const geometry = ext === 'stl' ? new STLLoader().parse(await blob.arrayBuffer()) : new PLYLoader().parse(await blob.arrayBuffer())
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
      const hasColor = !!geometry.getAttribute('color')
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: hasColor ? '#ffffff' : '#c9ccd1', vertexColors: hasColor, roughness: 0.7 }))
      mesh.material.name = 'Модель'
      // печатные форматы обычно с осью Z вверх
      mesh.rotation.x = -Math.PI / 2
      object = new THREE.Group().add(mesh)
    } else {
      throw new ImportError('unsupported')
    }
    // дождаться текстур, которые грузятся после разбора
    await waitForTextures(object)
    let meshes = 0
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++
    })
    if (!meshes) throw new ImportError('empty')
    return { object, main: mainName }
  } catch (e) {
    if (e instanceof ImportError) throw e
    console.warn('import failed', e)
    throw new ImportError('broken')
  } finally {
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 30_000)
  }
}

function waitForTextures(object: THREE.Object3D): Promise<void> {
  const pending: Promise<void>[] = []
  object.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        const tex = value as THREE.Texture | null
        if (!tex || !(tex as THREE.Texture).isTexture) continue
        const img = tex.image as HTMLImageElement | undefined
        if (img && 'complete' in img && !img.complete) {
          pending.push(
            new Promise((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            }),
          )
        }
      }
    }
  })
  if (!pending.length) return Promise.resolve()
  return Promise.race([Promise.all(pending).then(() => undefined), new Promise<void>((r) => setTimeout(r, 6000))])
}
