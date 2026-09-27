# Arsenal de ícones e notificações para os criativos (27/09/2026)

Pedido do autor: uma biblioteca de notificações variadas e de ícones para compor Stories, estáticos e vídeos. Tudo é PNG com fundo transparente e foi feito sem créditos da ElevenLabs.

## Ícones (`icones/`)

- **Conjunto:** são os **mesmos ícones do app**, o Ionicons (`@expo/vector-icons`, licença MIT). Assim nenhum ícone "não existe no Grana.", que foi a crítica ao ícone desenhado à mão no Story 2.
- **28 ícones:** voz, voz-contorno, colar-comprovante, qr-code-nota, recibo, importar-extrato, lembrete, calendario, carteira, cartao, graficos, categorias, granabo, seguranca, tempo, salvo, recorrente, celular, computador, sincronia, desafios, sequencia, cafe, mercado, noite, rapido, dinheiro, transporte.
- **5 estilos por ícone,** todos em 512×512:
  - `-menta`: círculo menta `#AEFFE3` com o ícone em petróleo;
  - `-petroleo`: círculo `#0B2D35` com borda e o ícone em menta;
  - `-gradiente`: círculo no gradiente da marca, com o ícone em petróleo;
  - `-contorno`: só a borda menta;
  - `-simbolo-menta`: só o ícone, em menta, sem círculo.
- **Prévia:** `previa-icones.png`.

## Notificações (`notificacoes/`)

São 21 notificações no estilo do Android 14 escuro, em 3× (≈ 1236 px de largura), com o ícone "G." do app.

- **Textos reais,** tirados do código:
  - gasto salvo: `notificarSucesso` em `lib/widget-voz-notificacoes.ts`, com o botão "Desfazer";
  - lembretes de fim de dia, almoço, sequência, gastos pequenos, dicas e "voltar": `lib/notification-catalog.ts`;
  - conta, fatura e limite do cartão: `lib/notifications.ts`;
  - "Lançamento salvo no aparelho": modo offline da voz.
- **Só os dados são fictícios:**
  - valores, como R$ 3,57 e R$ 32,00;
  - nomes de contas, como Internet, Aluguel e Conta de luz;
  - o nome do cartão, "Cartão do dia a dia";
  - a sequência de "12 dias".
- **Prévia:** `previa-notificacoes.png`.

## Para criar mais

1. Abra o `gerar.py` e acrescente uma linha em `ICONES` (qualquer nome do Ionicons) ou em `N` (título, corpo, hora e ação).
2. Para notificação nova, tire o texto do código. Não invente mensagem que o app não manda.
3. Rode `python3 gerar.py` numa pasta com `Ionicons.ttf`, `roboto-400.woff2`, `emoji.woff2` (Noto Color Emoji, recorte com os emojis usados) e `android-icon-monochrome.png`.

## Regras

- Nenhuma notificação menciona banco ou marca real.
- Nada de preço.
- O Story 2 (`../stories-estilo-referencias/`) já usa o `sincronia-gradiente.png` no lugar do ícone antigo.
