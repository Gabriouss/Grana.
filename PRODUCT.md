# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Público geral no Brasil que acha o registro manual de gastos trabalhoso e
por isso desiste (planilha, app tradicional de finanças) — não um segmento
estreito. A pessoa quer saber pra onde o dinheiro foi e quanto sobra pra
gastar, sem que isso vire uma segunda tarefa administrativa no dia a dia.

## Product Purpose

Grana. é um registrador de finanças pessoais que elimina a fricção de
anotar gasto: em vez de formulário/planilha, a pessoa fala (pelo botão de
microfone do app ou pelo widget de voz do Android, com o app fechado) ou
fotografa uma nota fiscal para ler seus dados localmente e conferir a sugestão
antes de salvar.
Sucesso é a pessoa manter uma noção real do próprio dinheiro sem tratar o
registro como tarefa chata, e saber quanto tem livre pra gastar sem
precisar calcular.

## Positioning

O Grana. é um registro que a própria pessoa alimenta, e por isso oferece jeitos
rápidos de entrada: voz no app, voz no widget e foto da nota com leitura local
e revisão antes de salvar. O conjunto une categorização compartilhada da voz e
leitura da foto a um cálculo de "Livre para Gastar" do mês vigente, que
desconta os aportes líquidos do próprio mês ainda guardados em cofrinhos e o
crédito elegível ainda não pago, dividindo pelos dias restantes (regra 20 do
`AGENTS.md`). Regra de comunicação: publicidade, landing e telas não usam a
ausência de conexão bancária como argumento de venda; o assunto só aparece
como resposta neutra na FAQ.
O dia D só passa a valer quando o Sentinel o declarar após a build nova e o QA
no aparelho.

## Operating Context

Produto em português do Brasil. Pontos de entrada de um lançamento: dentro
do app (botão de microfone), pelo widget de voz do Android (com o app
fechado, tarefa headless), ou fotografando uma nota fiscal para leitura local
e revisão antes de salvar. Roda em Expo (iOS e Android) e web
(react-native-web) a partir do mesmo código e do mesmo design system — mais
uma landing page pública separada (`app/index.tsx`, só web), voltada a
quem ainda não conhece o produto, distinta da tela de entrada de quem já
tem conta. Fase atual: preparação do lançamento comercial. **O produto é pago, sem
período de teste gratuito** (decisão do autor em 28/08/2026, que encerra a
fase de acesso antecipado). São dois planos, com a taxa de serviço do gateway
já embutida no valor anunciado: **R$ 9,90 por mês** ou **R$ 97,90 por ano**
(atualizado em 10/09/2026). O gateway é a **Cakto**, e os dois checkouts
estão no ar e ligados à landing.

O bloqueio por assinatura existe de verdade: `app/_layout.tsx` protege as
telas do app por `estadoAcesso.allowed` e manda quem não tem acesso para a
tela de assinar. Ele está **ligado desde 22/09/2026** (`enforce_subscriptions = true`
 em `app_backend_config`), por decisão do autor, para não desperdiçar o
 tráfego pago com uso gratuito. A primeira venda real mensal por Pix e o
 webhook de ponta a ponta foram comprovados em 13/09/2026. As 9 contas que
 existiam na data têm cortesia sem prazo e continuam entrando; toda conta nova
 precisa assinar. No funil comercial da landing
 **não existe CTA "Criar conta"**: herói, garantia e fechamento levam à dobra
 de preços, e os botões dos planos levam diretamente aos checkouts da Cakto.
 A criação ou entrada na conta é uma etapa operacional separada da compra.

**O WhatsApp está desligado por tempo indeterminado** (decisão do autor em
05/09/2026, depois de um segundo banimento de contas na Meta), e em
09/09/2026 ele foi despriorizado também como produto: "Esquece WhatsApp. Não
sei nem se iremos voltar a utilizar." Não propor nem executar trabalho de
evolução desse canal. O selo "WhatsApp oficial, verificado pela Meta" **não
pode mais ser usado publicamente** e foi retirado da landing; a dobra do
Granabô saiu junto, e o componente de conversa ficou guardado no repositório,
desconectado.

## Capabilities and Constraints

- Nunca se conecta a banco ou Open Finance: é sempre autodeclarado. É uma
  restrição de produto e de privacidade, e não entra em publicidade como
  vantagem.
- Voz no app e no widget compartilha a heurística de categorização
  (`lib/heuristics.ts`); foto da nota usa OCR local e revisão antes de salvar. O
  webhook do WhatsApp espelha essa heurística e continua recebendo correção
  por higiene de código, para as cópias não divergirem, mas o canal está
  desligado e a função não é republicada.
- Funcionalidades centrais: lançamentos com valor/categoria/data, cálculo
  de "Livre para Gastar" (saldo de caixa do mês menos aportes líquidos deste
  mês ainda guardados e crédito elegível ainda não pago, pelos dias restantes),
  segurança (bloqueio por biometria/senha do aparelho, modo privacidade
  que oculta valores, senha conferida contra vazamentos, bloqueio de
  print em tela com valor).
