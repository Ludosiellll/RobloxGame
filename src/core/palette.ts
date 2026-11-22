// Веер цветов: подобранные оттенки с названиями, как на образцах краски.

export interface Swatch {
  hex: string
  ru: string
  en: string
}

export interface Deck {
  id: string
  ru: string
  en: string
  swatches: Swatch[]
}

const s = (hex: string, ru: string, en: string): Swatch => ({ hex, ru, en })

export const DECKS: Deck[] = [
  {
    id: 'white',
    ru: 'Белые и серые',
    en: 'Whites & greys',
    swatches: [
      s('#fbfaf6', 'Мел', 'Chalk'),
      s('#f1f0ea', 'Пенокартон', 'Foam board'),
      s('#e8e4da', 'Лён', 'Linen'),
      s('#dcd8cf', 'Известь', 'Limewash'),
      s('#cfd2d1', 'Туман', 'Mist'),
      s('#b9bdbd', 'Алюминий', 'Aluminium'),
      s('#a3a7a8', 'Цемент', 'Cement'),
      s('#8a8f91', 'Галька', 'Pebble'),
      s('#6f7477', 'Сланец', 'Slate'),
      s('#54595c', 'Графит', 'Graphite'),
      s('#3b3f42', 'Асфальт', 'Asphalt'),
      s('#26292b', 'Уголь', 'Charcoal'),
    ],
  },
  {
    id: 'wood',
    ru: 'Дерево',
    en: 'Wood',
    swatches: [
      s('#ead9bd', 'Берёза', 'Birch'),
      s('#e2c9a0', 'Клён', 'Maple'),
      s('#d8b98f', 'Ясень', 'Ash'),
      s('#cfa878', 'Бук', 'Beech'),
      s('#c79a6b', 'Дуб', 'Oak'),
      s('#bb8553', 'Сосна', 'Pine'),
      s('#a86f45', 'Вишня', 'Cherry'),
      s('#93603c', 'Тик', 'Teak'),
      s('#7c4f33', 'Орех', 'Walnut'),
      s('#63402d', 'Мербау', 'Merbau'),
      s('#4a3226', 'Венге', 'Wenge'),
      s('#33241d', 'Морёный дуб', 'Bog oak'),
    ],
  },
  {
    id: 'warm',
    ru: 'Тёплые',
    en: 'Warm',
    swatches: [
      s('#f4e3c1', 'Ваниль', 'Vanilla'),
      s('#f0cf8e', 'Солома', 'Straw'),
      s('#e9b949', 'Горчица', 'Mustard'),
      s('#d9a441', 'Охра', 'Ochre'),
      s('#e08a3c', 'Тыква', 'Pumpkin'),
      s('#d4683a', 'Кирпич', 'Brick'),
      s('#c24b3b', 'Сурик', 'Red lead'),
      s('#a9363a', 'Гранат', 'Garnet'),
      s('#d98a8a', 'Пыльная роза', 'Dusty rose'),
      s('#e7b6a6', 'Персик', 'Peach'),
      s('#b9806b', 'Какао', 'Cocoa'),
      s('#8c5a4a', 'Каштан', 'Chestnut'),
    ],
  },
  {
    id: 'cool',
    ru: 'Холодные',
    en: 'Cool',
    swatches: [
      s('#dfe9ee', 'Иней', 'Frost'),
      s('#bfd6e2', 'Небо', 'Sky'),
      s('#9bbcd1', 'Лёд', 'Ice'),
      s('#7c8fa6', 'Джинс', 'Denim'),
      s('#5f7fa8', 'Василёк', 'Cornflower'),
      s('#3f6592', 'Кобальт', 'Cobalt'),
      s('#2d4f73', 'Чернила', 'Ink'),
      s('#22384f', 'Полночь', 'Midnight'),
      s('#8f8fb5', 'Лаванда', 'Lavender'),
      s('#6d6a97', 'Сирень', 'Lilac'),
      s('#4d4a73', 'Слива', 'Plum'),
      s('#7fb3b5', 'Бирюза', 'Turquoise'),
    ],
  },
  {
    id: 'green',
    ru: 'Зелёные',
    en: 'Greens',
    swatches: [
      s('#e3ead4', 'Фисташка', 'Pistachio'),
      s('#c8d7ae', 'Шалфей светлый', 'Pale sage'),
      s('#a9bf8f', 'Шалфей', 'Sage'),
      s('#8aa76f', 'Мох', 'Moss'),
      s('#6c8f5a', 'Папоротник', 'Fern'),
      s('#4f7550', 'Лес', 'Forest'),
      s('#2f6257', 'Макетный коврик', 'Cutting mat'),
      s('#5f7f78', 'Эвкалипт', 'Eucalyptus'),
      s('#3f5b55', 'Хвоя', 'Pine needle'),
      s('#9aa66a', 'Олива', 'Olive'),
      s('#737a3f', 'Хаки', 'Khaki'),
      s('#b7c94a', 'Лайм', 'Lime'),
    ],
  },
]

export function findSwatch(hex: string): Swatch | null {
  const h = hex.toLowerCase()
  for (const d of DECKS) for (const w of d.swatches) if (w.hex === h) return w
  return null
}

/** Тёмный ли цвет: чтобы выбрать цвет подписи на образце. */
export function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140
}
