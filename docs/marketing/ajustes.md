# Ajustes: o que NÃO fazer nos criativos do Grana.

Memória dos pedidos de ajuste do autor. Os pedidos saíram da lista do painel em 19/10/2026 e viraram regra permanente. Quem produz ou revisa criativo lê este arquivo antes de começar, junto com o `GUIA-DE-PRODUCAO-DE-CRIATIVOS.md` e as regras 23 a 26 do `AGENTS.md`.

Quando o autor fizer um pedido de ajuste novo, a lição entra aqui na hora.

## Celular, notebook e telas

- **Não desenhe celular falso nem tela "chapada".** O celular é sempre o mockup fotográfico realista com a tela real aplicada por cima, em vídeo e em estático. Aconteceu no Reel do Pix v6 e no motion "Desistiu", narrado: "Celular não está realista na tela".
- **Não use print mal encaixado na tela do aparelho.** Cantos, perspectiva e proporção têm de bater. Aconteceu na capa v2 do "Desistiu": "print na tela do celular tá muito estranho, mal feito".
- **Não deixe o celular maior que o notebook** na mesma cena. Aconteceu no carrossel "Olhar só o saldo", página 4.
- **Não use print de tela antiga.** A tela inicial mudou e agora tem o Granabô 3D. Toda peça nova usa captura atual do app. Aconteceu no Reel do Pix de 19/10.

## Texto e tipografia

- **Não misture fontes dentro do mesmo H1.** Uma frase é um título só, num padrão só. Aconteceu nos feeds E05 e E06.
- **Não cole o texto no topo da página.** Desça o bloco e dê respiro. Aconteceu no carrossel "Olhar só o saldo".
- **Não use texto na tela diferente da narração.** O que está escrito e o que é falado dizem a mesma coisa, ao mesmo tempo. Aconteceu no R13, no "Desistiu" narrado e no Reel do Pix de 19/10.
- **Não cite cofrinhos quando não ajudam a mensagem.** Copy enxuta. Aconteceu no card lumen-v6.
- **Não use "O Grana. te ajuda!" como chamada no carrossel.** O padrão é "Arrasta pro lado!".
- **Não escreva aviso de "dados de exemplo"** em arte, vídeo ou legenda (autor, 19/10/2026).

## Narração e vídeo

- **Não repita "Grana." várias vezes na narração.** Uma vez por vídeo.
- **Não use voz com sotaque carioca.** A voz é escolhida e aprovada pelo autor; na ElevenLabs, só com aprovação de custo antes (regra 24).
- **Não entregue vídeo parado.** Ritmo dinâmico, imagem de apoio onde a fala pede (R13: "Vídeo pouco dinâmico. Falta imagem de apoio").
- **Não emende vídeo novo em cima do anterior quando o autor pede para refazer.** "Refazer completamente" é nova narração, novos prints e nova montagem. Aconteceu no Reel do Pix de 19/10.
- **Não entregue vídeo sem música e sem narração.** Reels com tela do app leva narração (aprovada pelo autor, regra 24) e trilha baixa, que abaixa sozinha quando a voz fala. Aconteceu no Reels do Granabô de 19/10: "Tá sem música e sem narração".
- **Não deixe espaço morto entre as falas.** Cada frase da narração entra logo depois da anterior; a tela preenche o intervalo, sem pausa longa. Aconteceu no Granabô v3: "muito espaço entre as falas". Pausa curta (até 1,2 s) antes de uma tela nova, com a tela em movimento, não é espaço morto: é o tempo para o público entender a função (ver o item seguinte).
- **Não corra com as funcionalidades, mas também não arraste.** A v1 do fim do mês (33 s) passou rápido demais; a v2 (46 s, fala esticada 8% e pausas de até 1,2 s entre as funções) ficou "lenta demais" e "muito robótica" (autor, 21/10/2026). O ponto certo foi a v3: uns 40 s, ritmo vindo da própria fala, pausa de no máximo 0,3 s entre uma função e outra, e a tela trocando junto com a frase da função seguinte ("a troca precisa ser fluida e natural").
- **Não estique nem acelere a voz depois de gerada** (rubberband, atempo). O timbre fica metálico. Para mudar o ritmo, gere de novo com pontuação, reticências e marcações de pausa.
- **Não gere narração robótica.** Use o `eleven_v4` (mesma voz aprovada), com marcações de interpretação poucas e no lugar certo, por exemplo `[warmly]` no início, `[sighs]` na dor e `[pause]` entre as funções; depois limite os silêncios a 0,3 s. Aconteceu na v2: "Preciso que essa fala tenha entonação mais natural e humana, tá muito robótica".
- **Não feche com chamada solta de entonação artificial.** "Começa pelo próximo gasto." soou forçado (autor, 21/10/2026). A frase final retoma o gancho e fecha a ideia ("Assim… o fim do mês deixa de ser surpresa.").
- **Não emende frase nova numa narração antiga usando `<break>`.** A ElevenLabs corta o fim da palavra antes da pausa forçada: na v2, o "mês" antes de "Assim" saiu cortado (autor: "A palavra Mês saiu cortada na narração"). Se a fala muda, gere a narração inteira de novo.
- **Não mostre digitação em tempo real.** Acelere a digitação (6× a 7× funcionou) e corte a espera do "pensando" para 0,3 s, com corte seco até a resposta. Aconteceu no Granabô v3.
- **Não dê zoom dentro da tela do celular.** O zoom é sempre no aparelho inteiro, de leve (cerca de 7%), quando a informação importante aparece. Aconteceu no Granabô v2: "Muito ruim esse zoom dentro da moldura do celular".
- **Não deixe o celular pequeno no Reels.** Quando o que importa é a tela (por exemplo, o Granachat), o celular fica grande, baixo, e pode ser cortado na borda de baixo do quadro. Esta é a exceção à regra do aparelho inteiro e vale **só no Reels** (autor, 19/10/2026: "o celular cortado só vale nos reels"). Capa, post, carrossel, Stories e qualquer estático continuam com o aparelho inteiro e margem segura. Aconteceu no Granabô v1 e v4: "quase não é possível visualizar o que está acontecendo na tela", "pode cortar a parte inferior do celular".
- **Não cole o título no celular nem no topo do quadro.** O título fica perto de y 290 em 1080×1920, com uns 90 px de folga até o celular. Aconteceu no Granabô v4: "A legenda tá ficando muito grudada no celular".
- **Não mostre o cronômetro vermelho do gravador.** Suba a gravação dentro da tela do mockup até a barra de status sumir sob a moldura (cerca de 70 px na tela do mockup). Na capa, corte a barra antes de aplicar o print. Aconteceu no Granabô v5.
- **Não confie no início de palavra da transcrição depois de uma pausa.** A transcrição estica a palavra por cima da pausa que vem antes dela, e o título entra antes da fala. Confira cada início contra os silêncios medidos na narração (pausa de 0,15 s ou mais; abaixo disso é o fechamento de t, p, k dentro da palavra). Aconteceu no fim do mês v3: "e" e "Um" entravam 0,5 s antes de serem ditos (autor, 21/10/2026: "estou com a impressão que este vídeo está com o áudio dessincronizado"). Receita em `apoio/reels-fim-do-mes/montar-v4.py` (`inicio_real`).
- **Não deixe a frase anterior na tela quando a próxima começa.** A saída termina antes da primeira palavra da frase seguinte; com pouco intervalo, o sumiço encurta (mínimo 0,15 s). Aconteceu no fim do mês v3: "com" por cima de "Cada fatura aparece separada,", e "por dia" por cima de "E o app ainda mostra quanto dá pra gastar".
- **Não deixe o evento da tela atrás da fala que o descreve.** Meça na gravação o quadro de cada evento ("Ouvindo…", "Transcrevendo…", texto colado, formulário preenchido) e prenda o trecho à palavra que o anuncia; o plim cai quando o formulário assenta. Aconteceu no fim do mês v3: "Transcrevendo…" aparecia depois de "por você", e o plim tocava com a janela de colar ainda aberta.
- **Não corte trecho de gravação de tela sem normalizar o quadro antes.** A gravação do celular tem taxa de quadros variável; trecho de tela parada termina no último quadro gravado e encurta. Use `fps=60` antes do `trim`. Aconteceu na primeira montagem da v4 do fim do mês: a tela do Pix saiu 0,23 s curta.

