# Plano — 7 seções novas na landing do Grana., inspiradas no teardown da Dinzo

Trazido pro repositório em 04/09/2026 (vivia antes só em
`C:\Users\user\.claude\plans\mete-marcha-num-plano-ticklish-waffle.md`,
fora do controle de versão) — pedido do autor pra qualquer máquina ter
acesso completo ao planejamento via `git pull`, não só a que o gerou.
Conteúdo idêntico ao original, com status marcado por item.

**Status em 04/09/2026: 4 de 7 concluídos.** Ver `context.md`, sessão de
03/09/2026, pro relato completo de cada item já implementado (arquivos,
decisões tomadas, verificação). As seções 1, 2, 3 e 8 abaixo (numeração
original do plano) estão feitas — mantidas aqui só pra registro, não
precisam ser reexecutadas. As seções 4, 5 e 6 seguem pendentes e são o
que falta.

## Contexto

Ao longo da sessão de 03/09/2026, o teardown técnico da landing de um
concorrente (Dinzo) foi documentado célula por célula — tipografia, cor,
spacing, motion com curvas/durações exatas, e estratégia de copy — em
`docs/marketing/2026-09-03-dinzo-design-teardown.md`. Nas rodadas
seguintes, o autor foi apontando 7 elementos específicos dessa análise que
quer replicados na landing do Grana. — não copiando a marca ou a paleta
clara da Dinzo, só a técnica (arquitetura de interação, composição,
motion). Três explorações de código e um agente de planejamento
levantaram viabilidade, riscos e reaproveitamento de padrão existente
para cada item; este plano consolida tudo isso numa sequência única de
execução, como o autor pediu.

Duas decisões que travavam o plano foram resolvidas pelo autor:
- **Capturas de tela**: o autor passou login/senha de uma conta de
  demonstração (registrada em memória local, `conta-prints-internos-app.md`,
  nunca no repositório). **Concluído** — ver seção 7.
