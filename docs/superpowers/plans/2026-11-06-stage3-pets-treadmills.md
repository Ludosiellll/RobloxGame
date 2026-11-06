# Этап 3: яйца, питомцы, беговые дорожки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** игрок покупает яйца за деньги, вылупляет питомцев с бонусом к скорости, удаче или доходу, берёт с собой до 3, и качает скорость на беговых дорожках у своей базы.

**Architecture:** каталоги питомцев и яиц — данные в `src/shared/Catalog`, все решения (вылупление, экипировка, бонусы, прирост скорости) — чистые функции `src/shared/Pets.luau` с тестами. `PetService` и `TreadmillService` на сервере только проверяют запросы и вызывают их. Питомцы следуют за игроками у каждого клиента (`PetFollow`), модели — из пака KNOCK OUT, который Денис кладёт в `ReplicatedStorage.Packs.Pets`. Дорожки — из `FreeTreadmillPack.rbxl` (`ReplicatedStorage.Packs.TreadmillProgression`), у каждой базы 3 лучшие открытые.

**Tech Stack:** Luau `--!strict`, Rojo 7.6.1, `node tools/luau-test/run.mjs`, `node tools/luau-test/check-syntax.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-06-meteor-rain-expanded-design.md` (разделы 6 «Скорость», 7, 14 — строка «3»).

## Global Constraints

- Скорость: база `Config.BaseWalkSpeed` (22) + `save.speed`. Дорожка уровня k даёт `0.2 × 1.5^(k−1)` скорости в секунду бега, уровень k открывается на перерождении k−1, всего 15 уровней.
- Питомцы имеют редкость и бонус одного типа: +% скорости, +% удачи или +% дохода. С игроком ходят 3 питомца (+2 с геймпассом — этап 5, здесь только `Config.Pets.Equipped = 3`). Остальные в рюкзаке.
- Яйца стоят игровые деньги, дорогие открываются по перерождениям.
- Перерождение оставляет скорость и питомцев (уже так в `Economy.rebirth`).
- Сервер не доверяет клиенту: бег на дорожке засчитывается, только если сервер видит игрока на ленте и он двигается.
- Скрипты из паков не переносятся: у клонов питомцев и дорожек удаляются все `Script`, `LocalScript`, `ModuleScript`.
- Динозавры из `Classic Studded Eggs` — не этот этап (собраны из деталей без костей, нужна отдельная подготовка).

## Review Focus

1. **Покупка яйца без денег, закрытого яйца или при полном рюкзаке** — отказ, деньги и рюкзак не меняются. Тест `Pets.spec` «buy egg rejects».
2. **Экипировка чужого или несуществующего питомца, больше 3** — отказ. Тест «equip limits».
3. **Бег на дорожке телепортом или стоя на месте** — скорость не растёт. Проверка в чек-листе задачи 4 и `Pets.treadmillGain` только для `dt ≤ 1`.
4. **Пак питомцев не скопирован** — вылупление работает, вместо модели серый шарик с именем, Output пишет, куда положить пак. Чек-лист задачи 3.
5. **Удаление экипированного питомца при перерождении/сбросе** — `equipped` ссылается только на существующие uid (`DataSchema.sanitize`). Тест «sanitize drops unknown equipped».

---

### Task 1: Каталог и чистые функции питомцев

**Files:**
- Create: `src/shared/Catalog/Pets.luau`, `src/shared/Catalog/Eggs.luau`, `src/shared/Pets.luau`, `tests/Pets.spec.luau`
- Modify: `src/shared/Config.luau` (раздел `Pets`, `Treadmill`), `src/shared/DataSchema.luau` (`pets`, `equipped`, `nextPetUid`; `speed` — дробное ≥ 0, два знака)

