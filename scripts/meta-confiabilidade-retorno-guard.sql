-- Prefixo transacional para retorno de corpos brutos. Nao executavel isoladamente.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select id from public.admin_marketing_controles where id for update;
do $$ begin
 if not coalesce((select pausa_global from public.admin_marketing_controles where id),false)
 or exists(select 1 from public.admin_marketing_agendamentos j join public.admin_marketing_autorizacoes a on a.id=j.autorizacao_id
  where j.lease_id is not null or (a.politica_execucao='recuperacao-2h-v1' and j.estado not in ('publicado','cancelado'))
  or exists(select 1 from public.admin_marketing_envios e join public.admin_marketing_ids_diario d on d.envio_id=e.id
    where e.agendamento_id=j.id and e.estado='iniciado'))
 then raise exception 'retorno-bloqueado';end if;
end $$;
