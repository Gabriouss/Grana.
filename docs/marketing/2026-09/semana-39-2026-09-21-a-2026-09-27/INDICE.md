# Semana 39 · 2026-09-21 a 2026-09-27

Mês-pai 2026-09: a quinta-feira foi 2026-09-24. Revisões 04 e 05 foram incluídas em 21/09; solicitações e fixture usam as datas 26 e 27/09 dos pedidos.

## Peças e estado

| Peça/arquivo | Fonte | Status | Responsável / evidência de aprovação | QA / publicação |
|---|---|---|---|---|
| S1–S4, Feed e Story · revisão 04, HTML e PNG | [Gerador da revisão 04](../../../../scripts/gerar-criativos-funil-v4.cjs), telas-fonte e mockups em apoio | Historico: substituída pela revisão 05 | Responsável não registrado; nenhum aceite explícito do autor localizado | Verificação e prévias preservadas em apoio; QA não reexecutado; sem publicação registrada |
| E01, E02, E05 e E06 · Feed 1080×1440, HTML e PNG | [Prompts](apoio/briefings/funil/prompts.md), [manifest](apoio/ferramentas/manifests/funil/manifest.json) e telas-fonte/molduras da revisão 04 | Para aprovação: aceitação final do autor não registrada | Responsável não registrado. A revisão “Revisão do lançamento para venda - 2026-09-21” dá GO condicionado para piloto orgânico e aponta P1; é parecer de revisão, não aceite do autor | Parecer aponta rodapé de 14 px, legibilidade das telas em feed móvel, plataforma ambígua em E06 e CTA sem ação. Manifesto contém verificações de layout, sem leitura comprovada em telefone. Não publicar antes dos portões de QA e do dia D; nenhum post foi publicado |

## Apoio migrado · 18 arquivos

| Material | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| Mockups-fonte da revisão 04 · 4 PNG | [Pasta de referência](apoio/referencias/mockups/funil-revisao-04/) | Fontes dos criativos da revisão 04/05 | Preservadas; não são peças aprovadas |
| Capturas-fonte da revisão 04 · 4 PNG | [Telas](apoio/capturas-fonte/funil-revisao-04/) | Telas usadas no lote, apontadas pelo manifesto de E01/E02/E05/E06 | Conteúdo preservado; não recapturado nesta migração |
| Pré-vias e verificação da revisão 04 | [Evidências](apoio/evidencias/funil/revisao-04/) | Apoio de apresentação e QA | Preservadas, sem reexecução ou aprovação de autor |
| Pré-vias da revisão 05 | [Evidências](apoio/evidencias/funil/revisao-05/) | Mosaicos das quatro peças | Evidência visual, não aceite |
| Solicitações R9/R5 | [R9 importar extrato](apoio/briefings/solicitacoes/2026-09-26-gravar-r9-importar-extrato.md) e [R5 final de Lançamentos](apoio/briefings/solicitacoes/2026-09-27-gravar-r5-final-lancamentos.md) | Pedidos de gravação | Briefings, não os vídeos finais |
| Roteiro do Reels "o pão lançado pelo widget" | [2026-09-25-reels-widget-padaria.md](apoio/briefings/reels/2026-09-25-reels-widget-padaria.md), vindo da raiz de docs/marketing na M2 (reconciliação de 07/10) | Estrutura decidida pelo autor em 25/09, segundo o próprio arquivo; responsável não registrado | Roteiro e prompts; não é o vídeo nem aceite de peça |
| Referência de Stories de concorrentes | [2026-09-27-stories-concorrentes.md](apoio/referencias/2026-09-27-stories-concorrentes.md), vindo de `docs/marketing/referencias/` na M2 (reconciliação de 07/10) | Referência de estilo de terceiros; responsável não registrado | Só estilo visual; não é peça |
| Fixture do R9 | [CSV de exemplo](apoio/capturas-fonte/fixtures/extrato-exemplo-r9.csv) | Exemplo fictício referenciado pelo pedido R9 | Fonte de teste; não é arte nem publicação |
| Manifesto da revisão 05 | [manifest.json](apoio/ferramentas/manifests/funil/manifest.json) | Dados de geração, arquivos e sourceScreen | Referências atualizadas às capturas-fonte desta árvore; valores de QA não reexecutados |
| Prompts da revisão 05 | [prompts.md](apoio/briefings/funil/prompts.md) | Briefing de E01/E02/E05/E06 | Apoio de produção, não aceite |