- Não movimenta dinheiro nem processa pagamento — é só registro.
- Monetização definida: assinatura recorrente de R$ 9,90/mês ou R$ 97,90/ano,
  vendida pela **Cakto** e cancelável a qualquer momento. A vigência continua
  controlada por `subscriptions.access_until`; cancelamento interrompe
  renovações futuras sem retirar o período que já foi pago. Os dois checkouts
  estão no ar, e o caminho completo foi **provado com a primeira venda real
  em 13/09/2026** (Pix, plano mensal): pagamento, aviso do webhook, assinatura
  e vínculo com a conta. Renovação, reembolso, cartão e plano anual ainda não
  tiveram tráfego real. O bloqueio foi **ligado em 22/09/2026**. Os testes do
  mesmo dia acharam dois pontos em que quem pagou pode não chegar ao app sem
  ajuda: a compra com e-mail diferente do da conta não se vincula sozinha, e o
  link de confirmação do cadastro feito pela web abre o navegador, não o app
  (não há App Links). Ver o `context.md` de 22/09.
- O preço **já foi validado** comercialmente e no fluxo real de compra. Nos
  criativos, anúncios, capas e legendas, porém, não divulgar os valores exatos
  mensal ou anual. A única formulação de preço permitida nessas peças é
  **"menos de R$ 0,37 por dia"**. Os valores completos ficam na landing, no
  checkout e na documentação interna.
- O parcelamento do plano anual **não fecha no preço cheio**: a Cakto cobra o
  juro-base dela do comprador (23,94% em 12x), e a interface pública só
  permite acrescentar juro por cima, nunca remover. Por isso nenhuma
  superfície anuncia valor de parcela.
- Backend Supabase no plano Free — soluções não podem depender de recurso
  exclusivo do plano Pro.
- Repositório trabalhado em duas máquinas diferentes pelo mesmo autor —
  não afeta decisão de produto, mas é uma restrição permanente de como o
  trabalho é publicado (ver `AGENTS.md`).

### Saldo e Livre para Gastar: só o mês vigente (decisão de 24/09, complementada em 17/10/2026)

"Saldo atual" e "Livre para Gastar" contam apenas o mês vigente, nunca o
saldo acumulado de meses anteriores nem `initial_balance`. O mesmo número vale
na Início, nos widgets e no Granabô. O seletor de carteira mostra outra
grandeza, com outro nome: o total de todas as entradas da carteira, em todo o
período, sem a palavra "saldo". O campo "saldo inicial" sai da tela e a coluna
fica no banco sem uso.

O saldo atual considera entradas e saídas efetivamente registradas no caixa
durante o mês; compras no crédito ficam fora desse saldo. O pedido expresso do
autor em 17/10/2026 complementou o cálculo do Livre:

- Dinheiro que já estava guardado em um cofrinho pode ser registrado sem criar
  receita do mês. A origem do aporte distingue dinheiro "Já estava guardado"
  do "Do dinheiro deste mês". O valor anterior não aparece nas entradas ou
  saídas de débito/Pix, não muda o saldo nem reduz o Livre deste mês. Somente o
  valor líquido que veio do caixa do mês vigente e continua guardado reduz o
  Livre. Resgatar dinheiro anterior também não cria receita. Saldos antigos
  sem origem comprovável são considerados anteriores; não se inventa
  procedência passada.
- Faturas de crédito reduzem o Livre antes de serem pagas: contam a fatura
  aberta do ciclo atual e faturas fechadas com saldo não pago. Parcelas de
  ciclos futuros não entram. Se houver pagamento parcial, só o valor ainda
  não pago permanece reservado; o pagamento feito já sai do caixa no mês do
  pagamento, sem dupla contagem.

A fórmula é max(0, saldo de caixa do mês − aportes líquidos deste mês ainda
guardados em cofrinhos − crédito elegível ainda não pago) ÷ dias restantes,
incluindo hoje. No exemplo aprovado pelo autor, R$ 5.000 recebidos menos
R$ 3.000 de conta já pagos, R$ 1.000 guardados do dinheiro deste mês e
R$ 750 de fatura não paga deixam R$ 250 livres antes da divisão pelos dias
restantes.

Boleto ou conta pendente ou atrasada continua sem descontar nada do Livre;
entra quando é marcada como paga e o dinheiro sai no Pix ou débito (decisão
de 25/09). A linha "Contas a vencer" permanece fora do cartão. Essa regra 20
desfaz o acumulado de 19/09 (867e1b5, achado A12), que com histórico
importado incompleto ficava muito acima da realidade. Mudanças no cálculo
exigem pedido explícito do autor, e o teste de trava só muda para codificar
uma ordem explícita como a de 17/10, nunca para fazer uma regressão passar.

## Brand Commitments

- Nome "Grana." — o ponto final faz parte da marca, sempre incluído.
- Neue Machina é a ÚNICA fonte do produto — marca, títulos, corpo,
  controles, campos e dados, sem exceção e em toda plataforma. Só em Light
  e Regular; nunca sintetizar bold nos arquivos Neue Machina. Proibido usar
  fonte do sistema (San Francisco, Roboto, `system-ui`) em qualquer papel —
  uma rodada anterior trocou o corpo do app pra fonte do sistema achando
  que era exigência de Dynamic Type/sp, e foi revertida: texto de fonte
  customizada já escala normalmente, não havia troca nenhuma a fazer.
