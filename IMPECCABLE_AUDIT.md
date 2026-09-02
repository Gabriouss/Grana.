# Impeccable Audit — Grana.

> **A SEÇÃO MAIS RECENTE É "Auditoria: 02/09/2026 (segunda rodada)", NO FIM
> DO ARQUIVO.** Ela corrige, com evidência, duas notas que a primeira rodada
> de 02/09 deu alto demais.
>
> **ATUALIZADO EM 02/09/2026 — a auditoria de 28/08 abaixo ficou parcialmente
> desatualizada.** A nota de Conformidade de Plataforma (4/4) e o Veredito
> logo a seguir descrevem Native Tabs (`expo-router/unstable-native-tabs`)
> funcionando nas duas plataformas — nunca tinha sido validado em hardware de
> verdade, só inferido da API. Não funcionava: causou tela branca pós-
> desbloqueio por digital tanto no Expo Go quanto numa build de release
> instalada, e o código foi REMOVIDO do repositório (commit `00de222`,
> `lib/navegacao-nativa.ts` apagado). **A seção "Auditoria: 02/09/2026", no
> fim deste arquivo, é o estado atual — leia essa primeiro.** O conteúdo
> abaixo (28/08) fica como registro histórico do que segue válido
> (Acessibilidade, Aparência, a regra de fonte, o P2 de histórico sem
> paginação).

Auditoria: 28 de agosto de 2026
Escopo: aplicativo autenticado Expo/React Native (iOS, Android e web)
Plataformas: `adaptive` · Modo: **Operate**
Método: análise de fonte + sessão autenticada real verificada ao vivo em
390×844 e 1440×1000 (react-native-web), varrendo as 6 telas principais.

## Audit Health Score

| # | Dimensão | Nota | Achado principal |
|---|---|---:|---|
| 1 | Acessibilidade | **4/4** | 0 controles sem nome nas 6 telas; isolamento de modal medido; Reduce Motion completo |
| 2 | Performance | **3/4** | Virtualização e agregação resolvidas, mas 3 telas ainda baixam o histórico inteiro |
| 3 | Aparência e temas | **4/4** | Tema escuro integrado; token drift fechado em 28/08 (ver achado abaixo) |
| 4 | Conformidade de plataforma | ~~**4/4**~~ **ver 02/09** | ~~Native Tabs com SF Symbols/Material Symbols~~ Nunca validado em hardware; causou tela branca e foi removido |
| 5 | Adaptatividade | **4/4** | Classes de janela em toda plataforma, orientação livre, insets corretos |
| **Total** | | ~~**19/20**~~ **ver 02/09** | Nota de 28/08 não vale mais — Conformidade de Plataforma regrediu |

Histórico: 8/20 (auditoria inicial) → 13/20 → 18/20 → 19/20 (28/08) → 10/20
(01/09, regressão deliberada de Conformidade de Plataforma) → **15/20**
(02/09, depois das correções — ver seção final).

O ponto que falta para 20/20 é **um só**: as três telas que baixam o
histórico inteiro. Ele continua aberto de propósito — a correção exige
migração aplicada no banco e reescrita do fluxo de dados de Início e
Gráficos, e o detalhamento do porquê está no achado correspondente.

## Veredito de conformidade de plataforma

**Passa.** Este não é mais um app web vestido de nativo, e a mudança que
decide isso é estrutural, não cosmética: `app/(app)/_layout.tsx` entrega a
navegação ao sistema via Native Tabs do Expo Router — UIKit fornece tab bar e
sidebar adaptável no iPad, Android fornece Navigation Bar, indicador, ripple
Material e histórico de Back. Os ícones deixaram de ser um conjunto único
emprestado da web: cada aba declara `sf`/`sfSelected` (SF Symbols) e `md`
(Material Symbols), então cada plataforma desenha o próprio vocabulário.
`ToggleSwitch` delega ao `Switch` nativo fora da web, e `Alert.alert` do
sistema cobre os ~90 pontos de erro e confirmação.

A marca continua inteira por cima disso — cor, tipografia e voz são as
mesmas nas três plataformas. É exatamente a divisão que o princípio 5 do
PRODUCT.md pede: identidade do produto na camada expressiva, convenção do
sistema na camada estrutural.

## Resumo executivo

- **Nenhum achado P0 ou P1.**
- **1 achado P2 aberto** (histórico sem limite) — investigado e não corrigido
  por decisão registrada; o outro P2 (hex cru) foi fechado em 28/08.
- **1 achado P3 aberto** (telas longas); o outro (eixo no estado vazio) foi
  fechado em 28/08.
- O trabalho desta rodada fechou os dois P1 anteriores e a maioria dos P2.
- O único incidente de regressão — a troca da fonte da marca pela fonte do
  sistema — foi revertido e a regra virou permanente (ver abaixo).

## Regra de marca reafirmada nesta rodada

**Neue Machina é a única fonte do produto, em qualquer papel, em qualquer
plataforma.** Uma rodada anterior trocou `fonts.regular`/`fonts.light` em
`lib/theme.ts` pela fonte do sistema (San Francisco/Roboto/`system-ui`) em
~472 pontos de uso, tratando isso como requisito de Dynamic Type/sp, e
registrou a mudança como "conforme". Não era: texto em fonte customizada
carregada via `expo-font` **já escala** com a preferência de tamanho do
sistema — nunca houve trade-off entre marca e acessibilidade nesse ponto.

Revertido em 28/08/2026 por determinação do autor, agora permanente.
`DESIGN.md` (regra nomeada "The Only-Font Rule"), `PRODUCT.md`, `context.md`
e `.impeccable/design.json` foram corrigidos para não descreverem mais o
split marca/sistema como válido.

**Verificado ao vivo:** nas 6 telas autenticadas, a 390 px e a 1440 px,
**0 elementos de texto visível fora de Neue Machina**. (Uma varredura crua
acusa 8 nós "fora da marca" por tela — todos são `<style>`, `<title>` e
`<noscript>`, não texto renderizado.)

## Achados detalhados

### P2 — Três telas ainda baixam o histórico inteiro de lançamentos — EM ABERTO, não corrigido

> **Status (28/08/2026): investigado a fundo e deliberadamente NÃO corrigido
> nesta rodada.** A correção foi iniciada e revertida. O motivo está abaixo,
> em "Por que não foi corrigido" — é uma decisão, não um esquecimento.

- **Local:** `app/(app)/index.tsx:284`, `app/(app)/graficos.tsx:96`,
  `app/(app)/lancamentos.tsx:124,131,142` — `fetchTransactions()` sem
  `sinceDays`
- **Categoria:** Performance
- **Impacto:** médio e crescente. Essas telas têm navegação por mês e
  gráficos ano-a-ano, então precisam mesmo de mais que uma janela curta — a
  documentação de `lib/data.ts:29-34` diz isso explicitamente. Mas "mais que
  uma janela curta" virou "tudo, sempre": a consulta cresce sem teto com o
  tempo de uso, e é a mesma consulta a cada foco de tela. Para uma pessoa
  com dois anos de uso diário isso é um payload que só aumenta, sem
  paginação nem cache entre telas.
