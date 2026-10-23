-- Stories no Facebook (autor, 23/10/2026): a Page Stories API tem criacao e leitura de volta
-- (https://developers.facebook.com/docs/page-stories-api/). Tira so a exclusao facebook+stories
-- das duas funcoes; o resto e a definicao vigente em producao (snapshot bruto Beacon 22h45, nao
-- redefinidas em 20261022120000). create or replace preserva owner, grants e search_path.
begin;
CREATE OR REPLACE FUNCTION public.admin_marketing_real_midia_compativel(p_dados jsonb, p_rede text, p_formato text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare n integer;
begin
  if p_rede is null or p_rede not in ('instagram','facebook')
    or p_formato is null or p_formato not in ('feed','carrossel','reels','stories')
    or jsonb_typeof(p_dados->'midias') is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(p_dados->'midias');
  if n not between 1 and 10 or (p_formato='carrossel' and n<2)
    or (p_formato<>'carrossel' and n<>1) then return false; end if;
  if exists(select 1 from jsonb_array_elements(p_dados->'midias') m
    where not coalesce((m->>'tipo'='imagem' and m->>'mime' in ('image/jpeg','image/png'))
      or (m->>'tipo'='video' and m->>'mime'='video/mp4'),false)) then return false; end if;
  if (p_formato='feed' and p_dados->'midias'->0->>'tipo'<>'imagem')
    or (p_formato='reels' and p_dados->'midias'->0->>'tipo'<>'video') then return false; end if;
  if p_rede='facebook' and p_formato='carrossel'
    and exists(select 1 from jsonb_array_elements(p_dados->'midias') m where m->>'tipo'<>'imagem')
    then return false; end if;
  if p_rede='instagram' and (exists(select 1 from jsonb_array_elements(p_dados->'midias') m
    where m->>'tipo'='imagem' and m->>'mime'<>'image/jpeg')
    or (p_formato='reels' and p_dados->'capa' is not null and p_dados->'capa'<>'null'::jsonb
      and p_dados->'capa'->>'mime' is distinct from 'image/jpeg')) then return false; end if;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_marketing_real_elegibilidade_v2(p_admin uuid, p_snapshot uuid, p_destino jsonb, p_estimar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare s public.admin_marketing_real_snapshots; c public.admin_marketing_real_contas;
  ctl public.admin_marketing_controles; motivos jsonb:='[]'; f text:=p_destino->>'formato';
  n integer; ticks integer; segundos integer; pendentes integer;
begin
  select * into s from public.admin_marketing_real_snapshots where id=p_snapshot and admin_id=p_admin;
  if not found then raise exception 'snapshot-inexistente'; end if;
  select * into c from public.admin_marketing_real_contas where id=(p_destino->>'contaId')::uuid;
  if not found then raise exception 'conta-indisponivel'; end if;
  select * into ctl from public.admin_marketing_controles where id;
  if s.estado<>'pronto' then motivos:=motivos||'"snapshot-indisponivel"'; end if;
  if not public.admin_marketing_real_editorial_valido_v2(p_admin,s.dados) then motivos:=motivos||'"revisao-editorial-pendente"'; end if;
  if not ctl.habilitado or ctl.recuperacao_pendente or ctl.capacidade_validada_em is null or ctl.capacidade_validada_em<now()-interval '1 day'
    or ctl.margem_validada_ate is null or ctl.margem_validada_ate<=now() then motivos:=motivos||'"operacao-bloqueada"'; end if;
  if ctl.pausa_global or c.pausada or (c.rede='facebook' and ctl.pausa_facebook) or (c.rede='instagram' and ctl.pausa_instagram) then motivos:=motivos||'"operacao-pausada"'; end if;
  if c.conexao<>'verificada' or c.valida_ate is null or c.valida_ate<=now() then motivos:=motivos||'"conta-indisponivel"'; end if;
  if not exists(select 1 from jsonb_array_elements(c.capacidades) k where k->>'formato'=f and k->>'estado'='disponivel'
    and (not(p_destino ? 'capacidadeRevisao') or k->>'revisao'=p_destino->>'capacidadeRevisao')) then motivos:=motivos||'"capacidade-nao-comprovada"'; end if;
  if p_destino ? 'contaRevisao' and p_destino->>'contaRevisao'<>c.revisao::text then motivos:=motivos||'"conta-indisponivel"'; end if;
  n:=jsonb_array_length(s.dados->'midias');
  if f not in ('feed','carrossel','reels','stories') or (f='carrossel' and n not between 2 and 10) or (f<>'carrossel' and n<>1)
    or (f='feed' and s.dados->'midias'->0->>'tipo'<>'imagem') or (f='reels' and s.dados->'midias'->0->>'tipo'<>'video')
    or (c.rede='facebook' and f='carrossel' and exists(select 1 from jsonb_array_elements(s.dados->'midias') m where m->>'tipo'<>'imagem')) then motivos:=motivos||'"midia-incompativel"'; end if;
  if c.rede='instagram' and (exists(select 1 from jsonb_array_elements(s.dados->'midias') m where m->>'tipo'='imagem' and (m->>'mime'<>'image/jpeg' or (m->>'bytes')::bigint>8388608))
    or (f='reels' and s.dados->'capa'->>'mime' is not null and s.dados->'capa'->>'mime'<>'image/jpeg')) then motivos:=motivos||'"midia-incompativel"'; end if;
  if p_destino->>'fuso'<>'America/Sao_Paulo' or (p_destino->>'publicarEm')::timestamptz<=now() then motivos:=motivos||'"horario-invalido"'; end if;
  -- Estimativa interna conservadora: uma etapa por tick de minuto, três jobs por
  -- rodada. Não é quota nem garantia de latência Meta; será calibrada no piloto.
  select count(*) into pendentes from public.admin_marketing_agendamentos where snapshot_id is not null and estado in ('programado-no-painel','preparando') and not pausado;
  ticks:=case when c.rede='instagram' then n*2+case when f='carrossel' then 2 else 0 end else n end;
  segundos:=(ticks+2+ceil(pendentes/3.0)::integer)*60;
  if p_estimar and (p_destino->>'publicarEm')::timestamptz<now()+make_interval(secs=>segundos) then motivos:=motivos||'"antecedencia-insuficiente"'; end if;
  return jsonb_build_object('estado',case when jsonb_array_length(motivos)=0 then 'pronto' else 'bloqueado' end,'motivos',motivos,'preparoEstimadoSegundos',segundos);
end $function$;

commit;
