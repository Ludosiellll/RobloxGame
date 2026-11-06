# RobloxGame

Код игры для Roblox. Скрипты лежат здесь, а в Roblox Studio их переносит [Rojo](https://rojo.space).

Заметки, правила и решения по проекту лежат в отдельном репозитории [RobloxGameNotes](https://github.com/Ludosiellll/RobloxGameNotes).

## Как работать

1. Запусти `start.cmd` двойным щелчком. Он скачает свежий код из GitHub и запустит Rojo. Окно не закрывай.
2. Открой плейс в Roblox Studio. На вкладке **Plugins** нажми **Rojo**, затем **Connect**. Если Rojo покажет список изменений, нажми **Accept**.
3. Когда в GitHub появились новые изменения, запусти `update.cmd`. Пока Rojo подключён, скрипты в Studio обновятся сами.
4. Нажми **Play** и смотри окно **Output** (View → Output). Ошибки оттуда отправляй Claude.

Первая настройка компьютера описана в [docs/SETUP_PC.md](docs/SETUP_PC.md).

## Этап 1: как проверить

1. Один раз подготовь плейс по [docs/ASSET_SETUP.md](docs/ASSET_SETUP.md): кратер, эффекты из паков, настройки игры.
2. Пройди [docs/CHECKLIST_STAGE1.md](docs/CHECKLIST_STAGE1.md). Отладочные команды доступны в Studio по кнопке DEBUG.
3. Анимации игрока (нести, толкнуть, празднование) публикуются один раз по [docs/ANIMATIONS.md](docs/ANIMATIONS.md).

## Что Rojo трогает, а что нет

Rojo управляет только этими папками (полный список в `default.project.json`):

| Папка в Studio | Папка в репозитории | Что там |
| --- | --- | --- |
| `ReplicatedStorage.Shared` | `src/shared` | модули для сервера и клиента |
| `ServerScriptService.Server` | `src/server` | серверные скрипты |
| `StarterPlayer.StarterPlayerScripts.Client` | `src/client` | клиентские скрипты |
| `ReplicatedStorage.VFX` | `assets/vfx` | эффекты из паков без скриптов |
| `ServerScriptService.Tests` | `tests` | тесты, запускаются при Play |
| `ServerStorage.Packs` | `assets/packs` | модели брейнротов |
| `ServerStorage.StudioTools` | `src/studio` | генератор кратера, подготовка анимаций |

- `ReplicatedStorage.Packs` (FireballVFX, WeatherVFX) Rojo не трогает, его кладёшь вручную по ASSET_SETUP.
- Скрипты внутри этих папок правятся только здесь, в репозитории. Правка прямо в Studio пропадёт при следующей синхронизации.
- Если создать что-то в этих папках вручную в Studio, Rojo это удалит.
- Всё остальное (карта в `Workspace`, освещение, интерфейс в других местах) Rojo не трогает. Это можно строить в Studio руками и сохранять через **File → Publish to Roblox**.

## Имена файлов

- `Имя.server.luau` — серверный скрипт (Script)
- `Имя.client.luau` — клиентский скрипт (LocalScript)
- `Имя.luau` — модуль (ModuleScript)
