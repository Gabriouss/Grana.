-- Fronteira agregada para o bloco "Contas" do /admin (admin-consulta).
--
-- A Edge Function nao lista usuarios para contar: chama esta funcao, que devolve SO
-- tres numeros (total, novas em 7 dias, novas em 30 dias) e nenhuma linha, e-mail ou
-- id. Sem argumento, para nao abrir filtro controlado por quem chama; a janela usa o
-- relogio do banco.
--
-- security definer porque auth.users nao e legivel por service_role pela API; o
-- search_path vazio e os nomes qualificados impedem sequestro de objeto. Execute so
-- para service_role (a funcao valida Auth, allowlist, aal2 e TOTP antes de chamar).
--
-- Conta "conta" = usuario nao apagado (deleted_at nulo) e nao anonimo.

create or replace function public.admin_contar_contas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'novas7d', count(*) filter (where u.created_at >= now() - interval '7 days'),
    'novas30d', count(*) filter (where u.created_at >= now() - interval '30 days')
  )
  from auth.users u
  where u.deleted_at is null
    and not coalesce(u.is_anonymous, false);
$$;

revoke all on function public.admin_contar_contas() from public, anon, authenticated;
grant execute on function public.admin_contar_contas() to service_role;
