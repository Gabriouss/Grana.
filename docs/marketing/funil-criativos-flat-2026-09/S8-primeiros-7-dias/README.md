# S8: "O que fazer nos primeiros 7 dias" (carrossel, 26/09/2026)

Carrossel de feed com 6 slides em 1080×1440, feito localmente sem créditos da ElevenLabs. No calendário do `FUNIL.md` ele está em D+29 e já pode ser produzido, porque o checklist é texto e não depende de captura de tela.

| Slide | H1 | Apoio | Gráfico |
|---|---|---|---|
| 1 | O que fazer nos primeiros 7 dias. | Um passo por vez. No fim da semana, o seu mês já tem forma. | notebook com a Início real (`revisao-03/assets/notebook.png`) |
| 2 | Dias 1 e 2. Lance cada gasto na hora. | Pagou? Fala pro widget ou cola o comprovante do Pix. Leva segundos. / Esqueceu algum? À noite o Grana. te lembra. | notificação real de gasto salvo e widget "Lançar por voz" (recriados, o que a seção 8 do funil permite) |
| 3 | Dia 3. Confira as categorias. | Veja se cada gasto caiu no lugar certo. Se não caiu, é só editar o lançamento. | etiquetas com as cores reais das categorias (`lib/types.ts`) |
| 4 | Dias 4 e 5. Olhe o Livre para Gastar. | Um número por dia: quanto dá para gastar até o fim do mês. | widget real "Livre para gastar" recriado, com R$ 59,76/dia e R$ 1.553,65 · 26 dias, os mesmos números fictícios da Início do slide 1 |
| 5 | Dias 6 e 7. Ajuste a rotina. | Com uma semana lançada, dá para ver onde o dinheiro foi. Escolha um hábito para mudar. | checklist |
| 6 | Comece pelo próximo gasto. | — | celular real (`celular-vazio.png`) com a tela inicial: notificação do pão, widget de voz e widget Livre já com o gasto descontado (R$ 59,62/dia); logotipo no lugar de sempre e texto centralizado |

- **Os quatro passos** são os do funil (seção 17.3, S8): lançar, categorizar, olhar o Livre para Gastar e ajustar a rotina.
- **Conferido no código:**
  - lançar por voz: widget;
  - colar o comprovante do Pix: `PasteReceiptModal`;
  - editar o lançamento: `TransactionSheet`;
  - lembrete da noite: `notification-catalog`.
- **A rota dos 7 dias** fica embaixo em todos os slides e vai acendendo conforme o carrossel avança.
- **Ficam de fora:** sobretítulo, rodapé, botões, preço e número de saldo.
- **Para regenerar:** abra `S8.html?s=N`, com N de 1 a 6, no Chromium em 1080×1440 e fotografe.

## Revisão do autor (26/09/2026)

1. **Medidor circular do slide 4 retirado.** O autor apontou que ele "não existe em lugar nenhum do Grana.". Entrou no lugar o widget real "Livre para gastar".
2. **Capa ganhou o notebook com a Início web.** Pedido do autor.
3. **Último slide:** ganhou o celular com a tela inicial, o logotipo voltou ao lugar dos outros slides e o texto ficou centralizado.

**Pendência para o dia D:** a Início do notebook é uma captura anterior à regra 20. Ela ainda mostra a linha "Contas a vencer este mês", que a regra tirou. Antes de publicar, é preciso recapturar a Início da build nova e trocar o `notebook.png` (a mesma pendência do S1 e do S3 no funil).
