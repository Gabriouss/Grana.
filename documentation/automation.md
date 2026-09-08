# Automações e provedores

## Granabô

- Gatilho: pergunta POST autenticada em assistente-financeiro.
- Ferramentas: somente o catálogo declarado em TOOLS.
- Dados: user_id do JWT, pergunta, histórico fornecido e resultados filtrados
  pelo próprio usuário.
- Guardas fora do prompt: RLS, whitelist de ferramentas, validação de
  argumentos, limite de prazo, rate limit em memória e quota SQL persistente.
- Efeito: leitura financeira, gravação de histórico e memória permitida.
- Falhas: código HTTP estável, mensagem amigável e log sem texto financeiro.

## Voz

- Gatilho: áudio multipart autenticado do app/widget ou fluxo do WhatsApp.
- Provedores: Groq primeiro, OpenAI como fallback.
- Guardas: JWT, MIME allowlist, limite de bytes, quota, timeout e interpretação
  determinística de carteira/cartão/categoria.
- Efeito: somente a RPC de operação de voz grava dados financeiros atomizados.

## Kiwify e WhatsApp

Webhooks são disparados por provedores externos e não podem escolher user_id
arbitrário. O Kiwify usa segredo no header e idempotência por evento. O
WhatsApp exige segredo/assinatura Meta, pareamento e resolução de nomes do
usuário; falhas retornam recibo ao remetente.
