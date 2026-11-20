@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" goto :instalacao
if not exist "frontend\dist\index.html" goto :instalacao
echo Moradia: http://127.0.0.1:8000/
echo Encerre com Ctrl+C.
".venv\Scripts\python.exe" -m backend.app.launcher
exit /b %errorlevel%

:instalacao
echo Execute instalar.bat antes de iniciar o Moradia.
exit /b 1
