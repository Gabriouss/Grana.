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

**Fase atual**: acesso antecipado, gratuito, preço ainda em definição.
Integração de WhatsApp em revisão pela Meta.

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

**Assinatura/acesso**: `subscriptions.access_until` — outorga por período
fixo (infoproduto vendido por plataforma tipo Kiwify), não assinatura
recorrente. `lib/assinatura.ts` cuida do vínculo automático (email/token) e
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
- **`fontWeight` nunca é usado** — a fonte (Neue Machina) só tem Light e
  Regular como arquivos reais; não existe negrito. Ver "The Two-Weight
  Rule" em `DESIGN.md`.
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
- **`lib/breakpoints.ts`** — a landing page e as poucas telas com layout
  largo usam `colunaConteudo`/`colunaLeitura`/`useBreakpoint()`; o app
  logado é intencionalmente uma coluna só em qualquer tamanho de tela
  (decisão de design documentada em `DESIGN.md`), a landing é a exceção.
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

## Estado no momento deste documento

- Landing page (`app/index.tsx`) reformulada em duas sessões recentes
  (FAQ/Preços/CTA/marquee numa, herói com notebook animado + grade
  interativa noutra) — ambas já publicadas em `main`.
- Preço do produto ainda não definido; nenhuma trava de acesso por
  assinatura implementada.
- Épicos de `PLANO_DE_EVOLUCAO.md` (metas/cofrinhos, gamificação, projeção
  de fatura) majoritariamente já implementados — conferir `lib/goals.ts`,
  `lib/gamification*.ts`, `lib/projections.ts` antes de assumir que é
  trabalho futuro.
