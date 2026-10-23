-- Somente apos autorizacao NOMINAL de email no recibo da raiz. Nao habilita politica2h.
-- O runner injeta UUID validado em SET LOCAL dentro desta transacao; nunca segredo.
begin;
set local lock_timeout='5s';
do $$ begin
 if not exists(select 1 from cron.job where jobname='marketing-incidentes-email') then raise exception 'cron-email-ausente';end if;
end $$;
select public.admin_marketing_real_email_liberar(nullif(current_setting('app.marketing_email_autorizacao',true),'')::uuid);
select cron.alter_job(jobid,active:=true) from cron.job where jobname='marketing-incidentes-email';
commit;
