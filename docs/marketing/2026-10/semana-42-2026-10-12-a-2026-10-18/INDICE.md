# Semana 42 · 2026-10-12 a 2026-10-18

Mês-pai 2026-10: a quinta-feira é 2026-10-15. Semana aberta em 13/10/2026 para registrar o Reel publicado em 12/10/2026 (data de publicação, regra 25).

## Peças e estado

| Peça | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [grana-reels-notificacao-1.mp4](aprovados/pecas/reels/Fala o gasto, pronto.mp4) | Reel da padaria, "versão curta com a notificação na tela" (16,8 s) do roteiro `2026-09/semana-39-2026-09-21-a-2026-09-27/apoio/briefings/reels/2026-09-25-reels-widget-padaria.md`. Cópia do arquivo da raiz do vault (`Gabriel/Grana/grana-reels-notificacao-1.mp4`), que continua lá; SHA-1 `95eee60e2de891b8ac83043f16c7d275aef1b1b3`, igual nos dois lugares. Revisão **vigente** da família `R-P` em `docs/marketing/painel/familias.json` | Decisão do autor em 12/10/2026 16:59 ("o correto é esse aqui") e em 13/10/2026 20:20: esta é a versão correta da família, e o `2026-09/semana-39-.../para-aprovacao/pecas/reels/grana-reels-v8-pop.mp4` passa a ser revisão superada; o aceite do v8-pop de 07/10/2026 10:31:32 fica só no histórico e não vale para publicação. **Aceite do autor em 13/10/2026**, citação literal: "É a versão correta e já foi publicada no perfil do instagram (verificar utilizando API da META)"; vale como aceite datado desta versão (regra 25; decisão do Supremo, 14/10) | Publicado no Instagram em 12/10/2026 ~17:01 (mídia `18132974281756527`), com a capa [grana-reels-v8-pop-capa-1080x1920.png](../semana-41-2026-10-05-a-2026-10-11/aprovados/grana-reels-v8-pop-capa-1080x1920.png), que o registro de famílias vincula a este Reel. Publicação feita fora do painel, antes do dia D; a conferência pela API da Meta não foi feita (token vencido em 12/10) |

## Aceite do autor

- 13/10/2026: aceite do autor de `aprovados/pecas/reels/Fala o gasto, pronto.mp4` (SHA-1 `95eee60e2de891b8ac83043f16c7d275aef1b1b3`), na frase literal: "É a versão correta e já foi publicada no perfil do instagram (verificar utilizando API da META)". A conferência pela API da Meta pedida na mesma frase não foi feita (token vencido em 12/10). Repassada pelo Orquestrador Supremo em 14/10/2026 (decisão C2 da conferência do Flare). É a evidência datada que sustenta o arquivo em `aprovados` (regra 25). Aceite não é publicação; a publicação de 12/10 aconteceu antes deste registro.
- 14/10/2026: **aceite composto derivado de aceites separados** para este Reel com a capa `../semana-41-2026-10-05-a-2026-10-11/aprovados/grana-reels-v8-pop-capa-1080x1920.png` (versão composta `d2291cb48d01`): vídeo aceito em 13/10/2026 (citação acima) e capa aceita em 11/10/2026 23:20:41 (versão `19d81da7338b`). Decisão do Orquestrador Supremo, 14/10/2026; registro em `docs/marketing/painel/aprovacoes.json`. Reel novo exige aceite composto explícito.

## Copys orgânico e pago

Origem: pedido do autor em 13/10/2026 (`/copywriting`): pente fino nas copys, separação entre orgânico e pago, e novas copys para reels, carrosséis e estáticos.

| Peça / arquivo | Fonte | Status | Responsável | Aceite do autor | QA | Publicação |
|---|---|---|---|---|---|---|
| `para-aprovacao/pecas/COPYS-ORGANICO-E-PAGO.md` (R-O1 a R-O4, CO-1, CO-2, EO-1 a EO-3, P-1 a P-3, P-R1) | Claude (Haiku 5.5), sessão de 13/10/2026 | para-aprovacao | não registrado | não registrado | pendente | não publicado |
| Pente fino do pacote da semana 40 (seção 1 da peça acima) | mesma sessão | para-aprovacao | não registrado | não registrado | pendente | não publicado |

