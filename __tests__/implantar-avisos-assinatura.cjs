const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const server = http.createServer((req, res) => {
  req.resume();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify([
    { slug: 'existente', updated_at: 1, verify_jwt: true },
    { slug: 'avisos-assinatura', updated_at: 2, verify_jwt: false },
  ]));
});
server.listen(0, '127.0.0.1', () => {
  const script = `
$ErrorActionPreference = 'Stop'
$Ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'scripts/implantar-avisos-assinatura.ps1'), [ref]$null, [ref]$null)
foreach ($Nome in @('Api','Foto')) {
  $Def = $Ast.Find({ param($No) $No -is [Management.Automation.Language.FunctionDefinitionAst] -and $No.Name -eq $Nome }, $true)
  . ([scriptblock]::Create($Def.Extent.Text))
}
$Base = 'http://127.0.0.1:${server.address().port}'
$Headers = @{}
foreach ($Metodo in @('GET','POST')) {
  $Dados = $null
  if ($Metodo -eq 'POST') { $Dados = @{query='select 1'} }
  $Lista = @(Api $Metodo '/functions' $Dados)
  if ($Lista.Count -ne 2) { throw "$Metodo retornou array aninhado em vez de duas linhas." }
  $Fotos = @(Foto $Lista)
  if ($Fotos.Count -ne 2 -or $Fotos[0].slug -isnot [string]) { throw 'Foto agrupou metadados de funcoes distintas.' }
  $Nova = @($Lista | Where-Object { $_.slug -eq 'avisos-assinatura' })
  if ($Nova.Count -ne 1 -or $Nova[0].verify_jwt -ne $false -or $Nova[0].updated_at -ne 2) { throw 'Readback da Edge recusou metadados validos.' }
}
Write-Host 'implantar-avisos-assinatura: 6 checagens PASS'
`;
  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    cwd: path.join(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on('error', error => { console.error(error.message); server.close(); process.exitCode = 1; });
  child.on('exit', code => { server.close(); process.exitCode = code ?? 1; });
});
