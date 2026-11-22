// Макетный коврик: земля сцены. Сетка рисуется в шейдере (чёткая на любом масштабе),
// рамка, деления и цифры — отдельной текстурой, как печать на настоящем коврике.

import * as THREE from 'three'
import type { MatKind } from '../core/doc'

export const MAT_COLORS: Record<MatKind, { base: string; deep: string; line: string; print: string }> = {
  green: { base: '#2f6257', deep: '#1f443c', line: '#cfe9dc', print: '#ece6a6' },
  graphite: { base: '#3a3f44', deep: '#24282b', line: '#d5dade', print: '#f0f0ea' },
  blue: { base: '#2d4f73', deep: '#1c3550', line: '#cfe0f2', print: '#f2ecc0' },
  sand: { base: '#cdbf9f', deep: '#a99b7b', line: '#4b4332', print: '#3a3323' },
}

/** Размер печатной рамки в метрах. */
export const FRAME = { w: 20, d: 14 }

export class Mat {
  readonly group = new THREE.Group()
  private readonly ground: THREE.Mesh
  private readonly print: THREE.Mesh
  private readonly uniforms = { uLine: { value: new THREE.Color() }, uStrength: { value: 1 }, uHalf: { value: new THREE.Vector2(FRAME.w / 2 + 0.75, FRAME.d / 2 + 0.75) } }
  private kind: MatKind | null = null

