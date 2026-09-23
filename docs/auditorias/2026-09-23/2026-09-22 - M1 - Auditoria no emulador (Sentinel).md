---
tags: [grana, auditoria, android, emulador, usabilidade, visual]
tipo: registro
data: 2026-09-22
maquina: M1
---

# 2026-09-22 - M1 - Auditoria no emulador (Sentinel)

Continuação de [[2026-09-19 - M1 - Auditoria 100 por cento no emulador]].
Varredura sob a regra 17 do `AGENTS.md`, feita pelo agente QA "Sentinel"
(Claude Opus 5.5 no terminal do Maestri; o papel pede `gpt-5.6-luna`, e a
substituição fica registrada aqui). Achados registrados na hora.

## O pedido, como chegou

"Sentinel, continue a auditoria do app Android no emulador Pixel 8 (portal
"QA Pixel 8") que o Codex começou hoje e parou logo no início [...] Foco extra:
reconferir no aparelho as correções já publicadas (A1, A9, A13, A57, A59, A60 e
a tabela de corrigidos) e os itens "conferência visual" em aberto (A7, A8, A10,
A27, A29, A45, A53, A56, A70). [...] Verificação não é correção: não mexa no
código."

## Como

- **Ambiente.** Emulador Pixel_8 (1080x2400, Android 15), APK de
  desenvolvimento `com.gabriouss.grana` (versionName 1.10.3, instalado em
  19/09) carregando o JS do Metro do repositório em `13ae412` (conferido no
  logcat: `loadJSBundleFromMetro`). Conta de teste "Auditoria", entrada só por
  `node scripts/emulador.cjs`. O Codex tinha deixado a sessão logada.
- **Contornos de ferramenta.** O `scripts/emulador.cjs` não rola a tela nem
  liga e desliga rede. Para isso usei `adb shell input swipe`,
  `adb shell svc wifi|data` e `adb shell settings put system font_scale`,
  nenhum deles com credencial. O `abrir dev` com o app já aberto de uma sessão
  anterior deixou a tela vazia (fundo petróleo, sem nada) até um
  `am force-stop` e novo `abrir dev`: registrado como contorno, não como
  achado do app.
