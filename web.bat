@echo off
cd /d "%~dp0"
echo Solo para desarrollo: la app real es start.bat.
echo.
echo   http://127.0.0.1:5173
echo.
start "" /b cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5173"
python -m http.server 5173 --bind 127.0.0.1
