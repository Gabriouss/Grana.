-- Total de entradas por carteira, de todo o período (25/09/2026).
--
-- Decisão do autor (regra 20 do AGENTS.md): o seletor de carteira deixa de
-- mostrar saldo. Mostra, para cada carteira, o total de TODAS as entradas de
-- todo o período, sem descontar saídas, com um rótulo que não diz "saldo". O
-- "saldo" do app é só do mês vigente, e o campo de saldo inicial sai da tela.
--
-- A Início só baixa os lançamentos que usa; o histórico inteiro de entradas
-- vem daqui, somado no banco. O cliente soma a isso as entradas que ainda
-- estão na fila offline (`juntarPendentes`).
--
-- Entrada de caixa: `type = 'in'` fora do cartão. Estorno no cartão (`in` com
-- `card_id` ou `payment_method = 'credit'`) abate a fatura e não é dinheiro
-- que entrou na carteira, pela mesma regra de caixa de todo o app
-- (`isCreditTx`, `_shared/caixa.ts`). `wallet_id` nulo volta como uma linha
-- com carteira nula; o cliente a atribui à carteira padrão, como já faz com
-- `saldos_por_carteira`.
--
-- SECURITY DEFINER com search_path vazio, como as outras RPCs: por isso filtra
-- o dono e confere o direito de acesso explicitamente (a RLS de leitura de
-- `transactions` exige `tem_direito_acesso()`). `saldos_por_carteira` fica no
-- banco, sem uso novo: o APK antigo continua chamando.
--
-- NÃO APLICADA. Aplicar antes de qualquer app que chame a função.

create or replace function public.entradas_por_carteira()
returns table (wallet_id uuid, entradas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not public.tem_direito_acesso() then
    raise exception 'Acesso não autorizado' using errcode = '42501';
  end if;

  return query
  select t.wallet_id, sum(t.amount)::numeric as entradas
  from public.transactions t
  where t.user_id = v_user
    and t.type = 'in'
    and coalesce(t.payment_method, '') <> 'credit'
    and t.card_id is null
  group by t.wallet_id;
end;
$$;

comment on function public.entradas_por_carteira() is
  'Total de entradas de caixa por carteira, de todo o período (sem saídas, sem estorno no cartão). Rótulo do seletor de carteira; não é saldo (regra 20).';

revoke all on function public.entradas_por_carteira() from public, anon;
grant execute on function public.entradas_por_carteira() to authenticated;
