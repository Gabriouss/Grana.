# Semana 43 (19 a 25/10/2026)

## Para aprovação

- `aprovados/pecas/reels/Conheça o Granabô.mp4`: Reels de apresentação do mascote, 1080x1920, 17,6 s, v6 de 19/10/2026 (celular maior e cortado embaixo, foco no Granachat, barra de status com o cronômetro do gravador escondida sob a moldura). Montado na Editonny (HyperFrames) com narração da ElevenLabs (voz "Gabriel - Shorts & Reels", aprovada pelo autor), trilha pop local e as telas reais gravadas no celular do autor (conta de teste). Fontes da edição em `apoio/reels-granabo-v3/`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`. **Publicado** no Instagram em 21/10/2026 (`instagram.com/reel/Dewa5lIDokR`), vínculo em `painel/publicados.json`. Ficou parado em `para-aprovacao` depois do aceite de 19/10 e só foi promovido em 21/10/2026 20:30, junto com a resolução das duplicações.
- `para-aprovacao/pecas/reels/Conheça o Granabô-capa.png`: capa do Reels, 1080x1920, arquétipo A do guia de design estático (texto à esquerda, celular à direita com a resposta real do Granabô, mascote do app ao lado do texto, `assets/granabo/granabo-feliz.png`). Gerada por `apoio/ferramentas/gerar-capa-reels-granabo.py`.
- `aprovados/pecas/reels/Pra onde foi o dinheiro do mês.mp4`: Reels narrado, 1080x1920, 39,8 s, **v4 de 21/10/2026, aprovada pelo autor em 21/10/2026 20:17** e promovida às 20:30. Mesma narração, trilha e capa da v3 aprovada; muda só a sincronia, que o autor estranhou ("estou com a impressão que este vídeo está com o áudio dessincronizado", "Eu não quero gambiarra", "não vou regravar nada, resolve isso aí"). Medido na v3: o áudio não tinha deriva (107 palavras no tempo, trocas de tela no quadro); o descompasso vinha de quatro pontos, todos corrigidos: "e" e "Um" entravam 0,5 s antes da fala (início da palavra agora conferido contra os silêncios medidos); a frase anterior ficava na tela quando a seguinte entrava; "Transcrevendo…" aparecia depois de "por você" (agora "Ouvindo…" acende em "Fala" e "Transcrevendo…" em "escreve"); e no Pix o plim tocava com a janela de colar aberta (agora menu "Colar" em "Cola", texto em "comprovante", formulário e plim em "Valor,"). Tempos em `apoio/reels-fim-do-mes/montar-v4.py` e `tempos-v4.json`; `preparar.py` lê as batidas de lá. Áudio em −14,0 LUFS. Não mostra o lançamento salvo por voz: nenhuma gravação de 19/10 chega até ele (a de voz termina com o Expo Go recarregando), e o autor decidiu não regravar. A data de 23/10/2026 às 09:00 (reels), marcada para a v3, passou para a v4.
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-v3.mp4`: v3, 39,8 s, aprovada em 21/10/2026 02:04 e substituída pela v4 no aceite do autor de 21/10/2026 20:17. Saiu de `aprovados` porque a v4 tinha o mesmo nome e o painel recusava a promoção ("A movimentação para aprovados não foi confirmada": destino já existente).
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-v2.mp4`: v2, 46 s, substituída pela v3 (autor: "ficou lento demais", "A palavra Mês saiu cortada", "tá muito robótica").
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-v1.mp4`: v1, 33,2 s, substituída pela v2 em 21/10/2026 (autor: "Não gostei da entonação desse (começa pelo próximo gasto)").
- `para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês-capa.png`: capa do Reels, 1080x1920, v2 de 21/10/2026, no estilo da referência enviada pelo autor e adaptada ao Grana.: arquétipo E, jeito 3, do guia de design estático (título centrado, cartões reais do app soltos e inclinados: Cartão Principal com a barra do limite, Livre para gastar e o resumo de Entradas, Saídas e Saldo, mais a linha da Farmácia como etiqueta). Gerada por `apoio/ferramentas/gerar-capa-reels-fim-do-mes.py` a partir dos quadros das gravações da conta de teste. **Aprovada pelo autor em 21/10/2026** ("Capa aprovada."); fica ao lado do vídeo, que ainda aguarda aceite, para o painel manter o par.
- `aprovados/pecas/reels/Antes de parcelar veja a fatura.mp4`: Reels do gancho 10 (R3), 1080x1920, 25,9 s, 30 fps, −14 LUFS, **v4 de 24/10/2026, aprovada pelo autor em 24/10/2026** ("Agora simmmm, meu parceiro. O vídeo está ok", dito ao Orquestrador Supremo; registro no painel ainda não feito). Nada publicado ou agendado. A v4 congela o carrossel "Cofrinhos e metas" da Início (a tela usa o primeiro quadro parado); o resto é idêntico à v2, inclusive os recortes que saltam da tela (autor: "Não é para tirar os recortes, apenas quero que o seletor das caixinhas fique parado na tela do celular"). Sem apresentador, por pedido dele ("Faz esse vídeo sem apresentador, por enquanto"), com botão "Saiba mais" desenhado (decisão C25). Narração da ElevenLabs (voz "Gabriel - Shorts & Reels"), trilha local, telas reais das gravações de 19/10 (conta de teste, avatar desfocado). Fonte da edição em `E:\Grana-temporarios\2026-10-23-reels-ganchos\edicao-r3\` (fora do repositório). Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `historico/pecas/reels/Antes de parcelar veja a fatura-capa.png`: capa do Reels, 1080x1920, **não aprovada**. Esteve em `aprovados` porque se presumiu que seguia o par do vídeo aprovado; saiu em 24/10/2026 (autor: "essa capa aí do reels não está aprovada. Vou fazer outra manualmente"). H1 "Antes de parcelar" e H2 "Olhe a fatura primeiro.", print de `credito`, gerada por `E:\Grana-temporarios\2026-10-23-reels-ganchos\capas\_fonte\gerar-capas-ganchos.py` a partir do guia de design estático.
- `para-aprovacao/pecas/reels/Antes de parcelar veja a fatura v5.mp4`: v5 do R3, 1080x1920, 25,9 s, 30 fps, −14,0 LUFS, de 24/10/2026, pedida pelo autor ("reedita o vídeo que produzimos ontem, atualizando ele com os efeitos novos aprendidos" e "atualiza essa música aí de fundo também, tá muito repetitiva já"). **A v4 continua a aprovada**; o nome tem "v5" para o painel não confundir com ela (`ajustes.md`). Roteiro, narração, telas e cortes iguais aos da v4. Mudanças: split-flap nos valores das parcelas (2,57 a 5,03 s), recortes subindo com ultrapassagem (`back.out(1.7)`, 0,32 s) e seta do CTA desenhada por traço (22,3 s), da biblioteca de efeitos da skill `meu-editor-de-video`; trilha nova local (`trilhas/reel-antes-de-parcelar-veja-a-fatura-trilha-v2.wav`, groove quebrado em ré menor, seções A, quebra, B e CTA, −24 LUFS) com a mesma mixagem da v4. Fonte em `E:\Grana-temporarios\2026-10-23-reels-ganchos\edicao-r3\` (`r3-v5.template.html`, `gerar_cena_v5.py`, `preparar_v5.py`). Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md` (a mesma da v4).
- Capa da v5: **nenhuma por enquanto.** O autor vai fazer a capa à mão (24/10/2026: "essa capa aí do reels não está aprovada. Vou fazer outra manualmente"). A cópia da capa da v4, posta aqui primeiro, saiu de `para-aprovacao` e ficou fora do repositório, em `E:\Grana-temporarios\2026-10-23-reels-ganchos\edicao-r3\v5\`.
- `historico/pecas/reels/Antes de parcelar veja a fatura-v2.mp4`: v2 do R3, 25,9 s, substituída pela v4 em 24/10/2026 (autor: "Não gostei dessa cena que mostra as caixinhas se movimentando ali na tela do celular. Isso tira o foco do espectador do que realmente estamos querendo falar").
- `historico/pecas/reels/Pra onde foi o dinheiro do mês-capa-v1-recusada.png`: capa v1 (arquétipo C, celular com a lista de Lançamentos), recusada pelo autor em 21/10/2026: "Não gostei dessa capa".
- `para-aprovacao/pecas/reels/Quanto pode gastar hoje.mp4`: Reels 1 da série espelho Tino (`1110099611986610`), 1080x1920, 21,5 s, 30 fps, −14,0 LUFS, de 24/10/2026. Gancho "Você sabe quanto pode gastar hoje?", pílula split-flap (`R$ 719,81 /dia`), dor em cascata com salário e gastos reais da conta de teste (`lancamentos.mp4`), celular 3D com `metas-cofrinhos.mp4` congelado no Início, `colar-pix.mp4` (4,0 a 6,28 s, barra do teclado desfocada) e `lancar-por-voz.mp4` ("ou falando o gasto", opção b do autor), trilha autoral quebrada em lá menor (104 BPM) e narração ElevenLabs `eleven_v4`. Fonte da edição em `E:\Grana-temporarios\2026-10-24-tino-videos\trabalho\v1\`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `para-aprovacao/pecas/reels/Fatura e parcelas.mp4`: Reels 2 da série espelho Tino (`1465850514772936`), 1080x1920, 21,3 s, 30 fps, −14,0 LUFS, de 24/10/2026. Gancho "Pequenas parcelas, uma grande fatura.", pílula split-flap (`Total das faturas R$ 722,85`), dor com os 4 lançamentos reais de `credito.mp4` (`Fone de ouvido 1/3 R$ 120,00`, `Jantar com amigos R$ 112,00`, `Livraria R$ 74,90`, `Notebook de trabalho 1/3 R$ 415,95`), celular 3D com `credito.mp4` e `metas-cofrinhos.mp4` congelado no Início, trilha autoral meia-batida em ré menor (96 BPM) e narração ElevenLabs `eleven_v4`. Fonte da edição em `E:\Grana-temporarios\2026-10-24-tino-videos\trabalho\v2\`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `para-aprovacao/pecas/reels/Metas e cofrinhos.mp4`: Reels 3 da série espelho Tino (`1766432494580047`), 1080x1920, 21,9 s, 30 fps, −14,0 LUFS, de 24/10/2026. Gancho "Qual é a sua próxima meta?", pílula split-flap (`Guardado do mês em cofrinhos R$ 643,27`), dor com os 3 cofrinhos reais (`Viagem de fim de ano`, `Reserva de emergência`, `Reserva para imprevistos`), celular 3D com `metas-cofrinhos.mp4` (carrossel deslizando apenas durante o recorte dos cofrinhos e congelado fora dele) e `desafios.mp4` (`Mural de conquistas`), trilha autoral house em fá maior (110 BPM) e narração ElevenLabs `eleven_v4`. Fonte da edição em `E:\Grana-temporarios\2026-10-24-tino-videos\trabalho\v3\`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `para-aprovacao/pecas/reels/Compra por impulso.mp4`: Reels 4 da série espelho Tino (`1124385473501892`), 1080x1920, 22,5 s, 30 fps, −14,0 LUFS, de 24/10/2026. Gancho "Antes de comprar por impulso, faça uma pergunta:", balão "Cabe no meu mês?", pílula split-flap (`R$ 716,73 /dia`), celular 3D com `granachat-consulta.mp4` (Início congelado, abertura do chat, digitação acelerada 6,5×, espera do "pensando" cortada e resposta do Granabô separando débito e crédito, com avatar desfocado), trilha autoral meia-batida em sol menor (100 BPM) e narração ElevenLabs `eleven_v4`. Fonte da edição em `E:\Grana-temporarios\2026-10-24-tino-videos\trabalho\v4\`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- `para-aprovacao/pecas/reels/Comprometimento futuro.mp4`: Reels 5 da série espelho Tino (`39427990943483159`), 1080x1920, 21,4 s, 30 fps, −14,0 LUFS, de 24/10/2026. Gancho "Você sabe quanto do seu dinheiro já está comprometido nos próximos meses?", gráfico de barras (`Out` a `Mar`) e pílula split-flap com o total real da tela (`R$ 10.050,75`), celular 3D com `contas-a-pagar.mp4`, `credito.mp4` e `metas-cofrinhos.mp4` enquadrado no gráfico de `Comprometimento futuro`, trilha autoral quebrada em dó menor (92 BPM) e narração ElevenLabs `eleven_v4`. Fonte da edição em `E:\Grana-temporarios\2026-10-24-tino-videos\trabalho\v5\`. Legenda em `para-aprovacao/pecas/COPYS-FINAIS.md`.
- Capas dos 5 Reels da série Tino: **nenhuma gerada automaticamente**, conforme decisão do autor em 24/10/2026 ("essa capa aí do reels não está aprovada. Vou fazer outra manualmente").

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
- 21/10/2026 02:04 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês.mp4`, versão `07023b1b1920`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:46be59a4a563ac69:07023b1b1920c43b58bb5e2e8bc0a9b83526c218 -->
- Promoção 2026-10-21T09:52:56-03:00: [peça em aprovados](aprovados/pecas/reels/Pra onde foi o dinheiro do mês.mp4); aceite do autor em 2026-10-21T02:04:02-03:00, versão `07023b1b1920c43b58bb5e2e8bc0a9b83526c218`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês.mp4`. Nada publicado ou agendado.
- 21/10/2026 20:17 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês.mp4`, versão `9fb224f2ec74`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:46be59a4a563ac69:9fb224f2ec743942bc0608196086207e52b50028 -->
- Promoção 2026-10-21T20:30:33-03:00: [peça em aprovados](aprovados/pecas/reels/Pra onde foi o dinheiro do mês.mp4); aceite do autor em 2026-10-21T20:17:44-03:00, versão `9fb224f2ec743942bc0608196086207e52b50028`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Pra onde foi o dinheiro do mês.mp4`. Nada publicado ou agendado.

<!-- promocao:23894a0cb1724e68:42700d9bd3e0ee65d0b1e921d3290a60f6f307fd -->
- Promoção 2026-10-21T20:30:35-03:00: [peça em aprovados](aprovados/pecas/reels/Conheça o Granabô.mp4); aceite do autor em 2026-10-19T23:21:49-03:00, versão `42700d9bd3e0ee65d0b1e921d3290a60f6f307fd`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Conheça o Granabô.mp4`. Nada publicado ou agendado.
- 23/10/2026 11:02 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/destaques/capas dos destaques-*`, versão `a46b162971f6`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:e3ca88bb6a382562:a46b162971f624200451956ac643e8b4cf402755 -->
- Promoção 2026-10-23T11:02:59-03:00: [peça em aprovados](aprovados/pecas/destaques/Capas dos destaques-1.png); aceite do autor em 2026-10-23T11:02:58-03:00, versão `a46b162971f624200451956ac643e8b4cf402755`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/destaques/capas dos destaques-*`. Nada publicado ou agendado.


