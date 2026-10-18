# Sistema visual dos estáticos de feed 3:4

Leitura da série de quatro estáticos que o autor montou à mão no Photoshop em 11/10/2026 ("O café, o delivery…", "O mês que vem…", "Organize no computador…" e "Salário caiu?", em `para-aprovacao/` desta semana). O objetivo é gerar peças novas e diferentes entre si que continuem sendo reconhecidas como Grana. à primeira vista.

**Como as medidas foram tiradas.** Pixel a pixel nos PNGs exportados, com ajuste de círculo por mínimos quadrados e RANSAC. A forma do G foi desenhada a partir do `simbolo-menta-sem-ponto.svg` e sobreposta a cada peça. Cada glifo de ícone foi comparado, já desfocado, com os 28 ícones do arsenal. Fontes, tamanhos relativos e entrelinhas saíram dos dados de texto gravados no `Criativos.psb`. A margem de erro é de 1 a 3 px; o que tem confiança menor está marcado. Este guia descreve o estilo e não é aceite do autor.

Vale junto com a regra 23 do `AGENTS.md` (aparelho inteiro com margem, sem contador de página nem aviso de exemplo na arte, logotipo em gradiente, mockup por homografia), com a regra de copy sem travessão e sem "não é X, é Y", e com a tipografia de criativo do `design-system/README.md`.

## 0. O que é fixo e o que varia

A identidade vem das **constantes**. A variedade vem das **variáveis**, sempre dentro das faixas medidas.

| Fixo em toda peça | Varia de peça para peça |
|---|---|
| Formato, moldura, painel e raio do canto | Posição, escala, rotação e tom do G de fundo |
| Logotipo e os três rótulos dos cantos | Arquétipo de composição (seção 9) |
| Família, pesos e escala tipográfica | Número de linhas e alinhamento do texto |
| Paleta | Divisão menta/branco dentro do título |
| Margens do texto | Aparelho: celular, notebook ou os dois; qual tela do app |
| G cobrindo ≈ 42% do painel | Quais ícones, quantos (2 ou 3), onde e com que inclinação |
| Ícones do arsenal, estilo menta, desfocados e cortados na borda | Direção da luz do fundo |
| Sombra de contato sob o aparelho; celular inclinado para fora | |

## 1. Formato

1080 × 1440 px (3:4, feed do Instagram), RGB 8 bits, exportado em PNG. No PSB, as pranchas ficam lado a lado.

## 2. Grade

```
x:0   23   83/85        120 ............................ 960      998 1057 1080
 ┌────────────────────────────────────────────────────────────────────────┐ y 0
 │    ┌──────────────────────────────────────────────────────────────┐    │ y 21
 │    │  Grana. (85,63 → 210,95)                    R Á P I D O (→998)│    │ y 63–95
 │    │                                                              │    │
 │    │        ← texto alinhado à esquerda começa em x 120           │    │
 │    │           texto alinhado à direita termina em x 958 →        │    │
 │    │                                                              │    │
 │    │  F Á C I L (84→)                          P R Á T I C O (→998)│    │ y 1356–1366
 │    └──────────────────────────────────────────────────────────────┘    │ y 1419
 └────────────────────────────────────────────────────────────────────────┘ y 1440
```

- **Moldura:** de 21 a 23 px de cada lado. O painel vai de x 23 a 1057 e de y 21 a 1419 (1034 × 1398 px).
- **Canto do painel:** raio de 29 px, medido em três pontos do arco.
- **Marca e rótulos:** a ≈ 60 px da borda do painel. O logotipo ocupa de 85,63 a 210,95 (125 × 32 px). O rótulo de cima termina em x 998 e tem a mesma altura do logotipo. Os de baixo têm a maiúscula entre y 1356 e 1366.
- **Margem do texto:** x 120 à esquerda (≈ 97 px dentro do painel). À direita, o texto termina em x 958, simétrico. Isso se mediu igual nas quatro peças.

## 3. Fundo: quatro camadas

De trás para a frente:

