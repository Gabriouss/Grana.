---
target: landing page do Grana. — auditoria de design e motion design
total_score: 19
max_score: 24
na_heuristics: 5,7,9,10
p0_count: 0
p1_count: 4
timestamp: 2026-09-03T23-45-30Z
slug: landing-design-motion
---

Method: revisão do design system local, inspeção do código e QA renderizado em 1440x900, 768x1024 e 390x844, com movimento normal e reduzido.

## Design Health Score
| # | Heurística | Nota | Diagnóstico |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | O carrossel não informa posição; a navegação flutuante não mostra seção atual. |
| 2 | Correspondência com o mundo real | 4 | Mockups e exemplos financeiros são específicos e compreensíveis. |
| 3 | Controle e liberdade | 2 | O fallback horizontal não é focável por teclado e esconde a barra de rolagem. |
| 4 | Consistência e padrões | 3 | Marca coesa, mas há motion e sombras fora do vocabulário central. |
| 6 | Reconhecimento em vez de memória | 4 | Granabô, celular e mini-mocks mostram o produto em uso. |
| 8 | Estética e minimalismo | 3 | Bom acabamento; excesso de dobras cheias e movimentos concorrentes alonga a narrativa. |

**Total: 19/24 (79%) — bom sistema visual, com problemas importantes de ritmo, controle e hierarquia de movimento.**

## Achados Prioritários

### P1 — Corrigir antes de publicar

1. **A navegação flutuante cobre conteúdo e controles no mobile.** O botão fica `fixed`, a 4px da direita e 8px do rodapé, sem reserva equivalente no conteúdo (`components/NavFlutuanteLanding.tsx:145-155`; `app/index.tsx:915-919`). Em 390x844 ele sobrepõe cards de benefícios, resposta do FAQ, selos e a região do CTA final. Reservar uma faixa inferior/lateral ou recolher o botão durante leitura/interação.

2. **O carrossel perde acesso por teclado no fallback de tablet e reduced motion.** A implementação esconde o indicador e depende de rolagem horizontal direta (`components/BeneficiosHorizontais.tsx:168-197`). Medido em desktop com movimento reduzido: o elemento rolável tinha `scrollWidth=2748`, `clientWidth=1385` e `tabIndex=-1`. Adicionar controles anterior/próximo, estado de progresso e foco programático; não deixar conteúdo essencial depender de swipe.

3. **O corpo mobile está grande demais para a densidade da copy.** `secaoTexto` mantém 22px/33px em todas as larguras (`app/index.tsx:1725-1734`). Em 390px, o texto do Granabô ocupa quase uma viewport e separa título, CTA e mockup; o mesmo ocorre em preço e CTA final. Criar papel compacto de 17–18px com 1.45–1.55 de entrelinha e largura de leitura controlada.

4. **A promessa de preço admite no próprio código que não vale em fevereiro.** A página afirma “menos de R$ 0,34 por dia”, enquanto o comentário registra que R$ 9,90 / 28 = R$ 0,354 (`app/index.tsx:1240-1245`). Isso é um risco direto de confiança. Usar o valor mensal como headline ou uma formulação verdadeira durante todo o ano.

### P2 — Alta alavancagem

5. **O movimento não tem hierarquia suficiente.** Sete das oito `Dobra` movem o bloco inteiro por parallax (`app/index.tsx:310-328`), por cima de mais de vinte reveals, snap vertical, hero animado e seção horizontal. No topo foram medidas 10 animações simultâneas em loop. Manter parallax nos mockups/planos visuais e estabilizar copy longa, preço, segurança e FAQ.

6. **A arquitetura de parallax multiplica trabalho por seção.** Cada `ScrollLinkedView` registra seu próprio listener de scroll/resize, `ResizeObserver`, leitura de layout e camada com `will-change` persistente (`components/ScrollLinkedView.tsx:44-116`). Centralizar o progresso num único controlador e promover somente elementos próximos da viewport.

7. **O scroll-zoom tem pouco retorno visual.** A seção usa um painel de 68vh/520px apenas para título e parágrafo (`app/index.tsx:1042-1055`, `app/index.tsx:1687-1705`). No mobile, lê como uma caixa quase vazia. O zoom precisa revelar uma ação real do produto, por exemplo voz → lançamento organizado, ou a seção deve perder a moldura e ocupar menos espaço.

8. **O ritmo vertical cria zonas mortas entre argumentos.** Toda `Dobra` recebe `minHeight` da viewport e centralização (`app/index.tsx:310-325`), além de 70px de padding interno (`app/index.tsx:1683-1686`). Em tablet/mobile aparecem intervalos de 150–250px entre o final de uma prova/CTA e o próximo H2. Usar altura mínima só nas cenas que realmente precisam dela e uma escala fixa de espaçamento entre seções.

9. **Os fades do carrossel não refletem o estado.** Esquerda e direita permanecem visíveis no início e no fim (`components/BeneficiosHorizontais.tsx:195-196`, `components/BeneficiosHorizontais.tsx:213-214`). Alternar opacidade conforme progresso/`scrollLeft`, para o fade comunicar continuação real.

### P3 — Polimento

10. **Há deriva dos tokens de profundidade.** O card horizontal usa uma sombra ad hoc (`components/BeneficiosHorizontais.tsx:288-295`) diferente da sombra persuasiva já definida em `app/index.tsx:1434`. Consolidar em token único.

11. **Reduced motion funciona ao carregar, mas nem todos os componentes acompanham mudança ao vivo.** `FogBackground`, hero e CTA consultam a preferência uma vez, embora exista `useReducedMotion()` com listener (`components/FogBackground.tsx:15-32`; `lib/motion.ts:5-23`). Reusar o hook central.

## O Que Está Funcionando

- A identidade petróleo/menta, a Neue Machina e os valores tabulares permanecem coerentes.
- O quadriculado agora está sutil; não compete com títulos nem mini-mocks.
- Os fades laterais resolveram o recorte brusco dos cards e estão estreitos o bastante no mobile.
- Hero, Granabô e moldura de celular mostram produto real, não decoração genérica.
- A seção de segurança ficou mais escaneável, e o preço mensal tem hierarquia clara.
- Com reduced motion ativo e a página recarregada, foram medidas 0 animações em execução.

## Verificação

- TypeScript: passou (`npx tsc --noEmit`).
- Corpus do design system: 303/303 guardas passaram.
- Axe WCAG A/AA: 0 violações; contraste ficou como verificação manual por causa de fundos sobrepostos.
- Console: 0 erros.
- Web Vitals locais: LCP 1,18s; CLS 0,05; FCP 0,80s.

## Ordem Recomendada

1. Desobstruir conteúdo mobile e tornar o carrossel controlável por teclado.
2. Corrigir copy de preço e escala tipográfica mobile.
3. Reduzir parallax em texto e centralizar o controlador de scroll.
4. Reprojetar o payoff do scroll-zoom e recalibrar o ritmo entre dobras.
5. Condicionar fades e consolidar tokens/reduced motion.
