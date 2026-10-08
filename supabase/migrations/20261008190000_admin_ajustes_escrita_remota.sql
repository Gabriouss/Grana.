-- Escrita remota da fila de ajustes (frente C, continuidade de 08/10/2026).
-- Depende de 20261008150000_admin_ajustes_fila.sql (ja aplicada). Ordem de publicacao:
-- esta migration, depois o deploy da Edge Function admin-ajustes.
--
-- - criado_por: quem pediu (auth.users.id do admin). A Edge Function lista so os
--   pedidos do proprio admin. Imutavel, como o texto.
-- - importado_em: quando o vigia da M1 copiou o pedido para a fila local (que e quem
--   entrega ao agente). Nulo = ainda nao importado. O vigia marca DEPOIS de gravar
--   localmente; queda no meio so faz reimportar, e a fila local ignora id repetido.
-- - admin_ajuste_criar: insere pedido + evento numa transacao so, calcula o pai
--   (pedido anterior da mesma peca), recusa acima de 200 pedidos abertos e devolve o
--   pedido existente quando o mesmo autor repete o mesmo texto em 2 minutos.
-- Tudo continua so para service_role; anon/authenticated sem acesso.

alter table public.admin_ajuste_pedidos add column if not exists criado_por uuid;
alter table public.admin_ajuste_pedidos add column if not exists importado_em timestamptz;
create index if not exists admin_ajuste_pedidos_autor_idx
  on public.admin_ajuste_pedidos (criado_por, criado_em desc);
create index if not exists admin_ajuste_pedidos_importar_idx
  on public.admin_ajuste_pedidos (criado_em) where estado = 'novo' and importado_em is null;

create or replace function public.admin_ajuste_texto_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.texto_original is distinct from old.texto_original
     or new.peca_id is distinct from old.peca_id
     or new.versao_alvo is distinct from old.versao_alvo
     or new.pai is distinct from old.pai
     or new.criado_por is distinct from old.criado_por then
    raise exception 'pedido de ajuste e imutavel' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.admin_ajuste_criar(
  p_autor uuid, p_peca text, p_caminho text, p_versao text, p_texto text)
returns table (id uuid, estado text, criado_em timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_pai uuid; v_id uuid; v_estado text; v_criado timestamptz;
begin
  if p_autor is null then raise exception 'autor obrigatorio' using errcode = '22023'; end if;
  -- Serializa as criacoes: sem isto, dois cliques simultaneos passam juntos pela checagem
  -- de repeticao e pelo limite antes de qualquer insert (achado do Harbor, 08/10). O volume
  -- e de um autor, entao uma fila unica nao custa nada.
  perform pg_advisory_xact_lock(hashtext('public.admin_ajuste_criar'));
  -- Repeticao do mesmo pedido em 2 min (duplo clique, ou nova tentativa depois de um
  -- prazo estourado que ja tinha gravado) devolve o pedido existente em vez de duplicar.
  select p.id, p.estado, p.criado_em into v_id, v_estado, v_criado from public.admin_ajuste_pedidos p
   where p.criado_por = p_autor and p.peca_id = p_peca and p.versao_alvo = p_versao
     and p.texto_original = btrim(p_texto) and p.criado_em > now() - interval '2 minutes'
   order by p.criado_em desc limit 1;
  if found then return query select v_id, v_estado, v_criado; return; end if;
  if (select count(*) from public.admin_ajuste_pedidos p
       where p.estado not in ('aceito', 'desatualizado')) >= 200 then
    raise exception 'fila-cheia' using errcode = 'P0001';
  end if;
  select p.id into v_pai from public.admin_ajuste_pedidos p
   where p.peca_id = p_peca order by p.criado_em desc limit 1;
  insert into public.admin_ajuste_pedidos (pai, peca_id, caminho, versao_alvo, texto_original, criado_por)
  values (v_pai, p_peca, p_caminho, p_versao, btrim(p_texto), p_autor)
  returning admin_ajuste_pedidos.id, admin_ajuste_pedidos.estado, admin_ajuste_pedidos.criado_em
    into v_id, v_estado, v_criado;
  insert into public.admin_ajuste_eventos (pedido_id, estado, codigo) values (v_id, v_estado, 'pedido-recebido');
  return query select v_id, v_estado, v_criado;
end $$;
revoke all on function public.admin_ajuste_criar(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_ajuste_criar(uuid, text, text, text, text) to service_role;
