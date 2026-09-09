-- Remove a funcao antiga, DEPOIS que os webhooks ja chamam a nova.
--
-- Separada da 20260909170000 por causa da ordem de implantacao. Migration e
-- deploy de Edge Function sao dois passos distintos neste projeto, e entre um
-- e outro existe uma janela:
--
--   * apagar a funcao ANTES de publicar os webhooks derruba a cobranca da
--     Kiwify em producao, porque a versao no ar ainda chama
--     `processar_evento_kiwify`;
--   * publicar os webhooks antes de criar a funcao nova quebra igual, pelo
--     motivo inverso.
--
-- Por isso a ordem correta e: rodar a 20260909170000 (cria a nova, mantem a
-- antiga), publicar `kiwify-webhook` e `cakto-webhook`, confirmar uma cobranca
-- real de cada lado, e so entao rodar esta.

drop function if exists public.processar_evento_kiwify(text, text, text, timestamptz, text, text, text, text, timestamptz);
