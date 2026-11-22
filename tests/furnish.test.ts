import { describe, expect, it } from 'vitest'
import { KIT_BY_KEY } from '../src/core/catalog'
import { addItem, defaultDoc, type Doc, type Item, type Opening, type Room } from '../src/core/doc'
import { PRESETS, furnish, furnishRoom, type Furnished, type RoomKind } from '../src/core/furnish'

const room = (w: number, d: number, x = 0, z = 0): Room => ({ id: 'r', x, z, w, d, floor: { kind: 'planks', color: '#c79a6b' } })
const door = (r: Room, edge: 'n' | 's' | 'w' | 'e', at = 0): Opening =>
  edge === 'n' || edge === 's'
    ? { id: `d${edge}`, kind: 'door', axis: 'x', x: r.x + at, z: r.z + (edge === 'n' ? -r.d / 2 : r.d / 2), width: 0.9 }
    : { id: `d${edge}`, kind: 'door', axis: 'z', x: r.x + (edge === 'w' ? -r.w / 2 : r.w / 2), z: r.z + at, width: 0.9 }
const windowOn = (r: Room, at = 0): Opening => ({ id: 'w1', kind: 'window', axis: 'x', x: r.x + at, z: r.z - r.d / 2, width: 1.2 })

type Box = { x0: number; x1: number; z0: number; z1: number }
const boxOf = (f: Furnished): Box => {
  const k = KIT_BY_KEY.get(f.key)!
  const turned = f.rot === 90 || f.rot === 270
  const hw = (turned ? k.d : k.w) / 2
  const hd = (turned ? k.w : k.d) / 2
  return { x0: f.x - hw, x1: f.x + hw, z0: f.z - hd, z1: f.z + hd }
}
const overlap = (a: Box, b: Box) => a.x0 < b.x1 - 0.005 && b.x0 < a.x1 - 0.005 && a.z0 < b.z1 - 0.005 && b.z0 < a.z1 - 0.005
const isFlat = (f: Furnished) => KIT_BY_KEY.get(f.key)!.h < 0.05
const onFloor = (list: Furnished[]) => list.filter((f) => f.y === 0 && !isFlat(f))
const sizeOf = (key: string) => KIT_BY_KEY.get(key) ?? null

const KINDS = Object.keys(PRESETS) as RoomKind[]
const ROOMS: [string, Room][] = [['маленькая', room(2.6, 2.2)], ['средняя', room(3.6, 3.2, 4.2, -0.6)], ['большая', room(5.4, 4.4, -0.3, 0)], ['зал', room(8, 6)]]

