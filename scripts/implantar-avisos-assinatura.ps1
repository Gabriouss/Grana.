# Preparado para o AUTOR. Sem -Aplicar faz apenas preflight, sem SQL write/deploy/envio.
# ! powershell -NoProfile -File scripts/implantar-avisos-assinatura.ps1 -Commit <hash-publicado> -Aplicar
# O cron fica INATIVO. -AtivarCron deve ser acrescentado apenas após a revisão LGPD/CDC
# e a decisão do autor de iniciar os e-mails transacionais. Não faz envio de teste.
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{40}$')][string]$Commit,
  [switch]$Aplicar,
  [switch]$AtivarCron,
  [switch]$PausarCron,
  [string]$Recibos = ('E:\Grana-temporarios\2026-10-24-assinatura-vencida\implantacao-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
)
$ErrorActionPreference = 'Stop'
if ($AtivarCron -and -not $Aplicar) { throw 'AtivarCron exige Aplicar.' }
if ($PausarCron -and ($AtivarCron -or $Aplicar)) { throw 'PausarCron é operação independente de Aplicar/AtivarCron.' }
$Repo = Split-Path -Parent $PSScriptRoot
$Funcao = 'avisos-assinatura'
$Arquivos = @('supabase/migrations/20261024140000_resumo_dados_guardados.sql',
  'supabase/migrations/20261024140100_avisos_assinatura.sql',
  'supabase/functions/_shared/avisos-assinatura.ts', 'supabase/functions/_shared/seguranca.ts',
  'supabase/functions/avisos-assinatura/index.ts', 'scripts/implantar-avisos-assinatura.ps1')
