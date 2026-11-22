// Обучение на живом макете: окно подсветки показывает место, «рука» показывает жест,
// а шаг засчитывается, когда человек сам сделал действие. Правила шагов — в core/tour.ts.

import * as THREE from 'three'
import { tr, type TextKey } from '../core/i18n'
import { TOUR_STEPS, snapOf, stepDone, tourAdvance, tourStart, type TourSnap, type TourState, type TourStepId, type TourView } from '../core/tour'
import type { Stage } from '../scene/stage'
import type { ItemsView } from '../scene/view'
import type { Store } from '../store'
import { h, ICON } from './dom'

type Rect = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }
/** жест для показа: тянуть из первой точки во вторую или щёлкнуть в первой */
interface Demo {
  from: Pt
  to: Pt | null
}

export interface TourDeps {
  store: Store
  stage: Stage
  items: ItemsView
  /** на телефоне панель сцены свёрнута — раскрыть её для шага про свет */
  openScene: () => void
  /** выйти из режимов рисования комнаты и разметки масштаба: в обучении мышь должна работать как обычно */
  stopModes: () => void
}

const DONE_KEY = 'maket.tour'
const TITLES: Record<TourStepId, TextKey> = { look: 'tourLookT', add: 'tourAddT', move: 'tourMoveT', turn: 'tourTurnT', paint: 'tourPaintT', room: 'tourRoomT', light: 'tourLightT', plan: 'tourPlanT' }

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}
/** Видимая часть элемента: то, что внутри прокручиваемой панели скрыто за её краем, подсвечивать нельзя. */
const visibleRect = (el: Element | null): Rect | null => {
  const r = rectOf(el)
  const box = rectOf(el?.closest('.inspector, .fan, .tray') ?? null)
  if (!r || !box) return r
  const x0 = Math.max(r.x, box.x)
  const y0 = Math.max(r.y, box.y)
  const x1 = Math.min(r.x + r.w, box.x + box.w)
  const y1 = Math.min(r.y + r.h, box.y + box.h)
  return x1 - x0 > 8 && y1 - y0 > 8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}
const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 })

