@echo off
setlocal
set "CODE_EXE="
for /f "usebackq delims=" %%I in (`powershell.exe -NoProfile -Command "(Get-Process Code -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1 -ExpandProperty Path)"`) do set "CODE_EXE=%%I"
if not defined CODE_EXE (
  echo ERRO: abra o VS Code antes de executar este comando.
  exit /b 1
)
if not exist "%~dp0node_modules\@google\clasp\build\src\index.js" (
  echo ERRO: clasp portatil ainda nao esta no repositorio. Faca Fetch origin e Pull origin no GitHub Desktop.
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%CODE_EXE%" "%~dp0node_modules\@google\clasp\build\src\index.js" %*
exit /b %errorlevel%
