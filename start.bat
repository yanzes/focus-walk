@echo off
cd /d "%~dp0"

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Instalando Electron por primera vez...
  call npm install
  call node "%~dp0node_modules\electron\install.js"
)

echo Abriendo Focus Walk...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