describe('расстановка мебели', () => {
  for (const kind of KINDS) {
    for (const [label, r] of ROOMS) {
      it(`${kind}, комната «${label}»: мебель стоит внутри комнаты, не наезжает друг на друга и не загораживает дверь`, () => {
        const d = door(r, 's', -0.6)
        const res = furnish(r, [d, windowOn(r, 0.5)], [], PRESETS[kind], sizeOf)
        const floor = onFloor(res.items)
        for (const f of floor) {
          const b = boxOf(f)
          expect(b.x0).toBeGreaterThanOrEqual(r.x - r.w / 2 + 0.05)
          expect(b.x1).toBeLessThanOrEqual(r.x + r.w / 2 - 0.05)
          expect(b.z0).toBeGreaterThanOrEqual(r.z - r.d / 2 + 0.05)
          expect(b.z1).toBeLessThanOrEqual(r.z + r.d / 2 - 0.05)
        }
        for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) expect(overlap(boxOf(floor[i]), boxOf(floor[j])), `${floor[i].key} и ${floor[j].key}`).toBe(false)
        // перед дверью свободно на 0,8 м в глубину
        const way: Box = { x0: d.x - 0.45, x1: d.x + 0.45, z0: r.z + r.d / 2 - 0.85, z1: r.z + r.d / 2 }
        for (const f of floor) expect(overlap(boxOf(f), way), `${f.key} перед дверью`).toBe(false)
        expect(res.items.length + res.skipped).toBe(PRESETS[kind].length)
      })
    }
  }

  it('в обычной комнате главный предмет набора встаёт всегда', () => {
    const r = room(3.6, 3.2)
    const main: Record<RoomKind, string[]> = { living: ['loungeSofa'], bedroom: ['bedDouble', 'bedSingle'], kitchen: ['kitchenFridge'], bath: ['bathtub', 'shower'], office: ['desk'] }
    for (const kind of KINDS) {
      const keys = furnish(r, [door(r, 's')], [], PRESETS[kind], sizeOf).items.map((f) => f.key)
      expect(main[kind].some((k) => keys.includes(k)), kind).toBe(true)
    }
  })

  it('одна и та же комната обставляется одинаково', () => {
    const r = room(5, 4)
    expect(furnish(r, [door(r, 'w')], [], PRESETS.living, sizeOf)).toEqual(furnish(r, [door(r, 'w')], [], PRESETS.living, sizeOf))
  })

  it('гостиная: тумба с телевизором стоит напротив дивана, телевизор — на тумбе', () => {
    const r = room(5.4, 4.4)
    const items = furnish(r, [door(r, 'w', 1.5)], [], PRESETS.living, sizeOf).items
    const sofa = items.find((f) => f.key === 'loungeSofa')!
    const stand = items.find((f) => f.key === 'cabinetTelevision')!
    const tv = items.find((f) => f.key === 'televisionModern')!
    expect((stand.rot + 180) % 360).toBe(sofa.rot)
    expect(tv.y).toBeCloseTo(KIT_BY_KEY.get('cabinetTelevision')!.h)
    expect([tv.x, tv.z]).toEqual([stand.x, stand.z])
  })

  it('спальня: тумбы стоят по обе стороны кровати у той же стены', () => {
    const r = room(4.5, 4)
    const items = furnish(r, [door(r, 's', 1.5)], [], PRESETS.bedroom, sizeOf).items
    const bed = items.find((f) => f.key === 'bedDouble')!
    const stands = items.filter((f) => f.key === 'cabinetBedDrawer')
    expect(stands.length).toBe(2)
    for (const s of stands) expect(s.rot).toBe(bed.rot)
    const along = bed.rot === 0 || bed.rot === 180 ? (f: Furnished) => f.x : (f: Furnished) => f.z
    expect(Math.min(...stands.map(along))).toBeLessThan(along(bed))
    expect(Math.max(...stands.map(along))).toBeGreaterThan(along(bed))
  })

  it('в узкой спальне вместо двуспальной кровати встаёт односпальная', () => {
    const r = room(1.9, 3.6)
    const keys = furnish(r, [door(r, 's', 0.4)], [], PRESETS.bedroom, sizeOf).items.map((f) => f.key)
    expect(keys).toContain('bedSingle')
    expect(keys).not.toContain('bedDouble')
  })

  it('кабинет: кресло стоит перед столом и повёрнуто к нему', () => {
    const r = room(4, 3.5)
    const items = furnish(r, [door(r, 's', 1)], [], PRESETS.office, sizeOf).items
    const desk = items.find((f) => f.key === 'desk')!
    const chair = items.find((f) => f.key === 'chairDesk')!
    expect(chair.rot).toBe((desk.rot + 180) % 360)
    expect(Math.hypot(chair.x - desk.x, chair.z - desk.z)).toBeLessThan(1.2)
  })

  it('кухня: холодильник, мойка и плита встают в один ряд от угла, вытяжка — над плитой', () => {
    const r = room(5, 3.6)
    const items = furnish(r, [door(r, 's', 1.5)], [], PRESETS.kitchen, sizeOf).items
    const row = ['kitchenFridge', 'kitchenSink', 'kitchenStoveElectric'].map((k) => items.find((f) => f.key === k))
    expect(row.every(Boolean)).toBe(true)
    const [fridge, sink, stove] = row as Furnished[]
    expect(new Set([fridge.rot, sink.rot, stove.rot]).size).toBe(1)
    const along = fridge.rot === 0 || fridge.rot === 180 ? (f: Furnished) => f.x : (f: Furnished) => f.z
    // соседние секции стоят вплотную: между серединами — ширина секции и зазор в пару сантиметров
    expect(Math.abs(along(sink) - along(fridge))).toBeCloseTo(0.93, 1)
    expect(Math.abs(along(stove) - along(sink))).toBeCloseTo(0.93, 1)
    const hood = items.find((f) => f.key === 'hoodModern')!
    expect(along(hood)).toBeCloseTo(along(stove), 2)
    expect(hood.y).toBeGreaterThan(1.4)
    expect(hood.lift).toBe(true)
  })

  it('кухня у стены с окном: ряд идёт под окном, а навесное над окном не вешается', () => {
    const r = room(4.6, 3.6)
    const win: Opening = { id: 'w', kind: 'window', axis: 'x', x: r.x - 0.6, z: r.z - r.d / 2, width: 1.4 }
    const items = furnish(r, [door(r, 's', 1.2), win, { ...win, id: 'w2', axis: 'z', x: r.x - r.w / 2, z: r.z }, { ...win, id: 'w3', axis: 'z', x: r.x + r.w / 2, z: r.z }], [], PRESETS.kitchen, sizeOf).items
    const keys = items.map((f) => f.key)
    expect(keys).toEqual(expect.arrayContaining(['kitchenFridge', 'kitchenSink', 'kitchenStoveElectric']))
    const hung = items.filter((f) => f.lift)
    for (const f of hung) if (f.rot === 0) expect(f.x + KIT_BY_KEY.get(f.key)!.w / 2 <= win.x - 0.7 || f.x - KIT_BY_KEY.get(f.key)!.w / 2 >= win.x + 0.7, f.key).toBe(true)
  })

  it('высокая мебель не закрывает окно', () => {
    const r = room(3, 3)
    // окна почти во всю северную и западную стены
    const wide: Opening[] = [
      { id: 'w1', kind: 'window', axis: 'x', x: r.x, z: r.z - r.d / 2, width: 2.6 },
      { id: 'w2', kind: 'window', axis: 'z', x: r.x - r.w / 2, z: r.z, width: 2.6 },
    ]
    const items = furnish(r, wide, [], [{ key: 'bookcaseOpen', place: 'wall' }], sizeOf).items
    expect(items.length).toBe(1)
    expect([0, 90]).not.toContain(items[0].rot)
  })

  it('обходит мебель, которая уже стоит', () => {
    const r = room(4, 3)
    const busy = [{ x0: -2, x1: 2, z0: -1.5, z1: -0.4 }]
    const items = furnish(r, [], busy, [{ key: 'loungeSofa', place: 'wall' }], sizeOf).items
    expect(items.length).toBe(1)
    expect(overlap(boxOf(items[0]), busy[0])).toBe(false)
  })

  it('телевизор не ставится на тумбу, которая уже его самого', () => {
    // в тесной комнате вместо тумбы под ТВ встаёт приставной столик — телевизор шире него
    const r = room(3.05, 2.8)
    const items = furnish(r, [door(r, 's', 0.8), windowOn(r, 0)], [], PRESETS.living, sizeOf).items
    const tv = items.find((f) => f.key === 'televisionModern')
    const base = items.find((f) => f.key === 'cabinetTelevision' || f.key === 'sideTable')
    if (tv) expect(base?.key).toBe('cabinetTelevision')
    for (let w = 1.2; w <= 1.5; w += 0.1) {
      const narrow = furnish(room(w, 3.9), [], [], PRESETS.living, sizeOf).items
      const t = narrow.find((f) => f.key === 'televisionModern')
      if (t) expect(narrow.some((f) => f.key === 'cabinetTelevision'), `комната ${w}`).toBe(true)
    }
  })

  it('высокая вещь в углу не закрывает окно на соседней стене', () => {
    const r = room(2, 3.1)
    // окно на северной стене; душевая (выше окна) просится в угол
    const win: Opening = { id: 'w', kind: 'window', axis: 'x', x: r.x + 0.36, z: r.z - r.d / 2, width: 1.2 }
    const zone = { x0: win.x - 0.6, x1: win.x + 0.6, z0: r.z - r.d / 2, z1: r.z - r.d / 2 + 0.3 }
    const items = furnish(r, [win], [], [{ key: 'shower', place: 'wall', anchor: 'start' }], sizeOf).items
    expect(items.length).toBe(1)
    expect(overlap(boxOf(items[0]), zone)).toBe(false)
  })

  it('занятое место на высоте мешает только тому, что до него достаёт', () => {
    const r = room(4, 3)
    // навесной шкаф на всю северную стену на высоте 0,5–1,3 м
    const cabinet = { x0: -2, x1: 2, z0: -1.5, z1: -1.0, y0: 0.5, y1: 1.3 }
    const sofa = furnish(r, [], [cabinet], [{ key: 'loungeSofa', place: 'wall' }], sizeOf).items[0]
    expect(overlap(boxOf(sofa), cabinet)).toBe(false)
    // низкая банкетка (0,42 м) под шкафом помещается
    const bench = furnish(r, [], [cabinet, { x0: -2, x1: 2, z0: 0.2, z1: 1.5 }, { x0: -2, x1: -1, z0: -1.5, z1: 1.5 }, { x0: 1, x1: 2, z0: -1.5, z1: 1.5 }], [{ key: 'benchCushionLow', place: 'wall' }], sizeOf).items
    expect(bench.length).toBe(1)
    expect(bench[0].rot).toBe(0)
  })

  it('над плитой уже висит шкаф: плита остаётся на месте, вытяжка туда не вешается', () => {
    const r = room(5, 3.6)
    const all = furnish(r, [door(r, 's', 1.5)], [], PRESETS.kitchen, sizeOf).items
    const stove = all.find((f) => f.key === 'kitchenStoveElectric')!
    expect(all.some((f) => f.key === 'hoodModern')).toBe(true)
    const hung = { ...boxOf(stove), y0: 1.5, y1: 2.3 }
    const again = furnish(r, [door(r, 's', 1.5)], [hung], PRESETS.kitchen, sizeOf).items
    const stoveAgain = again.find((f) => f.key === 'kitchenStoveElectric')!
    expect([stoveAgain.x, stoveAgain.z]).toEqual([stove.x, stove.z])
    expect(again.some((f) => f.key === 'hoodModern')).toBe(false)
  })

  describe('обставить комнату в проекте', () => {
    const withRoom = (): Doc => ({ ...defaultDoc(), rooms: [room(5, 4)] })
    let n = 0
    const newId = () => `n${++n}`
    const size = (i: Item) => KIT_BY_KEY.get(i.src.key) ?? null

    it('добавляет предметы набора в комнату', () => {
      const res = furnishRoom(withRoom(), 'r', 'bedroom', { replace: false, sizeOf: size, newId })
      expect(res.placed).toBeGreaterThan(3)
      expect(res.doc.items.length).toBe(res.placed)
      expect(res.doc.items.some((i) => i.src.key === 'bedDouble')).toBe(true)
      expect(new Set(res.doc.items.map((i) => i.id)).size).toBe(res.doc.items.length)
    })

    it('с заменой убирает прежнюю мебель комнаты, а мебель других комнат не трогает', () => {
      let doc: Doc = { ...defaultDoc(), rooms: [room(5, 4), { ...room(3, 3, 6, 0), id: 'other' }] }
      doc = addItem(doc, { kind: 'kit', key: 'chair' }, 'old', { x: 0, z: 0 })
      doc = addItem(doc, { kind: 'kit', key: 'chair' }, 'far', { x: 6, z: 0 })
      const res = furnishRoom(doc, 'r', 'living', { replace: true, sizeOf: size, newId })
      expect(res.doc.items.some((i) => i.id === 'old')).toBe(false)
      expect(res.doc.items.some((i) => i.id === 'far')).toBe(true)
    })

    it('без замены оставляет прежнюю мебель и ставит новую вокруг неё', () => {
      const doc = addItem(withRoom(), { kind: 'kit', key: 'bedDouble' }, 'old', { x: 0, z: 0 })
      const res = furnishRoom(doc, 'r', 'office', { replace: false, sizeOf: size, newId })
      expect(res.doc.items.some((i) => i.id === 'old')).toBe(true)
      const old = { x0: -1.01, x1: 1.01, z0: -1.18, z1: 1.18 }
      for (const i of res.doc.items.filter((q) => q.id !== 'old' && q.y === 0 && KIT_BY_KEY.get(q.src.key)!.h >= 0.05)) {
        expect(overlap(boxOf({ key: i.src.key, x: i.x, z: i.z, y: i.y, rot: i.rot, lift: i.lift, colors: i.colors }), old), i.src.key).toBe(false)
      }
    })

    it('повёрнутая не под прямым углом мебель занимает всё место, которое реально занимает', () => {
      for (const rot of [15, 30, 45, 60, 75]) {
        let doc = addItem(withRoom(), { kind: 'kit', key: 'loungeSofa' }, 'old', { x: -1.2, z: -1.2 })
        doc = { ...doc, items: doc.items.map((i) => ({ ...i, rot })) }
        const res = furnishRoom(doc, 'r', 'living', { replace: false, sizeOf: size, newId })
        // точная проверка: углы новой мебели не попадают внутрь повёрнутого дивана
        const a = (rot * Math.PI) / 180
        const insideSofa = (x: number, z: number) => {
          const dx = x + 1.2
          const dz = z + 1.2
          const lx = dx * Math.cos(a) - dz * Math.sin(a)
          const lz = dx * Math.sin(a) + dz * Math.cos(a)
          return Math.abs(lx) < 2.06 / 2 - 0.02 && Math.abs(lz) < 0.86 / 2 - 0.02
        }
        for (const i of res.doc.items.filter((q) => q.id !== 'old' && q.y === 0 && KIT_BY_KEY.get(q.src.key)!.h >= 0.05)) {
          const b = boxOf({ key: i.src.key, x: i.x, z: i.z, y: i.y, rot: i.rot, lift: i.lift, colors: i.colors })
          for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1], [i.x, i.z]]) expect(insideSofa(x, z), `${rot}°: ${i.src.key}`).toBe(false)
        }
      }
    })

    it('в слившихся комнатах мебель не ставится к краю, где стены нет, и видит вещи в общей части', () => {
      // комнаты 5×4 и 4×4 перекрываются по x от 1,5 до 2,5; диван стоит в общей части
      let doc: Doc = { ...defaultDoc(), rooms: [room(5, 4), { ...room(4, 4, 3.5, 0), id: 'other' }] }
      doc = addItem(doc, { kind: 'kit', key: 'loungeSofa' }, 'old', { x: 2, z: 0 })
      for (const kind of KINDS) {
        const res = furnishRoom(doc, 'r', kind, { replace: false, sizeOf: size, newId })
        const sofa = { x0: 2 - 1.03, x1: 2 + 1.03, z0: -0.43, z1: 0.43 }
        for (const i of res.doc.items.filter((q) => q.id !== 'old' && q.y === 0 && KIT_BY_KEY.get(q.src.key)!.h >= 0.05)) {
          const b = boxOf({ key: i.src.key, x: i.x, z: i.z, y: i.y, rot: i.rot, lift: i.lift, colors: i.colors })
          expect(overlap(b, sofa), `${kind}: ${i.src.key} на диване`).toBe(false)
          // восточный край первой комнаты (x = 2,5) проглочен второй комнатой: спиной к нему ничего не стоит
          expect(i.rot === 270 && b.x1 > 2.3, `${kind}: ${i.src.key} у несуществующей стены`).toBe(false)
        }
      }
    })

    it('неизвестная комната — проект не меняется', () => {
      const doc = withRoom()
      expect(furnishRoom(doc, 'net-takoy', 'living', { replace: true, sizeOf: size, newId }).doc).toBe(doc)
    })
  })
})
