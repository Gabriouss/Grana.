-- PROPOSTA, AINDA NAO APLICADA EM PRODUCAO (sondado em 04/10/2026: o efeito
-- abaixo nao existe la; excluir cartao ainda deixa a compra com card_id nulo).
-- Nao aplicar sem: (1) decisao do autor, PENDENTE: excluir cartao deve apagar o
-- historico de compras dele? (2) revisao de dinheiro (Lynx/Watchtower);
-- (3) aviso ao Claude Code com o plano exato; (4) regra 11 do AGENTS.md.
--
-- Excluir cartao leva as compras dele junto (V24, 04/10/2026).
--
-- Brecha provada em 04/10 na conta de teste: criar cartao, lancar compra no
-- credito, excluir o cartao deixa a compra no banco com payment_method =
-- 'credit' e card_id = null (transactions.card_id e "on delete set null").
-- Nenhuma tela do Credito mostra essa compra (tudo e agrupado por cartao), mas
-- parcelas dela continuam em lib/projections.ts ("Comprometimento futuro"),
-- sem como o usuario apagar.
--
-- DECISAO DE PRODUTO PENDENTE (autor): apagar historico de compra junto com o
-- cartao e destrutivo. Esta migration so vale se o autor escolher "excluir
-- cartao apaga as compras". Alternativa: manter como esta e esconder orfas na
-- projecao. O app ja avisa a exclusao em AppDialog; conferir o texto.
--
-- Cliente antigo tolera: o DELETE do cartao continua devolvendo sucesso, so
-- apaga mais linhas. Nao ha excecao nem erro novo para o cliente. ATENCAO ao
-- contrario do caae4c0: la o gatilho de INSERT devolvia NULL para pular linha
-- sem derrubar o lote; aqui o gatilho e BEFORE DELETE e DEVE devolver OLD,
-- porque NULL cancelaria a exclusao do cartao em silencio.
--
-- Regra 20: nao toca saldo nem Livre para gastar. Compra no credito ja fica
-- fora do caixa; so a saida do pagamento da fatura (payment_method nao credit,
-- fora do filtro abaixo) conta, e ela permanece.
-- Regra 11: e migration, nao Edge Function; sem verify_jwt. Antes de aplicar,
-- conferir no servidor que o gatilho ainda nao existe (pg_trigger) e guardar o
-- estado atual. Orfas ja existentes NAO sao tocadas aqui (ver consulta
-- no fim, a rodar so com ordem do autor).
--
-- APLICAR so apos revisao do Lynx/Watchtower (dinheiro) e pedido do autor.

create or replace function public.apagar_compras_do_cartao_excluido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.transactions
   where card_id = old.id
     and user_id = old.user_id
     and payment_method = 'credit';
  return old;
end;
$$;

revoke all on function public.apagar_compras_do_cartao_excluido() from public, anon, authenticated;

drop trigger if exists apagar_compras_do_cartao_excluido on public.credit_cards;
create trigger apagar_compras_do_cartao_excluido
  before delete on public.credit_cards
  for each row execute function public.apagar_compras_do_cartao_excluido();

-- Orfas ja gravadas (so contar; NAO apagar sem ordem):
--   select user_id, count(*) from public.transactions
--    where payment_method = 'credit' and card_id is null group by user_id;