- **Chip de "foto de nota" no chat clicável**: virou chip de **áudio** em
  vez de foto — a Edge Function real recusa imagem hoje ("Só entendo
  texto ou áudio"), e áudio é 100% suportado. **Concluído** — ver seção 2.

Decisões menores foram resolvidas por julgamento de rotina e estão
marcadas **[ASSUMIDO]** abaixo — todas reversíveis.

## Ordem de execução

1. ✅ CTA secundário no herói (item 7) — **concluído**.
2. ✅ Chat clicável do Granabô (item 5) — **concluído**.
3. ✅ "2 passos" com trilha pontilhada (item 6) — **concluído** (fundido
   com a dobra vizinha que mostrava a mesma cena — ajuste feito durante a
   execução, ver `context.md`).
4. 🔲 Painel web / moldura de navegador (item 2) — **pendente, próximo**.
5. 🔲 Bento grid de recursos (item 3) — **pendente**, maior risco técnico.
6. 🔲 Cards "Jornada" e "Fechamento do mês" (item 4) — **pendente**,
   depende do item 5 existir.
7. ✅ Captura das 5 telas (Passo 0 do item 1) — **concluído**, mais a
   correção de `lib/demo-data.ts` (datas literais que envelheciam).
8. ✅ Carrossel navegável de 5 telas (item 1) — **concluído**.
9. 🔲 Verificação final (`tsc`, `test:parser`, QA visual em 4 larguras) +
   `grana-app:impeccable` como auditoria de craft do conjunto — falta
   rodar depois que os itens 4-6 fecharem.
10. 🔲 Atualizar `context.md` com o fechamento total (regra permanente do
    `AGENTS.md` #7) — parcialmente feito, falta a entrada final quando os
    itens 4-6 terminarem.

---

## 1. CTA secundário no herói (item 7) — ✅ concluído

**Arquivos**: `app/index.tsx` — `HeroStorytelling`, `ConteudoWeb`, bloco de
estilos `ctaPrimario*`.

**Padrão reaproveitado**: `navegarParaSecao` (já existia) passada como
prop `onNavegarGranabo` pra `HeroStorytelling`, que fica fora do escopo
léxico de `ConteudoWeb` — mesmo padrão que `NavFlutuanteLanding` já usava
com `onNavigate`.

`BotaoCTA` ganhou `variante?: 'primario' | 'secundario'` e `onPress`
opcional (precedência sobre o `href` de cadastro). O secundário é outline,
sem o reflexo diagonal (assinatura do CTA de conversão principal).

**Copy implementada**: "Ver o Granabô em ação", rolando até `#granabo`.

---

## 2. Chat clicável do Granabô (item 5) — ✅ concluído

**Arquivo**: `components/ConversaGranabo.tsx` reescrito do zero (era
100% estático).

**Implementado**: 3 chips de comando disparam trocas reais — lançamento
por texto, por áudio (com eco `🎙️ Ouvi:`, decisão final em vez de "foto de
nota"), e consulta por categoria. Respostas fiéis ao formato literal de
`supabase/functions/whatsapp-webhook/index.ts`.

**Decisão tomada durante a execução, além do plano original**: a
interface do chat cita literalmente a cara do WhatsApp (fundo bege, balão
verde com canto reto, check duplo azul) — mesma lógica da exceção já
aberta pro verde `#25D366` no design system, mas aplicada à janela
inteira. A barra de chips por baixo usa os tokens do Grana., não do
WhatsApp — é controle da landing, não parte da citação.

---

## 3. "2 passos" com trilha pontilhada (item 6) — ✅ concluído (com ajuste)

**Arquivo**: `components/TrilhaPassos.tsx` (novo).

**Ajuste em relação ao plano original**: o autor notou, olhando a seção
já pronta, que a dobra "esforço quase zero" (que já existia) e a seção
nova de passos mostravam a MESMA cena (fala virando lançamento) uma
embaixo da outra, repetida. As duas viraram uma coisa só — não é mais uma
seção nova isolada, é a dobra existente enriquecida com o segundo passo.

**Conteúdo**: 2 passos, não 3 (sem "conectar banco", que o produto nunca
faz) — "Fale com o Granabô" → "Confira onde quiser". Cada passo mostra o
mecanismo acontecendo (mensagem → lançamento categorizado; celular +
navegador com a mesma linha destacada nos dois), não um ícone genérico —
pedido explícito do autor no meio da execução ("elementos visuais
melhores que simples ícones").

**Trilha pontilhada**: revelada por `clip-path`, não `stroke-dashoffset`
(que deslocaria os pontos do traço em vez de fazer a linha crescer — ajuste
técnico descoberto durante a implementação, o plano original citava
`stroke-dashoffset` sem essa ressalva).

`components/DemoRegistroRapido.tsx` ficou órfão (mantido no repo, mesmo
critério de `NotebookVideo.tsx`).

---

## 4. Painel web / moldura de navegador (item 2) — 🔲 pendente, próximo item

**Arquivo**: recriar `components/MolduraNavegador.tsx` — existiu, foi
deletado no commit `f391829` (31/08/2026) por ficar órfão, não por
defeito. Conteúdo recuperável via
`git show f391829~1:components/MolduraNavegador.tsx`.

**Reaproveitar 1:1** da versão deletada: bezel CSS sem asset de imagem
(proporção `1440/900` configurável), barra de topo com 3 pontinhos
`theme.rule` (neutros, nunca semânticos) + pílula de URL fake com
`fontFamily: fonts.light` explícito, flutuação CSS (`@keyframes` via
`useId()`, pausa por `IntersectionObserver` fora da viewport, gate por
`prefers-reduced-motion`) — mesma receita de `MolduraCelular.tsx`.

**Adicionar (não existia antes)**:
1. **Balões de anotação** nas bordas — Views absolutas, cada uma com um
   texto curto destacando um dado real da tela, e a mesma receita de
   flutuação CSS, mas com **duração/delay próprios por balão** (nunca
   sincronizados entre si — técnica documentada no teardown seção 4: 3
   chips, durações 4,6-6s, delays 0-0,9s, nenhum par repetido).
2. **Indicador de mouse** — círculo pequeno + sombra leve (`theme.accent2`)
   sobre um elemento clicável da captura, com pulsação sutil (`scale`/
   `opacity`, parecido com o "anel de espera" do teardown) sugerindo "isto
   é clicável", sem simular um clique de fato.

**Screenshot necessária**: `public/telas/conquistas-web.webp` já existe
(1440×900) mas está desatualizada desde antes da correção de crop/badge
do commit `f391829` — **recapturar** usando o mesmo processo já validado
na sessão anterior (modo "Dados de exemplo" ligado só em memória, badge
"(exemplo)" ocultada via DOM na hora da captura, nunca no código).

**Posicionamento [ASSUMIDO]**: perto da dobra "Construção do hábito" (que
já usa `MolduraCelular`), formando um par mobile → web.

**Risco**: balões não podem sobrepor o cabeçalho sticky nem vazar do
`colunaConteudo` em telas médias (1024-1280px) — testar especificamente
nessa faixa. **Lembrete de prioridade do autor: 70% do foco em mobile —
construir e verificar em 390px primeiro, desktop depois**, mesmo esta
seção sendo sobre a versão web do produto (a seção em si, na landing,
ainda precisa funcionar bem em tela de celular).

**Skill**: `copywriting` pro texto de cada balão; `apple-design`/
`emil-design-eng` como critério de polimento depois da primeira versão;
`prototype` (ou `ui-visual-composition` como alternativa confirmada
disponível) pra testar 2-3 composições de balão antes de fixar.

---

## 5. Bento grid de recursos (item 3) — 🔲 pendente, maior risco técnico

**Arquitetura**: `components/BeneficiosHorizontais.tsx` já tem 2 modos por
`fixar = largura >= 1100 && altura >= 720 && !reduzirMovimento`:
sticky-scroll (`translate3d` por scroll) e `ScrollView` de toque com
teclado/progresso/fades. O bento é um **terceiro modo VISUAL mas um
quarto ESTADO de decisão** — "amplo o bastante pra bento" e "amplo o
bastante pra sticky-scroll" não são o mesmo critério, os dois não podem
ficar ativos ao mesmo tempo.

**Mudanças em `BeneficiosHorizontais.tsx`**:
- `bento = largura >= 1100 && !reduzirMovimento` **[ASSUMIDO, mesmo corte
  de `fixar` por analogia — validar visualmente antes de fixar]**.
- `fixar` passa a excluir `bento`: `fixar = !bento && largura >= 1100 && altura >= 720 && !reduzirMovimento`.
  O `useEffect` de scroll-linked já tem guarda `if (!fixar...) return` —
  herda proteção automaticamente, mas **testar ao vivo** redimensionando a
  janela entre os 3 modos, sem listener órfão.
- Novo ramo JSX: `if (bento) return (<View CSS Grid>...)` antes do
  `if (!fixar)` existente. `display: 'grid'` via `as any` (mesma regra de
  CSS puro), `gap: spacing.lg` (16px, bate exato com o `gap:16px` do
  teardown).
- Campo novo no tipo `BeneficioHorizontal`: `tamanho?: 'normal' | 'grande'`
  (undefined = normal, retrocompatível).
- `MiniMockBeneficio.tsx`: 2 variantes novas de `VarianteMock` —
  `'jornada'` e `'fechamento'` (conteúdo na seção 6 abaixo). Checar se a
  prop `destaque` já existente produz diferenciação visual reaproveitável
  pro card `'grande'` antes de inventar sistema paralelo.

**Composição** (referência do teardown seção 3, adaptada — não copiada
literalmente): grid de colunas, 1-2 cards em destaque (radius 20px, cor
sólida) entre os demais neutros. **[ASSUMIDO]** Os 2 cards `'grande'` são
Jornada + Fechamento do mês (item 6 abaixo) — são os 2 cards novos, mais
"vendáveis"; se o autor preferir destacar 2 dos cards de produto já
existentes, é um ajuste de array, não estrutural.

**Risco**: `alturaCard = 300` fixo hoje só se aplica no compacto — o bento
não deve herdar altura fixa pro card `'grande'` (a hierarquia É o tamanho
maior). Confirmar que o bento não fica dentro de nenhum container com
`height: alturaPalco` calculado por JS (isso é exclusivo do modo sticky).
**O modo carrossel atual (compacto) precisa continuar bit-a-bit idêntico
ao que existe hoje** — já foi endurecido com teclado, indicador de
progresso, fades reativos, não pode regredir.

**Skill**: `prototype` (ou `ui-visual-composition` como alternativa) pra
gerar 2-3 composições antes de fixar corte de largura / quantidade de
destaque / radius — este é o item com mais decisão de composição em
aberto. Depois, `emil-design-eng`/`apple-design` como critério de
polimento.

---

## 6. Cards "Jornada" e "Fechamento do mês" (item 4) — 🔲 pendente

**Não é feature nova** — confirmado por exploração de código. Só copy + 2
entradas em `BENEFICIOS_LANDING` (`app/index.tsx`) + 2 variantes em
`MiniMockBeneficio.tsx`. **Depende do item 5 (bento) existir primeiro.**

**Card "Jornada"**: reaproveitar a linguagem já validada em
`PILARES_HABITO` (`app/index.tsx`) — Score Grana (0-1000,
`lib/gamification.ts`, função `calculateScoreBreakdown`), streak
(`calculateStreakAndWeek`), conquistas nominais confirmadas no código
(Primeiro Registro, Ritmo Inicial, Semana Blindada, Hábito Inquebrável,
Centurião Financeiro, Arquiteto de Gastos, Pontualidade Britânica,
Guardião dos Vencimentos, Mês Verde, Primeira Fortaleza, Visão Completa,
Mapeador 360°). **Nunca mencionar XP/Elos como algo ganho ao registrar
gasto** — XP vem exclusivamente de aportes em cofrinho
(`lib/gamification-infinite.ts`).

**Card "Fechamento do mês"**: feature real,
`components/MonthlyWrappedModal.tsx` — retrospectiva do mês fechado, 7
slides navegáveis por toque, sem avanço automático, sem vermelho de
alarme (`theme.down`, nunca `theme.danger` — decisão de tom já
documentada e implementada: "o Grana. escuta sem julgar"). **Não existe
slide de "quanto guardou"** nos 7 atuais — não prometer isso na copy a
menos que o autor peça adicionar esse slide de verdade ao modal (fora de
escopo deste plano).

**Skill**: `copywriting`, restrito às features reais documentadas acima.

---

## 7. Captura das 5 telas (item 1, Passo 0) — ✅ concluído

Login na conta de demonstração (credenciais em memória local,
`conta-prints-internos-app.md`, nunca no repositório). Modo "Dados de
exemplo" ligado só em memória (`lib/demo-context.tsx`, `useState`, some ao
recarregar — precisa navegar por dentro do app depois de ligar, nunca por
URL direta). Badge "(exemplo)" do cabeçalho ocultada via DOM na hora da
captura, nunca no código.

**Capturas em `public/telas/`**: `lancamentos-mobile.png`,
`credito-mobile.png`, `contas-mobile.png` (novas),
`inicio-mobile.png`/`desafios-mobile.png` (recapturadas).

**Achado adicional durante a execução**: `lib/demo-data.ts` tinha datas
literais em agosto/2026 — setembro chegou e o modo de exemplo passou a
abrir um mês vazio de verdade (não só nas capturas, no PRODUTO). Corrigido
com `esteMes()`/`mesesAtras()`/`mesesAFrente()` relativas a `new Date()`,
mais 5 meses de histórico variado (mês de viagem, mês magro, décimo
terceiro) e parcelas com janelas de sobreposição diferentes, pra o
gráfico de "Comprometimento futuro" ter pico/queda reais — pedido
explícito do autor ("gráfico mais expressivo, com mais altos e baixos").

**Ainda falta**: recapturar `conquistas-web.webp` (1440×900) — ver seção 4.

---

## 8. Carrossel navegável de 5 telas (item 1) — ✅ concluído

**Arquivo**: `components/CarrosselTelasApp.tsx` (novo), nova seção
`nativeID="telas"` ("Por dentro do aplicativo.").

`components/MolduraCelular.tsx` ganhou `indiceControlado?: number`:
quando fornecido, desliga o crossfade automático por `@keyframes` e cada
quadro vira uma camada com `opacity`/`transition` CSS controlada de fora.
Flutuação idle (`translate3d`) continua intacta.

**Ajuste em relação ao plano original**: controles usam pílulas com NOME
de cada aba (Início, Débito e Pix, Crédito, Boletos, Desafios), não
setas + "N de 5" — decisão tomada durante a execução porque aqui cada
tela é identificável, ao contrário dos cards de benefício
intercambiáveis, pra quem o plano original tinha copiado o vocabulário.
Teclado (ArrowLeft/Right) e `accessibilityLiveRegion` mantidos do
vocabulário de `BeneficiosHorizontais.tsx`.

---

## 9. Verificação

**Gate mínimo, sempre**: `npx tsc --noEmit` e `npm run test:parser` — já
rodado limpo depois de cada mudança da sessão de 03/09/2026 (312/312
guardas do design system). **Rodar de novo depois que os itens 4-6
fecharem.**

**Larguras obrigatórias de QA visual**: 390×844 primeiro sempre (70% do
foco, pedido explícito do autor), depois 1024-1100px (limite do corte
bento/fixar — maior risco, confirmar que só um modo está ativo nunca os
dois), 1280-1440px, 1440-1600px.

**Por item, o que olhar** (itens 4-6, ainda não verificados):
1. Painel web: balões não sobrepõem o cabeçalho sticky, nenhum balão usa
   vermelho.
2. Bento: modo compacto idêntico ao que já existe hoje (comparar
   screenshot antes/depois em 390px); scroll-linked nunca roda com bento
   ativo; redimensionar ao vivo entre os 3 modos não trava a página.
3. Cards Jornada/Fechamento: nenhuma menção a XP por lançamento, nenhuma
   menção a "quanto guardou", nomes de conquistas batem exato com o
   código.

**Acessibilidade transversal**: todo controle novo precisa de
`accessibilityLabel`/`aria-label`.

**Depois de tudo**: reler `docs/marketing/2026-09-03-dinzo-design-teardown.md`
§6 ("O que NÃO dá pra copiar") contra o resultado final. Rodar
`grana-app:impeccable` como auditoria final de craft do conjunto.
Atualizar `context.md` com o fechamento total.

---

## Mapa de skills por etapa (itens pendentes)

| Etapa | Skill |
|---|---|
| Painel web — compor balões de anotação | `prototype` (fallback `ui-visual-composition`) |
| Painel web — copy dos balões | `copywriting` |
| Painel web — polimento final | `apple-design`, `emil-design-eng` |
| Bento grid — compor corte/hierarquia | `prototype` (fallback `ui-visual-composition`) |
| Bento grid — se aparecer tentação de lib de grid nova | `pick-ui-library`, mas rejeitar qualquer sugestão que crie dependência nova de animação (regra permanente do projeto) |
| Cards Jornada/Fechamento — copy | `copywriting`, restrito às features reais da seção 6 |
| Todas as seções juntas, ao final | `emil-design-eng`, `apple-design` |
| Última etapa | `grana-app:impeccable` |
| Nunca | qualquer skill de GSAP/Framer Motion/lib de animação nova — conflita com a regra permanente do projeto (`Animated` nativo ou CSS puro via `as any`) |

Nota: `prototype` e `pick-ui-library` apareceram como pacotes instalados
mas não confirmados em toda listagem de skills de sessão — confirmar
disponibilidade real no início da execução de cada item; se ausentes,
usar os fallbacks já indicados (`ui-visual-composition`, `interface-design`,
`frontend-design`, confirmadas disponíveis nesta sessão).