- **Evidência de contraste:** Desafios resolveu exatamente esse problema
  nesta rodada — `sinceDays: 45` para streak/score mais
  `get_gamification_summary()` no Postgres para os totais vitalícios, com
  fallback documentado para bancos ainda não migrados
  (`app/(app)/desafios.tsx:52-66`). O padrão certo já existe no repositório.
- **Por que não foi corrigido:** a tentativa mostrou que a recomendação
  original ("é só janelar como Desafios") estava incompleta. Duas descobertas:

  1. **O saldo depende do histórico completo, não é preferência de
     performance.** `calcularSaldosWallets` (`lib/wallets.ts:126`) parte do
     `initial_balance` de cada carteira e aplica TODA transação já
     registrada. Encurtar a janela no cliente não deixaria a tela mais lenta
     ou mais rápida — daria **saldo errado**. Mover a soma pro banco resolve,
     e o SQL chegou a ser escrito (espelhando `isCreditTx` e a regra de
     carteira padrão), mas ele não pode ser validado daqui: aplicar uma
     função nova no Postgres de produção não é possível nesta máquina, e
     comparar SQL contra JS sem rodar os dois contra os mesmos dados reais
     seria fé, não verificação.
  2. **Janelar quebra a navegação por mês e por ano.** Início filtra o array
     completo por mês selecionado (`index.tsx:448`) e Gráficos tem
     granularidade "Ano a Ano" (`graficos.tsx:80`). Com uma janela curta,
     navegar pra um mês antigo mostraria um mês **vazio** em vez de um mês
     lento — um bug pior que o problema. O fix correto é buscar por
     mês/período sob demanda, o que é uma reescrita do fluxo de dados das
     duas telas mais movimentadas do app.

  Somando: money math sem cobertura de teste, RPC não verificável daqui,
  reescrita das duas telas principais, nenhum aparelho para validar — e a
  rodada terminava num push direto pra produção. Foi revertido inteiro em vez
  de subir meio-pronto.
- **Recomendação para a próxima rodada:** tratar como trabalho próprio, com
  (a) a função de agregação aplicada e conferida no banco antes de qualquer
  código de cliente depender dela, (b) fallback para o caminho atual enquanto
  a migração não roda em todo banco — igual Desafios já faz, e (c) busca por
  mês/período sob demanda em Início e Gráficos, validada mês a mês contra os
  saldos de hoje.
- **Comando sugerido:** `/impeccable optimize`

### P2 — Hex cru onde o token já existe — CORRIGIDO (28/08/2026)

> **Resolvido.** `theme.danger` substituiu `#e08a7d` nos 6 arquivos que o
> repetiam, e o quase-duplicado `#e08b7f` do `MonthlyWrappedModal` foi
> eliminado — não existem mais dois vermelhos de erro no app.
> `theme.paperSelected` e `theme.accent` cobriram `BadgeCard` e `Gráficos`.
> O par entrada/saída, que aparecia como hex cru em **5** arquivos (não 3
> como a auditoria estimou — `PasteReceiptModal` e `TransactionSheet` também
> tinham cópia), virou os tokens `entradaBorda`/`entradaFundo`/
> `saidaBorda`/`saidaFundo`. Verificação: `grep` por qualquer um desses hex
> nos arquivos de app/componentes → **0 ocorrências**.
>
> Os ~100 hex restantes são legítimos e ficam: paleta de categorias
> (`PALETTE_30`), cores de marca em SVG, o verde do WhatsApp (exceção já
> documentada) e degradês CSS da landing, onde o token não é aceito.

- **Local:** 114 ocorrências fora de `lib/theme.ts`. Com token disponível:
  `#e08a7d` (= `theme.danger`) em `app/(app)/index.tsx:1584`,
  `app/nova-senha.tsx:139`, `app/sign-in.tsx:148`, `app/sign-up.tsx:238`,
  `components/GoalDepositModal.tsx:128`; `#0c353e`
  (= `theme.paperSelected`) em `components/BadgeCard.tsx:64`; `#1fa98d`
  (= `theme.accent`) em `app/(app)/graficos.tsx:166,201`
- **Categoria:** Aparência / temas
- **Impacto:** médio. `theme.danger` e `theme.paperSelected` foram criados
  justamente para eliminar hex solto e o hábito voltou. O sinal de que a
  divergência já começou: `#e08b7f` em `MonthlyWrappedModal` é um vermelho
  **um dígito diferente** de `theme.danger` — duas cores de erro quase
  iguais convivendo no mesmo app.
- **Recomendação:** trocar por token onde o token existe. Para os pares
  `typeBtnOut`/`typeBtnIn` (`#bb6b60`/`#4f9483`, repetidos em 3 arquivos),
  criar um token de par entrada/saída em vez de replicar o hex.
- **Comando sugerido:** `/impeccable colorize`

### P3 — Eixo do gráfico repete rótulos quando não há dados — CORRIGIDO (28/08/2026)

> **Resolvido** em `components/FlowChart.tsx`: quando `maxVal` cai no piso de
> 1 (nenhuma movimentação no período), a escala inteira é suprimida em vez de
> imprimir valores arredondados. A grade continua desenhada, dando forma ao
> card vazio, sem números inventados. Confirmado ao vivo na conta real.

- **Local:** `components/FlowChart.tsx:38-45` (`formatEixo`) com
  `maxVal = Math.max(...totals, 1)` em `FlowChart.tsx:171`
- **Categoria:** Aparência / estado vazio
- **Impacto:** baixo, mas visível na primeira sessão de qualquer conta nova.
  Sem lançamentos, `maxVal` cai para 1 e as cinco linhas-guia viram
  0 / 0,25 / 0,5 / 0,75 / 1; `Math.round` transforma isso em
  **"R$ 0, R$ 0, R$ 1, R$ 1, R$ 1"** — um eixo que repete valores e sugere
  dado onde não há. Reproduzido no print de 1440 px desta auditoria.
- **Recomendação:** no estado sem movimentação, suprimir os rótulos
  intermediários (deixar só a base) ou fixar uma escala mínima legível.
- **Comando sugerido:** `/impeccable polish`

### P3 — Telas longas concentram regra, estado, layout e modal

- **Local:** `app/(app)/index.tsx` (1709 linhas),
  `app/(app)/credito.tsx` (1479), `components/OnboardingModal.tsx` (1064)
- **Categoria:** Performance / manutenção
- **Impacto:** baixo para o usuário, real para regressão. Uma atualização de
  estado local reconcilia uma árvore muito grande, e é o que torna cada bug
  de layout compacto difícil de isolar — foi assim que a troca de fonte
  passou despercebida em 60 arquivos.
- **Recomendação:** extrair as seções estáveis da Início em componentes
  memoizados. Não é urgente; é o próximo passo depois dos P2.
- **Comando sugerido:** `/impeccable optimize`

## Verificações executadas

