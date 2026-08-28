---
name: Grana.
description: Registro de finanças pessoais que você conta — voz, WhatsApp ou nota fiscal — não preenche.
colors:
  deep-petroleum: "#052229"
  raised-tide: "#0b2d35"
  sea-foam-white: "#effffa"
  soft-kelp: "#a6d9ce"
  faint-kelp: "#7fa9a0"
  working-teal: "#1fa98d"
  instrument-mint: "#aeffe3"
  abyss-teal: "#04475c"
  clear-green: "#74e291"
  calm-cyan: "#00a6ca"
  rule: "rgba(175,255,227,0.14)"
  rule-strong: "rgba(175,255,227,0.26)"
typography:
  display:
    fontFamily: "NeueMachina-Regular, sans-serif"
    fontSize: "24px"
    lineHeight: 1.2
  title:
    fontFamily: "NeueMachina-Regular, sans-serif"
    fontSize: "20px"
    lineHeight: 1.25
  body:
    fontFamily: "NeueMachina-Regular, sans-serif"
    fontSize: "16px"
    lineHeight: 1.45
  label:
    fontFamily: "NeueMachina-Regular, sans-serif"
    fontSize: "14px"
    lineHeight: 1.35
    letterSpacing: "0.5px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.sea-foam-white}"
    textColor: "{colors.deep-petroleum}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "14px 20px"
  button-primary-hover:
    backgroundColor: "{colors.sea-foam-white}"
    textColor: "{colors.deep-petroleum}"
  button-cta:
    backgroundColor: "{colors.working-teal}"
    textColor: "{colors.deep-petroleum}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "16px 28px"
  card:
    backgroundColor: "{colors.deep-petroleum}"
    textColor: "{colors.sea-foam-white}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-raised:
    backgroundColor: "{colors.raised-tide}"
    textColor: "{colors.sea-foam-white}"
    rounded: "{rounded.xl}"
    padding: "20px"
---

# Design System: Grana.

## Overview

**Creative North Star: "The Confessional Ledger"**

Você conta o que aconteceu com seu dinheiro — falando, mandando um áudio no
WhatsApp, apontando a câmera pra uma nota — e o Grana. escuta sem julgar.
Não existe vermelho de alarme pra gasto, não existe tom de erro pra ter
saído dinheiro da conta: "saída" usa ciano, a mesma família cromática de
"entrada", porque gastar não é um erro a ser sinalizado. A superfície é
água escura e calma — petróleo profundo, quase preto — com um brilho menta
pontual fazendo o papel de agulha de bússola: aparece exatamente onde a
atenção precisa ir (marca, ação primária, valor em foco) e some no resto.

O sistema é deliberadamente contido. Não é uma planilha utilitária — a
personalidade entra pela tipografia de marca (Neue Machina) e pelo ritmo
generoso de espaço, não por densidade de dado. E não é um banco tradicional
nem um fintech gamificado: sem confete, sem selo, sem urgência fabricada.
Confiança aqui vem de consistência silenciosa, não de efeito.

**Key Characteristics:**
- Fundo quase preto, petróleo profundo — nunca branco, nunca cinza neutro.
- Menta e ciano carregam toda a marca; vermelho não existe no vocabulário.
- Números monetários sempre tabulares — não podem "dançar" ao atualizar.
- Neue Machina é a ÚNICA fonte do produto, ponto a ponto — marca, títulos,
  corpo, campos, controles, valores. Nunca a fonte do sistema, nunca outra
  família em lugar nenhum, em plataforma nenhuma.
- Superfícies ficam chapadas por padrão; sombra é reservada pra sinalizar
  algo genuinamente flutuando sobre o resto (ver Elevation & Depth).

## Colors

Paleta de duas famílias: água escura pra superfície, menta/ciano pra tudo
que precisa de atenção. Sem cinza neutro em lugar nenhum — mesmo o texto
secundário é um verde-água dessaturado, não um cinza.

