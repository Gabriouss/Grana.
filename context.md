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

**Pendente para a próxima sessão:** a alteração em `supabase/schema.sql`
(`publicar_app_release` com o novo parâmetro `p_notes`) ainda não foi
aplicada ao banco de produção — precisa rodar essa função atualizada no
SQL Editor do Supabase (ou via CLI) antes do próximo build, senão o
webhook chama a função com um parâmetro que a versão em produção ainda não
aceita. Ao rodar o próximo `eas build`, escrever `--message` pensando em
quem usa o app, não em changelog técnico — é isso que vira o texto do
pop-up.

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
