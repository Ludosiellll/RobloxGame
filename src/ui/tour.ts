// Обучение: небольшая панель с шагами. На каждом шаге — короткая запись того, что нужно сделать,
// и текст; шаг отмечается сам, когда человек сделал действие. Правила шагов — в core/tour.ts.

import * as THREE from 'three'
import { tr, type TextKey } from '../core/i18n'
import { TOUR_STEPS, snapOf, stepDone, tourAdvance, tourStart, type TourSnap, type TourState, type TourStepId, type TourView } from '../core/tour'
import type { Stage } from '../scene/stage'
import type { ItemsView } from '../scene/view'
import type { Store } from '../store'
import { h, ICON } from './dom'

type Rect = { x: number; y: number; w: number; h: number }
/** куда показывать: рамка вокруг элемента интерфейса или точка в сцене */
type Mark = { rect: Rect } | { point: { x: number; y: number } } | null

export interface TourDeps {
  store: Store
  stage: Stage
  items: ItemsView
  /** показать панель свойств или каталог (на телефоне видна только одна из них) */
  showPanel: (which: 'catalog' | 'props') => void
  /** выйти из режимов рисования комнаты и разметки масштаба: в обучении мышь должна работать как обычно */
  stopModes: () => void
  /** закрыть выбор цвета: шагу нужна сама панель свойств */
  closePicker: () => void
}

/** Узкий экран: панель под сценой, места мало — окно шага без записи. */
const NARROW = '(max-width: 900px)'
const area = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))

