-- NÃO APLICADA. Complementa 20261015190000; não instala executor, cron ou envio.
-- RPCs SECURITY INVOKER exclusivas do servidor, após o portão admin com MFA.
begin;

-- Bucket dedicado, privado e sem policies de cliente. Só backend autorizado.
-- O limite operacional recusa inclusive arquivo de 45 MiB.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('marketing-remoto','marketing-remoto',false,47185919,array['image/jpeg','image/png','video/mp4'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

insert into public.admin_marketing_controles(id) values (true) on conflict do nothing;
alter table public.admin_marketing_controles
  add column recuperacao_pendente boolean not null default true,
  add column margem_validada_ate timestamptz;
alter table public.admin_marketing_agendamentos
  add column aceite_revogado_em timestamptz;
grant update (recuperacao_pendente, margem_validada_ate) on public.admin_marketing_controles to service_role;
grant update (aceite_revogado_em) on public.admin_marketing_agendamentos to service_role;

-- Uma identidade não pode acumular eventos ilimitados mesmo usando o servidor.
-- A linha única de controle serializa a admissão; duplicatas não gastam o teto.
create function public.admin_marketing_limitar_eventos() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.admin_marketing_controles where id for update;
  if exists(select 1 from public.admin_marketing_eventos where chave = new.chave) then
    return null;
  end if;
  if (select count(*) from public.admin_marketing_eventos
      where criado_em >= date_trunc('day', now())) >= 1000 then
    raise exception 'marketing-eventos-limite';
  end if;
  return new;
end $$;
create trigger admin_marketing_eventos_limite before insert on public.admin_marketing_eventos
for each row execute function public.admin_marketing_limitar_eventos();
create index admin_marketing_eventos_dia_idx on public.admin_marketing_eventos(criado_em);

-- Claim e recibo são uma transação. Nenhum HTTP é feito nesta função.
-- Lease vencida é INCERTA: nunca volta automaticamente para a fila de envio.
create function public.admin_marketing_reservar()
returns table(agendamento_id uuid, envio_id uuid, lease_id uuid)
language plpgsql security invoker set search_path = '' as $$
declare
  a public.admin_marketing_agendamentos;
  e uuid;
  l uuid := gen_random_uuid();
begin
  update public.admin_marketing_envios v set estado='incerto', terminado_em=now(), codigo_erro='lease-vencida'
    from public.admin_marketing_agendamentos g
    where v.agendamento_id=g.id and v.estado='iniciado' and g.estado='preparando' and g.lease_expira_em<=now();
  update public.admin_marketing_agendamentos set estado='precisa-conferir', lease_id=null,
    lease_expira_em=null, codigo_erro='lease-vencida', atualizado_em=now()
    where estado='preparando' and lease_expira_em<=now();
  if not exists(select 1 from public.admin_marketing_controles
    where id and habilitado and not pausa_global and not recuperacao_pendente
      and capacidade_validada_em >= now()-interval '1 day' and margem_validada_ate > now()) then
    return;
  end if;
  -- Atraso não autoriza publicar fora do horário confirmado.
  update public.admin_marketing_agendamentos g set estado='precisa-conferir', codigo_erro='horario-vencido', atualizado_em=now()
    from public.admin_marketing_autorizacoes u
    where g.autorizacao_id=u.id and g.estado='programado-no-painel' and u.publicar_em < now()-interval '15 minutes';
  select g.* into a from public.admin_marketing_agendamentos g
    join public.admin_marketing_autorizacoes u on u.id=g.autorizacao_id
    cross join public.admin_marketing_controles c
    where g.estado='programado-no-painel' and g.estrategia='executor-remoto'
      and g.aceite_revogado_em is null and g.proxima_verificacao_em<=now()
      and u.publicar_em between now()-interval '15 minutes' and now()
      and (case u.rede when 'facebook' then not c.pausa_facebook else not c.pausa_instagram end)
      and not exists(select 1 from public.admin_marketing_envios v
        where v.agendamento_id=g.id and v.operacao='publicar')
    order by u.publicar_em,g.id for update of g skip locked limit 1;
  if not found then return; end if;
  insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao)
    values(a.id,encode(sha256(convert_to(a.id::text||':publicar:1','UTF8')),'hex'),1,'publicar') returning id into e;
  update public.admin_marketing_agendamentos set estado='preparando', lease_id=l,
    lease_expira_em=now()+interval '2 minutes', atualizado_em=now() where id=a.id;
  return query select a.id,e,l;
end $$;

-- Backend só lista objetos elegíveis. A exclusão no Storage deve ocorrer ANTES
-- do recibo removido_em; cancelar pendente nunca torna a mídia elegível.
create function public.admin_marketing_midias_vencidas()
returns table(id uuid, objeto text)
language sql security invoker set search_path = '' as $$
  select m.id,m.objeto from public.admin_marketing_midias m
  join public.admin_marketing_agendamentos g on g.id=m.agendamento_id
  where m.removido_em is null and m.excluir_apos<=now()
    and g.estado in ('publicado','cancelado') and g.concluido_em is not null
    and m.terminal_confirmado_em=g.concluido_em
  order by m.excluir_apos,m.id limit 50
$$;

create function public.admin_marketing_limpar()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare eventos integer; notificacoes integer; agregados integer;
begin
  delete from public.admin_marketing_eventos where id in
    (select id from public.admin_marketing_eventos where expira_em<=now() order by expira_em,id limit 500);
  get diagnostics eventos = row_count;
  delete from public.admin_marketing_notificacoes where id in
    (select id from public.admin_marketing_notificacoes where expira_em<=now() order by expira_em,id limit 500);
  get diagnostics notificacoes = row_count;
  delete from public.admin_marketing_agregados where (dia,origem,metrica) in
    (select dia,origem,metrica from public.admin_marketing_agregados
     where dia < (current_date-interval '13 months')::date order by dia,origem,metrica limit 500);
  get diagnostics agregados = row_count;
  return jsonb_build_object('eventos',eventos,'notificacoes',notificacoes,'agregados',agregados);
end $$;

-- Deve ser a primeira operação após RESTAURAR um backup isolado, antes de
-- disponibilizar qualquer worker. Sem essa etapa, não liberar a restauração.
create function public.admin_marketing_bloquear_recuperacao()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.admin_marketing_controles set habilitado=false, pausa_global=true,
    pausa_facebook=true, pausa_instagram=true, recuperacao_pendente=true,
    margem_validada_ate=null, atualizado_em=now() where id;
  update public.admin_marketing_envios set estado='incerto', terminado_em=now(), codigo_erro='recuperacao-pendente'
    where estado='iniciado';
  update public.admin_marketing_agendamentos set estado='precisa-conferir', lease_id=null,
    lease_expira_em=null, codigo_erro='recuperacao-pendente', atualizado_em=now()
    where estado in ('programado-no-painel','preparando','agendado-na-meta','cancelamento-pendente');
end $$;

revoke all on function public.admin_marketing_limitar_eventos(), public.admin_marketing_reservar(),
  public.admin_marketing_midias_vencidas(), public.admin_marketing_limpar(),
  public.admin_marketing_bloquear_recuperacao() from public, anon, authenticated;
grant execute on function public.admin_marketing_limitar_eventos(), public.admin_marketing_reservar(),
  public.admin_marketing_midias_vencidas(), public.admin_marketing_limpar(),
  public.admin_marketing_bloquear_recuperacao() to service_role;
commit;
