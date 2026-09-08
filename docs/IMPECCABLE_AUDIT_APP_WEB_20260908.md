# Auditoria Impeccable — Grana. app e desktop web

Data: 08/09/2026. Modo: Operate. Plataforma `adaptive`, então a avaliação segue
a referência nativa (iOS HIG + Material 3) a partir do código-fonte, mais a
superfície web desktop que o autor pediu explicitamente.

**Esta rodada estende a de 07/09** (`IMPECCABLE_AUDIT_APP_WEB_20260907.md`), que
foi declaradamente limitada a ~10 componentes compartilhados. Esta varreu
`app/`, `components/`, `lib/`, `modules/` e o build web. Os achados de ontem que
continuam abertos são repetidos aqui com o status atualizado, para existir um
documento único.

## Método e limites

Auditoria de código, sem execução. **Não houve**: emulador, aparelho físico,
TalkBack/VoiceOver, medição de FPS, teclado físico ou fonte ampliada — esta
máquina não tem JDK, SDK Android nem ADB, e a referência nativa do skill dispensa
navegador para este comando. Nada aqui é certificação de acessibilidade ou de
desempenho; é leitura de implementação com evidência de arquivo e linha.

**Uma das quatro varreduras não concluiu.** A de acessibilidade dedicada falhou
por limite de sessão. A nota de acessibilidade abaixo se apoia na auditoria de
07/09 mais achados incidentais das outras três varreduras, e por isso é a menos
completa das cinco.

## Veredito de conformidade de plataforma

**Falha parcial.** O app não é um site portado: usa `Switch` nativo em
iOS/Android, barra o hover sintético com `(hover: hover) and (pointer: fine)`,
não desabilita gesto nenhum, declara `predictiveBackGestureEnabled: true`, usa
Ionicons em 100% da interface e virtualiza as listas pesadas. A identidade é
própria e coerente.

O que reprova é a **navegação compacta e o tratamento de janela**: sete itens na
barra onde a diretriz manda no máximo cinco, nenhum inset lateral em paisagem,
e a conversa do Granabô ignorando o Voltar do sistema.

## Notas por dimensão

| # | Dimensão | Web | Nativo | Achado principal |
|---|---|---:|---:|---|
| 1 | Acessibilidade | 2/4 | 2/4 | Contraste 2,1:1 no botão do WhatsApp; alvos abaixo do mínimo (incompleta) |
| 2 | Desempenho | 2/4 | 3/4 | 2,82 MB de bundle único e 3,89 MB de fontes de ícone servidos à landing |
| 3 | Aparência e tema | 2/4 | 2/4 | **P0**: saída de dinheiro em vermelho no PDF exportado |
| 4 | Conformidade de plataforma | 3/4 | 2/4 | 7 itens na barra; sem insets laterais; Back ignorado no chat |
| 5 | Adaptatividade | 2/4 | 3/4 | Listas em coluna única esticando até 1440px no desktop |
| **Total** | | **11/20** | **12/20** | Aceitável — trabalho significativo pela frente |

Comparação com 07/09 (14/20 web, 12/20 nativo): a queda **não é regressão**, é
alcance. A varredura de ontem não olhou `lib/`, o PDF exportado, o build web nem
o comportamento em paisagem, que é onde estão os achados mais graves desta.

## Achados

### P0

**1. Saída de dinheiro em vermelho no PDF exportado**
`lib/pdf-report-html.ts:17,398,459,520`. `const VERMELHO = '#a8443c'`, aplicado
via `t.type === 'in' ? 'positivo' : 'negativo'` e no total "Saídas".
Viola a No-Red Rule, que o `DESIGN.md` trata como decisão central da marca: gasto
não é erro, saída usa ciano. O relatório é o artefato que a pessoa **exporta e
compartilha**, ou seja, é onde a regra mais importa e onde ela está quebrada.
Escapou de todos os testes porque o corpus de design system varre só `app/` e
`components/`.
Comando: `/impeccable colorize`.

