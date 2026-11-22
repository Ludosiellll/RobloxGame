import './styles.css'
import * as THREE from 'three'
import { Stage } from './scene/stage'
import { RoomsView } from './scene/rooms'
import { ItemsView } from './scene/view'
import { ModelLibrary } from './scene/models'
import { Interact } from './scene/interact'
import { UnderlayView } from './scene/underlay'
import { ImageStore } from './images'
import { dropItems } from './core/doc'
import { isOrphan, type ModelsKnown } from './core/orphans'
import { underlaySize } from './core/underlay'
import { Store } from './store'
import { UserModels } from './userModels'
import { Toaster, Ui } from './ui/app'
import { Tour } from './ui/tour'
import { h } from './ui/dom'

async function start(): Promise<void> {
  const store = new Store()
  const stage = new Stage(document.getElementById('stage')!)
  const models = new ModelLibrary()
  const userModels = new UserModels(models)
  // сначала возвращаем сохранённые модели пользователя, чтобы проект нашёл их при открытии;
  // если хранилище отвечает долго, запускаемся без них и дочитываем позже
  const restoring = userModels.restore()
  const restoredInTime = await Promise.race([restoring.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 2500))])
  const known: ModelsKnown = {
    kit: (key) => models.has({ kind: 'kit', key }),
    user: (key) => models.has({ kind: 'user', key }),
    get userReady() {
      return userModels.state === 'ok'
    },
  }

  const images = new ImageStore()
  const underlay = new UnderlayView(stage, (id) => images.get(id))
  const rooms = new RoomsView(stage)
  const items = new ItemsView(stage, models)
  const uiRoot = document.getElementById('ui')!
  const tags = h('div', { class: 'tags' })
  uiRoot.append(tags)
  const toaster = new Toaster()
  const interact = new Interact(stage, store, rooms, items, tags, (text) => toaster.show(text))

  // план квартиры виден в виде сверху, а в объёмном — только пока выбран
  const planWanted = (): boolean => stage.view === 'plan' || store.selection?.kind === 'underlay'
  let boundsKey = ''
  const render = (): void => {
    const doc = store.doc
    // предметы, оставшиеся без модели, убираем из проекта — поправкой, а не шагом истории,
    // чтобы «Отменить» и «Вернуть» работали как раньше; пока свои модели не прочитаны, их предметы не трогаем
    const cleaned = dropItems(doc, (i) => isOrphan(i.src, known))
    if (cleaned !== doc) {
      store.amend(() => cleaned)
      return
    }
    stage.setMat(doc.scene.mat)
    stage.setTime(doc.light.time)
    rooms.sync(doc)
    underlay.sync(doc, planWanted())
    // в кадр должен помещаться и план квартиры, если он больше комнат
    const plan = doc.scene.underlay
    if (plan) {
      const size = underlaySize(plan)
      const frame = rooms.bounds(doc)
      frame.expandByPoint(new THREE.Vector3(plan.x - size.w / 2, 0, plan.z - size.d / 2))
      frame.expandByPoint(new THREE.Vector3(plan.x + size.w / 2, 0, plan.z + size.d / 2))
      stage.setFitBox(frame)
    } else stage.setFitBox(null)
    const key = JSON.stringify(doc.rooms.map((r) => [r.x, r.z, r.w, r.d])) + doc.walls.h
    if (key !== boundsKey) {
      boundsKey = key
      stage.setBounds(rooms.bounds(doc))
    }
    items.setLamps(stage.lampsOn)
    items.sync(doc)
  }
  store.on((c) => c === 'doc' && render())
  const showPlan = (): void => {
    underlay.sync(store.doc, planWanted())
    stage.invalidate()
  }
  store.on((c) => c === 'selection' && showPlan())
  stage.onView(showPlan)
  render()
  stage.setView('3d', true)
  // свои модели дочитались уже после запуска: показать их предметы
  if (!restoredInTime) {
    void restoring.then(() => {
      items.reload((srcKey) => srcKey.startsWith('user:'))
      render()
    })
  }

  const ui = new Ui(uiRoot, { store, stage, interact, items, rooms, userModels, images, toaster })
  // старые картинки планов, на которые проект уже не ссылается, из хранилища убираем
  void images.keepOnly(store.doc.scene.underlay?.image ?? null)
  // обучение: при первом запуске предлагается само, потом открывается из справки
  const tour = new Tour({
    store,
    stage,
    items,
    openScene: () => ui.openScene(),
    stopModes: () => {
      interact.stopDrawing()
      interact.stopCalibration()
    },
  })
  uiRoot.append(tour.el)
  ui.onTour = () => tour.welcome()
  document.documentElement.lang = store.lang
  store.on((c) => c === 'lang' && (document.documentElement.lang = store.lang))

  // цифры на коврике рисуются шрифтом страницы: перерисовываем, когда он загрузится
  void document.fonts?.ready.then(() => {
    stage.mat.refresh(stage.maxAnisotropy)
    stage.invalidate()
  })

  tour.maybeWelcome()

  // для проверочных скриптов
  Object.assign(window, { __maket: { store, stage, interact, items, rooms, ui, userModels, underlay, images, tour, THREE } })
}

void start()
