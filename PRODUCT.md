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
anotar gasto: em vez de formulário/planilha, a pessoa fala, manda uma
mensagem no WhatsApp (texto ou áudio), ou aponta a câmera pro QR Code de
uma nota fiscal — o lançamento é reconhecido e categorizado sozinho.
Sucesso é a pessoa manter uma noção real do próprio dinheiro sem tratar o
registro como tarefa chata, e saber quanto tem livre pra gastar sem
precisar calcular.

## Positioning

O Grana. nunca se conecta ao banco do usuário — não pede login bancário,
não usa Open Finance, não é um agregador. É um registro que a própria
pessoa alimenta, e é exatamente por isso que ele pode oferecer os três
jeitos de entrada (voz, WhatsApp, QR de nota) sem pedir credencial nenhuma.
O mecanismo que um concorrente não copia casualmente: entrada por voz/
WhatsApp/QR alimentando um categorizador automático, mais um cálculo de
"Livre para Gastar" que desconta contas e parcelas futuras já agendadas —
apps que exigem conexão bancária trocam privacidade por conveniência; o
Grana. entrega a conveniência sem essa troca.

## Operating Context

Produto em português do Brasil. Pontos de entrada de um lançamento: dentro
do app (botão de microfone), pelo WhatsApp (texto ou áudio pra um número
dedicado, processado por uma Edge Function/webhook), ou fotografando o QR
Code (NFC-e) de uma nota fiscal. Roda em Expo (iOS e Android) e web
(react-native-web) a partir do mesmo código e do mesmo design system — mais
uma landing page pública separada (`app/index.tsx`, só web), voltada a
quem ainda não conhece o produto, distinta da tela de entrada de quem já
tem conta. Fase atual: acesso antecipado ("acesso antecipado" na própria
landing page, criar conta é livre por enquanto). A integração de WhatsApp
passa por revisão da Meta como app do WhatsApp Business.

## Capabilities and Constraints

- Nunca se conecta a banco/Open Finance — é sempre autodeclarado. Restrição
  de privacidade deliberada, não uma feature que falta.
- Três mecanismos de entrada (voz, WhatsApp texto/áudio, QR de nota) caem
  na mesma heurística de categorização (`lib/heuristics.ts`, espelhada no
  webhook do WhatsApp).
- Funcionalidades centrais: lançamentos com valor/categoria/data, cálculo
  de "Livre para Gastar" (desconta contas e parcelas futuras já agendadas),
  segurança (bloqueio por biometria/senha do aparelho, modo privacidade
  que oculta valores, senha conferida contra vazamentos, bloqueio de
  print em tela com valor).
- Não movimenta dinheiro nem processa pagamento — é só registro.
- Monetização planejada: infoproduto vendido por uma plataforma tipo
  Kiwify/Hotmart, com acesso por período fixo (não é assinatura recorrente
  direta) — outorga controlada por `subscriptions.access_until`. Ainda não
  lançado: preço em definição (a própria landing mostra "Preço em
  definição"), e o produto/webhook da Kiwify ainda não está totalmente
  configurado.
- Backend Supabase no plano Free — soluções não podem depender de recurso
  exclusivo do plano Pro.
- Repositório trabalhado em duas máquinas diferentes pelo mesmo autor —
  não afeta decisão de produto, mas é uma restrição permanente de como o
  trabalho é publicado (ver `AGENTS.md`).

## Brand Commitments

- Nome "Grana." — o ponto final faz parte da marca, sempre incluído.
- Tipografia Neue Machina, só Light e Regular — não existe peso bold;
  `fontWeight` nunca deve ser usado (o nativo ignora, a web sintetiza um
  falso negrito, e as duas plataformas divergiam visualmente).
- Paleta petróleo/menta escura (`lib/theme.ts`) é a paleta fixa da marca.
- O símbolo da marca inclui o ponto; o gradiente atravessa a peça inteira
  como um objeto único (nunca reinicia por elemento); o ícone do app usa a
  variante circular da marca.

## Evidence on Hand

- Sem depoimento, case ou imprensa reais ainda — produto pré-lançamento
  ("acesso antecipado"); não inventar nenhum.
- Telas reais do produto já são usadas como prova visual na landing page
  (o mock do herói reaproveita a linguagem visual real da lista de
  lançamentos, o mock de "Livre para Gastar" reaproveita o componente
  `PieChart` real e as cores reais de categoria de `lib/heuristics.ts`) —
  tratar a UI real do app como fonte de verdade pra qualquer mock de
  landing page, não inventar uma versão mais bonita e fictícia.
- Preço ainda não decidido; a landing atual mostra "Preço em definição" em
  vez de um número.

## Product Principles

1. Nunca pedir credencial bancária — privacidade acima de conveniência por
   agregação é uma troca permanente, não um atalho de fase 1.
2. Registrar um lançamento tem que levar segundos e não exigir navegação —
   voz/WhatsApp/QR existem porque até uma tela de "adicionar rápido" ainda
   é fricção demais pro usuário-alvo.
3. Mostrar quanto é seguro gastar, não só o que já foi gasto — o
   diferenciador do produto é um número que olha pra frente (Livre para
   Gastar), não um extrato histórico.
4. Verdade do produto acima de invenção decorativa — superfícies de
   marketing (landing page) reaproveitam telas/cores/componentes reais em
   vez de inventar versões fictícias mais bonitas.
5. Uma linguagem de design só, em toda plataforma — web, iOS e Android
   leem como o mesmo produto; diferença de plataforma é detalhe de
   implementação, não decisão de design.
