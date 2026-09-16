-- A exclusão de auth.users apaga as carteiras por cascata. A carteira Principal
-- continua protegida contra DELETE direto, mas não pode impedir o encerramento
-- completo da conta, que é uma operação administrativa explícita.
create or replace function public.reatribuir_wallet_antes_de_excluir()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  principal_id uuid;
begin
  if old.is_default then
    -- No DELETE direto, a proteção permanece. Durante a cascata disparada pela
    -- remoção de auth.users, o gatilho pai já está ativo e a profundidade é > 1.
    if pg_trigger_depth() <= 1 then
      raise exception 'A carteira Principal não pode ser excluída';
    end if;
    return old;
  end if;

  select w.id
    into principal_id
    from public.wallets w
   where w.user_id = old.user_id
     and w.is_default
     and w.id <> old.id
   order by w.created_at asc, w.id asc
   limit 1;

  if principal_id is null then
    raise exception 'Usuário sem carteira Principal para receber os dados';
  end if;

  update public.transactions set wallet_id = principal_id
   where user_id = old.user_id and wallet_id = old.id;
  update public.credit_cards set wallet_id = principal_id
   where user_id = old.user_id and wallet_id = old.id;
  update public.bills set wallet_id = principal_id
   where user_id = old.user_id and wallet_id = old.id;
  update public.goals set wallet_id = principal_id
   where user_id = old.user_id and wallet_id = old.id;
  update public.credit_card_invoices set wallet_id = principal_id
   where user_id = old.user_id and wallet_id = old.id;
  update public.whatsapp_pending set wallet_id = principal_id
   where user_id = old.user_id and wallet_id = old.id;

  return old;
end;
$$;
