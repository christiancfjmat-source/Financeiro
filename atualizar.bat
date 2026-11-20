@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -m backend.app.backup
  if errorlevel 1 exit /b 1
)
call instalar.bat
exit /b %errorlevel%
