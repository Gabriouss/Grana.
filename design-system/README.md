# Grana Design System

Versão 0.2.0 · derivado do `grana-app` (Expo / React Native)

Este repositório documenta a linguagem visual do Grana: identidade de marca,
cores, tipografia, espaço, forma, movimento e componentes.

As páginas de componentes são **reconstruções em HTML** dos componentes React
Native, feitas para mostrar variantes e estados lado a lado. A fonte de verdade
continua sendo o código do app — elas documentam, não substituem.

A página **Auditoria** lista 11 inconsistências encontradas ao catalogar, por
severidade. Quase todas são duplicação, não decisão ruim — algo resolvido bem
num lugar e reescrito pior em outro. Uma delas (a assinatura "Grana." escrita
solta em cada tela) foi resolvida em 16/08/2026 com o `BrandLogo`; as demais
seguem abertas.

## Regra de origem

Esta pasta vive dentro de `grana-app/`, mas é inerte em tempo de execução: nada
aqui é importado por nenhum módulo, então o Metro não empacota nada disto. É
documentação hospedada junto do código que ela descreve.

**A regra mudou em 16/08/2026.** Na versão 0.1.0 este projeto era estritamente
somente-leitura: o app era lido como fonte e nunca alterado. A partir da
sincronização daquela data o fluxo passa a ser de mão dupla — o app pode ser
alterado *para* seguir o design system, e quando isso acontece os tokens daqui
são atualizados junto, no mesmo passo. O que continua valendo é que as duas
pontas nunca fiquem divergentes em silêncio: mudar um lado obriga a mudar o
outro.

O que a sincronização de 16/08/2026 alterou no app:

- `theme.paperRaised` passou de `#0c333c` para `#0b2d35`, e os tokens deste
  projeto acompanharam. O contraste de `inkFaint` sobre ele subiu de 5,2:1 para
  5,6:1.
- Entraram tokens de marca em `lib/theme.ts` (`brand.gradient`, `brand.dot`),
  que antes só existiam aqui na documentação.
- Os PNGs de `assets/` passaram a ser gerados a partir dos vetores de `marca/`,
  em vez de exportados à mão.
- Nasceu `components/BrandLogo.tsx`, que centraliza a assinatura "Grana." e fixa
  o ponto em `#a9f8c8`.

Por isso cada token carrega uma marcação de origem:

| Marcação | Significado |
| --- | --- |
| **extraído** | Já existe no app hoje. Mudar aqui implica mudar o app. |
| **proposto** | Preenche uma lacuna. Ainda **não** existe no app. |
| **estimado** | Lido visualmente da arte da identidade. Precisa de confirmação. |

Essa distinção é o que impede o documento de virar ficção: quem consultar
sabe na hora se está lendo o app ou uma proposta sobre ele.

## Estrutura

Tudo vive em `grana-app/design-system/`.

```
tokens/tokens.json          Fonte canônica, com origem e uso de cada token
tokens/tokens.css           Espelho em CSS custom properties, para web
marca/*.svg                 Vetores originais da marca
previews/*.html             Fontes das previews, com o marcador <!--@FONTS@-->
pagina/design-system.src.html   Fonte da página única de referência
build.js                    Gerador das páginas
gerar-icones.js             Gerador dos PNGs de ../assets/ a partir de marca/
```

`gerar-icones.js` é a única parte deste projeto que escreve no app. Ele
rasteriza os vetores de `marca/` com o Chrome headless e sobrescreve os seis
PNGs de `assets/`. Rode depois de qualquer mudança nos vetores:

```bash
node gerar-icones.js
```

O arquivo carrega, comentada, a conta da zona segura do ícone adaptativo — que
não é o quadrado de 66% do lado, e sim o círculo de 66 dp. Vale ler antes de
mexer nos tamanhos.

Gerados, e por isso fora do controle de versão:

```
dist/*.html                 Previews auto-contidas
pagina/design-system.html   Página única, pronta para publicar
fonts/neue-machina.css      @font-face em base64
```

Para reconstruir depois de editar qualquer fonte:

```bash
node build.js
```

O gerador lê as duas Neue Machina de `assets/fonts` do app — somente leitura —,
embute em base64 e injeta no lugar do marcador `<!--@FONTS@-->`. Ele aceita as
duas posições possíveis da pasta (dentro do app ou como irmã dele), então mover
o projeto não quebra o build.

Cada preview precisa ser auto-contida porque o painel Design System renderiza um
card por arquivo, isoladamente: um CSS compartilhado por link relativo não
sobreviveria a esse isolamento. O build falha se alguma preview passar de 256 KB
ou perder o marcador.

## O que a leitura do app revelou

O app já é mais sistemático do que aparenta: `lib/theme.ts` tem doze cores
nomeadas semanticamente, uma escala de espaçamento e uma de raio — e uma nota
de contraste registrada no código. Quatro lacunas apareceram:

1. **Não existe escala tipográfica.** Doze tamanhos (9; 10,5; 11; 11,5; 12;
   12,5; 13; 14; 17; 20; 26; 30) decididos caso a caso. A escala proposta
   consolida em nove degraus nomeados, arredondando para o inteiro mais
   próximo do que já se usa.
2. **Faltam tokens semânticos de estado.** `#e08a7d` (erro) está fixo em
   `app/(app)/index.tsx`. Os fundos dos botões Entrada/Saída reaproveitam
   cores do catálogo de categorias, o que amarra a interface a ele.
3. **O switch está duplicado.** `index.tsx` traz `switchTrack`/`switchThumb`
   inline repetindo o que `components/ToggleSwitch.tsx` já resolve — e a
   versão do componente anima, a inline não.