- **Prints** em `E:\Grana-temporarios\2026-09-22-QA\` (prefixo `q`), fora do
  repositório e do vault.
- **Gravidade.** P0 impede a tarefa. P1 dificulta muito ou quebra padrão da
  plataforma. P2 incomoda, com contorno. P3 acabamento.
- **Skills de apoio.** Ver a seção "Skills usadas", no fim.

## Lista de cobertura

"ok" = visto e certo; "achado" = ver a seção de achados; "n/v" = não
verificável no emulador, com o motivo. Tema claro e paisagem não entram
(decisão do autor, 19/09/2026).

### Acesso e conta
- [x] Entrar: vazio, mostrar senha, erro (S37); login pelo script
- [x] Criar conta: regras de senha, aceite, validação (sem criar conta)
- [x] Recuperar senha: e-mail herdado (A68), resposta genérica (S38)
- [ ] Nova senha: **n/v**, só abre pelo link do e-mail
- [ ] Assinar e Ativar: **n/v**, a conta tem cortesia e o paywall não aparece; pagamento real fora do emulador
- [x] Termos, Privacidade, Exclusão de dados (A45, S33, S34)
- [x] Sair da conta (A64); Excluir conta só até a confirmação com senha

### Início
- [x] Cabeçalho, ocultar valores, trocar, criar e excluir carteira (A6 a A11)
- [x] Mês, atalhos (A1), Livre para gastar, orçamento (A4), Fluxo (A3, S5), Comprometimento futuro (S8)
- [x] Cofrinhos e metas: criar, guardar, resgatar, excluir (S39, A51 a A53)
- [x] Personalizar Início (A56, S41)
- [x] Botão "+": Entrada, Saída, Boleto, Crédito
- [x] Colar comprovante, Importar extrato (texto), Escanear nota (até o leitor)

### Débito e Pix
- [x] Lista, mês, busca, filtro, vazio, editar, excluir (A16, A17, A20, S15)
- [x] Seleção múltipla: não existe (já registrado no mapa)

### Crédito
- [x] Carrossel, ciclos (S16, S17), criar, editar e excluir cartão, compra parcelada, pagar, desfazer, excluir parcela

### Boletos
- [x] Criar atrasado, pagar com um toque, reabrir, editar, excluir (S22, S23)

### Gráficos
- [x] Despesas, Renda, Geral; Ano a Ano, Mês a Mês, Período; carregando; exportar PDF (S24)

### Desafios
- [x] Faixa, XP, ritmo, score, retrato, mural e filtros (S26 a S29)

### Perfil
- [x] Categorias, widgets, notificações, privacidade e captura, dados de exemplo (só olhado), orçamento sugerido (sem aplicar), diagnóstico (até a 1ª tela), feedback (sem enviar), editar nome

### Granabô
- [x] Consulta (S43), lançar pelo chat, desfazer, indicador "pensando" (S44)

### Fora das telas
- [x] Voz no app até o desfecho do silêncio (S45 a S47); fala real **n/v** (microfone do emulador é mudo)
- [x] Widgets na tela: Lançar por voz (S4, S48), Contas do mês e Livre para gastar (o toque abre a tela certa)
- [ ] Widgets Central de lançamentos e Cofrinho: **n/v**, não estão na tela inicial do emulador; adicioná-los exige o seletor do launcher, que não mexi
- [x] Notificação local da voz ("Confirme o valor que ouvi") abre a revisão
- [ ] Push pelo FCM e lembrete das 20:30: **n/v**, build de desenvolvimento sem FCM (`FIS_AUTH_ERROR`) e horário fora da sessão
- [x] Sem rede em todas as abas (S50 a S53, A57 a A60)
- [x] Fonte grande 130% (S54, S55)
- [x] Estabilidade: ANR (S30)
- Tema claro e paisagem: fora, por decisão do autor

## Achados

Numerados S1, S2... na ordem em que apareceram.

### Widgets na tela inicial do emulador

Três widgets já estavam na tela inicial do Android (Lançar por voz, Contas do
mês, Livre para gastar), o que permitiu olhar a aparência deles; o toque e a
voz pelo widget seguem "n/v" (ver cobertura).

- **S1 [P3] Widget "Livre para gastar" corta a frase principal.** Mostra "Sem
  saldo disponí…" em letra grande, sem caber a palavra. Esperado: frase
  inteira (menor ou em duas linhas). Print `q005-inicio`.
- **S2 [P3] O mesmo widget tem dois nomes.** No Perfil, "Widgets da tela
  inicial" lista "Próximo compromisso · 2 × 2 ... Adicionado"; o widget na tela
  inicial se chama "Contas do mês", e o `docs/mapa-do-app-para-agentes.md`
  também diz "Contas do mês". Prints `q005-inicio`, `q006-perfil-topo`.
- **S3 [P3] Rótulo de acessibilidade do widget com travessão.** A árvore de
  acessibilidade do widget diz "Grana. — Contas do mês"; o leitor de tela
  lê isso, e a regra de copy do projeto proíbe travessão.
- **S4 [P1] Widget "Lançar por voz" sem permissão de microfone não faz nada,
  em silêncio.** Passos: app com `RECORD_AUDIO` ainda não concedido (estado
  desta instalação: `granted=false`, conferido em `dumpsys package`); tocar no
  widget na tela inicial. Esperado: pedir a permissão ou abrir o app com uma
  explicação. Obtido: nada muda no widget nem aparece notificação; o logcat
  mostra `GranaVoz: gravação abortada: erro_interno` 0,1 s depois do toque.
  Lido no código: `GranaVoiceCaptureService.kt:108`, o `catch` de
  `subirEmPrimeiroPlano()` chama `abortar("erro_interno")`, que volta o widget
  a `OCIOSO` sem recibo. É a classe do A63 (regra 9: todo caminho de falha
  deixa recibo), agora com causa reproduzível: quem nunca usou a voz dentro do
  app e toca no widget vê a ferramenta morta. Print `q008-widget-voz`.
- **Conferido e certo:** toque em "Contas do mês" abre Boletos ("Contas a
  pagar"); toque em "Livre para gastar" abre a Início; os dois mostram
  "Atualizado 22:57" coerente com o relógio do aparelho.

### Início

- **S5 [P3] Travessão na faixa de datas do Fluxo financeiro.** O rótulo do
  período diz "21–25/09" (meia-risca). O `a0d53be` trocou o ciclo do cartão
  para "15 set a 14 out", mas o `FlowChart` ficou com o traço. Regra de copy.
  Print `q012-inicio-baixo`.
- **S6 [P3] "Templates" em inglês no Orçamento do mês.** Ao lado de
  "+ Definir"; o Perfil chama o mesmo recurso de "Orçamento sugerido, Aplicar
  template". Print `q012-inicio-baixo`.
- **S7 [P3] "Ocultar saldo da Tela inicial" é ambíguo e tem maiúscula no
  meio.** No painel de carteira não fica claro se é a Início do app ou a tela
  inicial do Android (widgets, que têm interruptor próprio no Perfil,
  "Mostrar valores nos widgets"). Print `q016-carteiras`.
- **S8 [P3] Legenda do Comprometimento futuro mostra série sem barra.**
  "Contas recorrentes" (verde) aparece na legenda, mas todas as barras são
  azuis (Parcelas futuras). Barras sem valor, só o total embaixo. Print
  `q009-inicio-topo`.
- **Observação, não achado:** a lista "Últimos lançamentos" tem três "Cafe
  gelado" de R$ 5,00 em 18/09, sem o prefixo AUDIT. Parecem restos de teste de
  voz de outra sessão (três iguais pode ser lançamento duplicado). Não apaguei:
  pergunta ao autor.
- **Conferido e certo:** cabeçalho, ocultar valores (tudo borrado, inclusive
  na árvore de acessibilidade; aviso "Valores ocultos"), navegação de mês,
  "Sem saldo disponível" coerente com o widget, orçamento excedido em vermelho
  com "excedido", "Livre no total" e "Reservado" com o mesmo sinal, Fluxo abre
  no período de hoje, criar carteira com teclado aberto.

### Carteiras, botão "+" e folha de lançamento

- **S9 [P2] Painel "Categoria" sobe por baixo da barra de status com o
  teclado de letras.** Passos: "+" > Saída > Categoria > "+ Criar categoria".
  O teclado de letras abre e o título "Categoria" encosta no relógio, com o
  painel começando sob os ícones do sistema. Esperado: o mesmo comportamento
  da folha "Nova saída" e do painel de carteira, que agora ficam abaixo da
  barra (A9 e A13 conferidos). A correção do A13 não alcançou este painel. É
  também a metade "encosta na barra de status" do A70. Print
  `q034-criar-categoria`.
- **S10 [P3] Nome de categoria curto aparece cortado na folha.** "Categoria
  · Alimentaçã" com espaço sobrando à esquerda; o nome longo ("AUDIT QA
  categoria com nome comprido demais") aparece inteiro, em outra linha. O
  corte é da medida de uma linha só, não de falta de espaço. Prints
  `q027-nova-saida-2`, `q035-categoria-criada`.
- **S11 [P3] Lista de categorias sem pista de que rola.** O painel mostra de
  Alimentação a Salário e o recorte cai exatamente entre duas linhas, com
  "+ Criar categoria" logo abaixo: parece a lista inteira. "Investimentos",
  "Outros" e as categorias da pessoa só aparecem rolando. Também oferece
  "Salário" e "Investimentos" numa saída, sem separar por tipo. Prints
  `q032-categorias-2`, `q033-categorias-rolada`.
- **S12 [P3, uma ocorrência] Primeiro toque no "+" perdido logo depois de
  fechar o painel de carteira.** O segundo toque abriu o menu. Classe 10 do
  mapa (A48, A51). Não repeti a sequência exata; registrar se reaparecer.
  Print `q024-mais`.
- **S13 [P2, uma ocorrência] Cabeçalho de Lançamentos desenhado sob a barra
  de status na primeira montagem da aba.** Ao tocar "Saída" no "+" da
  Início, o primeiro quadro da aba mostrou "Movimentações Lançamentos" por
  cima do relógio e o seletor de carteira sobre os ícones; um segundo depois
  estava no lugar certo. Parece área segura aplicada com atraso. Print
  `q026-nova-saida`.
- **S14 [P3] Confirmação de excluir carteira é o alerta nativo cinza.**
  Fonte do sistema, botões "CANCELAR" e "EXCLUIR" em caixa alta, fundo cinza
  que destoa do resto (o app usa `AppModal` nos outros painéis). O texto está
  certo e diz para onde vão os lançamentos. Print `q022-excluir-carteira`.
- **A15 reproduz:** "Saída" no "+" da Início abre a folha dentro da aba
  Débito e Pix, e ao salvar a pessoa fica lá (decisão de produto pendente).
- **Conferido e certo:** menu do "+" com Entrada, Saída, Boleto (ícone de
  recibo, A14) e Crédito; "Informe um valor maior que zero." ao salvar com
  R$ 0,00, e o aviso some ao digitar o valor; teclado numérico com o botão
  de salvar visível; criar categoria já seleciona a nova e fecha o painel;
  lançamento salvo aparece no topo, "Tudo (10)", Saídas e Saldo somam
  R$ 7,77 na hora; excluir carteira atualiza o Total na hora.

### Débito e Pix

- **S15 [P3] Sinal em valor zero no resumo.** Em mês vazio e com busca sem
  resultado: "Entradas + R$ 0,00", "Saídas − R$ 0,00", "Saldo + R$ 0,00". O
  A2 pedia zero sem sinal. Prints `q040-mes-vazio`, `q041-busca-vazia`.
- **Conferido e certo:** folha de ações com "AUDIT QA saida teclado · R$ 7,77"
  (A16); editar valor atualiza a linha e o resumo; busca filtra o resumo
  ("Tudo (3)", Saídas R$ 15,00, A20); busca sem resultado diz "Nenhum
  lançamento encontrado com esse filtro."; mês vazio sem apontar para botões
  inexistentes (A17); tocar no mês volta ao atual; filtro de categoria;
  excluir pede confirmação nomeada.

### Crédito

- **S16 [P2] Fora do ciclo atual, os cartões seguem dizendo "Fatura atual" com
  o valor do ciclo atual.** Passos: Crédito > "Fatura anterior" (Setembro
  2026). O resumo diz "Total das faturas R$ 0,00" e "Nenhuma compra no crédito
  nesta fatura", mas os dois cartões mostram "Fatura atual R$ 300,00" e
  "R$ 30,00". Esperado (A22, dado como corrigido em `4b96df6`): "Fatura de
  set/26" com o valor daquele ciclo. **A22 reproduz.** Print
  `q051-fatura-anterior`.
- **S17 [P2] Nada mostra qual cartão está selecionado.** Os dois cartões têm a
  mesma borda roxa (cor do banco) com ou sem seleção. Só o bloco "Fatura do
  cartão selecionado" e o botão "Pagar fatura", que aparecem depois do toque,
  indicam a escolha; antes do toque, "Pagar fatura" não existe na tela.
  Prints `q046-cartao-criado`, `q053-cartao-selecionado`.
- **S18 [P3] Folha de opções do cartão não diz qual cartão.** Título só
  "Cartão", com Editar e Excluir (a do lançamento já nomeia, A16). A
  confirmação de excluir nomeia. Prints `q058-opcoes-cartao`,
  `q059-excluir-cartao`.
- **S19 [P3] Nome do cartão cortado no carrossel.** "AUDIT Cartao Teste0…";
  não há onde ler o nome inteiro além da lista abaixo. Mesma classe do A53.
- **S20 [P3] Placeholder "ex:" sem ponto no nome do cartão.** "Nome do cartão
  (ex: Nubank Black)"; o resto do app usa "ex.:" (A6). Print
  `q044-novo-cartao`.
- **S21 [P3, a confirmar] Primeiro toque em interruptor sem efeito.**
  "Compra parcelada" não ligou no primeiro toque (depois de fechar o teclado
  numérico) e ligou no segundo; o mesmo aconteceu com "Bloquear captura de
  tela" no Perfil (depois de rolar). Soma com S12. Print `q048-parcelada`.
- **A26 reproduz:** "AUDIT compra parcelada (1/4)" com o selo "1/4x" ao lado
  (decisão de produto pendente).
- **Conferido e certo:** rótulo "Cartões & faturas" numa linha só (A27);
  exemplos "4092" e "5.000,00" em tom mais apagado que "15" e "22" (A29);
  folha do cartão com teclado de letras abaixo da barra de status; ciclo "15
  set a 14 out" (A23); compra parcelada 3x mostra "3x de R$ 30,00", toast
  "Gasto no crédito registrado", total R$ 330,00; pagar fatura com carteira e
  data, "Paga ✓", "Desfazer pagamento" com confirmação e volta a "A pagar";
  excluir compra parcelada na 1ª parcela oferece "A compra inteira" e "Só
  esta parcela"; excluir cartão explica que os lançamentos ficam no
  histórico.

### Boletos

- **S22 [P3] Folha de opções do boleto não diz qual conta.** Título "Conta a
  pagar", com Editar e Excluir (mesma classe do S18). A confirmação "Excluir
  conta" também não nomeia a conta, ao contrário da de lançamento e da de
  cartão. Prints `q066-opcoes-boleto`, `q067-excluir-boleto`.
- **S23 [P3] Pagar com um toque manda o item para o fim da lista sem
  recibo visível.** A conta atrasada estava no topo; tocada, virou "paga" e
  pulou para a terceira posição, sem toast perceptível. Quem toca sem querer
  precisa procurar onde ela foi para reabrir. Prints `q063-boleto-salvo`,
  `q064-boleto-pago`.
- **Conferido e certo:** atrasada primeiro (A31), "Vence 21 set 2026 · toque
  para pagar/reabrir" (A36), "R$ 43,21 em aberto neste mês" atualiza ao pagar
  e reabrir, toast "Conta salva", reabrir volta a "atrasada" no topo, excluir
  pede confirmação (A30); pagar e reabrir não deixam lançamento órfão em
  Débito e Pix ("Tudo (9)" antes e depois).

### Gráficos

- **S24 [P3] Exportar PDF sem retorno por uns 6 s.** Tocado "Exportar
  relatório do período", nada muda na tela (sem "Gerando…", sem botão
  ocupado) até a folha de compartilhar do Android aparecer, cerca de 6 s
  depois (logcat 23:24:03 a :06). Quem toca duas vezes pode gerar dois PDFs.
  Print `q074-exportar`.
- **S25 [P3] "Composição por Categorias" em maiúsculas de título.** Resto do
  A28. Também "Ritmo da Semana", "Composição do seu Score" e "Mural de
  Conquistas" em Desafios. Prints `q069-graficos-ano`, `q076-desafios-2`.
- **A34 e A35 reproduzem:** "Ano a Ano" e "Mês a Mês" mostram o mesmo ponto
  único em Set/26; "Geral" repete a linha e o total de Despesas
  ("Movimentação no período R$ 482,10"). Decisão de produto pendente. Prints
  `q069`, `q070`, `q074`.
- **Conferido e certo:** "Carregando…" no primeiro quadro; Renda vazia com
  eixo R$ 0 a R$ 4 (A33); Período com "De" e "Até" e "Exportar relatório do
  período" (A32); total de despesas R$ 482,10 igual ao de Débito e Pix e ao
  "Resultado do mês" de Desafios (crédito fora dos totais).

### Desafios

- **S26 [P2] "Ocultar valores" não alcança Desafios.** Passos: Início > olho
  (vira "Mostrar valores") > Desafios. "Retrato do mês · Resultado do mês
  − R$ 482,10" aparece em claro. A aba também é a única sem o botão do olho no
  cabeçalho. Mesma classe do A5 (valor oculto que vaza). Prints
  `q086-desafios-oculto`, `q087-inicio-oculto-check`.
- **S27 [P3] Tela vazia com um ponto girando enquanto carrega.** Ao abrir a
  aba, com rede, 2 a 4 s de fundo liso sem cabeçalho nem título; é a metade
  "Desafios" do A58, fora do caso sem rede. Print `q075-desafios`.
- **S28 [P3] Nível 2 com 0% e sem dizer quanto falta.** "Progresso de metas
  100 XP · Nível 2 · Aprendiz 0% · Rumo ao elo Construtor", barra vazia, sem
  "faltam N XP" (a faixa do Score, logo acima, diz "Faltam 108 pontos").
  Print `q076-desafios-2`.
- **S29 [P3] Selos das conquistas com três gramáticas.** Progresso ("13/100",
  "2/5 contas"), estado ("Em andamento", "Pendente") e meta ("R$ 5.000") no
  mesmo lugar do cartão. "Mês Verde · Em andamento" e "Visão Completa ·
  Pendente" com barra pela metade. Print `q077-desafios-fim`.
- **Conferido e certo:** filtro "Obtidas (3)" mostra só as três conquistadas
  (numa primeira tentativa, com o app a caminho do ANR abaixo, a lista não
  filtrou; refeito depois de reabrir, filtrou certo); nomes das conquistas
  inteiros (A37); explicação de que o XP é separado da saúde financeira.

### Estabilidade

- **S30 [P1, emulador] ANR: "Grana. isn't responding" ao alternar Gráficos e
  Desafios.** Passos: Gráficos (Período, exportar PDF, voltar) > Desafios >
  rolar > filtro > Gráficos > Desafios. O Android mostrou "Grana. isn't
  responding"; "Wait" duas vezes não resolveu e foi preciso "Close app". Log:
  `Input dispatching timed out ... Waited 5000ms for MotionEvent`, processo a
  158% de CPU em kernel e 13.821 faltas de página maiores, emulador com
  173 MB livres de 2,5 GB. **Causa não isolada:** pode ser pressão de memória
  do emulador somada ao bundle de desenvolvimento, e não do app em release.
  Precisa ser repetido num APK de release antes de virar correção. Print
  `q080-obtidas`.
- **S31 [P3] Primeiro toque depois de reabrir o app se perdeu.** "Desafios"
  tocado 2 s depois da Início aparecer: nada aconteceu (o gesto seguinte
  rolou a Início). Mais um da classe 10 (S12, S21).

### Perfil

- **S32 [P3] "Modo privacidade", "Ocultar valores" e "Mostrar valores" são o
  mesmo interruptor com três nomes.** Ligar "Modo privacidade" no Perfil
  mostra o toast "Valores ocultos" e liga o olho das abas. Quem procura
  "ocultar valores" no Perfil não acha. Print `q089-perfil-1`.
- **S33 [P3] Termos de Uso ainda citam WhatsApp** ("leitura de valores (por
  texto, voz ou WhatsApp)", seção 6), e o autor decidiu em 13/09 que o Grana
  não usa WhatsApp. Pergunta ao autor se o texto legal deve mudar. Print
  `q091-termos-rolado`.
- **S34 [P3] Nas páginas legais o texto rola por baixo do relógio.** Sem
  fundo na barra de status: as linhas passam sobre a hora e os ícones. Junto
  com o A45 (o "Voltar" rola junto e some). Print `q091-termos-rolado`.
- **S35 [P3] Diagnóstico com opção em inglês e maiúsculas de título.** "No
  feeling", "Consciente & Estruturado", "Autônomo / Renda Variável"; o
  "Cancelar" do pé é pequeno, de baixo contraste e encostado na barra de
  gestos. Print `q100-diagnostico`.
- **S36 [P3] "template" em inglês no Perfil.** "Orçamento sugerido · Aplicar
  template" (mesma palavra do S6). Print `q089-perfil-2`.
- **Conferido e certo:** gerenciar categorias com confirmação que diz para
  onde vão os lançamentos ("reclassificados para Outros"); categoria AUDIT
  QA apagada; Feedback com "Descartar mensagem?" e "Continuar escrevendo"
  (A44), cabe com teclado; orçamento sugerido com prévia antes de aplicar
  (A42, não apliquei); diagnóstico abre só o diagnóstico, com "Cancelar"
  (A43); editar nome com explicação de onde aparece; "Sair da conta" pede
  confirmação e sai de fato (A64).

### Entrar, criar conta e recuperar senha

- **S37 [P3] Placeholder da senha são bolinhas.** "••••••••" em cinza no
  campo vazio parece senha já preenchida (mesma classe do A29). Print
  `q103-login`.
- **S38 [P3] Recuperar senha aceita e-mail sem domínio completo.**
  "audit.qa@exemplo" passou e mostrou "E-mail a caminho". A resposta
  genérica ("Se houver uma conta com...") é certa para não revelar contas,
  mas um erro de digitação óbvio poderia ser apontado antes. Print
  `q105-recuperar-invalido`.
- **Observação de ferramenta, não do app:** `node scripts/emulador.cjs login`
  rodado com a tela "Criar conta" aberta casou "Entrar" dentro de "Já tem
  conta? Entrar" e agiu na tela errada; nada foi enviado, e rodado de novo na
  tela certa entrou. Vale uma trava no script (casar "Entrar" exato).
- **Conferido e certo:** "Preencha e-mail e senha." no login e no cadastro
  vazios; um só "Esqueci minha senha" (A67); o e-mail digitado vai para o
  modal de recuperação (A68); cadastro com regras de senha visíveis e aceite
  dos termos; login pelo script voltou à Início.
- **A69 n/v nesta instalação:** a permissão de notificação já estava
  concedida (`POST_NOTIFICATIONS: granted=true`), então o pedido não aparece
  depois do login. Só reproduz com `pm clear` ou instalação nova.

### Cofrinhos e metas

- **S39 [P2] Guardar na meta leva de 3 a 9 s para aparecer, sem nenhum
  aviso no meio.** Passos: meta nova "AUDIT QA meta..." > Guardar R$ 25,00
  com o teclado fechado > "Guardar no cofrinho". A folha fecha na hora, o
  cartão segue "R$ 0,00 · 0%" e não aparece toast; só uns segundos depois
  vira R$ 25,00 e "Reservado em cofrinhos" vai a R$ 175,00. **É a causa
  provável do A51** ("primeiro depósito se perdeu"): não se perdeu, chegou
  atrasado e sem recibo, e quem olha logo depois conclui que falhou e
  guarda de novo. O resgate tem o mesmo atraso. Prints
  `q116-meta-guardar`.
- **S40 [P3] Painel "Nova meta" sobe por baixo da barra de status com o
  teclado de letras** (mesma classe do S9; a correção do A13 não alcançou
  este painel). Print `q112-meta-nome-longo`.
- **A52 reproduz:** o "…" da meta abre direto "Excluir meta", sem editar. A
  confirmação agora diz "O valor guardado não volta sozinho para o saldo"
  (metade corrigida). Print `q117-meta-opcoes`.
- **A53 reproduz:** o campo mostra só o fim do nome ("JDIT QA meta com nome
  bem comprido para testar") e o cartão corta em "AUDIT QA meta …"; o título
  da folha de guardar também corta ("AUDIT QA meta com nome bem comp…").
  Prints `q112`, `q113`, `q114`.
- **Conferido e certo:** placeholder "Nome da meta, ex.: Viagem"; ícones e
  cores; prazo opcional; resgatar devolve ao saldo; meta de teste apagada.

### Personalizar Início

- **S41 [P3] O fundo escurecido do painel para no meio da barra de abas.**
  A metade de baixo da barra e do botão do Granabô ficam claras, com um corte
  horizontal visível. Print `q119-personalizar`.
- **A56 conferido quase todo:** "Livre para gastar", "Cofrinhos e metas",
  "Modelos rápidos", "Concluir personalização", modelos "Completo",
  "Essencial", "Metas & Limites", descrições inteiras. Resta
  "Comprometimento futuro (6 meses)" quebrando o parêntese em duas linhas.

### Colar comprovante, importar extrato, escanear nota

- **S42 [P3] "Ex:" sem ponto no exemplo de colar comprovante** ("Ex: Você
  transferiu..."), como o S20. Print `q120-colar`.
- **Conferido e certo:** colar reconhece valor, descrição, tipo e categoria
  ("AUDIT QA Padaria", R$ 12,34, Saída, Alimentação) e pede confirmação
  (não salvei); importar extrato com texto sem formato diz "Nenhum lançamento
  identificado" e o que conferir; o seletor de arquivo abre; escanear nota
  explica a câmera antes do pedido do Android, e depois de "While using the
  app" o leitor abre sem toque perdido (**A48 não reproduziu**).
- **n/v:** importar um OFX ou CSV de verdade (não há arquivo de extrato no
  emulador) e ler um QR de nota (câmera virtual sem nota).

### Granabô

- **S43 [P1] Granabô soma o crédito no gasto do mês, e Gráficos não.**
  "quanto gastei em alimentacao este mes" responde "R$ 440,30 em
  Alimentação em setembro de 2026"; Gráficos e o donut da Início dizem
  Alimentação R$ 140,30. A diferença é exatamente a compra no crédito "AUDIT
  compra parcelada (1/4)" de R$ 300,00. **É o A46 no ar:** a correção existe
  só no fonte de `supabase/functions/assistente-financeiro/index.ts`
  (`5d72611`) e não foi publicada (regra 11). Mesma pergunta, mesma
  resposta, duas vezes. Prints `q128-granabo`, `q130-granabo-resposta`.
- **S44 [P3] Resposta ao lançamento levou mais de 20 s.** "gastei 3 reais em
  AUDIT QA cafe" só teve resposta entre 20 e 30 s depois do envio (o
  indicador "Granabô está pensando…" fica na tela; a pergunta de consulta
  respondeu em menos de 8 s). Print `q132-granabo-lanca`.
- **Conferido e certo:** lançamento pelo chat diz valor, categoria, descrição
  e carteira e oferece "desfaz"; "desfaz" removeu ("Desfeito. Removi o
  último lançamento que eu tinha registrado."); indicador "pensando" com
  botão de cancelar; campo acima do teclado de letras.

### Voz no app

- **S45 [P2] Silêncio vira frase inventada e o app oferece salvar.** Passos:
  Início > "Lançamento por voz" > permitir microfone > esperar 3 s em
  silêncio (microfone do emulador é mudo) > "Encerrar gravação e lançar".
  Depois de "Transcrevendo…", abre "Confirmar lançamento" com "Ouvi: \"Acesse
  o site www.brasil-com.br para saber mais.\"", descrição "Saber mais", Saída,
  R$ 0,00 e "Salvar lançamento" ativo. Esperado: reconhecer que não houve
  fala (texto que não tem valor nem parece lançamento) e dizer "não entendi,
  tente de novo", como o descarte de eco do prompt já faz para outros casos.
  É a alucinação típica de transcrição sobre silêncio. O "Salvar" com
  R$ 0,00 deve barrar pela validação de valor (vista no S-folha), mas não
  testei para não gravar. **Regra 13:** o mesmo áudio pelo widget passa pelo
  mesmo núcleo; não verificável aqui porque o widget aborta antes (S4).
  Print `q137-voz-desfecho`.
- **S46 [P3] "Colar outro texto" na confirmação vinda da voz.** O botão
  secundário é o do colar comprovante; na voz esperava-se "Gravar de novo".
  Print `q137-voz-desfecho`.
- **S47 [P3] No app, o microfone é pedido sem explicação prévia.** O toque
  em "Lançamento por voz" abre direto o pedido do Android; o escanear nota
  mostra antes uma tela "Acesso à câmera" dizendo para que serve. Print
  `q135-voz-toque`.
- **Conferido e certo:** depois de permitir, a gravação começa no mesmo
  toque ("Ouvindo…", **A48 não reproduziu**); "Encerrar gravação e lançar"
  leva a "Transcrevendo…" com o botão marcado como ocupado; desfecho em
  menos de 8 s, sem ficar preso (A47).
- **n/v:** fala real e o resto do fluxo (valor, categoria, parcelas,
  confirmação por baixa confiança), porque o microfone do emulador é mudo.

### Voz no widget (reteste com o microfone permitido)

- **S4 isolado:** concedido o microfone pelo app, o toque no widget passou a
  gravar ("Ouvindo…"). O S4 é, portanto, só o caso "sem permissão de
  microfone", que segue sem recibo.
- **S48 [P2] Widget culpa a permissão de notificação por qualquer falha.**
  Passos: widget > gravar em silêncio > tocar para encerrar. O widget ficou
  em "Lançamento por voz precisa de permissão de notificação. Toque para
  abrir o Grana.", com `POST_NOTIFICATIONS: granted=true` e a notificação
  "Confirme o valor que ouvi" entregue ao mesmo tempo. Lido no código: o
  estado `ATENCAO` (`EstadoWidget.kt`) é aceso por três motivos em
  `lib/widget-voz-task.ts` (sem notificação, `processar` não salvou,
  exceção), mas o texto `grana_voice_atencao_desc` (`strings.xml`) só
  descreve o primeiro. Quem já tem a permissão vai procurar um problema que
  não existe. Prints `q139-widget-voz-desfecho`, `q140-notificacoes`.
- **Paridade (regra 13) conferida neste caso:** o mesmo silêncio gera a
  mesma frase inventada e a mesma decisão (pedir confirmação) no app e no
  widget; a notificação abre a mesma folha "Confirmar lançamento", e salvar
  com R$ 0,00 é barrado ("Valor inválido · Informe um valor válido em R$.").
  O S45 vale para as duas entradas. Prints `q141-notif-revisao`,
  `q142-voz-salvar-zero`.
- **S49 [P3] Duas mensagens diferentes para o mesmo valor zero.** Folha
  manual: "Informe um valor maior que zero." embaixo do botão; folha da voz:
  alerta nativo "Valor inválido". Print `q142-voz-salvar-zero`.

### Sem rede (retomado em 23/09, depois da pausa por limite de uso)

**Contorno de ambiente:** o Metro foi derrubado por falta de memória na
pausa, e com a rede do emulador desligada o APK de desenvolvimento caiu em
"Unable to load script" (`loadJSBundleFromAssets`) mesmo com `adb reverse`
ativo. Religuei a rede, deixei o bundle carregar do Metro, entrei (a sessão
estava salva) e desliguei a rede de novo com o app aberto. Não é achado do
app: um APK de release traz o bundle embutido. Print `q144-erro-bundle`.

- **S50 [P2] A57 só foi corrigido em Débito e Pix.** Sem rede, Débito e Pix
  diz "Sem conexão, mostrando dados salvos no aparelho"; Boletos e Gráficos,
  no mesmo minuto e na mesma condição, dizem "Conexão lenta, mostrando dados
  salvos no aparelho". Prints `q148-offline-lanc`, `q156-off-Boletos`,
  `q156-off-Gráficos`.
- **S51 [P1] Crédito sem rede diz que não há cartões salvos, e troca de
  ciclo.** Passos: com cartões vistos online nesta mesma instalação
  (inclusive hoje, antes da pausa), desligar a rede e abrir Crédito. Obtido:
  "Sem conexão, e ainda não há cartões salvos neste aparelho. Nada foi
  apagado." com "Tentar de novo", Total R$ 0,00 e o seletor em "Fatura de
  Setembro 2026 · Atual" (online, o ciclo atual é Outubro, "15 set a 14
  out"). A correção W1 ("Crédito offline mostra o cartão e a fatura",
  conferida em 19/09) não se repetiu: o cache de cartões não existia depois
  do reinício do app, e o ciclo offline é calculado diferente. O texto ao
  menos diz que nada foi apagado. Print `q155-off-Crédito`.
  **Intenção × implementação (skill `intended-vs-implemented`):** o
  comentário em `app/(app)/credito.tsx:314` afirma "As buscas acima têm cache
  offline, então chegar aqui quer dizer falha permanente, ou falta de rede sem
  nada guardado no aparelho", e `lib/data.ts:990-994` envolve
  `fetchCreditCards` e `fetchCreditTransactionsForMonth` com
  `comCacheOffline` persistido em AsyncStorage (`lib/cache-de-tela.ts`,
  prefixo `grana:cache:tela:`). Os cartões tinham sido lidos online nesta
  instalação, então pela intenção o cache existia. **Causa não isolada.**
  Hipóteses para quem corrigir: a leitura do usuário local offline
  (`idDoUsuarioLocal`, cujo comentário já registra que `getSession` falhava
  sem rede) devolvendo vazio, o que também explicaria a Início sem o nome
  (S52); ou chave de mês diferente, já que o seletor offline abriu em
  "Setembro" e não em "Outubro".
- **S52 [P2] Início sem rede não tem faixa de aviso e perde o nome.** "Bom
  dia" sem "Auditoria", sem faixa "Sem conexão", e os blocos mudam de lugar
  (aparece "Lançamento rápido", some "Comprometimento futuro" do topo). Os
  valores são os do cache e o lançamento offline já entra no saldo
  (− R$ 489,87). Print `q156-off-Início`.
- **A58 reproduz:** Débito e Pix promete "dados salvos" com totais em "—" e
  lista girando por ~8 s; Desafios sem rede fica só com o ponto girando, sem
  cabeçalho nem faixa. Prints `q148-offline-lanc`, `q156-off-Desafios`.
- **A59 conferido, com ressalva:** "Sem conexão. Lançamento salvo no
  aparelho", e "AUDIT QA offline R$ 7,77" aparece no topo da lista e soma nos
  totais ("Tudo (10)", Saídas R$ 489,87). **S53 [P3]:** nada distingue o
  item pendente dos sincronizados (sem ícone nem "aguardando envio"). Print
  `q152-offline-lista`.
- **A60 reproduz:** com a rede de volta (ping ok, rede ativa 103), a faixa
  seguiu "Sem conexão" por 60 s, e puxar para atualizar não resolveu; só
  trocar de aba e voltar tirou a faixa. Prints `q153-online-volta`,
  `q154-apos-trocar-aba`.
- Avisos vermelhos do LogBox ("[credito] não consegui carregar os cartões",
  `UnknownHostException`) cobrem a barra de abas e roubam toques: são de
  desenvolvimento, mas confirmam que o Crédito tentou a rede e não caiu no
  cache.

### Fonte grande do sistema (130%)

- **S54 [P3] Selo de parcela encosta no valor.** Crédito, lista da fatura:
  "AUDIT compra parcelada (1/4) [1/4x]" empurra o selo até o sinal de
  "− R$ 300,00", que fica colado nele. Print `q158-fonte-credito`.
- **S55 [P3] Desafios: título do Score cola no número, e "pontos" encosta no
  círculo.** "Composição do seu Score424/1000 pts" sem espaço entre os dois;
  no anel do topo, "pontos" toca a borda. Print `q160-fonte-desafios`.
- **Conferido e certo:** Início, Boletos, folha "Lançar compra no crédito"
  (todos os campos e o botão cabem sem rolar), cabeçalhos das abas, barra de
  abas. Fonte restaurada para 100% no fim.

## Reconferência dos achados de 19/09

| Achado | Resultado no aparelho | Print |
|---|---|---|
| A1 | **Conferido.** A fileira de atalhos termina na margem direita e o terceiro atalho aparece em parte, como pista de rolagem | `q009`, `q010` |
| A2 | **Conferido.** Mesmo sinal ("− R$") em saldo, reservado e seletor | `q009`, `q016` |
| A3 | **Conferido.** Fluxo abre em "21–25/09" (hoje é 22/09); ver S5 | `q012` |
| A4 | **Conferido.** Outros "R$ 309,80 de R$ 200,00 · excedido" com barra vermelha | `q013` |
| A5 | **Conferido.** Olho fechado borra valor, alvo e % da meta | `q014` |
| A6 | **Conferido.** "Selecionar carteira", "Adicionar carteira", "Nova carteira", "Criar carteira", "ex.:" | `q016`, `q017` |
| A7 | **Reproduz.** Dois "Cancelar" ao mesmo tempo (formulário e painel) | `q017` |
| A8 | **Conferido.** Bolinhas de cor terminam antes da borda dos campos | `q017` |
| A9 | **Conferido.** Com teclado de letras o painel fica abaixo da barra de status e "Criar carteira" aparece acima do teclado | `q018` |
| A10 | **Reproduz.** "AUDIT carteira teste" em duas linhas com espaço sobrando; o nome longo vai a três | `q016`, `q021` |
| A11 | **Reproduz (a correção não pegou).** Criada carteira de R$ 12,34, o Total seguiu "− R$ 482,10"; só fechando e reabrindo virou "− R$ 469,76" | `q020`, `q021` |
| A13 | **Conferido na folha "Nova saída".** Título abaixo da barra com teclado de letras. **Não** alcança o painel Categoria (S9) | `q028`, `q034` |
| A14 | **Conferido.** Boleto com ícone de recibo no menu do "+" | `q025` |
| A15 | **Reproduz** (decisão do autor) | `q027` |
| A70 | **Parcial.** A categoria longa aparece inteira na folha e na lista; o painel ainda encosta na barra de status com teclado (S9) | `q033`, `q034`, `q035` |
| A16 | **Conferido** para lançamento; a folha do cartão ainda diz só "Cartão" (S18) | `q037`, `q058` |
| A17 | **Conferido.** Mês vazio: "Toque no "+" para registrar o primeiro lançamento." | `q040` |
| A20 | **Conferido.** Resumo acompanha a busca | `q039` |
| A22 | **Reproduz.** Ver S16 | `q051` |
| A23 | **Conferido.** "Ciclo 15 set a 14 out" | `q043` |
| A26 | **Reproduz** (decisão do autor) | `q043` |
| A27 | **Conferido.** "Cartões & faturas" numa linha | `q043` |
| A29 | **Conferido.** Exemplos mais apagados que valores | `q044` |
| A30, A31, A36 | **Conferidos** | `q063`, `q065`, `q067` |
| A32, A33, A37 | **Conferidos** | `q071`, `q072`, `q077` |
| A34, A35 | **Reproduzem** (decisão do autor) | `q069`, `q070`, `q074` |
| A57 | **Parcial.** Certo em Débito e Pix; Boletos e Gráficos ainda dizem "Conexão lenta" (S50) | `q148`, `q156` |
| A59 | **Conferido**, sem marca de pendente (S53) | `q152` |
| A60 | **Reproduz** | `q153`, `q154` |
| W1 (Crédito offline) | **Reproduz de novo** depois de reiniciar o app (S51) | `q155` |
| A58 | **Reproduz.** Desafios abre vazio com um ponto girando mesmo com rede (S27) | `q075` |
| A42, A43, A44, A64, A67, A68 | **Conferidos** | `q098`, `q099`, `q100`, `q102`, `q103`, `q104` |
| A45 | **Reproduz.** "Voltar" rola junto; texto passa sob o relógio (S34). O título e o chip já dizem "Termos de Uso" | `q090`, `q091` |
| A69 | **n/v**: permissão já concedida nesta instalação | - |
| A46 | **Reproduz no ar** (fonte corrigido e não publicado). Ver S43 | `q130` |
| A47 | **Conferido.** Voz sai de "Transcrevendo…" em menos de 8 s | `q137` |
| A48 | **Não reproduziu** na câmera nem no microfone | `q127`, `q136` |
| A51 | **Causa provável achada:** atraso de 3 a 9 s sem recibo (S39) | `q116` |
| A52 | **Metade:** confirmação já explica o dinheiro; ainda sem editar | `q117` |
| A56 | **Conferido**, resta o "(6 meses)" quebrado | `q119` |
| A18, A39 | **Reproduz, e é esperado.** Voltar do Android no Perfil e em Boletos leva à tela inicial do sistema. O APK instalado é de 19/09 03:59, anterior ao `0d5c033` (12:55) que desliga o voltar preditivo; só uma build nova confere | - |
| A53 | **Reproduz no cartão.** "AUDIT meta viagem" aparece como "AUDIT meta via…" | `q009` |
| A63 | **Reproduz, com causa.** Ver S4 | `q008` |


## Skills usadas

- **`ui-visual-composition`** (carregada no início): roteiro de crítica
  (hierarquia, agrupamento, tipografia, cor, estados, resiliência a texto
  longo e fonte grande). Acrescentou os achados de hierarquia e estado:
  seleção de cartão sem sinal (S17), legenda sem série (S8), selos com três
  gramáticas (S29), zero com sinal (S15), texto longo e 130% (S10, S19, S54,
  S55).
- **`maestri-portal-devices`** (carregada no início): lida para entender o
  portal "QA Pixel 8", mas a operação ficou só no `scripts/emulador.cjs`, como
  o pedido mandava; o que o script não faz (rolar, rede, fonte) foi por `adb`
  direto, sem credencial.
- **`intended-vs-implemented`** (carregada na retomada): usada no S51, com a
  intenção escrita em `credito.tsx:314` e `lib/cache-de-tela.ts` contra o
  comportamento; no S48, com o estado `ATENCAO` de `EstadoWidget.kt` contra o
  texto único de `strings.xml`; e no S43 (A46), comparando o fonte corrigido
  com a resposta do servidor. Acrescentou a separação entre causa lida no
  código e hipótese nesses três.
- **Não carregadas, e por quê:** o reforço do autor com a lista inteira
  (`test-scenarios`, `impeccable`, `interface-design`, `apple-design`,
  `emil-design-eng`, `anti-ui-slop`, `review-animations`,
  `animation-vocabulary`, `find-animation-opportunities`, `copywriting`,
  `grammar-check`, `webapp-testing`) chegou quando a varredura já estava no
  bloco sem rede. A cobertura seguiu a lista de 19/09 (que já tinha saído do
  `test-scenarios`), e a regra de copy do projeto (travessão, maiúsculas de
  título, inglês) fez o papel de `copywriting` e `grammar-check`. **Movimento
  não foi auditado:** print estático e `uiautomator` não medem animação, e a
  regra 9 manda conferir movimento quadro a quadro; fica como pendência para
  uma passada com `review-animations`. `webapp-testing` é da landing, fora
  deste escopo.

## Resumo

**Cobertura:** todas as telas e abas da lista, com os estados vazio,
carregando, erro, sem rede, texto longo, valores ocultos e fonte 130%. Fora,
com motivo: nova senha (link de e-mail), assinar e ativar (conta com
cortesia), fala real (microfone mudo), dois widgets não instalados no
launcher, push FCM e lembrete agendado, OFX e QR reais, e movimento.

**55 achados novos:** 4 P1 (S4 widget de voz sem microfone morre calado; S30
ANR ao alternar Gráficos e Desafios, causa não isolada, pode ser memória do
emulador; S43 Granabô soma crédito e diz R$ 440,30 onde Gráficos diz
R$ 140,30; S51 Crédito sem rede some com os cartões e troca o ciclo), 10 P2 e
41 P3.

**Reconferências que falharam ou ficaram pela metade:** A11 (Total do
seletor só atualiza ao reabrir), A22 (outros ciclos seguem "Fatura atual"),
A46 (correção não publicada), A57 (só Débito e Pix), A60, W1 (Crédito
offline), A13 (não alcança os painéis Categoria e Nova meta), A58, A7, A10,
A45, A52 (metade), A53. **Conferidas no aparelho:** A1, A2, A3, A4, A5, A6,
A8, A9, A14, A16, A17, A20, A23, A27, A29, A30, A31, A32, A33, A36, A37, A42,
A43, A44, A47, A56, A59, A64, A67, A68; A48 não reproduziu; A51 com causa
provável (S39). A18 e A39 dependem de build nova.

**Perguntas ao autor:**
1. Os três "Cafe gelado" de 18/09 sem prefixo AUDIT são lixo de teste? Apagar?
2. Os dados AUDIT que já estavam na conta antes desta sessão ("AUDIT meta
   viagem", "AUDIT Cartao Teste0001017" com a compra de R$ 300, "AUDIT
   carteira teste", "AUDIT categoria teste", os boletos AUDIT pagos) ficam
   como massa de teste fixa ou devem ser apagados? Apaguei só o que criei.
3. Publicar a `assistente-financeiro` (A46/S43), seguindo a regra 11?
4. Termos, Privacidade e Exclusão ainda falam de WhatsApp (S33): mudar o
   texto legal?
5. Seguem abertas as decisões de produto de 19/09: A15, A26, A34, A35, A52,
   A54.

**Limpeza:** apagados carteira, categoria, cartão com compra parcelada,
boleto, meta e dois lançamentos "AUDIT QA"; o café do Granabô foi desfeito;
nada salvo pelo colar comprovante nem pela voz; feedback não enviado.
Religados a rede e o "Bloquear captura de tela"; fonte de volta a 100%;
"Modo privacidade" desligado, como estava.

**O que deu errado no caminho (meu):** um toque por posição caiu no "Excluir
conta e dados" do Perfil e abriu a confirmação com senha; cancelei, nada
aconteceu. Um `tocar` por texto casou o subtítulo da folha de guardar e o
"voltar" fechou a folha (refeito). O `scripts/emulador.cjs login` casou
"Entrar" dentro de "Já tem conta? Entrar" (ver a observação em "Entrar").
Na pausa por limite de uso, o Metro foi derrubado por falta de memória e foi
reiniciado na retomada.

## Ponto de parada (pausa pedida pelo autor, 23/09)

Varredura no aparelho **concluída**: a lista de cobertura acima está marcada
(feito = [x]; falta = só os itens [ ] marcados n/v, com motivo). Limpeza
feita, rede e bloqueio de captura religados, fonte em 100%. O `verificar-vault`
rodou e não acusou esta nota. **Falta apenas** enviar o resumo final ao Codex
(`maestri ask "Codex" "<resumo>"`, com o conteúdo da seção Resumo). O Metro
foi derrubado de novo por falta de memória na pausa e não foi reiniciado
(não é necessário: a varredura já terminou).
