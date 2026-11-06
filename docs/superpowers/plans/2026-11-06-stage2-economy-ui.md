# Этап 2: экономика и интерфейс Folk Stud — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** игрок тратит деньги на силу и места, продаёт существ, перерождается и открывает новые зоны, видит прогресс в окнах Folk Stud (Shop, Index, Rebirth, Settings), лидерборды и профили других игроков.

**Architecture:** все решения о деньгах — чистые функции в `src/shared/Economy.luau` (тестируются в Node), серверные сервисы только проверяют запрос, вызывают их и сохраняют. Данные для окон собирает чистый `src/shared/UiData.luau`. Окна строит кит Folk Stud UI (`assets/imported/folk-stud-ui.skill` → `src/client/UI/FolkStudUI.luau`) прямо в `PlayerGui` при запуске.

**Tech Stack:** Luau `--!strict`, Rojo 7.6.1, тесты `node tools/luau-test/run.mjs` (luau-web), `node tools/luau-test/check-syntax.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-06-meteor-rain-expanded-design.md` (разделы 5, 6, 10, 13, 14 — строка «2»).

## Global Constraints

- Все скрипты начинаются с `--!strict`. Сервер не доверяет клиенту: каждый RemoteEvent проверяет типы, диапазоны и частоту.
- `main` всегда рабочая: после каждой задачи тесты и синтаксис зелёные.
- Сила: 20 уровней, цена `150 × 1.55^n` (n — текущий уровень), −2.5% замедления за уровень (уже в `Formulas.carryMultiplier`).
- Места на базе: 6 → 24, цена `500 × 1.8^n` (n — сколько мест уже куплено сверх 6).
- Продажа: цена = доход за 60 секунд (`Formulas.sellValue`); продать выбранное существо или всех слабее выбранной редкости.
- Перерождение: порог `25 000 × 3^n` (n — уже сделанных); сбрасывает деньги, существ на базе, силу, места; оставляет скорость, питомцев, коллекцию; даёт +50% дохода за каждое (уже в `Formulas.incomePerSecond`) и открывает следующую зону.
- Интерфейс в стиле Folk Stud: обводка текста `UIStroke` 3.7 Bevel, жгучие цвета кита (`M.COLOR`), окна закрыты и открываются с левой рельсы.
- Лидерборды — OrderedDataStore, обновление раз в несколько минут (`Config.Leaderboard.RefreshSeconds = 120`), 3 доски: пойманные существа, лучшая находка, всего заработано.
- Индекс группируется по редкостям, а не по зонам: существа в каталоге не привязаны к зонам (выпадают по редкости). Награда — за полностью собранную редкость.
- Ауры за перерождения, Robux-покупки, «Skip Rebirth», питомцы, дорожки и квесты — не этот этап (этапы 3 и 5).

## Review Focus

1. **Двойное нажатие «Купить» или «Rebirth»** (два запроса в одном кадре) — списывается один раз, деньги не уходят в минус. Тест `Economy.spec` «second buy without money fails».
2. **Продажа несуществующего места** (слот вне диапазона, чужая база, после перерождения) — запрос отклоняется, ничего не меняется. Тест «sell slot out of range».
3. **Мусор в настройках** (не тот тип, огромная строка, неизвестный ключ) — игнорируется, сохранение не портится. Тест `UiData`/`Economy` «setting rejects bad values».
4. **DataStore лидербордов недоступен или в лимите** — доски держат последние значения, Output не засыпан ошибками, в Studio без API показывают игроков сервера. Проверка в чек-листе задачи 6 (`pcall`, одно предупреждение за цикл).
5. **Перерождение с метеоритом в руках или во время доставки** — метеорит остаётся в руках, доставка после перерождения кладёт существо на пустую базу. Чек-лист задачи 3.

---

### Task 1: Экономика — чистые функции

**Files:**
- Create: `src/shared/Economy.luau`, `tests/Economy.spec.luau`
- Modify: `src/shared/Config.luau` (разделы `Upgrades`, `Rebirth.CostBase = 25000`, `Rebirth.CostGrowth = 3`, `Leaderboard`), `src/shared/DataSchema.luau` (`stats.earned`)

