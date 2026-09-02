# Contexto do projeto — Grana.

Documento de orientação técnica/operacional pra quem (pessoa ou sessão de
IA) está entrando neste repositório agora. Cobre o que **não** está nos
outros documentos — arquitetura, convenções de código, fluxo de trabalho,
estado atual. Produto e marca/visual têm documentos próprios, mais
completos que qualquer resumo aqui:

| Documento | Cobre |
|---|---|
| `PRODUCT.md` | Público, proposta de valor, posicionamento, princípios de produto |
| `DESIGN.md` | Sistema de design completo — cores, tipografia, sombra, componentes, regras nomeadas |
| `AGENTS.md` | Regras permanentes de segurança do fluxo git/build (leia antes de commitar ou buildar) |
| `PLANO_DE_EVOLUCAO.md` | Roadmap de engenharia por épicos (gamificação, IA, automações futuras) |
| `context.md` (este arquivo) | Arquitetura, convenções de código, estado atual, como testar |

## O que é o Grana.

App de finanças pessoais (Expo Router + React Native + Supabase) que
elimina a fricção de anotar gasto: a pessoa fala, manda mensagem no
WhatsApp (texto ou áudio), ou fotografa o QR Code de uma nota fiscal — sem
nunca conectar a uma conta bancária. Ver `PRODUCT.md` para a proposta de
valor completa. Nome sempre "Grana." com o ponto.

**Fase atual**: preparação do lançamento comercial. O produto será **pago
desde o primeiro dia, R$ 9,90/mês, sem período de teste** (decisão de
28/08/2026). A landing já anuncia o preço; o checkout da Kiwify e o bloqueio
de acesso ainda não existem, então quem cria conta hoje segue com acesso
completo. Empresa verificada pela Meta e WhatsApp como canal oficial em
operação desde 28/08/2026 — a revisão terminou (ver `PRODUCT.md` para o que a
verificação permite e o que ela não significa na copy).

## Stack

- **Expo SDK 57** (`expo-router` ~57, `react-native` 0.86.2, `react` 19.2.3)
  — a versão mudou bastante entre majors; ao escrever código novo, checar a
  doc versionada em `https://docs.expo.dev/versions/v57.0.0/` em vez de
  confiar em conhecimento geral desatualizado (isso já está em `AGENTS.md`
  como instrução permanente).
- **React Native Web** (`react-native-web` ^0.21) — o mesmo código roda
  como app nativo (iOS/Android) e como site (`npx expo start --web`). A
  landing page pública (`app/index.tsx`) só renderiza na web (redirect pra
  `/sign-in` no nativo).
- **Supabase** — Postgres com RLS, Auth, Edge Functions (Deno), plano
  **Free** (nenhuma solução pode depender de recurso exclusivo do Pro).
- **TypeScript** estrito o bastante pra `tsc --noEmit` ser o gate de
  qualidade padrão depois de qualquer mudança.
- Sem Reanimated/Moti/GSAP — animação é `Animated` nativo do RN em telas
  do app, e no site tanto `Animated` quanto CSS puro (`@keyframes`,
  `transition`) via casts `as any` (ver seção de convenções).

## Estrutura de pastas

```
app/                    Expo Router — cada arquivo é uma rota
  _layout.tsx            Stack.Protected: sessão logada → (app); senão → index/sign-in/sign-up
  index.tsx               Landing page pública (só web)
  sign-in.tsx, sign-up.tsx, nova-senha.tsx
  ativar.tsx               Ativação de compra (Kiwify) — funciona logado ou deslogado
  termos.tsx, privacidade.tsx, exclusao-de-dados.tsx   Sem Stack.Protected — precisam abrir de qualquer lugar
  (app)/                  Área logada — 5 abas (Início, Lançamentos, Crédito, Contas, Desafios) + Gráficos/Perfil
components/              ~65 componentes compartilhados (UI + landing)
lib/                     Lógica/dados sem UI — auth, heurísticas de categorização, gamificação, formatação, etc.
supabase/
  schema.sql              Schema completo (tabelas, RLS, triggers)
  functions/               3 Edge Functions: whatsapp-webhook, kiwify-webhook, eas-build-webhook
  email-templates/
__tests__/               Corpus de teste do parser de voz/WhatsApp (`npm run test:parser`)
design-system/            Tokens exportados (`tokens.json`) + página HTML de referência visual
```

## Roteamento e autenticação

`app/_layout.tsx` usa `Stack.Protected` (padrão atual do expo-router) em
vez de redirect manual — evita o "flash" de tela protegida antes do
redirect. `lib/auth-context.tsx` expõe `useSession()`; `onAuthStateChange`
atualiza o estado pra **qualquer** tipo de evento (inclusive
`USER_UPDATED`), o que outras partes do app dependem pra reagir a mudança
de `user_metadata` sem plumbing extra (ex.: o tour da Início dispara
sozinho assim que `onboarding_seen` muda).

Flags one-time (onboarding visto, tour visto) ficam em
`user_metadata` do Supabase Auth, não `AsyncStorage` — precisam
sincronizar entre aparelhos/navegadores da mesma conta.

## Camada de dados

Tabelas principais (`supabase/schema.sql`): `transactions`, `bills`,
`categories`, `budgets`, `goals`, `credit_cards`, `credit_card_invoices`,
`wallets`, `whatsapp_links`, `whatsapp_pending`, `subscriptions`,
`user_gamification`, `feedbacks`, `app_release`, `webhook_raw_log`. RLS
habilitado em todas — cada usuário só acessa as próprias linhas.

**Assinatura/acesso**: `subscriptions.access_until` controla até quando uma
assinatura recorrente está vigente. `lib/assinatura.ts` cuida do vínculo
automático (email/token) e
`app/ativar.tsx` processa o link pós-checkout. Hoje **não há bloqueio de
acesso** por assinatura — toda conta logada tem acesso total, decisão
deliberada enquanto o preço não é definido.

**Categorização automática**: `lib/heuristics.ts` é a heurística
compartilhada entre os 3 canais de entrada (voz, WhatsApp, QR de nota) —
espelhada no webhook do WhatsApp (Edge Function), então uma mudança de
regra de categorização geralmente precisa ser replicada nos dois lugares.

**Build/versão**: `app_release` é escrita pela Edge Function
`eas-build-webhook`, que **recusa** builds cuja versão não seja maior que a
já anunciada. Ver regra 5 do `AGENTS.md` — subir `expo.version` no
`app.json` antes de todo build de release é obrigatório, senão o aviso de
atualização (`lib/atualizacao.ts` + `UpdateBanner`) fica mudo sem erro
nenhum. Versão atual: `1.4.0`.

## Convenções de código

- **Nomes em português** em todo o código de produto (variáveis, funções,
  componentes de tela) — comentários também. Nomes de bibliotecas/tipos
  vindos de dependências ficam como estão.
- **Comentários só pra WHY não-óbvio** — restrição, bug histórico,
  decisão que parece estranha sem contexto. Nunca "o que" o código já diz
  sozinho.
- **Neue Machina é a única fonte do produto** — `fonts.regular`/`fonts.light`
  em `lib/theme.ts` apontam pra `NeueMachina-Regular`/`NeueMachina-Light` em
  TODO texto (marca, títulos, corpo, campo, controle, valor), em toda
  plataforma. Regra permanente do autor: proibido usar fonte do sistema em
  qualquer papel — uma rodada anterior trocou o corpo do app pra fonte do
  sistema achando que era exigência de Dynamic Type/sp (não era: texto de
  fonte customizada já escala normalmente), e foi revertida em 27/08/2026.
  Não sintetizar bold na fonte da marca (só existem Light e Regular).
- **Valor monetário sempre com `fontVariant: ['tabular-nums']`** — dígitos
  não podem "dançar" ao atualizar.
- **Sem vermelho** em nenhuma superfície de estado — saída de dinheiro usa
  ciano (`theme.down`), não vermelho. `theme.danger` existe só pra
  erro/ação destrutiva, não pra "gasto".
- **CSS web-only via `as any`** — `boxShadow`, `backgroundImage`,
  `backdropFilter`, `scrollSnapType` etc. não existem no tipo `ViewStyle`
  do React Native; o padrão do projeto é castar o objeto de estilo inteiro
  com `as any` no ponto de uso (`GlowOrb.tsx` é a referência mais citada
  pro padrão). Sempre guardado por `Platform.OS === 'web'` quando o
  componente também roda nativo.
