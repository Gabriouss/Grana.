import { supabase } from './supabase';
import type { Transaction, Wallet } from './types';
import { DEMO_WALLETS } from './demo-data';
import { isCreditTx } from './format';

export async function fetchWallets(): Promise<Wallet[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEMO_WALLETS;

  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.warn('Erro ao carregar carteiras:', error.message);
    return [
      {
        id: 'default-principal',
        user_id: user.id,
        name: 'Principal',
        initial_balance: 0,
        color: '#1fa98d',
        icon: 'wallet-outline',
        is_default: true,
        created_at: new Date().toISOString(),
      },
    ];
  }

  // Se o usuário ainda não tiver nenhuma carteira cadastrada, cria a "Principal" automaticamente
  if (!data || data.length === 0) {
    const { data: created, error: createError } = await supabase
      .from('wallets')
      .insert({
        user_id: user.id,
        name: 'Principal',
        initial_balance: 0,
        color: '#1fa98d',
        icon: 'wallet-outline',
        is_default: true,
      })
      .select()
      .single();

    if (!createError && created) {
      return [created as Wallet];
    }
  }

  return (data as Wallet[]) || [];
}

export async function createWallet(input: {
  name: string;
  initial_balance?: number;
  color?: string;
  icon?: string;
}): Promise<Wallet> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      initial_balance: input.initial_balance ?? 0,
      color: input.color || '#1fa98d',
      icon: input.icon || 'wallet-outline',
      is_default: false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Wallet;
}

export async function updateWallet(
  id: string,
  input: Partial<Omit<Wallet, 'id' | 'user_id' | 'created_at'>>
): Promise<Wallet> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('wallets')
    .update(input)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Wallet;
}

export async function deleteWallet(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
}

/**
 * Calcula os saldos individuais de cada carteira e o saldo consolidado total
 * considerando o saldo inicial cadastrado + todas as transações realizadas.
 */
/**
 * Mesmo saldo, a partir do agregado que o banco já somou.
 *
 * `calcularSaldosWallets` abaixo precisa da lista inteira de lançamentos em
 * memória, e é justamente isso que não escala: o PostgREST corta a resposta em
 * 1000 linhas e o saldo passaria a ser calculado sobre um recorte. Esta versão
 * recebe uma linha por carteira, vinda de `saldos_por_carteira()`.
 *
 * As duas dividem as mesmas duas regras, e é por isso que ficam lado a lado:
 * a carteira padrão recebe o que não tem `wallet_id`, e o total consolidado
 * soma os saldos iniciais no fim. O crédito já foi excluído no banco.
 */
export function calcularSaldosComAgregado(
  wallets: Wallet[],
  agregado: { wallet_id: string | null; delta: number }[]
): { porCarteira: Record<string, number>; total: number } {
  const porCarteira: Record<string, number> = {};
  wallets.forEach((w) => {
    porCarteira[w.id] = Number(w.initial_balance || 0);
  });

  const defaultWallet = wallets.find((w) => w.is_default) || wallets[0];
  let total = 0;

  agregado.forEach(({ wallet_id, delta }) => {
    const valor = Number(delta || 0);
    const alvo = wallet_id || (defaultWallet ? defaultWallet.id : null);
    if (alvo && porCarteira[alvo] !== undefined) porCarteira[alvo] += valor;
    total += valor;
  });

  total += wallets.reduce((acc, w) => acc + Number(w.initial_balance || 0), 0);
  return { porCarteira, total };
}

export function calcularSaldosWallets(
  wallets: Wallet[],
  transactions: Transaction[]
): {
  porCarteira: Record<string, number>;
  total: number;
} {
  const porCarteira: Record<string, number> = {};
  let total = 0;

  // Inicializa com os saldos iniciais de cada carteira
  wallets.forEach((w) => {
    porCarteira[w.id] = Number(w.initial_balance || 0);
  });

  // A carteira padrão (is_default) acumula transações sem wallet_id
  const defaultWallet = wallets.find((w) => w.is_default) || wallets[0];

  transactions.forEach((tx) => {
    // Compra no crédito só sai do caixa quando a fatura é paga (essa saída
    // vira uma transação própria, payment_method: 'debit') — não na hora da
    // compra, senão o dinheiro "sairia" duas vezes.
    if (isCreditTx(tx)) return;

    const val = Number(tx.amount || 0);
    const delta = tx.type === 'in' ? val : -val;

    const targetWalletId = tx.wallet_id || (defaultWallet ? defaultWallet.id : null);
    if (targetWalletId && porCarteira[targetWalletId] !== undefined) {
      porCarteira[targetWalletId] += delta;
    }

    total += delta;
  });

  // Soma os saldos iniciais ao total consolidado
  const totalSaldosIniciais = wallets.reduce((acc, w) => acc + Number(w.initial_balance || 0), 0);
  total += totalSaldosIniciais;

  return { porCarteira, total };
}
