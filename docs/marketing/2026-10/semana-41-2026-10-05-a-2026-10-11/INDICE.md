# Semana 41 · 2026-10-05 a 2026-10-11

Mês-pai 2026-10: a quinta-feira é 2026-10-08. Semana aberta em 07/10/2026, na reconciliação do material trazido pela M2 (commits `e6a1275` a `56f9822`). A data-base do pedido de gravação é a do nome dele, 2026-10-08.

## Peças e estado

Série de quatro estáticos de feed 1080×1440, montada pelo autor no Photoshop e exportada em 11/10/2026 (data de produção: data dos arquivos exportados, sem publicação prevista registrada). Chegaram em `Criativos Photoshop/Criativos-assets/` na raiz do repositório e foram movidos para cá em 11/10/2026, com o nome original preservado. O arquivo-fonte `Criativos.psb` (50 MB) ficou fora desta árvore, em `Criativos Photoshop/`.

| Peça | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [O café, o dellivery_.png](aprovados/O%20caf%C3%A9%2C%20o%20dellivery_.png) | Photoshop, aprovado | Aceite do autor no painel local em 11/10/2026 23:07:05 (-03:00), versão `386a6fec7528`; registro em `docs/marketing/painel/aprovacoes.json` | Revisão de 11/10: sem problema de conteúdo; o nome do arquivo tem "dellivery", a arte está certa |
| [O mês que vem_.png](aprovados/O%20m%C3%AAs%20que%20vem%20j%C3%A1%20come%C3%A7ou%20nas%20parcelas%20desse%20m%C3%AAs.png) | Photoshop, aprovado | Aceite do autor no painel local em 11/10/2026 23:06:56 (-03:00), versão `5a7282e4cfc3`; registro em `docs/marketing/painel/aprovacoes.json` | Revisão de 11/10: print do notebook ilegível no tamanho final |
| [Organize no computador.png](aprovados/Organize%20no%20computador,%20acompanhe%20pelo%20celular.png) | Photoshop, aprovado | Aceite do autor no painel local em 11/10/2026 23:06:42 (-03:00), versão `96c7b4bfbc87`; registro em `docs/marketing/painel/aprovacoes.json` | Revisão de 11/10: print do notebook pequeno, o do celular carrega a mensagem |
| [Salário caiu_.png](aprovados/Sal%C3%A1rio%20caiu.png) | Photoshop, aprovado | Aceite do autor no painel local em 11/10/2026 23:06:25 (-03:00), versão `a942620f8f9e`; registro em `docs/marketing/painel/aprovacoes.json` | Versão 2, reexportada pelo autor às 22:35 de 11/10/2026 por cima da versão 1 (22:28): o selo "O Grana. te ajuda!" perdeu o contorno e virou texto menta. A versão 1 não foi guardada em historico porque foi sobrescrita na origem. Revisão de 11/10: o print continua mostrando "Contas a vencer este mês", linha que saiu do app em 25/09 (regra 20); precisa de print novo |

Capas de Reel 1080×1920 geradas em 11/10/2026, a pedido do autor, com o sistema do guia de design (área segura 1080×1440 no centro, que é o recorte da grade). Geradas por [gerar-capas-reels.py](apoio/ferramentas/gerar-capas-reels.py); telas do aparelho renderizadas do próprio motion `docs/marketing/motion-desistiu/index.html`, guardadas em `apoio/capturas-fonte/`.