  constructor() {
    const material = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uLine = this.uniforms.uLine
      shader.uniforms.uStrength = this.uniforms.uStrength
      shader.uniforms.uHalf = this.uniforms.uHalf
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
uniform vec2 uHalf;
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
  // коврик конечный: за печатной рамкой — тёмный стол без сетки
  vec2 edge = abs(p) - uHalf;
  float outside = smoothstep(0.0, 0.06, max(edge.x, edge.y));
  float g = matGrid(p, 0.1, 1.0) * 0.03 + matGrid(p, 0.5, 1.0) * 0.07 + matGrid(p, 1.0, 1.15) * 0.17;
  diffuseColor.rgb = mix(diffuseColor.rgb, uLine, clamp(g * uStrength, 0.0, 1.0) * (1.0 - outside));
  diffuseColor.rgb *= mix(1.0, 0.5, outside);
}`,
        )
    }
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), material)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.ground.name = 'mat'

    this.print = new THREE.Mesh(
      new THREE.PlaneGeometry(FRAME.w + 2, FRAME.d + 2),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false }),
    )
    this.print.rotation.x = -Math.PI / 2
    this.print.position.y = 0.003
    this.print.renderOrder = 1
    this.group.add(this.ground, this.print)
  }

  get pickTarget(): THREE.Object3D {
    return this.ground
  }

  /** Перерисовать печать (после загрузки шрифтов). */
  refresh(maxAnisotropy: number): void {
    const kind = this.kind
    if (!kind) return
    this.kind = null
    this.setKind(kind, maxAnisotropy)
  }

  setKind(kind: MatKind, maxAnisotropy: number): void {
    if (kind === this.kind) return
    this.kind = kind
    const c = MAT_COLORS[kind]
    ;(this.ground.material as THREE.MeshStandardMaterial).color.set(c.base)
    this.uniforms.uLine.value.set(c.line)
    this.uniforms.uStrength.value = kind === 'sand' ? 1.25 : 1
    const mat = this.print.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.map = printTexture(c.print, maxAnisotropy)
    mat.needsUpdate = true
  }
}

/** Печать на коврике: рамка, метровые деления с цифрами, угловые метки, транспортир. */
function printTexture(color: string, maxAnisotropy: number): THREE.CanvasTexture {
  const pxPerM = 96
  const W = (FRAME.w + 2) * pxPerM
  const H = (FRAME.d + 2) * pxPerM
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const X = (m: number) => (m + FRAME.w / 2 + 1) * pxPerM
  const Z = (m: number) => (m + FRAME.d / 2 + 1) * pxPerM
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.strokeRect(X(-FRAME.w / 2), Z(-FRAME.d / 2), FRAME.w * pxPerM, FRAME.d * pxPerM)

  ctx.font = `600 ${Math.round(pxPerM * 0.23)}px "Sofia Sans Condensed", "Arial Narrow", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // деления по длинным сторонам
  for (let m = 0; m <= FRAME.w; m++) {
    const x = X(-FRAME.w / 2 + m)
    for (const [z, dir] of [[Z(FRAME.d / 2), 1], [Z(-FRAME.d / 2), -1]] as const) {
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, z)
      ctx.lineTo(x, z + dir * pxPerM * 0.2)
      ctx.stroke()
      ctx.fillText(String(m), x, z + dir * pxPerM * 0.42)
    }
    if (m < FRAME.w) {
      for (let k = 1; k < 10; k++) {
        const xx = x + (k * pxPerM) / 10
        const len = k === 5 ? 0.13 : 0.07
        ctx.lineWidth = 1.5
        for (const [z, dir] of [[Z(FRAME.d / 2), 1], [Z(-FRAME.d / 2), -1]] as const) {
          ctx.beginPath()
          ctx.moveTo(xx, z)
          ctx.lineTo(xx, z + dir * pxPerM * len)
          ctx.stroke()
        }
      }
    }
  }
  // деления по коротким сторонам
  for (let m = 0; m <= FRAME.d; m++) {
    const z = Z(-FRAME.d / 2 + m)
    for (const [x, dir] of [[X(-FRAME.w / 2), -1], [X(FRAME.w / 2), 1]] as const) {
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, z)
      ctx.lineTo(x + dir * pxPerM * 0.2, z)
      ctx.stroke()
      ctx.fillText(String(m), x + dir * pxPerM * 0.44, z)
    }
    if (m < FRAME.d) {
      for (let k = 1; k < 10; k++) {
        const zz = z + (k * pxPerM) / 10
        const len = k === 5 ? 0.13 : 0.07
        ctx.lineWidth = 1.5
        for (const [x, dir] of [[X(-FRAME.w / 2), -1], [X(FRAME.w / 2), 1]] as const) {
          ctx.beginPath()
          ctx.moveTo(x, zz)
          ctx.lineTo(x + dir * pxPerM * len, zz)
          ctx.stroke()
        }
      }
    }
  }
  // транспортир в левом ближнем углу: дуги и лучи через 15°
  const ox = X(-FRAME.w / 2)
  const oz = Z(FRAME.d / 2)
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.55
  for (const r of [1, 2, 3]) {
    ctx.beginPath()
    ctx.arc(ox, oz, r * pxPerM, -Math.PI / 2, 0)
    ctx.stroke()
  }
  for (let a = 15; a < 90; a += 15) {
    const rad = (-a * Math.PI) / 180
    ctx.beginPath()
    ctx.moveTo(ox + Math.cos(rad) * pxPerM * 0.5, oz + Math.sin(rad) * pxPerM * 0.5)
    ctx.lineTo(ox + Math.cos(rad) * pxPerM * 3.25, oz + Math.sin(rad) * pxPerM * 3.25)
    ctx.stroke()
    ctx.save()
    ctx.translate(ox + Math.cos(rad) * pxPerM * 3.5, oz + Math.sin(rad) * pxPerM * 3.5)
    ctx.font = `600 ${Math.round(pxPerM * 0.17)}px "Sofia Sans Condensed", "Arial Narrow", sans-serif`
    ctx.fillText(`${a}°`, 0, 0)
    ctx.restore()
  }
  ctx.globalAlpha = 1
  // подпись в правом ближнем углу
  ctx.textAlign = 'right'
  ctx.font = `700 ${Math.round(pxPerM * 0.3)}px "Sofia Sans Condensed", "Arial Narrow", sans-serif`
  ctx.fillText('МАКЕТ', X(FRAME.w / 2) - pxPerM * 0.3, Z(FRAME.d / 2) - pxPerM * 0.42)
  ctx.font = `500 ${Math.round(pxPerM * 0.17)}px "Sofia Sans Condensed", "Arial Narrow", sans-serif`
  ctx.globalAlpha = 0.8
  ctx.fillText(`${FRAME.w} × ${FRAME.d} м · клетка 10 см`, X(FRAME.w / 2) - pxPerM * 0.3, Z(FRAME.d / 2) - pxPerM * 0.17)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = maxAnisotropy
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}
