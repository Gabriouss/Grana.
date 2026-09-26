-- Grant de INSERT em `transactions.client_request_id` (25/09/2026).
--
-- Defeito da migration 20260924230000_idempotencia_fila_offline: ela criou a
-- coluna, mas `transactions` só aceita INSERT do usuário em colunas listadas
-- (`revoke insert ... from authenticated` + `grant insert (colunas)`, em
-- supabase/schema.sql, para o cliente não forjar `source`/`source_event_id`).
-- A coluna nova ficou de fora da lista, e todo insert que a leva (o cliente
-- manda a chave a cada lançamento, desde o commit 0398065) morre com
-- "permission denied for table transactions".
--
-- Só INSERT. UPDATE fica de fora de propósito: a chave é gravada uma vez e
-- nunca muda. `bills` não precisa: o INSERT dela é de tabela inteira.
--
-- Efeito no APK antigo: nenhum (ele não manda a chave).
--
-- NÃO APLICADA. Aplicar depende do autor (regra 11 do AGENTS.md).

grant insert (client_request_id) on public.transactions to authenticated;
