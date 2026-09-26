# Motion "desistiu porque cansa" (26/09/2026)

É um vídeo vertical de 20 s, sem rosto e sem narração, feito sem créditos da ElevenLabs.

- **Pedido do autor:** um vídeo à parte, com mockups do celular e gastos fictícios, sobre a dor de quem desiste do controle porque anotar tudo cansa.
- **Telas recriadas:** as telas são reconstruídas em HTML, não capturas. O autor autorizou, porque este ambiente não tem emulador Android. Isso é uma exceção à regra de "capturas reais" do `PRODUCT.md`.
- **De onde vem cada detalhe:** cores, fontes e textos saem do código:
  - widget de voz: `modules/grana-voice-widget` (layout, cores, "Lançar por voz", "Ouvindo…", "Lançando…");
  - widget "Livre para gastar": mesmo módulo;
  - leitor de QR code: `components/QrScannerModal.tsx` ("Aponte para o QR Code da nota fiscal", "Nota fiscal lida", "Salvar lançamento");
  - notificação de gasto salvo: `lib/widget-voz-notificacoes.ts`;
  - lembrete da noite: `lib/notification-catalog.ts`, "noturno-1".
- **Dados fictícios:**
  - "Mercadinho do Bairro", CNPJ 12.345.678/0001-90, R$ 48,90;
  - "Pão na padaria", R$ 3,57;
  - "Livre para gastar": de R$ 42,00 para R$ 41,82 por dia (R$ 840,00 − 3,57, em 20 dias).
  O QR code é desenhado aleatoriamente e não aponta para nada.
- **Não é igual ao app:**
  - o botão "Salvo ✓" depois de tocar em "Salvar lançamento" foi inventado para a animação;
  - a tela inicial do Android é genérica, com ícones redondos sem marca.

## Como gerar

1. `pip install playwright numpy`; o Chromium do Playwright precisa estar instalado.
2. `python3 render.py video 20`, nesta pasta. Gera `video-sem-som.mp4`, 1080×1920 a 30 fps, quadro a quadro pela função `anim(t)`.
3. Para conferir quadros soltos: `python3 render.py stills 6 11.5`.
4. **Som:** trilha pop de `../identidade-sonora/gerar-trilha.py` (20,5 s) a −7 dB. O "plim" de sucesso entra em 7,5 s (notificação) e em 12,1 s (salvar a nota), a −9 dB. O lembrete das 21:30 usa o "sino" a −16 dB, em 14,1 s.

## Roteiro na tela

| Tempo | Tela | Texto |
|---|---|---|
| 0–4 s | Fundo escuro, palavras entrando | "Já desistiu de controlar seus gastos porque anotar tudo toda hora cansa?" |
| 4–9 s | Tela inicial: toque no widget, fala transcrita, notificação, "Livre para gastar" atualiza | "Pagou? É só falar." |
| 9–13,4 s | Leitor de QR, nota lida, salvar | "Ou aponta pro QR code da nota." |
| 13,4–17 s | Tela bloqueada às 21:30, lembrete | "Esqueceu? O Grana. te lembra." |
| 17–20 s | Logotipo | "Rápido, fácil e sem complicação." |
