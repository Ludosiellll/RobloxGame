import './styles.css'
import * as THREE from 'three'
import { Stage } from './scene/stage'
import { RoomsView } from './scene/rooms'
import { ItemsView } from './scene/view'
import { ModelLibrary } from './scene/models'
import { Interact } from './scene/interact'
import { Store } from './store'
import { UserModels } from './userModels'
import { Toaster, Ui } from './ui/app'
import { h } from './ui/dom'

async function start(): Promise<void> {
  const store = new Store()
  const stage = new Stage(document.getElementById('stage')!)
  const models = new ModelLibrary()
  const userModels = new UserModels(models)
  // сначала возвращаем сохранённые модели пользователя, чтобы проект нашёл их при открытии
  await Promise.race([userModels.restore(), new Promise((r) => setTimeout(r, 2500))])

  const rooms = new RoomsView(stage)
  const items = new ItemsView(stage, models)
  const uiRoot = document.getElementById('ui')!
  const tags = h('div', { class: 'tags' })
  uiRoot.append(tags)
  const toaster = new Toaster()
  const interact = new Interact(stage, store, rooms, items, tags, (text) => toaster.show(text))

  let boundsKey = ''
  const render = (): void => {
    const doc = store.doc
    // предметы с удалённой моделью пользователя убираем из проекта
    const missing = doc.items.filter((i) => !models.has(i.src))
    if (missing.length) {
      store.update((d) => ({ ...d, items: d.items.filter((i) => models.has(i.src)) }), true)
      store.commit()
      return
    }
    stage.setMat(doc.scene.mat)
    stage.setTime(doc.light.time)
    rooms.sync(doc)
    const key = JSON.stringify(doc.rooms.map((r) => [r.x, r.z, r.w, r.d])) + doc.walls.h
    if (key !== boundsKey) {
      boundsKey = key
      stage.setBounds(rooms.bounds(doc))
    }
    items.setLamps(stage.lampsOn)
    items.sync(doc)
  }
  store.on((c) => c === 'doc' && render())
  render()
  stage.setView('3d', true)

  const ui = new Ui(uiRoot, { store, stage, interact, items, rooms, userModels, toaster })
  document.documentElement.lang = store.lang
  store.on((c) => c === 'lang' && (document.documentElement.lang = store.lang))

  // цифры на коврике рисуются шрифтом страницы: перерисовываем, когда он загрузится
  void document.fonts?.ready.then(() => {
    stage.mat.refresh(stage.maxAnisotropy)
    stage.invalidate()
  })

  // для проверочных скриптов
  Object.assign(window, { __maket: { store, stage, interact, items, rooms, ui, userModels, THREE } })
}

void start()
