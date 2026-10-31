# Biblioteca de efeitos: referência DeqHiQlxxRY

**As regras do projeto prevalecem sobre esta referência.** Regra 23 (estilo do vídeo aprovado
`grana-motion-desistiu-foto-da-nota.mp4`), `docs/marketing/ajustes.md` e as outras regras do `AGENTS.md` vêm antes.
Se um efeito daqui conflitar com elas, vale a regra e o efeito fica de fora.

Origem: um Reels de terceiro analisado em 24/10/2026, a pedido do autor. Daqui saem só técnica e estrutura: nada
do texto, da marca, das cores nem do conteúdo do vídeo original. Tudo é reproduzível localmente (GSAP em cena
HyperFrames da Editonny, SVG, canvas ou `ffmpeg`), sem ElevenLabs e sem custo.

Medição: diferença entre quadros consecutivos (`tblend=difference` + `signalstats`) para achar cortes, e contagem de
quadros a 30 fps (1 quadro = 33 ms) para curva e duração. Escala e ângulo foram estimados no quadro, com margem de
uns 5%. O áudio não foi analisado. Os prints e o catálogo completo ficam fora do repositório, em
`E:\Grana-temporarios\2026-10-24-referencias-edicao\` (`referencias-efeitos-DeqHiQlxxRY.md` e `quadros/`, só na M1).

## Os 5 que mais valem, em ordem

1. E02 lista-fantasma progressiva
2. E06 placa de aeroporto (split-flap)
3. E07 traço que se desenha e leque radial
4. E04 pop-in com ultrapassagem
5. E05 queda escalonada com giro

## Não usar

- **E01, cartão chapado sobre o apresentador.** Conflita com o mockup realista (`ajustes.md`: "Não desenhe celular
  falso nem tela chapada") e com a regra de não pôr texto ou gráfico sobre vídeo filmado. A única exceção é a série
  dos 6 ganchos, e mesmo nela o cartão nunca mostra a tela do app.
- **E03 a 1 s por item para explicar uma função.** Rápido demais (`ajustes.md`, linha 31: "Não corra com as
  funcionalidades"). O corte no compasso só serve para vitrine de muitos itens, nunca para explicar função.
- **E12, falhas de gravação:** quadro preto no começo do trecho e um quadro do estado final antes de a animação
  começar. Corte cada trecho a partir do primeiro quadro com conteúdo.

---

## E01. Overlay de objeto segurado (picture-in-picture ancorado na mão)
- **Medidas:** cartão de 380×450 px em 1080×1920 (x ≈ 310, y ≈ 1250), raio ≈ 22 px, borda clara de ≈ 3 px. Posição
  fixa o vídeo inteiro, sem rastreamento, sem sombra, sem perspectiva. A mão real logo abaixo faz o olho ler
  "segurando".
- **Receita:** `overlay=310:1250` com máscara de cantos, ou `<video>` num `div` com `border-radius` na cena.
- **No Grana:** não usar (ver acima).

## E02. Lista-fantasma progressiva (checklist com marcadores pré-impressos)
- **Medidas:** os números da lista inteira aparecem desde o primeiro quadro, a ≈ 40% de opacidade. Cada item acende
  número e rótulo juntos: ≈ 35% → 70% → 100% em 3 quadros (100 ms), linear, sem deslocamento, escala ou desfoque.
  Acende no mesmo quadro do corte da imagem, às vezes 2 a 4 quadros antes. Texto com sombra suave (desfoque ≈ 6 px,
  ≈ 40%).
- **Por que funciona:** os números vazios prometem quanto falta e seguram a retenção até o último item.
- **Receita:** `gsap.set('.item .rotulo',{opacity:0}); gsap.set('.item .num',{opacity:.4});`
  `tl.to(['#i3 .num','#i3 .rotulo'],{opacity:1,duration:.1,ease:'none'}, tFala)`. Em `ffmpeg`:
  `drawtext` com `alpha='clip((t-T)/0.1,0,1)'`.
- **No Grana:** listas do tipo "N coisas que o app faz no fim do mês", em Neue Machina, título em y ≈ 290. O item
  acende na palavra que a narração diz (`ajustes.md`: texto na tela igual à narração).

## E03. Corte seco no compasso (montagem rítmica)
- **Medidas:** troca a cada 1,0 s em média (0,6 a 1,43 s). Nenhuma transição: pico de diferença em um único quadro.
  O ritmo vem do conteúdo novo e da lista que acende no mesmo quadro. Cortes de salto no apresentador ficam
  escondidos sob essas trocas.
- **Receita:** `concat` de trechos com `trim` exato, normalizando `fps` antes (`ajustes.md`, linha 45).
- **No Grana:** só em vitrine de muitos itens. Para explicar função, não usar (ver acima). Esconder corte de salto
  da fala sob uma troca de imagem vale copiar.

## E04. Pop-in com ultrapassagem (scale pop, back-out)
- **Medidas:** escala ≈ 15% → 55% → 95% em 3 quadros, pico ≈ 108% no 4º e 5º, assenta em 100% por volta do 9º
  (≈ 0,3 s). Origem no centro, sem giro, sem desfoque. Um segundo painel sobe de baixo em 4 quadros
  (`power3.out`).
- **Receita:** `gsap.from(el,{scale:.15,duration:.3,ease:'back.out(1.7)'})`.
- **No Grana:** padrão para recorte do app que salta da tela e para selo de valor. Pico até 108%, não mais.

## E05. Queda escalonada com giro e sombra dura (stagger drop)
- **Medidas:** 3 blocos entram de cima com defasagem de ≈ 3 quadros (100 ms). Cada um percorre ≈ 60% da altura da
  área em 4 quadros (≈ 130 ms), chega girado −6° a −8°, passa ≈ 4% da altura para baixo e assenta em ≈ −2° a 0°.
  Sombra sólida deslocada ≈ 6 px, sem desfoque.
- **Receita:** `gsap.from('.bloco',{y:-300,rotation:-8,duration:.35,ease:'back.out(1.4)',stagger:.1})`.
- **No Grana:** cartões de categoria ou de fatura entrando em cascata, em motion fora do celular, com a paleta do
  `DESIGN.md` (a sombra dura não é da marca: troque por sombra da marca).

## E06. Placa de aeroporto (split-flap) travando da esquerda para a direita
- **Medidas:** cada célula sorteia um caractere a cada ≈ 2 quadros (≈ 15 trocas/s), com quadros de meia lâmina
  (metade de cima de um caractere, metade de baixo de outro). As células travam em ordem, da esquerda para a
  direita, ≈ 50 ms uma da outra; a primeira linha trava entre 0,55 s e 0,75 s, a segunda por volta de 0,95 s. Uma
  linha de ruído que nunca trava dá textura.
- **Receita:** canvas ou HTML com timeline por célula: `tTrava = t0 + 0.55 + i*0.05`; até travar, caractere
  aleatório a cada 66 ms; meia lâmina com dois `div` em `clip-path` e `rotateX`. "Tac" local a cada troca.
- **No Grana:** revelar valor em R$ ou o "Livre para gastar", dígito por dígito. Valor sempre real e verificado,
  nunca número de exemplo como alegação.

## E07. Traço que se desenha e leque radial (line draw-on + radial fan-out)
- **Medidas:** etapas encadeadas, sem sobreposição: (1) traço vertical cresce em 4 quadros, `power2.out`; (2)
  engrossa e abre em leque de ≈ 20 raios, de 0° a ≈ 150°, em 4 quadros; (3) arcos concêntricos se desenham em
  ≈ 4 quadros cada, defasados de 2; (4) a palavra entra só por opacidade, em 4 quadros. Total ≈ 0,7 s.
- **Receita:** SVG com `stroke-dasharray`/`stroke-dashoffset` animados; raios com `rotation` a partir do mesmo
  `transformOrigin`.
- **No Grana:** desenhar gráfico de gasto, anel de meta ou o G do logotipo antes do número ou do fecho.

## E08. Planta técnica que se desenha (draw-on com linhas de cota)
- **Medidas:** formas em traço desenhadas por `dashoffset` em ≈ 0,3 s, já girando enquanto se desenham; depois as
  linhas de chamada se estendem e a cota aparece (≈ 0,2 s).
- **Receita:** igual ao E07, com `rotation` contínua `ease:'none'`.
- **No Grana:** anotar uma função com linha de chamada que se estende, sempre fora da tela do app (dentro dela só o
  recorte se move, `ajustes.md`).

## E09. Letreiro corrido e cortina dura (marquee + hard wipe)
- **Medidas:** palavra em caixa alta correndo para a esquerda a velocidade constante (≈ 25% da largura por segundo),
  sobre linhas de fundo com a mesma palavra só no contorno. Uma cortina de cor atravessa da esquerda para a direita
  em 3 quadros (100 ms, linear) e revela a palavra seguinte. Sem desfoque de movimento.
- **Receita:** `x` linear contínuo; cortina = retângulo com `scaleX` 0 → 1, `transformOrigin:'left'`, 0,1 s,
  `ease:'none'`.
- **No Grana:** alternativa ao clarão menta na troca de tela. O clarão é o aprovado: propor ao autor antes de
  trocar.

## E10. Giro de ladrilhos (tile flip)
- **Medidas:** numa grade 4×4, 4 a 6 ladrilhos giram 20° a 45° e saem levemente do lugar ao mesmo tempo, voltam e
  assentam em 5 quadros (≈ 170 ms), já com a forma nova. Uma onda a cada ≈ 0,5 s.
- **Receita:** `gsap.to(sorteados,{rotation:'+=90',scale:.9,yoyo:true,repeat:1,duration:.085,ease:'power2.inOut'})`,
  trocando a forma no meio.
- **No Grana:** baixa prioridade. Como fundo vira enfeite genérico, que `ajustes.md` proíbe; só com ícones de
  categoria do app e com propósito na cena.

## E11. Microinteração de chave (toggle)
- **Medidas:** o botão da chave desliza em ≈ 4 quadros (≈ 130 ms) e a cor de fundo muda no mesmo intervalo; nada
  mais se move.
- **No Grana:** a chave já existe no app; no vídeo vale a gravação real, com o evento caindo na palavra que o
  anuncia (`ajustes.md`). Fica como medida de referência, não como efeito a desenhar.

## E12. Falhas de gravação (não copiar)
- **Medidas:** um quadro preto no início de vários trechos (carregamento da página gravada) e, num deles, um quadro
  do estado final antes de a animação começar.
- **Receita do certo:** antes do `trim`, achar o primeiro quadro com conteúdo (`select` por luminância acima de um
  limiar) e cortar a partir dele. Conferir os quadros em volta de cada corte (seção 4 da skill).