### P1

**2. Par verde/vermelho no seletor Entrada/Saída**
`lib/theme.ts:50-53` (`entradaBorda: '#4f9483'`, `saidaBorda: '#bb6b60'`), usado
em `index.tsx:1935`, `lancamentos.tsx:824`, `TransactionSheet.tsx:376`,
`PasteReceiptModal.tsx:398`, `GoalDepositModal.tsx:123`. É o semáforo que a
regra proíbe, e `#bb6b60` é o hex que o próprio `DESIGN.md` registra como
"reaproveitado por engano". Nenhum dos dois tokens está documentado.
Comando: `/impeccable colorize`.

**3. Fonte do sistema vazando em dois lugares**
`components/VozesSalvasLocalmente.tsx:40-42` — os três estilos `Text` não
declaram `fontFamily`, então caem na fonte do sistema.
`lib/pdf-report-html.ts:25-26` — a pilha termina em
`-apple-system, ..., Roboto, sans-serif`; se a `@font-face` base64 falhar, o
relatório inteiro sai em Roboto.
A regra da marca proíbe fonte de sistema em qualquer papel. **Aberto desde
07/09** no primeiro caso.
Comando: `/impeccable typeset`.

**4. Contraste reprovado no botão do WhatsApp**
`components/PareamentoWhatsapp.tsx:58,154`: `#fff` sobre `#25D366` ≈ **2,1:1**,
abaixo do mínimo AA de 4,5:1. Os outros três botões idênticos do app usam
`theme.paper` (≈ 8,5:1) — é inconsistência, não decisão.
Comando: `/impeccable harden`.

**5. Sete itens na barra de navegação compacta**
`app/(app)/_layout.tsx:398-403` (6 abas) + `:120-122` (ação do Granabô no
centro). HIG manda 2–5, Material 3 manda 3–5.
Agrava: `:476-481` define `tabItem: { flex: 1, height: 68 }` sem `minWidth`, e
`:501-506` reserva 78px fixos ao centro. A largura por aba é `(W − 118) / 6`,
o que dá **42,8pt em 375pt** (iPhone SE/13 mini) e **33,7pt em 320pt** (Slide
Over). Abaixo dos 44pt/48dp exigidos, na navegação principal.
Nuance a preservar: o botão central está `accessibilityRole="button"` com
`accessibilityState={{ expanded }}` e comentário explicando que é ação, não
destino — isso está **certo** e não deve ser desfeito ao reduzir a barra.
**Aberto desde 07/09.**
Comando: `/impeccable shape`, depois `/impeccable adapt`.

**6. Nenhuma tela aplica inset lateral**
As sete telas logadas usam `SafeAreaView edges={['top']}`; `lib/tab-bar.ts:57` só
lê `insets.bottom`. `app.json:7` traz `"orientation": "default"`, ou seja,
paisagem liberada. Em iPhone com recorte, o inset lateral é ~59pt contra 20pt de
margem: o primeiro ícone e a borda do cabeçalho ficam sob a Dynamic Island.
Só `SideNav.tsx:56` trata `insets.left`, e ele só existe em janela larga.
Comando: `/impeccable adapt`.

**7. Granachat ignora o Voltar do Android e o Esc**
`components/Granachat.tsx:414-425,457`: a conversa é uma `View` absoluta com
`accessibilityViewIsModal`, não um `Modal`. `BackHandler` não aparece em nenhum
arquivo do projeto, e não há listener de Escape ali (o `Sheet.tsx:91-98` tem).
Com o chat aberto, o Back preditivo sai da aba ou fecha o app em vez de fechar a
conversa. Material 3 exige que o Voltar dispense a superfície transitória do
topo.
Comando: `/impeccable harden`.

### P2