| Peça | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| [grana-reels-v8-pop-capa-1080x1920.png](aprovados/Fala o gasto, pronto-capa.png) | Capa do Reel `2026-09/semana-39-.../para-aprovacao/pecas/reels/grana-reels-v8-pop.mp4`; aprovada | Pedido do autor em 11/10. Aceite do autor no painel local em 11/10/2026 23:20:41 (-03:00), versão `19d81da7338b`; registro em `docs/marketing/painel/aprovacoes.json` | Arquétipo C; tela de voz com "Pão na padaria" a 7,4 s do motion. O widget de voz é só Android (inventário da semana 40) |
| [grana-motion-desistiu-foto-da-nota-capa-1080x1920.png](aprovados/Já desistiu de controlar seus gastos-capa.png) | Capa do Reel `2026-09/semana-39-.../aprovados/pecas/reels/grana-motion-desistiu-foto-da-nota.mp4`; aprovada. A capa anterior (`...-capa.png`, "Capa não aceita" no painel) não foi tocada | Pedido do autor em 11/10. Aceite do autor no painel local em 11/10/2026 23:20:52 (-03:00), versão `6462e08da201`; registro em `docs/marketing/painel/aprovacoes.json` | Arquétipo A; tela "Nota fiscal lida" a 11,4 s do motion |

Aceite não é publicação: nenhuma das seis foi publicada.

O Reels de apresentação do Granabô (roteiro, scripts e prévia) está em produção na M2 e continua em `docs/marketing/reels-granabo/` e `docs/marketing/roteiro-reels-granabo-apresentacao.md`, fora das pastas por semana, até a M2 fechar a produção e o autor decidir a classificação. Prévia não é aceite do autor.

## Apoio

| Material | Fonte e status | Responsável / evidência | QA / publicação |
|---|---|---|---|
| Gerador das capas de Reel e telas-fonte | [gerar-capas-reels.py](apoio/ferramentas/gerar-capas-reels.py) e `apoio/capturas-fonte/tela-*.png` | Ferramenta desta sessão; roda com `python -I gerar-capas-reels.py <saída>` | Não se aplica |
| Guia de design dos estáticos de feed 3:4 | [guia-de-design-estatico-feed-3x4.md](apoio/referencias/guia-de-design-estatico-feed-3x4.md), medido nos quatro PNGs acima e no `Criativos.psb` em 11/10/2026 | Referência de estilo para as próximas peças; não é aceite | Não se aplica |
| Pedido de gravação do Reels de apresentação do Granabô | [2026-10-08-gravar-granabo-reels-apresentacao.md](apoio/briefings/solicitacoes/2026-10-08-gravar-granabo-reels-apresentacao.md), vindo de `docs/marketing/solicitacoes/` na M2 | Responsável não registrado; pedido de gravação à M1 | Briefing; gravação não conferida nesta reconciliação |

## Pastas de status

- aprovados: os quatro estáticos e as duas capas de Reel acima, promovidos pelo painel em 11/10/2026.
- para-aprovacao e historico: vazias; .gitkeep mantém as pastas no Git.
- apoio: o guia de design, o gerador das capas com as telas-fonte e o pedido de gravação acima.

## Aceites registrados no painel local

Cada linha registra o aceite explícito do autor dado no painel local, para a versão indicada. Versão diferente precisa de novo aceite.

- 11/10/2026 23:06 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/Salário caiu_.png`, versão `a942620f8f9e`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

<!-- promocao:f749dd027cd74f27:a942620f8f9e6ee1cc149b1f5615eb37ca87cf90 -->
- Promoção 2026-10-11T23:06:33-03:00: [peça em aprovados](aprovados/Salário caiu.png); aceite do autor em 2026-10-11T23:06:25-03:00, versão `a942620f8f9e6ee1cc149b1f5615eb37ca87cf90`. Origem `docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/Salário caiu_.png`. Nada publicado ou agendado.
- 11/10/2026 23:06 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/Organize no computador.png`, versão `96c7b4bfbc87`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

<!-- promocao:3128ff5fb6809313:96c7b4bfbc87b1eebf77e035620e89d4b5dc95b0 -->
- Promoção 2026-10-11T23:06:48-03:00: [peça em aprovados](aprovados/Organize no computador, acompanhe pelo celular.png); aceite do autor em 2026-10-11T23:06:42-03:00, versão `96c7b4bfbc87b1eebf77e035620e89d4b5dc95b0`. Origem `docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/Organize no computador.png`. Nada publicado ou agendado.
- 11/10/2026 23:06 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/O mês que vem_.png`, versão `5a7282e4cfc3`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

<!-- promocao:5f48c03ee755a609:5a7282e4cfc379989402b95719853ac82d8b4ca2 -->
- Promoção 2026-10-11T23:06:59-03:00: [peça em aprovados](aprovados/O mês que vem já começou nas parcelas desse mês.png); aceite do autor em 2026-10-11T23:06:56-03:00, versão `5a7282e4cfc379989402b95719853ac82d8b4ca2`. Origem `docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/O mês que vem_.png`. Nada publicado ou agendado.
- 11/10/2026 23:07 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/O café, o dellivery_.png`, versão `386a6fec7528`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