- **`lib/breakpoints.ts`** — classes de janela valem em web e nativo. O app
  reestrutura grades/modais em médio e amplo; a web troca para SideNav,
  enquanto iOS/Android usam Native Tabs e deixam tab bar/sidebar/Navigation
  Bar sob responsabilidade do sistema.
- **Alinhamento rigoroso** — instrução permanente do autor: todo texto e
  elemento de uma mesma página precisa compartilhar a mesma margem/grade,
  auditado de verdade (medição, não olhômetro) antes de considerar uma
  seção pronta.
- **`scroll-snap` em `mandatory` quebra navegação programática**
  (`scrollIntoView`) neste projeto — testado e revertido uma vez; use
  `proximity` se precisar de encaixe de rolagem na web.
- **`Animated.loop` do React Native trava depois de uma volta** no
  react-native-web (bug observado e corrigido em `TrustMarquee.tsx`) — pra
  loop CSS infinito de verdade, prefira `@keyframes` + `animationIterationCount: 'infinite'`
  direto, não `Animated.loop`.

## Landing page (`app/index.tsx`)

Página de conversão fria (`/`, só web) — recebe quem nunca ouviu falar do
Grana., separada da tela de login. Passou por duas rodadas grandes de
retrabalho recentes:

- Hero-storytelling com 4 capítulos em scroll (voz → WhatsApp → QR de nota
  → Livre para Gastar), notebook 3D real (composição de camadas PNG
  animadas via CSS, não mais mockup SVG) — `components/NotebookAnimado.tsx`.
- Seções em "dobras" de tela cheia (16:9) com `scroll-snap: proximity`,
  FAQ em cards sobre grade de fundo, Preços em 2 colunas, faixa de
  confiança (`TrustMarquee`) em loop infinito real sob o cabeçalho, textura
  quadriculada interativa atrás de várias seções
  (`components/GradeInterativa.tsx`).
- Ver `DESIGN.md` § "Herói-storytelling" pra linguagem visual, e o próprio
  `app/index.tsx` — os comentários no arquivo documentam o raciocínio de
  cada decisão (por que dobra de tela cheia, por que `proximity` e não
  `mandatory`, etc.) com mais detalhe do que cabe aqui.
- Três seções inspiradas no Organizze, adaptadas à identidade visual do
  Grana. (sessão mais recente): um "Guia" de 4 passos numerados, a grade
  de recursos com o app centralizado, e a seção de Segurança com uma
  composição navegador+celular sobrepostos — todas usando
  `components/MolduraCelular.tsx`/`MolduraNavegador.tsx` (bezel desenhado
  em CSS, sem asset de imagem; flutuam sozinhas e pausam via
  `IntersectionObserver` quando saem da tela) com capturas reais em
  `public/telas/` de uma conta de exemplo com dado 100% fictício — nunca
  logar numa conta de verdade (nem de demonstração) pra gerar material de
  marketing, só dado inventado, mesmo que a intenção seja reproduzir uma
  tela real.
- Assinatura definida em R$ 9,90/mês, já exibida na seção de preços. Sem
  período de teste: o lançamento é pago desde o primeiro dia. O acesso segue
  liberado só porque o checkout ainda não entrou em operação.
- Herói compacto (mobile): capítulos 2-4 repetiam a legenda "Acesso
  antecipado" idêntica 4 vezes numa rolagem curta, sem nenhum apoio visual
  (o vídeo do notebook só aparece uma vez, no capítulo 1, de propósito —
  4 cópias do mesmo `<video>` autoplay era pesado e redundante). Corrigido
  dando a cada capítulo 2-4 um ícone próprio (`Capitulo.icone`, mesmo
  círculo de `featureIconeCirculo`) no lugar da legenda repetida — WhatsApp,
  QR code, carteira. Chamado a atenção por print real do site publicado.
- Duas correções extras no herói compacto, também via print real do site
  publicado: (1) `styles.headline` tinha piso de 44px pensado pra UM título
  só (primeira dobra do herói largo) — repetido 4× empilhado no compacto lia
  como "gigante"; criado `headlineCompacto` com piso bem menor, dedicado.
  (2) O capítulo 1 do herói compacto ainda usava `<NotebookVideo>` (mp4) —
  único lugar que tinha ficado pra trás quando o herói largo trocou pro
  composto animado em PNG; `NotebookAnimado` ganhou uma prop `variante`
  (`'fundo'` = herói largo, absoluto+cover; `'caixa'` = herói compacto,
  `width:'100%'` + `aspectRatio` real do RN, sem `onLayout`/medição — a
  caixa JÁ tem a proporção do canvas, não precisa do recorte tipo `cover`
  que o modo `fundo` calcula). `NotebookVideo.tsx` ficou sem uso (mantido no
  repo, não apagado).
- Ícone "Meta atingida" (troféu com faíscas, `components/IconeMetaAtingida.tsx`)
  importado de um projeto Claude Design (`claude.ai/design`, MCP
  `claude_design`), só a peça animada (sem o texto de estado vazio que a
  acompanhava na origem) — markup SVG embutido via `dangerouslySetInnerHTML`,
  não recriado em `react-native-svg`, pra não divergir de pixel do original.
  Chegou a ficar no CTA final da landing; removido de lá na rodada de
  simplificação da seção, mas o componente ficou sem uso no repo, não
  apagado (mesmo critério do `NotebookVideo.tsx` acima).

## Como testar

- **Tipo**: `npx tsc --noEmit` depois de qualquer mudança — gate mínimo
  antes de considerar algo pronto.
- **Parser de voz/WhatsApp**: `npm run test:parser` roda o corpus em
  `__tests__/`.
- **Visual/QA da landing (ou qualquer tela web)**: `npx expo start --web`
  local, depois `agent-browser` (skill instalada) pra navegar, redimensionar
  viewport (testar pelo menos ~390px compacto e ~1440-1600px largo) e tirar
  screenshot. Pra rolar uma `ScrollView` do React Native Web via
  `agent-browser eval`, é preciso achar o `div` com `scrollHeight >
  clientHeight` — não é a `window` que rola.
- Sem Playwright/Jest configurado pra UI — a verificação visual é sempre
  manual (screenshot + leitura), não snapshot automatizado.

## Fluxo de trabalho entre duas máquinas

Este repositório é trabalhado por Gabriel em duas máquinas diferentes.
Regras de segurança completas (nunca `git init`, sempre `git fetch` antes
de commitar, sempre `git push` antes de encerrar sessão com mudança de
código, nunca disparar `eas build` sem pedido explícito na sessão atual)
estão em `AGENTS.md` — leitura obrigatória antes de qualquer commit ou
build, não repetida aqui pra não divergir da fonte única.

## Sessão de 28/08/2026 — fonte, tokens e bug do Expo Go

Publicado em `origin/main` (commits `80b143d` e `83d0c2a`), com deploy da
Vercel confirmado no ar em granaponto.com.br.

- **Fonte da marca revertida.** Uma rodada anterior trocou `fonts.regular`/
  `fonts.light` pela fonte do sistema em ~472 pontos de uso, alegando
  Dynamic Type/sp. Texto de fonte customizada já escala no React Native, então
  não havia troca a fazer. Neue Machina voltou a ser a única fonte do produto e
  a regra virou permanente ("The Only-Font Rule" em `DESIGN.md`); `PRODUCT.md`,
  este arquivo e `.impeccable/design.json` também descreviam o split
  marca/sistema como válido e foram corrigidos.
- **Token drift fechado.** `theme.danger` no lugar de `#e08a7d` (6 arquivos) e
  fim do quase-duplicado `#e08b7f`; `paperSelected`/`accent` em `BadgeCard` e
  Gráficos; novo par `entradaBorda`/`entradaFundo`/`saidaBorda`/`saidaFundo`
  substituindo hex repetido em 5 arquivos.
- **Eixo do `FlowChart` no estado vazio.** Sem movimentação, `maxVal` caía no
  piso de 1 e o eixo imprimia "R$ 0, R$ 0, R$ 1, R$ 1, R$ 1". A escala agora é
  suprimida; a grade continua.
- **Tela branca no Expo Go depois da trava por digital** (regressão do commit
  `b34be61`). `NativeTabs` usa componentes Fabric compilados que o Expo Go não
  tem — a view não registra, nada renderiza e nenhum erro sobe pro JS. Agora
  `lib/navegacao-nativa.ts:abasNativasDisponiveis()` decide por AMBIENTE DE
  EXECUÇÃO, não por `Platform.OS`; `useTabBarInset` usa a mesma função, e
  `WebTabsLayout` virou `AbasEmJavaScript` (atende navegador e Expo Go).

