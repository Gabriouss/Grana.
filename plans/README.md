# Planos de motion — landing do Grana.

Planos gerados por `improve-animations` (skill de `emilkowalski/skills`),
com base nos achados de `find-animation-opportunities` e `improve-animations`
rodados sobre `app/index.tsx` e os componentes da landing pública. Cada
plano é autocontido — qualquer agente consegue executar sem contexto desta
conversa.

| # | Título | Severidade | Escopo | Status |
|---|---|---|---|---|
| [001](001-faqitem-accordion-transition.md) | Animar abertura/fechamento do `FaqItem` (altura, opacidade, ícone) | LOW (maior leverage entre os achados — interação repetida) | `components/FaqItem.tsx` | **DONE** (03/09/2026) |

## Ordem recomendada

Só existe um plano formal — sem dependência entre planos.

## Achados que já foram resolvidos (sem plano formal — direto no código)

Levantados nas mesmas rodadas de auditoria, corrigidos na sessão de
03/09/2026 sem passar por um `NNN-*.md` dedicado (mudança pequena o
bastante pra não precisar):

- **`components/DemoRegistroRapido.tsx`** — a proposta original era dar
  sequência às duas etapas com `RevealOnScroll variante="prova"`. Na
  prática a seção inteira foi fundida com a dobra vizinha (que já mostrava
  a mesma cena), então virou `components/TrilhaPassos.tsx`; o componente
  antigo ficou órfão (mantido no repo, mesmo critério de `NotebookVideo.tsx`).
- **6 curvas `cubic-bezier` sem token compartilhado** — nomeadas em
  `lib/motion.ts` (`EASE_REVEAL`, `EASE_LOOP`, `EASE_BOUNCE_HINT`,
  `EASE_ROLL`, `EASE_SNAP`), todos os usos apontados pra lá.
- **Checklist de 5 itens do card de preço** — stagger `atraso={i * 45}`
  aplicado.
- **Sem tratamento de `prefers-reduced-transparency`** — `usePrefersReducedTransparency()`
  em `lib/motion.ts`, aplicado nas 3 superfícies com `backdropFilter`
  (cabeçalho sticky, `ctaPrimario`, `granaboRecurso`).

## Plano maior em andamento

O plano de 7 seções novas inspiradas no teardown da Dinzo
(`docs/marketing/2026-09-03-dinzo-design-teardown.md`) vive em
[`docs/marketing/2026-09-03-plano-secoes-landing-dinzo.md`](../docs/marketing/2026-09-03-plano-secoes-landing-dinzo.md)
— trazido pro repositório em 04/09/2026 (vivia antes só em
`C:\Users\user\.claude\plans\`, fora do controle de versão e inacessível
de outra máquina). 4 dos 7 itens já implementados na sessão de 03/09/2026
— ver a seção correspondente em `context.md` pro detalhe de cada um, e o
plano em si pro que ainda falta (painel web/moldura de navegador, bento
grid de recursos, cards Jornada/Fechamento do mês).

## Motion premium do aplicativo interno — 05/09/2026

Base d37bd7f. Planejamento solicitado pelo usuário, sem implementação. Escopo distinto da landing acima.

| Plano | Entrega | Status |
|---|---|---|
| [002](002-motion-premium-interno.md) | Direção, auditoria e critérios de aceite | PLANEJADO |
| [003](003-base-motion-feedback.md) | Tokens, toasts e entradas | TODO |
| [004](004-granachat-presenca.md) | Abertura/saída do Granachat | TODO |
| [007](007-navegacao-e-botoes.md) | Troca de telas e resposta dos botões | TODO |
| [008](008-graficos-transicoes.md) | Transições e seleção dos gráficos | TODO |
| [005](005-folhas-edicao.md) | Folhas de edição — piloto | TODO |
| [006](006-voz-estados.md) | Estados visuais de voz | TODO |

Executar 003 → 004 → 007 → 008 → 005 → 006. Os quatro pilares explícitos são Granachat, telas, botões e gráficos; o restante estende a mesma linguagem. Cada arquivo inclui especificação, evidência, limites e validação. Não instalar dependências, mudar backend ou disparar EAS como consequência automática deste planejamento.