<!-- promocao:c95083585b35a0ac:386a6fec7528bf32add0a11e57489decb008bf55 -->
- Promoção 2026-10-11T23:07:08-03:00: [peça em aprovados](aprovados/O café, o delivery, a corrida.png); aceite do autor em 2026-10-11T23:07:05-03:00, versão `386a6fec7528bf32add0a11e57489decb008bf55`. Origem `docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/O café, o dellivery_.png`. Nada publicado ou agendado.
- 11/10/2026 23:20 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/grana-reels-v8-pop-capa-1080x1920.png`, versão `19d81da7338b`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

<!-- promocao:82fc284c380b2a52:19d81da7338b2f6c500ddda3447a07901f1b5548 -->
- Promoção 2026-10-11T23:20:47-03:00: [peça em aprovados](aprovados/Fala o gasto, pronto-capa.png); aceite do autor em 2026-10-11T23:20:41-03:00, versão `19d81da7338b2f6c500ddda3447a07901f1b5548`. Origem `docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/grana-reels-v8-pop-capa-1080x1920.png`. Nada publicado ou agendado.
- 11/10/2026 23:20 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/grana-motion-desistiu-foto-da-nota-capa-1080x1920.png`, versão `6462e08da201`. Registro em `docs/marketing/painel/aprovacoes.json`. Aceite não é publicação.

<!-- promocao:9194a5418231c082:6462e08da2012204e5ef89d794451a576fc6bdf0 -->
- Promoção 2026-10-11T23:20:56-03:00: [peça em aprovados](aprovados/Já desistiu de controlar seus gastos-capa.png); aceite do autor em 2026-10-11T23:20:52-03:00, versão `6462e08da2012204e5ef89d794451a576fc6bdf0`. Origem `docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/grana-motion-desistiu-foto-da-nota-capa-1080x1920.png`. Nada publicado ou agendado.

## Vínculo das capas (registro de famílias, 14/10/2026)

- `aprovados/Fala o gasto, pronto-capa.png` passa a ser a capa do Reel vigente da família `R-P`, `2026-10/semana-42-2026-10-12-a-2026-10-18/aprovados/pecas/reels/grana-reels-notificacao-1.mp4`, por decisão do autor em 13/10/2026 (foi a capa usada na publicação de 12/10). O v8-pop é revisão superada.
- `aprovados/Já desistiu de controlar seus gastos-capa.png` fica vinculada a `2026-09/semana-39-2026-09-21-a-2026-09-27/aprovados/pecas/reels/grana-motion-desistiu-foto-da-nota.mp4`, como diz a tabela acima.
- Os dois vínculos estão em `docs/marketing/painel/familias.json` (`capas`); a capa vinculada não aparece como post no Feed simulado.
- 19/10/2026 00:20 (-03:00): aceite pelo autor no painel local. Peça `aprovados/Já desistiu de controlar seus gastos-capa.png`, versão `7761e586731d`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.
- 19/10/2026 10:55 (-03:00): aceite pelo autor no painel local. Peça `aprovados/Salário caiu.png`, versão `e4e6521a2bb4`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.
- 19/10/2026 10:57 (-03:00): aceite pelo autor no painel local. Peça `aprovados/O mês que vem já começou nas parcelas desse mês.png`, versão `8798b177d3b4`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.
- 19/10/2026 11:00 (-03:00): aceite pelo autor no painel local. Peça `aprovados/Fala o gasto, pronto-capa.png`, versão `2823aafda252`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.