**Pendente para a próxima sessão:**

1. **As abas nativas nunca rodaram em aparelho.** O Expo Go agora desvia delas,
   então o teste de 28/08 não validou esse caminho — ele só entra numa build do
   EAS. Validar antes de publicar release.
2. **`app.json` ainda em `1.4.0`**, mesma versão da build que a cota barrou.
   Subir antes do próximo build de release, senão o webhook recusa e ninguém é
   avisado da atualização (ver regra 5 do `AGENTS.md`).
3. **Cota do EAS.** 24 builds em agosto/2026, 15 concluídas — exatamente o teto
   do plano free. Conferir a renovação em
   https://expo.dev/accounts/gabriouss/settings/billing antes de disparar.
4. **P2 de performance em aberto**, com o porquê detalhado em
   `IMPECCABLE_AUDIT.md`: Início, Gráficos e Lançamentos baixam o histórico
   inteiro de transações. Não é só janelar — o saldo depende do histórico
   completo (janela curta daria saldo ERRADO, não mais lento) e a navegação por
   mês/ano precisa de dados arbitrários. Exige agregação aplicada no banco e
   busca por período sob demanda.

## Estado no momento deste documento

- Landing page (`app/index.tsx`) passou por auditoria completa e recebeu melhorias estruturais:
  - Cabeçalho sticky com `backdrop-filter: blur` + link discreto "Entrar" no topo.
  - Meta tags SEO com `<Head>` (título, descrição, OG image) e `lang="pt-BR"` garantido no HTML.
  - Indicador visual de scroll no herói (seta animada) e marcadores de capítulo mais nítidos.
  - Capítulos 2-4 do herói no mobile agora têm CTA direto.
  - Quebras de linha `\n` manuais tornadas condicionais ao desktop.
  - Seção Segurança no mobile agora exibe a moldura de celular individual.
  - Cards de dor ("Reconhece isso?") com efeito hover unificado com os cards de feature.
  - Botão CTA do card de preço centralizado no layout mobile.
  - Rodapé empilhado e centralizado no mobile evitando desalinhamento dos links legais.
  - `NotebookAnimado`: pausa de animação via `IntersectionObserver` ao sair da tela, `fetchpriority="high"` e dimensões explícitas para otimização de LCP/CLS.
  - `FaqItem`: hover interativo nos botões e primeiro item aberto por padrão como affordance visual.
  - Correção do texto cortado na seção "O guia pro seu controle financeiro"
    em larguras compactas/intermediárias: `colunaTextoSecao` usava `flex: 1`
    no layout desktop e mantinha esse crescimento depois que o contêiner passava
    para `flexDirection: 'column'`. O React Native Web resolvia uma altura menor
    que o conteúdo, e o `overflow: hidden` da dobra ocultava o final do passo 04.
    A landing agora aplica `colunaTextoSecaoCompacta` às três seções que usam
    esse padrão, removendo o crescimento no eixo vertical (`flexGrow: 0`,
    `flexBasis: 'auto'`), liberando largura total e fazendo o contêiner compacto
    esticar os filhos. Validado sem recorte em 375, 720, 1024 e 1440 px, sem
    erros no console, com `npx tsc --noEmit` e export web concluídos.
- Assinatura recorrente definida em R$ 9,90/mês, sem período de teste; nenhuma
  trava de acesso implementada ainda (toda conta logada tem acesso completo).
- Épicos de `PLANO_DE_EVOLUCAO.md` (metas/cofrinhos, gamificação, projeção
  de fatura) majoritariamente já implementados — conferir `lib/goals.ts`,
  `lib/gamification*.ts`, `lib/projections.ts` antes de assumir que é
  trabalho futuro.

## Sessão de 28/08/2026 — continuidade da nova landing

- Concluídas em `app/index.tsx` as dobras de hábito, Livre para Gastar,
  benefícios, segurança, CTA final e rodapé previstas em
  `HANDOFF_LANDING_CODEX.md`.
- **A dobra de voz NÃO existe.** Uma versão anterior deste registro dizia que
  ela tinha sido concluída e que `components/DemonstracaoVoz.tsx` fora criado;
  nenhum dos dois está na árvore. A seção "Como entra o lançamento", que era
  onde voz/WhatsApp/QR viviam, foi removida sem substituta, então hoje a voz
  no app só aparece numa bullet do card "Lance do jeito que for mais fácil" e
  no FAQ. É o item aberto mais relevante da landing.
- Adicionado `MiniMockBeneficio.tsx`; integrados `ConversaGranabo.tsx` e
  `CardLivreParaGastar.tsx` com dados fictícios.
- `AppPressable` agora encaminha `target` e `rel` por `hrefAttrs` na web, para
  os links externos preservarem o comportamento e a proteção esperados.
- QA local concluído em 390×844 e 1440×1000. TypeScript e corpus completo
  do parser passaram; axe-core reportou zero violações confirmadas.
- Sem commit, push ou publicação nesta rodada. A landing aguarda revisão ao
  vivo do autor antes de qualquer entrega externa.

## Sessão de 29/08/2026 — auditoria técnica da landing e correções

Auditoria `/impeccable audit` sobre `app/index.tsx`, com detector empacotado
mais inspeção ao vivo em 390, 834, 1264 e 1440. Herói preservado por decisão
do autor ("a sessão hero nova está aprovada"), então nada de design, copy ou
layout dele foi tocado.

- **Imagens do herói em WebP sem perdas.** As três camadas do notebook saíram
  de 1.170 KB de PNG para 581 KB, mais a tela do herói compacto (187→129 KB) e
  a captura de Conquistas (126→48 KB). Verificado pixel a pixel: alpha idêntico
  em 100% dos pixels e RGB idêntico em 100% dos pixels VISÍVEIS; a única
  diferença está no RGB sob `alpha=0`, que nenhum compositor desenha. Os PNGs
  substituídos foram removidos de `public/` (recuperáveis pelo git).
- **Fonte do sistema eliminada da landing.** `MolduraNavegador` renderizava
  `granaponto.com.br` sem `fontFamily`, e o react-native-web entregava
  `-apple-system, Segoe UI, Roboto…` — era o único texto visível da página
  fora da Neue Machina.
- Contraste do chip de categoria em `MiniMockBeneficio` estava em 4,25:1
  (WCAG AA pede 4,5:1); a cor da categoria ficou na borda e no fundo, o
  rótulo passou a usar `theme.ink`.
- `#25D366` decorativo saiu do painel de segurança em `app/index.tsx`. A
  exceção de cor de terceiro do DESIGN.md vale só com necessidade funcional,
  que é o caso da bolha em `ConversaGranabo`, não de um fundo de ícone.
- `landing-meta.json` ainda anunciava "Acesso antecipado gratuito" no
  `ogDescription`, ou seja, no card de compartilhamento.
- `will-change: transform` removido do `GlowOrb`: três elementos estáticos com
  `blur(70px)` mantinham camada de composição própria pela vida da página.
- `vercel.json` ganhou `Cache-Control`: `immutable` em `/assets/` e
  `/_expo/static/` (nomes com hash de conteúdo, confirmado no export) e
  `max-age=86400, stale-while-revalidate` em `/notebook/` e `/telas/`.
- Quebras de linha forçadas (`\n`) saíram do checklist de Preços, onde viravam
  quatro linhas irregulares por item em 390px, e da lista de segurança, onde
  já eram string morta apagada em tempo de render.
- Limpeza: 39 chaves de estilo órfãs removidas de `app/index.tsx` (180→141),
  mais os imports `useRef` e `colunaLeitura`, e os assets não referenciados
  `tela-mobile-2.png`, `graficos-web.png`, `inicio-web.png`,
  `inicio-mobile.png`.
- **Aberto, para decisão do autor:** `public/videos/` (2,6 MB, incluindo um
  MP4 de 2,4 MB) e os componentes `NotebookVideo.tsx`,
  `NotebookFloatEstatico.tsx`, `LaptopMockup.tsx` e `MolduraCelular.tsx` estão
  todos órfãos desde que a composição de três camadas substituiu o vídeo do
  herói. Nada os importa. Também segue aberto o `Ionicons.ttf` (199 KB
  comprimidos em produção) carregado por volta de vinte glifos: reduzir exige
  trocar todo ícone da página por SVG inline, inclusive o do herói.
- Medido no export de produção servido localmente: as duas requisições da
  Neue Machina que o servidor de desenvolvimento fazia pela rede são, em
  produção, uma da rede e uma do cache (`transferSize: 0`). Não é defeito.

