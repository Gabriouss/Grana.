# Dinzo (dinzo.com.br) — teardown pixel a pixel

Extração técnica direta do DOM/CSS computado (`getComputedStyle`, `getBoundingClientRect`,
`document.styleSheets`), não estimativa visual. Coletado em 1440×900 (desktop) em
03/09/2026 via `agent-browser eval`. Todo valor abaixo veio de medição real da página
publicada — quando um número não pôde ser confirmado ao vivo (ex.: duração exata do
indicador de "digitando" do chat), isso está dito explicitamente em vez de estimado.

Este documento é o levantamento bruto. As recomendações para o Grana. — o que vale a
pena adaptar e por quê — estão na última seção.

## 1. Tipografia

Fonte única em toda a página: **Plus Jakarta Sans** (Google Fonts). Sem segunda família
pra corpo/título — só variação de peso e tamanho.

| Papel | Tamanho | Peso | Entrelinha | Letter-spacing | Cor |
|---|---|---|---|---|---|
| H1 (hero) | 46px | 800 | 49.68px (1.08×) | −1,15px (−2,5%) | `#18181B` |
| H2 (título de seção) | 38px | 800 | 42.56px (1.12×) | −0,76px (−2%) | `#18181B` (ou branco em seção escura) |
| H3 (título de card, "Conecte seus bancos") | 17px | 800 | 24.65px (1.45×) | −0,17px | `#18181B` |
| H3 (título de card menor, "Categorização automática") | 16,5px | 800 | 23.93px (1.45×) | −0,165px | `#18181B` |
| H3 (FAQ/preço, "Somente leitura", "Premium") | 15–18px | 800 | 1.45× | normal | `#18181B` |
| Corpo (subheadline do hero) | 17px | 400 | 27.2px (1.6×) | normal | `#52525B` |
| Corpo (texto de card) | 13–16px | 400 | 1.5–1.6× | normal | `#52525B` (ou branco a 72–85% opacidade em fundo escuro) |
| Legenda (trust bar, "Funciona com os bancos...") | 13,5px | 600 | 1.45× | normal | `#52525B` |
| Botão primário | 13–14,5px | 700 | 1.45× | normal | branco |
| Botão secundário/chip | 11–12,5px | 600–800 | 1.45× | normal | `#52525B` |
| Rótulo eyebrow ("PRODUTO", "PLANOS") | 11px | 700 | 1.45× | **+0,88px** (positivo, único caso) | `#A1A1AA` |
| Logotipo | 21px | 800 | 1.45× | −0,42px | `#18181B` |

**Padrão de escala**: todo peso de texto que carrega hierarquia (H1–H3, botões, logotipo)
usa **800** (extra-bold) — não existe um 600/700 "quase-bold" fazendo esse papel, é 800 ou
400. Entrelinha gira em torno de **1,45×** o tamanho da fonte como piso geral (só o H1/H2
descem pra ~1,08–1,12×, compressão típica de título grande). Letter-spacing negativo em
todo título grande (H1 e H2), proporcional ao tamanho — regra aproximada de −2 a −2,5% do
font-size — e o único letter-spacing **positivo** da página é o rótulo eyebrow em
maiúsculas (+0,88px em 11px, ~+8%), o oposto do título: abre o rastreamento pra texto
pequeno e caixa alta, fecha pra texto grande.

## 2. Cor

`document.body`/`main` tem fundo `#FAFAFA` (não branco puro). A escala neutra inteira
bate exatamente com a paleta **zinc** do Tailwind CSS (não é aproximação — os valores
batem no hex):

| Token | Hex | Papel |
|---|---|---|
| zinc-50 | `#FAFAFA` | fundo da página |
| zinc-100 | `#F4F4F5` | fundo de card neutro/chip |
| zinc-200 | `#E4E4E7` | borda de card, borda do header |
| zinc-300 | `#D4D4D8` | borda de input/divisor mais forte |
| zinc-400 | `#A1A1AA` | texto terciário (eyebrow, legenda apagada) |
| zinc-600 | `#52525B` | texto secundário (corpo, subheadline) |
| zinc-900 | `#18181B` | texto primário — não é preto puro |

