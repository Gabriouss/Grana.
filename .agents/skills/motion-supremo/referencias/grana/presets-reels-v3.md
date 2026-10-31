# Presets dos Reels v3 (25/10/2026)

Presets da rodada em que o autor aprovou o estilo novo ("o vídeo está excelente") e pediu a série inteira nele. Os cinco vídeos estão em `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/` (Fatura e parcelas, Quanto pode gastar hoje, Metas e cofrinhos, Compra por impulso e Comprometimento futuro, todos com o sufixo "reedicao v3"). O código pronto está em `presets-reels-v3/` ao lado deste arquivo:

| Pasta | Conteúdo |
|---|---|
| `presets-reels-v3/serie/` | base da série (`base.js`, `base.css`, `v.html`), os quatro vídeos (`v1.js`, `v3.js`, `v4.js`, `v5.js`), `render.py` e as varreduras (`legendas.py`, `parado.py`, `checar.py`, `bordas.py`) |
| `presets-reels-v3/fatura/` | o primeiro vídeo do estilo (`index.html`, `cena.js`, `render.py`, `mix.py`) |

Para começar um vídeo novo: copie `serie/` para `E:\Grana-temporarios\<projeto>\serie\`, crie `assets/` com `gsap.min.js`, as Neue Machina Light, Regular e Ultrabold (a Ultrabold nunca vai para o repositório), `logotipo-gradiente.svg`, `logotipo-petroleo.svg`, os PNGs do Granabô e os ícones `ic-*.png` do arsenal na versão petróleo. Sirva a pasta-mãe com `python -m http.server 8765` e escreva `vN.js` chamando `montar(cfg, cena)`.

## Regra da série

Mesma identidade, variação em cada vídeo (regra aprendida em 25/10/2026). Todo vídeo novo escolhe uma **assinatura de movimento**, um **estilo de entrada da legenda**, uma **entrada do botão Saiba mais** e um **tema**, sem repetir a combinação de outro vídeo da mesma leva.

| Vídeo | Tema | Assinatura | Legenda | Saiba mais |
|---|---|---|---|---|
| Fatura e parcelas | escuro | chicote e giro do celular, cards saindo da tela | estilo por trecho (slam, flip, slide) | escala |
| Quanto pode gastar hoje | claro | elevador: celular nasce deitado e se levanta, trocas na vertical | `rise`: sobe de máscara, alinhada à esquerda | sobe de baixo |
| Metas e cofrinhos | claro | órbita dos cofrinhos, troca por íris, celular vira e o mural se monta em blocos | `vira`: gira no eixo Y, centralizada | gira no eixo Y |
| Compra por impulso | escuro | freada: entra de lado e derrapa; chicote entre dois aparelhos | `freio`: x 320, skew −38°, `back.out(2.8)` | entra de lado e freia |
| Comprometimento futuro | escuro | túnel: a câmera atravessa portais dos meses | `estica`: scaleX 2,2 para 1, `expo.out` | vem do fundo (z −1800) |

## Pipeline (igual em todos)

- Cena determinística: GSAP com a timeline pausada, `window.renderAt(t)` como função pura do tempo, e `at()` = `fromTo` com `immediateRender: false`.
- Captura em 120 q/s com o Playwright, `tmix=frames=2` e saída em 60 q/s (motion blur); H.264 yuv420p, CRF 15.
- Mix: voz original intacta em t=0, ganho por loudnorm; trilha cortada para a batida cair em t=0, −6 dB, com sidechain sob a voz; SFX por `adelay`; loudnorm em duas passadas a −14 LUFS e TP −1,5; AAC 48 kHz estéreo 256k.
- Tempos de palavra: `inicio_real` do WAV original.
- `render.py <n> stills t…` gera as provas e a `folha.jpg`; `video` captura; `mix` mixa.
- **O mix tem `-t DUR` na saída e `timeout=240`.** Só o `atrim` depois do `apad` já deixou o WAV crescer sem fim duas vezes (3,7 GB e 13 GB).
- **Rode um render e um mix por vez.** Duas mixagens em paralelo já produziram um WAV sem fim (3,7 GB); use `timeout 300` no mix.

## Preset: celular realista (`celular(id, frente, verso, x, y)`)

- Corpo de 556×1186 com moldura metálica em gradiente, borda de vidro, furo de câmera e reflexo que acompanha o `rotationY`, além de uma sombra que segue o aparelho.
- **Lateral 3D:** 30 camadas de 2 px (60 px de espessura). O perfil é arredondado (o meio sai mais, `inset = 5·(1 − sen)`), com luz vindo da esquerda (`#34434a` a `#dfecef`, potência 3).
- Botões no lado esquerdo, que é o lado visível.
- Inclinação permanente em `.tilt`: `rotateY(19deg) rotateX(3deg) rotateZ(-1.2deg)`. Foi pedido do autor: "aspecto 3D e efeito de profundidade nas laterais".
- Tela: `.scr` em 1080×2388 com `scale .48148`. **Sem `overflow:hidden`**, porque ele achata o 3D e impede o card de sair da tela.
- O verso fica em `translateZ(-60px) rotateY(180deg)` e serve de segunda tela na virada.