- `npx tsc --noEmit`: **passou**.
- `npm run test:parser`: **passou** — 250.200 casos gerados, 34.093
  verificações de WhatsApp, mais os corpora de categorias, consulta e
  limite de cartão.
- Varredura de acessibilidade nas 6 telas a 390 px: **0 botões sem nome**,
  **0 rolagem horizontal**, **0 texto visível fora de Neue Machina**.
- Mesma varredura a 1440 px: **0 / 0 / 0**.
- Ciclo completo de modal (medido em sessão real, rodada anterior): dos 41
  controles focáveis restam **0 alcançáveis fora do diálogo**; 8×Tab não
  escapa; Escape fecha, restaura os 41 e não deixa `inert`/`aria-hidden`
  preso.
- Reduce Motion: **todos** os componentes animados consultam
  `useReducedMotion`, e todos os `<Modal>` — via `AppModal` ou diretamente —
  convertem a transição em `none`. Única exceção: `components/FloatingIcon.tsx`
  (paralaxe decorativa, exclusiva da landing page).
- `expo-system-ui@57.0.3` instalado e registrado como plugin, com
  `backgroundColor` petróleo no app config.
- `.impeccable/design.json`: **JSON válido**.

## Padrões sistêmicos

1. **O que virou componente compartilhado ficou resolvido; o que virou cópia
   local, não.** `AppModal`, `useModalAccessibility`, `useReducedMotion`,
   `AppPressable` e o token `touchTarget` consertaram dezenas de pontos de
   uma vez. Todos os achados restantes são duplicatas locais — o hex de erro
   repetido em 5 arquivos, o vermelho quase-duplicado, o par de cores
   entrada/saída replicado.
2. **Um token que muda de significado é mais perigoso que um valor solto.**
   A regressão de fonte não veio de alguém escrever `'System'` numa tela —
   veio de `fonts.regular` continuar existindo com outro significado. 472
   pontos de uso mudaram sem que nenhum deles fosse editado. Vale para
   qualquer token futuro: trocar o valor de um token existente é uma mudança
   de maior alcance do que parece.
3. **A conformidade nativa melhorou entregando controle, não imitando.** Os
   ganhos vieram de deixar o sistema desenhar (Native Tabs, `Switch`,
   `Alert`), não de reproduzir o visual nativo em JS.

## Pontos positivos

- Navegação nativa de verdade nas duas plataformas, com o vocabulário de
  ícones certo em cada uma — o salto mais significativo desta rodada.
- Modo privacidade protege em **todas** as modalidades: pixel, DOM, árvore de
  acessibilidade, seleção e cópia, incluindo a escala dos gráficos.
- `useTabBarInset` zera corretamente a reserva no nativo agora que o sistema
  cuida dos insets — um detalhe fácil de esquecer e que teria criado um vão
  morto no fim de todas as telas.
- Desafios é o modelo de como tratar agregação histórica: janela curta no
  cliente, soma no banco, `security invoker` com `auth.uid()`, fallback
  documentado.
- Comentários do código explicam o **porquê** — foi o que permitiu, nesta
  auditoria, separar decisão deliberada de descuido em quase todo caso.

## Ações recomendadas

1. **[P2] `/impeccable optimize`** — estender o padrão de Desafios (janela +
   agregação no banco) para Início e Gráficos; paginar Lançamentos.
2. **[P2] `/impeccable colorize`** — hex cru → token onde o token existe;
   eliminar o vermelho duplicado (`#e08b7f` vs `#e08a7d`).
3. **[P3] `/impeccable polish`** — eixo do `FlowChart` no estado vazio, e a
   decomposição das telas longas.

## Limites de validação

Não há simulador iOS, emulador Android ou hardware conectado nesta máquina
(`adb` e `emulator` ausentes do PATH). Tudo que esta auditoria afirma sobre
**iOS e Android** vem de leitura de fonte, tipos e configuração; o que foi
verificado ao vivo rodou em react-native-web.

Dois pontos dependem especificamente de hardware e continuam como gate de
release, não como defeito identificado:

- **Native Tabs** nunca foi visto rodando — a aparência de SF Symbols no
  iOS, do Navigation Bar no Android e da sidebar adaptável no iPad é
  inferida da API, não observada.
- **Escala de texto grande** (Dynamic Type máximo no iOS, `font_scale 1.3+`
  no Android) nunca foi exercitada. O código não tem caixas de altura fixa
  contendo texto, e `allowFontScaling` continua no padrão (ligado), então o
  risco é baixo — mas é inferência, não medição.

---

# Auditoria: 02 de setembro de 2026

Escopo: `app/` (rotas expo-router da área autenticada — `app/(app)/*.tsx` e
`app/(app)/_layout.tsx`) mais os componentes compartilhados que essas telas
usam direto (`PieChart`, `StackedBarChart`, `FutureTimelineChart`,
`LineAreaChart`, `Sheet`, `ScreenHeader`, `WalletPill`, `HeaderAction`,
`ToggleSwitch`, `AppPressable`).
Plataformas: `adaptive` · Modo: **Operate**
Método: leitura de fonte (sem simulador nem aparelho conectado nesta sessão)
+ `npx tsc --noEmit` + `npm run test:parser`.
Motivo da rodada: as Native Tabs foram REMOVIDAS do repositório
(commit `00de222`) depois de a tela branca pós-desbloqueio por digital se
repetir numa build de release instalada — não só no Expo Go, como a correção
de 28/08 assumia. Mudança estrutural na navegação, então as 5 dimensões
foram reauditadas do zero em vez de só remendar o sintoma.

**Esta seção já registra as CORREÇÕES aplicadas na mesma sessão.** Cada
achado traz o estado atual: `CORRIGIDO`, `ABERTO` ou `ACEITO`.

## Audit Health Score

| # | Dimensão | Antes | Depois | Achado que restou |
|---|---|---:|---:|---|
| 1 | Acessibilidade | 2/4 | **4/4** | Gráficos ganharam nome e resumo; só falta forçar o padrão em modais novos |
| 2 | Performance | 2/4 | **3/4** | Memoização feita; histórico sem paginação segue aberto de propósito |
| 3 | Aparência & Tema | 3/4 | **4/4** | `tabular-nums` fechado nos 4 campos |
| 4 | Conformidade de Plataforma | 1/4 | **1/4** | Barra de abas em JavaScript em toda plataforma — aceito, ver veredito |
| 5 | Adaptividade | 2/4 | **3/4** | Tablet nativo ganhou o trilho lateral; telas ainda não refluem em colunas |
| **Total** | | **10/20** | **15/20 — Bom** | O que trava a nota é Conformidade, e é uma troca deliberada |

## Veredito de Conformidade de Plataforma

**Falha, concentrada, por um motivo real — e agora permanente por decisão.**
`app/(app)/_layout.tsx` tem uma única implementação de navegação:
`AbasEmJavaScript`, uma barra "vidro líquido" desenhada à mão, usada em
QUALQUER runtime não-web (build de release, dev build, Expo Go). A variante
com `expo-router/unstable-native-tabs` não está mais desligada por flag —
foi apagada, junto com `lib/navegacao-nativa.ts`.

