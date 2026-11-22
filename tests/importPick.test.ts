import { describe, expect, it } from 'vitest'
import { extOf, isArchive, isImageFile, isModelFile, pickMainFile, resolveSibling, titleFromFile } from '../src/core/importPick'

describe('import file picking', () => {
  it('reads extensions case-insensitively', () => {
    expect(extOf('Chair.GLB')).toBe('glb')
    expect(extOf('a/b/scene.gltf')).toBe('gltf')
    expect(extOf('noext')).toBe('')
  })

  it('knows model files and archives', () => {
    expect(isModelFile('a.fbx')).toBe(true)
    expect(isModelFile('a.png')).toBe(false)
    expect(isArchive('pack.zip')).toBe(true)
  })

  it('picks the model from a Sketchfab archive', () => {
    expect(pickMainFile(['textures/wood_baseColor.png', 'scene.bin', 'scene.gltf', 'license.txt'])).toBe('scene.gltf')
  })

  it('prefers glb, then gltf, then other formats', () => {
    expect(pickMainFile(['a.obj', 'a.mtl', 'b.fbx', 'c.gltf', 'd.glb'])).toBe('d.glb')
    expect(pickMainFile(['a.obj', 'a.mtl', 'b.fbx'])).toBe('b.fbx')
    expect(pickMainFile(['a.obj', 'a.mtl', 'tex.jpg'])).toBe('a.obj')
  })

  it('ignores service folders and prefers the shallowest file', () => {
    expect(pickMainFile(['__MACOSX/._scene.gltf', 'deep/dir/other.gltf', 'model/scene.gltf'])).toBe('model/scene.gltf')
    expect(pickMainFile(['readme.txt', 'tex.png'])).toBe(null)
  })

  it('makes a readable title from a file name', () => {
    expect(titleFromFile('old_wooden-chair.glb')).toBe('Old wooden chair')
    expect(titleFromFile('source/Model.FBX')).toBe('Model')
  })

  it('finds a referenced texture among uploaded files', () => {
    const names = ['model/scene.gltf', 'model/scene.bin', 'model/textures/Wood_baseColor.png', 'other/wood_basecolor.png']
    expect(resolveSibling(names, 'textures/Wood_baseColor.png', 'model/scene.gltf')).toBe('model/textures/Wood_baseColor.png')
    expect(resolveSibling(names, './scene.bin', 'model/scene.gltf')).toBe('model/scene.bin')
    expect(resolveSibling(names, 'C:\\Users\\me\\textures\\wood_basecolor.PNG', 'model/scene.gltf')).toBe('model/textures/Wood_baseColor.png')
    expect(resolveSibling(names, 'textures/Wood%5FbaseColor.png', 'model/scene.gltf')).toBe('model/textures/Wood_baseColor.png')
    expect(resolveSibling(names, 'missing.png', 'model/scene.gltf')).toBe(null)
  })

  it('отличает картинку плана от прочих файлов', () => {
    expect(isImageFile('План квартиры.JPG')).toBe(true)
    expect(isImageFile('plan.jpeg')).toBe(true)
    expect(isImageFile('plan.png')).toBe(true)
    expect(isImageFile('plan.webp')).toBe(true)
    expect(isImageFile('chair.glb')).toBe(false)
    expect(isImageFile('plan.pdf')).toBe(false)
  })
})
