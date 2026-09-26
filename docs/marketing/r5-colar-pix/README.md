# R5, "Recebeu um Pix e não quer digitar tudo?" (v2, 26/09/2026)

Reel de 16,4 s em 1080×1920, sem narração e sem créditos da ElevenLabs. Foi montado com a gravação real `../material-video-2026-09-26/r5-clipe.mp4`.

## Pedidos do autor que esta versão atende

- **Mais movimento, "altamente dopaminérgico":**
  - o gancho entra uma linha por batida;
  - o celular entra em chicote no "drop" da música;
  - a câmera não para: aproxima o campo colado, depois o valor, as categorias e o aviso de salvo;
  - flashes e tremidas nos cortes;
  - etiquetas saltando da tela: "R$ 32,90", "Alimentação" e "Saída · Pix";
  - confete no "salvo";
  - barra de progresso no topo;
  - legendas que pulsam no ritmo.
- **Música diferente:** a trilha é própria desta peça, "house" a 100 bpm (v3: o autor achou a v2, a 128 bpm, rápida demais) (`gerar-trilha-house.py`). Ela tem uma subida até o drop em 2,4 s e uma batida forte no logo em 13,2 s. Os cortes caem nas batidas.
- **O R5 mantém o colar Pix.** O R9 vai mostrar **Importar extrato**. O pedido de gravação está na `main`, em `docs/marketing/solicitacoes/2026-09-26-gravar-r9-importar-extrato.md`.

## Correções na gravação

- **Colar:** corte seco do campo vazio para o texto inteiro, sem a digitação letra por letra. Decisão do autor.
- **Acento:** o texto gravado dizia "Voce ... as 18:42". O `patch-acento.png` reescreve "Você ... às 18:42", com o cursor, em cima do campo. Ele foi medido com a Neue Machina em 32 px, altura de linha 37 e deslocamento (90, 845) no quadro de 1080×2400, e só vale no trecho de 16,0 a 17,6 s do clipe.
- **Fora do vídeo:** a Início parada no começo, a espera longa do salvar e o final com a mancha vermelha do modo de desenvolvimento.

## Como regenerar

1. **Tela recortada:** trechos do clipe 7,2–8,4 / 8,5–9,35 / 16,0–17,6 com o patch / 17,75–20,45 / 20,5–21,0 / 23,35–25,6 s, a 30 fps, em 720×1600. Extraia os quadros em `fr/%04d.jpg` com `-vf fps=30`. **Sem o `fps=30`, os quadros repetidos somem e os tempos se perdem.**
2. `python3 render.py r5 video 16.4`, na pasta com `r5.html`, `fr/`, as fontes e o logotipo.
3. **Som:** a trilha a −5 dB e o "plim" de sucesso (`../identidade-sonora/plim-sucesso.wav`) a −6 dB, em 10,8 s.

## Aprovação do autor (26/09/2026)

O áudio da v3 foi aprovado: trilha "house" a 100 bpm e "plim" de sucesso no salvo. Fica assim.