## Sessão de 29/08/2026 — ritmo vertical do herói mobile

- O herói compacto deixou de sobrepor a copy ao mockup com uma margem inferior
  negativa. Imagem, bloco de mensagem e CTA agora usam `gap` de 20 px no
  contêiner; eyebrow, H1 e apoio usam `gap` interno de 12 px e têm as margens
  individuais neutralizadas nessa variante.
- O bloco ganhou respiro explícito de 16 px no topo e 28 px na base. O H1
  compacto passou a centralizar também o texto, não apenas a própria caixa.
- Validado visualmente em 320×800 e 390×844 no Chrome, sem sobreposição e sem
  erros de página; `npx tsc --noEmit` passou após a alteração inicial.

## Sessão de 29/08/2026 — ícone da web, botões, entrelinha, privacidade e relatórios

Rodada de correções pedida pelo autor em seis pontos, mais uma regressão de
marca detectada durante o trabalho.

**Ícone da web (regressão em produção).** `public/favicon.svg` desenhava o
símbolo chapado numa cor só, alternando por `prefers-color-scheme`, sem
gradiente e com o ponto na mesma cor do G. Como o `<link>` dele declara
`type="image/svg+xml"`, o Chrome o preferia ao `.ico` e o site aparecia com
dois ícones diferentes dependendo de onde era visto. Refeito a partir de
`design-system/marca/simbolo-gradiente.svg`: gradiente de 45° atravessando o
símbolo inteiro, ponto em menta sólida, fundo transparente. `favicon.png` e o
`.ico` (que o Expo gera de `assets/favicon.png`) foram regerados do mesmo
vetor, e `scripts/inject-og-meta.js` passou a remover o `<link rel="icon">`
que o Expo emite, para a página declarar um ícone primário só.

**Botões de ícone do cabeçalho.** `HeaderAction` sem rótulo saía 28×44: o
ícone de 16 com padding de 6 dava 28 de largura, e o `minHeight: touchTarget`
esticava a altura. Com `borderRadius: pill` isso é uma cápsula vertical, não um
círculo. Os dois lados passaram a valer `touchTarget`, e `VoiceEntryButton`
(que tinha diâmetro próprio de 32) foi alinhado ao mesmo tamanho.

**Entrelinha.** `lib/theme.ts` ganhou `leading` e `lh()`, com os mesmos ratios
que `textStyles` já usava. Foram convertidos 38 estilos cuja entrelinha era
menor que 1.25 do corpo da letra, incluindo um 14/14 em `perfil.tsx`. Seguem
~405 estilos sem `lineHeight` declarado, que caem no leading intrínseco da
Neue Machina; usar `lh()` neles é o trabalho seguinte.

**Modo privacidade.** O blur voltou sem o vazamento que o motivou a sair. O
valor real não é mais renderizado quando o modo está ligado: entra uma máscara
falsa e de largura fixa (`R$ 0.000,00`), injetada dentro do próprio `<Text>`
filho por `cloneElement` para herdar a tipografia da tela, e é ela que recebe o
`blur(7px)`. Inspecionar, copiar ou desligar o CSS devolve a máscara.

**Relatório PDF.** Na web ele nunca era usado: o shim de web do `expo-print`
faz `printToFileAsync()` ser `window.print()`, ignorando o HTML — o botão
imprimia a tela. Agora a web abre janela própria com o relatório (janela e não
iframe, porque a CSP não declara `frame-src`). O template saiu da fonte do
sistema e do `font-weight: 600`: na web reaproveita as `@font-face` que o
react-native-web já injetou, sem custo de bundle. Ganhou a seção "Leitura do
mês", com sete insights que só aparecem quando o dado os sustenta.

**Retrospectiva do Mês.** Usava `theme.danger` e dizia "você fechou o mês no
vermelho" — vermelho não existe na paleta e a copy julga, contra a estrela guia
do DESIGN.md. Trocado para `theme.down` e reescrito, mais dois slides novos
(variação contra o mês anterior, e fixo contra variável).

**Gráficos.** A linha do donut era limitada a 460 px, teto herdado de quando o
donut media 220; no amplo ele cresceu para 280 e sobravam 160 para a legenda,
o que cortava o nome da categoria em "Morad…". Teto passou a 520, e no celular
donut e legenda empilham em vez de dividir a linha.

**Aberto, para a próxima sessão:** o ritmo geral das telas (`screenRhythm`) e o
espaçamento interno de modais e folhas seguem sem revisão. As duas exigem ver o
app logado para calibrar, e mudar `screenRhythm` no escuro afeta seis telas de
uma vez.

**Análise do sistema de progressão.** São três sistemas independentes com
vocabulário colidente: Faixa (por Score 0–1000), Elo (por XP) e Arquétipo (por
questionário). "Estrategista" nomeia os três, ganho por mecânicas sem relação
entre si. O XP vem exclusivamente de cofrinho (`lib/goals.ts`): registrar
lançamento, cumprir orçamento e pagar boleto não geram XP nenhum. Conquistas
não são persistidas, então as de sequência voltam a bloquear quando a condição
deixa de valer.

## Sessão de 29/08/2026 — correções da auditoria da landing

- Eliminados os overflows de Preços, FAQ e Segurança em 320 px. Os filhos
  compactos agora anulam os `minWidth` de desktop, ocupam 100% da largura útil
  e não criam rolagem horizontal.
- Hábitos permanece empilhado abaixo de 1080 px; o mockup de 560 px não invade
  mais a coluna textual em 768/1024. O herói também usa a variante compacta
  abaixo de 960 px ou 600 px de altura, evitando colisão em paisagem curta.
- A navegação por seções vive SÓ no botão flutuante, em qualquer largura. Uma
  rodada intermediária a devolveu ao cabeçalho acima de 1280 px e restringiu o
  flutuante a compacto/médio; foi revertido a pedido do autor, que tirou a
  fileira de atalhos do topo justamente por achá-la amontoada. O cabeçalho
  carrega marca e "Entrar", e nada além disso.
- O menu flutuante foca o primeiro link ao abrir e devolve o foco ao gatilho ao
  fechar. Seus sete links usam a referência real do `ScrollView` para rolar ao
  destino e compensar o cabeçalho sticky; todos foram medidos com destino em
  49 px e cabeçalho terminando nos mesmos 49 px.
- Os 3 cards de dor e os 6 cards de benefícios deixaram de usar `AppPressable`:
  são informativos, portanto não entram mais na ordem de teclado nem expõem
  semântica de controle sem ação.
- Validado no Chrome em 320×800, 375×812, 390×844, 768×1024, 844×390,
  1280×800 e 1440×1000. Axe-core: 0 violações; `prefers-reduced-motion`:
  0 animações em execução; `npx tsc --noEmit`: aprovado.

## Sessão de 30/08/2026 — favicon oficial em todas as rotas web

- A landing já declarava o símbolo oficial “G.” com gradiente, mas o HTML
  inicial servido pelo Metro para a área de membros não incluía favicon. O
  navegador caía no ícone antigo em cache, com fundo azul e “G” chapado.
- `app/_layout.tsx` agora injeta pelo `expo-router/head`, em todas as rotas
  web, o SVG canônico `public/favicon.svg`, o PNG oficial como fallback e o
  `apple-touch-icon`. As URLs receberam a versão
  `grana-gradiente-20260830` para invalidar o cache persistente do navegador.
- `app/+html.tsx` e `scripts/inject-og-meta.js` usam exatamente as mesmas
  declarações, cobrindo tanto renderização estática futura quanto o export SPA
  atualmente publicado pela Vercel. O PNG de `assets/favicon.png` usado pelo
  Expo e o de `public/favicon.png` são binariamente idênticos.
- Validado no DOM hidratado das rotas `/`, `/sign-in` e `/lancamentos`, no
  export web de produção após a injeção de metadados e com
  `npx tsc --noEmit`, todos aprovados.

## Sessão de 31/08/2026 — pop-up de novidades por versão

Pedido do autor: avisar, dentro do app, o que mudou (correções/features)
quando a pessoa abre uma versão recém-instalada — diferente do
`UpdateBanner`, que avisa de uma versão *futura* disponível pra baixar.

- **`components/NovidadesModal.tsx`** — folha (mesmo padrão visual do
  `FeedbackModal`: `AppModal` + `AccessibleModalPanel` + `useSheetFlutuante`)
  com a lista de novidades da versão instalada. Montada em `app/_layout.tsx`
  ao lado do `UpdateBanner`, só na área logada (`session && <NovidadesModal
  />`).
