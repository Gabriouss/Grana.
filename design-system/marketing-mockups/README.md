# Mockups de dispositivo — telas vazias

Gerados via IA (ElevenLabs Creative / Seedream), fotorrealistas, tela
completamente vazia/desligada, iluminação neutra sem gradiente colorido,
2048×1152 (2K). Aprovados pelo autor em 31/08/2026 pra uso na landing page,
substituindo as ilustrações flat atuais do herói.

- `notebook-vazio.png` — notebook, tela virada para a esquerda (ângulo
  escolhido explicitamente pra não espelhar o teclado — evita letras
  invertidas).
- `celular-vazio.png` — celular Android genérico, sem marca, ângulo
  totalmente frontal (sem perspectiva 3/4).

## Como compor uma tela real por cima

**Nunca gerar a tela por IA** — o autor testou e rejeitou (não fica
"exatamente igual" ao app real). O caminho validado é:

1. Tirar uma screenshot real do app (Android, dado fictício — nunca conta
   real, ver regra em `PRODUCT.md`).
2. Medir os 4 cantos da tela do mockup (cantos arredondados: pegar o ponto
   de interseção das bordas retas, não o meio da curva).
3. Calcular a homografia (mapeamento perspectiva) da screenshot pro
   quadrilátero medido — script de referência usado nesta sessão: resolver
   o sistema linear 8×8 padrão (4 pares de pontos, sem lib externa) e
   aplicar via `matrix3d` em CSS ou, pra composição em canvas/imagem
   estática, um warp pixel a pixel com a homografia inversa.
4. Recortar com cantos arredondados (não colar a screenshot com canto reto
   dentro de uma tela arredondada — vaza visualmente).
5. Adicionar um leve reflexo diagonal de vidro (gradiente branco ~10%
   opacidade) e uma vinheta sutil nas bordas, senão a tela não parece de
   verdade.

Pontos de atenção que já causaram retrabalho nesta sessão:
- Meça os 4 cantos com cuidado — um erro pequeno já faz o conteúdo parecer
  torto (bordas superior/inferior com inclinações inconsistentes).
- O celular está de frente, sem perspectiva forte — mesmo assim a
  screenshot real precisa ser mapeada com homografia, não só redimensionada.

## Ainda não integrado

Estes arquivos **não estão referenciados em nenhum componente** —
`app/index.tsx` continua usando as ilustrações atuais (`notebook.webp`
etc). Integração pendente: construir um componente novo (nos moldes de
`components/NotebookAnimado.tsx`) que componha a screenshot real por cima
via CSS `matrix3d`, e trocar no herói/seções da landing.
