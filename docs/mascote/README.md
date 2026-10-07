# Mascote Granabô — prancha de construção

Material gerado em 07/10/2026 numa sessão na nuvem. Todas as imagens são renders
de um modelo 3D feito por código (não por IA generativa), então as vistas são
coerentes entre si por construção.

## Versão escolhida pelo autor

`granabo-prancha-w3.png`: variação **W3** (ponta de cima do G girada 14° para
abrir a faixa dos olhos, olhos grandes ovais, bordas arredondadas, menta
leitoso) com a boca **L3** (sorriso em arco, pontas arredondadas, gravado na
barra do G). Quatro vistas: 0°, 45°, 90° e 180°, câmera ortográfica.

## Histórico das escolhas

| Arquivo | O que mostra |
|---|---|
| `granabo-prancha.png` | Primeira prancha, G exato do logo, olhos pequenos |
| `granabo-variacoes.png` | A (atual), B, C, D: olhos, bordas, cor |
| `granabo-boca.png` | Primeiras bocas (E, F, G) |
| `granabo-faixa.png`, `perfil-faixa.png` | Faixa dos olhos mais alta (W1, W2, W3) |
| `granabo-bocas-w3.png` | Formatos de boca M1 a M4 |
| `granabo-sorrisos-w3.png` | Sorrisos S1 a S4 |
| `granabo-sorrisos-largos.png` | Sorrisos L1 a L4 (L3 escolhido) |

## Como gerar de novo

Precisa de Python 3 com `numpy` e `Pillow`. Roda de qualquer pasta:

    python docs/mascote/gerar_prancha.py       # prancha final (W3 + L3), ~15 s
    python docs/mascote/gerar_comparativo.py   # comparativo das 4 bocas L1-L4
    python docs/mascote/gerar_prancha_v1.py    # primeira prancha

- `granabo_modelo.py`: o modelo (esfera, carcaça a partir de `logo-g.png`,
  olhos, boca) e o render.
- Os parâmetros de cada variação (W3, L3 etc.) ficam em `gerar_comparativo.py`.
- `logo-g.png` é o G oficial que define a carcaça. Trocar o arquivo muda o
  desenho em todas as vistas.

## Limitações conhecidas

- Leve ondulação na parte de baixo da ponta superior do G, na vista frontal
  (limite do render, não do desenho).
- É prancha de referência, não arte final: serve de guia para ilustrador ou
  modelador 3D.
