-- NÃO APLICADA. E5 somente simulação, sem cron, HTTP ou promoção para produção.
begin;
create table public.admin_marketing_sim_catalogo (
  peca_id text primary key check(peca_id ~ '^[0-9a-f]{16}$'),
  versao text not null check(versao ~ '^[0-9a-f]{40}$'),
  manifesto jsonb not null check(jsonb_typeof(manifesto)='object' and octet_length(manifesto::text)<=32768),
  aprovado boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create table public.admin_marketing_sim_controles (
  id boolean primary key default true check(id),
  global_pausado boolean not null default true,
  facebook_pausado boolean not null default true,
  instagram_pausado boolean not null default true
);
insert into public.admin_marketing_sim_controles default values;
create table public.admin_marketing_sim_outbox (
  chave text primary key check(chave ~ '^[0-9a-f]{64}$'),
  revisao integer not null default 0 check(revisao>=0),
  dados jsonb not null check(jsonb_typeof(dados)='object'
    and (dados->>'modo') is not distinct from 'simulacao'
    and (dados->>'chave') is not distinct from chave
    and dados ? 'estado' and dados->>'estado' in ('planejado','programado-no-painel','agendado-na-meta',
      'preparando','publicado','cancelamento-pendente','cancelado','falhou','precisa-conferir')
    and octet_length(dados::text)<=65536),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index admin_marketing_sim_outbox_atualizado_idx on public.admin_marketing_sim_outbox(atualizado_em,chave);
alter table public.admin_marketing_sim_catalogo enable row level security;
alter table public.admin_marketing_sim_controles enable row level security;
alter table public.admin_marketing_sim_outbox enable row level security;
revoke all on public.admin_marketing_sim_catalogo,public.admin_marketing_sim_controles,
  public.admin_marketing_sim_outbox from public,anon,authenticated,service_role;
grant select,insert,update on public.admin_marketing_sim_catalogo to service_role;
grant select on public.admin_marketing_sim_controles,public.admin_marketing_sim_outbox to service_role;

-- Compare-and-swap: só quem persistiu a reserva pode executar o adaptador.
-- Recibo e estado ficam no mesmo documento; conflito nunca reenvia sozinho.
create function public.admin_marketing_sim_cas(p_chave text,p_revisao integer,p_dados jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r integer;
begin
  if p_revisao=-1 then
    perform 1 from public.admin_marketing_sim_controles where id for update;
    if exists(select 1 from public.admin_marketing_sim_outbox where chave=p_chave) then return null; end if;
    if (select count(*) from public.admin_marketing_sim_outbox)>=1000
      or (select count(*) from public.admin_marketing_sim_outbox
        where criado_em >= (date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'))>=100 then
      raise exception 'simulacao-limite';
    end if;
    insert into public.admin_marketing_sim_outbox(chave,dados) values(p_chave,p_dados)
      on conflict do nothing returning revisao into r;
  else
    update public.admin_marketing_sim_outbox set dados=p_dados,revisao=revisao+1,atualizado_em=now()
      where chave=p_chave and revisao=p_revisao returning revisao into r;
  end if;
  return r;
end $$;
create function public.admin_marketing_sim_pausar(p_rede text,p_pausa boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_rede not in ('global','facebook','instagram') or p_rede is null or p_pausa is null then
    raise exception 'pedido-invalido';
  end if;
  update public.admin_marketing_sim_controles set
    global_pausado=case when p_rede='global' then p_pausa else global_pausado end,
    facebook_pausado=case when p_rede='facebook' then p_pausa else facebook_pausado end,
    instagram_pausado=case when p_rede='instagram' then p_pausa else instagram_pausado end where id;
end $$;
revoke all on function public.admin_marketing_sim_cas(text,integer,jsonb),
  public.admin_marketing_sim_pausar(text,boolean) from public,anon,authenticated;
grant execute on function public.admin_marketing_sim_cas(text,integer,jsonb),
  public.admin_marketing_sim_pausar(text,boolean) to service_role;
-- Restaurar dry-run não autoriza retomar: sempre pausar os três escopos antes
-- de liberar o endpoint em ambiente restaurado. Nenhum dado daqui é aceito
-- como prova por admin_marketing_autorizacoes/agendamentos reais.
commit;
