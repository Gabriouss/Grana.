import { isSameMonth } from './format';
import type { CreditCard, Transaction } from './types';

/* `./supabase` e `./notifications` são importados DINAMICAMENTE dentro de
   checarLimiteCartao, não no topo do arquivo — os dois puxam `react-native`
   por baixo (supabase.ts usa AppState/Platform; notifications.ts usa
   Platform), e um import ESTÁTICO aqui quebrava qualquer teste em Node puro
   que só queria as funções PURAS deste módulo (calcularPctCartao,
   proximoDegrauCruzado — ver __tests__/corpus-limite-cartao.ts), mesmo sem
   nunca chamar checarLimiteCartao. Mesmo problema já documentado em
   __tests__/extrair.ts sobre lib/whatsapp.ts. */

/** Degraus fixos, do maior pro menor — a ordem importa pra achar o degrau mais alto cruzado de uma vez (ver checarLimiteCartao). */
const DEGRAUS = [100, 90, 70, 50];

/**
 * % (NÃO travado em 1 como a barra de progresso de app/(app)/credito.tsx
 * usa) de quanto do limite já foi gasto no mês — sem o travamento, dá pra
 * distinguir 100% de 130%, que são degraus diferentes aqui.
 */
export function calcularPctCartao(transactionsDoMes: Pick<Transaction, 'amount'>[], card: Pick<CreditCard, 'limit_amount'>): number {
  if (!card.limit_amount || card.limit_amount <= 0) return 0;
  const gasto = transactionsDoMes.reduce((s, t) => s + Number(t.amount), 0);
  return gasto / card.limit_amount;
}

/** O maior degrau (100 > 90 > 70 > 50) que `pct` já alcançou e que ainda NÃO tinha sido notificado — `null` quando nenhum é novo. Pura, sem Supabase, pra dar pra testar sem mock de banco. */
export function proximoDegrauCruzado(pct: number, jaNotificado: number): number | null {
  return DEGRAUS.find((d) => pct * 100 >= d && d > jaNotificado) ?? null;
}

/**
 * Busca o cartão + as transações de crédito deste mês, calcula %, e dispara
 * uma notificação local IMEDIATA (lib/notifications.ts:notifyCreditLimitThreshold)
 * se um degrau novo (50/70/90/100) foi cruzado desde a última vez —
 * `card.last_notified_threshold` guarda o maior já avisado, pra não
 * repetir o mesmo aviso a cada novo lançamento pequeno no mesmo cartão.
 *
 * Chamada só de dentro de addTransaction (lib/data.ts), só pra lançamento
 * feito PELO APP — nunca a partir do bot do WhatsApp (decisão explícita do
 * autor: um gasto no crédito lançado pelo WhatsApp não dispara notificação
 * de limite nesta rodada, já que o servidor não tem como notificar o
 * celular da pessoa sem push remoto, que fica de fora por ora).
 *
 * Nunca lança erro pra quem chama — falha aqui não pode derrubar o
 * salvamento do lançamento que a acionou.
 */
export async function checarLimiteCartao(cardId: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    const { notifyCreditLimitThreshold } = await import('./notifications');

    const { data: card, error: erroCard } = await supabase.from('credit_cards').select('*').eq('id', cardId).single();
    if (erroCard || !card) return;

    const { data: transacoes, error: erroTx } = await supabase
      .from('transactions')
      .select('amount, occurred_on')
      .eq('card_id', cardId)
      .eq('payment_method', 'credit');
    if (erroTx || !transacoes) return;

    const hoje = new Date();
    const doMes = transacoes.filter((t) => isSameMonth(t.occurred_on, hoje.getFullYear(), hoje.getMonth()));
    const pct = calcularPctCartao(doMes, card);
    const gasto = doMes.reduce((s, t) => s + Number(t.amount), 0);

    const novoDegrau = proximoDegrauCruzado(pct, card.last_notified_threshold ?? 0);
    if (!novoDegrau) return;

    await notifyCreditLimitThreshold(card, novoDegrau, gasto);
    /* Se a notificação falhar (ex: permissão negada), `last_notified_threshold`
       ainda assim sobe — é melhor perder UM aviso silenciosamente do que
       tentar reenviar pra sempre a cada lançamento novo no mesmo cartão. */
    await supabase.from('credit_cards').update({ last_notified_threshold: novoDegrau }).eq('id', cardId);
  } catch {
    // Falha silenciosa — ver comentário da função acima.
  }
}
