@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Получаю последние изменения из GitHub...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Не получилось скачать изменения. Скопируй текст ошибки выше и отправь Claude.
) else (
  echo.
  echo Готово. Если Rojo подключён, скрипты в Studio уже обновились.
)
pause
