@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$project = (Get-Location).Path;" ^
  "$target = Join-Path $project 'iniciar.bat';" ^
  "$desktop = [Environment]::GetFolderPath('Desktop');" ^
  "$path = Join-Path $desktop 'Moradia - Gestao Financeira.lnk';" ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "$link = $shell.CreateShortcut($path);" ^
  "if ((Test-Path -LiteralPath $path) -and $link.TargetPath -ne $target) { throw 'Ja existe um atalho Moradia apontando para outra pasta.' };" ^
  "$link.TargetPath = $target;" ^
  "$link.WorkingDirectory = $project;" ^
  "$link.Description = 'Inicia o Moradia e abre a pagina no navegador';" ^
  "$link.Save();" ^
  "Write-Host ('Atalho criado em ' + $path)"
exit /b %errorlevel%