**8. Bundle web único de 2,82 MB serve a landing pública**
`dist/_expo/static/js/web/index-*.js`. Sem `metro.config.js` nem
`asyncRoutes`, quem abre a página de marketing baixa supabase-js, `aes-js`,
todas as telas logadas e `lib/heuristics.ts` antes da primeira frase.
Comando: `/impeccable optimize`.

**9. 3,89 MB de fontes de ícone para uma família usada**
19 arquivos `.ttf` no `dist/` (MaterialCommunityIcons sozinho = 1,3 MB), enquanto
`grep` confirma **56 imports, todos Ionicons, zero de qualquer outra família**.
Causa: os 56 imports vêm do barril `@expo/vector-icons`.
Comando: `/impeccable optimize`.

**10. Imagens do herói sem dimensionamento responsivo**
`components/NotebookAnimado.tsx:182,220`: `bg-opacidade.webp` (252 KB, 2523×2523)
e `notebook.webp` (318 KB, 1403×914), ambas `fetchPriority: 'high'`, sem
`srcset`/`sizes`. O celular de 390px baixa a imagem de 2523px.
Comando: `/impeccable optimize`.

**11. Digitar em conta/orçamento re-renderiza a Início inteira**
`app/(app)/index.tsx:1524,1535,1608`. 64 `useState`, 0 `memo`: cada tecla
reconstrói `HOME_BLOCOS` (953–1286), reexecutando `budgets.map`,
`dueThisWeek.map` e `pieData.map` — inclusive para blocos ocultos, já que o
objeto é montado antes do filtro `b.visible` (1433).
Comando: `/impeccable optimize`.

**12. Listas em coluna única até 1440px no desktop**
`lancamentos.tsx:706` e `contas.tsx:408` aplicam `colunaConteudo` sem
`numColumns`. Cada linha estica ~1400px com descrição à esquerda e valor à
direita. `useBreakpoint().colunas` existe e só é consumido por `WidgetGrid`.
Comando: `/impeccable adapt`.

**13. `viewport` sem `viewport-fit=cover`**
`app/+html.tsx:17`. Sem isso, `env(safe-area-inset-*)` volta 0 no Safari iOS e o
`SafeAreaProvider` mede zero na web instalada.
Comando: `/impeccable adapt`.

**14. Aviso de pendências sem alvo mínimo nem anúncio de estado**
`components/VozesSalvasLocalmente.tsx:42`: `paddingVertical: 8` com texto 15,
sem `minHeight: touchTarget` nem `hitSlop` — não chega aos 48dp do Android. A
troca de mensagem não tem região viva; `ocupado` muda texto e `disabled`, mas
não comunica `busy`. **Aberto desde 07/09.**
Comando: `/impeccable harden`.

**15. Granabô na lateral exposto como link sem destino**
`components/SideNav.tsx:116`: `accessibilityRole="link"` para um item que abre
conversa em vez de navegar. O leitor de tela promete navegação que não acontece.
O botão central da barra já resolve isso corretamente com `button` —
é o mesmo controle com dois papéis diferentes. **Aberto desde 07/09.**
Comando: `/impeccable harden`.

**16. Véu branco neutro em vez de `theme.hover`**
`rgba(255,255,255,0.04–0.08)` em 11 lugares (`credito.tsx:1178,1354,1552`,
`desafios.tsx:550,699`, `BadgeCard.tsx:100,134`, `HomeCustomizerModal.tsx:254`,
`MonthSelector.tsx:119`, `TransactionSheet.tsx:212`). O `DESIGN.md` diz "sem
cinza neutro em lugar nenhum" e `theme.hover` existe para isso.
Comando: `/impeccable polish`.

**17. Sombras fora do catálogo de cinco receitas**
Sete variações novas, entre elas `app/(app)/_layout.tsx:440`
(`0 10px 30px -8px rgba(0,0,0,0.55)` onde o `DESIGN.md` documenta
`0 6px 16px rgba(0,0,0,0.35)`) e `:516`, que acrescenta **glow de menta a um
controle de navegação** — contradizendo o texto que afirma ser a landing "o
único lugar do sistema onde um controle de navegação usa glow de cor".
Comando: `/impeccable polish`.

