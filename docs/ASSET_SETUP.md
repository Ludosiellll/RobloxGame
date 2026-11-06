# Что сделать в Studio (один раз)

Rojo переносит сам и точно: все скрипты, эффекты (`ReplicatedStorage.VFX`: Fireball, Thunderstorm, MeteorTrail, взрывы, звёздная вспышка, золотое сияние) и беговые дорожки (`ReplicatedStorage.Models`). Их копировать не нужно.

Модели с сетками (MeshPart) и Union-деталями — брейнроты, питомцы, биомы — Roblox не даёт создавать плагинам, в том числе Rojo. Их один раз вставляешь через **Insert from File**: так Studio загружает файл сам, и копия получается точной. Потом сохраняешь плейс, и они остаются в нём навсегда.

## 1. Подключить Rojo

Запусти `update.cmd` и `start.cmd`, в Studio: Plugins → Rojo → **Connect** → **Accept**.

Если в плейсе остались старые копии от Rojo (`ServerStorage → Packs`, `ServerStorage → BiomeSource`) — удали их: там модели без формы.

## 2. Модели (Insert from File)

Все файлы лежат в `D:\RobloxGameCode\assets\…`. Insert from File — правой кнопкой по папке в Explorer.

1. **Брейнроты.** Правой кнопкой по `ServerStorage` → **Insert from File…** → `assets\packs\Brainrots.rbxm`. Появится `Brainrot Pack!` — не переименовывай.
2. **Питомцы.** В `ReplicatedStorage` создай папку `Packs` (Insert Object → Folder), внутри неё папку `Pets`. Правой кнопкой по `Pets` → **Insert from File…** → `assets\imported\KNOCK OUT MODELS BY HEX.rbxm`. Деталь `WorkBaseplate` удали.
3. **Биомы.** Правой кнопкой по `Workspace` → **Insert from File…** → `assets\biomes\Biomes.rbxmx` (один файл, 82 МБ, Studio может подумать полминуты). Появится `Workspace.Biomes` с 17 биомами.

## 3. Кратер

1. Если в плейсе есть `Baseplate` — удали его.
2. Внизу в строке команд (View → Command Bar) вставь и нажми **Run** (или Ctrl+Enter):

   ```lua
   require(game.ServerStorage.StudioTools.CraterBuilder).build()
   ```

3. Подожди строку `[Crater] done` в Output (**Window → Output**). `Workspace.Biomes` сам переедет в `ServerStorage.BiomeSource`.
4. Пересобрать кратер (например, после изменения размеров) — снова та же команда. Если Studio выдаёт старую версию после обновления кода, переподключи Rojo: Command Bar запоминает модули.

## 4. Настройки игры

- `Workspace` → свойство `StreamingEnabled` = true.
- **Game Settings → Places**: Max Players = 8.
- После публикации (**File → Publish to Roblox**): **Game Settings → Security → Enable Studio Access to API Services** — нужно для сохранений.

## 5. Проверка

Нажми **Play**. В Output блок `[Assets]`: у каждого пункта `OK` или что и куда положить. Дальше — чек-листы `docs/CHECKLIST_STAGE1.md`, `STAGE2`, `STAGE3`.
