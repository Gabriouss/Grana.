# Guia de estilo de vídeo do Grana. (extraído do vídeo aprovado)

> **Regra 23 do `AGENTS.md`:** o vídeo `grana-motion-desistiu-foto-da-nota.mp4` (raiz de `Gabriel/Grana` do vault, aprovado em 25/09/2026) é a referência de estilo de edição e motion de TODOS os vídeos do Grana. Este arquivo é o guia medido pelo Flare em 04/10/2026, trazido ao repositório pelo Quill para a M2 recebê-lo pelo git. Os quadros de referência (`q-*.png`, `folha-*.png`) ficam só na M1, em `E:\Grana-temporarios\2026-10-04-marketing\flare\referencia-aprovada\`, fora do git. Caminhos `E:\` abaixo são locais da M1. Texto original do Flare, sem alteração de conteúdo; os dois pontos em aberto para o autor estão no fim.


Fonte: `G:\Meu Drive\Obsidian\Gabriel\Grana\grana-motion-desistiu-foto-da-nota.mp4` (arquivo do vault NÃO tocado; trabalhei numa cópia em `flare\referencia-aprovada\ref.mp4`). Medido em 04/10/2026 com `ffprobe` e `ffmpeg`, quadro a quadro (600 quadros), mais Python (PIL/numpy) sobre os quadros decodificados. Quadros de referência na mesma pasta (`q-*.png` em resolução integral, `folha-*.png`, `trans-*.png`, `flash.png`).

Legenda: **[M]** medido nos quadros ou no áudio; **[C]** calibrado (ajuste de curva contra a fonte Neue Machina real); **[I]** impressão minha, não medida com instrumento. Vocabulário de motion segue as skills `animation-vocabulary`, `web-motion-design` e `review-animations` (staggered word reveal, fade and rise, slide-up with overshoot, push-in, cross-dissolve, fade through background). As skills `improve-animations` e `animate` não foram necessárias: o guia descreve, não propõe mudança.

## 1. Formato [M]
- 1080x1920, 30 fps constante, H.264 yuv420p, 20,000 s, 600 quadros, 1,99 Mb/s de vídeo; AAC 48 kHz estéreo, 209 kb/s; arquivo de 5,5 MB.
- Áudio contínuo do início ao fim (só os últimos 0,11 s abaixo de -50 dB). Loudness integrado -20,9 LUFS, pico verdadeiro -5,3 dBFS, LRA 2,4 LU.

## 2. Plano a plano [M, salvo marcas]
| Tempo | O que acontece | Tipo de entrada ou saída |
| --- | --- | --- |
| 0,00 a 0,20 s | Só o fundo (gradiente com brilho embaixo). | nenhum |
| 0,20 a 1,90 s | Bloco de texto de 5 linhas, 12 palavras, entra palavra por palavra. | staggered word reveal: fade + subida de 19 px |
| 1,90 a 3,57 s | Bloco parado e legível (1,67 s). | retenção |
| 3,57 a 3,97 s | Texto sai: fade linear 0,40 s e sobe 44 px. Ao mesmo tempo o aparelho começa a subir. | fade and rise out |
| 3,93 a 4,43 s | Aparelho sobe de baixo do quadro, inclinado (cerca de 7° [I]), passa do ponto final em cerca de 60 px (topo em y=336 contra 400 final). | slide-up com overshoot, ease-out |
| 4,43 a 4,80 s | Aparelho assenta no ponto final (topo y≈392 a 400). | settle |
| 4,33 a 4,80 s | Título 1 "Pagou? É só falar." entra palavra por palavra (início em 4,33; 4,40; 4,50; 4,57 s; cada palavra 0,23 a 0,27 s do 10% ao 90%). | staggered word reveal, passo de 0,07 a 0,10 s |
| 4,60 a 5,70 s | Empurrão lento: largura do aparelho 732 → 828 px (+13%), topo parado. | push-in, ease-out |
| 5,70 a 9,00 s | Cena do widget de voz (Início do celular, "Ouvindo...", frase transcrita, banner de notificação perto de 8,5 s). | conteúdo da tela muda sem o aparelho mexer |
| 9,00 a 9,27 s | Tela do aparelho dissolve do widget para a câmera. Brilho central cai de 205 para 146 e volta a 175 [M]. | cross-dissolve de cerca de 0,25 s dentro da moldura |
| 9,33 a 9,70 s | Título 2 "Ou fotografa a nota." entra palavra por palavra (9,33; 9,40; 9,47; 9,53 s; 0,17 a 0,20 s cada). | staggered word reveal |
| 9,30 a 10,30 s | Câmera com a nota fixa. | retenção |
| 10,30 a 10,45 s | Flash do obturador: quadro de maior diferença do vídeo inteiro (62,7 contra 8,3 no resto), branco na tela e decaimento em cerca de 4 quadros. | shutter flash |
| 10,50 a 12,60 s | "Lendo a nota...", folha "Nota fotografada" sobe e confirma ("Salvo ✓"), folha desce em cerca de 12,6 s. Tempos finos dessa folha são [I] (vistos a 8 quadros por segundo). | sheet in / out |
| 12,60 a 13,40 s | Tela troca da câmera para a tela de bloqueio 21:30. Aparelho recua: topo 336 → 392 e largura 820 → 780. Título 2 sai: fade de 0,33 s (13,07 a 13,40). | scale-down + fade out |
| 13,40 a 13,67 s | Vazio de 0,27 s sem título. | pausa |
| 13,67 a 14,07 s | Título 3 "Esqueceu? O Grana. te lembra." (2 linhas) entra: fade de 0,40 s. A notificação aparece na tela de bloqueio entre 13,5 e 14,2 s. | fade in |
| 14,20 a 16,90 s | Tela de bloqueio parada 2,7 s (movimento medido abaixo de 0,03). | retenção longa |
| 16,90 a 17,30 s | Aparelho e título saem juntos: brilho 141 → 46. | fade out 0,40 s |
| 17,33 a 17,80 s | Logo "Grana." e tagline entram (brilho 88 → 224). Primeiro sai tudo, depois entra o fecho: fade sequencial, não cross-fade simultâneo. | fade in 0,47 s, ease-out |
| 17,90 a 20,00 s | Fecho parado 2,1 s. | retenção |

**Só há um corte seco de verdade (o flash, 10,30 s).** O resto é fade, dissolve ou movimento contínuo. A pontuação de cena do `ffmpeg` fica abaixo de 0,06 em tudo, exceto 0,53 no flash.

## 3. Texto [M, C]

> **Atualização do autor (08/10/2026):** a palavra de destaque em menta (`#ADFBE3`) passa a usar o peso **Regular** da Neue Machina; o resto do texto continua em Light. O vídeo de referência usa Light em tudo, e esta regra prevalece sobre a medição abaixo para vídeos novos.

