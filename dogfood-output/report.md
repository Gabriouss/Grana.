# Auditoria Impeccable: landing page Grana.

| Campo | Valor |
|---|---|
| **Data** | 29/08/2026 |
| **URL auditada** | `http://localhost:8081/` |
| **Escopo** | Landing pública completa: mobile, tablet e desktop; acessibilidade, navegação, responsividade, SEO, console, links e performance |
| **Viewports principais** | 320×800, 390×844, 768×1024, 1024×1000 e 1440×1000 |

## Resumo executivo

A auditoria encontrou dois defeitos de alta severidade e cinco de média severidade. Todos foram corrigidos em 29/08/2026 e repetidos nos mesmos breakpoints; a tabela abaixo preserva a classificação original dos achados.

| Severidade | Quantidade |
|---|---:|
| Crítica | 0 |
| Alta | 2 |
| Média | 5 |
| Baixa | 0 |
| **Total** | **7** |

## Status das correções

| Achado | Status | Evidência principal |
|---|---|---|
| ISSUE-001 — foco do menu | Resolvido | Primeiro link recebe foco; `Escape` devolve ao gatilho |
| ISSUE-002 — Preços em 320 px | Resolvido | [Captura corrigida](fixes/precos-320-corrigido.png) |
| ISSUE-003 — FAQ em 320 px | Resolvido | [Captura corrigida](fixes/faq-320-corrigido.png) |
| ISSUE-004 — Segurança em 320 px | Resolvido | [Captura corrigida](fixes/seguranca-320-corrigido.png) |
| ISSUE-005 — navegação desktop | Resolvido | [Cabeçalho em 1440 px](fixes/header-1440-corrigido.png) |
| ISSUE-006 — Hábitos em 768 px | Resolvido | [Captura corrigida](fixes/habitos-768-corrigido.png) |
| ISSUE-007 — cards sem ação | Resolvido | 0 `DIV` genéricas interativas em Produto/Benefícios |

Correções complementares descobertas durante a implementação:

- Os sete links do menu flutuante agora usam a referência real do `ScrollView`; cada destino terminou exatamente abaixo do cabeçalho sticky (`targetTop=49`, `headerBottom=49`).
- O hero usa a variante compacta quando a janela tem menos de 960 px de largura ou 600 px de altura, eliminando sobreposição em 844×390. [Captura em paisagem](fixes/landscape-844-corrigido.png).

## Achados

### ISSUE-002 — Card de preço recorta conteúdo em 320 px

| Campo | Valor |
|---|---|
| **Severidade** | Alta |
| **Categoria** | Responsividade / conversão |
| **URL** | `/#precos` |
| **Raiz no código** | `app/index.tsx:1496`, `app/index.tsx:1522` |

O checklist usa `minWidth: 320` e padding interno dentro de uma coluna cuja largura útil já é menor que 320 px. O card ultrapassa o viewport, mas a largura documental permanece em 320 px; portanto não existe rolagem horizontal para recuperar o texto. O título aparece como “Tudo que você rece” e várias vantagens perdem palavras.

**Correção recomendada:** no compacto, zerar `minWidth`, limitar ambos os lados do card a `width: '100%'`/`maxWidth: '100%'` e usar `minWidth: 0` nos filhos flexíveis. Validar em 320 px com o checklist inteiro visível.

![Card de preço recortado em 320 px](screenshots/issue-002-precos-320.png)

---

### ISSUE-003 — FAQ ultrapassa o viewport em 320 px

| Campo | Valor |
|---|---|
| **Severidade** | Alta |
| **Categoria** | Responsividade / conteúdo |
| **URL** | `/#faq` |
| **Raiz no código** | `app/index.tsx:1631`, `app/index.tsx:1641` |

A grade da FAQ mantém `minWidth: 320` dentro de uma área com margens laterais. O primeiro botão termina em `x=335` num viewport de 320 px; a borda direita, o final de linhas introdutórias e parte das respostas ficam cortados, sem rolagem horizontal disponível.

**Correção recomendada:** aplicar `minWidth: 0` e `width: '100%'` à grade e aos wrappers no compacto; manter padding e borda dentro da largura disponível.

![FAQ recortada em 320 px](screenshots/issue-003-faq-320.png)

---

### ISSUE-001 — Menu flutuante perde o foco ao navegar por teclado

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Acessibilidade / teclado |
| **URL** | `/` |
| **Raiz no código** | `components/NavFlutuanteLanding.tsx:49`, `components/NavFlutuanteLanding.tsx:70` |

Ao abrir o menu em 390×844 e pressionar `Tab`, o foco não entra no primeiro link: `document.activeElement` passa a ser `<body>`, sem papel ou rótulo. O componente trata `Escape`, mas não move o foco para o painel nem o devolve explicitamente ao disparador quando fecha.

**Correção recomendada:** guardar uma referência para o botão e para o primeiro link, focar o primeiro item na abertura, restaurar o foco ao fechar e garantir ordem de teclado previsível.

1. [Menu fechado](screenshots/issue-001-step-1.png)
2. [Menu aberto](screenshots/issue-001-step-2.png)
3. [Foco perdido](screenshots/issue-001-result.png)

> A gravação não foi gerada porque o ambiente não possui `ffmpeg`; a reprodução foi documentada em capturas sequenciais e confirmada duas vezes.

---

### ISSUE-004 — Card de Segurança perde a borda direita em 320 px

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Responsividade / acabamento visual |
| **URL** | `/#seguranca` |
| **Raiz no código** | `app/index.tsx:1578` |

O primeiro card começa em `x=32`, mede 300 px e termina em `x=332`. Os últimos 12 px são cortados, incluindo a borda direita. A causa é `minWidth: 300` dentro de uma coluna cuja largura útil é menor.

