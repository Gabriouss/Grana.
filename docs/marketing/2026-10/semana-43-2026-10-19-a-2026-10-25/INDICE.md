# Semana 43 (19 a 25/10/2026)

## Para aprovação

- `para-aprovacao/pecas/reels/Conheça o Granabô.mp4`: Reels de apresentação do mascote, 1080x1920, 17,6 s, v6 de 19/10/2026 (celular maior e cortado embaixo, foco no Granachat, barra de status com o cronômetro do gravador escondida sob a moldura). Montado na Editonny (HyperFrames) com narração da ElevenLabs (voz "Gabriel - Shorts & Reels", aprovada pelo autor), trilha pop local e as telas reais gravadas no celular do autor (conta de teste). Fontes da edição em `apoio/reels-granabo-v3/`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `para-aprovacao/pecas/reels/Conheça o Granabô-capa.png`: capa do Reels, 1080x1920, arquétipo A do guia de design estático (texto à esquerda, celular à direita com a resposta real do Granabô, mascote do app ao lado do texto, `assets/granabo/granabo-feliz.png`). Gerada por `apoio/ferramentas/gerar-capa-reels-granabo.py`.
- `para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês.mp4`: Reels narrado, 1080x1920, 39,8 s, v3 de 21/10/2026. Narração nova inteira no `eleven_v4` (voz "Gabriel - Shorts & Reels", take h3), com interpretação mais humana, sem esticar o áudio, pausas de no máximo 0,3 s entre as funções e a tela trocando junto com a frase de cada função; fechamento "Assim… o fim do mês deixa de ser surpresa.". Tempos da cena gerados da transcrição por `apoio/reels-fim-do-mes/montar-v3.py` (`tempos-v3.json`). Trilha própria refeita com 39,8 s, −14 LUFS. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-v2.mp4`: v2, 46 s, substituída pela v3 (autor: "ficou lento demais", "A palavra Mês saiu cortada", "tá muito robótica").
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-v1.mp4`: v1, 33,2 s, substituída pela v2 em 21/10/2026 (autor: "Não gostei da entonação desse (começa pelo próximo gasto)").
- `para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês-capa.png`: capa do Reels, 1080x1920, v2 de 21/10/2026, no estilo da referência enviada pelo autor e adaptada ao Grana.: arquétipo E, jeito 3, do guia de design estático (título centrado, cartões reais do app soltos e inclinados: Cartão Principal com a barra do limite, Livre para gastar e o resumo de Entradas, Saídas e Saldo, mais a linha da Farmácia como etiqueta). Gerada por `apoio/ferramentas/gerar-capa-reels-fim-do-mes.py` a partir dos quadros das gravações da conta de teste. **Aprovada pelo autor em 21/10/2026** ("Capa aprovada."); fica ao lado do vídeo, que ainda aguarda aceite, para o painel manter o par.
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-capa-v1-recusada.png`: capa v1 (arquétipo C, celular com a lista de Lançamentos), recusada pelo autor em 21/10/2026: "Não gostei dessa capa".

## Observações da produção

- As gravações mantêm o cronômetro do gravador, o teclado e o aviso de colar, por decisão do autor.
- Títulos entram palavra por palavra no tempo da narração; zoom só no aparelho inteiro, nunca dentro da tela.
- Música baixa sob a narração e "plim" quando o lançamento é confirmado.

## Aceites registrados no painel local

Cada linha registra o aceite explícito do autor dado no painel local, para a versão indicada. Versão diferente precisa de novo aceite.

- 19/10/2026 23:21 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Conheça o Granabô.mp4`, versão `42700d9bd3e0`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.
- 19/10/2026 23:22 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Conheça o Granabô-capa.png`, versão `2426e9ffd167`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

## Destaques do perfil (21/10/2026)

Pedido do autor em 21/10/2026: refazer os quatro destaques de um perfil de outro app de finanças (Conheça, Recursos, Planos, Segurança) adaptados às funções do Grana., no sistema visual dele. Da referência ficou só a sequência dos stories; o texto foi reescrito na voz do Grana. (`design-system/TOM_DE_VOZ.md`), a pedido do autor: "Não copie o texto, reestruture para a nossa comunicação verbal o formato deles". As capturas da referência ficam só em `E:/Grana-temporarios/clone-destaques-fluxo/` (M1) e não vão para o git, por serem arte de terceiros num repositório público (regra 15).

- `para-aprovacao/pecas/destaques/Destaque Conheça-1..6.png`, `Destaque Recursos-1..6.png`, `Destaque Planos-1..5.png`, `Destaque Segurança-1..5.png`: Stories 1080x1920. Cada story alterna tema escuro e claro, começando pelo escuro (autor). Sem o G no fundo (autor). A linha de luz da referência é o gradiente oficial `#b0f7c9 → #22a1c1`. Mistura de celular em mockup (tela real por homografia) e cartões recortados de print real (arquétipo E do guia de design estático). Telas dos quadros das gravações do celular do autor de 19/10/2026 (conta de teste, dado fictício). Preços da nota "Preço Vigente e Parcelamento - Cakto" (R$ 9,90/mês, R$ 97,90/ano, economia de R$ 20,90, 7 dias de garantia, Pix ou cartão), liberados pelo autor nesta peça. Segurança sem nenhuma menção a banco (autor: "proibido"); só proteções que existem no Perfil.
- `para-aprovacao/pecas/destaques/Capas dos destaques-1..4.png`: capas 1080x1920 (Conheça, Recursos, Planos, Segurança), com o símbolo da marca e os ícones do arsenal (`voz`, `dinheiro`, `seguranca`), centrados para o recorte circular do Instagram.
- Gerador: `apoio/ferramentas/gerar-destaques.py` (`python -I gerar-destaques.py <pasta-dos-quadros> <saida>`). Legendas em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- Diferenças em relação ao guia de feed 3:4, por ser Story: H1 em 88 px (o guia de feed usa 72), sem os rótulos FÁCIL/PRÁTICO embaixo, porque a parte de baixo do Story é da interface do Instagram.