1. **Moldura:** um degradê petróleo próprio, que se vê só na faixa de 22 px.
2. **Painel:** um retângulo de canto 29 px com outro degradê. A luz vem **sempre de cima**: o fundo escurece de 15 a 42 níveis no canal verde do topo para a base. Na horizontal ela muda de lado (vem da esquerda no "café" e no "mês"; da direita no "organize" e no "salário"), com 20 a 60 níveis de diferença. É isso que tira a cara de cor chapada.
3. **O G do logotipo:** o símbolo sem o ponto (`design-system/marca/simbolo-menta-sem-ponto.svg`), com a regra da seção 4.
4. **Formas de apoio, opcionais:** no "mês que vem", um retângulo vertical de topo todo arredondado (largura ≈ 250 px, de x 40 a 290, subindo da borda de baixo até y ≈ 800) atrás do notebook. Usar no máximo uma.

## 4. O G de fundo

| Peça | Centro | Diâmetro | Diâmetro ÷ largura do painel | Painel coberto | Tom do G contra o fundo |
|---|---|---|---|---|---|
| O café… | (540, 658) | 1138 px | 1,10× | 42% | mais escuro (−7) |
| O mês que vem… | (538, 890) | 1635 px | 1,58× | 43% | mais escuro (−3) |
| Organize… | (22, 631) | 1651 px | 1,60× | 41% | mais escuro (−14) |
| Salário caiu? | (797, 935) | 1578 px | 1,53× | 41% | mais claro (+14) |

Tons medidos no canal verde (0 a 255).

Regras que saem da tabela:

- **O G é maior que o painel:** de 1,1× a 1,6× a largura. Nunca aparece inteiro, e o arco atravessa a peça.
- **A área coberta é constante:** entre 41% e 43% do painel. É a regra mais firme da série. Mude posição e escala à vontade, mas o G tem de cobrir cerca de 42%.
- **O contraste é mínimo:** de 3 a 14 níveis contra o fundo em volta. O G se sente mais do que se vê, e por isso não compete com o texto.
- **Sem gradiente, sem brilho e sem contorno.** O gradiente fica reservado ao logotipo.
- **O arco abraça o conteúdo.** No "café", o círculo envolve o bloco de texto. No "mês", o arco passa por cima do título. No "organize", o centro fica na borda esquerda e o arco corta a peça na vertical. No "salário", o centro fica embaixo à direita, e o arco externo e o miolo (razão 0,62, igual à do SVG) emolduram texto e celular.
- **Rotação:** varia. No "salário", a posição é a natural, com a barra do G à direita; a barra aparece como a forma diagonal clara na borda direita (confiança alta). No "café", o G está espelhado e girado, com a barra caindo atrás do celular (confiança média). No "mês" e no "organize", a barra fica escondida atrás do aparelho e a rotação não se pode afirmar (confiança baixa). Para peças novas, gire livremente, mas deixe a barra do G sair pela borda ou se esconder atrás do aparelho, para ela não virar desenho reconhecível no meio da peça.

## 5. Cores

| Papel | Cor | Observação |
|---|---|---|
| Fundo (moldura, painel, G) | do `#001C24` ao `#005550` | só petróleo, sempre com R = 0 |
| Título e destaques | `#87F9CC` | menta do texto (≈ `#83F9CB` nas linhas finas) |
| Texto branco | `#FFFFFF` | |
| Círculo dos ícones | `#7EFFE3` | o arquivo do arsenal é `#AEFFE3`; na peça ele aparece mais saturado, por ajuste de cor ou modo de mesclagem no PSB |
| Glifo dos ícones | petróleo, ≈ `#217E77` depois do desfoque | |
| Logotipo | gradiente oficial, `#88F7C8` → `#00D0C7` | `design-system/marca/logotipo-gradiente.svg` |

Não entra nenhuma outra cor. O que é colorido além disso vem dos prints do app.

## 6. Tipografia

A família é **Neue Machina**, nos pesos Ultrabold (H1) e Regular (o resto). O Ultrabold é exclusivo de criativo; veja o `design-system/README.md`.