<!-- ph-fatura-reedicao-v2:start -->
## Fatura e parcelas: reedição v2 (25/10/2026)

- [Vídeo para aprovação](para-aprovacao/pecas/reels/Fatura%20e%20parcelas%20-%20reedicao%20v2.mp4): nova montagem Codex PH com meu-editor-de-video/Motion Supremo, por pedido direto do autor. Original preservado; nenhum aceite, agendamento ou publicação executados.
- Voz do take1 bruto existente, sem alterar velocidade; gancho reorganizado, compras maiores, valores reais revelados sem sorteio, pausas menores e nova trilha local.20,29s/1080x1920/30fps/AAC48kHz estéreo.
- QA: quality gate passed, −13,99LUFS, zero quadro preto, movimento nas5etapas; [receita, folha e limites](apoio/reels-fatura-reedicao-v2/README.md). OCR indisponível; escuta final e aprovação estética pendentes do autor. Legenda em COPYS-FINAIS.md; nenhuma capa produzida.
<!-- ph-fatura-reedicao-v2:end -->
<!-- fatura-reedicao-v3:start -->
## Fatura e parcelas: reedição v3, estilo novo (25/10/2026)

- [Vídeo para aprovação](aprovados/pecas/reels/Fatura%20e%20parcelas%20-%20reedicao%20v3.mp4): estilo totalmente novo pedido pelo autor, sem moldura realista nem gravação de tela; cards do app em HTML com dados reais da conta de teste, celular estilizado em 3D, texto cinético e transições em chicote. Original e v2 preservados; nenhum aceite, agendamento ou publicação.
- Voz original inteira em t=0, trilha V2 electro 124 BPM (local) e SFX locais. 19,75 s, 1080x1920, 60 fps com motion blur, AAC 48 kHz estéreo, −14,05 LUFS.
- QA e limites em [apoio/reels-fatura-reedicao-v3](apoio/reels-fatura-reedicao-v3/README.md). Legenda em COPYS-FINAIS.md. Escuta e aprovação estética com o autor.
<!-- fatura-reedicao-v3:end -->