Cores de destaque (essas não são Tailwind estoque, parecem tokens de marca próprios):

| Token | Hex | Papel |
|---|---|---|
| Azul primário | `#0669C6` | CTA primário, links, ícone de destaque |
| Azul primário (hover) | `#0E4279` | `Começar grátis` no `:hover` — escurece, não clareia |
| Azul claro (fundo) | `#EEF6FF` | fundo do card de feature em destaque neutro |
| Azul médio | `#46A3F9` | acento secundário (barra de progresso, gráfico) |
| Verde | `#2FB14D` | positivo (entrada de dinheiro, progresso de meta) |
| Verde claro (fundo) | `#E8F8ED` | fundo de card com dado positivo |
| Âmbar | `#F5B945` | gamificação (XP, badge, streak) |
| Âmbar claro (fundo) | `#FDF3DC` | fundo de badge/toast de gamificação |
| Vermelho claro (fundo) | `#FDECEE` | fundo de card com dado de alerta/saída |
| Seção escura | `#0B1220` | fundo da seção "Painel Web" (única dobra escura da página clara) |

**Leitura**: a paleta funcional (azul/verde/âmbar/vermelho) segue um padrão consistente
de "cor sólida pro dado, tom claro da mesma cor pro fundo do card que carrega esse dado"
— nunca cor sólida de fundo com texto colorido por cima brigando por atenção. É a mesma
lógica que o Grana. já usa em `entradaBorda/entradaFundo/saidaBorda/saidaFundo`
(`lib/theme.ts`), só que a Dinzo aplica em mais contextos (badge de streak, chip de
assinatura detectada, mini-gráfico), não só entrada/saída.

## 3. Espaçamento, grid e componentes

**Container de conteúdo**: `max-width: 1120px`, `padding: 0 24px`. Constante em toda a
página — nenhuma seção foge desse contêiner (nem a seção escura "Painel Web", que muda
só o fundo, não a largura do conteúdo).

**Ritmo vertical entre seções**: quase todas as `<section>` usam **`padding: 88px 0`**
— topo e base idênticos, um número só, repetido de ponta a ponta da página. As únicas
exceções: o hero (`64px 0 80px`, levemente assimétrico pra compensar a barra de
confiança finíssima logo abaixo) e os blocos finais que dividem esse padding com o
vizinho (`0 0 88px` / `88px 0 40px`) pra não duplicar o respiro entre duas seções coladas.
**Isso é o oposto do que o Grana. faz hoje** — `context.md` já registra que cada tela do
app tinha um padding próprio antes de convergir pra `screenRhythm`; a landing do Grana.
usa `Dobra` com `minHeight` de viewport inteira por seção (ver seção 7), não um número
de padding fixo repetido.

**Grid de recursos ("Tudo que a planilha nunca fez por você")**: `display: grid`,
6 colunas de **165,33px** cada, `gap: 16px` (total 1072px = a largura do container menos
os 24px de padding de cada lado). Os 8 cards se distribuem assim:
- Card 1 ("Categorização automática"): ocupa **4 colunas** (709px), fundo `#EEF6FF`.
- Card 2 ("Assinaturas detectadas", destaque azul sólido, texto branco): ocupa **2
  colunas** (347px) — é o único card com `radius: 20px` e cor de fundo sólida entre os
  oito, quebrando o padrão visual de propósito pra puxar o olho primeiro.
- Cards 3–8: 6 cards de **1 coluna cada** (347px), 3 por linha, 2 linhas.

Ou seja: não é uma grade uniforme de 8 caixas iguais — é **1 card duplo-largo + 1 card de
destaque colorido + 6 cards padrão**, hierarquia de tamanho E cor no mesmo grid. O Grana.
usa 6 cards idênticos em carrossel horizontal (`BeneficiosHorizontais.tsx`) — nenhuma
variação de tamanho, cor ou peso entre eles.