**18. Tabular Rule quebrada em 11 arquivos que mostram dinheiro**
Sem `tabular-nums` em `MonthlyWrappedModal.tsx:308` (32px, o maior número do
Wrapped) e `FlowChart.tsx:411` (valor que muda enquanto a pessoa arrasta pelo
gráfico — o caso exato que a regra existe para evitar), entre outros.
Comando: `/impeccable typeset`.

**19. CSS global da web sumiu do build**
`app/+html.tsx:37,46` injeta `-webkit-font-smoothing` e `text-rendering`; o
`dist/index.html` de 06/09 tem **zero** ocorrências. A Neue Machina Light sai
engrossada em produção, que é o que o comentário do arquivo diz prevenir.
Comando: `/impeccable optimize`.

**20. Vazamento de tema claro por autofill**
`sign-in.tsx:94,108`, `sign-up.tsx:180,194,214`, `perfil.tsx:976` usam
`autoComplete` e não existe regra `:-webkit-autofill` no repositório. O Chrome
pinta o campo com fundo claro e texto quase preto dentro da UI petróleo.
Comando: `/impeccable harden`.

**21. Modais do Perfil sem tratamento de teclado**
`app/(app)/perfil.tsx:921-953,960-1010`: `TextInput` com `autoFocus` sobre um
scrim centralizado, sem `KeyboardAvoidingView` nem `useKeyboardHeight` — ao
contrário do resto do app. Em tela curta, "Excluir definitivamente" fica atrás
do teclado, sem rolagem possível.
Comando: `/impeccable harden`.

**22. `theme.danger` como estado de gravação**
`components/VoiceEntryButton.tsx:230`. O `DESIGN.md` define danger como ação
destrutiva e atraso; o widget Android documentado inverte "Ouvindo" para
petróleo com menta e reserva coral para "Atenção". App e widget divergem no
mesmo estado.
Comando: `/impeccable polish`.

### P3

**23. Perfil sem saída explícita** — `_layout.tsx:406` registra com `href: null`
e a tela não tem `router.back()` nem botão de voltar; sendo aba, o gesto de borda
também não existe ali.
**24. Hex crus fora de token** — `#02141a` inventado
(`MolduraCelular.tsx:163,260`), `#d3b869` usado como aviso
(`QrScannerModal.tsx:360`), `#6b9dc2` fora da `PALETTE_30`.
**25. Deriva numérica** — `theme.rule` usa `rgba(175,…)` onde a menta é
`rgba(174,…)`; 24 usos de `gap: 6` cru com `spacing.icone` existindo.
**26. ~2,9 MB de assets mortos em `public/`** — `notebook-flutuando-v3.mp4`
(2,4 MB) e três imagens sem referência.
**27. Estado de carregamento sem safe area** — `desafios.tsx:162-168`.
**28. Alça de arrastar dependente de hover em tablet touch** —
`WidgetGrid.tsx:58,70-85`; existe alternativa documentada.

## Achado retirado

O agente de desempenho carimbou P1 em "a Início baixa o histórico inteiro no
boot" (`index.tsx:330`). **Retirado.** O `context.md` de 08/09 registra que é
deliberado: o saldo vem de `saldos_por_carteira` via `refreshSaldos()`, o que
resta é a navegação por mês, e a mitigação escolhida foi não repetir a busca a
cada foco. A auditoria de 28/08 já tentou encurtar a janela e reverteu, com
instrução explícita de não tentar de novo.

## Padrões sistêmicos

