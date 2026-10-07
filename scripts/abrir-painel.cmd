@echo off
rem Grana. Admin - painel administrativo local (dono: Keel).
rem
rem   scripts\abrir-painel.cmd                -> sobe o painel (se preciso) e abre http://localhost:4317/
rem   scripts\abrir-painel.cmd --criar-atalho -> cria o atalho "Grana. Admin" na Area de Trabalho
rem
rem O painel escuta so em 127.0.0.1. Nada aqui imprime valor do .env.
setlocal
cd /d "%~dp0.."
set "PORTA=4317"
rem Abre 127.0.0.1, e nao localhost: o navegador resolve localhost primeiro para ::1,
rem onde outro programa poderia estar escutando (achado A7 do Lynx).
set "URL=http://127.0.0.1:%PORTA%/"

if /i "%~1"=="--criar-atalho" goto criar_atalho

where node >nul 2>&1
if errorlevel 1 (
  echo O Node.js nao foi encontrado. Instale o Node 22 ou mais novo e tente de novo.
  pause
  exit /b 1
)

rem Ja esta no ar? Confere que quem responde e o painel, nao outro programa.
call :painel_no_ar
if not errorlevel 1 goto abrir

rem Porta ocupada por outro programa: nao derruba nada, so avisa.
netstat -ano | findstr /r /c:":%PORTA%  *[^ ]*  *LISTENING" >nul
if not errorlevel 1 (
  echo A porta %PORTA% esta ocupada por outro programa, que nao e o painel.
  echo Feche esse programa e rode de novo. Nada foi encerrado.
  pause
  exit /b 1
)

echo Subindo o Grana. Admin...
start "Grana. Admin (feche esta janela para desligar o painel)" /min node tools\admin-local\server.cjs

rem Espera ate 20s o painel responder antes de abrir o navegador.
for /l %%i in (1,1,20) do (
  call :painel_no_ar
  if not errorlevel 1 goto abrir
  timeout /t 1 /nobreak >nul
)
echo O painel nao respondeu em 20 segundos. Veja a janela "Grana. Admin" minimizada na barra de tarefas.
pause
exit /b 1

:abrir
start "" "%URL%"
exit /b 0

:painel_no_ar
curl.exe -s -m 2 -H "Host: localhost:%PORTA%" "http://127.0.0.1:%PORTA%/api/saude" 2>nul | findstr /c:"grana-admin" >nul
exit /b %errorlevel%

:criar_atalho
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Grana. Admin.lnk'));" ^
  "$s.TargetPath='%~f0'; $s.WorkingDirectory='%CD%'; $s.WindowStyle=7; $s.Description='Painel administrativo local do Grana. (so neste computador)';" ^
  "$s.IconLocation=\"$env:SystemRoot\System32\shell32.dll,13\"; $s.Save(); Write-Output ('Atalho criado em ' + (Join-Path $d 'Grana. Admin.lnk'))"
exit /b %errorlevel%
