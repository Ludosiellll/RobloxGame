// Небольшие помощники для сборки интерфейса без библиотек.

type Child = Node | string | null | undefined | false
type Props = Record<string, unknown>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v as Record<string, string>)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val)
        else (el.style as unknown as Record<string, string>)[prop] = val
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    else if (k === 'html') el.innerHTML = String(v)
    else if (k in el && k !== 'list') (el as unknown as Props)[k] = v
    else el.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c)
  return el
}

const svg = (body: string, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICON = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7"/><path d="M12 17h.01"/>'),
  rotL: svg('<path d="M4 4v6h6"/><path d="M4 10a8 8 0 1 1 2.5 6"/>'),
  rotR: svg('<path d="M20 4v6h-6"/><path d="M20 10a8 8 0 1 0-2.5 6"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  pen: svg('<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>'),
  flip: svg('<path d="M12 3v18"/><path d="M8 7 3 17h5z"/><path d="M16 7l5 10h-5z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  door: svg('<path d="M6 21V3h9l3 2v16"/><path d="M4 21h16"/><path d="M14 12h.01"/>', 34),
  window: svg('<rect x="4" y="4" width="16" height="15"/><path d="M12 4v15M4 11.5h16"/><path d="M3 21h18"/>', 34),
  upload: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v4h16v-4"/>', 26),
  chevron: svg('<path d="m6 9 6 6 6-6"/>', 16),
}
