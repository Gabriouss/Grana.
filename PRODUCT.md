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
aponta a câmera pro QR Code de uma nota fiscal — o lançamento é reconhecido
e categorizado sozinho.
Sucesso é a pessoa manter uma noção real do próprio dinheiro sem tratar o
registro como tarefa chata, e saber quanto tem livre pra gastar sem
precisar calcular.

## Positioning

O Grana. nunca se conecta ao banco do usuário — não pede login bancário,
não usa Open Finance, não é um agregador. É um registro que a própria
pessoa alimenta, e é exatamente por isso que ele pode oferecer os jeitos
rápidos de entrada (voz no app, voz no widget, QR de nota) sem pedir
credencial nenhuma. O mecanismo que um concorrente não copia casualmente:
entrada por voz/QR alimentando um categorizador automático, mais um cálculo de
"Livre para Gastar" que desconta contas e parcelas futuras já agendadas —
apps que exigem conexão bancária trocam privacidade por conveniência; o
Grana. entrega a conveniência sem essa troca.

## Operating Context

Produto em português do Brasil. Pontos de entrada de um lançamento: dentro
do app (botão de microfone), pelo widget de voz do Android (com o app
fechado, tarefa headless), ou fotografando o QR Code (NFC-e) de uma nota
fiscal. Roda em Expo (iOS e Android) e web
(react-native-web) a partir do mesmo código e do mesmo design system — mais
uma landing page pública separada (`app/index.tsx`, só web), voltada a
quem ainda não conhece o produto, distinta da tela de entrada de quem já
tem conta. Fase atual: preparação do lançamento comercial. **O produto é pago, sem
período de teste gratuito** (decisão do autor em 28/08/2026, que encerra a
fase de acesso antecipado). São dois planos, com a taxa de serviço do gateway
já embutida no valor anunciado: **R$ 9,90 por mês** ou **R$ 97,90 por ano**
(atualizado em 11/09/2026). O gateway é a **Cakto**, e os dois checkouts
estão no ar e ligados à landing.

O bloqueio por assinatura existe de verdade: `app/_layout.tsx` protege as
telas do app por `estadoAcesso.allowed` e manda quem não tem acesso para a
tela de assinar. Ele está **desligado por interruptor** (`enforce_subscriptions`
em `app_backend_config`), porque nenhuma compra de teste foi feita ainda e
nenhum evento da Cakto jamais chegou. As contas existentes têm cortesia sem
prazo. Por isso o CTA principal da landing continua sendo "Criar minha
conta", e só a dobra de preços leva ao pagamento.

**O WhatsApp está desligado por tempo indeterminado** (decisão do autor em
05/09/2026, depois de um segundo banimento de contas na Meta), e em
09/09/2026 ele foi despriorizado também como produto: "Esquece WhatsApp. Não
sei nem se iremos voltar a utilizar." Não propor nem executar trabalho de
evolução desse canal. O selo "WhatsApp oficial, verificado pela Meta" **não
pode mais ser usado publicamente** e foi retirado da landing; a dobra do
Granabô saiu junto, e o componente de conversa ficou guardado no repositório,
desconectado.

## Capabilities and Constraints

- Nunca se conecta a banco/Open Finance — é sempre autodeclarado. Restrição
  de privacidade deliberada, não uma feature que falta.
- Os mecanismos de entrada (voz no app, voz no widget do Android, QR de
  nota) caem na mesma heurística de categorização (`lib/heuristics.ts`). O
  webhook do WhatsApp espelha essa heurística e continua recebendo correção
  por higiene de código, para as cópias não divergirem, mas o canal está
  desligado e a função não é republicada.
- Funcionalidades centrais: lançamentos com valor/categoria/data, cálculo
  de "Livre para Gastar" (desconta contas e parcelas futuras já agendadas),
  segurança (bloqueio por biometria/senha do aparelho, modo privacidade
  que oculta valores, senha conferida contra vazamentos, bloqueio de
  print em tela com valor).
- Não movimenta dinheiro nem processa pagamento — é só registro.
- Monetização definida: assinatura recorrente de R$ 9,90/mês ou R$ 97,90/ano,
  vendida pela **Cakto** e cancelável a qualquer momento. A vigência continua
  controlada por `subscriptions.access_until`; cancelamento interrompe
  renovações futuras sem retirar o período que já foi pago. Os dois checkouts
  estão no ar e o webhook comercial existe, mas **nunca recebeu tráfego
  real** — a integração inteira foi escrita contra a documentação. O bloqueio
  está implementado e desligado por interruptor até a primeira compra de
  teste provar o caminho.
- O parcelamento do plano anual **não fecha no preço cheio**: a Cakto cobra o
  juro-base dela do comprador (23,94% em 12x), e a interface pública só
  permite acrescentar juro por cima, nunca remover. Por isso nenhuma
  superfície anuncia valor de parcela.
- Backend Supabase no plano Free — soluções não podem depender de recurso
  exclusivo do plano Pro.
- Repositório trabalhado em duas máquinas diferentes pelo mesmo autor —
  não afeta decisão de produto, mas é uma restrição permanente de como o
  trabalho é publicado (ver `AGENTS.md`).

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
- Preço decidido: R$ 9,90/mês e R$ 97,90/ano, exibidos como número real na
  dobra de preços da landing page. O anual lidera o cartão.

## Product Principles

1. Nunca pedir credencial bancária — privacidade acima de conveniência por
   agregação é uma troca permanente, não um atalho de fase 1.
2. Registrar um lançamento tem que levar segundos e não exigir navegação —
   voz e QR existem porque até uma tela de "adicionar rápido" ainda é
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
