# Ciclo de fatura do cartão de crédito (design)

Data: 2026-09-03
Pedido por: Gabriel (autor), via voz
Status: aprovado por seção com o autor, aguardando plano de implementação

## Problema

`credit_cards` já guarda `closing_day` e `due_day` desde que a aba Crédito
existe, mas eles só formatam a *data de vencimento exibida*
(`credito.tsx:258`). Qual fatura um lançamento pertence é decidido só por
`isSameMonth(t.occurred_on, ano, mes)` — mês civil, não ciclo de fechamento
do cartão.

Efeito prático relatado pelo autor: um cartão que fecha dia 19 (ex.: C6)
deveria continuar mostrando a mesma fatura em aberto mesmo depois que o
calendário vira de mês — hoje ele não faz isso, porque o corte é sempre
dia 1.

## Decisões (validadas com o autor)

1. **Regra de corte**: um lançamento no PRÓPRIO dia do fechamento já entra
   na PRÓXIMA fatura (não na que fecha aquele dia).
   ```
   mesFaturaDoLancamento(occurred_on, closing_day):
     dia(occurred_on) <  closing_day → fatura fecha no mesmo mês do lançamento
     dia(occurred_on) >= closing_day → fatura fecha no mês seguinte
   ```
2. **Nome da fatura**: pelo mês de FECHAMENTO, não pelo de vencimento
   (uma fatura que fecha 28/dez e vence 05/jan chama "Fatura de Dezembro").
3. **Navegação por mês na aba Crédito**:
   - Visão **"Total"** (todos os cartões): continua mês civil — cartões
     podem ter `closing_day` diferentes entre si, então não existe um único
     ciclo pra agregar.
   - **Cartão específico selecionado**: o seletor de mês passa a navegar
     fatura a fatura DAQUELE cartão. Trocar de "Total" para um cartão abre
     direto na fatura em aberto agora (calculada a partir de hoje), não
     recicla o índice do mês civil que estava selecionado.
4. **Interação de seleção de cartão (preservar, não é novidade desta
   mudança)**: tocar num cartão no carrossel já seleciona ele e já mostra,
   isolado, o resumo da fatura daquele cartão (valor, vencimento, selo
   Paga/Atrasada/Aberta) + a lista de lançamentos dele — e o botão de marcar
   como paga ("Pagar Fatura"/"Desfazer pagamento") já é uma ação separada da
   exibição. Nada disso muda; é um requisito de não regressão.
5. **Migração do histórico**: reprocessar as faturas já pagas
   (`credit_card_invoices`) para a chave do ciclo novo, com prévia revisável
   antes de aplicar em produção. O valor (`amount`) de uma fatura paga é um
   retrato fixo do momento do pagamento e NUNCA muda — só a chave
   `(card_id, year, month)` que a identifica é recalculada.

## Modelo de ciclo

Função pura nova, sem tocar banco, testável com o corpus de teste do
projeto (`__tests__/`):

- `mesFaturaDoLancamento(occurredOn: string, closingDay: number): { year: number; month: number }`
  — implementa a regra de corte acima.
- `janelaFatura(year: number, month: number, closingDay: number): { inicio: Date; fim: Date }`
  — intervalo `[dia closingDay do mês anterior, dia closingDay-1 do mês]`
  usado só para a busca de transações (ver abaixo).
- `dataVencimentoFatura(year, month, dueDay, closingDay): Date` — generaliza
  o cálculo que já existe em `credito.tsx:258`
  (`due_day >= closing_day ? mesmo mês : mês seguinte`), agora relativo ao
  mês de FECHAMENTO da fatura, não ao mês selecionado cru.

Local sugerido: `lib/faturaCiclo.ts` (novo arquivo — mesmo padrão de módulo
sem UI que `lib/recorrencia.ts`/`lib/heuristics.ts` já seguem).

## Comportamento em `app/(app)/credito.tsx`

- **Estado de navegação dividido em dois**: `mesCalendario` (visão Total,
  como já existe hoje) e `faturaSelecionada` por cartão (novo). Trocar
  `selectedCardId` entre `'all'` e um cartão específico não recicla o
  índice numérico de mês/ano de um eixo pro outro — são conceitos
  diferentes.
