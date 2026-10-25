# Guia de estilo: Reels em tema claro

Medido em 25/10/2026 com a skill `sharingan`, a partir de **uma única peça**: o criativo estático "Organize no computador, acompanhe pelo celular", montado à mão pelo autor. Com uma referência só, todas as faixas abaixo são **provisórias**: valem como ponto de partida até existirem pelo menos três peças claras feitas ou aprovadas pelo autor.

As medidas saíram da peça em 1080×1440 (prancha e JSON em `E:\Grana-temporarios\reels-fatura-v3\sharingan\`, fora do repositório) e foram convertidas para o quadro de Reels 1080×1920. Margem de erro: ±2 px nas posições, ±1 nível de cor por canal. Este guia descreve o estilo e **não é aceite do autor**. O pedido foi aplicá-lo em metade da série; o V1 (Quanto pode gastar hoje) e o V3 (Metas e cofrinhos) usam este tema, e o V4 e o V5 ficam no escuro.

## 0. Fixo e variável

| Fixo em todo Reels claro | Varia de vídeo para vídeo |
|---|---|
| Moldura em gradiente aqua de 22 px | Posição e tamanho do disco claro |
| Painel menta com grade de 62 px | Quais três ícones flutuam, onde e com que giro |
| Logotipo petróleo no canto superior esquerdo | Alinhamento da legenda (esquerda no V1, centro no V3) |
| RÁPIDO, FÁCIL e PRÁTICO nos três cantos restantes | Entrada da palavra (sobe da máscara no V1, vira no eixo Y no V3) |
| Legenda em Neue Machina Ultrabold petróleo | Assinatura de movimento do vídeo |
| Destaque em pílula de gradiente menta para aqua | Entrada do botão "Saiba mais" |
| Aparelho e cards da tela no tema escuro do app | |

## 1. Formato

1080×1920, 60 q/s, mesmo pipeline do Fatura e parcelas v3 (`apoio/reels-fatura-reedicao-v3/README.md`).

## 2. Grade

```
+--------------------------------------------+  moldura 22 px (gradiente)
| Grana.(84,78; 178 px)          R Á P I D O |
|                                            |
|  legenda: x 70, y 130 a 610, 940 px        |
|                                            |
|            [ aparelho, topo >= 600 ]       |
|                                            |
| F Á C I L                    P R Á T I C O |  y 1800
+--------------------------------------------+
```

Rótulos dos cantos: 22 px, espaçamento 0,95 em, cor `#004C50`. Nada importante entra a menos de 24 px da moldura.

## 3. Fundo

- Moldura: gradiente 135° de `#6DE6C7` para `#00AAC3` (a peça mede `#6DE6C7` a `#00AAC3` nas bordas).
- Painel: gradiente aqua `#3FDFC7` a `#007B79`, cantos de 29 px.
- Disco claro `#D3FCEA` com grade `#E0FFF1` de 4 px a cada 62 px (medida de alta confiança: período 61 a 63 px). Escurece para `#007B79` na base.
- Gota aqua pequena cortada pela borda esquerda.
- No vídeo, o disco e os ícones derivam devagar o tempo todo, para nenhum quadro ficar parado.

## 4. Cores

| Papel | Cor | Observação |
|---|---|---|
| Texto da legenda | `#013036` | petróleo escuro, Ultrabold |
| Pílula de destaque | `#87F7C7` a `#00ADC5` | texto petróleo por cima |
| Rótulos fixos | `#004C50` | |
| Logotipo | `#013036` | arquivo `logotipo-petroleo` derivado do oficial; aprovado pelo autor |
| Ícones | disco petróleo com glifo menta | desfoque de 7 px, cortados pela borda |

Nenhuma outra cor entra no fundo. O aparelho e os cards continuam com as cores do app.

## 5. Tipografia

| Nível | Fonte | Tamanho no Reels | Observação |
|---|---|---|---|
| Legenda | Neue Machina Ultrabold | 76 a 124 px | entrelinha 1,22; no máximo duas linhas por grupo |
| Frase final | Neue Machina Regular | 38 px | `#013036` |

Ultrabold só em criativo de marketing (memória de 11/10), e o arquivo da fonte não vai para o repositório.

## 6. Elementos decorativos

Três ícones do arsenal (versão petróleo) por vídeo, entre 140 e 270 px, inclinados de −15° a 18°, com desfoque de 7 px. Nunca em cima do rótulo de canto: no V1 o relógio foi movido para fora de PRÁTICO.

## 7. Conferência

- [ ] Legenda dentro de x 40 a 1040 em todo quadro parado
- [ ] Topo do aparelho abaixo da legenda (pelo menos 600 px quando ela tem duas linhas)
- [ ] Nada sob os rótulos de canto
- [ ] Frase final legível sobre o disco claro
- [ ] Nenhuma palavra viúva na última linha da legenda

## Decisões do autor (25/10/2026)

1. Logotipo petróleo chapado nos Reels claros: aprovado ("é isso aí mesmo"). Exceção registrada em `docs/marketing/ajustes.md`.
2. Neue Machina Ultrabold nas legendas em vídeo: aprovada ("fica").
3. O gradiente aqua ocupa menos área do fundo e o disco claro com grade ocupa a maior parte (disco de 2350 a 2400 px de diâmetro, azul só nas margens). Aplicado ao V1 e ao V3 no mesmo dia.
