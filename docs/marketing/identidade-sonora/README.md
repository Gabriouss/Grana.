# Identidade sonora e notificação dos vídeos do Grana.

Decisões do autor em 25/09/2026, válidas para os próximos vídeos e anúncios. Tudo aqui é gerado por código, sem créditos da ElevenLabs e sem material de terceiros.

## "Plim" de lançamento salvo: `plim-sucesso.wav`

- É o som que marca o momento em que o gasto foi lançado. São quatro notas rápidas subindo (Dó6, Mi6, Sol6, Dó7), timbre suave, 0,9 s.
- Foi escolhido entre três opções. As outras duas, recusadas, eram "duplo" (duas notas de marimba) e "sino" (uma nota de sino). A primeira versão do Reels usava um "plim" gerado na ElevenLabs, que o autor pediu para trocar.
- **Volume na mixagem:** −11,9 dB sobre o arquivo, o que deixa o "plim" com ≈ −24 LUFS, o mesmo nível do anterior. Ele entra junto com a notificação na tela.
- **Para gerar de novo:** `python3 gerar-plim.py` (precisa de `numpy`). O script gera as três opções; a escolhida é `plim-sucesso.wav`.

## Trilha de fundo: pegada pop

- **Pedido do autor:** "uma musiquinha bem baixinha". Entre bossa, lo-fi e pop, ele escolheu a pop: "vamos seguir nessa pegada".
- **A trilha:** 118 bpm, acordes Dó, Sol, Lá menor, Fá, piano marcado, baixo, bumbo em todo tempo, palmas no 2 e no 4, melodia dedilhada a partir do terceiro compasso.
- **Para gerar:** `python3 gerar-trilha.py pop`. Para mudar a duração, altere `DUR` e o início do fade out no script.
- **Mixagem:** a trilha entra 13 dB abaixo do resto. Uma compressão lateral (`sidechaincompress`, threshold 0,03, ratio 4, attack 30 ms, release 400 ms) abaixa a música quando alguém fala.

## Notificação na tela: `notificacao-android.html`

- É a notificação do Android 14 no modo escuro, com o texto que o app manda de verdade quando o widget salva um gasto (`notificarSucesso` em `lib/widget-voz-notificacoes.ts`):
  - título: `descrição · valor`;
  - corpo: `categoria · forma · salvo no Grana.`;
  - botão: "Desfazer".
  Ao trocar o lançamento do vídeo, troque o texto no HTML pelo que o app mostraria para aquela fala.
- **Para gerar a imagem:** Chromium sem cabeça, com `--force-device-scale-factor=3 --default-background-color=00000000 --window-size=412,300`. O alto da janela come ~87 px. Recorte 1236×400 e reduza para 720 de largura.
- **Na montagem:** ela desce do topo em 0,35 s, junto com o "plim", e sobe antes do corte seguinte.
- **Fonte:** a Roboto vem do Google Fonts, com licença Apache 2.0.