1. **O guarda da Only-Font Rule pega fonte errada, não fonte ausente.** O corpus
   de 315 checagens confirma zero `fontFamily` literal e zero `fontWeight` em
   `app/` e `components/` — e mesmo assim `VozesSalvasLocalmente` cai na fonte do
   sistema por **não declarar nada**. É a mesma brecha que deixou passar o
   fallback do PDF. Um guarda de ausência fecharia as duas.
2. **`lib/` está fora de toda vigilância de design.** Os dois achados mais graves
   (P0 do vermelho, P1 da fonte) estão lá. O corpus varre só `app/` e
   `components/`.
3. **Ação versus destino resolvida em um lugar e não no outro.** O botão central
   da barra acerta (`button` + `expanded`); o mesmo Granabô na lateral erra
   (`link`).
4. **Peso da web nasce de decisões do app.** Bundle único, barril de ícones e
   imagens sem `srcset` são três caras do mesmo problema: a landing pública
   carrega o custo do app logado.

## Boas práticas a preservar

- **Regra do sem-vermelho limpa na UI do app**: nenhum valor monetário em `app/`
  ou `components/` usa `theme.danger`, e há comentários defendendo a regra
  ativamente (`MonthlyWrappedModal.tsx:37`, `Granachat.tsx:699`). A violação é só
  no PDF.
- **Cor de terceiro disciplinada**: só o verde do WhatsApp, nas 4 ocorrências,
  todas em botão que abre o WhatsApp, todas comentadas.
- **Virtualização correta**: `credito.tsx:877` (SectionList com
  `initialNumToRender`, `windowSize`, `removeClippedSubviews`),
  `lancamentos.tsx:703`, `contas.tsx:405`, `Granachat.tsx:476`. Os `.map()`
  restantes são todos limitados por teto explícito.
- **Nenhuma animação de propriedade de layout** em todo o projeto; só transform e
  opacity. `FogBackground` pausa por `IntersectionObserver`; `ScrollLinkedView`
  coalesce listeners num rAF único.
- **`Alert` embrulhado**: as 119 chamadas passam por `lib/alert.ts`, que mapeia
  para `window.alert`/`confirm` na web — nenhum `Alert` importado direto do
  react-native, onde o método é vazio no react-native-web.
- **`AppPressable`** integra redução de movimento, traduz estados para ARIA e,
  desde 08/09, confere `disabled` no manipulador de teclado.
- **Teclado tratado nas folhas**: `Sheet.tsx:29-48` mede à mão por causa do
  edge-to-edge do SDK 54 e soma `insets.bottom`.

## Ações recomendadas, em ordem

1. **[P0] `/impeccable colorize`** — tirar o vermelho do dinheiro no PDF e
   resolver o par `entradaBorda`/`saidaBorda`.
2. **[P1] `/impeccable typeset`** — fechar as duas fugas de fonte do sistema e a
   Tabular Rule.
3. **[P1] `/impeccable harden`** — contraste do botão do WhatsApp, Back/Esc no
   Granachat, papel do assistente na lateral, teclado nos modais do Perfil,
   autofill.
4. **[P1] `/impeccable adapt`** — insets laterais em paisagem, `viewport-fit`,
   colunas nas listas em desktop.
5. **[P1] `/impeccable shape`** — repensar a hierarquia da barra para no máximo
   cinco destinos, preservando a distinção ação/destino que já está certa.
6. **[P2] `/impeccable optimize`** — bundle, barril de ícones, `srcset`,
   cascata de render da Início, CSS global sumido.
7. **[P2] `/impeccable polish`** — sombras fora do catálogo, véu neutro,
   `theme.danger` no gravador, hex crus.

## Antes de fechar qualquer um desses

Nada aqui foi validado em aparelho. A varredura de acessibilidade dedicada não
concluiu, e a nota 2/4 é a menos confiável das cinco. Os achados de geometria
(alvo de 42,8pt, inset de 59pt em paisagem) são cálculo a partir do código e
precisam de medição real antes de virarem "resolvido".
