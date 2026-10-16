# Semana 42 · 2026-10-12 a 2026-10-18

Mês-pai 2026-10: a quinta-feira é 2026-10-15. Semana aberta em 13/10/2026 para registrar o Reel publicado em 12/10/2026 (data de publicação, regra 25).

## Peças e estado

| Peça | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [grana-reels-notificacao-1.mp4](aprovados/pecas/reels/grana-reels-notificacao-1.mp4) | Reel da padaria, "versão curta com a notificação na tela" (16,8 s) do roteiro `2026-09/semana-39-2026-09-21-a-2026-09-27/apoio/briefings/reels/2026-09-25-reels-widget-padaria.md`. Cópia do arquivo da raiz do vault (`Gabriel/Grana/grana-reels-notificacao-1.mp4`), que continua lá; SHA-1 `95eee60e2de891b8ac83043f16c7d275aef1b1b3`, igual nos dois lugares. Revisão **vigente** da família `R-P` em `docs/marketing/painel/familias.json` | Decisão do autor em 12/10/2026 16:59 ("o correto é esse aqui") e em 13/10/2026 20:20: esta é a versão correta da família, e o `2026-09/semana-39-.../para-aprovacao/pecas/reels/grana-reels-v8-pop.mp4` passa a ser revisão superada; o aceite do v8-pop de 07/10/2026 10:31:32 fica só no histórico e não vale para publicação. **Aceite do autor em 13/10/2026**, citação literal: "É a versão correta e já foi publicada no perfil do instagram (verificar utilizando API da META)"; vale como aceite datado desta versão (regra 25; decisão do Supremo, 14/10) | Publicado no Instagram em 12/10/2026 ~17:01 (mídia `18132974281756527`), com a capa [grana-reels-v8-pop-capa-1080x1920.png](../semana-41-2026-10-05-a-2026-10-11/aprovados/grana-reels-v8-pop-capa-1080x1920.png), que o registro de famílias vincula a este Reel. Publicação feita fora do painel, antes do dia D; a conferência pela API da Meta não foi feita (token vencido em 12/10) |

## Aceite do autor

- 13/10/2026: aceite do autor de `aprovados/pecas/reels/grana-reels-notificacao-1.mp4` (SHA-1 `95eee60e2de891b8ac83043f16c7d275aef1b1b3`), na frase literal: "É a versão correta e já foi publicada no perfil do instagram (verificar utilizando API da META)". A conferência pela API da Meta pedida na mesma frase não foi feita (token vencido em 12/10). Repassada pelo Orquestrador Supremo em 14/10/2026 (decisão C2 da conferência do Flare). É a evidência datada que sustenta o arquivo em `aprovados` (regra 25). Aceite não é publicação; a publicação de 12/10 aconteceu antes deste registro.
- 14/10/2026: **aceite composto derivado de aceites separados** para este Reel com a capa `../semana-41-2026-10-05-a-2026-10-11/aprovados/grana-reels-v8-pop-capa-1080x1920.png` (versão composta `d2291cb48d01`): vídeo aceito em 13/10/2026 (citação acima) e capa aceita em 11/10/2026 23:20:41 (versão `19d81da7338b`). Decisão do Orquestrador Supremo, 14/10/2026; registro em `docs/marketing/painel/aprovacoes.json`. Reel novo exige aceite composto explícito.

## Copys orgânico e pago

Origem: pedido do autor em 13/10/2026 (`/copywriting`): pente fino nas copys, separação entre orgânico e pago, e novas copys para reels, carrosséis e estáticos.

| Peça / arquivo | Fonte | Status | Responsável | Aceite do autor | QA | Publicação |
|---|---|---|---|---|---|---|
| `para-aprovacao/pecas/COPYS-ORGANICO-E-PAGO.md` (R-O1 a R-O4, CO-1, CO-2, EO-1 a EO-3, P-1 a P-3, P-R1) | Claude (Haiku 5.5), sessão de 13/10/2026 | para-aprovacao | não registrado | não registrado | pendente | não publicado |
| Pente fino do pacote da semana 40 (seção 1 da peça acima) | mesma sessão | para-aprovacao | não registrado | não registrado | pendente | não publicado |

Versões substituídas: as copys de `semana-40 / para-aprovacao / COPYS-FINAIS.md` ficam como estão. A substituição depende da aprovação do autor, que ainda não existe.

Gates: teste dos 10 cupons da foto da nota (C10) **afirmado pelo autor em 13/10/2026, sem relatório anexo** (registro de afirmação, não de QA). App "100%": afirmado pelo autor em 13/10/2026; a última auditoria datada no repositório é a de 03/10 (`context.md`, commit `a83b5b1`). Peças Android pedem QA do APK e do widget; peças web pedem QA no Chrome; peças pagas pedem a legenda da seção 4 e a conferência do preço vigente na Cakto.

## Apoio

| Material | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [relatorios/relatorio-Beacon-M4.md](apoio/relatorios/relatorio-Beacon-M4.md) | Proposta técnica de eventos Pixel/CAPI, reconciliada com o parecer M5; pendente de aprovação do autor; nada instalado | Beacon, 16/10/2026; ordem M4 de 16/10; revisão documental da Flare | Nenhum teste de compra, validação no Gerenciador de Eventos ou publicação |
| [relatorios/relatorio-Beacon-metricas-meta.md](apoio/relatorios/relatorio-Beacon-metricas-meta.md) | Definições propostas para investimento Meta, novas assinaturas pagas, receita confirmada, reversões, períodos e cobertura; sem dados de produção | Beacon, 16/10/2026; Entrega 4 da ordem META; para Harbor | Fixture proposta; nenhuma consulta real; política de estorno e completude Cakto ainda bloqueadas |
| [relatorios/relatorio-Beacon-copy-consentimento-pixel.md](apoio/relatorios/relatorio-Beacon-copy-consentimento-pixel.md) | Copy final para banner, preferências, estados do Pixel e configuração web; sem ativação | Beacon, 16/10/2026; Entrega 6 da ordem META; para Forge | Revisão M5 incorporada; aprovação jurídica/autor e QA de integração pendentes |
| [relatorios/relatorio-Beacon-E7-contrato-analitico.md](apoio/relatorios/relatorio-Beacon-E7-contrato-analitico.md) | Contrato proposto de recomendações, experimentos, relatório semanal e exportações; sem dados de produção | Beacon, 16/10/2026; Entrega 7 da ordem META; para Harbor, Prism e Lumen | Revisão documental; implementação e fixtures pendentes |
