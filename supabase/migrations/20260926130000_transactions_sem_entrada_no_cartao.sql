-- Entrada no cartão não existe no Grana. Decisão do autor em 26/09/2026:
-- "Não é para ter entrada de crédito no cartão" e "Remova tudo que for
-- relacionado a estorno do aplicativo". Lançamento errado no cartão se
-- exclui; não se compensa com uma entrada.
--
-- Conferido em produção em 26/09/2026, só leitura: ZERO linhas com
-- type = 'in' e card_id preenchido ou payment_method = 'credit', em qualquer
-- conta. A restrição nasce válida sem apagar nada.
--
-- NÃO APLICAR antes de o app parar de gerar essas linhas. Até a 1.10.4, a
-- importação de extrato de cartão (components/ImportarExtratoModal.tsx) põe
-- card_id e payment_method = 'credit' em TODAS as linhas do arquivo, inclusive
-- as de crédito ("pagamento recebido", devolução), e o lote inteiro seria
-- recusado com 23514. A correção do app é do Forge (26/09/2026). Aplicar só
-- com ela publicada, e com decisão do autor sobre quem continua na versão
-- antiga (regra 11, autorização no dia da build).

alter table public.transactions
  add constraint transactions_entrada_nunca_no_cartao
    check (type <> 'in' or (card_id is null and payment_method is distinct from 'credit'));
