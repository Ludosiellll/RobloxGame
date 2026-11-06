# Что сделать в Studio (один раз)

Код и паки `.rbxm` Rojo переносит сам. Карту-кратер и эффекты из плейсов `.rbxl` нужно один раз перенести вручную и сохранить в плейсе.

## 1. Обновить код

Запусти `update.cmd` и `start.cmd`, в Studio подключи Rojo (Plugins → Rojo → Connect). В Explorer появятся `ServerStorage.StudioTools.CraterBuilder` и `ServerStorage.Packs.Brainrots`.

## 2. Кратер

Биомы из старого проекта уже лежат в репозитории (`assets/biomes`, 17 файлов), Rojo сам кладёт их в `ServerStorage.BiomeSource`. Открывать старый плейс не нужно.

1. Подключи Rojo и подожди, пока в Explorer появится `ServerStorage.BiomeSource` с 17 папками (Forest, Savana, … NuclearWasteland). Первый раз это может занять минуту: там около 50 000 деталей.
2. Если в плейсе остался `Baseplate` — удали его.
3. Открой **View → Command Bar** и выполни:

   ```lua
   require(game.ServerStorage.StudioTools.CraterBuilder).build()
   ```

4. Подожди строку в Output: `[Crater] done: … decor parts, … s. Save or publish the place now.` (минута-две, Studio может подвиснуть — это нормально).
5. Сохрани плейс: **File → Publish to Roblox** (или Save).

Пересобрать кратер — снова та же команда. Если Studio ответит старой версией после обновления кода, перезапусти Studio или переподключи Rojo: Command Bar запоминает модули.

Если Rojo не справляется с биомами (долго висит или ругается): в `Workspace` создай папку `Biomes`, правой кнопкой по ней → **Insert from File…** → выбери все 17 файлов из `D:\RobloxGameCode\assets\biomes` → запусти ту же команду.

## 3. Эффекты из плейсов

Эти эффекты лежат в файлах-плейсах, Rojo их не переносит:

1. Открой `assets/imported/Fireball.rbxl` во втором окне Studio → выдели `ReplicatedStorage → FireballVFX` → Ctrl+C.
2. В плейсе игры создай в `ReplicatedStorage` папку `Packs` (если её нет) и вставь туда (Ctrl+V).
3. То же для `assets/imported/Thunderstorm.rbxl` → `ReplicatedStorage → WeatherVFX` → в `ReplicatedStorage.Packs`.
4. (Необязательно) File → Import 3D → `assets/meshes/meteor_1.obj` → переименуй в `MeteorRock` → в `ReplicatedStorage.Packs`. Без него камень метеорита рисуется кодом.

Остальные эффекты (`MeteorTrail`, `StarExplosion`, `ExplosionPack`, `SmoothDebris`, `GoldenAtmosphere`) Rojo кладёт сам в `ReplicatedStorage.VFX`.

## 3а. Питомцы и беговые дорожки (этап 3)

Rojo не может перенести эти паки сам: в них много моделей верхнего уровня или они лежат в плейсе.

1. **Питомцы.** В `ReplicatedStorage.Packs` создай папку `Pets`. В Explorer правой кнопкой по ней → **Insert from File…** → `assets/imported/KNOCK OUT MODELS BY HEX.rbxm`. Все модели (пингвины и яйца) должны оказаться прямо внутри `ReplicatedStorage.Packs.Pets`. Деталь `WorkBaseplate` удали. Скрипты внутри игра уберёт сама при клонировании.
2. **Беговые дорожки.** Открой `assets/imported/FreeTreadmillPack.rbxl` во втором окне Studio → выдели `Workspace → TreadmillProgression` → Ctrl+C → в плейсе игры вставь в `ReplicatedStorage.Packs` (Ctrl+V).
3. Сохрани плейс. Без этих паков игра работает: питомцы — цветные шарики, дорожки — простые полосы.

## 4. Настройки игры

- `Workspace` → свойство `StreamingEnabled` = true.
- **Game Settings → Places**: Max Players = 8.
- После публикации: **Game Settings → Security → Enable Studio Access to API Services** — нужно для сохранений.

## 5. Проверка

Нажми Play: в Output блок `[Assets]` — у каждого пункта `OK` или что и куда положить.

Пришли скриншоты: кратер сверху (камера над центром) и с края, где стоят базы. Пробеги по одному из спусков вниз на кольцо 2.