Versões substituídas: as copys de `semana-40 / para-aprovacao / COPYS-FINAIS.md` ficam como estão. A substituição depende da aprovação do autor, que ainda não existe.

Gates: teste dos 10 cupons da foto da nota (C10) **afirmado pelo autor em 13/10/2026, sem relatório anexo** (registro de afirmação, não de QA). App "100%": afirmado pelo autor em 13/10/2026; a última auditoria datada no repositório é a de 03/10 (`context.md`, commit `a83b5b1`). Peças Android pedem QA do APK e do widget; peças web pedem QA no Chrome; peças pagas pedem a legenda da seção 4 e a conferência do preço vigente na Cakto.

## Carrossel "Olhar só o saldo engana o seu mês" (v9, 18/10/2026)

Origem: pedido do autor sobre a v8 na fila do painel ("Celular na página 4 maior que o notebook tá estranho", "os textos ainda estão muito lá pra cima", "proporções realistas"). Copy inalterada em relação à v8.

| Peça / arquivo | Fonte | Status | Responsável | Aceite do autor | QA | Publicação |
|---|---|---|---|---|---|---|
| `para-aprovacao/pecas/lumen-v8/Olhar só o saldo engana o seu mês-1..5.png` (1080×1440) | `apoio/ferramentas/gerar-carrossel-v9.py`, local (Pillow), sem ElevenLabs, dados fictícios | para-aprovacao (v9, mesma peça no mesmo caminho da v8) | Lumen (Claude) | não registrado | pendente | não publicado |
| `historico/pecas/carrossel-olhar-so-o-saldo-v8/Olhar só o saldo engana o seu mês-1..5-v8.png` | v8 de 16/10/2026 | substituída pela v9 | Lumen | não aplicável | não aplicável | não publicado |

Mudanças da v9: na tela 4 o notebook é grande e o celular fica à frente com cerca de 57% da altura da tampa, os dois inteiros; o bloco de texto das cinco telas desceu. Nas telas 2 e 5 (texto à direita, celular à esquerda) o texto só desce até onde não encosta no celular: descer mais exigiria celular menor ou outra composição, decisão do autor.

## Apoio

| Material | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [relatorios/relatorio-Beacon-M4.md](apoio/relatorios/relatorio-Beacon-M4.md) | Proposta técnica de eventos Pixel/CAPI, reconciliada com o parecer M5; pendente de aprovação do autor; nada instalado | Beacon, 16/10/2026; ordem M4 de 16/10; revisão documental da Flare | Nenhum teste de compra, validação no Gerenciador de Eventos ou publicação |
| [relatorios/relatorio-Beacon-metricas-meta.md](apoio/relatorios/relatorio-Beacon-metricas-meta.md) | Definições propostas para investimento Meta, novas assinaturas pagas, receita confirmada, reversões, períodos e cobertura; sem dados de produção | Beacon, 16/10/2026; Entrega 4 da ordem META; para Harbor | Fixture proposta; nenhuma consulta real; política de estorno e completude Cakto ainda bloqueadas |
| [relatorios/relatorio-Beacon-copy-consentimento-pixel.md](apoio/relatorios/relatorio-Beacon-copy-consentimento-pixel.md) | Copy final para banner, preferências, estados do Pixel e configuração web; sem ativação | Beacon, 16/10/2026; Entrega 6 da ordem META; para Forge | Revisão M5 incorporada; aprovação jurídica/autor e QA de integração pendentes |
| [relatorios/relatorio-Beacon-E7-contrato-analitico.md](apoio/relatorios/relatorio-Beacon-E7-contrato-analitico.md) | Contrato proposto de recomendações, experimentos, relatório semanal e exportações; sem dados de produção | Beacon, 16/10/2026; Entrega 7 da ordem META; para Harbor, Prism e Lumen | Revisão documental; implementação e fixtures pendentes |

## Aceites registrados no painel local