<!-- serie-reedicao-v3:start -->
## Série no estilo do Fatura v3 (25/10/2026)

Mesmo pipeline do Fatura v3 (HTML/GSAP, dados reais da conta de teste, 60 fps), celular com moldura metálica realista e assinatura própria em cada vídeo. Metade em tema claro, medido do criativo do autor: [guia do tema claro](apoio/referencias/guia-de-estilo-reels-tema-claro.md). Receita e varreduras em [apoio/reels-serie-reedicao-v3](apoio/reels-serie-reedicao-v3/). Nenhum aceite, agendamento ou publicação.

- [Quanto pode gastar hoje - reedicao v3](aprovados/pecas/reels/Quanto%20pode%20gastar%20hoje%20-%20reedicao%20v3.mp4): tema claro, assinatura "elevador". 19,8 s.
- [Metas e cofrinhos - reedicao v3](aprovados/pecas/reels/Metas%20e%20cofrinhos%20-%20reedicao%20v3.mp4): tema claro, cofrinhos em órbita, íris, mural montado em blocos. 20,2 s.
- [Compra por impulso - reedicao v3](aprovados/pecas/reels/Compra%20por%20impulso%20-%20reedicao%20v3.mp4): tema escuro, assinatura "freada", chat do Granabô com débito e crédito separados. 20,6 s.
- [Comprometimento futuro - reedicao v3](aprovados/pecas/reels/Comprometimento%20futuro%20-%20reedicao%20v3.mp4): tema escuro, túnel dos seis meses, total em placa de aeroporto. 19,7 s.
- Capas 1080x1920 dos cinco (`<vídeo>-capa.png`, pareadas pelo nome): mesmo visual dos vídeos, claras para os claros e escuras para os escuros, com blocos do app feitos em HTML e dados reais, sem aparelho e sem print (pedido do autor em 25/10). Gerador `capa.html`/`capa.js`/`capas.py` no apoio da série, com checagem automática de margem.
- Legendas em COPYS-FINAIS.md. Pendências do autor: logotipo petróleo no tema claro (regra 23 pede gradiente), Ultrabold em vídeo, celular CSS 3D e 60 fps.
<!-- serie-reedicao-v3:end -->