| Nível | Fonte | Tamanho | Maiúscula medida | Entrelinha | Espaçamento | Cor |
|---|---|---|---|---|---|---|
| H1, título | Ultrabold | **72 px** | 52 px, igual nas 4 peças | 100% (72 px) ou 110% (79 px) | 0 | menta, ou menta + branco |
| H2, apoio | Regular | **31 px** (3/7 do H1) | 22 px | ≈ 120% (36–37 px) | 50 | branco, com virada em menta |
| Assinatura | Regular | **24 px** (1/3 do H1) | 17 px | ≈ 115% | 50 | menta |
| Rótulos dos cantos | Regular, em caixa alta | **15 px** | 11 px | uma linha | 1000 (≈ 25 px de letra a letra) | menta `#87F9CC` (as letras finas aparecem ≈ `#7FF8C9`) |

Tamanho, entrelinha e espaçamento saíram dos dados de texto do PSB; a maiúscula foi medida no PNG.

**Espaços verticais**, iguais em toda a série:
- do fim do H1 ao H2: **41 a 47 px** (19 px no "salário", que tem texto alinhado à direita e mais compacto);
- do fim do H2 à assinatura: **80 px**, ou seja, duas linhas vazias;
- entre as linhas do H2: de 9 a 11 px de vão.

**H1:**
- de 2 a 4 linhas, quebradas à mão para que cada linha seja um pedaço de sentido;
- de 1 a 3 palavras por linha;
- a linha mais longa ocupa de 300 a 630 px de largura;
- entrelinha de 100% para título curto ou de 2 linhas; de 110% para título de 4 linhas.

## 7. Cor no texto

- **H1 de 4 linhas:** as 2 primeiras em menta e as 2 últimas em branco ("O mês que / vem já começou // nas parcelas / desse mês"; "Organize no / computador, // acompanhe / pelo celular"). A virada de cor coincide com a virada da frase: a situação em menta, a consequência em branco.
- **H1 curto ou em pergunta:** todo em menta ("O café, o delivery, a corrida…", "Salário caiu?").
- **H2:** branco. Quando o H1 é todo menta, a virada vai para o H2: "Separados parecem pouco, **mas juntos fazem parte do mês!**", com a segunda parte em menta.
- **Assinatura:** sempre menta, sem contorno ("O Grana. te ajuda!", "O Grana. te ajuda com a organização!"). "Conheça o Grana." e "Tudo na sua mesma conta." fazem esse papel em branco, colados ao H1 como H2.

## 8. Aparelho

| Peça | Aparelho | Caixa | Proporção | Inclinação | Folga até o texto |
|---|---|---|---|---|---|
| O café | celular | 578–995 × 485–1288 | 56% da altura | topo 5° para a direita (para fora) | ≈ 65 px |
| O mês | notebook | 54–1024 × 729–1315 | 94% da largura do painel | três quartos | 82 px abaixo do H2 |
| Organize | notebook + celular | 84–990 × 680–1291; celular 820–990 × 831–1240 | 88% da largura | celular com o topo 3° para fora | 57 px abaixo do H2 |
| Salário | celular | 115–605 × 266–1209 | 65% da altura | topo 5° para a esquerda (para fora) | ≈ 50 px |

- **O celular sempre inclina o topo para fora,** em direção à borda e para longe do texto, de 3° a 5°, com uma perspectiva leve.
- **O notebook fica em três quartos,** com a tela girada para a esquerda (como em `design-system/marketing-mockups/notebook-vazio.png`), ocupando de 88% a 94% da largura e ancorado na metade de baixo.
- **Há sombra de contato** sob o aparelho: o fundo escurece de 12 a 14 níveis numa faixa de 60 a 80 px logo abaixo. É ela que tira o aparelho do "recortado e colado".
- **Margem mínima até a borda do painel:** 31 px (notebook do "mês"). É o limite; não fique abaixo disso.
- **O print é real, por homografia, com o canto arredondado** e mostra a tela que prova o título: Lançamentos para "o café", Crédito para "parcelas", Lançamentos em dois aparelhos para "computador e celular", Início com Livre para gastar para "salário".
- **O print tem de ser da versão atual e legível no tamanho final.** Nesta série, o "Salário caiu?" ainda mostra "Contas a vencer este mês", linha que saiu do app em 25/09, e as telas de notebook ficaram pequenas demais para ler.