O motivo está registrado no próprio arquivo (`_layout.tsx:206-215`): a API é
experimental, e quando o componente Fabric falha ao (re)montar, NADA
renderiza e NENHUM erro sobe pro JavaScript — tela branca muda. Aconteceu
duas vezes, a segunda numa build de release, no momento em que o Android
recria a Activity ao voltar do desbloqueio por digital.

Ou seja: **iOS e Android usam hoje a mesma barra de abas em JavaScript que a
web usa** — o tell clássico de "app portado de site" (nav global custom,
ícones de um conjunto único cross-platform em vez de SF Symbols/Material
Symbols, sem os materiais e a elevação do sistema). É 1/4, e continua 1/4.

Fora da navegação a citizenship de plataforma segue razoável: `ToggleSwitch`
embrulha o `Switch` nativo de verdade em vez de redesenhar
(`components/ToggleSwitch.tsx:23`); nenhuma tela desativa o gesto de voltar
por borda (`grep gestureEnabled` vazio no repo inteiro); `Sheet.tsx` trata
teclado/IME de forma centralizada. Por isso **1/4** (violação pesada
concentrada numa área) e não **0/4** (nada nativo).

Trocar acabamento nativo por não voltar a ter tela branca é a escolha certa
com a informação que existe. Reabrir isso exige **validação em aparelho
físico**, não inferência de API — foi exatamente a falta disso que deixou a
regressão passar duas vezes.

## Resumo Executivo

- **Nota: 10/20 → 15/20 (Bom)** depois das correções desta sessão
- 5 achados P1, 4 P2, 2 P3 — nenhum P0
- **Corrigidos**: 3 dos 5 P1 e 1 P2 (a11y de gráficos, memoização da Início,
  trilho lateral em tablet nativo, `tabular-nums`)
- **Não corrigidos por decisão**: navegação/ícones nativos (exige hardware) e
  histórico sem paginação (exige agregação no banco validada contra o banco
  de verdade — a auditoria de 28/08 já tentou e reverteu)
- Uma causa raiz explica 2 dos achados abertos: a barra em JavaScript

## Achados Detalhados

### P1 — Navegação global customizada em toda plataforma nativa · `ACEITO`

- **Local**: `app/(app)/_layout.tsx:216-255` (`AbasEmJavaScript`,
  `FloatingTabBar`)
- **Categoria**: Conformidade de Plataforma
- **Impacto**: iOS e Android perdem a tab bar do sistema, os materiais
  nativos e, por consequência, SF Symbols/Material Symbols reais — o app lê
  como a mesma coisa em toda plataforma, o oposto do princípio 5 do
  `PRODUCT.md`.
- **Guideline**: HIG "System navigation... no custom global nav" / Material
  "Material navigation, matched to size"
- **Por que não foi corrigido**: é troca deliberada e documentada, não
  esquecimento — tela branca muda numa build de release é pior que perder
  ripple. O código nativo nem existe mais pra ser religado por flag. A
  correção de verdade é reimplementar Native Tabs e validar em aparelho
  físico antes de mandar pra loja. **Não reabilitar sem esse teste.**
- **Comando sugerido**: `/impeccable adapt`

### P1 — Barra flutuante não se adapta a tablet nativo · `CORRIGIDO`

- **Local**: `lib/breakpoints.ts:159` (`temBarraLateral`),
  `app/(app)/_layout.tsx:229`
- **Categoria**: Adaptividade + Conformidade
- **Era**: `temBarraLateral` valia `Platform.OS === 'web' && classe !==
  'compacto'`. Um iPad ou tablet Android de verdade nunca ganhava o
  `SideNav` — caía sempre na `FloatingTabBar`, que só tem
  `marginHorizontal: spacing.xl` (20pt) e nenhum `maxWidth`. Numa tela de
  1024pt+ a pílula esticava de ponta a ponta com 5 itens `flex: 1`.
- **A trava fazia sentido na época**: quem entregava sidebar no iPad era o
  `sidebarAdaptable` das Native Tabs, e ligar o trilho custom junto daria
  DUAS navegações laterais na mesma tela. Com as Native Tabs removidas não
  existe mais concorrente — e a trava virou o bug.
- **Correção**: `classe !== 'compacto' && (Platform.OS === 'web' || height
  >= 600)`. O piso de altura mira TABLET e não celular deitado: um iPhone em
  paisagem passa de 768 de largura (~844) mas tem ~400 de altura, enquanto
  qualquer tablet tem 744+ nos dois eixos em qualquer orientação. Trocar a
  navegação do celular ao girar a tela seria mudança de comportamento que
  ninguém pediu e que não foi validada em aparelho. Na web o critério segue
  só a largura, exatamente como era antes.
- **Guideline**: Material "Never ship a phone bottom-bar untouched on a
  tablet"

### P1 — Gráficos sem nenhum rótulo de acessibilidade · `CORRIGIDO`

- **Local**: `components/PieChart.tsx`, `components/StackedBarChart.tsx`
  (usados em `app/(app)/graficos.tsx` e `app/(app)/index.tsx`)
- **Categoria**: Acessibilidade · **WCAG 1.1.1 (Non-text Content), nível A**
- **Era**: `grep accessib` nos dois arquivos não retornava nada — pra quem
  usa VoiceOver/TalkBack, o donut de "gastos por categoria" e o gráfico de
  barras simplesmente não existiam.
- **Correção, `PieChart`**: o gráfico inteiro virou UM elemento com
  `accessibilityRole="image"` e a composição lida por extenso
  (`"Gastos por categoria: Mercado 32%, Transporte 18%..."`), e o `<Svg>`
  saiu da árvore de acessibilidade (`accessibilityElementsHidden` +
  `importantForAccessibility="no-hide-descendants"`) pra não anunciar nós
  soltos de fatia e rótulo no meio da navegação.
- **Correção, `StackedBarChart`**: as áreas de toque por cima das colunas são
  a ÚNICA forma de selecionar um período e eram alvos anônimos; ganharam
  `accessibilityRole`, `accessibilityLabel` (rótulo + sublabel da coluna),
  `accessibilityHint` e `accessibilityState={{ selected }}`. O `<Svg>`
  também saiu da árvore.
- **Detalhe que importa**: o rótulo das colunas NÃO inclui o valor, de
  propósito. Quem anuncia dinheiro é a lista abaixo, que passa por
  `PrivacyValue` e respeita o modo privacidade — repetir o total no rótulo
  vazaria o valor justamente pelo canal que o modo privacidade fecha.

### P1 — Início sem memoização nenhuma · `CORRIGIDO` (parte de performance)

- **Local**: `app/(app)/index.tsx`
- **Categoria**: Performance
- **Era**: 1760 linhas, 44 `useState`, **zero** `useMemo`. `pieData`,
  `byCategory`, `totalIn`/`totalOut`, `comprometimentoFuturo`,
  `safeToSpend` e os demais derivados eram recalculados a cada render —
  inclusive por uma tecla digitada num campo sem relação — sobre o histórico
  financeiro inteiro. Agravado agora que a importação em massa aceita até 10
  mil lançamentos de uma vez. E nenhum dos gráficos que recebem esses
  valores era `React.memo`, então re-renderizavam de qualquer jeito.