## Preset: telas do app em HTML (dados reais da conta de teste)

- Peças prontas em `base.js`: `topoInicio`, `acao`, `livreCard`, `metaCard`, `grafico` e `inicio`.
- Telas inline nos vídeos: Pix (`v1.js`), Desafios/mural (`v3.js`), chat do Granabô (`v4.js`) e o Início já rolado até os cofrinhos e o gráfico (`rolado()` em `v5.js`).
- Nunca invente valor. Use só os números da conta de teste anotados na rodada, como Livre R$ 719,81/dia, Saldo R$ 10.723,63, Guardado −R$ 643,27, Crédito −R$ 722,85, as metas, o total comprometido de R$ 10.050,75, a resposta do Granabô e as conquistas 7 de 12.
- Pop para fora da tela: `z 120–260` mais `scale 1.08–1.3`, `back.out(2)`, e acende o `.pbg`.

## Preset: legendas

- `legendas(G, FIM, estilos)`: cada grupo tem até duas linhas, e a palavra entra no `inicio_real`. Classes: `hl` (pílula), `grad`, `mint`, `slamw` (força o slam numa palavra) e `big`.
- Estilos prontos: `slam` (escala 2,3 com desfoque), `flip`, slide padrão, além de `rise`, `vira`, `freio` e `estica`, definidos nos `vN.js` e fáceis de copiar.
- A largura da caixa é 940 px. Confira com `legendas.py <n>`; só são aceitos avisos de um quadro na entrada.

## Preset: tema claro (`temaClaro(o)`)

- Moldura aqua de 22 px, painel aqua e disco claro `#D3FCEA` com grade `#E0FFF1` a cada 62 px. O disco tem de 2350 a 2400 px e ocupa a maior parte do quadro; o azul fica só nas margens (pedido do autor).
- Logotipo petróleo no canto e RÁPIDO, FÁCIL, PRÁTICO nos outros cantos.
- Três ícones do arsenal desfocados, que derivam o tempo todo.
- Legenda em Ultrabold `#013036`, pílula de `#87F7C7` a `#00ADC5`.
- Logotipo petróleo e Ultrabold foram aprovados pelo autor só neste tema (exceção à regra 23).
- Guia medido: `semana-43/apoio/referencias/guia-de-estilo-reels-tema-claro.md`.

## Presets de assinatura (código nos `vN.js`)

- **Órbita (V3):** objeto `O = {r, R, s, o}` animado pelo GSAP e desenhado por quadro. Cada cartão fica em `translate3d(sen(a)·R, −cos(a)·R·0,18, cos(a)·R)`, com `a = r + 120i`, e o da frente acende. O cartão i fica de frente quando `r + 120i` é múltiplo de 360.
- **Túnel (V5):** objeto `T = {z}`. Os portais ficam em `z = −900i − 300 + T.z`, desaparecem ao passar de z 300 a 1000 e somem antes de 2200, onde a perspectiva inverte. O nome do mês fica embaixo do portal, para não cruzar a legenda.
- **Placa de aeroporto (V5):** cada dígito troca a 15 por segundo e trava em `t0 + 0,55 + 0,05i`.
- **Freada (V4):** entra com `x 1500` e `skewX −20`, `expo.out`, e depois faz um balanço `back.out(3)`. Os rastros `.skid` usam `scaleX`.
- **Chicote (V4):** o aparelho A sai com `power3.in` em 0,24 s, um rastro brilhante passa e o aparelho B freia vindo do outro lado.
- **Elevador (V1):** o celular nasce com `rotationX 74` e `y 820` e se levanta com `back.out(1.3)`. Os dígitos do saldo caem um a um.
- **Íris (V3):** um círculo `#iris` escala até 460 e esmaece em seguida. No tema claro ele é petróleo.
- **Mural em blocos (V3):** as medalhas chegam de `z 500–800` com x e y aleatórios fixos (`rnd(i)`), em sequência de 0,055 s.

