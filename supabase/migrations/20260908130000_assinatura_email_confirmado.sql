-- Não vincula automaticamente uma compra a uma conta cujo e-mail ainda não
-- foi confirmado. O link por token continua sendo o caminho explícito para
-- compra feita com e-mail diferente do cadastro.
create or replace function public.vincular_assinatura_automatica()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_confirmed_at timestamptz;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select u.email, u.email_confirmed_at
    into v_email, v_confirmed_at
  from auth.users u
  where u.id = v_user;

  if v_email is null or v_confirmed_at is null then
    return;
  end if;

  update public.subscriptions s
  set user_id = v_user,
      activated_at = coalesce(s.activated_at, statement_timestamp()),
      activation_token_hash = null,
      activation_expires_at = null,
      updated_at = statement_timestamp()
  where s.user_id is null and lower(s.email_compra) = lower(v_email);
end;
$$;

revoke all on function public.vincular_assinatura_automatica() from public, anon;
grant execute on function public.vincular_assinatura_automatica() to authenticated;