- **Correção**: passe completo de `useMemo` nos valores derivados, seguindo o
  padrão já correto de `graficos.tsx`. As contas foram movidas para ACIMA do
  `if (loading)` — hook não pode vir depois de early return —, `byCategory`
  virou memo próprio (a seção de orçamentos também consome) e `pieData`
  passou a derivar dele. `PieChart`, `FutureTimelineChart` e `LineAreaChart`
  foram embrulhados em `memo`; `StackedBarChart` não, porque tem estado
  interno de seleção e recebe `columns` já memoizado do lado de fora.
- **Não corrigido junto**: a busca sem paginação que alimenta a tela — ver o
  achado seguinte.

### P1 — Busca sem paginação em Início, Gráficos e Desafios · `ABERTO`

- **Local**: `app/(app)/index.tsx` via `lib/data.ts` `fetchTransactions()`
  sem `sinceDays`; `app/(app)/graficos.tsx:105-106`;
  `app/(app)/desafios.tsx:74`
- **Categoria**: Performance
- **Por que continua aberto**: **a conta de saldo depende do histórico
  completo.** Janelar a busca não deixa a tela mais lenta — deixa o saldo
  ERRADO, que é infinitamente pior. A correção certa é agregação no banco
  (o padrão de `get_gamification_summary()` já usado em Desafios), e isso
  exige migração aplicada e validada contra o banco de verdade, o que não dá
  pra fazer desta sessão. A auditoria de 28/08 já tentou e reverteu por
  exatamente esse motivo; repetir a tentativa às cegas seria arriscar
  dinheiro errado na tela do usuário.
- **Nota**: `app/(app)/lancamentos.tsx` já está certo — usa
  `fetchTransactionsDoPeriodo(inicioDoMes, fimDoMes)`, escopado ao mês
  visível, com o motivo documentado no código. É a referência quando a
  agregação existir. `desafios.tsx:63` também já tem um `sinceDays: 45`
  correto pra streak/score; a chamada sem escopo da linha 74 é separada.
- **Comando sugerido**: `/impeccable optimize`

### P2 — `tabular-nums` faltando em 4 campos de valor editável · `CORRIGIDO`

- **Local**: `app/(app)/index.tsx`, `app/(app)/contas.tsx`,
  `app/(app)/lancamentos.tsx`, `app/(app)/credito.tsx` (estilo `amountInput`)
