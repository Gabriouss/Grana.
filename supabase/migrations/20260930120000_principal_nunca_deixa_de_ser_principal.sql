-- A carteira Principal nunca deixa de ser a Principal (decisao do autor de
-- 29/09/2026: "carteira principal nao deve ser excluida nunca").
--
-- O gatilho de DELETE ja recusa excluir a linha com is_default. Mas a policy
-- "wallets: dono com acesso" (FOR ALL) e o grant de UPDATE deixam o proprio
-- usuario, com o JWT dele e sem passar pela tela, mandar
-- PATCH /wallets?id=eq.<principal> {"is_default": false}. Dali saem dois
-- estragos: (1) a conta fica sem Principal, e preencher_wallet_padrao deixa
-- wallet_id nulo nos lancamentos novos; (2) promove-se outra carteira e a
-- antiga Principal, ja "comum", passa pelo gatilho de DELETE e some.
-- A tela nao faz isso (WalletPickerModal so envia name e color), entao a
-- trava fica no banco.
--
-- Gatilho em vez de grant por coluna: o grant por coluna em transactions ja
-- quebrou com coluna nova (20260925030000); um gatilho nao depende da lista.
-- Promover outra carteira (false -> true) continua barrado pelo indice
-- wallets_one_default_per_user_idx enquanto a Principal existir.
-- A exclusao da conta inteira (cascata de auth.users) nao faz UPDATE em
-- is_default, entao nao e afetada.
-- Trocar qual carteira e a Principal passa a exigir decisao do autor e uma
-- migration propria; nao ha atalho de manutencao previsto aqui.
--
-- ASCII de proposito (licao do T-UTF8): os acentos da mensagem saem de chr().

create or replace function public.proteger_wallet_principal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.is_default and new.is_default is distinct from true then
    raise exception using
      errcode = 'check_violation',
      message = 'A carteira Principal n' || chr(227) || 'o pode deixar de ser a Principal';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_wallet_principal()
  from public, anon, authenticated;

drop trigger if exists proteger_wallet_principal on public.wallets;
create trigger proteger_wallet_principal
  before update of is_default on public.wallets
  for each row execute procedure public.proteger_wallet_principal();
