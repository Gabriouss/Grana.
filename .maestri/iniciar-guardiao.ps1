# Lancador do guardiao das caixas do Codex. Fica residente desde o login do
# Windows (pasta Inicializar) e, sempre que o Maestri abre, sobe o
# guardiao-caixas.sh; o proprio guardiao se encerra quando o Maestri fecha.
# So uma instancia do guardiao por vez. Logs em E:\Grana-temporarios\.
$bash  = 'C:\Program Files\Git\bin\bash.exe'
$raiz  = Split-Path -Parent $PSScriptRoot
$drive = $raiz.Substring(0,1).ToLower(); $resto = $raiz.Substring(2) -replace '\\','/'
$cmd   = "cd '/$drive$resto' && exec bash .maestri/guardiao-caixas.sh"
while ($true) {
  $maestri  = Get-Process -Name 'Maestri' -ErrorAction SilentlyContinue
  $guardiao = Get-CimInstance Win32_Process -Filter "Name='bash.exe'" -ErrorAction SilentlyContinue |
              Where-Object { $_.CommandLine -match 'guardiao-caixas' }
  if ($maestri -and -not $guardiao) {
    Start-Sleep -Seconds 20   # deixa o Maestri terminar de abrir os terminais
    Start-Process -FilePath $bash -ArgumentList @('-c', "`"$cmd`"") -WindowStyle Hidden
  }
  Start-Sleep -Seconds 10
}

