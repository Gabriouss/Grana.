create table if not exists public.push_tokens (
  expo_push_token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plataforma text not null check (plataforma in ('android', 'ios')),
  timezone text not null,
  horario_hora smallint not null default 20 check (horario_hora between 0 and 23),
  horario_minuto smallint not null default 30 check (horario_minuto between 0 and 59),
  ativo boolean not null default true,
  mensagens_recentes text[] not null default '{}',
  visto_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint push_tokens_token_valido check (
    char_length(expo_push_token) between 20 and 512
    and expo_push_token ~ '^(Expo|Exponent)PushToken\[[^]]+\]$'
  ),
  constraint push_tokens_timezone_valido check (char_length(timezone) between 1 and 100),
  constraint push_tokens_recentes_limitado check (cardinality(mensagens_recentes) <= 10)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);
create index if not exists push_tokens_ativos_idx on public.push_tokens (ativo, visto_em desc);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: dono le" on public.push_tokens;
create policy "push_tokens: dono le"
  on public.push_tokens for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "push_tokens: dono cadastra" on public.push_tokens;
create policy "push_tokens: dono cadastra"
  on public.push_tokens for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_tokens: dono atualiza" on public.push_tokens;
create policy "push_tokens: dono atualiza"
  on public.push_tokens for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_tokens: dono remove" on public.push_tokens;
create policy "push_tokens: dono remove"
  on public.push_tokens for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;

create table if not exists public.push_habit_deliveries (
  id uuid primary key default gen_random_uuid(),
  expo_push_token text not null references public.push_tokens(expo_push_token) on delete cascade,
  data_local date not null,
  mensagem_id text not null,
  titulo text not null,
  corpo text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  tentativas smallint not null default 0 check (tentativas between 0 and 20),
  proxima_tentativa_em timestamptz not null default now(),
  expo_ticket_id text unique,
  enviado_em timestamptz,
  recibo_consultado_em timestamptz,
  entregue_ao_provedor_em timestamptz,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (expo_push_token, data_local),
  constraint push_habit_deliveries_copy_limitada check (
    char_length(mensagem_id) between 1 and 80
    and char_length(titulo) between 1 and 180
    and char_length(corpo) between 1 and 1000
  )
);

create index if not exists push_habit_deliveries_pendentes_idx
  on public.push_habit_deliveries (proxima_tentativa_em)
  where status in ('pending', 'sending');
create index if not exists push_habit_deliveries_recibos_idx
  on public.push_habit_deliveries (enviado_em)
  where status = 'sent' and recibo_consultado_em is null;

alter table public.push_habit_deliveries enable row level security;
revoke all on public.push_habit_deliveries from anon, authenticated;

create or replace function public.contextos_push_habito(p_user_ids uuid[])
returns table (usuario_id uuid, datas_recentes date[])
language sql
stable
set search_path = ''
as $$
  select ids.usuario_id,
         coalesce(
           array_agg(distinct t.occurred_on order by t.occurred_on desc)
             filter (where t.occurred_on is not null),
           '{}'::date[]
         ) as datas_recentes
  from unnest(p_user_ids) as ids(usuario_id)
  left join public.transactions t
    on t.user_id = ids.usuario_id
   and t.occurred_on >= current_date - 45
  group by ids.usuario_id;
$$;

revoke all on function public.contextos_push_habito(uuid[]) from public, anon, authenticated;
grant execute on function public.contextos_push_habito(uuid[]) to service_role;

create or replace function public.reivindicar_entregas_push_habito(p_limite integer default 500)
returns setof public.push_habit_deliveries
language sql
security definer
set search_path = ''
as $$
  with candidatas as (
    select d.id
    from public.push_habit_deliveries d
    where d.status in ('pending', 'sending')
      and d.proxima_tentativa_em <= statement_timestamp()
      and d.tentativas < 20
    order by d.proxima_tentativa_em
    for update skip locked
    limit least(greatest(p_limite, 1), 500)
  )
  update public.push_habit_deliveries d
     set status = 'sending',
         tentativas = d.tentativas + 1,
         proxima_tentativa_em = statement_timestamp() + interval '15 minutes',
         atualizado_em = statement_timestamp()
   where d.id in (select c.id from candidatas c)
  returning d.*;
$$;

revoke all on function public.reivindicar_entregas_push_habito(integer) from public, anon, authenticated;
grant execute on function public.reivindicar_entregas_push_habito(integer) to service_role;
