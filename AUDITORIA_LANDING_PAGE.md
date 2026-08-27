# Auditoria e reforma da landing page (`app/index.tsx`)

Registro do trabalho feito nesta rodada — parte por uma sessão do Codex,
parte por uma sessão do Claude Code, na mesma máquina, sobre o mesmo working
tree. Este documento existe pra próxima sessão (qualquer IA, em qualquer
máquina) saber o que já foi decidido e verificado, sem precisar reconstruir o
raciocínio do zero.

## Verdade do produto

- Modelo comercial decidido: assinatura recorrente de R$ 19,99/mês,
  cancelável a qualquer momento — não mais o modelo antigo de acesso por
  período fixo tipo infoproduto. `PRODUCT.md` e `context.md` atualizados para
  refletir isso. Toda conta segue com acesso antecipado gratuito enquanto o
  checkout (Kiwify/Hotmart) não estiver operacional.
- Copy do QR Code de nota fiscal (NFC-e) corrigida: o lançamento criado é o
  **valor total da compra**, não item por item — a claim antiga ("cada item
  já categorizado") não correspondia ao que `lib/nfce-parser.ts` de fato
  extrai.
- Claim de segurança qualificada por plataforma: "a sessão fica criptografada
  no aparelho" era verdade só no app nativo (Keychain/Keystore), falso na
  web (sem essa camada). Copy agora distingue "no aplicativo móvel" do resto.
- `landing-meta.json` centraliza título, descrição, Open Graph e nome legal
  do negócio — uma fonte só, usada tanto pela rota (`app/index.tsx`) quanto
  pelo script de exportação (`scripts/inject-og-meta.js`), evitando
  descrição divergente entre o que a pessoa vê e o que um crawler lê.

## Acessibilidade

- Landmarks semânticos: `role="banner"` no cabeçalho, `role="navigation"`
  na navegação principal, `role="main"` envolvendo o conteúdo entre o
  cabeçalho e o rodapé, `role="contentinfo"` no rodapé.
- Links reais de âncora (`href="#produto"`, `href="#precos"`) no lugar de
  `onPress` + `scrollIntoView` via JS — funcionam com "abrir em nova aba",
  clique do meio, e são navegáveis sem JavaScript. `scrollMarginTop` nas
  seções-alvo compensa o cabeçalho fixo (sem isso o topo da seção ficava
  escondido atrás dele).
- Skip link ("Pular para o conteúdo") — invisível até ganhar foco por
  teclado, testado manualmente (Tab como primeira tecla) e funciona.
- FAQ com `aria-expanded`/`aria-controls`/`role="region"` ligando pergunta e
  resposta, ícone +/− marcado `aria-hidden`.
- Alvos de toque de pelo menos 44px em todo link/botão pequeno (nav do
  cabeçalho, rodapé, FAQ) via `hitSlop` ou `minHeight`.
- IDs de gradiente SVG únicos por instância (`useId()`) no `BrandLogotype` —
  evita colisão se o logo aparecer mais de uma vez na mesma página.
- Faixa de confiança (marquee) ganhou um botão de pausar/retomar (alvo de
  44×44px) — conteúdo em movimento contínuo precisa de um jeito de parar.

## Performance e animações

- `RevealOnScroll`: fica visível por padrão quando `IntersectionObserver`
  falha ou o `ref` não resolve (antes podia ficar invisível pra sempre nesse
  caso); cleanup do observer corrigido.
- `GradeInterativa`: reduzidas as leituras de layout por evento de scroll
  (rect cacheado, só recalculado quando necessário); o listener de `scroll`
  agora escuta o ancestral que realmente rola (a `ScrollView` do
  react-native-web é uma div interna, não a `window` — um `window.addEventListener('scroll', ...)`
  nunca disparava nesta página).
- Removido o `Animated.loop` do parallax dos `GlowOrb` (ligado a
  `scrollY`) e o "scroll bounce" antigo baseado em `Animated` — trocados por
  CSS puro (`@keyframes`), consistente com o resto da página e sem o custo
  de um listener de scroll em JS movendo `Animated.Value` a cada frame.
- Imagem do capítulo 1 do herói mobile trocada por uma versão menor
  (`tela-mobile-2-800.png`, 800px de largura em vez do arquivo original) e
  marcada `fetchPriority="high"` — é a maior candidata a LCP da dobra
  inicial no mobile.
- `prefers-reduced-motion` verificado de forma síncrona no estado inicial
  (`matchMedia`) em todo componente animado, não só depois de um efeito
  assíncrono — evita um frame de animação antes da preferência do sistema
  ser aplicada.

## SEO e produção

- `scripts/inject-og-meta.js` reescrito: lê `landing-meta.json` como fonte
  única, injeta canonical, JSON-LD (`SoftwareApplication`, com o nome legal
  do responsável), tema escuro, e um fallback `<noscript>` visível (não mais
  o rodapé injetado e escondido via CSS reset — a mesma informação que a
  Verificação de Empresa da Meta precisa agora aparece pra QUALQUER
  visitante sem JS, não só pra crawler).
- **CSP com hash do JSON-LD**: o script calcula o SHA-256 do bloco JSON-LD e
  falha o build (`process.exit(1)`) se esse hash não bater com o que está
  cadastrado no `Content-Security-Policy` de `vercel.json` — trava
  proposital pra ninguém mudar o conteúdo do JSON-LD sem atualizar o CSP
  junto.
- `vercel.json` ganhou o bloco `headers` que faltava (o build FALHAVA sem
  ele — `vercel.headers` não existia, a checagem de hash sempre dava erro).
  Content-Security-Policy, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy (câmera/microfone liberados pra
  `self` — o app usa os dois de verdade, QR Code e voz — geolocalização/
  pagamento/usb negados) e Strict-Transport-Security.
- `robots.txt` e `sitemap.xml` novos, cobrindo a landing e as páginas legais
  públicas (termos, privacidade, exclusão de dados).
- UTM/parâmetros de atribuição (`utm_*`, `gclid`, `fbclid`) da URL de
  chegada são preservados e repassados pro link de cadastro — sem instalar
  nenhum analytics de terceiro.

## Manutenção e código morto

- Sombra de hover fora do catálogo do `DESIGN.md` corrigida — reaproveita a
  receita "Card de persuasão" já cadastrada em vez de números novos.
- Bloco inteiro de estilos mortos removido (~27 chaves `mock*`, sobra de uma
  versão anterior do herói/seções que usava mocks desenhados à mão em vez
  das screenshots reais atuais).
- `components/IconeMetaAtingida.tsx` saiu do CTA final (simplificação da
  seção) mas o arquivo foi mantido no repo, não apagado — mesmo critério já
  usado para `NotebookVideo.tsx`. `context.md` atualizado pra não descrever
  mais como estando em uso.
- FAQ: o desalinho vertical "workshop" (cards escalonados, larguras
  variáveis) foi trocado por uma lista simples empilhada em toda largura de
  tela — menos código bespoke, mais previsível, sem perder a legibilidade.

## O que NÃO foi feito nesta rodada (decisão deliberada)

- **Divisão da rota em arquivos menores**: `app/index.tsx` continua um
  arquivo único. A proposta original já limitava isso a "só as partes de
  maior risco", e dado o tamanho do resto do trabalho, ficou de fora desta
  rodada — não é urgente (o arquivo é grande mas organizado por seções
  comentadas) e vale ser feito com calma, não de afogadilho junto de tudo
  isso.
- **Fila offline cobrindo o app inteiro**: só a tela de Débito e Pix
  (`lancamentos.tsx`) usa a fila de lançamentos pendentes offline hoje. O
  modelo de dados da fila (`lib/offline-cache.ts`) foi corrigido pra
  preservar carteira/método de pagamento, mas estender isso pras outras 4
  telas que também lançam direto (Home, QR de nota, comprovante colado,
  compra no crédito) ficou de fora — cada uma tem nuance própria de erro que
  merece teste dedicado, não uma mudança em lote.
- **Migração da sessão web pra cookies HttpOnly**: decisão consciente de
  NÃO fazer — exigiria um backend de sessão e abandonar a arquitetura de
  SPA atual. Em vez disso, a claim de "criptografia" foi corrigida pra não
  prometer algo que a web não tem, e os headers de segurança (CSP, X-Frame-
  Options etc.) tratam de boa parte do risco de XSS/clickjacking que
  motivaria a migração.

## Como foi verificado

- `npx tsc --noEmit` — limpo.
- `npx expo export --platform web` + `node scripts/inject-og-meta.js` —
  pipeline de build de produção completo, do jeito que o Vercel roda,
  rodado localmente do início ao fim sem erro.
- HTML gerado (`dist/index.html`) inspecionado à mão: título, meta tags,
  canonical, JSON-LD, `lang="pt-BR"`, fallback `<noscript>` — todos
  presentes e corretos.
- Build servida localmente com os headers exatos do `vercel.json`
  (script `serve-dist.js` descartável, não faz parte do repo) e aberta num
  browser real: app montou, navegação por link real (`/sign-up`) funcionou,
  **zero violação de CSP e zero erro no console** em duas rotas
  (`/` e `/sign-up`).
- Reteste visual nos dois breakpoints principais (~390px e 1440px):
  herói, faixa de confiança (com botão de pausa), FAQ, skip link por
  teclado — todos conferidos por screenshot.
- Dois bugs reais encontrados e corrigidos durante essa verificação, não
  antes: `RevealOnScroll.tsx` (erro de TypeScript, `observador` possivelmente
  `undefined` dentro do próprio callback) e um `animationName` declarado
  dentro de `StyleSheet.create` (o validador de estilo do react-native-web
  rejeita essa chave ali — precisa ficar fora, como todo outro
  `animationName` desta base de código já fica).
