# Roteiro — Reels "Conheça o Granabô" (apresentação do mascote)

**Pedido do autor (07/10/2026):** "Vamos tentar animar o Granabô. Quero um
roteiro de vídeo, no formato reels de apresentação do Granabô, no estilo
animado e dinâmico que geralmente produzimos."

**Status:** proposta de roteiro. Nada foi renderizado, gerado ou gravado. As
frases na tela são propostas e precisam do aceite do autor (e do Beacon, no
fluxo da M1) antes da produção.

## Base obrigatória

- **Estilo:** o do vídeo aprovado `grana-motion-desistiu-foto-da-nota.mp4`
  (regra 23), medido em `guia-de-estilo-de-video.md`. Os tempos de entrada e
  saída abaixo copiam os números de lá.
- **Mascote:** `docs/mascote/`, versão W3 com boca L3. É um modelo 3D renderizado
  por `docs/mascote/granabo_modelo.py`, então toda pose do roteiro é o MESMO
  objeto girando, piscando ou mudando os olhos. Nada de redesenhar à mão.
- **Telas do app:** só gravação real. `material-video-2026-09-26/granabo-consulta-limpa.mp4`
  e `granabo-registro.mp4` (produção v40), com as regras de corte de
  `DIRECAO-EDICAO-R5-R9-GRANABO.md`.
- **Regras de criativo:** celular sempre inteiro, com margem ≥ 80 px; mockup
  realista; logo gradiente oficial; sem sobretítulo, sem rodapé de aviso, sem
  botão desenhado; sem banco, Open Finance, WhatsApp, foto da nota ou preço.
- **Produção local:** HTML + Chromium + `ffmpeg`, e o mascote pelo script
  Python. ElevenLabs não entra (regra 24).

## Formato

1080 × 1920, 30 fps, cerca de 24 s. Fundo petróleo com brilho radial embaixo,
sem grão. Texto em Neue Machina Light: base `#EFFFFE`, destaque `#ADFBE3`.

## Plano a plano

| Tempo | Cena | Texto na tela | Movimento |
|---|---|---|---|
| 0,0–0,2 s | Só o fundo. | — | — |
| 0,2–1,9 s | Bloco de abertura, alinhado à esquerda (x = 84). | "Tem dúvida sobre o seu **dinheiro?** Pergunte para quem anota **tudo.**" | Palavra por palavra: uma a cada 133 ms, cada uma sobe 19 px em 267 ms. |
| 1,9–3,6 s | Bloco parado para leitura. | — | retenção |
| 3,6–4,0 s | Texto sai. | — | Fade de 0,40 s subindo 44 px. |
| 3,9–4,8 s | **Entrada do Granabô.** Ele sobe de baixo do quadro mostrando o LADO, em perfil: a carcaça aparece primeiro como o G da marca. | — | Sobe com passada de cerca de 60 px e assenta, igual à entrada do aparelho na referência. Diâmetro final de cerca de 620 px, centro em y ≈ 900. |
| 4,8–5,8 s | **Revelação do rosto.** Gira 90° no eixo vertical, do perfil para a frente: o G vira rosto e os olhos acendem no fim do giro. | — | Giro ease-in-out de 1,0 s. Olhos de 0 a 100% de brilho nos últimos 0,3 s. |
| 5,8–6,2 s | Piscada e sorriso. | Título 1: "Esse é o **Granabô.**" | Piscada de 4 quadros (olho achata e volta). Título centralizado no topo, palavra por palavra, passo de 0,07 s. |
| 6,2–7,6 s | Flutua parado, com leve subida e descida. | — | ±8 px em 1,4 s, sem rotação. |
| 7,6–8,4 s | **Ele mostra onde mora.** O Granabô encolhe e desce até o lugar do botão central da barra de abas, enquanto o celular sobe por baixo e assenta. O mascote se dissolve sobre o disco menta do botão. Título 1 sai. | — | Escala de 620 para cerca de 90 px com trajetória curva. Celular entra com passada e assenta. Dissolve de 0,25 s. |
| 8,4–13,4 s | **Consulta (tela real).** Abre a conversa, pergunta enviada, 0,5 s do "pensando", **corte franco** da espera, resposta inteira e estável. | Título 2: "Pergunte o que **quiser.**" | Empurrão lento de +7% no celular. Título 2 entra antes da pergunta aparecer na tela. |
| 13,4–13,7 s | Troca de cena. Título 2 sai. | — | Dissolve de 0,27 s dentro da moldura. |
| 13,7–18,2 s | **Registro (tela real).** "gastei 20 no mercado", resposta confirmando o lançamento salvo. Corta antes de o teclado voltar. | Título 3: "Ou só conte o **gasto.**" | Celular parado. "Plim" de sucesso a −16 dB quando a confirmação aparece. |
| 18,2–18,6 s | Celular e título saem juntos. | — | Fade de 0,40 s. |
| 18,6–21,5 s | **O Granabô volta, de frente, em tamanho cheio**, com os olhos em arco (expressão feliz). | Título 4: "Ele cuida das **contas.** Você vive." | Sobe e assenta como na entrada. Olhos passam de ovais para arco. |
| 21,5–21,9 s | Mascote e título saem. | — | Fade de 0,40 s. |
| 21,9–24,0 s | Fecho: logo "Grana." gradiente com 600 px, centrado. | (sem tagline até haver uma aprovada) | Fade de 0,47 s e retenção. |