## 9. Ícones flutuantes

Todos os nove ícones da série são do **pacote de ícones de marketing do design system**, `docs/marketing/arsenal/icones/`, no estilo **`-menta`**. Cada glifo foi confirmado por comparação com o arquivo do arsenal, já desfocado.

| Peça | Ícone (arquivo) | Centro | Diâmetro | Inclinação | Visível na imagem | Correlação |
|---|---|---|---|---|---|---|
| O café | `calendario` | (1022, 301) | 144 | +10° | 95% | 0,94 |
| O café | `mercado` (carrinho) | (416, 1414) | 284 | −15° | 61% | 0,98 |
| O mês | `calendario` | (1057, 474) | 289 | +15° | 60% | 0,98 |
| O mês | `tempo` (relógio) | (37, 955) | 219 | −5° | 71% | 0,89 |
| O mês | `cartao` | (570, 1439) | 153 | −25° | 50% | 0,98 |
| Organize | `celular` | (1002, 409) | 209 | +10° | 93% | 0,97 |
| Organize | `computador` | (84, 890) | 263 | −15° | 88% | 0,98 |
| Salário | `graficos` | (22, 212) | 136 | −15° | 71% | 0,98 |
| Salário | `dinheiro` | (1041, 1157) | 269 | +15° | 68% | 0,99 |

Inclinação positiva é no sentido horário.

Regras que saem da tabela:

- **De 2 a 3 por peça,** em **dois tamanhos**: um pequeno, de 136 a 153 px (≈ 13% da largura), e um ou dois grandes, de 209 a 289 px (20% a 27%).
- **Sempre cortados por uma borda:** cada um fica de 50% a 95% dentro da imagem e passa por cima da moldura. Nenhum fica solto no meio.
- **Posições em oposição diagonal:** um na borda direita, no terço de cima (y de 300 a 475), e outro na borda esquerda ou na de baixo, na metade inferior (y de 890 a 1440). No "salário", que tem o celular à esquerda, a diagonal se inverte: canto superior esquerdo e borda direita embaixo.
- **Inclinação de ±5° a ±25°,** alternando o sentido entre os ícones da mesma peça.
- **Desfoque gaussiano com raio de ≈ 5 a 7 px:** a borda do círculo leva de 12 a 17 px para passar do fundo ao menta (5,5 px no ícone menor). O desfoque transforma os ícones em textura de profundidade.
- **Nunca cobrem texto nem a parte útil do print.**
- **O ícone ilustra o tema:** calendário e carrinho para gasto do dia a dia; calendário, relógio e cartão para parcelas; celular e computador para "nos dois lugares"; gráficos e dinheiro para salário.

## 10. Arquétipos de composição

Os quatro criativos usam três arranjos. Para variar, escolha um arquétipo e troque G, ícones, tela e texto dentro das faixas acima.

**A. Texto à esquerda, celular à direita** ("O café")
- O H1 começa em y ≈ 370, e o bloco de texto ocupa a coluna de x 120 a ≈ 575.
- O celular fica de x 578 a 995 e de y 485 a 1288, com o topo para a direita.
- O G é centrado na horizontal e abraça o texto.
- Os ícones ficam na borda direita em cima e na borda de baixo à esquerda.

**B. Texto em cima, notebook embaixo** ("O mês que vem", "Organize")
- O H1 começa em y de 255 a 285 e o H2 termina em y de 620 a 650.
- O notebook ocupa de 88% a 94% da largura entre y ≈ 680 e 1315. No "organize", o celular entra na frente, à direita.
- O G tem centro na borda de cima ou na da esquerda, com o arco cortando a peça.
- Os ícones ficam na borda direita em cima e na borda esquerda no meio, mais um opcional na borda de baixo.

