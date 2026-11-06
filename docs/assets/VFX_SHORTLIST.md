# Новые паки: проверка и отбор (2026-11-06)

Исходники — в релизе `raw-assets` на GitHub, в репозиторий не копируются.

## Безопасность

Прочитано 503 файла (~10 000 скриптов) скриптом `tools/rbx_inspect.py`. **Не использовать** — найдены признаки бэкдоров:

| Файл | Что найдено |
| --- | --- |
| `STARCORE MAIN.rbxl` | зашифрованный скрипт, спрятанный в `Workspace.Terrain.Clouds.mainGame` (экранированные байты + `getfenv`) — типичный бэкдор |
| `Ranked.rbxl` | `ServerStorage.Modules.Utility` отправляет данные на Discord-вебхук |
| `ANINE FX.rbxl`, `some back normal combat stuff.rbxl` | `require(<id>)` — подгрузка чужого кода из каталога Roblox |
| `BloodifyPlugin.rbxmx` | `loadstring` — выполнение кода из строки (плагин) |

Правило для всех паков: берём только объекты эффектов (ParticleEmitter, Beam, Trail, Part/MeshPart, текстуры), **все скрипты внутри удаляем**, логику пишем сами.

## Лицензии

- **SoulShroud Ultimate VFX Pack V1.9** (5 195 частиц, 944 луча): можно использовать в своих играх, в том числе монетизированных, и менять; **нельзя распространять, выкладывать, делиться** — ни оригинал, ни изменённое. Поэтому его файлы не должны лежать в публичном репозитории и публичном релизе. Эффекты переносятся в плейс игры в Studio.
- Open-source пак сообщества («OTHER UNSORTED OS RESOURCES»): у большинства файлов лицензии нет, источник — каталог/Discord сообщества.

## Что подходит «Метеоритному дождю»

| Для чего | Кандидаты (open source) | Из SoulShroud |
| --- | --- | --- |
| Падение метеорита | `MeteorOpenSource` (15 частиц, 15 лучей), `Meteorite of Astel`, `Icemetor` (ледяной — для Diamond) | Spellcasting + Small Impact |
| Удар и кратер | `Star Explosion`, `Stylized Fireball Explosion` (167 частиц), `ExplosionPack` (148), `Fire explosion`, `star impact`, `NukeKaboom` (для Secret), `smooth slop debris`, `Rock Module Plus Updated`, `Crator_1/2_Luckk`, `CraterEffects-Kyrushui` | SoulShroud Impact VFX (71 удар) |
| Небо и атмосфера кратера | `GoldenAtmosphere`, `AnemoiaAndLighting`, `MochiLighting`, `SkyboxAnimatorV3`, `VoidStormClouds` (шторм), `clouds` | — |
| Молнии шторма | `lightningstrike b`, `lightningos`, `Lightning`, `LightingPillar` | — |
| Ауры редкостей и косметика | `Knockoff sols rng aura`, `angel aura`, `CREATIONAURA`, `Config Showcase Aura`, `SSJ ROSE AURA`, `nebulaundone aura`, `2AurasOS`, `aura yesaa`, `Galaxy`, `STARSSSS` | Energy Auras, Alternate Effects (41 модель) |
| Появление на базе, гейзеры, раскрытие существа | `Holographic_Spawn`, `angelic spawn`, `Futuristic_Spawn`, `giantgoldportal`, `Elemental Orbs OS`, `Orb` | VFX Objects |
| Модули | `CamShakeModule` (тряска камеры), `Topbar`, `Input-Icons-5` (иконки кнопок для телефона/геймпада) | — |

## Apex Studios Movement System

Бег по Shift, рэгдолл, задержка прыжка, плавная камера и shift lock (15 скриптов, вредного нет). Для нас полезен **рэгдолл при толчке** (эффектнее простого отлёта). Бег по Shift конфликтует с прокачкой скорости — не берём.
