-- PREPARADO, NAO EXECUTADO. Requer revisao, backup/readback e autorizacao do maestro.
-- Segredos so por NOME. Nunca copiar valores/cron.command em recibos.
-- Edge env: MARKETING_MONITOR_SECRET, MARKETING_EMAIL_SECRET,
-- Overrides opcionais: MARKETING_RESEND_API_KEY (fallback RESEND_API_KEY),
-- MARKETING_INCIDENTES_EMAIL_TO (fallback EMAIL_ENCAMINHAR_PARA),
-- MARKETING_INCIDENTES_EMAIL_FROM (default explicito admin@granaponto.com.br).
-- ADMIN_MARKETING_USER_ID,
-- MARKETING_HEALTHCHECKS_WORKER_URL, MARKETING_HEALTHCHECKS_MONITOR_URL.
-- Vault names abaixo devem conter os mesmos valores dos ambientes Edge.
-- JWT das tres funcoes permanece TRUE. Nao altera cron do worker existente.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ declare nome text;begin
 if not exists(select 1 from pg_extension where extname='pg_cron')
  or not exists(select 1 from pg_extension where extname='pg_net') then raise exception 'extensao-ausente';end if;
 if to_regclass('vault.decrypted_secrets') is null then raise exception 'vault-ausente';end if;
 foreach nome in array array['marketing_supabase_url','marketing_service_role','marketing_monitor_secret','marketing_email_secret'] loop
  if not exists(select 1 from vault.decrypted_secrets where name=nome and length(decrypted_secret)>0)
   then raise exception 'segredo-ausente: %',nome;end if;
 end loop;
 if exists(select 1 from cron.job where jobname in ('marketing-incidentes-monitor','marketing-incidentes-email'))
  then raise exception 'cron-existente-comparar-antes';end if;
end $$;
select cron.schedule('marketing-incidentes-monitor','* * * * *',$job$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='marketing_supabase_url')||'/functions/v1/marketing-incidentes-monitor',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='marketing_service_role'),
 'x-marketing-ops-secret',(select decrypted_secret from vault.decrypted_secrets where name='marketing_monitor_secret')),
 body:='{}'::jsonb,timeout_milliseconds:=28000);
$job$);
select cron.schedule('marketing-incidentes-email','* * * * *',$job$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='marketing_supabase_url')||'/functions/v1/marketing-incidentes-email',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='marketing_service_role'),
 'x-marketing-ops-secret',(select decrypted_secret from vault.decrypted_secrets where name='marketing_email_secret')),
 body:='{}'::jsonb,timeout_milliseconds:=28000);
$job$);
-- Schedule nasce ativo na extensao; desativa na MESMA transacao, antes de qualquer tick.
select cron.alter_job(jobid,active:=false) from cron.job where jobname='marketing-incidentes-email';
commit;
-- Somente depois dos pings reais, teste de alerta/email autorizado e leitura dos recibos:
-- usar scripts/meta-confiabilidade-ativar.sql, que exige entrega verificada e reverte se faltar prova.
-- NUNCA preencher integracoes_saude manualmente para forcar o gate.
