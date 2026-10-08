# Copys para aprovação · Flare · 30/09/2026 · RASCUNHO 3 (retorno do autor aplicado; rodada 2 com o Beacon ao fim)

Nada foi publicado, gravado, gerado ou gasto. Base: `matriz-plataformas.md` do Meridian. A matriz v2 separa **implementado (I)** de **validado (V)**: nenhuma função está validada nas três plataformas, então toda copy fica **produzível agora e publicável só depois do QA** da plataforma do público (portões P1, P2 e P4). Só entra copy cuja função a matriz marca como implementada (I) naquela plataforma; nada com N ou ?. Preço aparece só como "menos de R$ 0,37 por dia". "Sete dias para pedir o reembolso" vem da nota "Preço Vigente e Parcelamento - Cakto" e da landing (`app/index.tsx:1685`).

## O que o autor pediu e como foi aplicado
Frases do autor, palavra por palavra, ficam marcadas com **[autor]** em cada copy.

- Tom, nas palavras do autor: "comunicação mais humanizada. Mais profissional, sem tanta intimidade assim com o público, mas não perdendo a essência de ser um aplicativo web descomplicado." Todas as copys foram revistas nesse tom: frases curtas e diretas, "você" só quando necessário, sem gíria e sem imperativo de conversa de bar. Onde a mudança aparece, vem como `antes -> agora`.
- Nova direção geral: **sem material exclusivo para iPhone.** Os públicos passam a ser **navegador (computador e celular)** e **app Android**. Cada copy do navegador tem duas versões de captura, **computador** e **celular**, com o mesmo texto. As antigas C07 a C11 (iPhone) viraram a versão celular de C01 a C06.

## Divisão 70% navegador e 30% app
Contagem por peça (um vídeo = uma peça). São 13 copys e 20 peças.

| Público | Copys | Peças | Parte |
|---|---|---|---|
| Navegador, computador e celular | C01 a C07 | 7 copys × 2 capturas = 14 | 70% |
| App Android | C08 a C13 | 6 | 30% |

Formato: vídeo curto 9:16 (Reels e Stories) ou 4:5 (feed). Estático está encerrado (decisão do autor de 26/09). Telas são captura real do app com dados de exemplo, nunca geradas por IA. Pessoa fictícia demonstra o uso e nunca dá depoimento. Botão do anúncio na Meta: "Saiba mais". Destino sempre a landing, nunca o arquivo do APK.

## De onde veio cada copy (numeração antiga -> nova)
| Antes | Agora |
|---|---|
| C01 a C06 (computador) | C01 a C06, captura computador |
| C07 a C11 (iPhone) | C01 a C06, captura celular (sem peça exclusiva de iPhone) |
| C12 (assinatura iPhone) e parte web de C14 | C07 |
| C13 (mesma conta) e C19 (como baixar) | C12 |
| C15, C16, C17, C18 | C08, C09, C10, C11 |
| C20 (assinatura Android) | C13 |

Referências a C12, C14 e C20 nos pareceres do Lynx e do Watchtower passam a ser **C07 e C13**.

## Portões (todos valem junto com o dia D: build 1.10.5 publicada e testada)
- **P1 · QA no Chrome do computador** (QA mínimo 1 da matriz v2). A função está implementada e ainda não validada; a peça de captura computador só sai depois de alguém a ver funcionar.
- **P2 · Captura celular.** Bloqueada até: (a) o convite do app de Android deixar de aparecer no Safari (`components/ConviteAppAndroid.tsx:39-44` só testa `Platform.OS === 'web'` e a URL; conferido); (b) QA no celular real, no Safari do iPhone e no Chrome do Android: login, saldo e Livre para gastar, lançamento, Colar, conta paga, crédito e fatura, Granabô e assinatura por Pix. A matriz marca o iPhone como "código comum, não testado". A captura nunca mostra o convite do Android.
- **P3 · Oferta** (Lynx e Watchtower, CDC arts. 31 e 37). Antes de publicar C07 e C13: conferir o preço vigente na Cakto e a página de planos, que precisa mostrar o total de cada período, parcelas com o total quando houver, e as condições de renovação e de reembolso.
- **P4 · Sem teste em aparelho.** Ficou sem verificação de uso real; a peça só sai depois de o autor ou o QA ver a função no aparelho.

