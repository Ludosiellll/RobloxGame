# Анимации игрока: как опубликовать

Три анимации (Carry — нести над головой, Push — толчок, Celebrate — перерождение) сделаны в коде, файлы `src/studio/Anims/*.rbxmx`, генератор `tools/gen_anims.py`. Чтобы они играли в игре, их нужно один раз опубликовать под твоим аккаунтом: Roblox проигрывает только анимации владельца игры.

1. Запусти `start.cmd` и подключи Rojo, чтобы в `ServerStorage.StudioTools` появились `Anims` и `AnimPrep`.
2. View → Command Bar, вставь и нажми Enter:
   `require(game.ServerStorage.StudioTools.AnimPrep).run()`
   В Workspace появится манекен `AnimRig`.
3. Avatar → Animation Editor → кликни по `AnimRig`.
4. В редакторе нажми «…» → Load → `Carry`. Потом «…» → Publish to Roblox, введи имя «Carry» и нажми Submit. Скопируй номер анимации из окна после публикации.
5. Повтори шаг 4 для `Push` и `Celebrate`.
6. Пришли мне три номера, я впишу их в `Config.PlayerAnims`. Манекен `AnimRig` потом можно удалить.

Пока номеров нет, игра работает без этих анимаций: метеорит над головой, но руки опущены.