const DONE_KEY = 'maket.tour'
const TITLES: Record<TourStepId, TextKey> = { look: 'tourLookT', add: 'tourAddT', move: 'tourMoveT', turn: 'tourTurnT', paint: 'tourPaintT', room: 'tourRoomT', light: 'tourLightT', plan: 'tourPlanT' }

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}
/** Видимая часть элемента: то, что внутри прокручиваемой панели скрыто за её краем, показывать нельзя. */
const visibleRect = (el: Element | null): Rect | null => {
  const r = rectOf(el)
  const box = rectOf(el?.closest('.inspector, .catalog') ?? null)
  if (!r || !box) return r
  const x0 = Math.max(r.x, box.x)
  const y0 = Math.max(r.y, box.y)
  const x1 = Math.min(r.x + r.w, box.x + box.w)
  const y1 = Math.min(r.y + r.h, box.y + box.h)
  return x1 - x0 > 8 && y1 - y0 > 8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

export class Tour {
  readonly el = h('div', { class: 'tour', hidden: true })
  private readonly mark = h('div', { class: 'tour-mark', hidden: true })
  private readonly panel = h('section', { class: 'tour-panel', role: 'dialog', 'aria-live': 'polite' })
  private state: TourState | null = null
  private start: TourSnap | null = null
  /** вещь, на которой показываем «подвинуть», «повернуть» и «покрасить» */
  private focusId: string | null = null
  private variant = ''
  private completing = false
  /** камера сама переезжает (смена вида): пока едет, шаг по её положению не судим */
  private settled = true
  private raf = 0
  private nextTimer: ReturnType<typeof setTimeout> | null = null
  /** записи, которые не загрузились: второй раз их не запрашиваем */
  private readonly noClip = new Set<string>()
  /** в каком месте сейчас стоит окно шага */
  private spot = 0
  /** окну с записью не хватает места, чтобы не закрывать отметку: показываем шаги без записи, пока окно программы не изменит размер */
  private compact = false

  constructor(private readonly d: TourDeps) {
    this.el.append(this.mark, this.panel)
    d.store.on((c) => c === 'lang' && this.rerender())
    // заставка и итог стоят без покадрового цикла: при смене размера окна переставляем их сами
    window.addEventListener('resize', () => {
      this.compact = false
      if (this.active && (!this.state || this.state.finished)) this.placePanel(null)
    })
  }

  private t(key: TextKey, vars?: Record<string, string | number>): string {
    return tr(this.d.store.lang, key, vars)
  }

  get active(): boolean {
    return !this.el.hidden
  }

  /** Первый запуск: предложить обучение. Потом оно открывается из меню «Справка». */
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

  private head(title: string): HTMLElement {
    return h('header', { class: 'tour-head' }, h('span', {}, title), h('button', { class: 'icon-btn', type: 'button', id: 'tour-end', title: this.t('close'), 'aria-label': this.t('close'), html: ICON.close, onclick: () => this.end() }))
  }

  welcome(): void {
    this.stopStep()
    cancelAnimationFrame(this.raf)
    this.state = null
    this.el.hidden = false
    this.mark.hidden = true
    delete this.panel.dataset.step
    this.panel.className = 'tour-panel'
    this.spot = 0
    this.panel.replaceChildren(
      this.head(this.t('tourTitle')),
      h('div', { class: 'tour-body' }, h('p', {}, this.t('tourWelcomeText'))),
      h('footer', { class: 'tour-foot' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'tour-start', onclick: () => this.begin() }, this.t('tourStart')), h('button', { class: 'btn', type: 'button', id: 'tour-later', onclick: () => this.end() }, this.t('tourLater'))),
    )
    this.placePanel(null)
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

  /** Закрыть обучение (до следующего вызова из меню). */
  end(): void {
    this.stopStep()
    cancelAnimationFrame(this.raf)
    this.state = null
    this.el.hidden = true
    // содержимое убираем: запись не должна играть в скрытом окне
    this.panel.replaceChildren()
    delete this.panel.dataset.step
    this.remember()
  }

  private stopStep(): void {
    if (this.nextTimer) clearTimeout(this.nextTimer)
    this.nextTimer = null
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
    // подготовка: чтобы нужная панель была на виду (выбор цвета с прошлого шага её закрывал бы)
    this.d.closePicker()
    if (step === 'look' || step === 'room' || step === 'light') store.select(null)
    if (step === 'add') this.d.showPanel('catalog')
    if (step === 'light') this.d.showPanel('props')
    // последний шаг — включить вид сверху; если он уже включён, возвращаем объёмный, чтобы было что сделать
    if (step === 'plan' && this.d.stage.view === 'plan') this.d.stage.setView('3d', true)
    this.start = snapOf(store.doc, this.view())
    this.variant = ''
    this.renderStep()
  }

  // ---------- куда показывать на каждом шаге ----------

  private focusItem(): { id: string; x: number; y: number; z: number } | null {
    const { store } = this.d
    const doc = store.doc
    const sel = store.selection
    const pick = (sel?.kind === 'item' ? doc.items.find((i) => i.id === sel.id) : null) ?? doc.items.find((i) => i.id === this.focusId) ?? doc.items.find((i) => i.y === 0 && (this.d.items.size(i.id)?.y ?? 0) > 0.3) ?? doc.items[0]
    return pick ? { id: pick.id, x: pick.x, y: pick.y, z: pick.z } : null
  }

  private project(x: number, y: number, z: number): { x: number; y: number } {
    const { stage } = this.d
    const p = stage.project(new THREE.Vector3(x, y, z))
    const r = stage.renderer.domElement.getBoundingClientRect()
    return { x: p.x + r.left, y: p.y + r.top }
  }

  private itemMark(): Mark {
    const it = this.focusItem()
    if (!it) return null
    const s = this.d.items.size(it.id)
    return { point: this.project(it.x, it.y + (s?.y ?? 0.6) * 0.6, it.z) }
  }

  private room(): { x: number; z: number; w: number; d: number } | null {
    const { store } = this.d
    const sel = store.selection
    return (sel?.kind === 'room' ? store.doc.rooms.find((r) => r.id === sel.id) : null) ?? store.doc.rooms[0] ?? null
  }

  /** Что сейчас на экране: от этого зависят подсказка и место отметки. */
  private situation(step: TourStepId): string {
    const sel = this.d.store.selection
    const picker = document.querySelector<HTMLElement>('.picker')
    const pickerOpen = !!picker && !picker.hidden
    if (step === 'turn') return sel?.kind === 'item' ? 'selected' : 'idle'
    if (step === 'paint') return pickerOpen ? 'picker' : sel?.kind === 'item' ? 'selected' : 'idle'
    if (step === 'room') return sel?.kind === 'room' ? 'selected' : 'idle'
    return 'idle'
  }

  private target(step: TourStepId, sit: string): Mark {
    const box = (el: Element | null): Mark => {
      const r = visibleRect(el)
      return r ? { rect: r } : null
    }
    switch (step) {
      case 'look':
        return null
      case 'add':
        return box(document.querySelector('.tiles'))
      case 'move':
        return this.itemMark()
      case 'turn':
        return sit === 'selected' ? box(document.querySelector('[data-tour="rotate"]')) ?? this.itemMark() : this.itemMark()
      case 'paint':
        if (sit === 'picker') return box(document.querySelector('.picker-body'))
        return sit === 'selected' ? box(document.querySelector('[data-tour="colors"]')) ?? this.itemMark() : this.itemMark()
      case 'room': {
        const r = this.room()
        if (!r) return null
        // выделенной комнате показываем ручку на краю, иначе — свободное место пола
        return { point: sit === 'selected' ? this.project(r.x + r.w / 2, 0.04, r.z) : this.project(r.x - r.w / 2 + 0.4, 0, r.z + r.d / 2 - 0.4) }
      }
      case 'light':
        return box(document.querySelector('#f-time')?.closest('.field') ?? null)
      case 'plan':
        return box(document.querySelector('.toolbar .seg'))
    }
  }

  /** Прокрутить панель так, чтобы нужное место было видно (на телефоне панель низкая). */
  private reveal(step: TourStepId, sit: string): void {
    const sel = step === 'turn' && sit === 'selected' ? '[data-tour="rotate"]' : step === 'paint' && sit === 'selected' ? '[data-tour="colors"]' : step === 'light' ? '#f-time' : null
    if (sel) document.querySelector(sel)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  // ---------- кадр ----------

  private tick(): void {
    const step = this.step()
    if (!step || !this.start) return
    const sit = this.situation(step)
    if (sit !== this.variant) {
      // на экране стало по-другому (вещь выделили, открылся выбор цвета): новая подсказка
      this.variant = sit
      this.renderStep()
      this.reveal(step, sit)
    }
    const mark = this.completing ? null : this.target(step, sit)
    this.placeMark(mark)
    this.placePanel(mark)
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

  private placeMark(m: Mark): void {
    this.mark.hidden = m === null
    if (!m) return
    const host = this.el.getBoundingClientRect()
    const s = this.mark.style
    if ('rect' in m) {
      this.mark.className = 'tour-mark'
      s.left = `${Math.round(m.rect.x - host.left - 3)}px`
      s.top = `${Math.round(m.rect.y - host.top - 3)}px`
      s.width = `${Math.round(m.rect.w + 6)}px`
      s.height = `${Math.round(m.rect.h + 6)}px`
    } else {
      this.mark.className = 'tour-mark is-point'
      s.left = `${Math.round(m.point.x - host.left)}px`
      s.top = `${Math.round(m.point.y - host.top)}px`
      s.width = s.height = ''
    }
  }

  /**
   * Поставить окно шага туда, где оно не закрывает отметку и то, с чем сейчас работают.
   * На компьютере — один из углов сцены; на узком экране — над нижней панелью или у верха сцены.
   */
  private placePanel(m: Mark): void {
    const view = rectOf(document.querySelector('.view'))
    const host = this.el.getBoundingClientRect()
    const w = this.panel.offsetWidth
    const ht = this.panel.offsetHeight
    if (!view || !w || !ht) return
    const pad = 10
    // полоса режима («Готово») вверху сцены должна оставаться доступной
    const bar = rectOf(document.querySelector('.mode-bar'))
    const top = view.y + (bar ? bar.h : 0) + pad
    let spots: { x: number; y: number }[]
    if (window.matchMedia(NARROW).matches) {
      const dock = rectOf(document.querySelector('.dock-tabs'))
      const floor = (dock ? dock.y : host.top + host.height) - pad
      spots = [{ x: view.x + (view.w - w) / 2, y: floor - ht }, { x: view.x + (view.w - w) / 2, y: top }]
    } else {
      const left = view.x + pad
      const right = view.x + view.w - w - pad
      const bottom = view.y + view.h - ht - pad
      spots = [{ x: left, y: bottom }, { x: right, y: bottom }, { x: right, y: top }, { x: left, y: top }]
    }
    // место вокруг отметки: у точки в сцене — сама вещь, у рамки — небольшой запас
    const keep: Rect | null = !m ? null : 'rect' in m ? { x: m.rect.x - 12, y: m.rect.y - 12, w: m.rect.w + 24, h: m.rect.h + 24 } : { x: m.point.x - 70, y: m.point.y - 70, w: 140, h: 140 }
    const cost = (p: { x: number; y: number }): number => (keep ? area({ x: p.x, y: p.y, w, h: ht }, keep) : 0)
    if (this.spot >= spots.length) this.spot = 0
    // с места не уходим, пока оно ничего не закрывает: окно не должно прыгать
    if (cost(spots[this.spot]) > 0) {
      let best = this.spot
      spots.forEach((p, i) => {
        if (cost(p) < cost(spots[best])) best = i
      })
      this.spot = best
      // с записью окно шага высокое; если оно всё равно что-то закрывает — оставляем один текст
      const clip = this.panel.querySelector('.tour-clip')
      if (cost(spots[best]) > 0 && clip) {
        this.compact = true
        clip.remove()
        return
      }
    }
    const at = spots[this.spot]
    this.panel.style.left = `${Math.round(at.x - host.left)}px`
    this.panel.style.top = `${Math.round(Math.max(at.y, view.y + pad) - host.top)}px`
  }

  private complete(step: TourStepId): void {
    this.completing = true
    if (step === 'add' && this.start) {
      // дальше учимся на вещи, которую только что поставили
      const before = new Set(this.start.doc.items.map((i) => i.id))
      this.focusId = this.d.store.doc.items.find((i) => !before.has(i.id))?.id ?? null
    }
    this.panel.classList.add('is-done')
    this.nextTimer = setTimeout(() => this.advance(true), 1100)
  }

  private advance(passed: boolean): void {
    if (!this.state) return
    this.state = tourAdvance(this.state, passed)
    this.completing = false
    this.enterStep()
  }

  // ---------- панель ----------

  private rerender(): void {
    if (!this.active) return
    if (!this.state) this.welcome()
    else if (this.state.finished) this.finish()
    else this.renderStep()
  }

  private text(step: TourStepId, sit: string): TextKey {
    // на экране с касаниями нет мыши, колеса и клавиши R
    const touch = window.matchMedia('(pointer: coarse)').matches
    if (step === 'turn') return sit === 'selected' ? (touch ? 'tourTurnP2Touch' : 'tourTurnP2') : 'tourTurnP'
    if (step === 'paint') return sit === 'picker' ? 'tourPaintP3' : sit === 'selected' ? 'tourPaintP2' : 'tourPaintP'
    if (step === 'room') return sit === 'selected' ? 'tourRoomP2' : 'tourRoomP'
    const map: Record<string, TextKey> = { look: touch ? 'tourLookPTouch' : 'tourLookP', add: 'tourAddP', move: touch ? 'tourMovePTouch' : 'tourMoveP', light: 'tourLightP', plan: 'tourPlanP' }
    return map[step]
  }

  private renderStep(): void {
    const st = this.state
    const step = this.step()
    if (!st || !step) return
    const total = TOUR_STEPS.length
    const sameStep = this.panel.dataset.step === step
    const done = sameStep && this.completing
    this.panel.className = `tour-panel${done ? ' is-done' : ''}`
    this.panel.dataset.step = step
    // запись действия: её не пересоздаём, пока шаг и язык те же, чтобы она не начиналась заново
    const src = `tour/${step}-${this.d.store.lang}.mp4`
    let clip = this.panel.querySelector<HTMLElement>('.tour-clip')
    if (clip?.dataset.src !== src) clip = null
    if (!clip && !this.compact && !this.noClip.has(src) && !window.matchMedia(NARROW).matches) {
      const video = h('video', { class: 'tour-video', src, muted: true, loop: true, autoplay: true, playsInline: true, preload: 'auto', 'aria-hidden': 'true' })
      const box = h('div', { class: 'tour-clip', 'data-src': src }, video)
      // записи может не быть (не загрузилась или грузится слишком долго) — тогда остаётся один текст
      const drop = (): void => {
        this.noClip.add(src)
        box.remove()
      }
      const slow = setTimeout(() => video.readyState < 2 && drop(), 8000)
      video.addEventListener('loadeddata', () => clearTimeout(slow))
      video.addEventListener('error', () => {
        clearTimeout(slow)
        drop()
      })
      void video.play().catch(() => {})
      clip = box
    }
    this.panel.replaceChildren(
      this.head(this.t('tourStepOf', { n: st.index + 1, total })),
      h('div', { class: 'tour-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(st.index) }, h('i', { style: { width: `${(st.index / total) * 100}%` } })),
      ...(clip ? [clip] : []),
      h('div', { class: 'tour-body' }, h('h2', {}, this.t(TITLES[step])), h('p', {}, this.t(this.text(step, this.situation(step)))), h('p', { class: 'tour-done' }, h('span', { html: ICON.check }), this.t('tourDone'))),
      h('footer', { class: 'tour-foot' }, h('button', { class: 'btn', type: 'button', id: 'tour-skip', onclick: () => !this.completing && this.advance(false) }, this.t('tourSkip'))),
    )
  }

  private finish(): void {
    this.stopStep()
    cancelAnimationFrame(this.raf)
    this.remember()
    this.mark.hidden = true
    delete this.panel.dataset.step
    this.spot = 0
    this.panel.className = 'tour-panel is-finish'
    this.panel.replaceChildren(
      this.head(this.t('tourTitle')),
      h('div', { class: 'tour-body' }, h('h2', {}, this.t('tourFinishTitle')), h('p', {}, this.t('tourFinishText')), h('ul', { class: 'tour-next' }, h('li', {}, this.t('tourNext1')), h('li', {}, this.t('tourNext2')), h('li', {}, this.t('tourNext3')))),
      h('footer', { class: 'tour-foot' }, h('button', { class: 'btn btn-primary', type: 'button', id: 'tour-close', onclick: () => this.end() }, this.t('close'))),
    )
    this.placePanel(null)
  }
}
