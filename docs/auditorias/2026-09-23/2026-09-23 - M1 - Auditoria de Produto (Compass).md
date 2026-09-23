---
tags: [grana, auditoria]
tipo: registro
data: 2026-09-23
---

# 2026-09-23 - M1 - Auditoria de Produto (Compass)

**Pedido.** Do autor, repassado pelo Codex: "auditoria rigorosa de seus
próprios segmentos dentro do projeto. Ao terminarem, documentem todos os
achados." Segmento do Compass (Product Planner): PRODUCT.md,
PLANO_DE_EVOLUCAO.md e docs/ contra o que o app entrega; promessas da landing
e do app; jornada do cliente; onboarding; paywall e cortesia; decisões
pendentes A15, A26, A34, A35, A52, A54; coerência de preço com
[[Preço Vigente e Parcelamento - Cakto]].

Só leitura. Nada alterado em código, banco, Supabase, Vercel, Cakto, Resend
ou EAS. Nenhum commit. Emulador não usado (em uso pelo Sentinel).

**Skills usadas.** Oito, detalhadas na seção "Skills" no fim da nota.
Ferramentas: leitura do repositório, consultas só de leitura à produção e o
portal "Navegador Compass" (landing e app web, 390x844).

**Resumo:** 14 achados. P1: nenhum. P2: C1, C2, C3, C5, C6, C7, C14. P3: C4,
C8 a C13.

## Cobertura

- [x] `PRODUCT.md` contra o código (C1, C11)
- [x] `PLANO_DE_EVOLUCAO.md` contra o código (C11; arquivos dos épicos 1 a 4 existem)
- [x] Promessas da landing ao vivo, lidas pelo navegador, contra o código (C8, C9, C13; 10 promessas conferidas batem)
- [x] Jornada: descoberta, compra, cadastro, paywall, primeiro uso, hábito, renovação (C2 a C7, C12)
- [x] Paywall e cortesia: guarda de rotas, `/assinar`, `/ativar`, cortesias em produção (9 internas, 1 paga)
- [x] Onboarding (C12)
- [x] Coerência de preço com a nota de preço (bate; pendências da nota velhas, C11)
- [x] Decisões pendentes A15, A26, A34, A35, A52, A54 (recomendação abaixo)
- [x] Texto legal (C10)
- [x] Notificações em produção (comprovado que entregam)
- [~] `docs/`: lidos só `mapa-do-app-para-agentes.md`, pelo índice, e as notas de sessão. **Não** lidos um a um os 15 itens de `docs/` (auditorias antigas, planos em `superpowers/`). Motivo: tempo; são registros datados, não promessas ao cliente
- [ ] App web logado a fundo: interrompido ao perceber que a conta de teste é a do autor (C14)
- [ ] Tela depois da confirmação de e-mail com conta nova: exige caixa real ou Admin API (pendente de 22/09)
- [ ] Android, widgets, voz, biometria: emulador em uso pelo Sentinel
- [ ] Concorrentes: não comparados
- [ ] Feedbacks reais de usuários (`Feedbacks/`): não lidos

Cobertura estimada do segmento: **cerca de 80%**.

**Pausa (23/09, pedida pelo autor pelo limite de uso):** a auditoria já estava
concluída e o relatório tinha sido enviado ao Codex. Não há passo em
andamento. Ao retomar, faltam só os itens `[ ]` e `[~]` acima.

Consultas à produção, todas só de leitura (`read_only: true` na Management
API, token lido dentro do processo): `push_tokens`, `push_habit_deliveries`,
`cron.job`, `cron.job_run_details`, `subscriptions` (contagem),
`app_backend_config`, `auth.users` (contagem e e-mail mascarado).

## Achados

Formato: identificador, gravidade (P1 crítico, P2 médio, P3 baixo), onde,
evidência, esperado x encontrado, status da prova, sugestão.

### C1 [P2] Livre para Gastar ignora a fatura do cartão que vence no mês

- **Onde:** `lib/safe-to-spend.ts:42-72`, `app/(app)/index.tsx:598-617`,
  `lib/widgets-home-snapshot.ts:148`.