**Interfaces:**
- Produces: `Config.Pets = { Equipped = 3, MaxOwned = 60, Bonus = { Common = 0.05, Rare = 0.10, Epic = 0.20, Legendary = 0.35, Mythic = 0.60, Secret = 1.00 } }`; `Config.Treadmill = { Tiers = 15, Base = 0.2, Growth = 1.5, PerBase = 3 }`.
- Produces: `Catalog.Pets.List: { { id: string, name: string, egg: string, rarity: string, bonus: "speed" | "luck" | "income" } }`, `byId(id)`, `ofEgg(eggId)`. Питомцы — модели KNOCK OUT по наборам: Colorful (Default, Red, Orange, Yellow, Green, Blue, Purple), Pastel (PastelRed…PastelPurple), Fruity (OrangeSkin, Apple, Banana, Kiwi, Watermelon), Hunter (Bunny, Racoon, Deer, Fox, Wolf), Ice Cream (Vanilla, Strawberry, Chocolate, CookieDough, CookiesNCream), Neon (NeonRed…NeonPurple), Dinosaur (Tricera, Stego, Raptor, Spino, TRex), Job (Chef, FastFood, Painter, Officer, Judge, Soldier, Capitalist), Duck (Ducky, Sealguin, Shark, Snowman, Festive), Lunar (Frost Bite, Evil, Rainbow, Aurora, Cosmic), Emperor (Bronze, Silver, Gold, Emerald, Ruby, Diamond, Yeti, Gangster). Внутри яйца редкость растёт по порядку списка; бонусы чередуются speed → luck → income.
- Produces: `Catalog.Eggs.List: { { id: string, name: string, model: string, price: number, gate: number, odds: { [rarity]: number } } }` — 11 яиц в порядке выше, цены `1K, 10K, 50K, 250K, 1M, 5M, 25M, 100M, 500M, 2.5B, 10B`, ворота по перерождениям `0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10`.
- Produces (`Pets`): `Pets.hatch(eggId, rng): string?`; `Pets.buyEgg(save, eggId, rng): (boolean, string?)` — проверяет ворота, деньги, место в рюкзаке; списывает, добавляет `{ uid, id }`, возвращает id питомца или причину `"locked" | "money" | "full" | "unknown"`; `Pets.equip(save, uid): (boolean, string?)`, `Pets.unequip(save, uid): boolean`; `Pets.bonuses(save): { speed: number, luck: number, income: number }` (сумма по экипированным); `Pets.treadmillGain(tier, dt): number` (`0` при `dt > 1` или `dt ≤ 0`); `Pets.treadmillOpen(tier, rebirths): boolean`; `Pets.baseTreadmills(rebirths): { number }` — до 3 лучших открытых уровней по убыванию.

- [ ] **Step 1: Тесты `Pets.spec`:** `"catalog covers every egg"` (у каждого яйца ≥ 5 питомцев, все id уникальны), `"hatch picks a pet of that egg"`, `"buy egg rejects"` (без денег `money`, закрытое `locked`, полный рюкзак `full`, неизвестное `unknown`; сохранение не изменилось), `"buy egg adds pet and spends"`, `"equip limits"` (4-й — `false, "limit"`; чужой uid — `false, "unknown"`; повторный — без дубля), `"bonuses sum equipped only"`, `"treadmill gain"` (уровень 1 за 1 с → 0.2, уровень 3 → 0.45, `dt = 5` → 0), `"treadmill unlock"` (уровень 1 при 0 перерождений, уровень 4 — с 3), `"base treadmills best three"` (0 перерождений → `{1}`, 5 → `{6, 5, 4}`), `"sanitize drops unknown equipped"` (и неизвестные id питомцев, дробная скорость сохраняется).
- [ ] **Step 2:** FAIL → реализовать → PASS.
- [ ] **Step 3: Commit** — «Питомцы и яйца: каталог и расчёты с тестами».

### Task 2: Сервер питомцев и бонусы

**Files:**
- Create: `src/server/Services/PetService.luau`
- Modify: `src/shared/Remotes.luau` (`Hatch`, `Equip`, `PetInventory`, `Hatched`), `src/server/Services/CarryService.luau` (скорость × `1 + bonuses.speed`), `src/server/Services/MeteorService.luau` (удача ближайшего игрока `1 + bonuses.luck` в `Roll.meteor`), `src/server/Main.server.luau`