**Cards (regra geral)**: `border-radius: 20px` nos cards de feature grandes, `14px` no
resto da página (é o valor mais repetido do CSS inteiro, 76 ocorrências — o "radius
padrão" de facto), `padding: 24px`, sombra padrão
`0 2px 8px rgba(9,9,11,.06), 0 1px 2px rgba(9,9,11,.04)` (usada 31 vezes — é o único
token de sombra de card da página; sombras maiores/coloridas só em mockups elevados,
modais e no card de preço "Mais popular").

**Botões**:
| Contexto | Altura | Padding horizontal | Gap ícone-texto |
|---|---|---|---|
| CTA da barra de navegação | 36px | 14px | 8px |
| CTA primário do hero/seções | 48px | 22px | 8px |

**Raio de pílula** (`border-radius: 999px`) em todo botão e chip — segunda forma mais
repetida do CSS (53 ocorrências), atrás só do `14px`.

## 4. Motion — cada animação, com duração e easing reais

A curva `cubic-bezier(0.16, 1, 0.3, 1)` e a duração `600ms`/`0.6s` — **exatamente os
mesmos valores que `RevealOnScroll` do Grana. já usa** (`context.md` confere: "fade +
`translateY: 16→0`, `cubic-bezier(0.16,1,0.3,1)`, 600ms") — aparecem quase idênticas
aqui: os cards do grid de recursos entram com
`opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)`,
partindo de `translateY(18px)` (Grana. usa 16px). É a mesma família de curva "decelera
suave, sem overshoot" — o Grana. não errou a curva-base, a diferença está em variedade
de uso, não na curva em si (ver seção 7).

### Entrada do hero (choreografia com stagger)

Sequência medida ao vivo, elemento por elemento:

| Elemento | Animação | Duração | Easing | Delay |
|---|---|---|---|---|
| H1 | `rise` (opacity 0→1, translateY 14px→0) | 0,55s | `cubic-bezier(0.23,1,0.32,1)` | 0s |
| Subheadline (`.sub`) | `rise` | 0,55s | mesma curva | **0,06s** |
| Linha de CTAs (`.hero-ctas`) | `rise` | 0,55s | mesma curva | **0,12s** |
| Mockup do produto (`.stage-outer`) | `rise` | 0,6s | mesma curva | 0,1s |

Stagger de **60ms** entre H1 → subheadline → CTAs (cada elemento espera o anterior quase
terminar de subir antes de começar) — não é um número arbitrário, é 0,55s de duração com
~11% de sobreposição por elemento. O mockup começa quase junto com a subheadline (0,1s)
mas dura mais (0,6s vs 0,55s) — elemento visualmente mais pesado recebe um tico mais de
tempo pra assentar, gesto sutil mas medido.

`cubic-bezier(0.23,1,0.32,1)` (a curva do `rise`) é **diferente** da curva de scroll-reveal
`(0.16,1,0.3,1)` — mais "estalada" no início, decelera mais rápido. A página usa duas
curvas de entrada distintas por contexto: uma pro primeiro impacto (hero, mais enérgica),
outra pro resto da rolagem (mais suave).

### Elementos flutuantes — a técnica central de motion da página

Dois grupos de elementos usam a mesma receita de "boiar suavemente", mas **cada
instância recebe duração e delay ligeiramente diferentes**, de propósito, pra nenhum par
se mover em sincronia (efeito orgânico, não "grade de elementos piscando junto"):

**Chips flutuantes sobre o mockup do painel web** (`ffloat`, `translate: 0 -6px → 0 7px`,
`ease-in-out`, `alternate`, infinito):
| Chip | Duração | Delay |
|---|---|---|
| "FATURA PREVISTA" | 5,4s | 0s |
| "EXPORTAR CSV/XLSX/PDF" | 4,6s | 0,5s |
| "PROJEÇÃO DE SALDO" | 6s | 0,9s |

**Ícones decorativos** (`gfloat`, `translateY -4px → 5px`, mesmo timing): 8 elementos
`<img>` (inclusive o mascote de óculos ao lado do QR code final), cada um com duração
entre **4,4s e 5,8s** e delay entre **0s e 1,1s** — nenhum dos 8 repete o mesmo par
duração/delay. Isso é o oposto de declarar uma animação CSS genérica reutilizada: é
**a mesma keyframe, parametrizada individualmente por elemento**, o suficiente pra
quebrar qualquer padrão perceptível de repetição.

### Outras animações nomeadas (confirmadas no CSS, algumas não capturadas ao vivo)

| Nome | O que faz (pela definição do keyframe) | Onde (confirmado ou inferido pelo nome/contexto) |
|---|---|---|
| `txin` | opacity 0→1 + translateY(−14px)→0 + scale(0,96)→1 | Linha de transação nova aparecendo na lista do hero (**confirmado**, 0,45s `cubic-bezier(0.16,1,0.3,1)`) e mensagem do bot no chat (**confirmado**, 0,3s `ease` — mais rápido, chat pede resposta ágil) |
| `drawline` | `stroke-dashoffset` de um `<path>` SVG até 0 (linha se desenhando) | O trajeto pontilhado que conecta os 3 passos da seção "Do caos ao automático" (**confirmado**, 0,7s `cubic-bezier(0.23,1,0.32,1)`, delay 0,6s — começa a desenhar só depois que os textos já assentaram) |
| `marq` | `translate(-50%)` linear infinito | Faixa de logos de bancos rolando (**confirmado**, **169s** por ciclo completo — deliberadamente lento a ponto de ser quase estático, não chama atenção pra si) |
| `dz-wa-dot`, `dz-wa-wait-ring` | Ponto de "digitando" pulsando (opacity+translateY 3 fases) / anel de espera expandindo (`scale 1→1.35`, opacity 0.55→0) | Indicador de "digitando" do chat interativo — nome com prefixo `dz-wa` (Dinzo + WhatsApp) confirma que é peça própria da simulação de chat, não biblioteca. **Duração exata não capturada ao vivo** (o efeito passa rápido demais pro polling conseguir pegar no meio do clique) |
| `gfall`, `confall` | opacity 1→0 + translateY + rotate (objeto caindo e girando) | Nome (`g`=provavelmente "gift"/gamificação, `conf`=confete) sugere celebração ao completar missão/conquista na "Jornada com o Dino" — **não confirmado ao vivo**, a interação que dispara não foi testada nesta coleta |
| `gshake` | `translate`+`rotate` em zigue-zague (tremida) | Padrão de "atenção/erro" — provável em alerta de limite estourado, não testado ao vivo |
| `hop` | `translateY(-14px) rotate(-3deg)` e volta | Pulo do mascote — provável idle/hover do Dino, não testado ao vivo |
| `progress-bar` | `width: 0%→100%` | Barra de progresso genérica (limite de categoria, parcela) |
| `stconf` | opacity 0→0,85 + `translate` de −30px | "Sticker confirm" — selo/emblema aparecendo (jornada de gamificação), não testado ao vivo |

### Micro-interações (hover/transição de estado)

- **Botão primário "Começar grátis"**: `transition: background 0.15s, border-color 0.15s,
  transform 0.16s cubic-bezier(0.23,1,0.32,1)`. No hover medido, só o `background-color`
  muda (`#0669C6` → `#0E4279`, escurece) — **sem** `scale`/`translateY`/sombra nova,
  mesmo a propriedade `transform` estando na lista de transição (está declarada pra
  quando for usada em outro botão, não é usada aqui). Feedback de hover é só cor, direto
  e sem ruído.
- **Header** (`<nav class="nav">`): `position: sticky; top: 0; z-index: 50`, fundo
  `rgba(250,250,250,0.82)` — **82% de opacidade**, o mesmo valor exato que
  `styles.cabecalhoSticky` do Grana. já usa (`rgba(5,34,41,0.82)`) — convergência
  independente pro mesmo número. Diferença real: a Dinzo **não usa `backdrop-filter`**
  (nem blur nem saturate) — só a cor translúcida plana + `border-bottom: 1px solid
  #E4E4E7`. Mais barato de renderizar, sem o efeito de vidro fosco que o Grana. tem.

## 5. Estrutura e estratégia de copy pra conversão

14 seções, nesta ordem exata, cada uma com um papel de funil específico:

1. **Hero** — mecanismo em vez de benefício genérico. "Seu dinheiro se organiza
   sozinho." não fala de "controle financeiro" (categoria) nem de "tranquilidade"
   (emoção) — descreve o **resultado do mecanismo** na voz ativa de terceira pessoa
   (o dinheiro faz sozinho). Subheadline imediatamente concretiza com um exemplo literal
   de comando ("mercado 184") — de headline abstrata pra exemplo tangível em uma frase.
   CTA duplo: ação (`Começar grátis`) + demonstração (`Ver o Dino em ação`) — não força
   escolha entre "quero" e "quero entender primeiro".
2. **Logos de banco** — prova de compatibilidade antes de qualquer objeção aparecer.
3. **3 passos** — a mesma jornada do hero, agora com prova de simplicidade operacional
   ("em poucos minutos"). Mascote caminhando pela trilha pontilhada é literalização
   visual da palavra "passo".
4. **Chat interativo** ("Fale com seu dinheiro") — **deixa o visitante testar o produto
   antes de criar conta**. É a peça de maior risco/retorno da página: qualquer visitante
   cético em "isso funciona mesmo?" resolve a dúvida sozinho, sem esperar demo em vídeo
   nem confiar em texto de marketing.
5. **Grid de recursos** — "Tudo que a planilha nunca fez por você": ataca o concorrente
   real (a planilha, não outro app) na própria headline da seção.
6. **Painel web** — expande o produto pra além do WhatsApp, mostra profundidade (export,
   jornada de gamificação) sem re-explicar o mecanismo central.
7. **3 telas do app** — prova de produto real existente (não é só mockup de landing).
8. **Segurança** — objeção de confiança, com selo regulatório (Open Finance/Banco
   Central) como autoridade externa, não autoafirmação.
9. **Preços** — âncora de desconto (preço trimestral riscado no card anual), toggle
   Anual/Trimestral, "Mais popular" no plano do meio, microcopy de confiança embaixo de
   cada botão ("Preço completo visível antes de confirmar").
10. **"Por que o Dinzo é pago?"** — objeção de preço respondida de frente, atacando o
    modelo "grátis" da concorrência (não elogiando o próprio preço).
11. **Depoimentos** — 3 casos, cada um amarrado a **um recurso específico**, não elogio
    genérico. Nome + cidade real (não "Cliente satisfeito").
12. **FAQ** — 6 perguntas, a segunda ("Por que o Dinzo, e não a minha planilha?") é
    reafirmação direta do inimigo nomeado na seção 5.
13. **"Próxima conquista"** — reformula a promessa numa pergunta aspiracional antes do
    CTA final, não repete a mesma frase do hero.
14. **CTA final + footer** — headline nova ("Amanhã seu extrato já se preenche
    sozinho"), microcopy final reduz risco ("Comece grátis com 1 banco conectado. Cancele
    quando quiser.") logo abaixo do botão, não em letra miúda separada.

**Padrões de copy que se repetem a propósito:**
- **Negação em série** como forma de prometer simplicidade: "sem planilha, sem trabalho
  manual, sem julgamento" / "sem fidelidade, sem dez telas de 'tem certeza?'" — a mesma
  construção "sem X, sem Y, sem Z" aparece em pelo menos 4 seções diferentes, sempre 3
  itens.
- **Números concretos em vez de adjetivo**: "mais de 100 categorias", "26 tipos de
  ativos", "R$620 em Restaurantes — 89% do limite de R$700", nunca "muitas categorias"
  ou "vários tipos de investimento".
- **"Sem julgamento" / "não pra julgar"** aparece três vezes (seção de recursos, footer,
  CTA final) — é o único traço de tom emocional que se repete verbatim; todo o resto da
  copy é funcional/direto.

## 6. O que NÃO dá pra copiar (contexto de produto diferente)

- Todo o motion de "flutuar" e o hero claro dependem de uma paleta clara — aplicar a
  mesma receita de cor (fundo `#FAFAFA`, cards brancos) no Grana. contradiz a identidade
  escura já aprovada pelo autor (petróleo/menta). A técnica de motion (desincronizar
  duração/delay por elemento) é portável; a paleta não é.
- O grid de recursos assimétrico (4 col + 2 col + 6× 1 col) resolve hierarquia **porque
  a Dinzo tem 8 recursos pra mostrar**. O Grana. tem 6 no card atual — adaptar o
  princípio (1 card de destaque maior/colorido entre os demais) não exige copiar a
  proporção exata 4:2:1:1:1:1:1:1.
- O plano grátis + dois tiers pagos é decisão de produto/preço, não de landing — fora do
  escopo deste teardown.

## 7. Recomendações concretas pro Grana.

Ligando cada achado acima a um arquivo real do repositório:

1. **Dar hierarquia de tamanho/cor ao grid de benefícios**
   (`components/BeneficiosHorizontais.tsx`, `MiniMockBeneficio.tsx`). Hoje são 6 cards
   idênticos em carrossel. Testar 1 card em destaque (fundo `theme.accent`/`accent2`
   sólido, um pouco maior) entre os demais — é a técnica de maior retorno visual
   observada aqui, e o achado P1 do `.impeccable/critique/2026-09-03T23-45-30Z` já
   pedia mais hierarquia de peso na página por outro caminho (motion); isso ataca o
   mesmo problema pela composição.
2. **Prova interativa em vez de mock estático**: o chat clicável da seção 4 é o maior
   gap de "exposição de produto" entre as duas páginas. O Grana. tem os ingredientes
   (`ConversaGranabo.tsx` já existe) — avaliar se vale virar de fato clicável (2–4
   chips de comando pré-definidos, resposta simulada) em vez de mock estático.
3. **Desincronizar as animações repetidas**: onde o Grana. já usa motion contínuo
   (`GlowOrb`, ícones flutuantes, se houver), aplicar duração/delay únicos por instância
   como a Dinzo faz em `ffloat`/`gfloat`, em vez do mesmo timing pra todas as cópias do
   mesmo componente.
4. **Seção "por que é pago"**: o Grana. cobra desde o dia 1 e não tem nada respondendo
   essa objeção — já registrado no documento de concorrência
   (`2026-09-03-analise-concorrencia-meta-ads.md`), reforçado aqui pelo exemplo real de
   como a Dinzo estrutura essa seção (3 princípios curtos, sem se alongar).
5. **Microcopy de confiança embaixo do CTA de preço**: `precoCta` em `app/index.tsx`
   tem só o botão. Uma linha curta abaixo ("sem período de teste, cancele quando
   quiser" — já é verdade pro modelo do Grana.) reduz a mesma fricção que a Dinzo
   resolve com "Preço completo visível antes de confirmar".
6. **Ritmo vertical**: vale medir se as `Dobra` de tela cheia do Grana. (que já têm um
   P2 registrado sobre zonas mortas entre seções) se beneficiam de um valor de padding
   fixo por seção como o `88px` universal da Dinzo, em vez de `minHeight` de viewport
   — mas isso é uma mudança estrutural grande (contradiz a decisão de dobras de tela
   cheia já tomada) e deveria ser decisão separada, não consequência automática deste
   teardown.

Nenhuma mudança de código foi feita nesta rodada — é levantamento e recomendação, para
o autor decidir por onde entrar.
