# Plano de motion v3

Estado: versão local para revisão. Não publicada nem agendada.

## Direção aplicada

1. A cena da sacola e do cupom saiu por completo. A abertura usa tipografia cinética sobre fundo de marca, sem footage.
2. O ritmo tem entradas curtas, pausas pequenas e movimento contínuo; nenhuma tela ou fundo fica imóvel por mais de 1,5 s.
3. A movimentação trabalha com capturas reais do app. A interface não foi reconstruída nem gerada por IA.

## Composição e fontes

- Formato 1080×1920, 30 fps, 19,5 s.
- O R13 v3 permanece sem aparelho/mockup. As duas capturas reais aparecem inteiras em uma lâmina plana, com status, controles e navegação visíveis. A captura ocupa cerca de 720 px de largura quando há chamada na faixa superior e cresce até cerca de 806 px nos trechos sem essa chamada; flutua e respira sem cortar a interface.
- R13 v3 fica sem mockup enquanto Prism conclui e libera suas correções. O laudo final de Sentinel reconcilia os relatórios: dez PNGs de `recortados-final` estão liberados; `celular-deitado.png` tem o botão “X” sem menu onde as telas equivalentes mostram “+”; os 11 PNGs de `vazios` são opacos, sem canal alfa, e servem como base de recorte/aplicação de tela, não como overlay pronto. As tentativas provisórias em `corrigidos-final` seguem sem liberação e não entram no vídeo.
- Lista: `prints-novos/celular/lancamentos-rolada.png`, com o lançamento fictício Farmácia de R$ 47,30.
- Início: `prints-novos/celular/inicio.png`, com Livre para gastar de R$ 107,87 por dia, saldo de R$ 3.970,30, cofrinhos de R$ 950,00 e 28 dias restantes.
- São dados inventados de conta de teste. A captura não mostra e-mail.
- Paleta petróleo `#052229`, tide `#0b2d35`, sea foam `#effffa`, teal `#1fa98d`, menta `#aeffe3` e ciano `#00a6ca`.
- Neue Machina Light e Regular. Logotipo oficial em gradiente, renderizado do SVG do projeto.

## Plano por tempo

| Tempo | Imagem e movimento | Áudio |
| --- | --- | --- |
| 0,00–1,58 s | Fundo de marca com arcos lentos. A frase de abertura entra palavra por palavra, com leve subida e duas palavras em menta. Sem sacola ou cupom visível. | Locução existente: “Uma parada na farmácia, um cupom no fundo da sacola.” |
| 1,58–3,39 s | A captura completa de Lançamentos sobe e assenta com mola curta. Uma marca lateral pulsa junto da linha Farmácia, fora da captura. | “No Grana., registre o gasto e consulte o Livre para Gastar.” |
| 3,39–3,84 s | A tela de Lançamentos sai em fade breve, deixando um intervalo visual. | Pausa da locução. |
| 3,84–5,48 s | A captura completa de Início entra. Na faixa livre acima dela, “Livre para gastar” acompanha a contagem até o valor verdadeiro de R$ 107,87. | Início da explicação do cálculo. |
| 5,48–8,52 s | Na mesma faixa externa, as etapas aparecem em sequência: “Saldo do mês”, “Cofrinhos” e “Dias que faltam, incluindo hoje”. A captura completa continua se movendo suavemente. | Saldo, cofrinhos e dias restantes. |
| 8,52–11,22 s | Captura de Início em movimento contínuo. “O restante dividido pelos dias do mês” entra fora da interface; pulsos externos apontam para a área do cálculo sem cobrir a tela. | Continuação da locução. |
| 11,22–16,20 s | A tela continua inteira, com pequenas mudanças de escala e posição e novos pulsos laterais. | Fim da locução. |
| 16,20–17,00 s | Captura sai por fade e escala curta. | Trilha original permanece. |
| 16,55–19,50 s | Logotipo oficial entra em fade e respira de forma sutil. CTA “Conheça o Grana.” | Trilha original com fade final. |

## Áudio e legenda

- Locução: arquivo local existente `locucao-r13.mp3`. Nenhuma nova geração na ElevenLabs.
- Música: faixa sintetizada localmente em 6/8 a 104 BPM, com plucks e pad. O Watchtower considera possível o risco de redistribuição, sem infração confirmada; a origem/licença da música existente permanece sem comprovação, então o uso público aguarda essa verificação. Arquivo: `flare/v3/trilha-original-r13-v3.wav`.
- Disclosure apenas no começo da legenda, não sobreposto ao vídeo: `Demonstração com dados fictícios. O cálculo considera os lançamentos registrados.`
- Arquivo da legenda: `flare/legenda-r13-v3.txt`.

## Verificação e limites

- Render local H.264, 1080×1920, 30 fps, 585 quadros, AAC estéreo, 19,5 s.
- Revisão visual feita por folha de quadros e frames em resolução original, incluindo abertura, transição entre capturas, controles completos e fecho.
- Nenhum mockup foi usado no vídeo. Uma revisão futura pode usar somente arquivos liberados individualmente por Sentinel ou entregues e validados por Prism; preservar os originais e tratar transparência e defeitos de tela separadamente.
- A fala ainda menciona o cupom na sacola, embora a cena tenha sido retirada. Não há footage, foto da nota, aviso gráfico, overlay sobre interface, conexão bancária, WhatsApp ou publicação.
- Este corte ainda precisa da revisão visual do Codex e da conferência legal final do Watchtower antes de qualquer uso público. Dia D, publicação e agendamento continuam bloqueados até build publicada e testada, com Q1–Q5 atendidos.