## Pastas de status

- para-aprovacao: E01, E02, E05 e E06 da revisão 06 (`para-aprovacao/pecas/funil/revisao-06/`).
- aprovados: `aprovados/pecas/reels/grana-motion-desistiu-foto-da-nota.mp4` (ver Aceites). Nenhum outro arquivo tem aceite expresso do autor localizado.
- historico: revisão 04 e revisão 05 de E01, E02, E05 e E06 (`historico/pecas/funil/revisao-05/`), substituída pela 06.
- apoio: mockups, capturas, relatórios de verificação, pré-vias, briefs, manifest e CSV.

## Regra futura

Use data prevista de publicação; sem data, produção/criação. A primeira inclusão no Git em 21/09 é a evidência de criação de revisão 04/05, não de autoria. Consulte [a regra comum](../../README.md). Um GO condicionado ou ajuste de revisor nunca move uma peça para aprovados.

## Aguardando narração

- 09/10/2026: `para-aprovacao/pecas/reels/grana-r5-colar-pix-v6.mp4` (R5, colar Pix, v6), copiado do vault sem alterar o original. Semana pela data de produção do arquivo (26/09/2026), sem publicação prevista. Autor: "esse aqui também, precisa apenas da narração". **Falta a narração**; nenhuma foi gerada (regras 21 e 24). Não é peça aprovada: sem aceite do autor para esta versão. Fonte de render em `docs/marketing/r5-colar-pix/`.

## Aceites registrados no painel local

Cada linha registra o aceite explícito do autor dado no painel local, para a versão indicada. Versão diferente precisa de novo aceite.

- 07/10/2026 10:31 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/grana-reels-v8-pop.mp4`, versão `bc01c04e92ba`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

## Correções pedidas no painel local · recibo 08/10/2026

Correção pronta, aguardando aceite do autor. Os quatro pedidos de 07/10 sobre E01, E02, E05 e E06 geraram a revisão 06, em `para-aprovacao/pecas/funil/revisao-06/` (HTML e PNG 1080×1440). A versão anterior foi para o histórico. Nenhuma versão nova entrou em aprovacoes[]: aceite é decisão do autor. Logotipo é o gradiente oficial, sem aviso de dado fictício na arte, aparelho inteiro dentro da margem. Sem ElevenLabs e sem publicação. Verificado: render em Chrome e leitura visual dos quatro PNG. Não verificado: leitura em telefone e conformidade fina com o design system.

| Peça | SHA1 antigo | SHA1 novo |
|---|---|---|
| E01 | e4a24c3e9006 | bdf9fce74b18 |
| E02 | 4396fe4e863d | c089529d7daf |
| E05 | d43a0cfde4616 | 7ecae57067dc |
| E06 | 9ec5b2ded738 | da00f8ec9ddb |
- 25/09/2026: aceite pelo autor do vídeo `aprovados/pecas/reels/grana-motion-desistiu-foto-da-nota.mp4` (motion "desistiu porque cansa", 20 s, dados fictícios). Evidência: regra 23 do `AGENTS.md` ("aprovado em 25/09/2026", referência de estilo de todos os vídeos) e a frase do autor em 09/10/2026: "Temos outro reels aprovado, já: grana-motion-desistiu-foto-da-nota.mp4, esse aqui que está no vault". Cópia do arquivo do vault, original intacto; fonte de render em `docs/marketing/motion-desistiu/`. Semana 39 pela data de produção/aceite, sem publicação prevista registrada. Aceite não é publicação e não autoriza prometer a função mostrada antes de build pública e QA.
