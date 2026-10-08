-- PROPOSTA, NAO APLICADA. Fica fora de supabase/migrations de proposito, para nenhum
-- `supabase db push` aplica-la sem decisao. Aplicar exige pedido explicito do autor
-- (regra 11) e a funcao de escrita da M2 revisada antes.
--
-- Frente C do painel admin (plano docs/admin/2026-10-08-plano-painel-admin.md):
-- fila de pedidos de ajuste de marketing que a M2 tambem possa usar. Hoje a fila e
-- local, privada, na M1 (tools/admin-local/marketing/ajustes-fila.cjs); esta tabela
-- espelha o mesmo modelo para quando a escrita remota existir.
--
-- Acesso: RLS ligada e NENHUMA policy, com revoke de anon e authenticated. Quem le e
-- escreve e so service_role, por uma Edge Function propria que valida Supabase Auth,
-- allowlist (ADMIN_USER_IDS), aal2 e TOTP verificado (_shared/admin-autorizacao.ts).
-- admin-consulta NAO ganha escrita. A chave service_role nunca vai ao navegador.
--
-- O texto do autor (texto_original) e dado: nunca entra em commit, log ou relatorio,
-- e e imutavel depois de criado. Pedido novo cria linha nova (pai = pedido anterior).

create table if not exists public.admin_ajuste_pedidos (
  id uuid primary key default gen_random_uuid(),
  pai uuid references public.admin_ajuste_pedidos(id),
  peca_id text not null check (peca_id ~ '^[0-9a-f]{16}$'),
  caminho text not null check (char_length(caminho) <= 400),
  versao_alvo text not null check (versao_alvo ~ '^[0-9a-f]{40}$'),
  texto_original text not null check (char_length(btrim(texto_original)) between 1 and 2000),
  estado text not null default 'novo' check (estado in (
    'novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito',
    'falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao')),
  tentativas int not null default 0 check (tentativas between 0 and 10),
  lease_id uuid,
  lease_agente text,
  lease_inicio timestamptz,
  lease_expira_em timestamptz,
  versao_corrigida text check (versao_corrigida ~ '^[0-9a-f]{40}$'),
  commit_correcao text check (commit_correcao ~ '^[0-9a-f]{40}$'),
  aceite_versao text check (aceite_versao ~ '^[0-9a-f]{40}$'),
  aceite_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- lease existe so em correcao, e sempre completo
  constraint lease_coerente check (
    (estado = 'em-correcao') = (lease_id is not null)
    and (lease_id is null) = (lease_expira_em is null)),
  -- aceite so com a versao corrigida
  constraint aceite_coerente check (
    (estado = 'aceito') = (aceite_em is not null)
    and (aceite_em is null or aceite_versao = versao_corrigida)),
  constraint correcao_coerente check (
    estado not in ('corrigido-aguardando-aceite', 'aceito')
    or (versao_corrigida is not null and commit_correcao is not null))
);

create index if not exists admin_ajuste_pedidos_fila_idx
  on public.admin_ajuste_pedidos (criado_em) where estado = 'novo';
create index if not exists admin_ajuste_pedidos_peca_idx
  on public.admin_ajuste_pedidos (peca_id, criado_em);

-- Eventos append-only: o recibo de cada transicao, sem repetir o texto do autor.
create table if not exists public.admin_ajuste_eventos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references public.admin_ajuste_pedidos(id),
  estado text not null,
  codigo text not null check (codigo ~ '^[a-z0-9-]{1,60}$'),
  em timestamptz not null default now()
);
create index if not exists admin_ajuste_eventos_pedido_idx
  on public.admin_ajuste_eventos (pedido_id, em);

alter table public.admin_ajuste_pedidos enable row level security;
alter table public.admin_ajuste_eventos enable row level security;
revoke all on public.admin_ajuste_pedidos from public, anon, authenticated;
revoke all on public.admin_ajuste_eventos from public, anon, authenticated;
-- O Supabase da a service_role todos os privilegios por padrao em tabela nova; o
-- revoke explicito e o que torna os eventos append-only e o pedido indelevel.
revoke all on public.admin_ajuste_pedidos from service_role;
revoke all on public.admin_ajuste_eventos from service_role;
grant select, insert, update on public.admin_ajuste_pedidos to service_role;
grant select, insert on public.admin_ajuste_eventos to service_role;
grant usage on sequence public.admin_ajuste_eventos_id_seq to service_role;

-- Texto do autor imutavel; eventos sem update nem delete.
create or replace function public.admin_ajuste_texto_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.texto_original is distinct from old.texto_original
     or new.peca_id is distinct from old.peca_id
     or new.versao_alvo is distinct from old.versao_alvo
     or new.pai is distinct from old.pai then
    raise exception 'pedido de ajuste e imutavel' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists admin_ajuste_texto_imutavel on public.admin_ajuste_pedidos;
create trigger admin_ajuste_texto_imutavel before update on public.admin_ajuste_pedidos
  for each row execute function public.admin_ajuste_texto_imutavel();
revoke all on function public.admin_ajuste_texto_imutavel() from public, anon, authenticated;

-- Claim atomico: devolve vencidos a 'novo' (ou 'precisa-de-atencao' apos 3 tentativas),
-- e entrega no maximo um pedido por chamada. SKIP LOCKED impede dois vigias pegarem o
-- mesmo pedido. Lease de 45 min, igual ao da fila local.
create or replace function public.admin_ajuste_claim(p_agente text)
returns setof public.admin_ajuste_pedidos
language plpgsql security invoker set search_path = '' as $$
declare r public.admin_ajuste_pedidos;
begin
  with vencidos as (
    update public.admin_ajuste_pedidos p
       set estado = case when p.tentativas >= 3 then 'precisa-de-atencao' else 'novo' end,
           lease_id = null, lease_agente = null, lease_inicio = null, lease_expira_em = null
     where p.estado = 'em-correcao' and p.lease_expira_em <= now()
    returning p.id, p.estado)
  insert into public.admin_ajuste_eventos (pedido_id, estado, codigo)
  select id, estado, 'lease-expirado' from vencidos;

  select * into r from public.admin_ajuste_pedidos
   where estado = 'novo' order by criado_em limit 1 for update skip locked;
  if not found then return; end if;

  update public.admin_ajuste_pedidos
     set estado = 'em-correcao', tentativas = tentativas + 1,
         lease_id = gen_random_uuid(), lease_agente = p_agente,
         lease_inicio = now(), lease_expira_em = now() + interval '45 minutes'
   where id = r.id returning * into r;
  insert into public.admin_ajuste_eventos (pedido_id, estado, codigo) values (r.id, r.estado, 'claim');
  return next r;
end $$;
revoke all on function public.admin_ajuste_claim(text) from public, anon, authenticated;
grant execute on function public.admin_ajuste_claim(text) to service_role;
