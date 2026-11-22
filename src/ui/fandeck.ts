// Веер образцов цвета: полоски расходятся от заклёпки, как на настоящей раскладке краски.

import { harmonies, type HarmonyId } from '../core/color'
import { tr, type Lang, type TextKey } from '../core/i18n'
import { DECKS, findSwatch, isDark } from '../core/palette'
import { h, ICON } from './dom'

export interface FanRequest {
  title: string
  current: string
  onPick: (hex: string) => void
  onReset?: () => void
  /** цвета, уже использованные в проекте: их можно взять за основу сочетаний */
  palette?: () => string[]
}

const MIX_NAMES: Record<HarmonyId, TextKey> = { triad: 'mixTriad', contrast: 'mixContrast', analogous: 'mixAnalogous', shades: 'mixShades' }

export class FanDeck {
  readonly el: HTMLElement
  private req: FanRequest | null = null
  private deck = 0
  private current = '#ffffff'
  /** основа сочетаний: от неё считаются триада, контраст, соседние и оттенки */
  private base = '#ffffff'

  constructor(private readonly lang: () => Lang) {
    this.el = h('section', { class: 'fan board', hidden: true })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) this.close()
    })
  }

  open(req: FanRequest): void {
    this.req = req
    this.current = req.current.toLowerCase()
    this.base = this.current
    const at = DECKS.findIndex((d) => d.swatches.some((w) => w.hex === this.current))
    if (at >= 0) this.deck = at
    this.el.hidden = false
    this.render()
  }

  close(): void {
    this.el.hidden = true
    this.req = null
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
    const deck = DECKS[this.deck]
    const n = deck.swatches.length
    const spread = 106
    const strips = deck.swatches.map((w, i) => {
      const angle = -spread / 2 + (spread * i) / (n - 1)
      const selected = w.hex === this.current
      return h(
        'button',
        {
          class: `strip${selected ? ' is-on' : ''}${isDark(w.hex) ? ' is-dark' : ''}`,
          type: 'button',
          title: `${lang === 'ru' ? w.ru : w.en} ${w.hex}`,
          'aria-pressed': selected ? 'true' : 'false',
          style: { background: w.hex, '--a': `${angle}deg`, zIndex: String(selected ? 40 : i) },
          onclick: () => this.pick(w.hex),
        },
        h('span', { class: 'strip-name' }, lang === 'ru' ? w.ru : w.en),
      )
    })
    const known = findSwatch(this.current)
    const hexInput = h('input', {
      class: 'hex',
      id: 'fan-hex',
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
    const native = h('input', { type: 'color', id: 'fan-native', class: 'native', value: this.current, 'aria-label': tr(lang, 'custom'), oninput: (e: Event) => this.pick((e.target as HTMLInputElement).value) })
    // сочетания: основа — цвет этой вещи или любой цвет из проекта; образец красит вещь
    const used = (req.palette?.() ?? []).filter((c) => c !== this.base).slice(0, 8)
    const baseChip = (hex: string, on: boolean) =>
      h('button', { class: `base-chip${on ? ' is-on' : ''}`, type: 'button', title: `${tr(lang, 'mixUseBase')} ${hex}`, 'aria-label': `${tr(lang, 'mixUseBase')} ${hex}`, 'aria-pressed': on ? 'true' : 'false', style: { background: hex }, onclick: () => ((this.base = hex), this.render()) })
    const mix = h(
      'div',
      { class: 'fan-mix' },
      h('div', { class: 'mix-head' }, h('span', { class: 'label' }, tr(lang, 'mixTitle')), h('span', { class: 'mix-base' }, h('span', {}, tr(lang, 'mixBase')), baseChip(this.base, true), ...used.map((c) => baseChip(c, false)))),
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
      h('header', { class: 'fan-head' }, h('div', { class: 'label' }, req.title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr(lang, 'cancel'), html: ICON.close, onclick: () => this.close() })),
      h(
        'div',
        { class: 'fan-tabs', role: 'tablist' },
        ...DECKS.map((d, i) => h('button', { class: `fan-tab${i === this.deck ? ' is-on' : ''}`, type: 'button', onclick: () => ((this.deck = i), this.render()) }, lang === 'ru' ? d.ru : d.en)),
      ),
      h('div', { class: 'fan-stage' }, ...strips, h('span', { class: 'rivet' })),
      h(
        'div',
        { class: 'fan-foot' },
        h('span', { class: 'fan-chip', style: { background: this.current } }),
        h('div', { class: 'fan-name' }, known ? (lang === 'ru' ? known.ru : known.en) : tr(lang, 'custom')),
        hexInput,
        h('label', { class: 'native-wrap', title: tr(lang, 'custom') }, native),
        req.onReset ? h('button', { class: 'btn btn-small', type: 'button', onclick: () => (req.onReset?.(), this.close()) }, tr(lang, 'resetColor')) : null,
      ),
      mix,
    )
  }
}
