-- SOMENTE LEITURA. Uma resposta JSON; nunca consulta command/headers/Vault/tokens.
select jsonb_build_object(
 'controles',(select jsonb_build_object('habilitado',habilitado,'pausaGlobal',pausa_global,'politica2hHabilitada',politica_2h_habilitada,'emailEnvioHabilitado',email_envio_habilitado,'emailAutorizacaoId',email_autorizacao_id,'emailAutorizadoEm',email_autorizado_em) from public.admin_marketing_controles where id),
 'pronta',public.admin_marketing_real_politica_pronta(),
 'email',public.admin_marketing_real_email_saude(),
 'worker',(select jsonb_build_object('concluidoEm',concluido_em,'http',http,'processados',processados,'incertos',incertos) from public.admin_marketing_executor_saude where id),
 'monitor',(select jsonb_build_object('concluidoEm',concluido_em) from public.admin_marketing_monitor_saude where id),
 'dispatcher',(select jsonb_build_object('configurado',configurado,'saudavel',saudavel,'codigo',codigo,'concluidoEm',concluido_em) from public.admin_marketing_email_saude where id),
 'jobs',(select jsonb_object_agg(estado,n) from (select estado,count(*) n from public.admin_marketing_agendamentos group by estado) x),
 'outbox',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select estado,entrega_estado,count(*) n,min(criado_em) mais_antigo from public.admin_marketing_email_outbox group by estado,entrega_estado) x),
 'prazosDivergentes',(select count(*) from public.admin_marketing_autorizacoes where executar_ate is distinct from public.admin_marketing_real_limite(publicar_em,politica_execucao)),
 'cron',(select coalesce(jsonb_agg(jsonb_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'active',active)),'[]'::jsonb) from cron.job where jobname in ('marketing-incidentes-monitor','marketing-incidentes-email')),
 'rpcs',(select jsonb_agg(jsonb_build_object('nome',p.proname,'argumentos',pg_get_function_identity_arguments(p.oid),'sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin_marketing_real_%')
) as dados;
