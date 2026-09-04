-- Execute no SQL Editor DEPOIS de:
--   1. aplicar a seção de push de supabase/schema.sql;
--   2. publicar enviar-lembretes-habito com --no-verify-jwt;
--   3. cadastrar o mesmo valor aleatório de CRON_PUSH_SECRET nos Secrets da
--      Edge Function e abaixo no Vault (nunca commitar esse valor).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Rode uma vez, substituindo somente os valores entre <...>:
-- select vault.create_secret('https://<project-ref>.supabase.co', 'push_project_url');
-- select vault.create_secret('<mesmo CRON_PUSH_SECRET da Edge Function>', 'push_cron_secret');

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_project_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'push_cron_secret') then
    raise exception 'Cadastre push_project_url e push_cron_secret no Vault antes de criar o cron.';
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'grana-push-habito-cada-5-min';

select cron.schedule(
  'grana-push-habito-cada-5-min',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_project_url')
        || '/functions/v1/enviar-lembretes-habito',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);

-- Operação: execuções e falhas ficam visíveis nestas duas consultas.
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'grana-push-habito-cada-5-min') order by start_time desc limit 20;
-- select * from net._http_response order by created desc limit 20;
