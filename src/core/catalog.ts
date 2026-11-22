// Встроенный каталог: 124 модели Kenney Furniture Kit (CC0). Ключ = имя файла в public/models/kit.

import kitData from './kit-data.json'

export type CatId = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'office' | 'light' | 'decor' | 'build'

export const CATEGORIES: { id: CatId; ru: string; en: string }[] = [
  { id: 'living', ru: 'Гостиная', en: 'Living' },
  { id: 'bedroom', ru: 'Спальня', en: 'Bedroom' },
  { id: 'kitchen', ru: 'Кухня', en: 'Kitchen' },
  { id: 'bath', ru: 'Ванная', en: 'Bath' },
  { id: 'office', ru: 'Работа и техника', en: 'Work & tech' },
  { id: 'light', ru: 'Свет', en: 'Lighting' },
  { id: 'decor', ru: 'Декор', en: 'Decor' },
  { id: 'build', ru: 'Лестницы', en: 'Stairs' },
]

// [ключ, категория, по-русски, по-английски]
const ROWS: [string, CatId, string, string][] = [
  ['loungeSofa', 'living', 'Диван', 'Sofa'],
  ['loungeSofaLong', 'living', 'Диван длинный', 'Long sofa'],
  ['loungeSofaCorner', 'living', 'Диван угловой', 'Corner sofa'],
  ['loungeSofaOttoman', 'living', 'Пуф', 'Ottoman'],
  ['loungeDesignSofa', 'living', 'Диван дизайнерский', 'Designer sofa'],
  ['loungeDesignSofaCorner', 'living', 'Диван дизайнерский угловой', 'Designer corner sofa'],
  ['loungeDesignChair', 'living', 'Кресло дизайнерское', 'Designer armchair'],
  ['loungeChair', 'living', 'Кресло', 'Armchair'],
  ['loungeChairRelax', 'living', 'Кресло с подставкой', 'Recliner'],
  ['tableCoffee', 'living', 'Журнальный стол', 'Coffee table'],
  ['tableCoffeeSquare', 'living', 'Журнальный стол квадратный', 'Square coffee table'],
  ['tableCoffeeGlass', 'living', 'Журнальный стол стеклянный', 'Glass coffee table'],
  ['tableCoffeeGlassSquare', 'living', 'Стеклянный стол квадратный', 'Square glass table'],
  ['cabinetTelevision', 'living', 'Тумба под ТВ', 'TV stand'],
  ['cabinetTelevisionDoors', 'living', 'Тумба под ТВ с дверцами', 'TV stand with doors'],
  ['bookcaseOpen', 'living', 'Стеллаж', 'Bookcase'],
  ['bookcaseOpenLow', 'living', 'Стеллаж низкий', 'Low bookcase'],
  ['bookcaseClosed', 'living', 'Шкаф с полками', 'Cabinet with shelves'],
  ['bookcaseClosedDoors', 'living', 'Шкаф с дверцами', 'Cabinet with doors'],
  ['bookcaseClosedWide', 'living', 'Шкаф широкий', 'Wide cabinet'],
  ['sideTable', 'living', 'Приставной столик', 'Side table'],
  ['sideTableDrawers', 'living', 'Столик с ящиками', 'Side table with drawers'],
  ['table', 'living', 'Обеденный стол', 'Dining table'],
  ['tableCloth', 'living', 'Стол со скатертью', 'Table with cloth'],
  ['tableCross', 'living', 'Стол на крестовинах', 'Trestle table'],
  ['tableCrossCloth', 'living', 'Стол на крестовинах со скатертью', 'Trestle table with cloth'],
  ['tableGlass', 'living', 'Стол стеклянный', 'Glass table'],
  ['tableRound', 'living', 'Стол круглый', 'Round table'],
  ['chair', 'living', 'Стул', 'Chair'],
  ['chairCushion', 'living', 'Стул с подушкой', 'Cushioned chair'],
  ['chairRounded', 'living', 'Стул с круглой спинкой', 'Round-back chair'],
  ['chairModernCushion', 'living', 'Стул современный', 'Modern chair'],
  ['chairModernFrameCushion', 'living', 'Стул на полозьях', 'Sled chair'],
  ['bench', 'living', 'Скамья', 'Bench'],
  ['benchCushion', 'living', 'Скамья с подушкой', 'Cushioned bench'],
  ['benchCushionLow', 'living', 'Банкетка', 'Low bench'],
  ['bedDouble', 'bedroom', 'Кровать двуспальная', 'Double bed'],
  ['bedSingle', 'bedroom', 'Кровать односпальная', 'Single bed'],
  ['bedBunk', 'bedroom', 'Кровать двухъярусная', 'Bunk bed'],
  ['cabinetBed', 'bedroom', 'Прикроватная тумба', 'Bedside cabinet'],
  ['cabinetBedDrawer', 'bedroom', 'Тумба с ящиком', 'Bedside cabinet with drawer'],
  ['cabinetBedDrawerTable', 'bedroom', 'Тумба-столик', 'Bedside table'],
  ['pillow', 'bedroom', 'Подушка', 'Pillow'],
  ['pillowLong', 'bedroom', 'Подушка длинная', 'Long pillow'],
  ['pillowBlue', 'bedroom', 'Подушка синяя', 'Blue pillow'],
  ['pillowBlueLong', 'bedroom', 'Подушка синяя длинная', 'Long blue pillow'],
  ['coatRack', 'bedroom', 'Вешалка настенная', 'Wall coat rack'],
  ['coatRackStanding', 'bedroom', 'Вешалка напольная', 'Coat stand'],
  ['kitchenCabinet', 'kitchen', 'Кухонная тумба', 'Kitchen cabinet'],
  ['kitchenCabinetDrawer', 'kitchen', 'Тумба с ящиками', 'Drawer cabinet'],
  ['kitchenCabinetCornerInner', 'kitchen', 'Тумба угловая', 'Corner cabinet'],
  ['kitchenCabinetCornerRound', 'kitchen', 'Тумба со скруглением', 'Rounded end cabinet'],
  ['kitchenCabinetUpper', 'kitchen', 'Шкаф навесной', 'Wall cabinet'],
  ['kitchenCabinetUpperDouble', 'kitchen', 'Шкаф навесной двойной', 'Double wall cabinet'],
  ['kitchenCabinetUpperLow', 'kitchen', 'Шкаф навесной низкий', 'Low wall cabinet'],
  ['kitchenCabinetUpperCorner', 'kitchen', 'Шкаф навесной угловой', 'Corner wall cabinet'],
  ['kitchenSink', 'kitchen', 'Мойка', 'Kitchen sink'],
  ['kitchenStove', 'kitchen', 'Плита газовая', 'Gas stove'],
  ['kitchenStoveElectric', 'kitchen', 'Плита электрическая', 'Electric stove'],
  ['hoodLarge', 'kitchen', 'Вытяжка большая', 'Large hood'],
  ['hoodModern', 'kitchen', 'Вытяжка современная', 'Modern hood'],
  ['kitchenFridge', 'kitchen', 'Холодильник', 'Fridge'],
  ['kitchenFridgeLarge', 'kitchen', 'Холодильник двухдверный', 'Large fridge'],
  ['kitchenFridgeSmall', 'kitchen', 'Холодильник малый', 'Small fridge'],
  ['kitchenFridgeBuiltIn', 'kitchen', 'Холодильник встроенный', 'Built-in fridge'],
  ['kitchenBar', 'kitchen', 'Барная стойка', 'Bar counter'],
  ['kitchenBarEnd', 'kitchen', 'Стойка, торец', 'Bar counter end'],
  ['stoolBar', 'kitchen', 'Барный стул', 'Bar stool'],
  ['stoolBarSquare', 'kitchen', 'Барный стул квадратный', 'Square bar stool'],
  ['kitchenMicrowave', 'kitchen', 'Микроволновка', 'Microwave'],
  ['kitchenCoffeeMachine', 'kitchen', 'Кофемашина', 'Coffee machine'],
  ['kitchenBlender', 'kitchen', 'Блендер', 'Blender'],
  ['toaster', 'kitchen', 'Тостер', 'Toaster'],
  ['bathtub', 'bath', 'Ванна', 'Bathtub'],
  ['shower', 'bath', 'Душевая кабина', 'Shower'],
  ['showerRound', 'bath', 'Душевая угловая', 'Corner shower'],
  ['toilet', 'bath', 'Унитаз', 'Toilet'],
  ['toiletSquare', 'bath', 'Унитаз квадратный', 'Square toilet'],
  ['bathroomSink', 'bath', 'Раковина', 'Sink'],
  ['bathroomSinkSquare', 'bath', 'Раковина квадратная', 'Square sink'],
  ['bathroomCabinet', 'bath', 'Шкафчик с зеркалом', 'Mirror cabinet'],
  ['bathroomCabinetDrawer', 'bath', 'Тумба с раковиной', 'Vanity unit'],
  ['bathroomMirror', 'bath', 'Зеркало', 'Mirror'],
  ['washer', 'bath', 'Стиральная машина', 'Washer'],
  ['dryer', 'bath', 'Сушильная машина', 'Dryer'],
  ['washerDryerStacked', 'bath', 'Стиральная и сушильная', 'Stacked washer & dryer'],
  ['trashcan', 'bath', 'Корзина для мусора', 'Trash can'],
  ['desk', 'office', 'Письменный стол', 'Desk'],
  ['deskCorner', 'office', 'Стол угловой', 'Corner desk'],
  ['chairDesk', 'office', 'Офисное кресло', 'Desk chair'],
  ['computerScreen', 'office', 'Монитор', 'Monitor'],
  ['computerKeyboard', 'office', 'Клавиатура', 'Keyboard'],
  ['computerMouse', 'office', 'Мышь', 'Mouse'],
  ['laptop', 'office', 'Ноутбук', 'Laptop'],
  ['televisionModern', 'office', 'Телевизор', 'TV'],
  ['televisionVintage', 'office', 'Телевизор ретро', 'Vintage TV'],
  ['televisionAntenna', 'office', 'Антенна', 'TV antenna'],
  ['speaker', 'office', 'Колонка', 'Speaker'],
  ['speakerSmall', 'office', 'Колонка малая', 'Small speaker'],
  ['radio', 'office', 'Радио', 'Radio'],
  ['lampRoundFloor', 'light', 'Торшер', 'Floor lamp'],
  ['lampSquareFloor', 'light', 'Торшер квадратный', 'Square floor lamp'],
  ['lampRoundTable', 'light', 'Настольная лампа', 'Table lamp'],
  ['lampSquareTable', 'light', 'Лампа квадратная', 'Square table lamp'],
  ['lampSquareCeiling', 'light', 'Потолочный светильник', 'Ceiling lamp'],
  ['lampWall', 'light', 'Бра', 'Wall lamp'],
  ['ceilingFan', 'light', 'Потолочный вентилятор', 'Ceiling fan'],
  ['rugRectangle', 'decor', 'Ковёр', 'Rug'],
  ['rugRound', 'decor', 'Ковёр круглый', 'Round rug'],
  ['rugRounded', 'decor', 'Ковёр овальный', 'Oval rug'],
  ['rugSquare', 'decor', 'Ковёр квадратный', 'Square rug'],
  ['rugDoormat', 'decor', 'Придверный коврик', 'Doormat'],
  ['pottedPlant', 'decor', 'Растение в кадке', 'Potted plant'],
  ['plantSmall1', 'decor', 'Суккулент', 'Succulent'],
  ['plantSmall2', 'decor', 'Кактус', 'Cactus'],
  ['plantSmall3', 'decor', 'Растение с листьями', 'Leafy plant'],
  ['books', 'decor', 'Книги', 'Books'],
  ['bear', 'decor', 'Плюшевый мишка', 'Teddy bear'],
  ['cardboardBoxClosed', 'decor', 'Коробка', 'Box'],
  ['cardboardBoxOpen', 'decor', 'Коробка открытая', 'Open box'],
  ['stairs', 'build', 'Лестница', 'Stairs'],
  ['stairsCorner', 'build', 'Лестница угловая', 'Corner stairs'],
  ['stairsOpen', 'build', 'Лестница открытая', 'Open stairs'],
  ['stairsOpenSingle', 'build', 'Лестница узкая', 'Narrow stairs'],
]

