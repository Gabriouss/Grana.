# Impeccable Audit — Grana.

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
| 4 | Conformidade de plataforma | **4/4** | Native Tabs com SF Symbols/Material Symbols, Switch nativo, Predictive Back |
| 5 | Adaptatividade | **4/4** | Classes de janela em toda plataforma, orientação livre, insets corretos |
| **Total** | | **19/20 — Excellent** | Só Performance segue em 3/4; nenhum P0/P1 aberto |

Histórico: 8/20 (auditoria inicial) → 13/20 → 18/20 → **19/20** (28/08).

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