---

## Público A · Navegador, computador e celular (C01 a C07, 14 peças)

**C01 · Livre para gastar** · vídeo 9:16 de 15 s · captura computador e captura celular
- Matriz: linha "Saldo do mês, Livre para gastar, lançamentos, contas, crédito, metas, cofrinhos, gráficos", computador I · QA, celular (iPhone) I · QA.
- Título: `Quanto ainda dá para gastar por dia?` -> **Quanto você ainda pode gastar por dia?**
- Apoio **[autor: "não gostei do apoio, comunicação muito amadora, pouco profissional"]**: `O Grana. divide o que sobrou do mês pelos dias que faltam, já separando o que você guardou nos cofrinhos.` -> **O Grana. calcula o saldo do mês, separa o que está guardado nos cofrinhos e divide o restante pelos dias que faltam.**
- Legenda: `Abra no navegador do computador e veja o número do dia. Telas com dados de exemplo.` -> **Acesse pelo navegador e acompanhe o número do dia. Telas com dados de exemplo.**
- CTA: Conhecer o Grana.
- Portões: P1 (captura computador), P2 (captura celular).

**C02 · Colar comprovante** · vídeo 9:16 de 15 s · captura computador e captura celular
- Matriz: linha "Colar comprovante", computador I · QA, celular (iPhone) I · QA. O modal diz que identifica valor, categoria e tipo (`components/PasteReceiptModal.tsx:301`), então cobre Pix enviado e recebido.
- Título **[autor]**: `Recebeu um Pix? Cole o texto.` -> **Mandou ou recebeu um Pix? É só um copia e cola!**
- Apoio: `Cole o comprovante no Grana., confira o valor e salve. Direto no navegador.` -> **Cole o texto do comprovante no Grana., confira o valor e salve.** ("Direto no navegador" removido, **[autor]**.)
- Legenda: `Do computador, sem baixar nada. Texto e valores de exemplo.` -> **Texto e valores de exemplo. Confira o valor, se é entrada ou saída e a categoria antes de salvar.** (o tipo vem de palavras-chave e assume saída quando não reconhece, `lib/heuristics.ts:842`; por isso a legenda pede a conferência)
- CTA: Ver como funciona
- Portões: P1, P2. A captura celular precisa testar o gesto de colar do iOS. Testar um comprovante de Pix enviado e um de Pix recebido, e filmar só os que o Grana. classificar corretamente.

**C03 · Importar extrato** · vídeo 9:16 de 20 s · captura computador e captura celular
- Matriz: linha "Importar extrato (CSV/OFX)", computador I · QA (seletor do navegador), celular (iPhone) I · QA (seletor de arquivo do iOS).
- Título **[autor]**: `Baixou o extrato? Importe o arquivo.` -> **O Grana. organiza seu extrato**
- Apoio: `Escolha o arquivo CSV ou OFX no computador, confira as categorias e importe de uma vez.` -> **Importe o arquivo CSV ou OFX, confira os lançamentos e escolha a categoria dos que ficarem sem uma.** ("Organiza" é o que o código faz: reconhece a categoria e pede as que faltam, `components/ImportarExtratoModal.tsx:211-249`. A copy não promete categoria automática em tudo.)
- Legenda: Arquivo de exemplo, oito lançamentos fictícios.
- CTA: Conhecer o Grana.
- Portões: P1 (computador). **Captura celular tem portão extra:** a matriz marca o seletor de arquivo no celular como ❓, então só grava depois de, nos dois celulares (iPhone e Android), o seletor de arquivo abrir, um CSV e um OFX serem escolhidos e importados de fato, e teclado, rolagem e confirmação aparecerem sem cortes (P2).