## Preset: capa do Reels (`capa.html?n=`, `capas.py`)

- Capa 1080×1920 no visual do próprio vídeo: clara para vídeo claro, escura para vídeo escuro. Blocos do app em HTML com dados reais, flutuando e levemente girados (de 2° a 6°), sem aparelho e sem print recortado. Pedido do autor em 25/10/2026, a partir da capa do "Pra onde foi o dinheiro do mês", "com qualidade melhorada".
- Escura: painel petróleo com luz de cima, G do símbolo (`simbolo-menta-sem-ponto.svg`) a 7% de opacidade, ícones `-menta` do arsenal desfocados, logotipo em gradiente, título branco com a segunda linha em menta.
- Clara: o mesmo tema claro dos vídeos, com logotipo petróleo e a segunda linha numa pílula de gradiente.
- Título Ultrabold de 70 a 120 px, centralizado em y 440. Os blocos ficam de y 640 a 1585, dentro de x 40 a 1040. O `capas.py` confere isso e acusa o que sair.
- Nome do arquivo: `<nome do vídeo>-capa.png`; o painel pareia pela parte antes de `-capa`.

## Preset: chat do Granabô (V4)

- A tela do chat é a janela real do Granachat, copiada das capturas: flutua sobre o Início escurecido, com "Oi! Tudo na ponta do lápis por aqui", o Granabô, "Boa noite! Eu sou o Granabô", o texto de boas-vindas, as sugestões centralizadas em três fileiras e o campo "Pergunte ao Granabô...".
- A pergunta é digitada no campo e enviada. O cabeçalho passa por "Consultando seus dados..." e depois "Números conferidos", e aparece "Granabô está pensando...".
- Na resposta, o aparelho recua e o Granabô 3D vem para o centro "falando": o texto é digitado letra a letra num balão de diálogo, enquanto ele alterna as poses `frente` e `piscando` e balança de leve. Cada letra já ocupa o seu lugar desde o início, para o texto não refluir durante a digitação.

## Varreduras (rodar antes de entregar)

- `legendas.py <n>`: linha fora de x 40 a 1040.
- `checar.py <n>`: texto fora do card ou sobreposto. Caixas inclinadas pelo giro dão falso positivo; confira recortando o quadro.
- `bordas.py <n>`: card a menos de 24 px da borda.
- `parado.py final.mp4`: maior trecho parado (no máximo 2 s; só o fecho do logo chega perto) e quadros escuros.
- Monte a folha do MP4 final com `ffmpeg -vf "fps=1.2,scale=180:320,tile=8x3"` e olhe a folha inteira.

## Armadilhas que custaram retrabalho

1. Os filhos `preserve-3d` ignoram o `backface-visibility` do pai. Na virada, esconda a face da frente com `tl.set('#paF', {visibility:'hidden'})`.
2. A rolagem animada dentro da tela vaza acima do aparelho, porque a tela não recorta. Monte a tela já rolada.
3. `opacity` num contêiner `preserve-3d` achata o 3D. Esmaeça cada elemento.
4. Um elemento com `z` positivo cresce a partir do centro do quadro: perto da borda, ele passa da margem. Afaste para dentro antes de aplicar o z.
5. Valor que cresce com `scale` invade o texto ao lado. Use `transformOrigin: 'left center'` e margem.
6. Estilo inline vence o CSS do tema. Use `!important` no tema claro quando o `cta()` define a cor inline.
7. A fonte pode faltar na captura. A base carrega `document.fonts.load` de cada peso e recusa seguir sem a Ultrabold no tema claro.
8. Vão vazio entre a saída do aparelho e o "Clica em" fica escuro. Atrase a saída ou mantenha o último elemento se mexendo.
9. Rótulos dos cantos (RÁPIDO, FÁCIL, PRÁTICO) ficam por cima do mundo 3D. Nada importante passa por baixo deles.