<!-- recusa:ea7002a2e79f96e4:3f386bf883a621c20479cb509aef8aeeff34fc13 -->
- Recusa do autor em 2026-10-25T14:20:23-03:00: [peca em historico](historico/pecas/reels/Antes de parcelar veja a fatura v5.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:10c766f320a78252:e80cad3a4d3289768c237cf003ed595c1c15f604 -->
- Recusa do autor em 2026-10-25T14:20:40-03:00: [peca em historico](historico/pecas/reels/Compra por impulso.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:dec8f66f3644f0eb:d8927759a44aa23da73c5819c97bfd60f1ef39ac -->
- Recusa do autor em 2026-10-25T14:20:50-03:00: [peca em historico](historico/pecas/reels/Comprometimento futuro.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:bfdd69c22fef38ce:3849f6869e6348a65ccca81d32f533653b3c1025 -->
- Recusa do autor em 2026-10-25T14:20:57-03:00: [peca em historico](historico/pecas/reels/Fatura e parcelas - reedicao v2.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:26b0ee652f71db1d:e4bc2954a9b5bcbc9bb75eb77a3754cebf212207 -->
- Recusa do autor em 2026-10-25T14:21:05-03:00: [peca em historico](historico/pecas/reels/Fatura e parcelas.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:53df01a942059996:d3f1d5b598ea3b89b875d7586d6776c5fdf28b80 -->
- Recusa do autor em 2026-10-25T14:21:12-03:00: [peca em historico](historico/pecas/reels/Metas e cofrinhos.mp4). Motivo registrado no painel; nada publicado ou agendado.

<!-- recusa:7524007aae41be01:9810928ad2cb620d1dff02a821e6bdf8085496fe -->
- Recusa do autor em 2026-10-25T14:21:21-03:00: [peca em historico](historico/pecas/reels/Quanto pode gastar hoje.mp4). Motivo registrado no painel; nada publicado ou agendado.
- 25/10/2026 14:35 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Comprometimento futuro - reedicao v3.mp4`, versão `a5abfba1268d`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.
- 25/10/2026 14:35 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Comprometimento futuro - reedicao v3-capa.png`, versão `ab8205c96fb5`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:b550bfb7f1f461d6:a5abfba1268d7d786ce8bb004fbc3a5ce344e7ec -->
- Promoção 2026-10-25T14:46:22-03:00: [peça em aprovados](aprovados/pecas/reels/Comprometimento futuro - reedicao v3.mp4); aceite do autor em 2026-10-25T14:35:13-03:00, versão `a5abfba1268d7d786ce8bb004fbc3a5ce344e7ec`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Comprometimento futuro - reedicao v3.mp4`. Nada publicado ou agendado.
- 26/10/2026 09:27 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Compra por impulso - reedicao v3.mp4`, versão `cdc08d5ba1db`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:0e9235b1b8c36678:cdc08d5ba1dba25c589db6e7c73c0c2cc1a0da07 -->
- Promoção 2026-10-26T09:27:23-03:00: [peça em aprovados](aprovados/pecas/reels/Compra por impulso - reedicao v3.mp4); aceite do autor em 2026-10-26T09:27:21-03:00, versão `cdc08d5ba1dba25c589db6e7c73c0c2cc1a0da07`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Compra por impulso - reedicao v3.mp4`. Nada publicado ou agendado.
- 26/10/2026 09:28 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Fatura e parcelas - reedicao v3.mp4`, versão `a4c35bd50cd7`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:318402f8d7eba68c:a4c35bd50cd7b883516c074dbbd6336c29327ecb -->
- Promoção 2026-10-26T09:28:04-03:00: [peça em aprovados](aprovados/pecas/reels/Fatura e parcelas - reedicao v3.mp4); aceite do autor em 2026-10-26T09:28:03-03:00, versão `a4c35bd50cd7b883516c074dbbd6336c29327ecb`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Fatura e parcelas - reedicao v3.mp4`. Nada publicado ou agendado.
- 26/10/2026 09:28 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Metas e cofrinhos - reedicao v3.mp4`, versão `41dd6374df68`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:cbb5aa48c81a51c1:41dd6374df68c5673ae6dc36563dcb8dd5870bc3 -->
- Promoção 2026-10-26T09:28:27-03:00: [peça em aprovados](aprovados/pecas/reels/Metas e cofrinhos - reedicao v3.mp4); aceite do autor em 2026-10-26T09:28:26-03:00, versão `41dd6374df68c5673ae6dc36563dcb8dd5870bc3`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Metas e cofrinhos - reedicao v3.mp4`. Nada publicado ou agendado.
- 26/10/2026 09:28 (-03:00): aceite pelo autor no painel local. Peça `para-aprovacao/pecas/reels/Quanto pode gastar hoje - reedicao v3.mp4`, versão `aa35bfdd370d`. Registro em `docs/marketing/painel/aprovacoes.json`. Publicação pede passo próprio.

<!-- promocao:5be72489c3793f65:aa35bfdd370d1d2e9d6d4954d04de06c4a8c0ebd -->
- Promoção 2026-10-26T09:28:39-03:00: [peça em aprovados](aprovados/pecas/reels/Quanto pode gastar hoje - reedicao v3.mp4); aceite do autor em 2026-10-26T09:28:38-03:00, versão `aa35bfdd370d1d2e9d6d4954d04de06c4a8c0ebd`. Origem `docs/marketing/2026-10/semana-43-2026-10-19-a-2026-10-25/para-aprovacao/pecas/reels/Quanto pode gastar hoje - reedicao v3.mp4`. Nada publicado ou agendado.
