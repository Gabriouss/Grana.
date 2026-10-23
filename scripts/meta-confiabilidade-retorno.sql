-- CONTENCAO preparada, nao executada. Nao remove posts, autorizacoes, IDs ou recibos.
-- Pode ser usada sem restaurar fonte antiga: consultas/readback continuam funcionando.
begin;
set local lock_timeout='5s';
select id from public.admin_marketing_controles where id for update;
update public.admin_marketing_controles set politica_2h_habilitada=false,pausa_global=true,revisao=revisao+1,atualizado_em=now() where id;
commit;
-- Restaurar bundle/RPC anteriores somente DEPOIS desta verificacao dar zero:
select count(*) as bloqueios_retorno
from public.admin_marketing_agendamentos j join public.admin_marketing_autorizacoes a on a.id=j.autorizacao_id
where (a.politica_execucao='recuperacao-2h-v1' and j.estado not in ('publicado','cancelado'))
 or j.lease_id is not null
 or exists(select 1 from public.admin_marketing_envios e join public.admin_marketing_ids_diario d on d.envio_id=e.id
  where e.agendamento_id=j.id and e.estado='iniciado');
-- Monitor e alertas continuam ativos durante a contencao.
-- Retorno de fonte exige bundle/DDL efetivos guardados por Beacon, NAO os do Git por suposicao.