- **Busca de lançamentos**: troca o `range` de data fixo de 1 mês civil
  (`fetchCreditTransactionsForMonth`) por uma janela de **2 meses civis**
  (suficiente para cobrir qualquer `closing_day` de 1 a 31, já que uma
  fatura nunca cruza mais que um mês civil de cada lado) e agrupa no
  cliente com `mesFaturaDoLancamento`, cartão por cartão — mesmo padrão de
  filtragem client-side que a tela já faz em outros `useMemo`
  (`creditTransactions`, `walletTransactions`).
- **Rótulo da fatura**: "Fatura de Setembro" ganha o texto de fechamento ao
  lado (reaproveitando o padrão que já existe para o vencimento), pra não
  parecer mês civil por engano.
- **Lembretes de vencimento** (`scheduleCardInvoiceReminders`,
  `lib/notifications.ts`): hoje calculados sobre o mês civil atual; passam
  a ser calculados sobre a fatura EM ABERTO agora (que pode ter começado no
  mês civil anterior, se hoje for antes do `closing_day`).
- **Interação de seleção de cartão**: sem mudança de comportamento (ver
  decisão 4) — só muda o que "fatura daquele cartão" significa por baixo.

## Migração de `credit_card_invoices`

`credit_card_invoices` guarda uma linha por fatura PAGA
(`card_id, year, month, amount, paid_on, ...`), com `unique (card_id, year,
month)`. Hoje `year`/`month` foram gravados sob a convenção de mês civil;
a partir desta mudança passam a significar mês de FECHAMENTO.

Risco: não há, no registro salvo, um vínculo direto às transações que
formaram aquele total — só o valor (`amount`). Remapear a chave às cegas
por matemática de data pode, num caso limite, deixar uma fatura paga sem
corresponder a nenhum ciclo novo, ou colidir com outra.

**Abordagem aprovada:**

1. Script SQL único (rodado manualmente no SQL editor do Supabase, como já
   é o padrão do projeto para mudanças de schema/dado — ver `AGENTS.md` e o
   histórico de `app_release`/`publicar_app_release` em `context.md`), que:
   - Para cada linha de `credit_card_invoices`, busca as transações de
     crédito daquele `card_id` e usa `mesFaturaDoLancamento` (com o
     `closing_day` atual do cartão) para descobrir a que ciclo NOVO elas
     pertencem.
   - Recalcula a chave `(year, month)` de cada fatura paga para o ciclo
     novo correspondente.
   - **Nunca** altera `amount`, `paid_on`, `wallet_id` ou
     `paid_transaction_id` — só a chave.
2. Antes de aplicar em produção: rodar em modo de prévia (SELECT que mostra
   "de → para" linha a linha, sem UPDATE) e o autor revisa a lista — hoje
   provavelmente são poucas faturas pagas.
3. Aplicar só depois da aprovação explícita do autor sobre a prévia.

Este script fica documentado e versionado (provavelmente
`supabase/migrations/` ou inline no PR, a decidir na hora da implementação)
mas a EXECUÇÃO em produção é manual, com o autor no controle — mesmo
padrão de cautela que o projeto já aplica a builds/EAS e a mudanças de
schema (ver regras 4 e 1 do `AGENTS.md`).

## Testes

- Corpus de teste do parser (`__tests__/`, `npm run test:parser`) ganha
  casos para `mesFaturaDoLancamento`/`janelaFatura`/`dataVencimentoFatura`:
  fechamento no meio do mês, fechamento no dia 1, fechamento no dia 31 (mês
  com menos dias), lançamento exatamente no dia do fechamento (regra de
  corte), fechamento e vencimento em meses civis diferentes.
- `npx tsc --noEmit` depois de cada mudança (gate padrão do projeto).
- QA visual manual na aba Crédito (padrão do projeto, sem Playwright/Jest
  configurado pra UI): alternar entre "Total" e cartão específico, navegar
  fatura a fatura, conferir que pagar/desfazer pagamento continua batendo
  com a fatura certa.

## Fora de escopo desta mudança

- Início, Gráficos e Lançamentos não referenciam `closing_day`/`due_day`
  hoje e não são tocados por este design.
- Nenhuma mudança de schema nova é necessária — `closing_day`/`due_day` já
  existem em `credit_cards`. A única mudança de dado é a migração de chave
  descrita acima, não uma migração de schema.