export class Tour {
  readonly el = h('div', { class: 'tour', hidden: true })
  private readonly veil = h('div', { class: 'tour-veil' })
  private readonly hole = h('div', { class: 'tour-hole' }, h('i', {}), h('i', {}), h('i', {}), h('i', {}))
  private readonly trail = h('div', { class: 'tour-trail' })
  private readonly hand = h('div', { class: 'tour-hand', html: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2.5 18.5 11l-6.2 1.6L9.4 19z" fill="#1d2226" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="tour-ring"></span>' })
  private readonly card = h('section', { class: 'tour-card board', role: 'dialog', 'aria-live': 'polite' })
  private state: TourState | null = null
  private start: TourSnap | null = null
  /** вещь, на которой показываем «подвинуть», «повернуть» и «покрасить» */
  private focusId: string | null = null
  private variant = ''
  private completing = false
  /** камера сама переезжает (смена вида): пока едет, шаг по её положению не судим */
  private settled = true
  private raf = 0
  private demoTimer: ReturnType<typeof setTimeout> | null = null
  private nextTimer: ReturnType<typeof setTimeout> | null = null
  private glideTimer: ReturnType<typeof setTimeout> | null = null
  private readonly calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(private readonly d: TourDeps) {
    this.el.append(this.veil, this.hole, this.trail, this.hand, this.card)
    d.store.on((c) => c === 'lang' && this.rerender())
  }

  private t(key: TextKey, vars?: Record<string, string | number>): string {
    return tr(this.d.store.lang, key, vars)
  }

  get active(): boolean {
    return !this.el.hidden
  }

  /** Первый запуск: предложить обучение. Потом оно открывается из справки. */
  maybeWelcome(): void {
    let seen = false
    try {
      seen = localStorage.getItem(DONE_KEY) !== null
    } catch {
      seen = true
    }
    if (!seen) this.welcome()
  }

  private remember(): void {
    try {
      localStorage.setItem(DONE_KEY, 'done')
    } catch {
      // хранилище недоступно — предложим ещё раз в следующий запуск
    }
  }

  welcome(): void {
    this.stopStep()
    this.state = null
    this.el.hidden = false
    this.el.className = 'tour is-intro'
    this.card.className = 'tour-card board is-center'
    this.card.replaceChildren(
      h('div', { class: 'tour-art', html: WELCOME_ART }),
      h('div', { class: 'tour-tape-label' }, this.t('tourWelcomeEyebrow')),
      h('h2', {}, this.t('tourWelcomeTitle')),
      h('p', {}, this.t('tourWelcomeText')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-tape', type: 'button', id: 'tour-start', onclick: () => this.begin() }, this.t('tourStart')),
        h('button', { class: 'btn', type: 'button', id: 'tour-later', onclick: () => this.end() }, this.t('tourLater'))),
      h('p', { class: 'hint' }, this.t('tourHint')),
    )
  }

  begin(): void {
    this.el.hidden = false
    this.state = tourStart()
    this.focusId = null
    this.d.stopModes()
    // начинаем с объёмного вида: в виде сверху сцену не повернуть. Сразу, без плавного перехода —
    // иначе шаг «осмотреться» засчитался бы за движение камеры, которого человек не делал
    if (this.d.stage.view !== '3d') this.d.stage.setView('3d', true)
    this.enterStep()
    cancelAnimationFrame(this.raf)
    const loop = (): void => {
      this.tick()
      if (this.active && this.state && !this.state.finished) this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  /** Закрыть обучение насовсем (до следующего вызова из справки). */
  end(): void {
    this.stopStep()
    cancelAnimationFrame(this.raf)
    this.state = null
    this.el.hidden = true
    this.remember()
  }

  private stopStep(): void {
    for (const t of [this.demoTimer, this.nextTimer, this.glideTimer]) if (t) clearTimeout(t)
    this.demoTimer = this.nextTimer = this.glideTimer = null
    for (const a of [...this.hand.getAnimations({ subtree: true }), ...this.trail.getAnimations()]) a.cancel()
    this.hand.style.opacity = '0'
    this.trail.style.opacity = '0'
    this.completing = false
  }

  private view(): TourView {
    const { stage } = this.d
    return { mode: stage.view, azimuth: stage.controls.getAzimuthalAngle(), polar: stage.controls.getPolarAngle(), distance: stage.camera.position.distanceTo(stage.controls.target) }
  }

  private step(): TourStepId | null {
    return this.state && !this.state.finished ? TOUR_STEPS[this.state.index] : null
  }

  private enterStep(): void {
    const { store } = this.d
    const step = this.step()
    if (!step) return this.finish()
    this.stopStep()
    // подготовка: чтобы нужная панель была на виду
    if (step === 'look' || step === 'room' || step === 'light') store.select(null)
    if (step === 'light') this.d.openScene()
    // последний шаг — включить вид сверху; если он уже включён, возвращаем объёмный, чтобы было что сделать
    if (step === 'plan' && this.d.stage.view === 'plan') this.d.stage.setView('3d', true)
    this.start = snapOf(store.doc, this.view())
    this.el.className = 'tour is-step'
    this.variant = ''
    this.renderCard()
    this.glide()
    this.demoTimer = setTimeout(() => this.playDemo(), 900)
  }

  /** Окно подсветки плавно переезжает к новому месту; дальше следует за ним без задержки. */
  private glide(): void {
    this.hole.classList.add('is-gliding')
    if (this.glideTimer) clearTimeout(this.glideTimer)
    this.glideTimer = setTimeout(() => this.hole.classList.remove('is-gliding'), 620)
  }

  // ---------- куда смотреть на каждом шаге ----------

  private focusItem(): { id: string; x: number; y: number; z: number } | null {
    const { store } = this.d
    const doc = store.doc
    const sel = store.selection
    const pick = (sel?.kind === 'item' ? doc.items.find((i) => i.id === sel.id) : null) ?? doc.items.find((i) => i.id === this.focusId) ?? doc.items.find((i) => i.y === 0 && (this.d.items.size(i.id)?.y ?? 0) > 0.3) ?? doc.items[0]
    return pick ? { id: pick.id, x: pick.x, y: pick.y, z: pick.z } : null
  }

  private project(x: number, y: number, z: number): Pt {
    const { stage } = this.d
    const p = stage.project(new THREE.Vector3(x, y, z))
    const r = stage.renderer.domElement.getBoundingClientRect()
    return { x: p.x + r.left, y: p.y + r.top }
  }

  /** Прямоугольник на экране, в который попадает вещь. */
  private itemRect(): Rect | null {
    const it = this.focusItem()
    if (!it) return null
    const s = this.d.items.size(it.id) ?? new THREE.Vector3(0.6, 0.6, 0.6)
    const pts: Pt[] = []
    for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) for (const dy of [0, 1]) pts.push(this.project(it.x + dx * Math.max(s.x, s.z), it.y + dy * s.y, it.z + dz * Math.max(s.x, s.z)))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return grow({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, 8)
  }

  private room(): { x: number; z: number; w: number; d: number } | null {
    const { store } = this.d
    const sel = store.selection
    return (sel?.kind === 'room' ? store.doc.rooms.find((r) => r.id === sel.id) : null) ?? store.doc.rooms[0] ?? null
  }

  private roomRect(): Rect | null {
    const r = this.room()
    if (!r) return null
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => this.project(r.x + (sx * r.w) / 2, 0, r.z + (sz * r.d) / 2))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return grow({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, 14)
  }

  /** Свободная часть сцены между панелями. */
  private stageRect(): Rect {
    const W = window.innerWidth
    const H = window.innerHeight
    const insp = rectOf(document.querySelector('.inspector'))
    const tray = rectOf(document.querySelector('.tray'))
    const phone = W <= 760
    const right = !phone && insp ? insp.x - 20 : W - 12
    const bottom = Math.min(tray ? tray.y : H, phone && insp ? insp.y : H) - 16
    return { x: 12, y: 64, w: Math.max(80, right - 12), h: Math.max(80, bottom - 64) }
  }

  /** Что сейчас на экране: от этого зависят подсказка и место подсветки. */
  private situation(step: TourStepId): string {
    const sel = this.d.store.selection
    const fanOpen = !document.querySelector<HTMLElement>('.fan')?.hidden
    if (step === 'turn') return sel?.kind === 'item' ? 'selected' : 'idle'
    if (step === 'paint') return fanOpen ? 'fan' : sel?.kind === 'item' ? 'selected' : 'idle'
    if (step === 'room') return sel?.kind === 'room' ? 'selected' : 'idle'
    return 'idle'
  }

  /** Прокрутить панель так, чтобы нужное место было видно (на телефоне панель низкая). */
  private reveal(step: TourStepId, sit: string): void {
    const sel = step === 'turn' && sit === 'selected' ? '[data-tour="rotate"]' : step === 'paint' && sit === 'selected' ? '[data-tour="colors"]' : step === 'light' ? '#f-time' : null
    if (sel) document.querySelector(sel)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  private target(step: TourStepId, sit: string): Rect | null {
    switch (step) {
      case 'look':
        return this.stageRect()
      case 'add':
        return rectOf(document.querySelector('.tray'))
      case 'move':
        return this.itemRect()
      case 'turn':
        return sit === 'selected' ? visibleRect(document.querySelector('[data-tour="rotate"]')) ?? this.itemRect() : this.itemRect()
      case 'paint':
        if (sit === 'fan') return rectOf(document.querySelector('.fan'))
        return sit === 'selected' ? visibleRect(document.querySelector('[data-tour="colors"]')) ?? this.itemRect() : this.itemRect()
      case 'room':
        return this.roomRect()
      case 'light':
        return visibleRect(document.querySelector('#f-time')?.closest('.field') ?? null)
      case 'plan':
        return rectOf(document.querySelector('.top .seg'))
    }
  }

  private demo(step: TourStepId, sit: string, r: Rect): Demo | null {
    const c = center(r)
    switch (step) {
      case 'look':
        return { from: { x: r.x + r.w * 0.3, y: r.y + r.h * 0.78 }, to: { x: r.x + r.w * 0.6, y: r.y + r.h * 0.72 } }
      case 'add': {
        const tile = rectOf(document.querySelector('.tiles .tile:not(.tile-add):not(.tile-draw)'))
        const t = this.d.stage.controls.target
        return tile ? { from: center(tile), to: this.project(t.x, 0, t.z) } : null
      }
      case 'move':
        return { from: c, to: { x: c.x + 96, y: c.y + 26 } }
      case 'turn': {
        const btn = sit === 'selected' ? visibleRect(document.querySelector('[data-tour="rotate"] .btn:last-child')) : null
        return { from: btn ? center(btn) : c, to: null }
      }
      case 'paint': {
        if (sit === 'fan') {
          const strip = rectOf(document.querySelector('.fan .strip:nth-child(4)'))
          return { from: strip ? { x: strip.x + strip.w * 0.5, y: strip.y + strip.h * 0.3 } : c, to: null }
        }
        const chip = sit === 'selected' ? visibleRect(document.querySelector('[data-tour="colors"] .chip')) : null
        return { from: chip ? center(chip) : c, to: null }
      }
      case 'room': {
        const room = this.room()
        if (!room) return null
        if (sit === 'selected') {
          const a = this.project(room.x + room.w / 2, 0.04, room.z)
          const b = this.project(room.x + room.w / 2 + 0.9, 0.04, room.z)
          return { from: a, to: b }
        }
        return { from: this.project(room.x - room.w / 2 + 0.4, 0, room.z + room.d / 2 - 0.4), to: null }
      }
      case 'light': {
        const input = document.querySelector<HTMLInputElement>('#f-time')
        const ir = rectOf(input)
        if (!input || !ir) return null
        const v = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min) || 1)
        const from = { x: ir.x + 8 + (ir.w - 16) * v, y: ir.y + ir.h / 2 }
        return { from, to: { x: from.x + (v > 0.6 ? -70 : 70), y: from.y } }
      }
      case 'plan': {
        const btn = rectOf(document.querySelector('.top .seg .seg-btn:last-child'))
        return { from: btn ? center(btn) : c, to: null }
      }
    }
  }

  // ---------- кадр ----------

  private tick(): void {
    const step = this.step()
    if (!step || !this.start) return
    const sit = this.situation(step)
    if (sit !== this.variant) {
      // на экране стало по-другому (вещь выделили, открылся веер): новая подсказка и новый жест
      const first = this.variant === ''
      this.variant = sit
      this.renderCard()
      this.glide()
      this.reveal(step, sit)
      if (!first && !this.completing) {
        this.stopDemo()
        this.demoTimer = setTimeout(() => this.playDemo(), 450)
      }
    }
    const r = this.target(step, sit)
    if (r) {
      const pad = step === 'look' ? 0 : 6
      const s = this.hole.style
      s.left = `${Math.round(r.x - pad)}px`
      s.top = `${Math.round(r.y - pad)}px`
      s.width = `${Math.round(r.w + pad * 2)}px`
      s.height = `${Math.round(r.h + pad * 2)}px`
      s.opacity = '1'
      this.placeCard(r)
    } else this.hole.style.opacity = '0'
    if (this.d.stage.animating) {
      this.settled = false
      return
    }
    if (!this.settled) {
      // камера доехала: отсчёт поворота вида начинаем с её нового положения
      this.settled = true
      this.start = snapOf(this.start.doc, this.view())
    }
    if (!this.completing && stepDone(step, this.start, snapOf(this.d.store.doc, this.view()))) this.complete(step)
  }

  /** Карточка не должна закрывать место, которое подсвечено. */
  private placeCard(target: Rect): void {
    const c = this.card.getBoundingClientRect()
    const top = { x: c.left, y: 72, w: c.width, h: c.height }
    const overlaps = target.x < top.x + top.w + 12 && target.x + target.w > top.x - 12 && target.y < top.y + top.h + 12
    const covers = target.h > window.innerHeight * 0.5 && target.w > window.innerWidth * 0.4
    this.card.classList.toggle('is-low', overlaps && !covers)
  }

  private complete(step: TourStepId): void {
    this.completing = true
    this.stopDemo()
    if (step === 'add' && this.start) {
      // дальше учимся на вещи, которую только что поставили
      const before = new Set(this.start.doc.items.map((i) => i.id))
      this.focusId = this.d.store.doc.items.find((i) => !before.has(i.id))?.id ?? null
    }
    this.card.classList.add('is-done')
    this.card.querySelector(`.tour-cell[data-i="${this.state?.index}"]`)?.classList.add('is-done')
    this.nextTimer = setTimeout(() => this.advance(true), this.calm ? 700 : 1250)
  }

  private advance(passed: boolean): void {
    if (!this.state) return
    this.state = tourAdvance(this.state, passed)
    this.completing = false
    this.enterStep()
  }

  // ---------- показ жеста ----------

  private stopDemo(): void {
    if (this.demoTimer) clearTimeout(this.demoTimer)
    this.demoTimer = null
    for (const a of [...this.hand.getAnimations({ subtree: true }), ...this.trail.getAnimations()]) a.cancel()
    this.hand.style.opacity = '0'
    this.trail.style.opacity = '0'
  }

  private playDemo(): void {
    const step = this.step()
    if (!step || this.completing) return
    const sit = this.situation(step)
    const r = this.target(step, sit)
    const demo = r ? this.demo(step, sit, r) : null
    const again = (ms: number) => (this.demoTimer = setTimeout(() => this.playDemo(), ms))
    if (!demo) return void again(800)
    const ring = this.hand.querySelector('.tour-ring') as HTMLElement
    const at = (p: Pt) => `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`
    const { from, to } = demo
    if (this.calm) {
      // без движения: кольцо просто отмечает место
      this.hand.style.transform = at(from)
      this.hand.style.opacity = '1'
      ring.style.opacity = '1'
      ring.style.transform = 'scale(1)'
      return void again(1500)
    }
    const lead = { x: from.x - 34, y: from.y + 26 }
    let anim: Animation
    if (to) {
      // подошла, нажала, протянула, отпустила
      anim = this.hand.animate(
        [
          { transform: at(lead), opacity: 0, offset: 0 },
          { transform: at(from), opacity: 1, offset: 0.2, easing: 'cubic-bezier(.5,0,.2,1)' },
          { transform: at(from), opacity: 1, offset: 0.32, easing: 'cubic-bezier(.45,0,.2,1)' },
          { transform: at(to), opacity: 1, offset: 0.78 },
          { transform: at(to), opacity: 1, offset: 0.88 },
          { transform: at(to), opacity: 0, offset: 1 },
        ],
        { duration: 2600, fill: 'forwards' },
      )
      ring.animate(
        [
          { transform: 'scale(.3)', opacity: 0, offset: 0 },
          { transform: 'scale(.3)', opacity: 0, offset: 0.22 },
          { transform: 'scale(1)', opacity: 1, offset: 0.32 },
          { transform: 'scale(1)', opacity: 1, offset: 0.8 },
          { transform: 'scale(1.5)', opacity: 0, offset: 0.9 },
          { transform: 'scale(1.5)', opacity: 0, offset: 1 },
        ],
        { duration: 2600, fill: 'forwards' },
      )
      const len = Math.hypot(to.x - from.x, to.y - from.y)
      const angle = Math.atan2(to.y - from.y, to.x - from.x)
      this.trail.style.transform = `${at(from)} rotate(${angle}rad)`
      this.trail.animate(
        [
          { width: '0px', opacity: 0, offset: 0 },
          { width: '0px', opacity: 1, offset: 0.32, easing: 'cubic-bezier(.45,0,.2,1)' },
          { width: `${len}px`, opacity: 1, offset: 0.78 },
          { width: `${len}px`, opacity: 0, offset: 1 },
        ],
        { duration: 2600, fill: 'forwards' },
      )
    } else {
      // подошла и щёлкнула
      anim = this.hand.animate(
        [
          { transform: at(lead), opacity: 0, offset: 0 },
          { transform: at(from), opacity: 1, offset: 0.34, easing: 'cubic-bezier(.5,0,.2,1)' },
          { transform: at(from), opacity: 1, offset: 0.86 },
          { transform: at(from), opacity: 0, offset: 1 },
        ],
        { duration: 2000, fill: 'forwards' },
      )
      ring.animate(
        [
          { transform: 'scale(.3)', opacity: 0, offset: 0 },
          { transform: 'scale(.3)', opacity: 0, offset: 0.38 },
          { transform: 'scale(.9)', opacity: 1, offset: 0.48 },
          { transform: 'scale(1.7)', opacity: 0, offset: 0.7 },
          { transform: 'scale(1.7)', opacity: 0, offset: 1 },
        ],
        { duration: 2000, fill: 'forwards' },
      )
    }
    anim.onfinish = () => again(500)
  }

  // ---------- карточка ----------

  private rerender(): void {
    if (!this.active) return
    if (!this.state) this.welcome()
    else if (this.state.finished) this.finish()
    else this.renderCard()
  }

  private tape(): HTMLElement {
    const st = this.state
    return h(
      'div',
      { class: 'tour-tape', role: 'img', 'aria-label': st ? this.t('tourStepOf', { n: Math.min(st.index + 1, TOUR_STEPS.length), total: TOUR_STEPS.length }) : '' },
      ...TOUR_STEPS.map((_, i) => h('span', { class: `tour-cell${st && i < st.index ? (st.passed[i] ? ' is-done' : ' is-skipped') : ''}${st && i === st.index && !st.finished ? ' is-now' : ''}`, 'data-i': String(i) }, String(i + 1))),
    )
  }

  private text(step: TourStepId, sit: string): TextKey {
    if (step === 'turn') return sit === 'selected' ? 'tourTurnP2' : 'tourTurnP'
    if (step === 'paint') return sit === 'fan' ? 'tourPaintP3' : sit === 'selected' ? 'tourPaintP2' : 'tourPaintP'
    if (step === 'room') return sit === 'selected' ? 'tourRoomP2' : 'tourRoomP'
    const map: Record<string, TextKey> = { look: 'tourLookP', add: 'tourAddP', move: 'tourMoveP', light: 'tourLightP', plan: 'tourPlanP' }
    return map[step]
  }

  private renderCard(): void {
    const st = this.state
    const step = this.step()
    if (!st || !step) return
    const done = this.card.classList.contains('is-done') && this.completing
    const low = this.card.classList.contains('is-low')
    this.card.className = `tour-card board${done ? ' is-done' : ''}${low ? ' is-low' : ''}`
    this.card.dataset.step = step
    this.card.replaceChildren(
      this.tape(),
      h('div', { class: 'tour-eyebrow' }, this.t('tourStepOf', { n: st.index + 1, total: TOUR_STEPS.length })),
      h('h2', {}, this.t(TITLES[step])),
      h('p', {}, this.t(this.text(step, this.situation(step)))),
      h('div', { class: 'tour-stamp', 'aria-hidden': 'true' }, this.t('tourDone')),
      h('div', { class: 'tour-foot' },
        h('button', { class: 'btn btn-small', type: 'button', id: 'tour-skip', onclick: () => !this.completing && this.advance(false) }, this.t('tourSkip')),
        h('button', { class: 'btn btn-small', type: 'button', id: 'tour-end', onclick: () => this.end() }, this.t('tourEnd'))),
    )
  }

  private finish(): void {
    this.stopStep()
    cancelAnimationFrame(this.raf)
    this.remember()
    this.el.className = 'tour is-intro'
    this.card.className = 'tour-card board is-center is-finish'
    delete this.card.dataset.step
    const row = (icon: string, title: TextKey, text: TextKey) => h('li', {}, h('span', { class: 'tour-ico', html: icon }), h('div', {}, h('b', {}, this.t(title)), h('span', {}, this.t(text))))
    this.card.replaceChildren(
      this.tape(),
      h('div', { class: 'tour-tape-label' }, this.t('tourFinishEyebrow')),
      h('h2', {}, this.t('tourFinishTitle')),
      h('p', {}, this.t('tourFinishText')),
      h('ul', { class: 'tour-next' }, row(ICON.plus, 'tourNext1T', 'tourNext1P'), row(ICON.pen, 'tourNext2T', 'tourNext2P'), row(ICON.camera, 'tourNext3T', 'tourNext3P')),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-tape', type: 'button', id: 'tour-close', onclick: () => this.end() }, this.t('tourClose'))),
    )
  }
}

/** Заставка: угол комнаты прочерчивается линиями, в него встаёт жёлтое кресло, рука его подвигает. */
const gridLines = (): string => {
  // сетка коврика в той же проекции, что и комната: два семейства линий с наклоном ±1:2
  let d = ''
  for (let k = -9; k <= 14; k++) d += `M${k * 40 - 200} -100 ${k * 40 + 360} 180M${k * 40 + 360} -100 ${k * 40 - 200} 180`
  return d
}
const WELCOME_ART = `<svg viewBox="0 0 320 160" role="img" aria-hidden="true" overflow="visible">
  <path class="art-grid" d="${gridLines()}" fill="none" stroke="#4a8778" stroke-width="1"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path class="art-floor" d="M160 147 62 98 160 49l98 49z" fill="#c79a6b" stroke="#a87f55" stroke-width="1.5"/>
    <path class="art-wall art-wall-l" d="M62 98V58l98-49v40" fill="#dcdcd4" stroke="#b4b7ab" stroke-width="1.5"/>
    <path class="art-wall art-wall-r" d="M160 49V9l98 49v40" fill="#f1f0ea" stroke="#b4b7ab" stroke-width="1.5"/>
    <path class="art-window" d="M196 53V35l34 17v18z" fill="#9cc7d6" stroke="#fff" stroke-width="2"/>
  </g>
  <g class="art-chair"><path d="M118 108 142 96l22 11-24 12z" fill="#f6d262"/><path d="M118 108v12l22 11v-12z" fill="#f4c430"/><path d="M140 119v12l24-12v-12z" fill="#d2a200"/><path d="M142 78l22 11v18l-22-11z" fill="#f4c430"/><path d="M142 78l6-3 22 11-6 3z" fill="#f6d262"/></g>
  <g class="art-hand"><path d="M0 0 14.5 8.5 8.3 10.1 5.4 16.5z" fill="#1d2226" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></g>
</svg>`