**Correção recomendada:** no compacto, usar `minWidth: 0` e `width: '100%'`; deixar a grade definir a largura do card.

![Card de Segurança além do viewport](screenshots/issue-004-seguranca-320.png)

---

### ISSUE-005 — Desktop não oferece navegação persistente pelas seções

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Arquitetura de informação / descoberta |
| **URL** | `/` |
| **Raiz no código** | `app/index.tsx:649`, `app/index.tsx:1158` |

Em 1440×1000, o cabeçalho contém apenas a marca e “Entrar”. Os sete atalhos de seção foram movidos deliberadamente para um botão flutuante no canto inferior direito, o que esconde a arquitetura da landing atrás de uma interação adicional justamente no desktop, onde há espaço disponível.

**Correção recomendada:** manter o menu flutuante no compacto e exibir os principais links no cabeçalho a partir do breakpoint amplo; se todos os sete forem excessivos, priorizar Como funciona, Benefícios, Segurança, Preços e Dúvidas.

![Cabeçalho desktop sem navegação de seções](screenshots/issue-005-nav-desktop-1440.png)

---

### ISSUE-006 — Seção de Hábitos sobrepõe mockup e texto em 768 px

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Responsividade / breakpoint |
| **URL** | `/#habitos` |
| **Raiz no código** | `lib/breakpoints.ts:22`, `lib/breakpoints.ts:94`, `app/index.tsx:818`, `app/index.tsx:1364` |

Exatamente em 768 px, `ehCompacto` vira falso, o layout troca para linha e o mockup salta de 300 para 560 px. A moldura começa em `x=-70`, termina em `x=490` e invade 62 px da coluna textual, que começa em `x=428`.

**Correção recomendada:** preservar o empilhamento até a soma real das colunas caber, ou tornar a largura do mockup fluida com teto de 560 px. O breakpoint deve ser guiado pela largura intrínseca da composição, não apenas pela classe global de dispositivo.

![Hábitos com colunas sobrepostas em 768 px](screenshots/issue-006-habitos-768.png)

---

### ISSUE-007 — Nove cards informativos viram paradas de teclado sem ação

| Campo | Valor |
|---|---|
| **Severidade** | Média |
| **Categoria** | Acessibilidade / semântica de interação |
| **URL** | `/#produto` e `/#beneficios` |
| **Raiz no código** | `app/index.tsx:251`, `app/index.tsx:889`, `components/AppPressable.tsx:92` |

Os três cards de dor e os seis cards de benefícios são renderizados com `AppPressable` apenas para hover. Em runtime, aparecem como `DIV` genéricas com handlers e entram na navegação de teclado, mas não possuem ação, papel ou estado. Pressionar `Enter` não altera URL nem interface.

**Correção recomendada:** renderizar cards puramente informativos como `View` e aplicar hover por CSS/web wrapper não interativo. Se houver uma ação futura, usar link ou botão semântico, com rótulo e foco visível.

![Cards genéricos na árvore interativa](screenshots/issue-007-dead-tab-stops.png)

> A gravação não foi gerada porque o ambiente não possui `ffmpeg`; o estado antes/depois foi verificado pelo elemento ativo e pela ausência de mudança de URL/estado.

## Verificações aprovadas

- **Hero mobile:** ritmo vertical consistente em 390×844; H1 centralizado e sem recorte.
- **Acessibilidade automática:** axe-core WCAG 2.0 A/AA retornou 0 violações. Houve 1 checagem incompleta de contraste em elementos sobre gradientes/imagens, que exige revisão manual e não foi contada como falha.
- **Teclado:** o skip link é o primeiro foco, leva a `#conteudo-principal` e o controle da faixa de confiança alterna corretamente entre pausar e retomar.
- **FAQ:** expansão e `aria-expanded` funcionam; respostas são expostas como regiões rotuladas.
- **Movimento reduzido:** com `prefers-reduced-motion: reduce`, não foram encontradas animações CSS ativas.
- **Links internos:** `/sign-up`, `/sign-in`, `/termos`, `/privacidade` e `/exclusao-de-dados` carregaram corretamente na sessão isolada.
- **SEO:** idioma `pt-BR`, title, description, canonical, Open Graph, Twitter Card, JSON-LD e fallback sem JavaScript estão implementados.
- **TypeScript:** `npx.cmd tsc --noEmit` passou sem erros.
- **Console:** nenhum erro JavaScript. Permanecem avisos de desenvolvimento do React Native Web sobre `shadow*`, `pointerEvents` e `useNativeDriver`; não foram promovidos a defeito funcional.

## Performance local

Medição em servidor de desenvolvimento local; útil para detectar regressões grosseiras, mas não substitui Lighthouse numa build de produção publicada.

| Viewport | TTFB | FCP | LCP | CLS |
|---|---:|---:|---:|---:|
| 390×844 | 7,6 ms | 836 ms | 1,02 s | 0,06 |
| 1440×1000 | 6,6 ms | 764 ms | 1,28 s | 0,04 |

## Ordem recomendada de correção

1. Eliminar os recortes em Preços e FAQ em 320 px.
2. Corrigir o breakpoint/composição de Hábitos em 768 px.
3. Corrigir a gestão de foco do menu e remover os cards informativos da ordem de teclado.
4. Ajustar o card de Segurança em 320 px.
5. Reavaliar a navegação persistente no desktop.

## Limitações

- A auditoria foi executada no ambiente local, não no domínio de produção.
- INP não foi medido por falta de uma amostra longa de interações.
- Vídeos de reprodução não puderam ser produzidos sem `ffmpeg`; todos os problemas visuais possuem captura e os interativos possuem sequência de passos reproduzível.