**C04 · Contas do mês** · vídeo 9:16 de 15 s · captura computador e captura celular
- Matriz: linha "Saldo do mês… contas…", computador I · QA, celular (iPhone) I · QA.
- Título **[autor]**: `As contas do mês, uma por uma.` -> **Suas contas do mês, uma por uma.**
- Apoio: `Veja o que vence neste mês e marque como paga quando o dinheiro sair.` -> **Veja o que vence neste mês e marque cada conta como paga quando o pagamento for feito.**
- Legenda: `Contas de exemplo. Cada conta entra no seu saldo quando você marca como paga.` -> **Contas de exemplo. Cada conta entra no saldo quando é marcada como paga.** (segue a regra 20: conta pendente não desconta.)
- CTA: Ver os planos
- Portões: P1, P2.

**C05 · Cartão e fatura** · vídeo 4:5 de 15 s · captura computador e captura celular
- Matriz: linha "crédito", computador I · QA, celular (iPhone) I · QA.
- Título: `Cartão e fatura na tela grande.` -> **Cartão e fatura no mesmo lugar.**
- Apoio **[autor: "no navegador do seu computador"]**: `As compras no crédito e a fatura de cada cartão, no mesmo lugar, no navegador do computador.` -> **As compras no crédito e a fatura de cada cartão, no navegador do seu computador.** Na captura celular, a mesma frase troca só o aparelho: **no navegador do seu celular.**
- Legenda: Telas com dados de exemplo.
- CTA: Conhecer o Grana.
- Portões: P1, P2.

**C06 · Granabô** · vídeo 9:16 de 20 s · captura computador e captura celular
- Matriz: linha "Granabô (chat)", computador I · QA, celular (iPhone) I · QA.
- Título **[autor]**: `Pergunte sobre o seu dinheiro.` -> **Sem saber como gastou o dinheiro do mês? O Granabô responde!**
- Apoio: `O Granabô consulta os seus lançamentos e responde: gastos de uma categoria, contas do mês, fatura do cartão ou quanto sobra até o fim do mês.` -> **O Granabô consulta os seus lançamentos e responde sobre gastos de uma categoria, contas do mês, fatura do cartão ou quanto sobra até o fim do mês.** (texto da landing)
- Legenda: `As respostas usam os lançamentos de exemplo desta tela. Confira sempre os valores.` -> **Com base nos lançamentos registrados no Grana. As respostas desta tela usam lançamentos de exemplo. Confira sempre os valores.** (o título não pode sugerir conhecimento de gasto que ninguém lançou)
- CTA: Conhecer o Granabô
- Portões: P1, P2. Captura do chat com pergunta e resposta reais, sem texto inventado. A resposta filmada precisa ser sobre gastos de uma categoria ou do mês, para a peça cumprir o título.

**C07 · Assinatura no navegador** · vídeo 9:16 de 10 s · captura computador e captura celular
- Matriz: linha "Assinar (Cakto)", computador I · QA, celular (iPhone) I · QA.
- Título: Menos de R$ 0,37 por dia.
- Apoio: `Assine pelo site e use no navegador do iPhone e do computador. Sete dias de garantia.` -> **Uma assinatura para usar o Grana. no navegador, no computador e no celular. Sete dias para pedir o reembolso.** ("Garantia" trocada pelo reembolso, ajuste do Lynx.)
- Legenda: **Assinatura mensal ou anual. Valores, renovação e forma de pagamento na página de planos.** (ajuste do Lynx)
- CTA: Ver os planos
- Portões: P3, P1 (computador), P2 (celular, com assinatura por Pix concluída no Safari e o acesso reconhecido ao voltar ao Grana.).

---

## Público B · App Android (C08 a C13, 6 peças)

**C08 · Voz pelo widget** · vídeo 9:16 de 15 s · app
- Matriz: linha "Voz pelo widget, fila de voz offline", Android I · QA do APK.
- Título: `Gastou? Fale.` -> **Registre um gasto pela voz.**
- Apoio: `No Android, o widget de voz registra o gasto sem abrir o app. Se algo estiver ambíguo, o Grana. pede a confirmação.` -> **No app de Android, o widget de voz registra o gasto sem abrir o aplicativo. Quando algo não fica claro, o Grana. pede a confirmação antes de salvar.**
- Legenda: Widget e voz existem só no aplicativo de Android. Telas com dados de exemplo.
- CTA: Ver os planos
- Portões: P4. A aprovação anterior do vídeo (Reels do padeiro v8) e a captura no emulador não comprovam a voz no APK físico. Legenda ajustada para segmentar Android.