### Primary
- **Working Teal** (#1fa98d): ação primária em contexto de persuasão (CTA da landing page) — o verde mais saturado da paleta, reservado pra esse único papel.
- **Instrument Mint** (#aeffe3): cor-base da marca. É também a base de `rule`/`rule-strong` (este mesmo tom em alfa 0,14 e 0,26) — toda borda e divisória do app é, na origem, esta cor diluída.

### Secondary
- **Abyss Teal** (#04475c): fundo de círculos de ícone e superfícies de destaque secundário — mais escuro que Raised Tide, mais saturado que Deep Petroleum.

### Neutral
- **Deep Petroleum** (#052229): fundo de tela. Também fundo de trilhos e poços (segmented control, barra de orçamento).
- **Raised Tide** (#0b2d35): cards, folhas, chips, menus — tudo que se eleva sobre o fundo.
- **Sea Foam White** (#effffa): texto primário. Também vira FUNDO em superfícies invertidas — botão de salvar, FAB, toast.
- **Soft Kelp** (#a6d9ce): links e ações textuais discretas.
- **Faint Kelp** (#7fa9a0): texto secundário, placeholder, ícone inativo. Contraste medido: ~5,6:1 sobre Raised Tide, ~6,4:1 sobre Deep Petroleum — dentro de AA (4,5:1) nas duas superfícies onde é usado.

### Estado (dados, não decoração)
- **Clear Green** (#74e291): entrada de dinheiro, valor positivo.
- **Calm Cyan** (#00a6ca): saída de dinheiro. Deliberadamente ciano — não vermelho. Ver a Regra abaixo.

### Named Rules
**The No-Red Rule.** Vermelho não existe no vocabulário de cor do produto. Saída de dinheiro usa Calm Cyan, não uma cor de alerta — o produto nunca trata "você gastou" como um evento negativo a ser sinalizado. A única exceção documentada no código inteiro é o verde do WhatsApp (`#25D366`) num botão que abre o WhatsApp de verdade — uma cor emprestada com propósito funcional, não decorativo, e citada como exceção explícita no próprio comentário do código.

**The Mint-Is-Rare Rule.** Instrument Mint é a cor mais chamativa da paleta e por isso a mais restrita — marca, ação em foco, valor em destaque. Se ela aparece em mais de um ou dois lugares na mesma tela, algo que devia ser silencioso está gritando.

## Typography

**Única fonte do produto:** Neue Machina — Light e Regular, os dois únicos
pesos que existem como arquivo (`NeueMachina-Light.otf`,
`NeueMachina-Regular.otf`, carregados via `expo-font` em `app/_layout.tsx`).
Isto vale em TODO texto do app, em toda plataforma, sem exceção: marca,
títulos, corpo, campo, controle, rótulo, metadado, valor monetário.

**Character:** a voz geométrica do Grana. é a interface inteira, não um
acento reservado a momentos de assinatura. Nenhum papel tipográfico usa
fonte do sistema (San Francisco, Roboto, `system-ui`) — essa era uma
decisão de uma rodada anterior, revertida a pedido explícito do autor, e a
regra agora é permanente: **proibido qualquer fonte que não seja Neue
Machina**, em qualquer papel, em qualquer plataforma. Dynamic Type/sp
continuam funcionando normalmente com fonte customizada — o React Native
escala texto de qualquer família — então não há trade-off de acessibilidade
nessa escolha.

### Hierarchy
- **Headline** (Neue Machina Regular, 24px nativo, lh 1.2): título principal de tela.
- **Title** (Neue Machina Regular, 20px, lh 1.25): título de folha, modal ou card autoral.
- **Body** (Neue Machina Regular, 17pt iOS · 16sp Android · 18px web, lh 1.45): corpo, campo e botão.
- **Label** (Neue Machina Regular, 15pt iOS · 14sp Android · 16px web, lh 1.35): rótulos e controles.
- **Metadata** (Neue Machina Light, piso 11pt iOS · 12sp Android): subtítulo de linha e informação auxiliar; nada interativo abaixo desse piso.
- **Valor monetário** (Neue Machina Regular, 32px, tabular): degrau próprio para quantias em foco.

### Named Rules
**The Only-Font Rule.** Neue Machina é a única fonte do produto — sem exceção, sem "fonte de sistema pro corpo", sem fallback que vaze pra tela. Qualquer PR/edição que introduza `fontFamily: 'System'`, `'sans-serif'`, `'system-ui'`, `Platform.select` de fonte, ou qualquer nome de família que não seja `NeueMachina-Light`/`NeueMachina-Regular` em `lib/theme.ts` está quebrando a marca, não fazendo acessibilidade — reverta, não documente como aceito. Só existem DOIS pesos (Light/Regular); não existe um terceiro degrau nem arquivo bold, e `fontWeight` nunca deve ser usado (o nativo ignora, a web sintetiza um falso negrito).

**The Tabular Rule.** Todo valor monetário usa `fontVariant: ['tabular-nums']`. Sem isso, dígitos de largura variável fazem o número "dançar" visualmente a cada atualização — inaceitável numa tela que existe pra mostrar dinheiro.

## Layout

Toda plataforma usa classes de janela (`compacto` <768px, `medio` 768–1279px, `amplo` ≥1280px), inclusive iPad Split View, Android multiwindow e aparelhos dobráveis. Compacto permanece em uma coluna; médio pode reestruturar cards em duas colunas ou modal central; amplo comporta até três colunas. A web usa SideNav em médio/amplo. No nativo, a própria navegação do sistema decide tab bar, Navigation Bar ou sidebar adaptável.

Ritmo padrão do corpo de tela: `padding` 16px, `gap` entre cards 12px (token `screenRhythm`). Card de destaque em largura cheia usa `padding` 16px, borda 1px — a mesma receita em toda tela principal, depois de uma consolidação que unificou paddings de 12/16/20 que cada tela tinha herdado de sessões diferentes.

## Elevation & Depth

Duas filosofias coexistem, por modo — e isso é decisão, não inconsistência.

**Operar (telas do app, pós-login):** chapado por padrão. A maioria dos cards não tem sombra nenhuma — só borda de 1px em `rule`. Sombra é reservada pra sinalizar algo que está genuinamente flutuando sobre o resto do conteúdo: o menu do FAB, o próprio FAB, o toast. Três receitas nomeadas, sem uma quarta variação improvisada.

**Persuadir (landing page pública):** pode pesar mais. Cards de recurso, o cartão do herói e o card de "Livre para Gastar" usam sombra suave e profunda (`0 16px 40px -12px rgba(0,0,0,0.5)`) porque a landing precisa competir por atenção antes de haver qualquer confiança estabelecida — o mesmo motivo que não se aplica a uma tela que a pessoa já abre todo dia.

### Shadow Vocabulary
- **Menu** (`0 6px 14px rgba(0,0,0,0.20)`, Android elevation 8): menu suspenso do FAB.
- **Flutuante** (`0 6px 12px rgba(0,0,0,0.30)`, Android elevation 6): o botão de ação flutuante em si.
- **Toast** (`0 4px 10px rgba(0,0,0,0.25)`, Android elevation 6): notificação toast.
- **Card de persuasão** (`0 16px 40px -12px rgba(0,0,0,0.5)`, web only): cards de recurso na landing page.
- **Card de herói** (`0 32px 80px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(174,255,227,0.07)`, web only): o card de maior destaque de uma página persuasiva — a tela de cada capítulo do herói-storytelling, flutuando sem moldura de dispositivo (referência: como a Linear expõe telas reais do próprio produto).

### Named Rules
**The Floating-Only Rule.** Em modo Operar, sombra existe só pra objetos que estão literalmente sobre o conteúdo (menu, FAB, toast) — nunca em um card no fluxo normal da tela. Ver um card comum com sombra numa tela do app é sinal de drift, não de estilo.

## Shapes

Escala de raio única, cinco degraus: 8 / 12 / 16 / 22 / 999 (pílula). Elemento aninhado dentro de outro desconta 2px do raio do pai — por exemplo, a pílula do segmented control usa `sm - 2` dentro de um trilho `sm`, pra a curva interna acompanhar visualmente a externa em vez de competir com ela.

Botão de ação primária dentro do fluxo do app usa raio `md` (12px); o CTA da landing page usa `pill` (999px) — modos diferentes, forma diferente, do mesmo jeito que a elevação muda por modo.

## Components

### Buttons
- **Shape:** `md` (12px) em contexto de app; `pill` (999px) em CTA de persuasão.
- **Primary (Operar):** fundo Sea Foam White, texto Deep Petroleum — a superfície invertida, mesma receita do FAB e do toast.
- **CTA (Persuadir):** fundo Working Teal, texto Deep Petroleum, sombra colorida por trás (`0 10px 32px -8px rgba(31,169,141,0.6)`) — o único botão do sistema que usa glow de cor, porque só ele precisa competir por clique numa página sem confiança pré-estabelecida.
- **Hover (web):** opacidade 0,88 no botão de app; no CTA, a sombra intensifica e o botão sobe 2px (`translateY(-2px)`).

### Cards / Containers
- **Corner Style:** `lg` (16px) padrão; `xl` (22px) em cartões de maior destaque (herói, "Livre para Gastar").
- **Background:** Deep Petroleum (mesma cor do fundo — usado quando o card só precisa de borda pra se separar) ou Raised Tide (quando precisa se elevar de verdade).
- **Shadow Strategy:** ver Elevation & Depth — depende do modo da superfície.
- **Border:** 1px em `rule` (chapado) ou `rule-strong` (quando precisa de mais presença, como o campo de valor).
- **Internal Padding:** `lg` (16px) padrão, `xl` (20px) em cards de destaque.

### Inputs / Fields
- **Style:** sem moldura fechada — a maioria dos campos usa só uma linha inferior (`borderBottomWidth: 1`) em `rule`/`rule-strong`, não uma caixa completa. O campo de texto livre (colar comprovante) é a exceção, com caixa completa em Deep Petroleum e borda `rule`.
- **Focus (web):** anel de foco na cor Instrument Mint, não o azul padrão do navegador — acessibilidade mantida, cor trocada pra identidade do produto.
- **Prefixo monetário:** "R$" em Faint Kelp, tamanho `destaque` (20px), ao lado do valor em si — nunca dentro do mesmo campo de texto que o número.

### Navigation
- **iOS/iPadOS:** Native Tabs do Expo Router, com materiais e sidebar adaptável fornecidos pelo UIKit.
- **Android:** Native Tabs do Expo Router, com Navigation Bar, indicador, ripple e Predictive Back do sistema.
- **Web compacto:** barra inferior de vidro do Grana.; **web médio/amplo:** trilho/barra lateral customizada.
- **Landing:** cabeçalho simples, logotipo + link de entrada; sem barra de navegação persistente.

### Herói-storytelling (assinatura da landing page)
Sequência de 4 "capítulos" em scroll — a tela do capítulo (sem moldura de dispositivo, flutuando com sombra) e o título principal trocam juntos conforme a pessoa rola, cada capítulo mostrando um jeito real de registrar (voz, WhatsApp, nota fiscal, Livre para Gastar). O título muda a cada capítulo, letra por letra (revelação progressiva, não um crossfade de bloco inteiro nem scramble de caractere), decisão deliberada pra maximizar impacto na primeira dobra.

## Do's and Don'ts

### Do:
- **Do** usar Calm Cyan pra saída de dinheiro, nunca vermelho — é a regra de cor mais importante do sistema.
- **Do** manter sombra fora de cards de tela de app; reservar pra menu/FAB/toast.
- **Do** aplicar `fontVariant: ['tabular-nums']` em todo valor monetário, sem exceção.
- **Do** usar Instrument Mint com parcimônia — marca, ação em foco, valor em destaque, nunca decoração de fundo.
- **Do** deixar a landing page (Persuadir) mais pesada visualmente que o app (Operar) — é intencional, não drift.

### Don't:
- **Don't** usar fonte do sistema (ou qualquer fonte que não seja Neue Machina) em lugar nenhum — nem corpo, nem controle, nem campo, nem metadado. E não sintetizar `fontWeight` nos arquivos Light/Regular da marca.
- **Don't** clonar a identidade visual de outro banco/fintech — sem vermelho de alarme, sem badge/confete de gamificação, sem urgência fabricada.
- **Don't** desenhar a interface como planilha utilitária — voz e WhatsApp são a entrada principal; a tela nunca deveria parecer uma ferramenta de contador.
- **Don't** inventar uma nova sombra ad hoc — as cinco receitas catalogadas em Elevation & Depth cobrem todo caso real; uma sexta variação é sinal de que a tela deveria reaproveitar uma das cinco.
- **Don't** emprestar cor de marca de terceiro sem necessidade funcional — a única exceção (verde do WhatsApp) existe porque o botão literalmente abre o WhatsApp, e está documentada como tal no código.