**Interfaces:**
- Produces: `Hatch:FireServer(eggId)` → `Pets.buyEgg` (лимит 2/с) → `Hatched:FireClient(player, { egg, pet })`; `Equip:FireServer(uid, on: boolean)`; `PetInventory:FireClient(player, { pets, equipped })` при загрузке и после каждого изменения; атрибут игрока `Pets` — id экипированных через запятую (для `PetFollow` у всех); доход через `BaseService.setIncomeMultiplier(player → 1 + bonuses.income)`.
- Отладка: `egg <id>` — вылупить без денег; `pets` — список.

- [ ] **Step 1:** реализовать; syntax + тесты PASS.
- [ ] **Step 2: Commit** — «Сервер питомцев: яйца, экипировка, бонусы к скорости, удаче и доходу».

### Task 3: Питомцы у клиента

**Files:**
- Create: `src/client/Controllers/PetFollow.luau`, `src/client/Fx/Hatch.luau`
- Modify: `src/client/Controllers/Menus.luau` (кнопка Pets на рельсе: яйца — `crates` кита с ценой «$», питомцы — `M.backpack` с EQUIP), `docs/ASSET_SETUP.md` (пак KNOCK OUT → `ReplicatedStorage.Packs.Pets`)

**Interfaces:**
- Produces: `PetFollow` — у каждого игрока до 3 питомцев из атрибута `Pets` позади и сбоку, мягкое покачивание и подпрыгивание при беге, только ближе 200 studs; без модели — шарик цвета редкости с именем. `Hatch.play(eggId, petId)` — яйцо по центру экрана (ViewportFrame) трясётся 1.2 с, вспышка цвета редкости, карточка питомца с бонусом.

- [ ] **Step 1:** реализовать; syntax + тесты PASS.
- [ ] **Step 2: Проверка в Studio:** Pets → Colorful Egg за $1K — яйцо трясётся, вспышка, карточка; питомец в рюкзаке, EQUIP — идёт за мной, бонус работает (`econ`/скорость/доход); 4-го экипировать нельзя; без пака — шарики и одна строка в Output.
- [ ] **Step 3: Commit** — «Питомцы у клиента: следование, вылупление, окно Pets».

### Task 4: Беговые дорожки

**Files:**
- Create: `src/server/Services/TreadmillService.luau`, `src/client/Controllers/Treadmills.luau`
- Modify: `docs/ASSET_SETUP.md` (`Workspace.TreadmillProgression` из `FreeTreadmillPack.rbxl` → `ReplicatedStorage.Packs`)

**Interfaces:**
- Produces (сервер): у каждой базы за левым краем 3 дорожки `Pets.baseTreadmills(rebirths)` владельца (клоны из пака без скриптов, тег `Treadmill`, атрибут `Tier`); раз в 0.5 с: игрок на ленте своей дорожки (точка в границах `Root`) и `Humanoid.MoveDirection.Magnitude > 0.5` → `save.speed += Pets.treadmillGain(tier, dt)`, `CarryService.applySpeed`; атрибут `Speed`. Без пака — простые дорожки из деталей с подписью уровня.
- Produces (клиент): лента дорожки, на которой стоит свой персонаж, двигается навстречу (`AssemblyLinearVelocity` у `Root` локально = −вперёд × WalkSpeed), планки ленты едут по кругу; над дорожкой — «Tier k · +X speed/s», у закрытых — «Rebirth k−1».

- [ ] **Step 1:** реализовать; syntax + тесты PASS.
- [ ] **Step 2: Проверка в Studio:** у базы 1 дорожка уровня 1, бег на ней — скорость растёт ~0.2/с; стоять — не растёт; после `rebirths 5` — дорожки 6, 5, 4; без пака — простые дорожки.
- [ ] **Step 3: Commit** — «Беговые дорожки у базы: прирост скорости с проверкой на сервере».

### Task 5: Сборка этапа 3

- [ ] **Step 1:** `docs/CHECKLIST_STAGE3.md`, README «Этап 3», заметки в `RobloxGameNotes`.
- [ ] **Step 2: Commit** — «Этап 3 собран: чек-лист и README».
