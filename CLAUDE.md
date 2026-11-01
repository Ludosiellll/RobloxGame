# CLAUDE.md

Код игры Roblox на Luau, синхронизируется в Studio через Rojo.

- Контекст проекта, правила и решения лежат в репозитории `Ludosiellll/RobloxGameNotes`. Прочитай его `CLAUDE.md` и `AGENTS.md` до начала работы и обновляй заметки по их правилам.
- Работать только в репозиториях `Ludosiellll/RobloxGame` и `Ludosiellll/RobloxGameNotes`.
- Раскладка Rojo описана в `default.project.json` и `README.md`. Rojo управляет только `ReplicatedStorage.Shared`, `ServerScriptService.Server` и `StarterPlayer.StarterPlayerScripts.Client`. Workspace и остальное пользователь строит в Studio сам, не ломай это.
- Пользователь забирает изменения из ветки `main` через `update.cmd`, поэтому `main` всегда должна быть рабочей.
- Доступа к Studio и Roblox API у агента нет. Проверка идёт через пользователя: он нажимает Play и присылает текст из окна Output.
- Все скрипты начинаются с `--!strict`. Сервер не доверяет клиенту: любые данные от RemoteEvent проверяются на сервере.
- Ключи и токены (например Roblox Open Cloud) не хранить в репозитории.