- Paleta petróleo/menta escura (`lib/theme.ts`) é a paleta fixa da marca.
- O símbolo da marca inclui o ponto; o gradiente atravessa a peça inteira
  como um objeto único (nunca reinicia por elemento); o ícone do app usa a
  variante circular da marca.

## Evidence on Hand

- Sem depoimento, case ou imprensa reais ainda — produto pré-lançamento; não
  inventar nenhum.
- Telas reais do produto já são usadas como prova visual na landing page
  (o mock do herói reaproveita a linguagem visual real da lista de
  lançamentos, o mock de "Livre para Gastar" reaproveita o componente
  `PieChart` real e as cores reais de categoria de `lib/heuristics.ts`) —
  tratar a UI real do app como fonte de verdade pra qualquer mock de
  landing page, não inventar uma versão mais bonita e fictícia.
- Preço validado: R$ 9,90/mês e R$ 97,90/ano, exibidos como números reais na
  dobra de preços da landing page e confirmados no fluxo da Cakto. O anual
  lidera o cartão. Para criativos, anúncios, capas e legendas vale a restrição
  acima: sem preço exato; no máximo, "menos de R$ 0,37 por dia".

## Product Principles

1. Nunca pedir credencial bancária — privacidade acima de conveniência por
   agregação é uma troca permanente, não um atalho de fase 1.
2. Registrar um lançamento tem que levar segundos e não exigir navegação —
   voz e foto da nota existem porque até uma tela de "adicionar rápido" ainda é
   fricção demais pro usuário-alvo, e o widget de voz existe porque abrir o
   app já é navegação.
3. Mostrar quanto é seguro gastar, não só o que já foi gasto — o
   diferenciador do produto é um número que olha pra frente (Livre para
   Gastar), não um extrato histórico.
4. Verdade do produto acima de invenção decorativa — superfícies de
   marketing (landing page) reaproveitam telas/cores/componentes reais em
   vez de inventar versões fictícias mais bonitas.
5. Uma identidade só, expressa no idioma de cada plataforma — paleta, voz,
   marca e tipografia (sempre Neue Machina) fazem web, iOS e Android lerem
   como o mesmo produto; só navegação e controles nativos (tab bar, switch,
   gestos do sistema) respeitam as convenções de cada plataforma. Tipografia
   nunca é uma dessas convenções — ver Brand Commitments.

## Copy and Marketing Guidelines

- **Conceito de dor sem rótulo explícito (decisão do autor em 18/09/2026):**
  O "apagão financeiro" (a dor de ver o saldo evaporar sem saber onde, gastar
  no escuro, medo de abrir o extrato, a surpresa com a fatura fechada) é um
  modelo conceitual interno que define a dor e o inimigo do público, mas
  **NUNCA DEVE SER NOMEADO EXPLICITAMENTE**. Proibido usar a expressão
  "apagão financeiro" em qualquer copy externa, anúncio, vídeo, post,
  carrossel, e-mail ou landing page. Descrever a dor sempre de forma direta,
  tangível e situacional ("gastar no escuro", "não saber para onde o dinheiro
  foi", "o saldo que sumiu antes do fim do mês").
- **Diferencial central permanente:** A **praticidade** de uso (voz, colar
  o Pix, fotografar a nota com revisão e consultar quanto pode gastar hoje,
  sem planilhas). Ausência de conexão bancária não entra como
  argumento de venda, conforme a regra de comunicação na seção Positioning.
- **Criativos sem rosto do autor nesta fase (decisão de 25/09/2026):** nenhum
  criativo usa o rosto, a imagem ou a voz do autor. O conceito de fundador
  falando para a câmera fica fora da aprovação inicial; o Beacon deve propor
  um substituto antes de qualquer produção.
- **Produção com IA e prompts por peça (decisão de 25/09/2026):** vídeos podem
  usar modelos fictícios, narração, imagem e demais elementos gerados pelo
  conector da ElevenLabs. Todo plano, calendário, roteiro ou briefing traz,
  para cada peça, prompts prontos de cena/imagem, personagem fictício
  consistente entre peças, narração/voz e texto na tela. Peça sem prompts é
  incompleta. Telas do app continuam sendo capturas reais em Dados de exemplo.
  Pessoa fictícia demonstra o uso, mas nunca se apresenta como cliente real ou
  dá depoimento de resultado, conforme CDC/CONAR; seguir a política de conteúdo
  gerado por IA da plataforma.

## Estado da retirada do QR em 15/10/2026

O leitor QR foi desativado em b2c3eaa e seus arquivos órfãos removidos em
1def588. A copy foi conciliada até 5944921, aprovado por Watchtower e pelo
gate final do Forge. Esse código e cameraPermission exigem build nova para
alcançar o APK instalado; o push não atualiza binários antigos. O dia D continua
condicionado à build e ao QA previstos acima.