**C. Celular à esquerda, texto à direita, alinhado à direita** ("Salário caiu?")
- O celular fica de x 115 a 605 e de y 266 a 1209, com o topo para a esquerda.
- O texto fica de x ≈ 655 a 958, a partir de y ≈ 535, todo alinhado à direita.
- O G tem centro embaixo à direita, e arco e miolo emolduram os dois blocos.
- Os ícones ficam no canto superior esquerdo e na borda direita embaixo.

Arranjos ainda não usados que respeitam o sistema: o espelho do A (celular à esquerda, texto alinhado à esquerda na coluna da direita) e o espelho do B (notebook em cima, texto embaixo). Peça do tipo D, com dois celulares, também cabe. Teste antes de considerar parte da série.

## 10b. Arquétipo E: componentes em destaque (pedido do autor, 18/10/2026)

O autor pediu telas de carrossel, cards únicos e capas de Reel que não sejam sempre o mockup de celular em 3D: "funções pontuais". A referência são três criativos de outro app, o Nossa Grana, vistos em anúncio. Eles não são do Grana. e servem só de exemplo de composição; as imagens recortadas ficam só em `E:\Grana-temporarioseferencias-nossa-grana\` (M1) e não vão para o git, por serem arte de terceiros num repositório público (regra 15). O guia descreve os três jeitos abaixo, sem depender dos arquivos.

Três jeitos, todos válidos:

1. **Celular com rótulos pontilhados** (referência 1): o aparelho inteiro de um lado, e do outro cartões escuros com título e uma linha de apoio, ligados por linha pontilhada a um ponto sobre a parte da tela que explica. Serve para dizer "o que cada pedaço faz".
2. **Componentes ampliados e isolados** (referência 2): sem aparelho. Botões e um cartão de lançamento recortados da tela, aumentados, em fileira e empilhados, com sombra suave. Serve para uma função só (por exemplo, a grade de lançar por voz, fotografar a nota, colar comprovante, importar extrato).
3. **Cartões flutuantes inclinados** (referência 3): dois ou três cartões da tela, levemente girados e sobrepostos em degraus, mais uma etiqueta pequena (um aviso, uma notificação) fora do cartão. Serve para metas, cofrinhos, faturas.

**Regras no Grana.:**
- **Os componentes vêm sempre de print real do app**, recortados, com dado inventado (regra 23 e `PRODUCT.md`). Nada desenhado do zero nem gerado por IA.
- **Mantêm o sistema:** moldura e painel, G de fundo, logotipo gradiente, RÁPIDO, FÁCIL, PRÁTICO, tipografia (H1 Ultrabold, H2 Regular), paleta e margens das seções 2 a 7. Não se copia o fundo claro quadriculado nem a tipografia da referência: o Grana. é escuro.
- **Rótulo:** Regular, 24 px, fundo do painel um tom mais escuro, borda fina menta, linha pontilhada menta com 2 px e um ponto de 14 px sobre o elemento. Máximo de três rótulos por tela.
- **Componente ampliado:** de 1,3× a 1,8× do tamanho no app, canto arredondado como no app, sombra de contato suave, nunca cortado pela margem de 31 px. Cartões flutuantes giram de 3° a 8°.
- **Ícones do arsenal e G de fundo continuam**, mas em número menor (1 ou 2 ícones), para não competir com os componentes.
- **Uso:** alterne com o mockup em 3D dentro do mesmo carrossel (no máximo duas telas seguidas no mesmo jeito) e use também em card único e em capa de Reel (versão 1080 × 1920 da seção 13).
- **Fidelidade:** o componente mostrado precisa ser o que a função realmente é no app atual (por exemplo, a grade de lançamento só como existir na build). Peça de função nova só depois de build pública e QA.

## 11. Como gerar uma peça nova

1. **Mensagem:** escreva o gancho em H1 (2 a 4 linhas, uma situação reconhecível ou uma pergunta), a virada em H2 e a assinatura. Sem preço, sem promessa de função que não está em build pública, sem travessão, sem "não é X, é Y", e "Grana." sempre com ponto.
2. **Tela do app que prova a mensagem:** capture na versão atual, com dado inventado e na resolução mais alta possível.
3. **Arquétipo:** escolha A, B, C ou E (seção 10b), e não repita o de uma peça vizinha no mesmo carrossel.
4. **Fundo:** moldura e painel com degradê (luz de cima). Depois o G, com escala de 1,1× a 1,6×, cobertura de ≈ 42%, contraste de 3 a 14 níveis e a barra saindo pela borda ou escondida atrás do aparelho.
5. **Tipografia:** H1 de 72 px com entrelinha de 100% ou 110%, H2 de 31 px, assinatura de 24 px e rótulos de 15 px, nas margens de x 120 ou x 958.
6. **Aparelho:** posição do arquétipo, celular com o topo 3° a 5° para fora, notebook em três quartos, sombra de contato e margem mínima de 31 px.
7. **Ícones:** 2 ou 3 do arsenal `-menta`, um pequeno e um ou dois grandes, ligados ao tema, cortados pela borda em diagonal oposta, inclinados de ±5° a ±25° e desfocados com raio de 5 a 7 px.
8. **Fixos:** logotipo em gradiente e RÁPIDO, FÁCIL, PRÁTICO nos cantos.
9. **Confira** a lista abaixo e exporte para `para-aprovacao`.

## 12. Lista de conferência

- [ ] 1080 × 1440, moldura de 22 px, canto do painel de 29 px.
- [ ] Logotipo em gradiente em 85,63; RÁPIDO, FÁCIL e PRÁTICO nos três cantos.
- [ ] G do símbolo cobrindo ≈ 42% do painel, chapado, com 3 a 14 níveis de contraste e a barra sem chamar atenção.
- [ ] Painel com luz de cima.
- [ ] H1 em Ultrabold 72 px; H2, assinatura e rótulos em Regular (31, 24 e 15 px).
- [ ] Texto em x 120 (ou terminando em x 958); 41 a 47 px do H1 ao H2 e 80 px do H2 à assinatura.
- [ ] Cor do texto virando junto com a frase.
- [ ] Aparelho inteiro, com margem de pelo menos 31 px, sombra de contato, celular inclinado para fora.
- [ ] Print atual, legível e com dado inventado.
- [ ] Ícones do arsenal `-menta`: 2 ou 3, de dois tamanhos, cortados pela borda, inclinados e desfocados.
- [ ] Copy sem travessão, sem "não é X, é Y", com "Grana." com ponto.
- [ ] Sem palavra viúva: a última linha de cada bloco de texto não termina com uma palavra sozinha (regra 29 do `AGENTS.md`); ajuste a quebra à mão.
- [ ] Nome de arquivo sem erro de digitação; peça em `para-aprovacao` e no `INDICE.md`.

## 13. Variante: capa de Reel 1080 × 1920

Feita e aprovada pelo autor em 11/10/2026 (`aprovados/grana-reels-v8-pop-capa-1080x1920.png` e `aprovados/grana-motion-desistiu-foto-da-nota-capa-1080x1920.png`), com o gerador `apoio/ferramentas/gerar-capas-reels.py`.

- **Área segura:** todo o conteúdo (logotipo, rótulos dos cantos, texto, aparelho e ícones) fica nos 1080 × 1440 centrais, de y 240 a y 1680, que é o recorte 3:4 da grade do perfil. As coordenadas deste guia valem ali somando 240 ao y.
- **Painel e moldura vão até a borda de 1920:** de y 21 a y 1899, com canto de 29 px, para a capa inteira não virar um cartão solto no meio. As faixas de cima e de baixo ficam só com o fundo, que é onde a interface do Reels se sobrepõe.
- **G e ícones** seguem as seções 4 e 9. A cobertura de ≈ 42% é medida no painel da área segura. Os ícones ficam nas bordas laterais, para aparecerem cortados tanto na capa inteira quanto no recorte.
- **A tela do aparelho é a do próprio vídeo:** renderizada do HTML do motion (`#screen`), já na proporção da tela do celular vazio (≈ 0,433), para nada ser cortado nas laterais pelo encaixe.