- **Evidência:** a conta é saldo de caixa − `bills` com `status = 'due'` no
  mês − cofrinhos. Compra no crédito é tirada do caixa
  (`walletCashTransactions` filtra `!isCreditTx`) e **nenhum caminho
  transforma a fatura aberta em conta a pagar**: não há `bill` de fatura
  (busca por `fatura`/`invoice` em `lib/data.ts` e `lib/types.ts` sem
  resultado).
- **Esperado:** `PRODUCT.md` (Positioning e Capabilities): "cálculo de 'Livre
  para Gastar' que desconta contas e parcelas futuras já agendadas" e o
  Princípio 3, "um número que olha pra frente". A landing mostra o card com
  "Contas a vencer este mês".
- **Encontrado:** quem gastou R$ 1.000 no cartão com fatura vencendo este mês
  vê o Livre para Gastar R$ 1.000 maior do que deveria. O número principal do
  produto erra para cima justamente para o usuário de cartão.
- **Status:** COMPROVADO por leitura do código. NÃO executado com dado real
  nem no emulador.
- **Sugestão:** descontar a fatura aberta cujo vencimento cai no mês (ou todas
  as faturas fechadas não pagas), com linha própria no detalhamento ("Faturas
  de cartão a pagar"). É mudança na fonte única, que vale para Home e widgets.
  Não achei registro anterior deste ponto no `context.md` nem no vault.

### C2 [P2] Tela de assinar não tem saída: sem "Sair da conta" nem exclusão

- **Onde:** `app/_layout.tsx:342-344` (com `allowed === false` só a rota
  `assinar` existe) e `app/assinar.tsx` inteiro (nenhum `signOut`).
- **Esperado:** quem cai no paywall com a conta errada (por exemplo, pagou com
  outro e-mail, caso já registrado em 22/09) precisa conseguir sair e entrar
  com a outra conta. Landing e FAQ prometem "exclua seus dados pelo próprio
  aplicativo".
- **Encontrado:** a tela só tem os planos, "Já paguei — verificar acesso" e,
  em `past_due`, suporte. Não há como sair da conta nem excluir os dados sem
  pagar. No navegador a pessoa ainda pode limpar os dados do site; no app
  Android fica presa.
- **Status:** COMPROVADO por leitura; não reproduzido na tela (a conta AUDIT
  não confirmada não passa do login).
- **Sugestão:** botões secundários "Entrar com outra conta" e "Excluir minha
  conta" na tela de assinar. Liga com o vínculo por e-mail diferente
  (`context.md`, 22/09).

### C3 [P2] Assinante que deixa de pagar perde o acesso aos próprios dados

- **Onde:** mesma guarda de `app/_layout.tsx:339-344`.
- **Encontrado:** com a assinatura vencida, o `(app)` inteiro fecha. Não há
  modo leitura, exportação (o PDF de `lib/pdf-report.ts` fica atrás da guarda)
  nem exclusão pelo app.
- **Esperado:** confiança num app de finanças, e a promessa da FAQ "você pode
  excluir sua conta e seus dados quando quiser, pelo próprio aplicativo".
  A LGPD prevê portabilidade.
- **Status:** COMPROVADO por leitura da guarda. É HIPÓTESE que isso vire
  reclamação ou problema jurídico; a página `app/exclusao-de-dados.tsx` existe
  fora da guarda e não foi lida a fundo.
- **Sugestão:** decisão do autor. Mínimo: exportar e excluir disponíveis na
  tela de assinar.

### C4 [P3] "Seu controle financeiro continua." para quem nunca usou

- **Onde:** `app/assinar.tsx:66`.
- **Encontrado:** o título foi escrito para quem perdeu acesso. Desde 22/09
  toda conta nova cai aqui antes do primeiro uso, e "continua" não faz
  sentido para ela. Na mesma tela, "Já paguei — verificar acesso" usa
  travessão (regra de copy).
- **Status:** COMPROVADO por leitura.
- **Sugestão:** título por estado: conta nova ("Falta um passo para começar")
  e conta vencida (o atual).

### C5 [P2] O checkout aberto de dentro do app não leva o e-mail da conta

- **Onde:** `app/assinar.tsx:130-160` (`Linking.openURL(destinoAnual)` e
  `destinoCompra` sem parâmetro).
- **Encontrado:** a pessoa já está logada e é mandada ao checkout da Cakto sem
  o e-mail preenchido e sem aviso de que precisa usar o mesmo. Se digitar
  outro, cai no caso sem vínculo automático, já registrado em 22/09
  (`app/ativar.tsx`, token inalcançável).
- **Status:** COMPROVADO por leitura. NÃO verificado se o checkout da Cakto
  aceita e-mail pré-preenchido por parâmetro de URL.
- **Sugestão:** conferir na documentação da Cakto se o checkout aceita
  `?email=`; se aceitar, passar o e-mail da sessão. Se não aceitar, escrever
  acima do botão "use o e-mail {email} no pagamento".

### C6 [P2] O assinante não vê nem administra a assinatura no app

- **Onde:** `app/(app)/perfil.tsx` (nenhuma seção de assinatura; busca por
  "assinatura", "cancel" e `BILLING_URL` só acha `app/assinar.tsx:39`). Visto
  pelo navegador no Perfil da web em 23/09: Conta, Preferências,
  Notificações, Personalização, Perfil financeiro, Legal, Sair, Excluir. Nada
  sobre plano, vencimento ou cancelamento.
- **Esperado:** `PRODUCT.md`: "cancelável a qualquer momento". O Código de
  Defesa do Consumidor pede que cancelar seja tão fácil quanto contratar.
- **Encontrado:** quem paga não sabe pelo app qual plano tem, até quando vale
  nem como cancelar. `EXPO_PUBLIC_BILLING_URL` só aparece no estado
  `past_due`. A falta de caminho de cancelamento já estava registrada como
  pergunta em [[Preço Vigente e Parcelamento - Cakto]] ("Como o assinante
  cancela"). O que esta auditoria acrescenta é a falta da tela no app.
- **Status:** COMPROVADO por leitura e pelo navegador.
- **Sugestão:** um bloco "Assinatura" no Perfil com plano, `access_until`,
  cortesia ou pago, e "Cancelar ou mudar forma de pagamento", que leva ao
  portal do comprador da Cakto ou, sem portal, a instruções e ao e-mail de
  suporte.

### C7 [P2] O funil não tem medição nenhuma

- **Onde:** landing ao vivo (`curl` da home sem `fbq`, `gtag` nem
  `googletagmanager`) e o código (nenhum SDK de analytics em `app/`,
  `components/` e `lib/`). Só existe o repasse de UTM (`comAtribuicao`,
  `app/index.tsx:94`).
- **Encontrado:** não há como medir visita → clique no plano → compra →
  cadastro → primeiro lançamento → retenção. O Pixel já está listado como
  pré-requisito no [[Plano de Tráfego Pago - Primeiros 100 Assinantes]]
  (item 1), então **isto não é achado novo sobre o anúncio**. O que faltava
  registrar é o lado do produto: nenhum evento de ativação (primeiro
  lançamento, voz, widget) é medido, e sem isso não dá para saber se a
  assinatura sobrevive ao primeiro mês.
- **Status:** COMPROVADO (HTML ao vivo e busca no código).
- **Sugestão:** ver "Métrica norte" abaixo. Mínimo, sem SDK novo: uma
  consulta SQL que conte quantas contas pagas lançaram 3 ou mais vezes na
  primeira semana.

### C8 [P3] A FAQ da landing descreve a conta antiga do Livre para Gastar

- **Onde:** `app/index.tsx:726`: "A partir do saldo dos seus lançamentos do
  mês…". O código (`lib/safe-to-spend.ts:12-27`) usa o saldo ACUMULADO mais o
  saldo inicial das carteiras desde a correção do A12, em 19/09.
- **Status:** COMPROVADO por leitura. Junto com o C1, a FAQ também não diz
  que a fatura do cartão fica de fora.
- **Sugestão:** reescrever a resposta depois de decidir o C1.

### C9 [P3] Landing diz "Um único plano" e oferece dois

- **Onde:** landing ao vivo, dobra de preços: "Um único plano, com tudo
  incluído." logo acima das abas Anual e Mensal. A FAQ diz "São dois planos".
- **Status:** COMPROVADO (texto capturado pelo navegador em 23/09).
- **Sugestão:** "Os dois planos liberam tudo, sem versão limitada."

### C10 [P3] Termos e Privacidade descrevem o WhatsApp como recurso ativo

- **Onde:** `lib/legal-content.ts:56, 75, 89, 103, 170, 179, 191, 240`
  (9 menções): "se você ativar o lançamento por WhatsApp…", "Meta / WhatsApp
  Cloud API, somente se você vincular um número…".
- **Esperado:** `PRODUCT.md`: o WhatsApp está fora do produto desde 05/09 e
  09/09.
- **Status:** COMPROVADO por leitura. O risco é baixo, porque o texto é
  condicional, mas o documento legal descreve um recurso que não existe. Os
  Termos também não citam a garantia de 7 dias que a landing promete (a
  seção 5 remete tudo "à página de compra"). A Privacidade (`:103`, `:161`)
  diz que dá para excluir "a qualquer momento, direto no app", o que é falso
  para quem está no paywall (C2).
- **Sugestão:** revisar o texto legal num lote só, junto com a remoção do
  WhatsApp que o autor adiou.

### C11 [P3] Documentos de produto desatualizados

- **`PRODUCT.md`:** a seção "Copy and Marketing Guidelines" está
  **duplicada**, com texto idêntico (as duas últimas seções). O arquivo diz
  "Roda em Expo (iOS e Android)", mas não há distribuição iOS: a landing e o
  `/baixar` só oferecem APK Android. Há também uma mudança local sem commit
  em `PRODUCT.md` (bloqueio ligado, App Links), de outra sessão, que não
  toquei.
- **`PLANO_DE_EVOLUCAO.md`:** diz que "Só o Épico 5 (widgets / Atalhos iOS)
  continua pendente de verdade". Os widgets Android existem: seis providers
  em `modules/grana-voice-widget/android/.../voicewidget/`, cinco deles
  listados no Perfil (`app/(app)/perfil.tsx:79-90`). O guia de Atalhos saiu
  por decisão do autor em 19/09 (`perfil.tsx:74-77`). O plano não registra
  nenhuma das duas coisas e ainda traz os prompts de execução como trabalho
  futuro. O último commit nele é de 10/09.
- **[[Preço Vigente e Parcelamento - Cakto]]** (perene, `revisado:
  2026-09-13`): as pendências do fim ainda dizem "Compra de teste. Zero
  eventos" e "Ligar a exigência de assinatura", mas a venda real aconteceu
  em 13/09 (descrita na própria nota) e o bloqueio foi ligado em 22/09. Os
  **preços batem** com o código (`app/assinar.tsx:33-34`,
  `app/index.tsx:140-141`) e com a landing ao vivo (R$ 97,90/ano,
  R$ 9,90/mês, economia de R$ 20,90, equivalente de R$ 8,16/mês, "menos de
  R$ 0,37 por dia"). Só as pendências estão velhas. Não editei a nota perene,
  como a regra desta auditoria manda; quem cuida do vault deve atualizar.
- **Status:** COMPROVADO.

### C12 [P3] O primeiro uso não pergunta o saldo, e o número principal abre vazio

- **Onde:** `components/OnboardingModal.tsx` (7 passos de diagnóstico: nome e
  foto, perguntas, arquétipo; a busca por `saldo inicial` e `initial_balance`
  não acha nada no componente).
- **Encontrado:** o Livre para Gastar, que é o "aha" prometido, depende de
  saldo e contas. Uma conta sem entradas vê "Sem saldo disponível este mês
  ainda." (texto real visto no navegador em 23/09) até registrar uma entrada.
  O diagnóstico de 7 passos vem antes do valor, e a landing promete "Não
  precisa configurar nada antes. Cole um gasto e pronto".
- **Status:** HIPÓTESE de impacto na ativação. Texto e fluxo comprovados por
  leitura; o efeito no comportamento não foi medido (C7).
- **Sugestão:** trocar parte do diagnóstico por "Quanto você tem hoje na
  conta?" (vira o `initial_balance` da carteira) e mostrar o Livre para Gastar
  já calculado no fim do onboarding.

### C13 [P3, pergunta] Selo "Mais popular" sem base

- **Onde:** landing, card do anual. Na produção há 1 assinatura paga, e ela é
  mensal (`subscriptions`: `cakto/active = 1`, consulta de 23/09).
- **Contexto:** o autor decidiu em 22/09 manter o selo (`context.md`, 22/09).
  Não reabro a decisão, mas registro o conflito com o `PRODUCT.md` (Evidence
  on Hand, "não inventar nenhum", e Princípio 4) e com a tela do app, que diz
  "MAIS VANTAJOSO", a formulação verdadeira. Vai para as perguntas.

### C14 [P2, pergunta] A conta de teste dos agentes é a conta pessoal do autor

- **Onde:** login no navegador do Compass com `E2E_TEST_EMAIL` (lido pelo
  script, sem imprimir). O Perfil mostrou, como e-mail da conta, o **Gmail
  pessoal do autor**, com o nome "Auditoria" e os dados AUDIT.
- **Por que importa:** as regras dizem "nunca logar conta real" e "não
  excluir a conta de teste". Se a conta de teste É a do autor, qualquer
  agente que teste exclusão, troca de senha ou apague "dados AUDIT" encosta
  na conta real dele, e as cortesias de 22/09 citam a conta do autor e a de
  teste como se fossem duas.
- **O que fiz:** parei de navegar na hora, não alterei nada e tentei sair da
  conta. O "Sair da conta" pede `window.confirm`, que o portal não deixa
  aceitar, então **a sessão continua aberta no "Navegador Compass"**, que é
  só meu.
- **Status:** COMPROVADO que o e-mail exibido é o do autor. HIPÓTESE de que
  seja a mesma conta que ele usa no dia a dia.

## Achados já registrados (citados, não duplicados)

- A2, A3 e A4 e a compra com outro e-mail sem vínculo (22/09, `context.md` e
  [[2026-09-22 - M1 - Testes do fluxo de assinatura]]). O C2 e o C5 são
  vizinhos deles.
- E-mail de suporte pessoal na Cakto e o caminho de cancelamento (nota de
  preço). O C6 acrescenta a falta de tela no app.
- Pixel e API de Conversões (plano de tráfego). O C7 acrescenta a ativação.
- **O usuário AUDIT não confirmado de 22/09 continua no Auth.** A consulta de
  23/09 mostra 10 usuários, 1 criado depois do bloqueio (`del…@resend.dev`),
  sem confirmação e sem assinatura. O autor autorizou apagar em 22/09 (via
  Codex), e isso ainda não foi feito.

## Promessas conferidas e que batem

- Preço, economia, garantia de 7 dias e métodos (cartão e Pix, sem boleto):
  landing = código = nota de preço.
- Lembrete diário em 19:00, 20:30 e 21:30 (`perfil.tsx:686-688`) e **push
  entregando em produção**: `cron` `grana-push-habito-cada-5-min` ativo, 576
  execuções com sucesso em 2 dias, `push_habit_deliveries` com 50 `sent`
  (29 à noite, 21 no almoço) até 22/09, 2 tokens Android ativos. Isso fecha a
  dúvida antiga da `push_tokens` vazia.
- Score de 0 a 1000 com quatro fatores e sem o saldo
  (`lib/gamification.ts:170-276`); conquistas "Primeiro Registro" e
  "Mapeador 360°" (`:369`, `:485`).
- Colar comprovante (`components/PasteReceiptModal.tsx`, atalho visível na
  Início da web), QR (`QrScannerModal`), widgets Android e exclusão de conta
  no Perfil (visto na web). Biometria e bloqueio de print não foram conferidos
  no aparelho.
- Épicos 1 a 4 do plano: os 10 arquivos citados existem.

## Decisões pendentes do autor: recomendação do Product Planner

Os itens foram reproduzidos pelo Sentinel em 22/09. Recomendação pelo
critério de impacto na primeira semana do assinante pago:

| Item | O que é | Recomendação | Por quê |
|---|---|---|---|
| A15 | "Saída" no "+" da Início abre a folha dentro da aba Lançamentos | Abrir a folha **por cima da Início** e ficar lá ao salvar; usar o mesmo nome ("Débito e Pix") no menu e na aba | Tirar a pessoa da tela em que estava, no gesto mais frequente do app, é atrito diário. Custo baixo |
| A34 / A35 | "Ano a Ano" e "Mês a Mês" iguais com um ponto; "Geral" repete Despesas | **Esconder** "Ano a Ano" até haver 2 anos de dados e "Mês a Mês" até haver 2 meses; transformar "Geral" em entradas × saídas | Gráfico vazio numa conta nova parece defeito, e toda conta paga agora é nova. Esconder custa menos que redesenhar |
| A52 | "…" da meta só exclui | **Acrescentar "Editar meta"** (nome, alvo, prazo) | Sem editar, corrigir um erro de digitação exige apagar a meta e perder o histórico. O cofrinho está na promessa da landing |
| A26 | "(1/4)" no nome e selo "1/4x" ao lado | Tirar o sufixo do nome **na exibição** e manter o selo | Cosmético e barato. Sem mexer no dado gravado |
| A54 | Subiu de nível em silêncio | **Toast curto** ("Nível 2 · Aprendiz"), sem animação nova | Coerente com "um placar que não julga": reconhecer sem festa. É a de menor prioridade |

Ordem sugerida: A15 → A34/A35 → A52 → A26 → A54. Nenhuma delas vem antes
do C1, do C2 e do C6.

## Jornada do cliente (skill `customer-journey-map`)

Persona: adulto brasileiro que já largou planilha e quer saber quanto pode
gastar sem conectar o banco. Chega por anúncio da Meta.

| Etapa | Ponto de contato | Onde trava | Prova | Oportunidade |
|---|---|---|---|---|
| Descoberta | Anúncio → landing | Sem medição (C7) | HTML ao vivo | Pixel (já planejado) |
| Consideração | Landing, preços, FAQ | "Um único plano" (C9); FAQ com a conta velha (C8) | Navegador | Ajuste de copy |
| Compra | Checkout Cakto | E-mail livre no checkout (C5) | Código | Pré-preencher o e-mail ou avisar |
| Cadastro | `/ativar` → `/sign-up` → confirmar e-mail | Link abre o navegador (A4); erro de envio vira "servidor" (A2) | 22/09 | App Links; mensagem certa |
| Paywall | `/assinar` | Sem saída (C2); título "continua" (C4) | Código | Sair e excluir; título por estado |
| Primeiro uso | Diagnóstico → Início | Número principal vazio (C12) | Navegador | Perguntar o saldo |
| Hábito | Lembrete push, widgets, voz | Funciona (push comprovado) | Banco | Medir (C7) |
| Retenção | Livre para Gastar diário | Número errado para quem usa cartão (C1) | Código | Descontar a fatura |
| Renovação e saída | Cakto | Sem tela de assinatura (C6); dados trancados ao vencer (C3) | Código e navegador | Bloco "Assinatura" no Perfil |

**Momento "aha":** ver o Livre para Gastar certo no primeiro dia. Hoje ele
abre vazio (C12) e, depois, pode errar para cima (C1).
**Momento da verdade:** entre pagar e entrar no app, com 5 telas e um e-mail
no meio (compra → e-mail da Cakto → `/ativar` → cadastro → confirmação → login).

## Pré-mortem e red-team (skills `pre-mortem` e `strategy-red-team`)

Cenário: daqui a 30 dias o tráfego pago trouxe compras, mas quase ninguém
renovou.

**Tigres (riscos reais)**
- *Bloqueia o lançamento:* pagou e não conseguiu entrar (A4, C5, e-mail
  diferente). Cada caso vira atendimento manual pelo Gmail do autor.
  Mitigação: aviso "use o mesmo e-mail" no card de preço e no `/ativar`;
  depois, App Links.
- *Corrigir em 30 dias:* Livre para Gastar errado com cartão (C1), que é o
  motivo declarado para pagar. E a falta de tela de assinatura e de
  cancelamento (C6), que vira estorno ou reclamação em vez de cancelamento.
- *Acompanhar:* gráficos vazios em conta nova (A34/A35).

**Tigres de papel**
- Preço alto demais: R$ 9,90 é pouco e está coerente em toda superfície.
- Push não entrega: comprovado que entrega.

**Elefantes**
- Não se sabe se alguém além do autor usa o app toda semana: não há medição
  (C7), e a única venda real foi do próprio autor.
- A conta de teste é a conta do autor (C14).

**Suposição que sustenta tudo, e o teste mais barato desta semana:** "quem
paga lança gasto pelo menos 3 vezes na primeira semana". Falha se, das
próximas 10 contas pagas, menos de 5 chegarem a 3 lançamentos em 7 dias.
Teste: uma consulta SQL em `transactions` por conta paga, sem código novo.

## Métrica norte (skill `north-star-metric`)

Jogo de produtividade. Proposta: **assinantes com lançamentos em pelo menos 4
dias diferentes na semana** ("semanas registradas"). Entradas: % de pagantes
que concluem o cadastro em 24 h; % com o primeiro lançamento no dia 1; % com
lembrete ou widget ativo; lançamentos por voz, QR ou colar sobre o total.
Tudo sai de tabelas que já existem (`transactions`, `push_tokens`,
`subscriptions`). Falta só a consulta e alguém que olhe toda semana.

## Preço (skill `pricing-strategy`)

Modelo de preço fixo com dois períodos, sem nível gratuito. É coerente com o
posicionamento ("pago para servir a você"). O desconto do anual é de 17,6%
(R$ 97,90 contra R$ 118,80), dentro da faixa usual de 15 a 20%. Riscos:
- O parcelamento em 12x custa R$ 121,34, mais que 12 mensalidades (já
  registrado na nota de preço). A landing diz "com juros" e está honesta.
- Sem teste gratuito e com a garantia de 7 dias como única rede, o risco
  maior não é o preço, é o C1 e o C12 fazerem a pessoa pedir reembolso na
  primeira semana.
- Não há teste de preço possível sem medição (C7).

## Skills

| Skill | Usada em | O que acrescentou |
|---|---|---|
| `intended-vs-implemented` | Método da auditoria inteira | Cada achado com as duas pontas citadas; foi o que achou o C1 (a promessa "desconta parcelas" contra o código) |
| `customer-journey-map` | Seção Jornada | Mostrou que os achados se concentram entre pagar e o primeiro dia |
| `pre-mortem` | Seção Pré-mortem | Separou tigres de tigres de papel (push e preço saíram da lista de medo) |
| `strategy-red-team` | Suposição central | Transformou "falta medir" num teste de uma consulta, com critério de corte |
| `north-star-metric` | Seção Métrica norte | Métrica que sai das tabelas atuais, sem SDK |
| `pricing-strategy` | Seção Preço | Confirmou que o desconto do anual está na faixa usual e que o risco é de ativação, não de preço |
| `identify-assumptions-existing` | Elefantes e C12 | Suposições de valor e usabilidade da primeira semana |
| `prioritization-frameworks` | Ordem das decisões pendentes | Impacto × esforço aplicado aos seis itens |

**Não aplicadas, com motivo:** `create-prd`, `user-stories` e `job-stories`
servem para especificar a correção e ficam para quando o autor escolher o que
entra (auditar não é corrigir). `analyze-feature-requests`,
`prioritize-features`, `prioritize-assumptions`, `opportunity-solution-tree`,
`value-proposition`, `monetization-strategy` e `product-strategy` pedem
entrevistas, pesquisa ou pedidos de clientes; os feedbacks reais ficam em
`Feedbacks/`, que não sai da máquina e não foi lido nesta auditoria.
Comparação com concorrentes pelo navegador: não feita, fora do tempo.

## Perguntas ao autor

1. **C14:** a conta de teste dos agentes (`E2E_TEST_EMAIL`) é o seu Gmail
   pessoal. É de propósito? Se for a conta que você usa de verdade, os
   agentes não deveriam usá-la para testes.
2. **C1:** o Livre para Gastar deve descontar a fatura do cartão que vence no
   mês?
3. **C2 e C3:** quem está no paywall ou com a assinatura vencida deve poder
   sair da conta, exportar e excluir os dados?
4. **C6:** existe um portal do comprador na Cakto para cancelar? Se não
   existir, qual é o caminho oficial de cancelamento?
5. **C13:** manter "Mais popular" sem nenhuma venda anual, ou trocar por
   "Mais vantajoso", como no app?
6. Pode apagar o usuário AUDIT `del…@resend.dev`, que continua no Auth?
7. O `PRODUCT.md` tem uma mudança local sem commit, de outra sessão. É para
   publicar?