function Nativo([string]$Nome, [string[]]$Argumentos) {
  & $Nome @Argumentos
  if ($LASTEXITCODE -ne 0) { throw "Falha no comando $Nome (exit $LASTEXITCODE)." }
}
function FontesConferidas {
  foreach ($Arquivo in $Arquivos) {
    Nativo 'git' @('cat-file','-e',($Commit+':'+$Arquivo))
    $Publicado = [string](& git rev-parse ($Commit+':'+$Arquivo))
    if ($LASTEXITCODE -ne 0 -or $Publicado -notmatch '^[0-9a-f]{40}$') { throw "Blob publicado ausente: $Arquivo" }
    $Local = [string](& git hash-object --path $Arquivo (Join-Path $Repo $Arquivo))
    if ($LASTEXITCODE -ne 0 -or $Local -notmatch '^[0-9a-f]{40}$' -or $Local -ne $Publicado) { throw "Fonte difere do commit publicado: $Arquivo" }
  }
}
New-Item -ItemType Directory -Path $Recibos -Force | Out-Null
Set-Location -LiteralPath $Repo
# Nenhum transcript: erros HTTP/CLI podem conter cabeçalhos ou valores de segredo.
# O recibo contém somente metadados explicitamente selecionados abaixo.
try {
  if (-not $PausarCron) {
    Nativo 'git' @('fetch','origin')
    Nativo 'git' @('merge-base','--is-ancestor',$Commit,'origin/main')
    Nativo 'git' (@('diff','--quiet',$Commit,'--') + $Arquivos)
    FontesConferidas
    Nativo 'node' @('scripts/deno-check.cjs','supabase/functions/avisos-assinatura/index.ts')
    Nativo 'node' @('__tests__/avisos-assinatura.cjs')
    Nativo 'node' @('__tests__/avisos-assinatura-migration.cjs')
  }
  $Valores = @{}
  foreach ($Linha in Get-Content -LiteralPath (Join-Path $Repo '.env') -Encoding UTF8) {
    if ($Linha -match '^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
      $Valor = $Matches[2].Trim()
      $Valores[$Matches[1]] = $Valor.Trim('"').Trim("'")
    }
  }
  if (-not $Valores['SUPABASE_ACCESS_TOKEN']) { throw 'SUPABASE_ACCESS_TOKEN ausente.' }
  if ($Valores['EXPO_PUBLIC_SUPABASE_URL'] -notmatch '^https://([a-z0-9]+)\.supabase\.co/?$') { throw 'URL do projeto inválida.' }
  $Ref = $Matches[1]
  $Base = "https://api.supabase.com/v1/projects/$Ref"
  $Headers = @{ Authorization = ('Bearer ' + $Valores['SUPABASE_ACCESS_TOKEN']) }
  function Api([string]$Metodo, [string]$Rota, $Dados=$null) {
    try {
      if ($null -eq $Dados) {
        $Resposta = Invoke-RestMethod -Method $Metodo -Uri ($Base+$Rota) -Headers $Headers
        return $Resposta
      }
      $Bytes = [Text.Encoding]::UTF8.GetBytes(($Dados | ConvertTo-Json -Depth 8 -Compress))
      $Resposta = Invoke-RestMethod -Method $Metodo -Uri ($Base+$Rota) -Headers $Headers -ContentType 'application/json' -Body $Bytes
      # Enumera o array JSON; retorno direto do cmdlet cria uma lista aninhada.
      return $Resposta
    } catch { throw "Management API falhou em $Metodo $Rota. Confira o painel; não repetir escrita incerta." }
  }
  function Sql([string]$Texto) { return Api 'POST' '/database/query' @{ query=$Texto } }
  function Foto($Lista) {
    return @($Lista | ForEach-Object { [pscustomobject]@{slug=$_.slug;updated_at=$_.updated_at;verify_jwt=$_.verify_jwt} })
  }
  $Antes = @(Api 'GET' '/functions')
  Foto $Antes | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Recibos 'funcoes-antes.json')
  if ($PausarCron) {
    # Contenção aditiva: preserva Edge, RPC, recibos e idempotência.
    Sql "begin; select cron.alter_job(jobid,active := false) from cron.job where jobname='grana-avisos-assinatura'; commit;" | Out-Null
    $Pausa = @(Sql "set transaction read only; select count(*)=1 and bool_and(not active) as pausado from cron.job where jobname='grana-avisos-assinatura';")
    if (@($Pausa | Where-Object { $_.pausado -eq $true }).Count -ne 1) { throw 'Pausa sem recibo confirmado. Conferir cron.job sem repetir.' }
    @{cronPausado=$true;dadosPreservados=$true} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Recibos 'pausa-conferida.json')
    Write-Host 'CRON PAUSADO E CONFERIDO. Um envio já iniciado pode concluir; tabela/idempotência preservadas.'
    return
  }
  $Existente = @($Antes | Where-Object { $_.slug -eq $Funcao })
  if ($Existente.Count -gt 0) {
    # Guarda o ESZIP antes de qualquer possível sobrescrita. Este roteiro não
    # sobrescreve função existente: exige reconciliação do bundle com o Git.
    try { Invoke-WebRequest -UseBasicParsing -Uri "$Base/functions/$Funcao/body" -Headers $Headers -OutFile (Join-Path $Recibos 'avisos-assinatura-antes.eszip') | Out-Null }
    catch { throw 'Não foi possível guardar o pacote publicado; pare.' }
    throw 'Função já existe. Backup guardado. Compare updated_at e bundle com git log; reconcilie antes de preparar roteiro de atualização.'
  }
  $Secrets = @(Api 'GET' '/secrets')
  foreach ($Nome in @('CRON_ASSINATURA_SECRET','RESEND_API_KEY')) {
    if (-not ($Secrets | Where-Object { $_.name -eq $Nome })) { throw "Secret Edge ausente: $Nome" }
  }
  # Consulta somente leitura: devolve booleanos, nunca valores de Vault/cron.command.
  $Preflight = @(Sql @'
set transaction read only;
select
  exists(select 1 from pg_extension where extname='pg_cron') as cron_ok,
  exists(select 1 from pg_extension where extname='pg_net') as net_ok,
  coalesce(current_setting('cron.timezone',true),'GMT') in ('UTC','GMT','Etc/UTC','Etc/GMT') as timezone_ok,
  (select count(*)=2 from vault.decrypted_secrets where
    (name='assinatura_project_url' and decrypted_secret='https://__PROJECT_REF__.supabase.co')
    or (name='assinatura_cron_secret' and length(decrypted_secret)>=32)) as vault_ok,
  to_regprocedure('public.resumo_dados_guardados()') is null
    and to_regprocedure('public.listar_assinaturas_para_avisos(uuid,integer)') is null
    and to_regprocedure('public.reservar_aviso_assinatura(uuid,text,timestamp with time zone)') is null
    and to_regclass('public.avisos_assinatura_enviados') is null
    and not exists(select 1 from cron.job where jobname='grana-avisos-assinatura') as alvos_livres;
'@.Replace('__PROJECT_REF__', $Ref))
  $Pre = @($Preflight | Where-Object { $null -ne $_.cron_ok })
  if ($Pre.Count -ne 1 -or -not $Pre[0].cron_ok -or -not $Pre[0].net_ok -or -not $Pre[0].timezone_ok -or -not $Pre[0].vault_ok -or -not $Pre[0].alvos_livres) {
    throw 'Preflight recusado: conferir extensões, alvos e Vault assinatura_project_url/assinatura_cron_secret. O segredo do Vault precisa ser o mesmo CRON_ASSINATURA_SECRET da Edge.'
  }
  $Pre[0] | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Recibos 'preflight.json')
  if (-not $Aplicar) { Write-Host 'PREFLIGHT OK. Nenhuma migration, deploy, ativação ou envio executado.'; return }
  # Instala as duas migrations na MESMA transação. O cron não pode disparar
  # entre schedule e active=false. Nunca supabase db push (atingiria WIP alheio).
  $SqlRpc = [IO.File]::ReadAllText((Join-Path $Repo $Arquivos[0]))
  $SqlEmail = [IO.File]::ReadAllText((Join-Path $Repo $Arquivos[1]))
  Sql ("begin; set local lock_timeout='5s'; set local statement_timeout='30s';`n" + $SqlRpc + "`n" + $SqlEmail + "`ncommit;") | Out-Null
  $CheckSql = @(Sql @'
set transaction read only;
select to_regprocedure('public.resumo_dados_guardados()') is not null as rpc_ok,
 (select relrowsecurity from pg_class where oid='public.avisos_assinatura_enviados'::regclass) as rls_ok,
 not has_function_privilege('anon','public.resumo_dados_guardados()','execute') as anon_recusado,
 not has_function_privilege('authenticated','public.listar_assinaturas_para_avisos(uuid,integer)','execute') as cliente_recusado,
 (select count(*)=1 and bool_and(not active) and bool_and(schedule='0 13 * * *')
    from cron.job where jobname='grana-avisos-assinatura') as cron_inativo;
'@)
  $Check = @($CheckSql | Where-Object { $null -ne $_.rpc_ok })
  if ($Check.Count -ne 1 -or -not $Check[0].rpc_ok -or -not $Check[0].rls_ok -or -not $Check[0].anon_recusado -or -not $Check[0].cliente_recusado -or -not $Check[0].cron_inativo) { throw 'Readback SQL recusado. Cron deve permanecer inativo; não repetir aplicação.' }
  $Check[0] | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Recibos 'sql-conferido.json')
  # Reconfere remoto e fontes imediatamente antes do único deploy nomeado.
  $PreDeploy = @(Api 'GET' '/functions')
  if ($PreDeploy | Where-Object { $_.slug -eq $Funcao }) { throw 'Função apareceu durante o roteiro; pare para reconciliar.' }
  Nativo 'git' (@('diff','--quiet',$Commit,'--') + $Arquivos)
  FontesConferidas
  $TokenAnterior = $env:SUPABASE_ACCESS_TOKEN
  try {
    $env:SUPABASE_ACCESS_TOKEN = $Valores['SUPABASE_ACCESS_TOKEN']
    Nativo 'npx' @('--yes','supabase@2.120.0','functions','deploy',$Funcao,'--project-ref',$Ref,'--no-verify-jwt')
  } finally { $env:SUPABASE_ACCESS_TOKEN = $TokenAnterior }
  $Depois = @(Api 'GET' '/functions')
  Foto $Depois | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Recibos 'funcoes-depois.json')
  $Nova = @($Depois | Where-Object { $_.slug -eq $Funcao })
  if ($Nova.Count -ne 1 -or $Nova[0].verify_jwt -ne $false -or -not $Nova[0].updated_at) { throw 'Readback da Edge recusado. Cron permanece inativo.' }
  foreach ($F in $Antes) {
    $D = @($Depois | Where-Object { $_.slug -eq $F.slug })
    if ($D.Count -ne 1 -or $D[0].updated_at -ne $F.updated_at -or $D[0].verify_jwt -ne $F.verify_jwt) { throw "Outra função mudou: $($F.slug). Cron permanece inativo." }
  }
  if ($AtivarCron) {
    Sql "begin; select cron.alter_job(jobid,active := true) from cron.job where jobname='grana-avisos-assinatura'; commit;" | Out-Null
    $Ativo = @(Sql "set transaction read only; select count(*)=1 and bool_and(active) as ativo from cron.job where jobname='grana-avisos-assinatura';")
    if (-not (@($Ativo | Where-Object { $_.ativo -eq $true }).Count -eq 1)) { throw 'Ativação sem recibo confirmado. Não repetir; confira cron.job.' }
  }
  @{commit=$Commit;funcao=$Funcao;updated_at=$Nova[0].updated_at;verify_jwt=$Nova[0].verify_jwt;cronAtivado=[bool]$AtivarCron;envioTeste=$false} |
    ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Recibos 'resultado.json')
  Write-Host 'IMPLANTADO. Não houve envio de teste. Confira os recibos; reservas incertas nunca devem ser apagadas para repetir envios.'
} catch {
  # Imprime só mensagens controladas; erro bruto de API/rede fica fora do recibo.
  Write-Host 'PARADO. Consulte os recibos e o painel antes de repetir qualquer escrita.'
  if ($_.Exception.Message -notmatch '(Bearer|sbp_|eyJ)') { Write-Host $_.Exception.Message }
  exit 1
}
# Contenção pelo SQL Editor, caso necessária: apenas pausa novos disparos,
# sem apagar tabela/idempotência (um request já iniciado pode concluir).
# select cron.alter_job(jobid,active := false) from cron.job where jobname='grana-avisos-assinatura';
# Conferência operacional (somente números/estados):
# select estado,count(*) from public.avisos_assinatura_enviados group by estado;
# select status,return_message from cron.job_run_details where jobid=(select jobid from cron.job where jobname='grana-avisos-assinatura') order by start_time desc limit 10;
# cron registra o HTTP enfileirado, não o aceite do e-mail. Confira net._http_response
# (status_code/error_msg) no painel, sem exportar corpo/cabeçalhos.
