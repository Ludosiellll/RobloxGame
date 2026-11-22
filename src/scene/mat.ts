// Пол сцены: ровная плоскость с метровой сеткой. Цвет выбирается в свойствах сцены («Фон»).

import * as THREE from 'three'
import type { MatKind } from '../core/doc'

/** base — пол, deep — фон за горизонтом, line — сетка. */
export const MAT_COLORS: Record<MatKind, { base: string; deep: string; line: string }> = {
  light: { base: '#e2e5e9', deep: '#eef0f3', line: '#9aa3ae' },
  green: { base: '#2f6257', deep: '#1f443c', line: '#cfe9dc' },
  graphite: { base: '#3a3f44', deep: '#24282b', line: '#d5dade' },
  blue: { base: '#2d4f73', deep: '#1c3550', line: '#cfe0f2' },
  sand: { base: '#cdbf9f', deep: '#a99b7b', line: '#4b4332' },
}

export class Mat {
  readonly group = new THREE.Group()
  private readonly ground: THREE.Mesh
  private readonly uniforms = { uLine: { value: new THREE.Color() }, uStrength: { value: 1 } }
  private kind: MatKind | null = null

  constructor() {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLine = this.uniforms.uLine
      shader.uniforms.uStrength = this.uniforms.uStrength
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMatPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvMatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vMatPos;
uniform vec3 uLine;
uniform float uStrength;
float matGrid(vec2 p, float stepM, float px) {
  vec2 q = p / stepM;
  vec2 w = fwidth(q);
  vec2 g = abs(fract(q - 0.5) - 0.5) / max(w, vec2(1e-5));
  float l = 1.0 - clamp(min(g.x, g.y) - (px - 1.0), 0.0, 1.0);
  // мелкая сетка растворяется вдали, чтобы не рябила
  return l * (1.0 - smoothstep(0.12, 0.45, max(w.x, w.y)));
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec2 p = vMatPos.xz;
  // клетка 10 см едва заметна, полметра — слабее, метр — основная
  float g = matGrid(p, 0.1, 1.0) * 0.03 + matGrid(p, 0.5, 1.0) * 0.07 + matGrid(p, 1.0, 1.15) * 0.17;
  diffuseColor.rgb = mix(diffuseColor.rgb, uLine, clamp(g * uStrength, 0.0, 1.0));
}`,
        )
    }
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), material)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.ground.name = 'mat'
    this.group.add(this.ground)
  }

  get pickTarget(): THREE.Object3D {
    return this.ground
  }

  setKind(kind: MatKind): void {
    if (kind === this.kind) return
    this.kind = kind
    const c = MAT_COLORS[kind]
    ;(this.ground.material as THREE.MeshStandardMaterial).color.set(c.base)
    this.uniforms.uLine.value.set(c.line)
    this.uniforms.uStrength.value = kind === 'sand' || kind === 'light' ? 1.3 : 1
  }
}
