-- Somente contagens da própria conta, inclusive sem acesso ao produto.
-- Não altera RLS, o bloqueio ou qualquer dado financeiro.
create or replace function public.resumo_dados_guardados()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'lancamentos', (select count(*) from public.transactions where user_id = v_user),
    'contas', (select count(*) from public.bills where user_id = v_user),
    'cartoes', (select count(*) from public.credit_cards where user_id = v_user),
    'metas', (select count(*) from public.goals where user_id = v_user)
  );
end;
$$;
revoke all on function public.resumo_dados_guardados() from public, anon;
grant execute on function public.resumo_dados_guardados() to authenticated;
