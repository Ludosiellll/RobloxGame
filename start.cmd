@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Получаю последние изменения из GitHub...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Не получилось скачать изменения. Скопируй текст ошибки выше и отправь Claude.
  pause
  exit /b 1
)
rokit install
echo.
echo Rojo запускается. В Studio: вкладка Plugins, кнопка Rojo, затем Connect.
echo Не закрывай это окно, пока работаешь в Studio.
echo.
rojo serve
pause
