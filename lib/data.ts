import { supabase } from './supabase';
import { buscarTodasAsPaginas } from './paginacao';
import { CATEGORIES } from './types';
import { checarLimiteCartao } from './creditLimitAlert';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';
import type { OcorrenciaFaltante } from './recorrencia';
import type {
  Bill,
  BillStatus,
  Budget,
  Category,
  CategoryType,
  CreditCard,
  CreditCardInvoicePayment,
  PaymentMethod,
  Transaction,
  TxType,
  WhatsappLink,
} from './types';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Usuário não autenticado');
  return data.user.id;
}

/* ---- transações ---- */

/**
 * `sinceDays`, quando informado, limita a busca a `occurred_on >= hoje -
 * sinceDays`. Sem ele, busca o histórico inteiro — o padrão de que telas com
 * navegação por mês (Início, Lançamentos) dependem. Existe para telas que só
 * precisam de uma janela recente (ex.: Desafios, que calcula streak e score
 * sobre no máximo os últimos 30 dias) evitarem escanear o histórico todo.
 */
export async function fetchTransactions(opts?: { sinceDays?: number }): Promise<Transaction[]> {
  return buscarTodasAsPaginas<Transaction>((de, ate) => {
    let query = supabase
      .from('transactions')
      .select('*')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      /* Desempate estável: sem ele a paginação pode repetir uma linha e
         perder outra quando data e criação coincidem. */
      .order('id', { ascending: false })
      .range(de, ate);
    if (opts?.sinceDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - opts.sinceDays);
      query = query.gte('occurred_on', cutoff.toISOString().slice(0, 10));
    }
    return query;
  });
}

/**
 * Lançamentos de uma janela de datas, inclusive nas duas pontas.
 *
 * Para telas que mostram um período de cada vez, como Lançamentos, que
 * navega mês a mês e deriva tudo do mês visível. Baixar o histórico inteiro
 * para exibir trinta dias é trabalho jogado fora, e cresce sem teto.
 *
 * ⚠ NÃO alimente `ocorrenciasFaltantes` com o resultado desta função. A
 * geração de recorrência decide o que CRIAR comparando os meses já ocupados
 * de cada série, então um recorte faz todo mês ausente parecer um mês a
 * preencher, e o estrago é lançamento duplicado no extrato de quem usa o app.
 * Para esse caso existe `fetchRecurrenceContext()`, logo abaixo, e o corpus
 * `__tests__/corpus-recorrencia.ts` guarda a armadilha com um caso próprio.
 */
export async function fetchTransactionsDoPeriodo(inicioISO: string, fimISO: string): Promise<Transaction[]> {
  return buscarTodasAsPaginas<Transaction>((de, ate) =>
    supabase
      .from('transactions')
      .select('*')
      .gte('occurred_on', inicioISO)
      .lte('occurred_on', fimISO)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(de, ate)
  );
}

/**
 * Saldo de cada carteira somado no banco, sem trazer lançamento nenhum.
 *
 * Devolve a variação (entradas menos saídas, ignorando crédito) por carteira,
 * com a chave `null` para o que não tem carteira definida. O saldo inicial
 * NÃO vem daqui: quem soma é `calcularSaldosWallets`, que também conhece a
 * carteira padrão para onde vão os lançamentos sem `wallet_id`.
 *
 * A função SQL `saldos_por_carteira()` foi conferida contra a regra do app
 * sobre os dados reais, usuário a usuário, e bate no centavo.
 */
export async function fetchSaldosPorCarteira(): Promise<{ wallet_id: string | null; delta: number }[]> {
  const { data, error } = await supabase.rpc('saldos_por_carteira');
  if (error) throw error;
  return (data ?? []).map((linha: { wallet_id: string | null; delta: number | string }) => ({
    wallet_id: linha.wallet_id,
    delta: Number(linha.delta),
  }));
}

