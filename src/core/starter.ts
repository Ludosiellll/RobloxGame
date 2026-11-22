// Стартовый проект: обставленная квартира, чтобы приложение открывалось в рабочем виде.

import { KIT_BY_KEY } from './catalog'
import type { Doc, Item, Opening } from './doc'

export function starterDoc(): Doc {
  const items: Item[] = []
  let n = 0
  const put = (key: string, x: number, z: number, rot = 0, extra: Partial<Item> = {}) => {
    items.push({ id: `s${++n}`, src: { kind: 'kit', key }, x, z, y: 0, rot, scale: 1, lift: false, colors: {}, ...extra })
  }
  const top = (key: string) => KIT_BY_KEY.get(key)?.h ?? 0.5

  // гостиная
  put('rugRectangle', -0.3, -0.25, 0, { colors: { carpet: '#d9d2c3', carpetDarker: '#b7ad98' } })
  put('cabinetTelevision', -0.3, -1.86)
  put('televisionModern', -0.3, -1.9, 0, { y: top('cabinetTelevision') })
  put('loungeSofa', -0.3, 1.0, 180, { colors: { carpet: '#5f7f78' } })
  put('tableCoffee', -0.3, -0.3)
  put('loungeChair', -2.2, -0.3, 90, { colors: { carpet: '#d9a441' } })
  put('lampRoundFloor', -1.75, 1.25)
  put('pottedPlant', 2.0, -1.8)
  put('bookcaseOpen', -2.68, 1.45, 90)
  put('books', -0.75, -0.3, 20, { y: top('tableCoffee') })
  put('plantSmall1', 0.2, -0.3, 0, { y: top('tableCoffee') })
  // спальня
  put('rugRound', 3.55, -0.5, 0, { colors: { carpet: '#c9b8a6', carpetDarker: '#a8957f' } })
  put('bedDouble', 4.77, -0.6, 270, { colors: { carpet: '#7c8fa6' } })
  put('cabinetBedDrawer', 5.62, -1.85, 270)
  put('cabinetBedDrawer', 5.62, 0.65, 270)
  put('lampRoundTable', 5.62, -1.85, 0, { y: top('cabinetBedDrawer') })
  put('bookcaseClosedDoors', 3.05, -1.88)
  // ванная
  put('bathtub', 4.7, 2.16, 180)
  put('toilet', 2.95, 2.25, 90)
  put('bathroomSinkSquare', 3.7, 1.35)
  put('washer', 5.5, 1.47)

  const openings: Opening[] = [
    { id: 'o1', kind: 'door', axis: 'z', x: 2.4, z: -0.6, width: 0.9 },
    { id: 'o2', kind: 'door', axis: 'z', x: 2.4, z: 1.75, width: 0.8 },
    { id: 'o3', kind: 'door', axis: 'x', x: -2.2, z: 2.2, width: 0.9 },
    { id: 'o4', kind: 'window', axis: 'x', x: -2.1, z: -2.2, width: 1.2 },
    { id: 'o5', kind: 'window', axis: 'x', x: 1.5, z: -2.2, width: 1.2 },
    { id: 'o6', kind: 'window', axis: 'x', x: 4.2, z: -2.2, width: 1.4 },
    { id: 'o7', kind: 'window', axis: 'z', x: -3.0, z: -0.2, width: 1.6 },
  ]

  return {
    v: 1,
    rooms: [
      { id: 'living', x: -0.3, z: 0, w: 5.4, d: 4.4, floor: { kind: 'planks', color: '#c79a6b' } },
      { id: 'bedroom', x: 4.2, z: -0.6, w: 3.6, d: 3.2, floor: { kind: 'planks', color: '#dcc19a' } },
      { id: 'bath', x: 4.2, z: 1.9, w: 3.6, d: 1.8, floor: { kind: 'tile', color: '#dfe6e6' } },
    ],
    walls: { h: 2.7, color: '#f1f0ea' },
    openings,
    light: { time: 0.42 },
    scene: { mat: 'green' },
    items,
  }
}