- **Fonte:** Neue Machina **Light** (peso 300) em tudo, também nos destaques. Sem negrito. [C: largura das palavras na fonte real bate com a medida dentro de 3 px]
- **Bloco inicial:** corpo ≈ **82,5 px**, tracking **+0,05 em (≈ 4 px)**, entrelinha ≈ **103 px**, alinhado à esquerda em **x = 84**, caixa de 800 px, 5 linhas ocupando y = 720 a 1200 (centro ≈ 960).
- **Título de cena:** corpo ≈ **59 px (58,6 a 60)**, tracking ≈ +0,05 a 0,066 em, **centralizado** em x = 540, tinta em y = 130 a 206.
- **Cores:** texto base `#EFFFFE` (medido 239,255,254); palavra de destaque `#ADFBE3` (medido 173,251,227), uma por título (última palavra) e duas no bloco inicial. Mesma família dos tokens `sea foam` e `instrument mint` do DESIGN.md.
- **Entrada do bloco inicial:** primeira palavra com 10% de opacidade em 0,20 s; uma palavra nova a cada **4 quadros (133 ms)**; cada uma leva **8 quadros (267 ms)** do 10% ao 90%; sobe **19 px** (de 775 a 756) em ease-out.
- **Entrada dos títulos:** passo de 0,07 a 0,10 s, cada palavra 0,17 a 0,27 s. A subida dos títulos NÃO foi medida [I: parecida, menor].
- **Saída:** fade linear em 0,40 s (253 → 15 de brilho em 0,40 s), sobe 44 px no bloco inicial; título sai em 0,33 s; título novo só entra 0,27 s depois do anterior terminar.