**Interfaces:**
- Produces: `Config.Upgrades = { Strength = { base = 150, growth = 1.55, max = 20 }, Slots = { base = 500, growth = 1.8 } }`; `Config.Leaderboard = { RefreshSeconds = 120, Top = 10 }`.
- Produces: `Economy.upgradePrice(kind: "Strength" | "Slots", save): number?` (nil — максимум); `Economy.buyUpgrade(save, kind): (boolean, string?)` — списывает цену и поднимает уровень, иначе `false, "max" | "money"`; `Economy.rebirthCost(rebirths: number): number`; `Economy.rebirth(save): (boolean, string?)` — проверяет порог, сбрасывает `money`, `creatures`, `strength`, `slots`, `rebirths += 1`, остальное не трогает; `Economy.sellSlot(save, slot: number): (boolean, number)` — продаёт, сдвигает список, возвращает деньги; `Economy.sellBelow(save, rarity: string): (number, number)` — сколько продано и за сколько; `Economy.earn(save, amount: number)` — `money += amount`, `stats.earned += amount`; `Economy.setting(id: string, value: any): any?` — проверенное значение или nil (`music`, `sfx`: число 0–100; `shake`, `lowDetail`: boolean). `Economy.claimIndex(save, rarity): (boolean, number)` — награда за полностью собранную редкость один раз (`save.indexClaimed[rarity] = true`), `Config.IndexRewards = { Common = 1000, Rare = 5000, Epic = 25000, Legendary = 100000, Mythic = 500000, Secret = 2000000 }`.
- `DataSchema`: `stats.earned` (по умолчанию 0, `sanitize` сохраняет как целое ≥ 0); `indexClaimed: { [rarity]: true }` (только известные редкости); `settings` после `sanitize` содержит только ключи, которые принимает `Economy.setting`.

- [ ] **Step 1: Тесты `Economy.spec`:** `"strength price grows"` (`upgradePrice("Strength", {strength=0})==150`, при 1 — `232`, `floor(150×1.55)`), `"strength max"` (при 20 → nil, `buyUpgrade` → `false, "max"`), `"slots price"` (6 мест → 500, 7 → 900, 24 → nil), `"buy spends money once"`, `"second buy without money fails"` (денег на одну покупку, второй вызов `false, "money"`, деньги ≥ 0), `"rebirth cost"` (0 → 25000, 2 → 225000), `"rebirth resets and keeps"` (деньги/существа/сила/места сброшены, `collection`, `speed`, `stats` целы, `rebirths` +1), `"rebirth without money fails"`, `"sell slot out of range"` (0, 99, 1.5 → `false, 0`, сохранение не изменилось), `"sell slot pays sell value and shifts"`, `"sell below rarity"` (Common+Rare+Epic, `sellBelow("Epic")` продаёт двоих, Epic остаётся), `"earn counts total"`, `"setting rejects bad values"` (`setting("music", 150) == nil`, `setting("music", 40) == 40`; `"x"`, `nil`, строка 10 000 символов, неизвестный ключ → nil; `setting("shake", false) == false`), `"index claim once"` (все Common найдены → `claimIndex(save, "Common")` даёт `Config.IndexRewards.Common`, второй раз — `false, 0`; не все найдены — `false, 0`).
- [ ] **Step 2:** FAIL → реализовать `Economy`, `Config`, `DataSchema` → PASS всех тестов.
- [ ] **Step 3: Commit** — «Экономика: улучшения, перерождение, продажа, настройки — чистые функции с тестами».

### Task 2: Данные для окон

**Files:**
- Create: `src/shared/UiData.luau`, `tests/UiData.spec.luau`

**Interfaces:**
- Consumes: `Economy`, `Creatures`, `Rarity`, `Formulas.formatMoney`, `Formulas.sellValue`.
- Produces: `UiData.upgradeRows(save): { { id: "Strength" | "Slots", title: string, desc: string, have: number, need: number, price: string?, state: "ready" | "go" | "done" } }` (`ready` — хватает денег, `go` — не хватает, `done` — максимум; `price` — «$1.2K»); `UiData.rebirthView(money: number, rebirths: number): { from: string, to: string, gainFrom: string, gainTo: string, barText: string, barFrac: number, ready: boolean }` («Rebirth 0» → «Rebirth 1», «x1 Money» → «x1.5 Money», «$12K/$25K»); `UiData.indexSections(collection: { [string]: boolean }): { { name: string, rarity: string, found: number, total: number, items: { { id: string, name: string, rarity: string, found: boolean, income: string } } } }` — по редкостям в порядке `Rarity.Order`; `UiData.sellRows(creatures): { { rarity: string, count: number, total: number } }` — «продать всё слабее R» для R от Rare до Secret и «всё».

