// Executa o roteiro PowerShell REAL com fronteiras Git/CLI/Management dublês.
// Nunca lê .env real, nunca chama rede/CLI externa. Verifica ordem e fail closed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
if(process.platform!=='win32'){console.log('avisos-assinatura-implantacao: requer PowerShell Windows; não executado nesta plataforma');process.exit(0);}
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'grana-assinatura-'));
let checks=0;const ok=(v,n)=>{assert.ok(v,n);checks++;};
const wrapper=path.join(dir,'ensaio.ps1');
fs.writeFileSync(wrapper,`param([string]$Caso,[string]$Alvo,[string]$Destino,[string]$Trace)
$ErrorActionPreference='Stop'
$global:Chamadas=New-Object System.Collections.Generic.List[string]
$global:Publicado=$false
function global:git {
 $global:Chamadas.Add('git '+($args -join ' '));$global:LASTEXITCODE=0
 if($args[0] -eq 'cat-file' -and $Caso -eq 'blob-ausente'){$global:LASTEXITCODE=128}
 if($args[0] -in @('rev-parse','hash-object')){return ('b'*40)}
}
function global:node { $global:Chamadas.Add('node '+($args -join ' '));$global:LASTEXITCODE=0 }
function global:npx { $global:Chamadas.Add('npx '+($args -join ' '));$global:Publicado=$true;$global:LASTEXITCODE=0 }
function global:Get-Content {
 param($LiteralPath,$Encoding)
 if($LiteralPath -like '*\\.env'){return @('SUPABASE_ACCESS_TOKEN=token-ficticio','EXPO_PUBLIC_SUPABASE_URL=https://localmock.supabase.co')}
 throw 'Leitura inesperada'
}
function global:Invoke-WebRequest {
 param([switch]$UseBasicParsing,$Uri,$Headers,$OutFile)
 $global:Chamadas.Add('backup');[IO.File]::WriteAllText($OutFile,'bundle-ficticio')
}
function global:Invoke-RestMethod {
 param($Method,$Uri,$Headers,$ContentType,$Body)
 if($Uri -match '/functions$'){
  $global:Chamadas.Add('metadata')
  $old=@{slug='whatsapp-webhook';updated_at=1000;verify_jwt=$false}
  if($global:Publicado -and $Caso -eq 'drift'){$old.updated_at=9999}
  if($global:Publicado -or $Caso -eq 'existente'){return @($old,@{slug='avisos-assinatura';updated_at=2000;verify_jwt=$false})}
  return @($old)
 }
 if($Uri -match '/secrets$'){
  $global:Chamadas.Add('secrets')
  if($Caso -eq 'sem-secret'){return @(@{name='RESEND_API_KEY'})}
  return @(@{name='RESEND_API_KEY'},@{name='CRON_ASSINATURA_SECRET'})
 }
 if($Uri -notmatch '/database/query$'){throw 'HTTP inesperado'}
 $query=([Text.Encoding]::UTF8.GetString($Body)|ConvertFrom-Json).query
 if($query -match 'as cron_ok'){
  $global:Chamadas.Add('sql-preflight')
  if($query -notmatch 'https://localmock.supabase.co'){throw 'URL nao substituida'}
  return @(@{cron_ok=$true;net_ok=$true;timezone_ok=($Caso -ne 'timezone-ruim');vault_ok=$true;alvos_livres=($Caso -ne 'alvos-ocupados')})
 }
 if($query -match 'as rpc_ok'){
  $global:Chamadas.Add('sql-readback')
  return @(@{rpc_ok=($Caso -ne 'readback-ruim');rls_ok=$true;anon_recusado=$true;cliente_recusado=$true;cron_inativo=$true})
 }
 if($query -match 'as ativo'){$global:Chamadas.Add('sql-ativo-readback');return @(@{ativo=$true})}
 if($query -match 'as pausado'){$global:Chamadas.Add('sql-pausa-readback');return @(@{pausado=$true})}
 if($query -match 'active := false' -and $query -notmatch 'create table'){$global:Chamadas.Add('sql-pausar');return @()}
 if($query -match 'active := true'){$global:Chamadas.Add('sql-ativar');return @()}
 if($query -match 'create table if not exists public.avisos_assinatura_enviados'){
  if($query -notmatch '^begin;' -or $query -notmatch 'commit;\\s*$'){throw 'DDL fora de transacao'}
  $global:Chamadas.Add('sql-migrations');return @()
 }
 throw 'SQL inesperado'
}
try {
 $op=@{Commit=('a'*40);Recibos=$Destino}
 if($Caso -notin @('preflight','pausar')){$op.Aplicar=$true}
 if($Caso -eq 'pausar'){$op.PausarCron=$true}
 if($Caso -in @('ativar','drift')){$op.AtivarCron=$true}
 & $Alvo @op
 $global:Resultado=$LASTEXITCODE
} finally {
 [IO.File]::WriteAllText($Trace,(@{calls=@($global:Chamadas);exit=$global:Resultado}|ConvertTo-Json -Depth 4))
}
`, 'utf8');
try{
 for(const caso of ['preflight','aplicar','ativar','existente','sem-secret','alvos-ocupados','readback-ruim','drift','blob-ausente','timezone-ruim','pausar']){
  const destino=path.join(dir,caso),trace=path.join(dir,caso+'.json');
  const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',wrapper,'-Caso',caso,'-Alvo',path.join(root,'scripts/implantar-avisos-assinatura.ps1'),'-Destino',destino,'-Trace',trace],{encoding:'utf8'});
  assert.ok(fs.existsSync(trace),r.stdout+r.stderr);
  const {calls}=JSON.parse(fs.readFileSync(trace,'utf8')),writes=calls.filter(x=>x==='sql-migrations'||x.startsWith('npx ')||x==='sql-ativar');
  if(caso==='preflight')ok(writes.length===0&&r.stdout.includes('PREFLIGHT OK'),'default sem mutation');
  if(['aplicar','ativar'].includes(caso)){
   ok(calls.indexOf('sql-migrations')<calls.indexOf('sql-readback'),'DDL antes do readback');
   const cli=calls.find(x=>x.startsWith('npx '));
   ok(cli?.includes('functions deploy avisos-assinatura --project-ref localmock --no-verify-jwt'),'apenas função nomeada com JWT explícito');
   ok(calls.indexOf('sql-readback')<calls.indexOf(cli),'readback antes do deploy');
   ok(fs.existsSync(path.join(destino,'resultado.json')),'recibo final só no sucesso');
   ok(calls.includes('sql-ativar')===(caso==='ativar'),'ativação só quando pedida');
  }
  if(['existente','sem-secret','alvos-ocupados','blob-ausente','timezone-ruim'].includes(caso))ok(writes.length===0,'preflight recusa '+caso);
  if(caso==='existente')ok(calls.includes('backup')&&fs.existsSync(path.join(destino,'avisos-assinatura-antes.eszip')),'backup antes de recusar sobrescrita');
  if(caso==='readback-ruim')ok(writes.length===1&&writes[0]==='sql-migrations','readback ruim impede deploy');
  if(caso==='drift')ok(!calls.includes('sql-ativar')&&!fs.existsSync(path.join(destino,'resultado.json')),'mudança em outra função impede ativação');
  if(caso==='pausar')ok(writes.length===0&&calls.includes('sql-pausar')&&calls.includes('sql-pausa-readback')&&fs.existsSync(path.join(destino,'pausa-conferida.json')),'pausa executável com readback sem deploy ou exclusão');
  ok(!r.stdout.includes('token-ficticio')&&!r.stderr.includes('token-ficticio'),'token nunca impresso '+caso);
 }
 console.log(`avisos-assinatura-implantacao: ${checks} checagens OK (PowerShell real, fronteiras dublês)`);
}finally{
 const alvo=path.resolve(dir);
 assert.equal(path.dirname(alvo),path.resolve(os.tmpdir()));
 assert.ok(path.basename(alvo).startsWith('grana-assinatura-'));
 fs.rmSync(alvo,{recursive:true,force:true});
}
