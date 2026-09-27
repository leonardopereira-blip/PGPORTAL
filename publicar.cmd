@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PGPORTAL - Atualizar e publicar
echo.
echo === PGPORTAL: sincronizar e publicar ===
echo.
rem Usar git do PATH ou o git embutido no GitHub Desktop aberto.
set "GIT_EXE=git"
where git >nul 2>nul
if errorlevel 1 (
  set "GIT_EXE="
  for /f "usebackq delims=" %%G in (`powershell.exe -NoProfile -Command "$p=Get-Process GitHubDesktop -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1 -ExpandProperty Path; if($p){$f=Join-Path (Split-Path $p -Parent) 'resources\app\git\cmd\git.exe'; if(Test-Path $f){Write-Output $f}}"`) do set "GIT_EXE=%%G"
)
if not defined GIT_EXE (
  echo ERRO: nao localizei o Git. Abra o GitHub Desktop e tente de novo.
  goto :fail
)
set "CHECKFILE=%TEMP%\pgportal-git-%RANDOM%-%RANDOM%.tmp"
call "%GIT_EXE%" status --porcelain > "%CHECKFILE%"
if errorlevel 1 (
  del "%CHECKFILE%" >nul 2>nul
  echo ERRO: nao consegui consultar o estado do repositorio.
  goto :fail
)
for %%F in ("%CHECKFILE%") do if %%~zF GTR 0 (
  type "%CHECKFILE%"
  del "%CHECKFILE%" >nul 2>nul
  echo.
  echo PARE: existem arquivos locais alterados. Salve pelo GitHub Desktop antes de publicar.
  goto :fail
)
del "%CHECKFILE%" >nul 2>nul
echo [1/3] Buscando alteracoes do GitHub...
call "%GIT_EXE%" pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo PARE: o pull falhou. Nenhum push sera executado.
  goto :fail
)
echo.
echo [2/3] Conferindo arquivos do Apps Script...
echo.
echo "Tracked files" = arquivos do portal incluidos no envio.
echo "Untracked files" = arquivos ignorados, NAO serao enviados.
echo.
call "%~dp0clasp-portatil.cmd" show-file-status
if errorlevel 1 (
  echo.
  echo PARE: nao consegui conferir os arquivos. Nenhum push sera executado.
  goto :fail
)
echo.
echo Apenas "Tracked files" entram no push. "Untracked files" ficam fora.
echo Se houve edicao direta no Apps Script apos o ultimo pull, NAO publique.
set "CONFIRMA="
set /p "CONFIRMA=Digite PUBLICAR para enviar ao Apps Script (ou Enter para cancelar): "
if /I not "%CONFIRMA%"=="PUBLICAR" (
  echo Publicacao cancelada. Nenhum arquivo foi enviado.
  goto :done
)
echo.
echo [3/3] Enviando ao Apps Script...
call "%~dp0clasp-portatil.cmd" push
if errorlevel 1 (
  echo.
  echo ERRO no clasp push. Confira a mensagem acima.
  goto :fail
)
echo.
echo Concluido: push realizado. Se o app usa implantacao versionada, a implantacao pode exigir atualizacao separada.
goto :done
:fail
echo.
echo Nenhuma publicacao foi iniciada por este comando antes da etapa 3.
:done
echo.
pause
endlocal