## O mascote em cada momento

Todas as poses saem do mesmo modelo, com parâmetros de
`docs/mascote/gerar_comparativo.py`:

- **Entrada:** ângulo −90° (perfil, G legível), olhos apagados.
- **Giro:** de −90° a 0°, quadro a quadro, com o brilho dos olhos subindo no
  fim.
- **Piscada:** altura do olho (`eye_h`) de 0,13 para 0,02 e de volta, em 4
  quadros.
- **Flutuação:** só translação vertical, sem rotação.
- **Feliz no fecho:** formato dos olhos `happy` (variação D/G), com a boca L3.
- **Sombra:** elipse suave no chão, que diminui quando ele sobe.

Para animar é preciso acrescentar ao script um laço de quadros (ângulo, olhos
e posição por quadro) e exportar PNG com fundo transparente para a composição
no HTML. Hoje cada quadro custa de 2 a 4 s, então os cerca de 300 quadros do
mascote levam de 10 a 20 minutos na máquina. Isso não tem custo de crédito.

## Som

- O guia ainda tem em aberto se o estilo inclui cama musical. Até o autor
  decidir, o vídeo sai sem música, só com o "plim" de sucesso do registro
  (`identidade-sonora/plim-sucesso.wav`).
- Se o autor liberar a cama, usar a trilha pop de `identidade-sonora/` a
  ~120 BPM, com o giro do mascote (4,8 s) caindo no tempo forte.

## Decisões pendentes do autor

1. **As quatro frases na tela** (abertura, títulos 1 a 4). Todas são propostas
   e ninguém aprovou. A abertura e o título 4 são copy nova.
2. **Música:** com ou sem cama musical (mesma pendência do guia, item 9b).
3. **O mascote no app:** no app, o botão do Granabô é um disco menta com
   ícone, e o personagem 3D não aparece em lugar nenhum. A cena 7,6–8,4 s
   liga os dois de propósito, mas quem baixar o app não vai ver o rosto do
   Granabô. Se isso incomodar, a alternativa é trocar essa cena por um corte
   direto para o celular.
4. **Deploy:** o texto do Granabô em produção pode mudar com o deploy pendente
   da `assistente-financeiro` (registrado no `context.md`). Se mudar, as
   gravações v40 deixam de bater com o app e precisam ser refeitas antes da
   publicação.

## Conferência antes do aceite

- Celular inteiro e com margem em todos os quadros; mascote inteiro e redondo
  em todos os quadros (sem ser cortado pela borda na subida).
- Pergunta e resposta inteiras e legíveis em escala de celular; a espera
  cortada nunca sugere que a resposta veio em 0,5 s em tempo real.
- Nenhum quadro com dado real da conta; conversa e lançamento de teste
  apagados depois da gravação.
- Revisão de texto sem travessão e sem a estrutura "não é X, é Y".
