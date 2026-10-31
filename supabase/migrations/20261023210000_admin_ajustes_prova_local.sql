-- Aditiva: conserva provas por commit e os privilegios/RLS existentes.
begin;
alter table public.admin_ajuste_pedidos add column if not exists prova_correcao jsonb;


-- Mesmo contrato textual de Node/Edge; valida sem transformar o valor original.
create or replace function public.admin_ajuste_caminho_valido(caminho text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare partes text[]; segmento text; i int; estrela int;
begin
  if caminho is null or char_length(caminho) > 400 or left(caminho,15) <> 'docs/marketing/'
    or caminho <> normalize(caminho,NFKC) or strpos(caminho,chr(92)) > 0
    or caminho ~ '[[:cntrl:]]' or caminho ~ U&'[\007F-\009F]' or caminho ~ '[:<>"|?]' then return false; end if;
  partes := string_to_array(caminho,'/');
  for i in 1..cardinality(partes) loop
    segmento := partes[i];
    if segmento = '' or left(segmento,1) = '.' or segmento ~ '[. ]$'
      or segmento ~* '^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)' or segmento ~ '~[0-9]' then return false; end if;
    estrela := strpos(segmento,'*');
    if estrela > 0 and not (i = cardinality(partes) and estrela > 1 and estrela = char_length(segmento)
      and strpos(substring(segmento from estrela+1),'*') = 0) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.admin_ajuste_caminho_valido(text) from public, anon, authenticated;
grant execute on function public.admin_ajuste_caminho_valido(text) to service_role;

create or replace function public.admin_ajuste_prova_local_valida(
  p jsonb, pedido uuid, peca text, caminho text, anterior text, corrigida text
) returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare k text; chave text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p)) <> 9 then return false; end if;
  foreach k in array array['tipo','pedidoId','pecaId','caminho','versaoAnterior','versaoCorrigida','anteriorSha256','atualSha256','reciboSha256'] loop
    if jsonb_typeof(p->k) is distinct from 'string' then return false; end if;
  end loop;
  if p->>'tipo' <> 'historico-local-v1' or p->>'pedidoId' <> pedido::text
    or p->>'pecaId' <> peca or p->>'caminho' <> caminho
    or p->>'versaoAnterior' <> anterior or p->>'versaoCorrigida' is distinct from corrigida
    or anterior = corrigida or anterior !~ '^[0-9a-f]{40}$' or corrigida !~ '^[0-9a-f]{40}$'
    or peca !~ '^[0-9a-f]{16}$' or not public.admin_ajuste_caminho_valido(caminho) then return false; end if;
  foreach k in array array['anteriorSha256','atualSha256','reciboSha256'] loop
    if p->>k !~ '^[0-9a-f]{64}$' then return false; end if;
  end loop;
  chave := concat_ws(E'\n', 'grana-ajuste-local-v1',p->>'pedidoId',p->>'pecaId',p->>'caminho',
    p->>'versaoAnterior',p->>'versaoCorrigida',p->>'anteriorSha256',p->>'atualSha256');
  return coalesce(encode(sha256(convert_to(chave,'UTF8')),'hex') = p->>'reciboSha256', false);
end $$;
revoke all on function public.admin_ajuste_prova_local_valida(jsonb,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_ajuste_prova_local_valida(jsonb,uuid,text,text,text,text) to service_role;

alter table public.admin_ajuste_pedidos drop constraint if exists prova_local_coerente;
alter table public.admin_ajuste_pedidos add constraint prova_local_coerente check (
  prova_correcao is null or (commit_correcao is null and
    public.admin_ajuste_prova_local_valida(prova_correcao,id,peca_id,caminho,versao_alvo,versao_corrigida)));
alter table public.admin_ajuste_pedidos drop constraint if exists correcao_coerente;
alter table public.admin_ajuste_pedidos add constraint correcao_coerente check (
  estado not in ('corrigido-aguardando-aceite','aceito') or
  (versao_corrigida is not null and (commit_correcao is not null or prova_correcao is not null)));
commit;