## Visual e acabamento

- **Não use enfeite genérico no fundo.** Aconteceu nos feeds E02 e E05: "Esses enfeites estão horrorosos", "tá podre, remover". O fundo segue o guia de design estático (regra 26).
- **Não repita a capa de outro Reel.** Cada capa é diferente da anterior.
- **Não use logotipo grande disputando com a tela.** Na capa do Pix v6 o pedido foi logotipo menor, no topo, e o celular maior.
- **Não produza fora do manual.** Peça nova segue as instruções oficiais de produção de materiais (`GUIA-DE-PRODUCAO-DE-CRIATIVOS.md` e o guia de design estático).
- **Não use o Granabô do modelo "chapado" (sprites do gerador) em capa ou estático.** Use o render do app, com brilho no visor: `assets/granabo/granabo-*.png` ou os quadros do Blender do vídeo. Aconteceu na capa do Granabô de 19/10: "O do vídeo tá muito melhor, mais brilhoso".

## Legenda

- **Não repita a copy da arte na legenda.** A legenda contextualiza o que a arte diz (18/10/2026).
- **Não mande peça para aprovação sem legenda pronta.**

## Receita que funcionou: Reels com telas reais do app (Granabô, 19/10/2026)

Aprovada pelo autor ao fim de seis versões. Vale para os próximos vídeos de demonstração de tela.

1. **Gravação:** o autor grava no próprio celular, com o app de verdade. Teclado, aviso do sistema e dado da conta de teste podem aparecer ("vamos usar os vídeos como estão"); só a barra de status sai, escondida sob a moldura.
2. **Edição na Editonny** (skill instalada em 18/10), com uma cena HyperFrames própria: título palavra por palavra no instante em que a narração diz cada palavra (tempos tirados da transcrição local), mascote, celular e logo no fim. Modelo pronto: `2026-10/semana-43-2026-10-19-a-2026-10-25/apoio/reels-granabo-v3/` (`preparar.py`, `granabo.html`, `project.json`).
3. **Narração da ElevenLabs** gerada inteira numa só chamada e cortada nos silêncios medidos, para cada frase cair na cena dela.
4. **Ritmo:** cerca de 17 s no total. Gancho em duas telas com ícones derivando, mascote entrando, celular subindo, troca de tela com clarão menta e tranco de escala, celular descendo e logo.
5. **Celular grande e baixo**, cortado na borda de baixo (só no Reels; a capa mantém o aparelho inteiro), com zoom leve no aparelho inteiro quando a resposta aparece. Título em y ≈ 290, solto do celular.
6. **Som:** voz em −14 LUFS no total, trilha pop local por baixo com compressão lateral (abaixa quando a voz fala), "plim" quando o lançamento é confirmado. O silêncio curto no fim, do fade da música, é intencional.
7. **Capa:** gerador do guia de design estático (arquétipo A), com print do próprio vídeo e o Granabô do app. Fica ao lado do vídeo com o nome `<vídeo>-capa.png`.