- **`lib/atualizacao.ts`** ganhou `verificarNovidades()`/
  `marcarNovidadesVistas()`. A checagem compara a versão instalada
  (`Constants.expoConfig.version`) com a última versão cujas novidades já
  foram vistas neste aparelho (`AsyncStorage`, chave
  `grana_novidades_versao_vista`) — device-local de propósito, mesmo
  critério do `grana_versao_dispensada` já existente, não `user_metadata`.
  Na primeira abertura de sempre (instalação nova, sem baseline salva) só
  grava a versão atual e fica muda — não é atualização, não tem novidade
  pra mostrar. `buscarAppRelease()` foi extraída pra ser a leitura única da
  linha singleton `app_release`, compartilhada com `verificarAtualizacao()`
  (evita duas idas à rede quando as duas checagens rodam juntas).
- **Fonte do texto**: `app_release.notes`, um item por linha. Antes desta
  sessão a coluna existia no schema mas nada nunca escrevia nela.
  `publicar_app_release` (SQL) ganhou o parâmetro opcional `p_notes`, e
  `eas-build-webhook` passa `payload.metadata?.message` — a mensagem do
  build EAS (`eas build --message "..."`, ou a mensagem do commit quando
  nenhuma é passada explicitamente). Decisão do autor: preferiu automação
  via mensagem do build a editar a tabela manualmente a cada release, pelo
  mesmo motivo do bump de versão da regra 5 do `AGENTS.md` — um passo
  manual extra é um passo que uma hora vai ser esquecido em silêncio.
- O pop-up só aparece quando `app_release.version` bate exatamente com a
  versão instalada e há `notes` não vazias — nunca inventa novidade a
  partir de nada, e nunca mostra nota de uma versão que não é a que está
  rodando.
- `npx tsc --noEmit` e `npm run test:parser` (incluindo
  `corpus-schema-guardas.ts` e o `sync-parser.js`) passaram depois da
  mudança.

**Resolvido em 01/09/2026:** `publicar_app_release` com o parâmetro `p_notes`
foi aplicada ao banco de produção. Ao rodar `eas build`, continuar escrevendo
`--message` pensando em quem usa o app, não em changelog técnico — é isso que
vira o texto do pop-up.

## Sessão de 31/08/2026 - refinamento local da landing com referência Portfolite

Primeira passagem feita somente no ambiente local, aguardando aprovação do
autor antes de qualquer commit, push ou publicação. O Portfolite foi usado
apenas como referência de ritmo editorial e hierarquia; identidade, copy,
paleta, Neue Machina e visuais existentes do Grana. foram preservados.

- Os novos PNGs de notebook/celular em `design-system/marketing-mockups/` não
  foram usados. A landing continua usando apenas os visuais que já possuía.
- `TrustMarquee` virou uma linha de fatos estática no breakpoint amplo e com
  movimento reduzido. Em larguras menores, onde os quatro fatos nao cabem, o
  ticker e o controle de pausa continuam disponíveis.
- O gatilho de `NavFlutuanteLanding` mostra "Explorar"/"Fechar" no amplo e
  permanece circular e somente com ícone nas larguras menores.
- A grade de benefícios ganhou composição assimétrica no amplo, rótulos de
  categoria e mais presença para os mini-visuais já existentes. Compacto e
  medio mantem a estrutura anterior. A copy do CSV foi atualizada de 500 para
  10 mil linhas, acompanhando o limite real do importador.
- Validado em 320, 390, 768 e 1440 px sem overflow novo. `npx tsc --noEmit` e
  `git diff --check` passaram. Axe-core: 0 violações automáticas em 390 e
  1440 px; contraste ficou marcado como revisão manual pelo motor. Com
  `prefers-reduced-motion`, 0 animações permanecem em execução.

## Sessão de 01/09/2026 - tela branca após desbloqueio biométrico

O defeito reapareceu numa build Android real: depois de autenticar com a
digital, a tarefa continuava viva no seletor de apps, mas todo o conteúdo
ficava branco e nenhum erro chegava ao JavaScript.

- A correção anterior protegia apenas o Expo Go. A causa real era a própria
  `expo-router/unstable-native-tabs`, que pode falhar silenciosamente ao
  remontar seus componentes Fabric depois que o Android recria a Activity na
  volta do prompt biométrico.
- `app/(app)/_layout.tsx` deixou de importar ou montar `NativeTabs` em qualquer
  ambiente. Web, Expo Go, development build e APK de release agora usam a
  mesma navegação estável em JavaScript (`Tabs`).
- `lib/navegacao-nativa.ts` foi removido porque não existe mais caminho de
  navegação experimental a selecionar. `lib/tab-bar.ts` sempre reserva o
  espaço da barra flutuante no celular, inclusive em build real.
- `app.json` passou de `1.4.0` para `1.4.1` antes da nova build, preservando o
  mecanismo de aviso de atualização. O perfil EAS `preview` agora incrementa o
  `versionCode` automaticamente para o APK instalar sobre a build anterior.
  `.easignore` exclui ferramentas locais, logs do Expo e mockups de trabalho do
  pacote enviado ao EAS.
- Verificações locais: `npx tsc --noEmit`, `git diff --check` e
  `npm run test:parser` aprovados; a suíte reportou todas as checagens verdes.
- Build Android interna concluída com sucesso no EAS: versão `1.4.1`,
  `versionCode 2`, ID `b2605153-7cdf-4903-986f-80c14d14caf4`. APK disponível em
  https://expo.dev/accounts/gabriouss/projects/grana-app/builds/b2605153-7cdf-4903-986f-80c14d14caf4

## Sessão de 01/09/2026 - automação de release e update notes em produção

- A auditoria inicial encontrou `app_release` parada na `1.3.0` e apenas a
  assinatura antiga de `publicar_app_release`, sem `p_notes`.
- A função de quatro parâmetros foi aplicada em produção dentro de transação;
  a assinatura antiga foi removida e a execução continua restrita a
  `service_role`.
- A Edge Function `eas-build-webhook` atual foi implantada com verificação JWT
  desativada no gateway e autenticação própria por assinatura HMAC.
- O secret HMAC foi rotacionado e sincronizado entre EAS e Supabase. Antes da
  correção, as oito tentativas da build `1.4.1` retornaram HTTP 401.
- Um payload assinado e deliberadamente irrelevante retornou HTTP 200 com
  `ignored`, confirmando a integração sem publicar uma release fictícia.
- `app_release` foi atualizada para `1.4.1`, com o APK da build
  `b2605153-7cdf-4903-986f-80c14d14caf4`, expiração em 15/09/2026 e a nota
  `Corrige tela branca apos desbloqueio por digital`.

## Sessão de 02/09/2026 - correções da auditoria `/impeccable audit app`

Rodada de auditoria nas cinco dimensões (acessibilidade, performance,
aparência, conformidade de plataforma, adaptividade) sobre `app/(app)/*` e os
componentes compartilhados, seguida das correções. Nota saiu de 10/20 para
15/20. O relatório completo, com o estado achado a achado, está em
`IMPECCABLE_AUDIT.md`, na seção "Auditoria: 02 de setembro de 2026".

Corrigido:

- **Gráficos eram mudos para leitor de tela.** `PieChart` virou um único
  elemento com `accessibilityRole="image"` e a composição lida por extenso
  ("Gastos por categoria: Mercado 32%, ..."); as áreas de toque das colunas do
  `StackedBarChart`, que são a única forma de selecionar um período, ganharam
  papel, rótulo, dica e estado de seleção. Os dois `<Svg>` saíram da árvore de
  acessibilidade para não anunciar nós soltos de fatia e eixo. Os rótulos das
  colunas não incluem valor de propósito: quem anuncia dinheiro é a lista
  abaixo, que passa por `PrivacyValue` e respeita o modo privacidade.
- **`app/(app)/index.tsx` não tinha nenhum `useMemo`** — 1760 linhas, 44
  `useState`, e todos os derivados (`pieData`, `byCategory`, totais,
  comprometimento futuro, safe-to-spend) recalculados a cada tecla digitada,
  sobre o histórico inteiro. Passe completo de memoização; as contas subiram
  para antes do `if (loading)`, porque hook não pode vir depois de early
  return. `PieChart`, `FutureTimelineChart` e `LineAreaChart` viraram `memo`.
  `StackedBarChart` não, porque tem estado interno de seleção.