- [ ] **Step 1: Тесты `UiData.spec`:** `"upgrade rows states"` (мало денег → `go`, хватает → `ready`, 20 силы → `done`, `price == nil`), `"rebirth view text"` (`rebirthView(12000, 0)`: `to == "Rebirth 1"`, `gainTo == "x1.5 Money"`, `barFrac ≈ 0.48`, `ready == false`; при 30000 — `ready`, `barFrac == 1`), `"index groups by rarity"` (6 секций, сумма `total == 63`, найденные помечены), `"sell rows count weaker"`.
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: Commit** — «Данные для окон: улучшения, перерождение, индекс, продажа».

### Task 3: Серверные сервисы экономики

**Files:**
- Create: `src/server/Services/EconomyService.luau`, `src/shared/RateLimit.luau`, `tests/RateLimit.spec.luau`
- Modify: `src/shared/Remotes.luau` (`Upgrade`, `Sell`, `Rebirth`, `Settings`, `Collection`, `ClaimIndex`), `src/server/Services/BaseService.luau` (доход через `Economy.earn`; атрибуты `Strength`, `Slots`, `Caught`, `BestCatch`, `Earned`; на каждом существе своей базы `ProximityPrompt` «Sell $X», 0.6 с; площадка продажи у переднего правого угла базы с `ProximityPrompt` «Sell creatures»), `src/server/Main.server.luau`

**Interfaces:**
- Produces: `RateLimit.new(perSecond: number, burst: number)` → объект с `allow(key: any, now: number): boolean` (токен-бакет).
- Produces (сервер): `Upgrade:FireServer(kind: string)`; `Sell:FireServer({ mode = "slot", slot = n } | { mode = "below", rarity = R })`; `Rebirth:FireServer()`; `Settings:FireServer(id, value)` → `save.settings[id] = Economy.setting(id, value)`; сервер шлёт `Settings:FireClient(player, settings)` при загрузке; `Collection:FireClient(player, { ids })` при загрузке и при новой находке; `Notify` с итогом каждой операции («Strength 4!», «Sold 3 for $1.2K», «Rebirth 1! Income x1.5»). Каждый запрос — `RateLimit` 4/с на игрока и тип, проверка типов.
- После перерождения: `BaseService.refresh`, `CarryService.applySpeed`, атрибут `Rebirths` (ворота откроются сами), `Notify`.
- Отладка: `econ` — печатает цены и деньги; `rebirth` — перерождение без проверки денег.

- [ ] **Step 1: Тест `RateLimit.spec`:** `"allows burst then limits"`, `"refills over time"`, `"keys independent"`.
- [ ] **Step 2:** FAIL → реализовать `RateLimit` → PASS.
- [ ] **Step 3:** реализовать `EconomyService` и правки `BaseService`; syntax + тесты PASS.
- [ ] **Step 4: Проверка в Studio:** `money 100000` → покупка силы и мест через команды/окно, площадки открываются; «Sell» на существе продаёт и даёт деньги, чужие существа продать нельзя; `rebirths 0`, `money 30000`, перерождение → база пустая, 6 мест, ворота зоны 5 исчезли; перерождение с метеоритом в руках — метеорит остался, доставка кладёт существо.
- [ ] **Step 5: Commit** — «Сервер экономики: улучшения, продажа, перерождение, настройки с проверкой».

### Task 4: Окна Folk Stud

**Files:**
- Create: `src/client/UI/FolkStudUI.luau` (кит из `assets/imported/folk-stud-ui.skill`, `scripts/FolkStudUI.lua`, без изменений кроме заголовка `--!strict` и строки об источнике), `src/client/Controllers/Menus.luau`
- Modify: `src/client/Controllers/Hud.luau` (шрифт и обводка в стиле кита, баннер — золотой градиент), `src/client/Main.client.luau`

