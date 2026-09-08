-- A carteira "Total" é uma visão agregada. Registros financeiros precisam
-- sempre apontar para uma carteira real; quando a chamada não informar uma,
-- usamos a Principal/default do próprio usuário.

begin;
set local statement_timeout = '30s';

do $$
begin
  if exists (
    select 1
    from public.wallets
    where is_default
    group by user_id
    having count(*) <> 1
  ) then
    raise exception 'Não foi possível garantir uma Principal única por usuário';
  end if;
end;
$$;

create unique index if not exists wallets_one_default_per_user_idx
  on public.wallets (user_id)
  where is_default;

create or replace function public.preencher_wallet_padrao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.wallet_id is null then
    select w.id
      into new.wallet_id
      from public.wallets w
     where w.user_id = new.user_id
       and w.is_default
     order by w.created_at asc, w.id asc
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists preencher_wallet_transactions on public.transactions;
create trigger preencher_wallet_transactions
  before insert or update of wallet_id, user_id on public.transactions
  for each row execute procedure public.preencher_wallet_padrao();

drop trigger if exists preencher_wallet_credit_cards on public.credit_cards;
create trigger preencher_wallet_credit_cards
  before insert or update of wallet_id, user_id on public.credit_cards
  for each row execute procedure public.preencher_wallet_padrao();

drop trigger if exists preencher_wallet_bills on public.bills;
create trigger preencher_wallet_bills
  before insert or update of wallet_id, user_id on public.bills
  for each row execute procedure public.preencher_wallet_padrao();

drop trigger if exists preencher_wallet_goals on public.goals;
create trigger preencher_wallet_goals
  before insert or update of wallet_id, user_id on public.goals
  for each row execute procedure public.preencher_wallet_padrao();

drop trigger if exists preencher_wallet_invoices on public.credit_card_invoices;
create trigger preencher_wallet_invoices
  before insert or update of wallet_id, user_id on public.credit_card_invoices
  for each row execute procedure public.preencher_wallet_padrao();

drop trigger if exists preencher_wallet_whatsapp_pending on public.whatsapp_pending;
create trigger preencher_wallet_whatsapp_pending
  before insert or update of wallet_id, user_id on public.whatsapp_pending
  for each row execute procedure public.preencher_wallet_padrao();

-- Excluir uma carteira criada pelo usuário nunca pode transformar seus dados
-- em registros órfãos. O app já impede apagar Principal; esta guarda também
-- cobre chamadas diretas e integrações administrativas.
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
    raise exception 'A carteira Principal não pode ser excluída';
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

drop trigger if exists reatribuir_wallet_antes_de_excluir on public.wallets;
create trigger reatribuir_wallet_antes_de_excluir
  before delete on public.wallets
  for each row execute procedure public.reatribuir_wallet_antes_de_excluir();

-- Corrige também os dados históricos dos usuários que já existiam antes da
-- regra. Cada UPDATE é idempotente e só toca registros sem carteira.
update public.transactions t
   set wallet_id = w.id
  from public.wallets w
 where t.user_id = w.user_id and w.is_default and t.wallet_id is null;

update public.credit_cards c
   set wallet_id = w.id
  from public.wallets w
 where c.user_id = w.user_id and w.is_default and c.wallet_id is null;

update public.bills b
   set wallet_id = w.id
  from public.wallets w
 where b.user_id = w.user_id and w.is_default and b.wallet_id is null;

update public.goals g
   set wallet_id = w.id
  from public.wallets w
 where g.user_id = w.user_id and w.is_default and g.wallet_id is null;

update public.credit_card_invoices i
   set wallet_id = w.id
  from public.wallets w
 where i.user_id = w.user_id and w.is_default and i.wallet_id is null;

update public.whatsapp_pending p
   set wallet_id = w.id
  from public.wallets w
 where p.user_id = w.user_id and w.is_default and p.wallet_id is null;

commit;