## 4. Aparelho e tela [M]
- Moldura preta (corpo `#070B0D`), borda fina um pouco mais clara, cerca de **22 px** de moldura na largura de 775 px, raio externo em torno de 100 px [I], câmera frontal em furo central, sombra grande e difusa ao redor (brilho no entorno cerca de lum 23 contra 10 de fundo).
- Tamanho no ponto final: **775 a 828 px de largura** (72 a 77% do quadro), topo em **y ≈ 392 a 404**, margens laterais de **124 a 155 px**.
- **ATENÇÃO, ponto que contraria a regra de 04/10:** no vídeo aprovado o aparelho **vaza pela borda de baixo do quadro** (ele ocupa de y≈400 até além de 1920). A decisão do autor de 04/10 ("celular e notebook nunca cortados na borda, com margem segura") vale para o R13 e prevalece; o guia registra o fato, não o copia.
- Conteúdo da tela: Android real do emulador (widget, câmera, folha, tela de bloqueio), com brilho de vidro suave na diagonal [I].

## 5. Fundo, grão e sombra [M]
- **Sem grão:** desvio-padrão do fundo plano ≈ 0 (9e-7); no brilho 0,98 (só gradiente).
- Base `#021319` (2,19,25) no topo, `#021721` no meio, **brilho radial embaixo** centrado em x = 540, pico `#0B4A5A` (11,75,90) em y ≈ 1700 a 1850, cantos inferiores `#06323A`. O brilho **não pulsa**: constante de 0 a 3 s e menor (≈70%) na cena final.

## 6. Fecho [M]
- Logo "Grana." (gradiente oficial `#B0F7C9 → #22A1C1`) com **600 px de largura** (x 240 a 839), altura 153 (y 792 a 945), centrado.
- Tagline em duas linhas, corpo ≈ 42 a 44 px, entrelinha 66 px (y 1011 a 1059 e 1077 a 1125), centrada em x = 540. Bloco logo + tagline centrado na vertical em ≈ 958 (centro do quadro 960).
- Entra depois de o aparelho sair por completo; retenção de 2,1 s.

## 7. Legenda e áudio [M, I]
- O vídeo aprovado NÃO tem legenda queimada além dos títulos; a tagline do fecho é o único texto de rodapé.
- **Áudio:** faixa contínua, de banda larga (centroide espectral 2 a 10 kHz na maior parte do tempo), RMS típico -20 dB, picos até -3 dBFS, batida com acento a cada 2 s (picos de RMS em 2,0; 4,0; 6,0; 8,0; 10,0; 12,0 s) e pulsos a cada 0,5 s. **[I]** soa como cama musical percussiva (~120 BPM) com efeitos de interface; não medi voz. Fade-out de 19,0 a 20,0 s (RMS -29,6 → -44,4 dB).

