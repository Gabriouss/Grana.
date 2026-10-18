# Semana 40 · 2026-09-28 a 2026-10-04

Mês-pai 2026-10: a quinta-feira foi 2026-10-01. A base do pacote anterior é 30/09; os adendos e o lote piloto da copy foram produzidos em 04/10. Feedback: 01/10. Guia de vídeo: 04/10.

## Peças e estado

| Peça/arquivo | Fonte | Status | Responsável / evidência de aprovação | QA / publicação |
|---|---|---|---|---|
| Copy C01–C13 no [documento de copys](para-aprovacao/pecas/COPYS-FINAIS.md) | Briefings e fontes listados no pacote; ver também FUNIL.md e a matriz de plataformas | Para aprovação: não há aceite final do autor registrado para cada versão | Responsável não registrado. Revisões de Beacon/Watchtower são evidência de revisão, não aceite do autor | QA depende das promessas e da plataforma de cada peça; nenhuma publicação/agendamento registrada |
| Card estático piloto C01 e carrossel C14, cinco telas | [Copy e requisitos do lote de 04/10](para-aprovacao/pecas/COPYS-FINAIS.md) | Para aprovação: a copy tem ajustes de revisão; arte final, escolha e aceite comercial do autor pendentes | Responsável não registrado. Watchtower revisou a copy com ajustes; isso não é aceite do autor | Capturas atuais, render final do carrossel e crítica visual pendentes; nada publicado ou agendado |
| Roteiro de voz Reel R13 | [Roteiro no lote piloto](para-aprovacao/pecas/COPYS-FINAIS.md) | Para aprovação/revisão; vídeo final não está neste conjunto de arquivos | Responsável não registrado. Revisão de conceito não substitui aceite final do autor. Autorização anterior de custo não significa aceite criativo | Capturas reais, aviso, áudio/licença, montagem e QA pendentes; publicação não autorizada |

Arte candidata mencionada nas fontes fora do repositório não foi incluída nesta migração. Não inferir que sua revisão ou localização externa significa aceite.

## Apoio migrado · 10 arquivos

| Material | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [README legado do pacote](apoio/README-MATERIAL-FINAL.md) | Índice e precedência de textos e materiais | Mantido para histórico e navegação; links internos apontam à árvore nova | Referência, não aprovação |
| Briefings e instruções: [checklist](apoio/briefings/CHECKLIST-PEDIDOS-AUTOR.md), [criativos web](apoio/briefings/criativos-web.md), [plano de verba](apoio/briefings/plano-verba-curta.md) | Pedidos, requisitos, hipóteses e plano | Responsável não atribuído pela migração | QA e portões descritos nos documentos; não são publicação |
| [Inventário legado](apoio/inventarios/inventario-criativos.md) | Acervo, estado e dependências de plataforma | Documento de inventário; referências de época preservadas | Seu status não equivale a aceite das peças |
| [Matriz de plataformas](apoio/referencias/matriz-plataformas.md) e [guia de estilo de vídeo](apoio/referencias/guia-de-estilo-de-video.md) | Evidência de produto e referência visual | Material de consulta | A matriz lista verificações por plataforma; o guia registra medidas, sem liberar campanha |
| [Feedback da prévia estática](apoio/relatorios/2026-10-01-feedback-previa-estatica.md), [relatório Beacon](apoio/relatorios/relatorio-Beacon-finalizacao-copy.md) e [relatório Lynx](apoio/relatorios/relatorio-Lynx-cdc-copys.md) | Feedback e pareceres registrados | Evidência documental de revisão; autoria das peças não inferida | Feedback da prévia não é aprovação; relatórios não substituem aceite/publicação |

## Pastas de status

- para-aprovacao: o arquivo de copys do pacote, incluindo C01–C13 e o piloto C01/C14/R13.
- aprovados: vazia; .gitkeep mantém a pasta no Git. Nenhuma aceitação explícita do autor localizada para as peças migradas.
- historico: vazia; .gitkeep mantém a pasta no Git.
- apoio: 10 briefings, relatórios, referências e inventário.

## Regra futura

Use a data prevista de publicação; sem previsão, a produção/criação. Semana ISO vai de segunda a domingo; o mês-pai segue a quinta-feira. Consulte [a regra comum](../../README.md). Registre em separado revisor, aceite explícito do autor, QA por plataforma e publicação. O status “copy aprovada por revisor” não é aceite do autor.

## Famílias e revisões (registro de famílias, 14/10/2026)

Decisões do autor de 13/10/2026, registradas em `docs/marketing/painel/familias.json`:

- **R13:** a vigente é `historico/pecas/r13/reel-r13-final.mp4` (guardada em historico, vigente pelo registro, ainda sem aceite no painel). `para-aprovacao/pecas/r13-v3/reel-r13-v3.mp4` é revisão superada; o pedido de ajuste de 07/10 sobre a v3 fica atendido pela troca. As quatro `reel-r13-final-com-aviso-*` não foram escolhidas e ficam fora da família.
- **C14, carrossel Lumen:** a vigente é `para-aprovacao/pecas/lumen-v7/carrossel-*`, com ajuste pedido pelo autor (fila do painel); `para-aprovacao/pecas/lumen-v6/carrossel-*` é revisão superada. Em 15/10/2026 a vigente foi refeita no guia 3x4 (copy revisada pelo Antigravity, "Arrasta pro lado!" nos slides 1 a 4, gerador `semana-42-2026-10-12-a-2026-10-18/apoio/ferramentas/gerar-carrossel-feed-3x4.py`); a versão anterior está em `historico/pecas/lumen-v7-substituido/`, substituída por pedido do autor. Aceite do autor pendente. O `lumen-v6/card.png` (C01) é outra peça e não muda.
- 14/10/2026, com `git mv` e por decisão do Orquestrador Supremo: a v3 foi para `historico/pecas/r13-v3/reel-r13-v3.mp4` (regra 25) e a vigente saiu de historico para `para-aprovacao/pecas/r13/reel-r13-final.mp4`, onde aguarda o aceite do autor no painel. O pedido de ajuste de 07/10 sobre a v3 foi encerrado como atendido em `docs/marketing/painel/aprovacoes.json`.

<!-- recusa:863e6fcfa5d4849f:fd157de7b2f20ee8236d321590b25b2228fe5359 -->
- Recusa do autor em 2026-10-17T21:15:42-03:00: [peca em historico](historico/pecas/lumen-v7/carrossel-1.png). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:5f4bf83d7a1ce13a:ff913a438e6c528553386371c6832d098cf24a15 -->
- Recusa do autor em 2026-10-17T21:15:42-03:00: [peca em historico](historico/pecas/r13/reel-r13-final.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:019d5b922cd94eb9:1c398ea8564f05f9d8b97daa4bd77bb15c88a9de -->
- Recusa do autor em 2026-10-17T21:16:14-03:00: [peca em historico](historico/pecas/lumen-v6/card.png). Motivo registrado no painel; nada publicado ou agendado.