- **Tablet nativo nunca ganhava o trilho lateral.** `temBarraLateral` exigia
  `Platform.OS === 'web'` — trava que fazia sentido quando o `sidebarAdaptable`
  das Native Tabs entregava a sidebar do sistema no iPad (ligar as duas daria
  navegação lateral em dobro). Com as Native Tabs removidas na sessão
  anterior, não há concorrente e a trava virou o bug: num iPad a barra
  flutuante era a única navegação, esticada de ponta a ponta com cinco itens
  `flex: 1`. Agora vale `classe !== 'compacto' && (web || altura >= 600)`. O
  piso de altura mira tablet e não celular deitado — iPhone em paisagem tem
  ~844 de largura mas ~400 de altura; tablet tem 744+ nos dois eixos.
- **`fontVariant: ['tabular-nums']` faltando** nos campos de digitação de
  valor de Início, Contas, Lançamentos e Crédito, contra a regra do próprio
  projeto — e justamente onde a dança de dígitos mais aparece.
- Comentários que ainda descreviam o mundo pré-`00de222` foram corrigidos
  (`lib/tab-bar.ts`, `components/SideNav.tsx`, o doc de `Breakpoint`):
  `SideNav` não é mais "exclusivo da web larga".

Deixado aberto de propósito, com o motivo registrado no relatório:

- **Histórico sem paginação em Início, Gráficos e Desafios.** Janelar a busca
  não deixa a tela mais lenta, deixa o SALDO ERRADO — a conta depende do
  histórico completo. A correção certa é agregação no banco, que exige
  migração aplicada e validada contra o banco de verdade. A auditoria de 28/08
  já tentou e reverteu pelo mesmo motivo.
- **Navegação e ícones nativos** (nota 1/4 em conformidade de plataforma).
  Reimplementar Native Tabs exige validação em aparelho físico antes de ir pra
  loja — foi a falta disso que deixou a tela branca passar duas vezes.
- **Reflow em telas largas** nas seis telas que ainda são layout de celular
  esticado. É decisão de design por tela, não correção pontual — e agora com
  mais superfície, já que o trilho lateral passou a aparecer em tablet.

Verificações: `npx tsc --noEmit` limpo após cada etapa e `npm run test:parser`
completo aprovado (34.093 checagens do corpus mais OFX, dedup de CSV, limite
de cartão, paginação, recorrência, sequência, relatório, Score, guardas de
schema e `sync-parser` 26/26 em sincronia). Nenhuma build disparada nesta
sessão e `app.json` segue em `1.4.1` — as mudanças são todas de código do app,
sem migração de banco.

## Sessão de 02/09/2026 - guarda ortográfica das notas de versão

A 1.4.1 publicou "Corrige tela branca **apos** desbloqueio por digital" no
pop-up de novidades, sem acento, na cara de todo mundo que atualizou.