**C09 · Widget na tela inicial** · vídeo 9:16 de 15 s · app
- Matriz: linha "Widgets na tela inicial", Android I · QA do APK.
- Título: `Um toque na tela inicial.` -> **Lançamentos a um toque, na tela inicial.**
- Apoio: `No Android, o widget de lançamento tem um botão para cada caso: entrada, Débito e Pix, crédito e boleto. Um toque abre o formulário certo.` -> **No Android, o widget de lançamento tem um botão para cada caso: entrada, Débito e Pix, crédito e boleto. O toque abre o formulário correspondente.**
- Legenda: Widgets disponíveis só no aplicativo de Android.
- CTA: Conhecer o Grana.
- Portões: P4. `CentralLancamentoWidgetProvider.kt:11-25` liga os quatro botões a `add-tx?type=in`, `add-tx?type=out`, `add-credit` e `add-bill`. A correção que faz o toque abrir o formulário (`8b31f2a`) está no `context.md:914` como sem teste no aparelho. Só gravar depois de ver os toques abrirem o formulário num Android real (roteiro R7 do Beacon). A copy não cita o widget do Livre para gastar.

**C10 · Foto da nota** · vídeo 9:16 de 15 s · app
- Matriz: linha "Fotografar nota", Android I (flag `foto_nota` ligada em produção desde 28/09).
- Título: `Fotografe a nota e confira o valor.` -> **Fotografe a nota e confira o valor lido.**
- Apoio: `No app de Android, o Grana. lê o total da nota fiscal na foto. Você confere e salva.` -> **No app de Android, o Grana. lê o total da nota fiscal na foto. Você confere o valor e salva.**
- Legenda: Confira sempre o valor lido antes de salvar. Foto de nota de exemplo.
- CTA: Conhecer o Grana.
- Portões: P4. O teste dos 10 cupons ainda não rodou; **não publicar antes dele.**

**C11 · Biometria** · vídeo 4:5 de 10 s · app
- Matriz: linha "Trava por biometria", Android I (se houver leitor cadastrado).
- Título: `Peça a biometria ao abrir.` -> **Proteja o Grana. com biometria.**
- Apoio: `No Android, ative a trava por biometria e o Grana. pede o seu desbloqueio ao abrir.` -> **No Android, ative a trava por biometria e o Grana. pede o desbloqueio ao abrir.**
- Legenda: Funciona em aparelhos com biometria cadastrada. Se você sair e voltar em até 30 segundos, o app não pede de novo. (`lib/app-lock-context.tsx:25,90`)
- CTA: Ver os planos
- Portões: P4. A captura no emulador não comprova o desbloqueio no APK físico.

**C12 · Baixar o app e entrar com a mesma conta** · vídeo 9:16 de 15 s · app
- Matriz: linha "Existe app instalável", Android I (APK por download direto, sem Play Store); linha "Entrar, cadastrar, recuperar senha", Android I e computador I · QA.
- Título: `O app de Android vem pelo site.` -> **O app de Android é baixado pelo site.**
- Apoio: `Depois de assinar, baixe o app pela página do Grana. O Android pede uma autorização para instalar de fora da loja.` -> **Depois de assinar, baixe o app pela página do Grana. e entre com a mesma conta que você usa no navegador. O Android pede uma autorização para instalar fora da loja.** (junta a antiga C13 "mesma conta")
- Legenda: Não está na Play Store. O download é pelo site do Grana. Telas com dados de exemplo.
- CTA: Ver os planos
- Portões: passo a passo gravado do fluxo real de `/baixar`. "Mesma conta": os dois usam a mesma tabela `transactions` do Supabase por usuário (`lib/data.ts:96,99,242,467`, conferido por mim e pelo Beacon), então a promessa procede; a copy não diz "na hora". Sem teste em aparelho: lançar no Android e ver aparecer no navegador depois de atualizar a página.

