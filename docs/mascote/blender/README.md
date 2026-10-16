# Granabô em Blender: como gerar o mascote animado

Este guia deixa a M1 (ou qualquer máquina) reproduzir o mascote animado do Reels de apresentação e produzir novos materiais com o mesmo modelo. Tudo roda por código, sem interface do Blender e sem custo de crédito.

## O que existe

| Arquivo | Para quê |
|---|---|
| `construir.py` | Constrói o modelo 3D do zero e salva `granabo.blend`. |
| `granabo.blend` | O modelo pronto (versão W3, boca L3). Dá para abrir no Blender e olhar. |
| `animar.py` | Anima por keyframes e renderiza os quadros com fundo transparente. |
| `../../marketing/reels-granabo/montar.py` | Compõe o Reels de 25 s a partir dos quadros, do celular real, dos textos e do logo. |
| `../../marketing/reels-granabo/quadros/` | Os quadros já renderizados (ver "Resultados prontos"). |

## O que o modelo é

- **Esfera de raio 1,00.** O núcleo é de vidro escuro e sólido, com raio 0,87. A carcaça menta tem 0,13 de espessura.
- **A carcaça é o G oficial da marca.** Ela é recortada da esfera pelo vetor `design-system/marca/simbolo-menta-sem-ponto.svg`. Trocar o arquivo muda o desenho em todas as vistas.
- **W3:** só a ponta de cima do G gira 14° para abrir a faixa dos olhos. A barra do G não se mexe. A regra está em `warp()`, dentro de `construir.py`.
- **Olhos:** duas malhas deformáveis, com shape keys `pisca` e `feliz`. Piscar, ficar feliz e voltar ao normal são deformações contínuas da mesma malha, sem troca de imagem.
- **Boca L3:** um arco gravado na barra do G, com pontas arredondadas.
- **Material e luz:** carcaça menta fosca com verniz leve, núcleo de vidro brilhante, três luzes de área e câmera de 85 mm. O render é em Cycles, na CPU.

## Instalar (uma vez)

Precisa de Python 3.13 e do pacote `bpy`, que é o Blender como módulo. Não precisa instalar o programa.

    pip install bpy==5.2.2 numpy pillow
    ffmpeg -version      # o ffmpeg precisa estar no PATH

O `bpy` pesa cerca de 400 MB. Se `pip install` falhar com "no matching distribution", confira a versão do Python: a 5.2.2 só tem pacote para a 3.13.

## Gerar

Todos os comandos rodam a partir de `docs/mascote/blender/`.

**1. Reconstruir o modelo** (opcional, o `granabo.blend` já está no repositório; leva uns 5 s):

    python construir.py

**2. Renderizar os quadros.** O Reels usa dois trechos, A e B (ver `animar.py`, topo do arquivo):

    python animar.py A 48        # trecho A: quadros 117 a 252, 48 amostras
    python animar.py B 48        # trecho B: quadros 558 a 657

Os quadros saem em `docs/marketing/reels-granabo/blender/` como `A_0117.png` e assim por diante, 700×700 com alfa. Para mudar a pasta de saída, use a variável de ambiente `GRANABO_SAIDA`. Para renderizar só alguns quadros (teste rápido):

    GRANABO_SAIDA=/tmp/teste python animar.py A 16 150 152     # quadros 150 a 152, 16 amostras

**Tempo na CPU:** cerca de 10 a 18 s por quadro com 48 amostras, em 4 núcleos. Os 236 quadros levam mais de uma hora. Com 16 amostras sai em 3 a 5 s por quadro, bom para conferir o movimento antes do render final.

**3. Montar o vídeo:**

    cd ../../marketing/reels-granabo
    python montar.py             # gera granabo-reels-previa.mp4 (1080×1920, 30 fps, 25 s)

A montagem leva uns 70 s. Se os quadros do Blender não existirem, ela cai para as poses simples de `gerar_sprites.py`, e o movimento fica pior.

## Resultados prontos

Para não gastar uma hora de render, os quadros finais estão versionados em `docs/marketing/reels-granabo/quadros/`, comprimidos sem perda: `A_0117-0252.webp` e `B_0558-0657.webp` (WebP animado com alfa; os números são o primeiro e o último quadro). O `montar.py` os extrai sozinho para `blender/` se a pasta estiver vazia. Para extrair à mão:

    python ../../marketing/reels-granabo/extrair_quadros.py

## O que mexer para fazer material novo

| Quero | Onde |
|---|---|
| Mudar o movimento (giro, piscada, pulo, olhar) | `animar.py`: os keyframes de cada trecho estão em blocos `if trecho == 'A'` e `else`. Os tempos são em segundos do Reels, via `s(t)`. |
| Uma expressão nova (surpresa, triste) | `construir.py`: função `linhas(forma)` e a lista de shape keys. Cada forma nova é uma lista de pontos do contorno do olho. |
| Outro trecho (nova cena) | Copiar um bloco de `animar.py`, dar um nome e registrar o intervalo de quadros em `montar.py`, na função `quadro_blender`. |
| Outro ângulo de câmera | `animar.py`: `cam.data.lens` e `cam.location`. |
| Outra cor da carcaça | `construir.py`: `M_CARCACA`. |

## Armadilhas que já custaram tempo

- **Shape keys nascem com valor 1,0.** Em `construir.py` cada uma é criada com `sk.value = 0.0`. Sem isso, o olho abre já meio fechado e meio feliz.
- **Malha do olho em uma faixa só dá "gota".** O olho é uma grade de 8 faixas por 40 pontos, com projeção no plano tangente à esfera. Uma malha de duas fileiras deforma o contorno em ponta.
- **Polos da esfera.** O UV sphere tem os polos no eixo X (`rotation=(0, π/2, 0)`) para caírem no vão do G. Sem isso, aparece uma emenda visível na carcaça.
- **Bordas arredondadas.** O chanfro é de 0,035 e só vale para arestas de mais de 35°. Valores maiores abrem o corte do G.
- **Sombra no chão.** O chão do Blender fica oculto no render (`hide_render`). A sombra é desenhada na montagem, para o mascote poder subir e descer sem a sombra acompanhar do jeito errado.
- **Motion blur** ligado (obturador 0,5). Sem ele, o giro de 1 s parece picotado.

## Regras do projeto que valem aqui

- Produção de material só quando o autor pedir na sessão (regra 21).
- Vídeo segue o estilo do motion aprovado (regra 23). O guia medido está em `docs/marketing/2026-10/semana-40-2026-09-28-a-2026-10-04/apoio/referencias/guia-de-estilo-de-video.md`.
- Nada de ElevenLabs sem aprovação de custo (regra 24). O Blender e o ffmpeg são locais e gratuitos.
- Evitar números redondos em qualquer valor que apareça na peça.
