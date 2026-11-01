# RobloxGame

Код игры для Roblox. Скрипты лежат здесь, а в Roblox Studio их переносит [Rojo](https://rojo.space).

Заметки, правила и решения по проекту лежат в отдельном репозитории [RobloxGameNotes](https://github.com/Ludosiellll/RobloxGameNotes).

## Как работать

1. Запусти `start.cmd` двойным щелчком. Он скачает свежий код из GitHub и запустит Rojo. Окно не закрывай.
2. Открой плейс в Roblox Studio. На вкладке **Plugins** нажми **Rojo**, затем **Connect**. Если Rojo покажет список изменений, нажми **Accept**.
3. Когда в GitHub появились новые изменения, запусти `update.cmd`. Пока Rojo подключён, скрипты в Studio обновятся сами.
4. Нажми **Play** и смотри окно **Output** (View → Output). Ошибки оттуда отправляй Claude.

Первая настройка компьютера описана в [docs/SETUP_PC.md](docs/SETUP_PC.md).

## Что Rojo трогает, а что нет

Rojo управляет только тремя папками:

| Папка в Studio | Папка в репозитории | Что там |
| --- | --- | --- |
| `ReplicatedStorage.Shared` | `src/shared` | модули для сервера и клиента |
| `ServerScriptService.Server` | `src/server` | серверные скрипты |
| `StarterPlayer.StarterPlayerScripts.Client` | `src/client` | клиентские скрипты |

- Скрипты внутри этих папок правятся только здесь, в репозитории. Правка прямо в Studio пропадёт при следующей синхронизации.
- Если создать что-то в этих папках вручную в Studio, Rojo это удалит.
- Всё остальное (карта в `Workspace`, освещение, интерфейс в других местах) Rojo не трогает. Это можно строить в Studio руками и сохранять через **File → Publish to Roblox**.

## Имена файлов

- `Имя.server.luau` — серверный скрипт (Script)
- `Имя.client.luau` — клиентский скрипт (LocalScript)
- `Имя.luau` — модуль (ModuleScript)