**C13 · Assinatura para o Android** · vídeo 9:16 de 10 s · app
- Matriz: linha "Assinar (Cakto)", Android I · QA do APK; nota de preço.
- Título: Menos de R$ 0,37 por dia.
- Apoio: `A assinatura vale para o app de Android e para o navegador do computador. Sete dias de garantia.` -> **A assinatura vale para o app de Android e para o navegador. Sete dias para pedir o reembolso.**
- Legenda: **Assinatura mensal ou anual. Valores, renovação e forma de pagamento na página de planos.** (ajuste do Lynx)
- CTA: Ver os planos
- Portões: P3, e QA de assinatura: a mesma compra liberar o acesso no app de Android e no navegador, e o download do APK funcionar depois da compra.

---

## O que ficou de fora de propósito
- **Voz no navegador:** falhou no Firefox e nunca foi testada no Safari. Nenhuma copy do Público A fala de voz.
- **Leitura de QR da nota:** sem entrada para o usuário. A FAQ da landing (`app/index.tsx:742`) ainda a cita e pede correção fora deste arquivo.
- **"Instale como app":** não há PWA.
- **Lembretes e notificações:** o push remoto nunca foi testado em aparelho.
- **Lançamento sem internet na web e exportar dados no celular:** ❓ na matriz.
- **Conexão bancária, WhatsApp, app de iPhone, rosto do autor, preço exato:** fora de todas as copys.

## O que o Beacon mudou
**Rodada 1 (antes desta versão, 30/09):** C11 sem "responde com o número que você pediu" (agora sem essa frase em nenhuma copy do chat), C16 com os quatro botões do widget (agora C09), C18 com a carência de 30 s (agora C11), C13 com portão de sincronização (agora em C12), portão do Safari ampliado e convite do Android no Safari (agora P2), portões de QA de assinatura (agora C07 e C13). Cada ponto foi conferido no código antes de aceitar.

**Rodada 2 (sobre o rascunho 3, 30/09; o par respondeu, com limite):** cada ponto foi conferido antes de aceitar.

| Copy | Ponto do Beacon | Veredito | O que mudou |
|---|---|---|---|
| Todas | trocar "funciona" por "implementada, pendente de QA" (matriz v2) | procede: a matriz v2 separa I de V e este arquivo ainda citava a v1 | cabeçalho e linhas "Matriz:" reescritos |
| C02 | manter enviado e recebido, mas pedir conferência de tipo e categoria | procede: `lib/heuristics.ts:842` usa palavras-chave e assume saída | legenda pede a conferência; portão pede testar os dois comprovantes |
| C03 | título aceitável; portão do celular só cita o seletor | título ok (`ImportarExtratoModal.tsx:213,249`); portão procede | portão exige escolher e importar CSV e OFX nos dois celulares, e teclado e rolagem sem cortes |
| C06 | acrescentar base nos lançamentos registrados | procede | legenda ganhou "Com base nos lançamentos registrados no Grana." |
| C02, tom | "Mandou" e "É só um copia e cola!" mais coloquiais que o resto | procede; é frase do autor | mantida; a decisão fica com o autor (ver abaixo) |
| C08, C11 | acrescentar P4 | procede | P4 nas duas |
| C01 a C13 | violação de regra de copy | Beacon não achou nenhuma | sem mudança |

**Para o autor decidir:** o título de C02 ("Mandou ou recebeu um Pix? É só um copia e cola!") é mais informal que o tom pedido para as demais copys. Foi mantido palavra por palavra.

## O que ficou sem verificação
- Nenhuma peça foi vista em tela; tudo vem da matriz do Meridian, que lê o código e não abriu navegador nem celular.
- A versão celular do navegador nunca foi vista: o layout da web no celular não foi conferido por ninguém aqui.
- "Sete dias para pedir o reembolso" e "menos de R$ 0,37 por dia" vêm da nota de preço (revisada em 13/09). Se o preço mudar, C07 e C13 mudam junto.
- A conferência de CDC das versões novas de texto (tom e títulos do autor) ainda não foi repetida pelo Lynx.