export async function addTransaction(input: {
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string;
  recurring?: boolean;
  payment_method?: string;
  bank?: string;
  card_id?: string | null;
  installment_current?: number;
  installment_total?: number;
  wallet_id?: string | null;
}): Promise<Transaction> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;

  /* Só saída no crédito — sem `await`/sem propagar erro: checarLimiteCartao
     é fire-and-forget de propósito, uma notificação de limite atrasada ou
     perdida não pode fazer o próprio lançamento falhar. Único ponto de
     entrada pra TODOS os caminhos do app (manual, colar comprovante, QR,
     voz, CSV) — todos passam por addTransaction. Lançamento pelo WhatsApp
     não passa por aqui (a Edge Function não importa de lib/), então nunca
     dispara — comportamento esperado, ver lib/creditLimitAlert.ts. */
  if (input.type === 'out' && input.card_id) {
    checarLimiteCartao(input.card_id).catch(() => {});
  }

  notificarDadosDosWidgetsAlterados();

  return data;
}

/* ---- cartões de crédito ---- */

export async function fetchCreditCards(): Promise<CreditCard[]> {
  try {
    const { data, error } = await supabase
      .from('credit_cards')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function addCreditCard(input: {
  name: string;
  bank: string;
  color: string;
  last_digits?: string;
  limit_amount: number;
  closing_day: number;
  due_day: number;
  wallet_id?: string | null;
}): Promise<CreditCard> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('credit_cards')
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCreditCard(id: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('credit_cards').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
}

/* ---- pagamento de fatura de cartão ---- */

export async function fetchCardInvoicePayments(): Promise<CreditCardInvoicePayment[]> {
  /* Uma linha por fatura paga, por cartão, por mês: cresce devagar, mas
     cresce sem teto, então pagina como o resto. */
  return buscarTodasAsPaginas<CreditCardInvoicePayment>((de, ate) =>
    supabase.from('credit_card_invoices').select('*').order('id', { ascending: true }).range(de, ate)
  );
}

/**
 * Paga a fatura de um cartão: lança a saída real na carteira escolhida (como
 * payBill já faz para boletos) e guarda o registro de "paga" para aquele
 * card+ano+mês. payment_method fica de fora (não é 'credit') de propósito —
 * essa saída precisa continuar contando no saldo de caixa e nos totais do
 * mês, diferente da compra original que ela está quitando.
 */
export async function payCardInvoice(input: {
  card: CreditCard;
  year: number;
  month: number;
  amount: number;
  paid_on: string;
  wallet_id: string | null;
}): Promise<CreditCardInvoicePayment> {
  const { data, error } = await supabase
    .rpc('pagar_fatura_cartao', {
      p_card_id: input.card.id,
      p_year: input.year,
      p_month: input.month,
      p_amount: input.amount,
      p_paid_on: input.paid_on,
      p_wallet_id: input.wallet_id,
    });
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
  return data as unknown as CreditCardInvoicePayment;
}

/**
 * Desfaz o pagamento de uma fatura: apaga a saída que payCardInvoice lançou
 * (mesmo raciocínio de reopenBill — sem isso, pagar de novo depois contaria
 * a despesa duas vezes) e o próprio registro de "paga".
 */
export async function reopenCardInvoice(invoice: CreditCardInvoicePayment): Promise<void> {
  const { error } = await supabase.rpc('reabrir_fatura_cartao', { p_invoice_id: invoice.id });
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
}

/* O filtro por user_id é redundante com a RLS — e é de propósito. Se uma
   política for desabilitada por engano no painel do Supabase, estas chamadas
   continuam escopadas ao dono em vez de virarem IDOR na hora. */
export async function updateTransaction(id: string, changes: Partial<Transaction>): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('transactions').update(changes).eq('id', id).eq('user_id', user_id);
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
}

export async function addTransactionsBatch(
  inputs: Array<{
    type: TxType;
    description: string;
    amount: number;
    category: string;
    color: string;
    occurred_on: string;
    recurring?: boolean;
    wallet_id?: string | null;
    payment_method?: PaymentMethod;
    card_id?: string | null;
    /** Identificador da transação no arquivo OFX. Ver `ignorarDuplicados`. */
    fitid?: string | null;
  }>,
  /**
   * Quando true, linhas cujo `(user_id, fitid)` já existe são DESCARTADAS em
   * vez de causar erro. É o que faz reimportar um extrato ser seguro: os
   * períodos que os bancos oferecem se sobrepõem, então a segunda importação
   * quase sempre repete parte da primeira.
   *
   * Depende do índice único `transactions_user_fitid_uniq`
   * (supabase/schema.sql), que precisa ser NÃO parcial: `ON CONFLICT` não
   * infere índice parcial sem repetir o predicado, e o PostgREST não emite
   * isso — com índice parcial este upsert falha com erro em vez de ignorar
   * duplicado. Ver o comentário longo na migração.
   */
  ignorarDuplicados = false,
  /** Chamado depois de cada lote, com o total já processado — a tela usa
      isto pra mostrar progresso numa importação de milhares de linhas, que
      agora pode levar alguns segundos em vez de ser instantânea. */
  onProgress?: (processados: number, total: number) => void
): Promise<{ inseridos: number; ignorados: number }> {
  if (inputs.length === 0) return { inseridos: 0, ignorados: 0 };
  const user_id = await currentUserId();
  const rows = inputs.map((item) => ({ ...item, user_id }));

  /* Uma migração de anos de histórico pode chegar a milhares de linhas —
     numa requisição só isso vira um payload grande e um risco de timeout.
     Em lotes sequenciais (nunca em paralelo: a ordem importa para o upsert
     abaixo enxergar, no lote seguinte, o que o lote anterior já gravou) cada
     requisição fica do tamanho que sempre foi. Uma falha de rede no meio do
     caminho perde só o que ainda não foi gravado — os lotes de antes já
     estão no banco, e por isso o dedup de `ignorarDuplicados` (que agora
     também cobre CSV, via chave sintética em gerarFitidSintetico) é o que
     torna seguro simplesmente tentar de novo. */
  const TAMANHO_LOTE = 500;
  let inseridos = 0;
  let ignorados = 0;

  for (let inicio = 0; inicio < rows.length; inicio += TAMANHO_LOTE) {
    const lote = rows.slice(inicio, inicio + TAMANHO_LOTE);

    if (!ignorarDuplicados) {
      const { error } = await supabase.from('transactions').insert(lote);
      if (error) throw error;
      inseridos += lote.length;
    } else {
      /* `ignoreDuplicates` transforma o upsert num "insert ... on conflict do
         nothing". O `select()` devolve só o que entrou de fato, e a diferença
         para o total enviado é quanto o arquivo repetia. */
      const { data, error } = await supabase
        .from('transactions')
        .upsert(lote, { onConflict: 'user_id,fitid', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;

      const inseridosNoLote = data?.length ?? 0;
      inseridos += inseridosNoLote;
      ignorados += lote.length - inseridosNoLote;
    }

    onProgress?.(Math.min(inicio + TAMANHO_LOTE, rows.length), rows.length);
  }

  if (inseridos > 0) notificarDadosDosWidgetsAlterados();
  return { inseridos, ignorados };
}

/**
 * Cria as ocorrências mensais que faltam para as séries recorrentes.
 *
 * Quem decide o que falta é `ocorrenciasFaltantes` em lib/recorrencia.ts —
 * aqui só se escreve. Devolve quantas linhas foram criadas, para a tela saber
 * se precisa recarregar (zero é o caso normal, várias vezes por dia).
 */
export async function criarOcorrenciasRecorrentes(faltantes: OcorrenciaFaltante[]): Promise<number> {
  if (faltantes.length === 0) return 0;
  const user_id = await currentUserId();
  const rows = faltantes.map(({ cabeca, occurred_on }) => ({
    user_id,
    type: cabeca.type,
    description: cabeca.description,
    amount: cabeca.amount,
    category: cabeca.category,
    color: cabeca.color,
    occurred_on,
    /* A ocorrência herda o "· recorrente" na lista, mas não vira cabeça de
       série nova: parent_id aponta pra original, e é isso que impede a
       geração de se multiplicar a cada mês. */
    recurring: true,
    parent_id: cabeca.id,
    payment_method: cabeca.payment_method,
    bank: cabeca.bank,
    card_id: cabeca.card_id,
    wallet_id: cabeca.wallet_id,
  }));
  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, {
      onConflict: 'user_id,parent_id,occurred_on',
      ignoreDuplicates: true,
    })
    .select('id');
  if (error) throw error;
  const criadas = data?.length ?? 0;
  if (criadas > 0) notificarDadosDosWidgetsAlterados();
  return criadas;
}

export async function deleteTransaction(id: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
}

/**
 * Lança uma compra parcelada como N saídas mensais, uma por parcela — a
 * primeira na data informada, as demais um mês depois cada. O valor total é
 * dividido em partes iguais (2 casas decimais); a diferença de arredondamento
 * (ex: 100 / 3 = 33,33 repetindo) inteira vai pra última parcela, pra que a
 * soma bata exatamente com o total da compra.
 *
 * As parcelas ficam ligadas via `parent_id`, apontando todas para o id da
 * primeira — dá pra reconhecer o grupo depois sem precisar de uma tabela
 * nova (o campo já existia em `transactions` e não tinha uso ainda).
 */
export async function addInstallmentPurchase(input: {
  description: string;
  totalAmount: number;
  category: string;
  color: string;
  occurred_on: string;
  installments: number;
  /** Compra no cartão (aba Crédito) — se ausente, é uma parcela "solta" (cartão de outra loja, carnê, etc.). */
  payment_method?: string;
  bank?: string;
  card_id?: string | null;
  wallet_id?: string | null;
}): Promise<Transaction[]> {
  const n = Math.max(2, Math.round(input.installments));
  const { data, error } = await supabase.rpc('adicionar_compra_parcelada', {
    p_description: input.description || 'Compra parcelada',
    p_total_amount: input.totalAmount,
    p_category: input.category,
    p_color: input.color,
    p_occurred_on: input.occurred_on,
    p_installments: n,
    p_payment_method: input.payment_method ?? null,
    p_bank: input.bank ?? null,
    p_card_id: input.card_id ?? null,
    p_wallet_id: input.wallet_id ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as Transaction[];

  // Mesmo gatilho de addTransaction — parcelamento não passa por lá (insere
  // direto, ver comentário no topo desta função), então precisa da própria
  // chamada. Só a PRIMEIRA parcela conta pro mês corrente na maioria dos
  // casos (as seguintes caem em meses futuros), mas checarLimiteCartao já
  // soma só o que é deste mês — chamar aqui cobre tanto uma compra à vista
  // quanto o efeito imediato da 1ª parcela.
  if (input.card_id) {
    checarLimiteCartao(input.card_id).catch(() => {});
  }

  notificarDadosDosWidgetsAlterados();

  return rows;
}

/* ---- conquistas ---- */

/**
 * Ids das medalhas que a pessoa já conquistou algum dia.
 *
 * As medalhas eram booleanos derivados do estado ATUAL, então podiam ser
 * RETIRADAS: "Hábito Inquebrável" sumia no primeiro dia perdido, "Mês Verde"
 * sumia quando um gasto virava o mês. Guardar o desbloqueio como evento é o
 * que faz conquista ser conquista.
 */
export async function fetchConquistas(): Promise<string[]> {
  const linhas = await buscarTodasAsPaginas<{ badge_id: string }>((de, ate) =>
    supabase.from('user_achievements').select('badge_id').order('badge_id', { ascending: true }).range(de, ate)
  );
  return linhas.map((l) => l.badge_id);
}

/**
 * Grava conquistas novas. Idempotente pela chave primária composta
 * (user_id, badge_id): reavaliar as medalhas a cada carregamento tenta
 * inserir de novo e não duplica nada.
 */
export async function registrarConquistas(badgeIds: string[]): Promise<void> {
  if (badgeIds.length === 0) return;
  const user_id = await currentUserId();
  const { error } = await supabase
    .from('user_achievements')
    .upsert(badgeIds.map((badge_id) => ({ user_id, badge_id })), { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
  if (error) throw error;
}

/* ---- contas a pagar ---- */

export async function fetchBills(opts?: { status?: BillStatus }): Promise<Bill[]> {
  /* Paginado pelo mesmo motivo das transações: conta recorrente gera uma
     linha por mês e cresce sem teto ao longo dos anos. */
  return buscarTodasAsPaginas<Bill>((de, ate) => {
    let query = supabase
      .from('bills')
      .select('*')
      .order('due_date', { ascending: true })
      .order('id', { ascending: true })
      .range(de, ate);
    if (opts?.status) query = query.eq('status', opts.status);
    return query;
  });
}

/** Janela mensal indexável; evita baixar o histórico inteiro em faturas. */
export async function fetchCreditTransactionsForMonth(year: number, month: number): Promise<Transaction[]> {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('occurred_on', iso(start))
    .lt('occurred_on', iso(end))
    .or('payment_method.eq.credit,card_id.not.is.null')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Contexto limitado para catch-up de recorrências: cabeças ativas + filhos
 * dos últimos 24 meses (o mesmo teto aplicado por ocorrenciasFaltantes).
 */
export async function fetchRecurrenceContext(): Promise<Transaction[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  /* As duas consultas paginam: a de filhos cobre 24 meses de recorrências e
     passa de 1000 linhas em quem tem muitas contas fixas. */
  const [heads, children] = await Promise.all([
    buscarTodasAsPaginas<Transaction>((de, ate) =>
      supabase
        .from('transactions')
        .select('*')
        .eq('recurring', true)
        .is('parent_id', null)
        .order('id', { ascending: true })
        .range(de, ate)
    ),
    buscarTodasAsPaginas<Transaction>((de, ate) =>
      supabase
        .from('transactions')
        .select('*')
        .not('parent_id', 'is', null)
        .gte('occurred_on', cutoffISO)
        .order('id', { ascending: true })
        .range(de, ate)
    ),
  ]);
  const byId = new Map<string, Transaction>();
  for (const tx of [...heads, ...children]) byId.set(tx.id, tx);
  return [...byId.values()];
}

export type GamificationHistoricalSummary = {
  transaction_count: number;
  income_count: number;
  expense_count: number;
  income_total: number;
  expense_category_count: number;
  paid_bill_count: number;
};

/** Agregados cumulativos calculados no Postgres, sem baixar toda a vida financeira. */
export async function fetchGamificationHistoricalSummary(): Promise<GamificationHistoricalSummary> {
  const { data, error } = await supabase.rpc('get_gamification_summary').single();
  if (error) throw error;
  const row = data as Record<string, number | string>;
  return {
    transaction_count: Number(row.transaction_count || 0),
    income_count: Number(row.income_count || 0),
    expense_count: Number(row.expense_count || 0),
    income_total: Number(row.income_total || 0),
    expense_category_count: Number(row.expense_category_count || 0),
    paid_bill_count: Number(row.paid_bill_count || 0),
  };
}

export async function addBill(input: {
  description: string;
  amount: number;
  category: string;
  color: string;
  due_date: string;
  recurring?: boolean;
  wallet_id?: string | null;
}): Promise<Bill> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('bills')
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
  return data;
}

export async function updateBill(id: string, changes: Partial<Bill>): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bills').update(changes).eq('id', id).eq('user_id', user_id);
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
}

export async function setBillStatus(id: string, status: BillStatus): Promise<void> {
  await updateBill(id, { status });
}

/**
 * Marca a conta como paga e lança a saída correspondente em transactions, na
 * data do pagamento — sem isso, pagar um boleto não refletia no saldo do mês
 * nem nos gráficos até a pessoa lançar a mesma saída de novo à mão. O id da
 * saída criada fica salvo em `paid_transaction_id`, para reopenBill saber
 * exatamente qual desfazer se a conta for reaberta depois.
 */
export async function payBill(bill: Bill, paidOn: string): Promise<Bill> {
  const { data, error } = await supabase.rpc('pagar_conta', {
    p_bill_id: bill.id,
    p_paid_on: paidOn,
  });
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
  return data as unknown as Bill;
}

/**
 * Reabre uma conta paga. Se ela tinha uma saída gerada por payBill, apaga
 * essa saída também — reabrir é desfazer o pagamento, e deixá-la no histórico
 * contaria a despesa duas vezes se a conta fosse paga de novo depois.
 */
export async function reopenBill(bill: Bill): Promise<Bill> {
  const { data, error } = await supabase.rpc('reabrir_conta', { p_bill_id: bill.id });
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
  return data as unknown as Bill;
}

export async function deleteBill(id: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bills').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
  notificarDadosDosWidgetsAlterados();
}

/* ---- orçamento por categoria ---- */

export async function fetchBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase.from('budgets').select('*');
  if (error) throw error;
  return data;
}

export async function upsertBudget(category: string, amount: number, color: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase
    .from('budgets')
    .upsert({ user_id, category, amount, color, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function upsertBudgetsBatch(
  items: Array<{ category: string; amount: number; color: string }>
): Promise<void> {
  if (items.length === 0) return;
  const user_id = await currentUserId();
  const now = new Date().toISOString();
  const rows = items.map((it) => ({
    user_id,
    category: it.category,
    amount: it.amount,
    color: it.color,
    updated_at: now,
  }));
  const { error } = await supabase.from('budgets').upsert(rows);
  if (error) throw error;
}

export async function deleteBudget(category: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('budgets').delete().eq('user_id', user_id).eq('category', category);
  if (error) throw error;
}

/* ---- categorias ----
   lib/types.ts mantém as 8 categorias padrão como constante fixa — é o
   vocabulário que o diagnóstico financeiro e as heurísticas de texto usam por
   baixo, e não muda mesmo que o usuário edite sua cópia. Mas para que dar
   pra EDITAR e EXCLUIR as padrão de verdade (o pedido original), elas
   precisam existir como linhas de banco de verdade, não só como constante —
   por isso são semeadas (is_default = true) na primeira vez que o usuário
   abre o gerenciador de categorias. */

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Semeia as 8 categorias padrão como linhas do usuário, uma única vez por
 * conta. A marca de "já semeado" fica em user_metadata (não em contar linhas
 * `is_default`), porque o usuário pode legitimamente excluir as 8 depois —
 * contar linhas faria elas reaparecerem sozinhas toda vez que a lista
 * ficasse vazia.
 */
/**
 * Roda sempre, mesmo para quem já tinha sido semeado antes — sem o antigo
 * corte por `categorias_semeadas`, uma categoria padrão nova adicionada a
 * CATEGORIES (ex: "Investimentos") nunca chegaria em quem já tinha aberto o
 * gerenciador de categorias uma vez. É seguro repetir porque o upsert com
 * `ignoreDuplicates` já não faz nada com as 8 categorias que a pessoa já tem.
 */
export async function seedDefaultCategories(): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return;

  const user_id = userData.user.id;
  const rows = CATEGORIES.map((c) => ({
    user_id,
    name: c.name,
    color: c.color,
    type: 'both' as const,
    is_default: true,
  }));

  // ignoreDuplicates: se por algum motivo já existir uma categoria com esse
  // nome (ex: criada manualmente antes desta migração), pula em vez de falhar
  // o lote inteiro por causa da constraint unique (user_id, name).
  await supabase.from('categories').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });
}

export async function addCategory(input: { name: string; color: string; type?: CategoryType }): Promise<Category> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: input.name, color: input.color, type: input.type ?? 'both', user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Renomeia/recolore uma categoria personalizada e propaga a mudança para todo
 * lançamento, conta e orçamento que já usava o nome antigo — sem isso, editar
 * uma categoria deixaria o histórico apontando para um nome que não existe
 * mais em nenhuma lista da interface.
 */
export async function updateCategory(
  id: string,
  oldName: string,
  changes: { name: string; color: string }
): Promise<void> {
  const { error } = await supabase.rpc('atualizar_categoria', {
    p_category_id: id,
    p_old_name: oldName,
    p_new_name: changes.name,
    p_color: changes.color,
  });
  if (error) throw error;
}

/**
 * Exclui uma categoria personalizada. Lançamentos, contas e orçamentos que a
 * usavam são reclassificados para "Outros" antes da remoção — a alternativa
 * seria deixar histórico financeiro apontando para uma categoria que não
 * existe mais em lugar nenhum da lista.
 */
export async function deleteCategory(id: string, name: string): Promise<void> {
  const outros = CATEGORIES.find((c) => c.name === 'Outros')!;
  const { error } = await supabase.rpc('excluir_categoria', {
    p_category_id: id,
    p_name: name,
    p_fallback_name: outros.name,
    p_fallback_color: outros.color,
  });
  if (error) throw error;
}

/* ---- vínculo de WhatsApp ---- */

export async function fetchWhatsappLink(): Promise<WhatsappLink | null> {
  const user_id = await currentUserId();
  const { data, error } = await supabase.from('whatsapp_links').select('*').eq('user_id', user_id).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Cria (ou substitui) o pedido de vínculo do usuário com um número de
 * WhatsApp, gerando um código de pareamento de 6 dígitos. A verificação em si
 * acontece do lado de fora do app: a pessoa manda esse código pelo WhatsApp
 * para o número do Grana., e supabase/functions/whatsapp-webhook marca
 * `verified = true` ao reconhecer o código.
 */
/* `phone` é opcional porque na prática ele nunca foi necessário: o webhook
   grava o número de quem mandou a mensagem por cima deste valor. Pedir o
   número antes só criava trabalho e duas formas de falhar — digitar errado, e
   esbarrar no `unique (phone)` com um número que outra conta já usou. Ver
   lib/whatsapp.ts. */
export async function createWhatsappPairing(phone?: string): Promise<WhatsappLink> {
  void phone;
  const { data, error } = await supabase.rpc('criar_pareamento_whatsapp');
  if (error) throw error;
  return data as unknown as WhatsappLink;
}

export async function unlinkWhatsapp(): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('whatsapp_links').delete().eq('user_id', user_id);
  if (error) throw error;
}

/* ---- exclusão de conta (LGPD / Apple / Google Play) ---- */

/**
 * Confirma que quem está pedindo a ação é mesmo o dono da conta, revalidando a
 * senha contra o Supabase.
 *
 * Existe porque excluir a conta é irreversível e apaga todo o histórico
 * financeiro: sem isto, qualquer pessoa com o celular desbloqueado na mão
 * destrói a conta do cliente em dois toques. Ter sessão ativa prova posse do
 * aparelho, não identidade — e para uma ação destas a diferença importa.
 *
 * `signInWithPassword` com o e-mail da sessão atual é a forma suportada de
 * revalidar: se a senha estiver errada devolve erro sem mexer na sessão.
 */
export async function reauthenticate(password: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error: userError } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (userError || !email) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: 'Senha incorreta.' };
  return { ok: true };
}

/**
 * `completo: false` significa que a RPC oficial (`delete_user_account`, com
 * `SECURITY DEFINER`) não estava instalada no banco, e o fallback abaixo
 * rodou no lugar dela. O fallback apaga os dados de TODAS as tabelas
 * conhecidas, mas — diferente da RPC — não consegue apagar a própria linha
 * de `auth.users`: isso exige privilégio de administrador que o cliente
 * autenticado nunca tem, só uma função `SECURITY DEFINER` rodando no
 * servidor. Ou seja, sem a RPC instalada, a exclusão nunca fica 100%
 * completa — a pessoa continua existindo como login, só sem nenhum dado.
 * O chamador precisa saber disso pra avisar a pessoa em vez de fingir
 * sucesso total.
 */
export async function deleteUserAccount(): Promise<{ completo: boolean }> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw error;
  await supabase.auth.signOut();
  return { completo: true };
}



