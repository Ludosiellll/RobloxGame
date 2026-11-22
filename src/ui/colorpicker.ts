// Выбор цвета: сетка образцов по группам, сочетания (триада, контраст, соседние, оттенки) и свой цвет.
// Открывается внутри панели свойств вместо её содержимого и не закрывает сцену.

import { harmonies, type HarmonyId } from '../core/color'
import { tr, type Lang, type TextKey } from '../core/i18n'
import { DECKS, findSwatch } from '../core/palette'
import { h, ICON } from './dom'

export interface ColorRequest {
  title: string
  current: string
  /** цвет в проекте сейчас; null — красить больше нечего (вещь удалена, цвет сброшен отменой) */
  read?: () => string | null
  onPick: (hex: string) => void
  onReset?: () => void
  /** цвета, уже использованные в проекте: их можно взять за основу сочетаний */
  palette?: () => string[]
}

const MIX_NAMES: Record<HarmonyId, TextKey> = { triad: 'mixTriad', contrast: 'mixContrast', analogous: 'mixAnalogous', shades: 'mixShades' }

export class ColorPicker {
  readonly el: HTMLElement
  private req: ColorRequest | null = null
  private current = '#ffffff'
  /** основа сочетаний: от неё считаются триада, контраст, соседние и оттенки */
  private base = '#ffffff'

  /** вызывается, когда выбор цвета открылся или закрылся: панель свойств перерисовывается */
  onToggle: () => void = () => {}

  constructor(private readonly lang: () => Lang) {
    this.el = h('section', { class: 'picker', hidden: true })
  }

  /** Проект изменился не отсюда (отмена, повтор): показать цвет, который в нём сейчас, или закрыться. */
  sync(): void {
    if (!this.req?.read || this.el.hidden) return
    const now = this.req.read()
    if (now === null) return this.close()
    if (now.toLowerCase() === this.current) return
    this.current = now.toLowerCase()
    this.render()
  }

  open(req: ColorRequest): void {
    this.req = req
    this.current = req.current.toLowerCase()
    this.base = this.current
    this.el.hidden = false
    this.render()
    this.onToggle()
  }

  close(): void {
    if (this.el.hidden) return
    this.el.hidden = true
    this.req = null
    this.onToggle()
  }

  get isOpen(): boolean {
    return !this.el.hidden
  }

  private pick(hex: string): void {
    this.current = hex.toLowerCase()
    this.req?.onPick(this.current)
    this.render()
  }

  private render(): void {
    const req = this.req
    if (!req) return
    const lang = this.lang()
    const name = (ru: string, en: string) => (lang === 'ru' ? ru : en)
    // образцы: каждая группа — строка сетки
    const groups = DECKS.map((deck) =>
      h(
        'div',
        { class: 'swatch-group' },
        h('div', { class: 'swatch-title' }, name(deck.ru, deck.en)),
        h(
          'div',
          { class: 'swatches' },
          ...deck.swatches.map((w) => {
            const on = w.hex === this.current
            return h('button', { class: `swatch${on ? ' is-on' : ''}`, type: 'button', title: `${name(w.ru, w.en)} ${w.hex}`, 'aria-label': `${name(w.ru, w.en)} ${w.hex}`, 'aria-pressed': on ? 'true' : 'false', style: { background: w.hex }, onclick: () => this.pick(w.hex) })
          }),
        ),
      ),
    )
    const known = findSwatch(this.current)
    const hexInput = h('input', {
      class: 'hex',
      id: 'picker-hex',
      value: this.current,
      maxLength: 7,
      spellcheck: false,
      'aria-label': 'HEX',
      onchange: (e: Event) => {
        const v = (e.target as HTMLInputElement).value.trim()
        const hex = v.startsWith('#') ? v : `#${v}`
        if (/^#[0-9a-fA-F]{6}$/.test(hex)) this.pick(hex)
        else (e.target as HTMLInputElement).value = this.current
      },
    })
    const native = h('input', { type: 'color', id: 'picker-native', class: 'native', value: this.current, 'aria-label': tr(lang, 'custom'), title: tr(lang, 'custom'), oninput: (e: Event) => this.pick((e.target as HTMLInputElement).value) })
    // сочетания: основа — цвет этой вещи или любой цвет из проекта; образец красит вещь
    const used = (req.palette?.() ?? []).filter((c) => c !== this.base).slice(0, 8)
    const baseChip = (hex: string, on: boolean) =>
      h('button', { class: `base-chip${on ? ' is-on' : ''}`, type: 'button', title: `${tr(lang, 'mixUseBase')} ${hex}`, 'aria-label': `${tr(lang, 'mixUseBase')} ${hex}`, 'aria-pressed': on ? 'true' : 'false', style: { background: hex }, onclick: () => ((this.base = hex), this.render()) })
    const mix = h(
      'div',
      { class: 'picker-mix' },
      h('div', { class: 'mix-head' }, h('span', { class: 'swatch-title' }, tr(lang, 'mixTitle')), h('span', { class: 'mix-base' }, h('span', {}, tr(lang, 'mixBase')), baseChip(this.base, true), ...used.map((c) => baseChip(c, false)))),
      ...harmonies(this.base).map((g) =>
        h(
          'div',
          { class: 'mix-row', 'data-mix': g.id },
          h('span', { class: 'mix-name' }, tr(lang, MIX_NAMES[g.id])),
          h('span', { class: 'mix-chips' }, ...g.colors.map((c) => h('button', { class: `mix-chip${c === this.current ? ' is-on' : ''}`, type: 'button', title: c, 'aria-label': `${tr(lang, MIX_NAMES[g.id])} ${c}`, style: { background: c }, onclick: () => this.pick(c) }))),
        ),
      ),
    )
    this.el.replaceChildren(
      h('header', { class: 'picker-head' }, h('button', { class: 'icon-btn', type: 'button', id: 'picker-back', 'aria-label': tr(lang, 'back'), title: tr(lang, 'back'), html: ICON.back, onclick: () => this.close() }), h('div', { class: 'picker-title' }, req.title)),
      h('div', { class: 'picker-body' }, ...groups),
      mix,
      h(
        'div',
        { class: 'picker-foot' },
        h('span', { class: 'picker-now', style: { background: this.current } }),
        h('span', { class: 'picker-name' }, known ? name(known.ru, known.en) : tr(lang, 'custom')),
        hexInput,
        native,
        req.onReset ? h('button', { class: 'btn', type: 'button', onclick: () => (req.onReset?.(), this.close()) }, tr(lang, 'resetColor')) : null,
      ),
    )
  }
}