## 8. Como o R13 foi refeito nesse estilo (v2)
Arquivos em `E:\Grana-temporarios\2026-10-04-marketing\flare\`: `reel-r13-final.mp4` (= v2 com aviso), `reel-r13-v2-com-aviso.mp4`, `reel-r13-v2-sem-aviso.mp4`. Código: `r13-estilo-ref\cena.html` + `render.cjs` (render quadro a quadro em Chrome, 585 quadros a 30 fps, `ffmpeg` junta com a locução). A v1 (com o b-roll) ficou em `reel-r13-v1-com-broll-*.mp4`.

Aplicado, com os números medidos:
- Bloco inicial de texto (82,5 px, +0,05 em, entrelinha 103, x = 84) com o texto da locução ("Uma parada na farmácia, um cupom no fundo da sacola."), cadência de 133 ms por palavra, subida de 19 px, destaque em `#ADFBE3` em "farmácia," e "sacola.", saída com fade e subida de 44 px em 3,57 a 3,97 s.
- Aparelho sobe de baixo inclinado, passa 55 px e assenta (3,93 a 4,8 s), empurrão lento de +7% (4,6 a 5,7 s).
- Título 1 "Registre o gasto." e título 2 "Livre para gastar." (frases tiradas da própria locução, para não criar copy nova), 60 px, centralizados, destaque na última palavra, saída de 0,33 s, entrada 0,27 s depois.
- Dissolve de 0,27 s entre as duas telas reais (lista e Início); fecho em fade sequencial (aparelho sai em 0,40 s, logo entra em 0,47 s) com logo de 600 px em y 792.
- Fundo, brilho e cores iguais; sem grão; 1080x1920, 30 fps, 19,5 s.
- Medido no arquivo: moldura inteira, **margens ≥ 208 px nas laterais e ≥ 244 px em cima e embaixo** no tamanho máximo; nenhum quadro preto; áudio de 19,5 s; aviso legível de 5,0 a 16,75 s na versão "com aviso".

**O que não coube:**
1. **Música:** o vídeo aprovado tem cama musical; o R13 segue a decisão "sem música" do Beacon e do autor. Falta decidir se o novo estilo pede cama.
2. **Aparelho vazando pela borda de baixo:** não repeti, por causa da regra de 04/10.
3. **Flash de obturador, câmera e folha "Nota fotografada":** não aplicáveis (foto da nota está proibida em peça antes do dia D).
4. **Tagline "Rápido, fácil e sem complicação.":** texto novo sem aprovação do Beacon; o R13 fecha só com o logo.
5. **Footage:** o vídeo aprovado não tem filmagem. O b-roll da sacola (US$ 1,11, já gasto) **não entra na v2**; ficou na v1. O autor decide se a v2 deve abrir com ele.
6. **Entrada dos títulos 2 e 3 do R13 e subida dos títulos de cena:** assumi os valores medidos no vídeo de referência; o 3º título dele (2 linhas) não tem equivalente no R13.
7. **Cadência do bloco inicial:** usei os 133 ms por palavra da referência; a locução fala mais devagar (a frase 1 termina em 3,3 s), então o texto aparece antes da fala.
8. **Aviso "Demonstração com dados fictícios":** só na v2 "com aviso", em 32 px na parte de baixo (a referência não tem rodapé); conflito entre a ordem do Orquestrador (remover) e o parecer do Watchtower (manter) segue para o autor decidir.
9. **Não verificado:** a tela dos dois aparelhos em celular real; sincronia fina entre palavra falada e palavra na tela; nenhum parecer do Watchtower sobre o vídeo final.

## 9. EM ABERTO: decisão do autor (registrado pelo Quill em 04/10/2026)

(a) **Aparelho vaza pela borda de baixo.** No vídeo aprovado o celular sai do quadro por baixo (do topo em y≈400 até além de 1920). Isso contraria a regra de criativo de 04/10 ("celular e notebook nunca cortados na borda, com margem segura"). O Flare NÃO copiou isso no R13 (margens ≥ 208 px laterais e ≥ 244 px em cima e embaixo). Pergunta ao autor: vídeo mantém o aparelho inteiro (a regra de 04/10 vale também para vídeo e a referência é só de ritmo e motion) ou a sangria por baixo é exceção aceita do estilo de vídeo? Enquanto não houver resposta, vale o aparelho inteiro.

(b) **Cama musical.** O vídeo aprovado tem cama musical percussiva (~120 BPM) com efeitos de interface; o R13 saiu SEM música, seguindo a decisão anterior do Beacon e do autor. Pergunta ao autor: o estilo replicado inclui a cama musical? Enquanto não houver resposta, vídeo novo sai sem música.
