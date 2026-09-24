-- Dia de fechamento travado em cartao com historico (23/09/2026).
--
-- Decisao do autor em 23/09/2026 (item 3 da lista do Watchtower): bloquear a
-- edicao do dia de fechamento em cartao com compras ou pagamentos, ate o
-- historico da fatura ser preservado. O motivo: `credit_card_invoices` guarda
-- so (card_id, year, month de fechamento), e a janela de cada fatura e
-- recalculada com o closing_day ATUAL. Mudar o fechamento muda para tras quais
-- compras cada fatura paga cobria: fatura quitada vira "parcial", compra ja
-- paga reaparece numa fatura aberta.
--
-- A tela tambem bloqueia, mas a regra nao pode depender so dela (app antigo,
-- outro cliente, chamada direta a API). O trigger recusa com errcode 23514 e
-- hint 'fechamento_bloqueado' (contrato combinado com o Forge).
--
-- So recusa quando o closing_day MUDA de fato: o app manda o valor inalterado
-- em toda edicao de cartao (nome, limite, carteira), e recusar isso bloquearia
-- qualquer edicao. Cartao sem nenhuma compra nem pagamento continua editavel.
-- due_day continua livre (fora da decisao).
--
-- security definer para enxergar todas as linhas do cartao independentemente
-- de RLS; execucao revogada de todos, como os outros triggers internos
-- (20260923220000_restringir_execucao_triggers_internos.sql).

create or replace function public.travar_fechamento_com_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- O app manda o closing_day inalterado em toda edição de cartão (nome,
  -- limite, carteira). Só a mudança de fato é recusada.
  if new.closing_day is distinct from old.closing_day and (
    exists (select 1 from public.transactions t where t.card_id = old.id)
    or exists (select 1 from public.credit_card_invoices i where i.card_id = old.id)
  ) then
    raise exception 'O dia de fechamento não pode mudar em cartão com compras ou pagamentos'
      using errcode = '23514', hint = 'fechamento_bloqueado';
  end if;
  return new;
end;
$$;

revoke all on function public.travar_fechamento_com_historico() from public, anon, authenticated;

drop trigger if exists travar_fechamento_com_historico on public.credit_cards;
create trigger travar_fechamento_com_historico
  before update of closing_day on public.credit_cards
  for each row execute function public.travar_fechamento_com_historico();
