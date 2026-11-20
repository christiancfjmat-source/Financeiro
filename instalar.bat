@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" call :criar_ambiente
if not exist ".venv\Scripts\python.exe" (
  echo Python 3.12 ou superior e necessario. Instale o Python e tente novamente.
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install -r backend\requirements-dev.txt
if errorlevel 1 exit /b 1
pushd frontend
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 (
  popd
  exit /b 1
)
call npm.cmd run build
set "MORADIA_BUILD_STATUS=%errorlevel%"
popd
if not "%MORADIA_BUILD_STATUS%"=="0" exit /b %MORADIA_BUILD_STATUS%
echo Instalacao concluida. Execute iniciar.bat.
exit /b 0

:criar_ambiente
py -3 -c "import sys; raise SystemExit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 (
  py -3 -m venv .venv
  exit /b
)
python -c "import sys; raise SystemExit(sys.version_info < (3, 12))" >nul 2>&1
if not errorlevel 1 (
  python -m venv .venv
  exit /b
)
for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do (
  if exist "%%~fD\python.exe" if not exist ".venv\Scripts\python.exe" (
    "%%~fD\python.exe" -c "import sys; raise SystemExit(sys.version_info < (3, 12))" >nul 2>&1
    if not errorlevel 1 "%%~fD\python.exe" -m venv .venv
  )
)
exit /b
