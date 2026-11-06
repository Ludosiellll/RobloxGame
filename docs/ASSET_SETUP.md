# Что сделать в Studio (один раз)

Код и паки `.rbxm` Rojo переносит сам. Карту-кратер и эффекты из плейсов `.rbxl` нужно один раз перенести вручную и сохранить в плейсе.

## 1. Обновить код

Запусти `update.cmd` и `start.cmd`, в Studio подключи Rojo (Plugins → Rojo → Connect). В Explorer появятся `ServerStorage.StudioTools.CraterBuilder` и `ServerStorage.Packs.Brainrots`.

## 2. Кратер

1. Открой старый проект `Throw Food For Animals_….rbxlx` во втором окне Studio.
2. В нём выдели `Workspace → Biomes` → Ctrl+C.
3. В плейсе игры выдели `Workspace` → Ctrl+V. Должна появиться папка `Workspace.Biomes`.
4. Если в плейсе игры остался `Baseplate` — удали его.
5. Открой **View → Command Bar** и выполни:

   ```lua
   require(game.ServerStorage.StudioTools.CraterBuilder).build()
   ```

6. Подожди строку в Output: `[Crater] done: … decor parts, … s. Save or publish the place now.` (может занять минуту-две, Studio может подвиснуть — это нормально).
7. `Workspace.Biomes` после этого сам переедет в `ServerStorage.BiomeSource` — не удаляй его, он нужен для пересборки.
8. Сохрани плейс: **File → Publish to Roblox** (или Save).

Пересобрать кратер (например, после правок в `Config.Crater`) — снова та же команда. Если Studio ответит старой версией после обновления кода, перезапусти Studio или переподключи Rojo: Command Bar запоминает модули.

## 3. Настройки игры

- `Workspace` → свойство `StreamingEnabled` = true.
- **Game Settings → Places**: Max Players = 8.
- После публикации: **Game Settings → Security → Enable Studio Access to API Services** — нужно для сохранений.

## 4. Проверка

Пришли скриншоты: кратер сверху (камера над центром) и с края, где стоят базы. Пробеги по одному из спусков вниз на кольцо 2.
