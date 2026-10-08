# Semana 38 · 2026-09-14 a 2026-09-20

Mês-pai 2026-09: a quinta-feira foi 2026-09-17. Os artefatos das revisões 02 e 03 e seus arquivos de apoio foram incluídos em 19/09; esse registro serve como base de criação onde não há data interna.

## Peças e estado

| Peça/arquivo | Fonte | Status | Responsável / evidência de aprovação | QA / publicação |
|---|---|---|---|---|
| S1–S4, Feed e Story · revisão 02, HTML e PNG | [Gerador da revisão 02](../../../../scripts/gerar-criativos-funil.cjs) e fontes da landing | Historico: substituída pela revisão 03 | Responsável não registrado; nenhum aceite explícito do autor localizado | O gerador contém verificações de layout; não foram reexecutadas nesta migração. Sem registro de publicação |
| S1–S4, Feed e Story · revisão 03, HTML e PNG | [Gerador da revisão 03](../../../../scripts/gerar-criativos-funil-v3.cjs) e mockups-fontes em apoio | Historico: substituída pela revisão 04 | Responsável não registrado; nenhum aceite explícito do autor localizado | Arquivo verificacao.json preservado em apoio/evidencias; não reexecutado nesta migração. Sem publicação registrada |

## Apoio migrado · 6 arquivos

| Material | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| Prévia Feed da revisão 02 | [Evidência](apoio/evidencias/funil/revisao-02/previa-feed.png) | Evidência de apresentação das variantes | Não é peça final nem aceite |
| Mockups-fonte da revisão 03 | [Celular](apoio/referencias/mockups/funil-revisao-03/celular.png) e [notebook](apoio/referencias/mockups/funil-revisao-03/notebook.png) | Fontes visuais dos criativos | Preservadas sem alteração; não são publicação |
| Prévia e verificação da revisão 03 | [Feed](apoio/evidencias/funil/revisao-03/previa-feed.png), [Story](apoio/evidencias/funil/revisao-03/previa-story.png), [verificacao.json](apoio/evidencias/funil/revisao-03/verificacao.json) | Evidência e metadados de QA associados à revisão | Arquivos preservados; conteúdo não revalidado nesta migração |

## Pastas de status

- para-aprovacao: vazia; .gitkeep mantém a pasta no Git.
- aprovados: vazia; .gitkeep mantém a pasta no Git.
- historico: revisões 02 e 03.
- apoio: prévia, mockups-fonte e verificação.

## Regra futura

Use a data de publicação prevista; sem previsão, a data de produção/criação. Semana ISO vai de segunda a domingo e mês-pai segue a quinta-feira. Consulte [a regra comum](../../README.md). Histórico não deve ser sobrescrito por uma nova execução do gerador.