export interface KitItem {
  key: string
  cat: CatId
  ru: string
  en: string
  /** номер в листе превью */
  i: number
  /** размеры в метрах: ширина, высота, глубина */
  w: number
  h: number
  d: number
  slots: string[]
}

type KitRaw = { i: number; w: number; h: number; d: number; slots: string[] }
const raw = (kitData as unknown as { items: Record<string, KitRaw> }).items

export const KIT_SCALE = (kitData as unknown as { scale: number }).scale
export const KIT_THUMB = { tile: (kitData as unknown as { tile: number }).tile, cols: (kitData as unknown as { cols: number }).cols, count: Object.keys(raw).length }

export const KIT: KitItem[] = ROWS.filter(([key]) => raw[key]).map(([key, cat, ru, en]) => ({ key, cat, ru, en, ...raw[key] }))
export const KIT_BY_KEY = new Map(KIT.map((k) => [k.key, k]))

/** Подписи материалов встроенных моделей. */
export const SLOT_NAMES: Record<string, { ru: string; en: string }> = {
  wood: { ru: 'Дерево', en: 'Wood' },
  woodDark: { ru: 'Тёмное дерево', en: 'Dark wood' },
  carpet: { ru: 'Ткань', en: 'Fabric' },
  carpetDarker: { ru: 'Ткань, кайма', en: 'Fabric trim' },
  carpetWhite: { ru: 'Светлая отделка', en: 'Light finish' },
  carpetBlue: { ru: 'Ткань вторая', en: 'Second fabric' },
  metal: { ru: 'Металл', en: 'Metal' },
  metalDark: { ru: 'Тёмный металл', en: 'Dark metal' },
  metalLight: { ru: 'Светлый металл', en: 'Light metal' },
  metalMedium: { ru: 'Металл средний', en: 'Mid metal' },
  glass: { ru: 'Стекло', en: 'Glass' },
  lamp: { ru: 'Плафон', en: 'Shade' },
  plant: { ru: 'Листья', en: 'Leaves' },
  fur: { ru: 'Мех', en: 'Fur' },
  _defaultMat: { ru: 'Основа', en: 'Base' },
}