**Interfaces:**
- Consumes: `UiData`, `Remotes` (`Upgrade`, `Sell`, `Rebirth`, `Settings`, `Collection`), атрибуты игрока (`Money`, `Rebirths`, `Strength`, `Slots`), `FolkStudUI` (`M.hud`, `M.quests`, `M.setQuest`, `M.rebirth`, `M.setBar`, `M.index`, `M.setFound`, `M.settings`, `M.settingsLive`, `M.live`, `M.hudLive`, `M.show`).
- Produces: рельса слева: Shop (`M.ART.shop`, `hudShop`), Index (`pink`), Rebirth (`M.ART.rebirth`, `hudBlue`), Settings (`crimson`). Shop — строки `UiData.upgradeRows` через `M.quests` (кнопка CLAIM переподписана «BUY», награда — цена); Rebirth — `M.rebirth` из `UiData.rebirthView` без Skip; Index — `M.index` из `UiData.indexSections`, кнопка claim → `Remotes` `ClaimIndex` (сервер: `Economy.claimIndex` по каждой собранной редкости); Settings — Music, Sound, Camera Shake, Low Detail. Окно продажи (`M.quests` из `UiData.sellRows`, кнопка «SELL») открывается площадкой продажи на базе (атрибут игрока `SellOpen` или `Remotes`).
- Применение настроек: `SoundGroup` «Music» и «Sfx» в `SoundService` (`FxUtil.sound` кладёт звуки в Sfx), `CameraFx` не трясёт при `shake == false`, при `lowDetail` воронка без камней и `AnimationPlayer` анимирует вдвое меньше существ.

- [ ] **Step 1:** перенести кит, реализовать `Menus`, применить настройки; syntax + тесты PASS.
- [ ] **Step 2: Проверка в Studio:** рельса слева, окна открываются и закрываются; цены и состояния кнопок обновляются при изменении денег; индекс показывает найденных; ползунок звука меняет громкость; на телефоне (Device Emulator) окна помещаются.
- [ ] **Step 3: Commit** — «Окна Folk Stud: магазин улучшений, индекс, перерождение, настройки, продажа».

### Task 5: Лидерборды

**Files:**
- Create: `src/server/Services/LeaderboardService.luau`

**Interfaces:**
- Consumes: `PlayerData`, `BaseService.baseOf`, `MapService.baseFrames`, `Config.Leaderboard`.
- Produces: OrderedDataStore `LB_Caught_v1`, `LB_Best_v1`, `LB_Earned_v1` (значения — `stats.caught`, `stats.bestCatch`, `stats.earned`); раз в `RefreshSeconds` пишет онлайн-игроков (`SetAsync` в `pcall`) и читает `GetSortedAsync(false, Top)`; имена через `Players:GetNameFromUserIdAsync` с кэшем; без API (режим памяти) — топ из игроков сервера. Доски: за каждой базой три стенда с `SurfaceGui` («MOST CAUGHT», «BEST CATCH $/s», «TOTAL EARNED»), 10 строк, место, имя, значение через `formatMoney`. Ошибка DataStore — одно `warn` за цикл, доски держат прошлые значения.

- [ ] **Step 1:** реализовать; syntax + тесты PASS.
- [ ] **Step 2: Проверка в Studio:** за базой 3 доски, через 2 минуты в них ты; в опубликованном плейсе — значения сохраняются между серверами.
- [ ] **Step 3: Commit** — «Лидерборды: пойманные, лучшая находка, всего заработано».

### Task 6: Профиль игрока и объявления

**Files:**
- Create: `src/client/Controllers/Profile.luau`
- Modify: `src/server/Services/BaseService.luau` (атрибут `BestCreature` — id лучшего существа на базе), `src/client/Controllers/Hud.luau`

**Interfaces:**
- Produces: тап или клик по другому игроку (луч от камеры через `UserInputService`, `Players:GetPlayerFromCharacter`) → карточка Folk Stud на 6 с: ник, перерождения, деньги, лучшее существо (имя, редкость её цветом, `$X/s`), пойманные. Объявления Hud: рамка в стиле кита, редкость цветом, очередь объявлений по 4 с.

- [ ] **Step 1:** реализовать; syntax + тесты PASS.
- [ ] **Step 2: Проверка в Studio (2 игрока):** клик по второму игроку показывает его карточку; два объявления подряд показываются по очереди.
- [ ] **Step 3: Commit** — «Профиль игрока по клику и очередь объявлений».

### Task 7: Сборка этапа 2

**Files:**
- Create: `docs/CHECKLIST_STAGE2.md`
- Modify: `README.md`, `docs/ASSET_SETUP.md` (если нужно), заметки в `RobloxGameNotes` (`Current_Focus`, `Codebase_Map`, `Task_Log`)

- [ ] **Step 1:** чек-лист — все проверки задач 3–6 и «10 минут игры: купить силу, продать, переродиться — Output без красных ошибок».
- [ ] **Step 2:** README — раздел «Этап 2»; тесты и синтаксис PASS.
- [ ] **Step 3: Commit** — «Этап 2 собран: чек-лист и README»; обновить заметки.