Cada linha registra o aceite explícito do autor dado no painel local, para a versão indicada. Versão diferente precisa de novo aceite.

- 18/10/2026 15:12 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/lumen-v8/olhar só o saldo engana o seu mês-*`, versão `6d88889bcc8f`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

## Peças recusadas ou arquivadas

- [grana-motion-desistiu-foto-da-nota-narrado-capa-v2.png](historico/pecas/reels/grana-motion-desistiu-foto-da-nota-narrado-capa-v2.png): capa do Reel narrado "Já desistiu de controlar seus gastos", que o autor recusou em 17/10/2026. Movida de `para-aprovacao/pecas/reels/` para `historico/pecas/reels/` em 18/10/2026 por decisão do Orquestrador Supremo (regra 25). O pedido de ajuste sobre ela fica sem peça vigente.
- 18/10/2026 20:08 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/lumen-v8/olhar só o saldo engana o seu mês-*`, versão `ebc9256211cb`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:0c2f7a45bb3959ba:ebc9256211cbb190dae9ddff2f84f05ba280295a -->
- Promoção 2026-10-18T20:14:56-03:00: [peça em aprovados](aprovados/pecas/lumen-v8/Olhar só o saldo engana o seu mês-1.png); aceite do autor em 2026-10-18T20:08:57-03:00, versão `ebc9256211cbb190dae9ddff2f84f05ba280295a`. Origem `docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/para-aprovacao/pecas/lumen-v8/olhar só o saldo engana o seu mês-*`. Nada publicado ou agendado.
- 18/10/2026 20:47 (-03:00): aceite pelo autor no painel local. Peça `aprovados/pecas/lumen-v8/olhar só o saldo engana o seu mês-*`, versão `c70eeea435d1`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- recusa:12c0619f5a59fa78:40419fb1ab2b16eb8c23ac20bee8512fba739114 -->
- Recusa do autor em 2026-10-19T00:21:34-03:00: [peca em historico](historico/pecas/reels/Fala o gasto, pronto.mp4). Motivo registrado no painel; nada publicado ou agendado.
- 19/10/2026 00:23 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/lumen-v8/Quanto dá pra gastar hoje.png`, versão `a9f38fbaf252`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:d56f097f03d86707:a9f38fbaf252aac92f8f20f8bfd0b9e8ebbe31e2 -->
- Promoção 2026-10-19T00:23:19-03:00: [peça em aprovados](aprovados/pecas/lumen-v8/Quanto dá pra gastar hoje.png); aceite do autor em 2026-10-19T00:23:18-03:00, versão `a9f38fbaf252aac92f8f20f8bfd0b9e8ebbe31e2`. Origem `docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/para-aprovacao/pecas/lumen-v8/Quanto dá pra gastar hoje.png`. Nada publicado ou agendado.
- 19/10/2026 00:23 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Passou na farmácia hoje-capa.png`, versão `1901af0752fc`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:0a110de1d2b23176:1901af0752fc353705a4457486d1189fa1cf3c43 -->
- Promoção 2026-10-19T00:23:41-03:00: [peça em aprovados](aprovados/pecas/reels/Passou na farmácia hoje-capa.png); aceite do autor em 2026-10-19T00:23:41-03:00, versão `1901af0752fc353705a4457486d1189fa1cf3c43`. Origem `docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/para-aprovacao/pecas/reels/Passou na farmácia hoje-capa.png`. Nada publicado ou agendado.
- 19/10/2026 00:24 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Recebeu um Pix, só colar-capa.png`, versão `155bf6555271`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:0a1059ea191a0cb7:155bf65552710ce910d98f77682924d6dab8e94a -->
- Promoção 2026-10-19T00:24:00-03:00: [peça em aprovados](aprovados/pecas/reels/Recebeu um Pix, só colar-capa.png); aceite do autor em 2026-10-19T00:24:00-03:00, versão `155bf65552710ce910d98f77682924d6dab8e94a`. Origem `docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18/para-aprovacao/pecas/reels/Recebeu um Pix, só colar-capa.png`. Nada publicado ou agendado.
