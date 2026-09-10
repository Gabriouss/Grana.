-- `publicar_app_release` recusava o link permanente do APK.
--
-- A guarda de origem foi escrita quando `apk_url` era sempre um artefato do
-- EAS, e é uma lista branca: qualquer coisa fora de `https://expo.dev/`
-- levanta 22023. Em 09/09/2026 o webhook passou a gravar o link PERMANENTE
-- (`https://granaponto.com.br/downloads/grana-latest.apk`, commit 4c9dcdc),
-- porque o artefato do EAS vence em trinta dias e o vencimento tinha modo de
-- falha silencioso: quem estava numa build sem a URL estável embutida parava
-- de receber o aviso de atualização.
--
-- O chamador mudou, a guarda não. E o defeito não apareceu na hora porque a
-- 1.8.4 foi gravada direto por SQL, sem passar pela função. Ele só se
-- manifestou na PRIMEIRA build seguinte, a 1.9.0 de 10/09/2026: o EAS tentou
-- entregar o webhook sete vezes, todas recusadas com 22023, e `app_release`
-- ficou parada na versão anterior. Ninguém seria avisado da atualização, que
-- é exatamente o que a regra 5 do AGENTS.md existe para impedir.
--
-- A guarda continua sendo lista branca, de propósito. Ela não é burocracia:
-- `apk_url` é para onde o aplicativo manda a pessoa baixar um instalador, e
-- um webhook forjado que conseguisse gravar um endereço arbitrário ali
-- transformaria o aviso de atualização em vetor de distribuição de APK. O que
-- muda é que a lista passa a ter as duas origens legítimas.

begin;

create or replace function public.publicar_app_release(
  p_version text,
  p_apk_url text,
  p_expires_at timestamptz default null,
  p_notes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_new_parts integer[];
  v_old_parts integer[];
begin
  -- Duas origens, as duas nossas: o artefato do EAS (que vence) e o endereço
  -- permanente servido pelo site, que redireciona para a release do GitHub.
  if p_version !~ '^\d+\.\d+\.\d+(?:\.\d+)?$'
     or (p_apk_url !~ '^https://expo\.dev/'
         and p_apk_url !~ '^https://(www\.)?granaponto\.com\.br/') then
    raise exception 'Release inválida' using errcode = '22023';
  end if;

  insert into public.app_release (id, version, apk_url, apk_expires_at, notes)
  values (1, p_version, p_apk_url, p_expires_at, p_notes)
  on conflict (id) do nothing;

  select r.version into v_current
  from public.app_release r where r.id = 1
  for update;

  v_new_parts := string_to_array(p_version, '.')::integer[];
  v_old_parts := string_to_array(v_current, '.')::integer[];
  v_new_parts := v_new_parts || array_fill(0, array[4 - cardinality(v_new_parts)]);
  v_old_parts := v_old_parts || array_fill(0, array[4 - cardinality(v_old_parts)]);

  if v_new_parts <= v_old_parts then return 'older'; end if;

  update public.app_release
  set version = p_version,
      apk_url = p_apk_url,
      apk_expires_at = p_expires_at,
      notes = p_notes,
      updated_at = statement_timestamp()
  where id = 1;
  return 'updated';
end;
$$;

revoke all on function public.publicar_app_release(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.publicar_app_release(text, text, timestamptz, text) to service_role;

commit;