A causa não foi distração, era estrutural: os commits deste repositório são
escritos sem acento por convenção ("fix: estabiliza navegacao apos
biometria"); quando o `eas build` roda sem `--message`, o EAS preenche a
mensagem do build com a mensagem do commit; o `eas-build-webhook` copia essa
mensagem verbatim para `app_release.notes`; e o app renderiza `notes` sem
tocar em nada. O caminho padrão do pipeline publicava texto interno como copy
de produto — ia acontecer de novo.

- `lib/notas-release.ts` é a guarda. Ela **reprova**, não conserta: acento é
  ambíguo demais em português para adivinhar ("esta"/"está", "e"/"é",
  "pais"/"país") e um conserto errado é pior que o erro original.
- Duas camadas de detecção. Um dicionário de palavras que sem acento não
  existem, e regras por TERMINAÇÃO (`-ao`, `-oes`, `-encia`, `-avel`,
  `-ivel`, `-ario`, `-orio`...), que são o que dá garantia de verdade: lista
  envelhece, "nenhuma palavra termina em -cao sem til" continua valendo para
  palavras que ninguém previu. `-oria` e `-aria` ficaram de fora de propósito
  — "categoria", "padaria" e "faria" estão certas sem acento.
- Também reprova nota que começa com prefixo de commit (`fix:`, `feat:`...),
  que é o sinal de que o build rodou sem `--message`. Vale mesmo quando o
  texto está ortograficamente perfeito: continua sendo changelog técnico.
- Três pontos de uso: `npm run notas:check "<mensagem>"` antes do build;
  a Edge Function `eas-build-webhook` como rede de segurança; e
  `__tests__/corpus-notas-release.ts` dentro de `npm run test:parser`.
- Reprovada no webhook, a versão é publicada **mesmo assim, sem notas**. O
  aviso de atualização da regra 5 do AGENTS.md não pode depender de
  ortografia: perder o pop-up é arranhão, perder o aviso de versão faz a
  build inteira passar despercebida. A recusa vai pro log da função e pro
  corpo da resposta, que aparece na tela de webhooks do EAS.
- A cópia dentro da Edge Function (Deno não importa do app) entrou no
  `__tests__/sync-parser.js`, que passou a comparar dois pares de arquivos em
  vez de um. Verificado que ele reprova de verdade quando as cópias divergem.
- Regra 6 nova no `AGENTS.md`; a antiga regra 6 (ler o `context.md`) virou 7.
- Metade do corpus de teste é de FALSO POSITIVO ("categoria", "padaria",
  "faria", "moradia"). Um verificador de acento que acusa palavra certa trava
  build por frase correta, perde a confiança e alguém desliga — e aí volta a
  passar erro de verdade.

**Pendente, precisa de service_role:** o texto errado ainda está no banco.
Esta sessão só tem a chave anon. Rodar no SQL editor do Supabase:

```sql
update app_release
   set notes = 'Corrige tela branca após desbloqueio por digital',
       updated_at = now()
 where id = 1 and version = '1.4.1';
```

Quem já abriu o app e viu o pop-up não vai vê-lo de novo (o
`grana_novidades_versao_vista` local já está em 1.4.1); a correção vale para
quem ainda não atualizou ou não abriu.

Verificações: `npx tsc --noEmit` limpo e `npm run test:parser` completo
aprovado — 94/94 nas notas de release e 32/32 em sincronia. Nenhuma build
disparada; `app.json` segue em `1.4.1`.

## Sessão de 02/09/2026 - carrossel de ações e entrelinha da tela de Crédito

Dois pedidos do autor, a partir de prints do app em produção.

**Ações da Início voltaram a deslizar.** Os quatro botões ("Colar
comprovante", "Importar extrato", "Escanear nota", "Lançamento por voz")
estavam empilhados em duas fileiras. O `b34be61` (passe de auditoria) trocou
o `ScrollView horizontal` por `flexWrap: 'wrap'` e não atualizou o comentário
logo acima, que continuava descrevendo a rolagem — código e comentário
estavam se contradizendo desde então. Revertido para o `ScrollView
horizontal` original; o `minHeight: touchTarget` que veio no mesmo commit
ficou, porque é alvo de toque e não layout.

**Entrelinha da tela de Crédito.** A tela tinha 31 estilos de texto com
`fontSize` e apenas 1 com `lineHeight`. O `lib/theme.ts` já documenta por que
isso embola: a Neue Machina tem leading intrínseco curto, então `<Text>` sem
`lineHeight` explícito sai com as linhas quase encostadas — e existe o helper
`lh(tamanho, papel)` justamente pra isso, usado até então só em duas telas de
auth.

- 22 estilos passaram a usar `lh()`, pelo papel do texto: `corpo` (1.45) no
  que quebra em duas linhas de verdade, `apoio` (1.4) em rótulo e metadado,
  `valor` (1.15) em dinheiro, `titulo` (1.25) no título de folha.
- Ficaram de fora de propósito: rótulos de botão (mudar a caixa de texto muda
  a geometria do botão) e campos de digitação (`lineHeight` em `TextInput` no
  Android corta o texto verticalmente).
- `invoiceInfo` ganhou `gap: 2`. Era o único bloco empilhado da tela sem folga
  nenhuma: "Total em Faturas (Todos os Cartões)" quebra em duas linhas e a
  segunda encostava no "R$ 0,00" logo abaixo. Os vizinhos já tinham folga
  (`cardIdentidade` 2, `cardMidRow` 2, `cardBottomRow` 4, `txInfo` 2).

Verificações: `npx tsc --noEmit`, `git diff --check` e `npm run test:parser`
completo aprovados. Sem validação visual em aparelho ou navegador nesta
sessão — não há login disponível aqui, então as duas mudanças são de leitura
de estilo, não de observação da tela renderizada.

## Sessão de 02/09/2026 - segunda auditoria e correções

`/impeccable audit` rodado de novo, com mais rigor que a rodada anterior do
mesmo dia. Nota medida: 12/20; depois das correções: 16/20. Relatório completo
em `IMPECCABLE_AUDIT.md`, seção "Auditoria: 02/09/2026 (segunda rodada)".

**A nota caiu de 15 para 12 sem haver regressão** — a rodada anterior tinha
dado alto demais em duas dimensões: eu memoizei só a Início e dei Performance
3/4 sem abrir as outras cinco telas, e dei Aparência 4/4 sem nunca medir
cobertura de entrelinha fora do Crédito.

Corrigido:

- **Only-Font Rule violada em produção.** `index.tsx:1670` tinha
  `fontFamily: 'monospace'` nos badges "exemplo"/"oculto" do cabeçalho da
  Início — única violação no repositório inteiro. Trocado por `fonts.regular`.
- **Entrelinha em 85 estilos, nas 6 telas restantes.** O `lh()` existia e vivia
  em duas telas de auth; a correção do Crédito tinha ficado só na tela apontada
  pelo autor. Rótulo de botão e campo de digitação ficaram de fora de propósito.
  Validado por script: 114 blocos, cada `lineHeight` casando com o `fontSize`
  do próprio bloco.
- **Memoização em `credito`, `lancamentos`, `contas` e `desafios`**, que tinham
  zero. O pior era `lancamentos`: quatro passadas sobre a lista a cada tecla
  digitada na busca, sendo que só a última depende do texto. `perfil` segue em
  zero e está certo — não tem valor derivado sobre lista.
- **Badges do Desafios** saíram de `width: '48%'` fixo (duas colunas em
  qualquer largura, ~690px cada num monitor) pra largura por classe de janela.
- **DESIGN.md reconciliado**: Native Tabs (removidas), `theme.danger` (existia
  no código e não no documento) e o vocabulário de sombra (10 receitas no
  código contra 5 catalogadas — as 4 novas foram catalogadas, não consolidadas).

Dois erros meus, pegos e corrigidos dentro da própria sessão, que valem registro:

1. O primeiro script de entrelinha iterava sobre posições calculadas no texto
   original enquanto mutava a string — todas as inserções depois da primeira
   caíam deslocadas. `tsc` passou mesmo assim. Revertido e refeito inserindo de
   trás pra frente, com validador conferindo bloco a bloco.
2. Em `desafios.tsx` coloquei `useBreakpoint` e `useMemo` DEPOIS do
   `if (loading || !state) return`, o que quebraria em runtime com "rendered
   more hooks than during the previous render". `tsc` não pega isso. Escrevi um
   verificador de ordem de hook que roda nas 8 telas e agora acusa zero.

Achados deixados abertos, com motivo: busca sem paginação (janelar deixa o
saldo errado, exige agregação no banco), navegação/ícones nativos (exige
aparelho físico), `perfil.tsx` fora do `screenRhythm` e 9 componentes órfãos.

Um achado da primeira redação era **falso positivo**: "6 de 7 telas não
refluem". A Início reflui via `WidgetGrid`, e `contas`/`credito`/`lancamentos`
são telas de lista e `perfil` é tela de ajustes — coluna única com teto de
largura é o padrão certo dessas superfícies, não defeito.

Verificações: `tsc --noEmit`, `test:parser` completo, bundle web compilando no
Metro (HTTP 200) e verificador de ordem de hook nas 8 telas. Sem validação
visual — não há login nesta sessão. Nenhuma build disparada; `app.json` em
1.4.1.

## Sessão de 02/09/2026 - terceira auditoria: a correção que se perdeu

Reauditoria logo após as correções da segunda rodada. Achado principal: **uma
correção que eu declarei feita não estava feita.**

A segunda rodada trocou `fontFamily: 'monospace'` por `fonts.regular` no estilo
`demoFlag` de `app/(app)/index.tsx` (badges "exemplo"/"oculto" do cabeçalho da
Início, única violação da Only-Font Rule no repositório). Logo depois, um
`git checkout --` no mesmo arquivo — feito para desfazer um script de entrelinha
bugado — levou a correção junto. O passe de entrelinha foi refeito por cima; a
troca da fonte, não. O relatório e a mensagem de commit saíram afirmando que
estava resolvido, e foi para a `main` assim.

`tsc` não pega. O corpus não pegava. Só releitura pegou — e depender de
releitura é o mesmo que não ter garantia.

Correção estrutural: `__tests__/corpus-design-system.ts`, dentro do
`test:parser`, verifica por máquina as Named Rules absolutas do `DESIGN.md`:

- nenhum `fontFamily` com literal de string em `app/` ou `components/`;
- nenhum `fontWeight` (só existem Light e Regular como arquivo);
- nenhuma fonte de sistema citada em linha de `fontFamily`;
- `lib/theme.ts` declara as duas famílias que existem, e os `.otf` existem.

294 guardas. Comentários ficam de fora de propósito — os arquivos que explicam
as regras citam as grafias proibidas. Verificado que REPROVA: reintroduzindo o
`monospace`, duas regras disparam com arquivo e linha e o processo sai com
código 1, quebrando o `test:parser`.

Nota segue 16/20. A segunda rodada já tinha anunciado esse número, mas ele
estava certo por sorte: uma das correções que o compunham não existia.

Achados novos (os dois P3, não corrigidos): avatares usam o `<Image>` do React
Native com uri remoto, sem `expo-image`, sem cache em disco no Android e
decodificados em tamanho cheio para exibir a 44px; e o ajuste fino das listas é
parcial — todas as 10 `FlatList` têm `keyExtractor`, mas só 5 pontos usam
`getItemLayout`/`windowSize`/`initialNumToRender`, sendo que Lançamentos e
Crédito têm altura de linha fixa e ganhariam com `getItemLayout`.

Positivos confirmados: arranque correto para o SDK 57 (`preventAutoHideAsync`
em escopo global sem await), escala de fonte do sistema intacta (zero
`allowFontScaling`, ou seja, padrão ligado), e as correções da segunda rodada
se sustentaram.

## Sessão de 02/09/2026 - plano de interruptores remotos (NADA implementado)

O autor pediu um jeito de desligar funcionalidade do app sem obrigar as pessoas
a atualizar — caso concreto: o WhatsApp do Grana. caiu e não há como esconder o
botão nem o vínculo de número. Pediu também aviso dentro do app e notificação
push (Android/iOS).

**Nenhuma linha de código foi alterada nesta sessão.** O pedido explícito foi
montar o plano para executar na outra máquina. O plano está em
`PENDENCIAS.md`, na raiz (o plano nasceu como
`PLANO-INTERRUPTORES-REMOTOS.md` e foi absorvido por ele), pronto para ser
seguido: SQL
completo, o provider React inteiro, os quatro pontos de entrada do WhatsApp com
arquivo e linha, o componente de aviso, a parte de push (tabela, registro,
Edge Function remetente, credenciais FCM/APNs), o SQL de operação do dia do
incidente, os testes a escrever e um checklist na ordem.

A ressalva que decide o cronograma, e que está no topo do plano: **isto não
resolve o apagão atual.** O app instalado (1.4.1) não tem código que procure
por flags, então o interruptor só existe a partir de uma build nova — dela em
diante todo apagão futuro se resolve por UPDATE no banco. Quem ficar na 1.4.1
continua vendo o botão do WhatsApp para sempre.

Duas decisões de arquitetura registradas no plano, com o motivo:

- **Flags genéricos por nome**, não um booleano de WhatsApp: mesmo trabalho
  agora, e o próximo incidente em qualquer funcionalidade não exige build.
- **Falha ABERTA**: se a leitura da tabela falhar, tudo continua ligado. É o
  oposto do `EntitlementProvider`, que falha fechado de propósito porque o RLS
  aplica a mesma regra no servidor; aqui não existe segunda barreira e o custo
  de errar para cada lado é invertido. Uma queda do Supabase não pode virar app
  inteiro morto.

Levantamento que fundamenta o plano: `expo-notifications` já está instalado e
configurado como plugin, mas só é usado para notificação LOCAL (lembrete de
boleto, fatura, limite de cartão em `lib/notifications.ts`) — não há registro
de push token, tabela de token nem remetente, então push é trabalho novo de
verdade. O `EntitlementProvider` serve de template para o provider de flags, e
o `NovidadesModal` para o pop-up de aviso.

## Sessão de 02/09/2026 - PENDENCIAS.md, documento único de handoff

A pedido do autor, tudo o que está em aberto foi consolidado num arquivo só:
`PENDENCIAS.md`, na raiz. O `PLANO-INTERRUPTORES-REMOTOS.md` foi absorvido
por ele (virou o Bloco 3) e APAGADO — dois documentos sobre o mesmo assunto
viram duas fontes de verdade que divergem, problema que este repositório já
teve.

Estrutura, em ordem de execução:

- **Bloco 1 (2 min)** — o SQL do acento, que ainda está errado no banco de
  produção e exige `service_role`; e o passo novo do `notas:check` antes de
  todo build.
- **Bloco 2 (10 min)** — validação visual das mudanças desta sessão, que é o
  maior risco em aberto: 85 estilos de entrelinha, memoização em 4 telas,
  reflow das badges e o carrossel de ações, tudo alterado sem ninguém ver
  rodando. Traz o que olhar tela a tela e o que é sinal de que passou do ponto.
- **Bloco 3 (~1 dia)** — os interruptores remotos, plano completo.
- **Bloco 4** — as dívidas que exigem banco ou aparelho físico: paginação
  (janelar deixa o saldo ERRADO, não lento), Native Tabs, e o
  `expo install --check` que o proxy bloqueou aqui.
- **Bloco 5 (~2 h)** — P3: `perfil.tsx` fora do `screenRhythm`, 9 componentes
  órfãos com 614 linhas, avatares sem `expo-image`, `getItemLayout`.

Duas seções finais que existem para evitar retrabalho: o que **não** está
pendente (as correções já na `main`, com o aviso explícito de que `perfil.tsx`
com zero `useMemo` está CERTO e não deve ser "corrigido"), e as regras
permanentes do `AGENTS.md` resumidas.

Nenhuma linha de código do app foi alterada nesta sessão desde a terceira
auditoria — só documentação.

## Sessão de 02/09/2026 - interruptores remotos IMPLEMENTADOS (cliente)

O Bloco 3 do `PENDENCIAS.md` foi executado. Todo o lado do cliente está
pronto; **falta aplicar o SQL no Supabase**, que esta máquina não alcança.

- `lib/versao.ts` — `compararVersoes` saiu de `lib/atualizacao.ts` para um
  módulo SEM nenhum import. Motivo: `atualizacao.ts` puxa expo-constants,
  AsyncStorage e o cliente Supabase, e os corpus rodam em node puro.
- `lib/feature-flags-regras.ts` — tipos, as 13 chaves e `efetivamenteLigado`,
  sem React nem React Native, para o corpus poder testar a decisão.
- `lib/feature-flags.tsx` — o provider: lê na entrada e a cada volta do
  background (`AppState`), montado em `app/_layout.tsx` dentro do
  `SessionProvider` (a leitura passa por RLS).
- `components/AvisoFlagModal.tsx` — pop-up de instabilidade, modelado no
  `NovidadesModal`. `info` não abre pop-up, `aviso` abre uma vez, `critico`
  abre sempre. Um aviso por vez, com `critico` na frente.
- `supabase/schema.sql` — tabela `feature_flags` com RLS, as duas constraints
  (severidade válida; desligado exige mensagem) e as 13 chaves semeadas.
- `__tests__/corpus-flags.ts` — 17 checagens, dentro do `test:parser`.

As 13 ferramentas ligadas ao interruptor, com o padrão escolhido por contexto:

| ferramenta | comportamento quando desligada |
|---|---|
| whatsapp | ícone da Início SOME; linha do Perfil fica visível e desabilitada; pareamento some no Perfil e no onboarding; **desvincular continua funcionando** |
| importar_extrato, colar_comprovante, qr_nota, lancamento_voz | somem da fileira de ações (ela desliza, então some sem buraco) |
| relatorio_pdf, cofrinhos | componente retorna null |
| desafios | a TELA vira aviso; a aba continua na barra, porque sumir com ela moveria o resto da navegação debaixo do dedo |
| assinatura_checkout | botão desabilitado com rótulo trocado, nunca escondido — some numa tela de assinatura deixaria a pessoa sem saber o que fazer |
| foto_perfil | guarda no ponto de AÇÃO (`escolherFoto`), não só no botão; remover foto continua liberado |
| lembretes, orcamento_sugerido, diagnostico | linha desabilitada ou escondida no Perfil |

Regra que valeu para todos: **o interruptor esconde a ENTRADA, nunca apaga
dado**, e ação de saída (desvincular, remover foto) nunca é bloqueada.

Achado registrado e NÃO corrigido: `components/ToggleSwitch.tsx` tem violação
das Rules of Hooks pré-existente — `if (Platform.OS !== 'web') return` na linha
21, com `useReducedMotion` e `useEffect` depois. Não quebra em runtime porque
`Platform.OS` é invariante entre renders, então o ramo é sempre o mesmo. Foi
achado pelo verificador de ordem de hook desta sessão; corrigir é mexer em
código fora do escopo desta tarefa.

Verificações: `tsc --noEmit`, `test:parser` completo (17/17 nos interruptores),
verificador de ordem de hook em 0 violações, bundle web compilando (HTTP 200) e
app renderizando no Chromium com o FlagsProvider na árvore, zero erro de
runtime. Sem validação visual das telas logadas: não há login nesta máquina.

**Pendente e só possível aí:** aplicar o SQL de `feature_flags` (está pronto no
fim do `supabase/schema.sql`, é copiar e colar no SQL Editor). Enquanto a
tabela não existir, a leitura falha e cai na FALHA ABERTA — tudo continua
ligado, nada quebra. Push (Parte 5 do plano) não foi implementado.

## Sessão de 02/09/2026 - reconciliação: duas sessões implementaram o Bloco 3 em paralelo

Esta máquina, com acesso real ao Supabase, já tinha aplicado o SQL da Parte 1
(tabela `feature_flags` em produção, verificada linha a linha) num commit
separado, sem saber que a sessão descrita no bloco acima (rodando sem acesso
ao Supabase) tinha, ao mesmo tempo, terminado e publicado o lado inteiro do
cliente em `origin/main` (commit `8c06a7e`). As duas se desconheciam.

Paralelamente, um agente Codex também chegou a começar uma **terceira**
implementação do mesmo Bloco 3, com nomes de arquivo diferentes
(`lib/feature-flags-core.ts`, `lib/versoes.ts`) mas resolvendo o mesmo
problema — descoberta a tempo, antes de virar commit.

**Resolução, nesta ordem:**

1. O trabalho do Codex (não commitado) foi guardado com `git stash push -u`
   em vez de descartado — recuperável via `git stash list` /
   `git stash show -p stash@{0}` se algum pedaço dele for útil depois, mas
   **não foi usado**: a implementação de `origin/main` já cobre o mesmo
   escopo e está testada.
2. `git pull` trouxe `8c06a7e` (fast-forward, sem conflito porque a árvore
   estava limpa depois do stash).
3. Verificado de verdade, não só aceito porque o commit dizia que sim:
   `npx tsc --noEmit` limpo, `npm run test:parser` 100% (17/17 em
   `corpus-flags.ts`, 11/11 nas guardas de schema — que agora exigem RLS e
   política de select em `feature_flags`, batendo com o que já estava em
   produção), e checagem manual de que as 13 chaves aparecem em
   `ligado('<chave>')` nos arquivos certos (`grep -rn "ligado('"`).
4. `app.json` subiu de `1.4.1` para `1.4.2` (regra 5 do `AGENTS.md`) e
   `npm run notas:check` aprovou a mensagem candidata para o próximo build.
   **Nenhum build foi disparado** — regra 4 do `AGENTS.md` exige pedido
   explícito nesta sessão para consumir cota do EAS, e não houve esse pedido.
5. `PENDENCIAS.md` atualizado: checklist do Bloco 3 marcado 1-8 e 11 como
   concluídos e verificados; 9 (build + teste no aparelho) e 10 (push)
   seguem em aberto.

**Lição para as próximas sessões, registrada no `AGENTS.md` em espírito:**
quando duas máquinas trabalham no mesmo `PENDENCIAS.md` ao mesmo tempo sem
`git fetch` frequente, o resultado são implementações redundantes do mesmo
plano. Isto só não virou conflito de merge feio porque nada da versão
divergente chegou a ser commitado.

**Ainda pendente:** item 9 (build de teste, precisa ser pedido explicitamente)
e item 10 (push, Parte 5, independente e não bloqueia).
