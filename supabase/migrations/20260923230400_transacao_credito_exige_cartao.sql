-- Credito sem cartao recusado em TODA entrada, no banco (23/09/2026).
--
-- Decisao 4 do autor: "Lancamentos no credito nunca podem ser lancados sem
-- selecionar um cartao." A RPC da voz (20260923230300) cobre voz, widget e
-- Granabo; este trigger cobre o resto: formulario (insert direto pelo
-- PostgREST), `adicionar_compra_parcelada`, importacao de extrato,
-- `registrar_lancamento_whatsapp` e qualquer cliente antigo ou chamada direta.
-- Mesmo contrato: errcode 23514, hint 'cartao_obrigatorio'.
--
-- So INSERT. Orfaos ja gravados (cartao excluido: a FK poe card_id = null)
-- continuam editaveis e exclusiveis, e excluir cartao continua funcionando.
-- Unica excecao no INSERT: continuacao de serie recorrente cuja cabeca ja e
-- orfa (ver comentario no corpo). Se essas series devem parar, e decisao do
-- app, nao do banco.
--
-- APLICAR JUNTO COM O APK NOVO, NUNCA ANTES. Levantamento dos caminhos e do
-- que cada um faz ao receber 23514 no roteiro de aplicacao
-- (E:\Grana-temporarios\credito-ciclo\harbor-aplicacao.md, fora do repo) e
-- no context.md.

create or replace function public.exigir_cartao_no_credito()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_method = 'credit' and new.card_id is null
     -- Continuacao de serie orfa (cartao excluido depois): a geracao de
     -- recorrencias copia payment_method e card_id da cabeca e manda todas as
     -- series num lote so. Recusar aqui derrubaria o lote inteiro, em
     -- silencio, e nenhuma serie do usuario geraria mais nada.
     and not (
       new.parent_id is not null
       and exists (
         select 1 from public.transactions p
         where p.id = new.parent_id
           and p.user_id = new.user_id
           and p.payment_method = 'credit'
           and p.card_id is null
       )
     ) then
    raise exception 'Lancamento no credito exige cartao'
      using errcode = '23514', hint = 'cartao_obrigatorio';
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_cartao_no_credito() from public, anon, authenticated;

drop trigger if exists exigir_cartao_no_credito on public.transactions;
create trigger exigir_cartao_no_credito
  before insert on public.transactions
  for each row execute function public.exigir_cartao_no_credito();
