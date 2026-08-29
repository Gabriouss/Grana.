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
tem conta. Fase atual: preparação do lançamento comercial. **O produto será pago desde
o primeiro dia: assinatura de R$ 9,90/mês, sem período de teste gratuito**
(decisão do autor em 28/08/2026, que encerra a fase de acesso antecipado).
A landing já anuncia o preço. O checkout da Kiwify ainda não existe e não há
bloqueio de acesso no app, então quem cria conta hoje continua com acesso
completo; por isso o CTA da landing é "Criar minha conta", nunca uma promessa
de compra. A empresa Grana. está **verificada pela Meta**
e o WhatsApp é um canal oficial e operacional (confirmado pelo autor em
28/08/2026); a revisão terminou, não está mais pendente.

Como usar isso publicamente: "WhatsApp oficial, verificado pela Meta" é fato
verificável e pode aparecer na landing. O que a verificação NÃO é: endosso do
produto, selo de segurança financeira ou garantia de resultado — nunca
apresentá-la perto do bloco de segurança de um jeito que insinue isso.

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
- Monetização definida: assinatura recorrente de R$ 9,90/mês, vendida por
  uma plataforma como Kiwify/Hotmart e cancelável a qualquer momento. A
  vigência continua controlada por `subscriptions.access_until`; cancelamento
  interrompe renovações futuras sem retirar o período que já foi pago. O
  checkout e o webhook comercial ainda não estão operacionais e
  `temAssinaturaAtiva()` (`lib/assinatura.ts`) não é chamada em tela nenhuma,
  então na prática ainda não existe paywall.
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
- Preço decidido: R$ 9,90/mês, exibido como número real na seção "Quanto
  custa" da landing page.

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
5. Uma identidade só, expressa no idioma de cada plataforma — paleta, voz,
   marca e tipografia (sempre Neue Machina) fazem web, iOS e Android lerem
   como o mesmo produto; só navegação e controles nativos (tab bar, switch,
   gestos do sistema) respeitam as convenções de cada plataforma. Tipografia
   nunca é uma dessas convenções — ver Brand Commitments.