4. **O movimento é coerente mas não nomeado.** Springs com speed 14–40 e
   bounciness 6–8, durações de 140–250 ms, todos consistentes entre si.

Duas decisões de design que valem registro por serem deliberadas e
contra-intuitivas: **saída de dinheiro é ciano, não vermelho** (gastar não é
erro), e **as divisórias não são cinza** — são o verde-menta `accent2` com
alfa, o que mantém a temperatura da interface até nas bordas.

## A marca

Os vetores originais estão em `marca/` e todos os valores da identidade foram
extraídos deles — não há estimativa envolvida.

**O símbolo é "G." — anel mais ponto.** O anel sozinho é peça incompleta. Os
arquivos `simbolo-*-sem-ponto.svg` trazem só o anel e estão marcados como tal;
são as únicas versões menta e ciano existentes, e ainda faltam exportar com
ponto.

**O símbolo é também a letra G do logotipo.** O logotipo completo é símbolo +
"rana" + ponto; o G nunca é tipografia. Por isso os arquivos `texto-*.svg`
contêm apenas "rana" e, sozinhos, não significam nada. A família tipográfica
original do logotipo deixou de importar: o desenho está preservado em
contornos no vetor.

**O gradiente atravessa a peça inteira**, como um objeto único — nunca elemento
a elemento. Em SVG isso significa `gradientUnits="userSpaceOnUse"` com as
coordenadas do arquivo original, e **nunca** `objectBoundingBox`, que reinicia
a rampa no bounding box de cada elemento. No Illustrator, o equivalente é unir
as letras em caminho composto (`Ctrl+8`) — ou aplicar o preenchimento no nível
do grupo, pelo painel Aparência — antes de aplicar o gradiente.

| Peça | Coordenadas | Ângulo |
| --- | --- | --- |
| Símbolo | 67,51 · 67,51 → 392,26 · 392,26 | 45° descendente |
| Logotipo | 333,91 · −198,88 → 1375,52 · 842,73 | 45° descendente |
| G do ícone | 237,73 · 237,73 → 562,48 · 562,48 | 45° descendente |
| Fundo do ícone | 0 · 400 → 800 · 400 | Horizontal |

Na versão em gradiente do **símbolo**, o ponto é menta chapado e não entra na
rampa — é o que o mantém legível contra a ponta escura do anel. Já no
**logotipo** em gradiente, o ponto é absorvido pela rampa junto com o resto.

**O ponto não tem cor fixa** — é sempre o contraste do texto:

| Texto | Ponto |
| --- | --- |
| Escuro `#08384b` | Menta `#a9f8c8` |
| Branco `#ffffff` | Menta `#a9f8c8` |
| Menta `#a9f8c8` | Escuro `#08384b` |
| Gradiente | Gradiente — sem destaque próprio |

Gradiente oficial: `#b0f7c9 → #22a1c1`, a 45° descendente à direita sobre o
símbolo e o logotipo, e horizontal quando é fundo de ícone. É exclusivo da
marca — a interface é inteiramente de cores chapadas, e essa distinção vale
ser mantida.

## Divergências entre a identidade e o app

| Elemento | Marca | App hoje | Distância |
| --- | --- | --- | --- |
| Fundo escuro | `#08384b` | `#052229` (`theme.paper`) | Grande — **decidida** |
| Menta | `#a9f8c8` | `#aeffe3` (`theme.accent2`) | Pequena — em aberto |
| Ciano | `#24a5c5` | `#00a6ca` (`theme.down`) | Pequena — em aberto |
| Nome no cabeçalho | Logotipo desenhado | `NeueMachina-Light` | Famílias distintas |

O fundo escuro foi resolvido em 16/08/2026 na direção do app: os PNGs de ícone
passaram a ser gerados com `#052229`, o mesmo de `theme.paper` e do
`adaptiveIcon.backgroundColor`. O escuro da marca (`#08384b`) segue nos vetores,
onde é o fundo das peças de identidade — são contextos diferentes, e agora isso
é uma escolha e não um descuido.

As duas cores de acento continuam quase batendo, e unificá-las segue barato.
Não foram tocadas porque `theme.down` é a cor de toda saída de dinheiro na
interface: mexer nela é uma mudança de leitura do app inteiro, não um ajuste de
token.

A última linha continua aberta, mas menos: `components/BrandLogo.tsx` passou a
concentrar a assinatura, e o ponto agora é sempre `brand.dot`. **Ainda é texto
em Neue Machina, não o logotipo desenhado** — o G ali é uma letra, não o
símbolo. Ou o cabeçalho passa a usar `marca/logotipo-*.svg` como imagem, ou se
assume que ali é título de interface e não a assinatura da marca.

## Pendências

- **Dois escuros nos vetores.** Os SVGs de ícone usam `#09384a` e os de
  logotipo `#08384b`. Os PNGs gerados já saem em `#052229`, então a divergência
  não chega mais no app — mas dentro de `marca/` os dois valores continuam
  circulando e vale eleger um.
- **Faltam as versões menta e ciano do símbolo com ponto.** Os arquivos
  `simbolo-*-sem-ponto.svg` trazem só o anel e são as únicas nessas duas cores.
  `simbolo-gradiente.svg`, `simbolo-branco.svg` e `simbolo-escuro.svg` já estão
  completos e são os que alimentam os PNGs de `assets/`.
- **Decisão sobre menta e ciano** — as duas divergências pequenas que sobraram
  na tabela acima.
- **Auditoria**: 10 das 11 inconsistências seguem abertas.