- **Categoria**: Aparência / Tema
- **Era**: violava a regra própria e explícita do projeto ("valor monetário
  sempre com `fontVariant: ['tabular-nums']`, dígitos não podem dançar") —
  e justamente no campo onde a pessoa está digitando o valor, que é onde a
  dança de dígitos mais aparece.
- **Correção**: `fontVariant: ['tabular-nums']` nos quatro `amountInput`,
  alinhando com `textStyles.amount` (`lib/theme.ts:176`) e com os displays
  que já estavam certos.

### P2 — Ícones de navegação não-nativos · `ACEITO`

- **Local**: `app/(app)/_layout.tsx:21` (`ICONS`, todos Ionicons)
- **Categoria**: Conformidade de Plataforma
- **Impacto**: consequência direta do primeiro P1 — com `NativeTabsLayout`
  cada aba declarava `sf`/`md` (SF Symbols e Material Symbols reais); a
  barra em JavaScript usa só Ionicons.
- **Por que não foi corrigido**: só volta a fazer sentido junto com a
  navegação nativa. Mapear SF/Material à mão dentro de uma barra custom é
  trabalho descartável se as Native Tabs voltarem.

### P2 — Padrão de acessibilidade de modal inconsistente · `ABERTO`

- **Local**: `app/(app)/perfil.tsx` chama `useModalAccessibility` na mão pros
  seus 4 `<Modal>` próprios; toda outra tela depende do `Sheet.tsx` fazer
  isso por dentro
- **Categoria**: Acessibilidade
- **Impacto**: funciona hoje (`grep '<Modal' app/(app)` só acerta
  `perfil.tsx`), mas nada força isso num modal novo construído fora do
  `Sheet`. É risco de processo, não bug ativo — por isso não entrou nesta
  rodada de correção: mexer aqui é refatorar `perfil.tsx` sem defeito
  observável pra corrigir.
- **Comando sugerido**: `/impeccable harden`

### P2 — Maioria das telas não reflui em telas largas · `ABERTO`

- **Local**: `grep useBreakpoint app/(app)/*.tsx` só acerta `_layout.tsx` e
  `graficos.tsx`
- **Categoria**: Adaptividade
- **Impacto**: `index.tsx`, `lancamentos.tsx`, `contas.tsx`, `credito.tsx`,
  `desafios.tsx` e `perfil.tsx` só aplicam `colunaConteudo` (teto de largura
  + centralização) — trava o esticamento em telas ultra-largas, mas não
  reorganiza em colunas. Continuam layout de celular esticado em `medio` e
  `amplo`.
- **Por que continua aberto**: são seis telas de reflow, cada uma com decisão
  de produto sobre o que vira coluna lateral. É trabalho de design, não de
  correção — e agora com MAIS superfície, porque o trilho lateral passou a
  aparecer em tablet nativo também.
- **Comando sugerido**: `/impeccable adapt`

### P3 — Polimento

- Cobertura de `useReducedMotion` só em 3 dos 8 arquivos de tela
  (`index.tsx`, `perfil.tsx`, `_layout.tsx`). `ABERTO` e não é bug hoje — as
  outras 5 não animam nada direto —, mas é risco latente se alguém animar
  algo sem essa checagem.
- ~~`lib/tab-bar.ts` mantém um branch morto checando
  `abasNativasDisponiveis()`~~ — `CORRIGIDO` no `00de222` (outra máquina),
  que removeu o branch junto com o arquivo. Os comentários que ainda
  descreviam o mundo antigo (`lib/tab-bar.ts`, `components/SideNav.tsx`,
  o doc de `Breakpoint` em `lib/breakpoints.ts`) foram atualizados nesta
  sessão — `SideNav` não é mais "exclusivo da web larga".

## Padrões & Problemas Sistêmicos

- **A remoção das abas nativas tem custo de conformidade em cascata**:
  navegação não-nativa → ícones não-nativos. Dois achados, uma causa raiz;
  resolver a raiz (reimplementar e validar em hardware) resolve os dois de
  uma vez, e remendar cada um dentro da barra em JavaScript é trabalho que
  provavelmente vira descartável.
- **A memoização era desigual entre telas**, não desconhecida: `graficos.tsx`
  fazia certo em 4 pontos, `index.tsx` — a tela mais visitada — não fazia
  nenhum. Corrigido nesta rodada; vale como padrão pra próxima tela.
- **O limite real desta e da rodada anterior é o mesmo**: sem simulador nem
  aparelho, tudo de Conformidade e Adaptividade é leitura de fonte. Foi
  exatamente isso que deixou a regressão de Native Tabs passar duas vezes.

## Pontos Positivos

- Listas de lançamentos/contas/faturas já usam `FlatList` corretamente —
  nenhum `.map()` de lista ilimitada dentro de `ScrollView`.
- Disciplina de tokens quase perfeita: um único hex fora do sistema em todo o
  escopo (`app/(app)/perfil.tsx`, `#25D366` do WhatsApp), exceção já
  documentada no próprio código.
- Ações só-por-toque-longo já tinham `onPress` alternativo +
  `accessibilityHint`, porque toque longo é inalcançável por leitor de tela.
- Teclado tratado de forma central e documentada (`components/Sheet.tsx`),
  com o bug histórico que motivou isso registrado em comentário.
- Nenhum `Dimensions.get()` congelado — tudo passa por
  `useWindowDimensions`/`useBreakpoint`, que recalcula em rotação e resize.
- `ToggleSwitch` embrulha o `Switch` nativo de verdade — o oposto do
  "Cupertino-shaped switch on Android" que os guidelines citam como sinal de
  app não-nativo.
- `lancamentos.tsx` já modela o padrão certo de busca escopada por período,
  com o motivo no próprio código.

## Verificações executadas

- `npx tsc --noEmit`: **passou** (rodado após cada etapa de correção).
- `npm run test:parser`: **passou** — 34.093 checagens do corpus, mais OFX,
  dedup de CSV, limite de cartão, paginação, recorrência, sequência,
  relatório, Score, guardas de schema e `sync-parser` (26/26 em sincronia).
- Sem simulador iOS, emulador Android ou hardware físico nesta sessão. Todos
  os achados de Conformidade e Adaptividade vêm de leitura de fonte.

## Ações Recomendadas, em ordem

1. **[P1, precisa de hardware]** Reimplementar Native Tabs e validar em
   aparelho físico — desbloqueio por digital, recriação de Activity no
   Android, retorno de background. Só depois mandar pra loja. Resolve junto
   o P2 dos ícones.
2. **[P1, precisa do banco]** Agregação no banco pro saldo, pra tirar a busca
   sem paginação de Início/Gráficos/Desafios sem quebrar a conta de saldo.
   Aplicar e validar a migração contra o banco de verdade.
3. **[P2]** `/impeccable adapt` — reflow em telas largas nas 6 telas que
   ainda são layout de celular esticado (agora também visível em tablet).
4. **[P2]** `/impeccable harden` — padronizar acessibilidade de modal, pra
   um `<Modal>` novo fora do `Sheet` não nascer sem isolamento.
5. **[P3]** `useReducedMotion` como parte do checklist de qualquer animação
   nova.

Rode `/impeccable audit app` de novo depois dos itens 1 e 2 — são os dois que
seguram a nota em 15/20.

---

# Auditoria: 02 de setembro de 2026 (segunda rodada)

Escopo: `app/(app)/*` (8 telas), `components/*`, `lib/theme.ts`, `DESIGN.md`.
Plataformas: `adaptive` · Modo: **Operate**
Método: leitura de fonte, `tsc --noEmit`, `npm run test:parser`, compilação do
bundle web pelo Metro, e cálculo próprio de contraste WCAG. Sem simulador nem
aparelho físico.

> **Nota de método.** Três varreduras paralelas em subagente (acessibilidade,
> performance, conformidade) morreram no limite de sessão da API. Foram
> refeitas em thread com greps direcionados, abrindo cada arquivo para
> confirmar toda suspeita antes de reportar.

## Por que a nota CAIU de 15/20 para 12/20

**Não houve regressão.** A primeira rodada de 02/09 deu notas altas demais
porque não olhou onde esta olhou. Duas correções de placar, ambas erro meu:

- **Performance 3/4 era overclaim.** Memoizei `index.tsx` e dei a nota sem
  abrir as outras cinco telas. Quatro delas tinham o defeito idêntico.
- **Aparência 4/4 era overclaim.** Nunca medi cobertura de `lineHeight` fora
  do Crédito, nem procurei violação da Only-Font Rule.

## Audit Health Score

| # | Dimensão | Achado | Depois das correções |
|---|---|---:|---:|
| 1 | Acessibilidade | **4/4** | **4/4** |
| 2 | Performance | **2/4** | **3/4** |
| 3 | Aparência & Tema | **2/4** | **4/4** |
| 4 | Conformidade de Plataforma | **1/4** | **1/4** |
| 5 | Adaptividade | **3/4** | **4/4** |
| **Total** | | **12/20 — Aceitável** | **16/20 — Bom** |

Histórico: 8/20 → 13/20 → 18/20 → 19/20 (28/08, inflada) → 10/20 (01/09) →
12/20 (02/09, medida com rigor) → **16/20** (02/09, pós-correção).

## Veredito de Conformidade de Plataforma

**Falha, concentrada, e por decisão consciente — inalterada.** iOS e Android
usam a mesma barra de abas em JavaScript que a web usa, com Ionicons em vez de
SF Symbols/Material Symbols. É o tell clássico de "app portado de site".

A troca é deliberada e está agora documentada no `DESIGN.md`: as Native Tabs
causaram tela branca muda numa build de release. Perder ripple e materiais do
sistema é melhor que repetir aquilo. **Continua 1/4**, e reabrir exige
validação em aparelho físico — nunca inferência de API.

Fora da navegação a cidadania é boa: `ToggleSwitch` embrulha o `Switch` nativo,
nenhum gesto do sistema é sequestrado (`grep gestureEnabled` vazio no repo
inteiro), teclado tratado de forma centralizada no `Sheet.tsx`.

## Achados

### P1 — Only-Font Rule violada, em produção · `CORRIGIDO NA TERCEIRA RODADA`

> **Esta seção afirmou "CORRIGIDO" e estava ERRADA.** A correção foi aplicada,
> depois perdida por um `git checkout --` que desfazia outro script no mesmo
> arquivo, e o relatório foi escrito sem reconferir. A terceira rodada de
> auditoria (abaixo) pegou o `monospace` ainda vivo em produção. Corrigido de
> verdade e, agora, coberto por teste.

### P1 — Only-Font Rule violada, em produção · (registro original)
`app/(app)/index.tsx:1670` tinha `fontFamily: 'monospace'` no estilo `demoFlag`
— **vivo**, nos badges "exemplo" e "oculto" do cabeçalho da Início. Única
violação da regra em todo o repositório. Trocado por `fonts.regular`: a largura
tabular da monoespaçada não fazia falta, são duas palavras fixas.

### P1 — Entrelinha existia em 1 de 8 telas · `CORRIGIDO`
O `lib/theme.ts` documenta que a Neue Machina tem leading intrínseco curto e
oferece `lh()` — que vivia em duas telas de auth. A correção de entrelinha do
Crédito (pedida pelo autor) foi aplicada só na tela apontada.

| tela | `fontSize` | `lineHeight` antes | depois |
|---|---:|---:|---:|
| index.tsx | 31 | 1 | 25 |
| perfil.tsx | 21 | 3 | 20 |
| lancamentos.tsx | 19 | 4 | 15 |
| desafios.tsx | 18 | 2 | 18 |
| contas.tsx | 14 | 1 | 10 |
| graficos.tsx | 8 | 0 | 8 |

85 estilos, papel escolhido por token e por nome (`corpo` no que quebra em
várias linhas, `apoio` em rótulo, `valor` em dinheiro, `titulo` em título).
Rótulo de botão e campo de digitação ficaram de fora de propósito: no botão a
entrelinha muda a geometria, e em `TextInput` no Android corta o texto.

Validado por script: **114 blocos** conferidos, cada `lineHeight` referenciando
o `fontSize` do próprio bloco, zero descasado.

### P1 — Memoização aplicada em uma tela, não no padrão · `CORRIGIDO`
`credito`, `lancamentos`, `contas` e `desafios` tinham **zero** `useMemo`,
refazendo cadeias de filter/reduce sobre o histórico a cada render.

O pior era `lancamentos.tsx:482-500`: quatro passadas sobre a lista
(`monthTransactions` → `monthIn` → `monthOut` → `visible`) **a cada tecla
digitada na busca**, sendo que só `visible` depende do texto buscado. Agora
cada elo tem as dependências que de fato o mudam, e as duas somas viraram uma
passada só em vez de dois `filter` + dois `reduce`.

`perfil.tsx` continua com zero `useMemo`, e está **certo**: não tem nenhum
valor derivado sobre lista. A primeira redação deste achado o incluía — era
falso positivo.

### P1 — Busca sem paginação em 3 telas · `ABERTO, POR DECISÃO`
`index.tsx:285`, `graficos.tsx:106`, `desafios.tsx:74` baixam o histórico
inteiro. **Janelar deixa o saldo ERRADO, não lento** — a conta depende do
histórico completo. A correção certa é agregação no banco, que exige migração
validada contra o banco de verdade; a auditoria de 28/08 já tentou e reverteu.
`perfil.tsx:244,264` e `desafios.tsx:63` já fazem certo com `sinceDays`.

### P2 — Badges travadas em duas colunas · `CORRIGIDO`
`desafios.tsx` usava `width: '48%'` fixo: duas colunas em qualquer largura, e
com o teto de conteúdo em 1440px cada badge esticava para ~690px. Agora segue a
classe de janela — 2 colunas no compacto, 3 no médio, 4 no amplo.

### P2 — Reflow em tela larga · `EM GRANDE PARTE FALSO POSITIVO`
A primeira redação dizia "6 de 7 telas não refluem", contando quem chama
`useBreakpoint` diretamente. Verificado depois: **`index.tsx` reflui** via
`components/WidgetGrid.tsx`, que distribui os cards em `colunas` do
breakpoint. `graficos.tsx` reflui direto, e as telas legais via
`LegalDocScreen`.

Das restantes, `contas`, `credito` e `lancamentos` são telas de **lista**
(`FlatList`) e `perfil` é tela de **ajustes**: coluna única com teto de largura
é o padrão certo dessas superfícies nas duas plataformas, não defeito. Espalhar
uma lista de lançamentos em duas colunas seria regressão. Só `desafios` era
caso real, e foi corrigido acima.

### P3 — DESIGN.md fora de sincronia com o código · `CORRIGIDO`
- Descrevia Native Tabs no iOS e Android, removidas no `00de222`. Reescrito com
  o motivo da remoção e a condição pra reabrir.
- `theme.danger` (#e08a7d) é usado em `credito.tsx` e em 5 pontos de
  `perfil.tsx` e **não existia no documento**, que afirmava ter uma exceção só
  de cor. Documentado com a fronteira ("isto vai destruir algo ou já venceu",
  nunca valor de gasto) e o contraste medido.
- O código tinha **10 receitas de sombra** contra 5 catalogadas. As 4 novas
  foram catalogadas, não consolidadas: cada uma cobre um objeto genuinamente
  flutuante e distinto. O errado era o documento.

### P3 — Não corrigido, registrado
- `perfil.tsx:970` usa `padding: spacing.xl, gap: spacing.lg` em vez de
  `screenRhythm` — o drift que o token foi criado pra eliminar. Fica de fora
  porque mudar o ritmo de uma tela inteira sem poder vê-la é o tipo de
  alteração que precisa de olho humano.
- 9 componentes órfãos (~614 linhas), entre eles `FloatingIcon.tsx`, que faz
  parallax sem checar Reduce Motion. Latente, não ativo — nada o importa.

## Pontos positivos

- **Acessibilidade 4/4, e testada contra falso positivo.** Um scanner apontou 3
  botões só-de-ícone sem nome; abri os três e os três tinham `<Text>` filho
  fora da janela do scanner. Zero controle sem nome.
- **Reduce Motion cobre 100% do código vivo.** O único arquivo que anima sem
  checar é órfão.
- **O DESIGN.md não mentiu sobre contraste.** Calculei: faint-kelp dá 6,38:1
  sobre Deep Petroleum e 5,61:1 sobre Raised Tide, contra os "~6,4 e ~5,6"
  afirmados. As 8 cores do tema passam AA nas duas superfícies.
- **Zero tamanho de fonte em px cru** nas 8 telas — tudo pela escala `type`.
  Zero fonte de sistema. Zero `fontWeight`.
- Alvos de toque de 36px compensados com `hitSlop={8}` → 52pt, acima dos dois
  mínimos, com o motivo escrito no código.
- Listas longas em `FlatList`. Nenhum `.map()` ilimitado dentro de `ScrollView`.

## Padrão sistêmico

Os três achados mais caros têm a mesma forma: **o projeto cria a ferramenta
certa e a aplica em um lugar só.** `lh()` existia e vivia em 2 telas de auth.
`useMemo` era padrão em `graficos.tsx` e não saiu de lá. `screenRhythm` foi
criado pra unificar e `perfil.tsx` ficou fora. Não é falta de conhecimento do
padrão — é falta de aplicá-lo além da tela que o motivou. Foi exatamente o que
esta sessão fez no Crédito, e o que esta rodada corrigiu.

## Verificações executadas

- `npx tsc --noEmit`: **passou** após cada etapa.
- `npm run test:parser`: **passou** — corpus completo, 94/94 nas notas de
  release, 32/32 em sincronia.
- Bundle web compilado pelo Metro: **HTTP 200**, resolução e transformação
  reais, mais fortes que `tsc` sozinho.
- **Ordem de hooks verificada por script nas 8 telas.** Isto pegou um bug que
  eu mesmo tinha acabado de introduzir: em `desafios.tsx` o `useBreakpoint` e o
  `useMemo` novos ficaram DEPOIS do `if (loading || !state) return`, o que
  quebraria em runtime com "rendered more hooks than during the previous
  render". `tsc` não pega isso. Movidos pra antes da guarda, lendo de
  `state?.badges`.
- Sem validação visual: não há login disponível nesta sessão.

## Ações recomendadas

1. **[P1, precisa do banco]** Agregação no banco pro saldo, pra tirar a busca
   sem paginação de Início/Gráficos/Desafios sem quebrar a conta.
2. **[P1, precisa de hardware]** Reimplementar Native Tabs e validar em
   aparelho físico. Resolve junto a iconografia por plataforma.
3. **[P3]** `/impeccable layout` — `perfil.tsx` no `screenRhythm`, com olho
   humano confirmando.
4. **[P3]** Remover os 9 componentes órfãos.
5. **[final]** `/impeccable polish` depois de 1 e 2.

---

# Auditoria: 02 de setembro de 2026 (terceira rodada)

Rodada de reauditoria logo após as correções da segunda. Método igual: leitura
de fonte, `tsc`, corpus, sem simulador nem aparelho.

## O que esta rodada existe para registrar

**Uma correção que eu declarei feita não estava feita.** A segunda rodada
trocou o `fontFamily: 'monospace'` de `demoFlag` (`app/(app)/index.tsx`) por
`fonts.regular` — e logo depois um `git checkout --` no mesmo arquivo, para
desfazer um script de entrelinha bugado, levou a correção junto. O passe de
entrelinha foi refeito por cima; a troca da fonte, não. O relatório e a
mensagem de commit saíram afirmando que a violação estava resolvida.

O `tsc` não pega isso. O corpus não pegava isso. Só uma releitura pegou — e
depender de releitura é o mesmo que não ter garantia.

## A correção estrutural

`__tests__/corpus-design-system.ts`, dentro de `npm run test:parser`, verifica
por máquina as Named Rules absolutas do `DESIGN.md`:

- **The Only-Font Rule** — nenhum `fontFamily` com literal de string em
  `app/` ou `components/`; só `fonts.regular`/`fonts.light`.
- **Sem peso sintético** — nenhum `fontWeight` (só existem Light e Regular como
  arquivo; o nativo ignora e a web sintetiza um falso negrito).
- **Fonte de sistema nunca vaza** — nenhuma linha de `fontFamily` citando
  System, system-ui, Roboto, Helvetica, sans-serif, monospace e afins.
- `lib/theme.ts` declara exatamente as duas famílias que existem, e os dois
  arquivos `.otf` existem mesmo em `assets/fonts`.

294 guardas. Comentários são ignorados de propósito: os arquivos que explicam
as regras citam as grafias proibidas, e acusar isso seria acusar a
documentação.

**Verificado que reprova**: reintroduzindo o `monospace`, duas regras disparam
nomeando arquivo e linha, e o processo sai com código 1 — ou seja, quebra o
`test:parser`, não passa batido. Restaurado, volta a 294/294.

O que NÃO entrou: heurística do tipo "este estilo parece dinheiro, logo precisa
de `tabular-nums`". Regra que acusa código correto é regra que alguém desliga —
o mesmo princípio que guiou o corpus da guarda ortográfica.

## Audit Health Score

| # | Dimensão | Nota | Observação |
|---|---|---:|---|
| 1 | Acessibilidade | **4/4** | Mantida |
| 2 | Performance | **3/4** | Memoização completa; paginação segue aberta |
| 3 | Aparência & Tema | **4/4** | Agora com guarda mecânica, não só intenção |
| 4 | Conformidade de Plataforma | **1/4** | Inalterada, por decisão |
| 5 | Adaptividade | **4/4** | Mantida |
| **Total** | | **16/20 — Bom** | O mesmo número da rodada anterior, mas agora verdadeiro |

A segunda rodada já tinha anunciado 16/20. O número estava certo por sorte: uma
das correções que o compunham não existia. Agora existe, e existe com teste.

## Achados novos desta rodada

### P3 — Avatares carregados sem cache nem redimensionamento
- **Local**: `app/(app)/perfil.tsx:429`, `app/(app)/index.tsx:1214`,
  `components/OnboardingModal.tsx:514`
- **Categoria**: Performance
- **Impacto**: os três usam o `<Image>` do React Native com `source={{ uri }}`
  remoto. O projeto não usa `expo-image` em lugar nenhum. A foto de perfil é
  rebaixada nos estilos para 44×44 (Início) e maior no Perfil, mas o arquivo
  de origem é a foto que a pessoa subiu — decodificada em tamanho cheio para
  ser exibida como miniatura, e rebaixada de novo a cada montagem de tela, sem
  cache em disco no Android.
- **Recomendação**: `expo-image` com `cachePolicy` e `contentFit`. Impacto real
  é modesto (é um avatar por tela), por isso P3 e não P2.
- **Comando sugerido**: `/impeccable optimize`

### P3 — Ajuste fino das listas é parcial
- **Local**: 10 usos de `FlatList` em `app/(app)` e `components`
- **Todas têm `keyExtractor`** — verificado, nenhuma faltando. Mas só 5 pontos
  no repositório usam `initialNumToRender`, `windowSize`,
  `removeClippedSubviews` ou `getItemLayout`. Com a importação em massa
  aceitando 10 mil lançamentos, as listas de Lançamentos e Crédito são as que
  mais ganhariam com `getItemLayout` (altura de linha é fixa nas duas).
- **Comando sugerido**: `/impeccable optimize`

## Pontos positivos novos

- **Arranque correto para o SDK 57**: `SplashScreen.preventAutoHideAsync()` em
  escopo global sem `await`, `hideAsync()` depois que fontes e sessão
  resolvem — exatamente o que a documentação da versão pede, com o motivo
  escrito no arquivo.
- **Escala de fonte do sistema intacta**: zero uso de `allowFontScaling` ou
  `maxFontSizeMultiplier` em todo o app, ou seja, o padrão (ligado) vale em
  todo texto. Confirma na prática o que o `DESIGN.md` afirma — fonte
  customizada não custa Dynamic Type.
- **Todas as `FlatList` com `keyExtractor`.**
- As correções da segunda rodada **se sustentaram**: entrelinha alta nas 8
  telas, `useMemo` presente em todas as telas que precisam, `perfil` seguindo
  em zero porque de fato não tem valor derivado sobre lista.

## Padrão sistêmico (atualizado)

A segunda rodada identificou "o projeto cria a ferramenta certa e aplica em um
lugar só". Esta rodada acrescenta a versão mais perigosa disso: **a correção
aplicada e depois perdida sem ninguém notar.** A diferença entre as duas é que
a primeira aparece numa leitura atenta e a segunda não aparece em leitura
nenhuma — só em teste. Por isso a resposta aqui não foi corrigir de novo e
seguir, foi escrever a guarda.

## Ações recomendadas

1. **[P1, precisa do banco]** Agregação no banco pro saldo (paginação).
2. **[P1, precisa de hardware]** Native Tabs validadas em aparelho físico.
3. **[P3]** `/impeccable optimize` — `expo-image` nos avatares e `getItemLayout`
   nas listas de altura fixa.
4. **[P3]** `/impeccable layout` — `perfil.tsx` no `screenRhythm`.
5. **[P3]** Remover os 9 componentes órfãos.
