import { supabase } from './supabase';
import type { Bill, BillStatus, Budget, Transaction, TxType } from './types';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Usuário não autenticado');
  return data.user.id;
}

/* ---- transações ---- */

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addTransaction(input: {
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string;
  recurring?: boolean;
}): Promise<Transaction> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(id: string, changes: Partial<Transaction>): Promise<void> {
  const { error } = await supabase.from('transactions').update(changes).eq('id', id);
  if (error) throw error;
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
  }>
): Promise<void> {
  if (inputs.length === 0) return;
  const user_id = await currentUserId();
  const rows = inputs.map((item) => ({ ...item, user_id }));
  const { error } = await supabase.from('transactions').insert(rows);
  if (error) throw error;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/* ---- contas a pagar ---- */

export async function fetchBills(): Promise<Bill[]> {
  const { data, error } = await supabase.from('bills').select('*').order('due_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addBill(input: {
  description: string;
  amount: number;
  category: string;
  color: string;
  due_date: string;
}): Promise<Bill> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('bills')
    .insert({ ...input, user_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBill(id: string, changes: Partial<Bill>): Promise<void> {
  const { error } = await supabase.from('bills').update(changes).eq('id', id);
  if (error) throw error;
}

export async function setBillStatus(id: string, status: BillStatus): Promise<void> {
  await updateBill(id, { status });
}

export async function deleteBill(id: string): Promise<void> {
  const { error } = await supabase.from('bills').delete().eq('id', id);
  if (error) throw error;
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

/* ---- exclusão de conta (LGPD / Apple / Google Play) ---- */

export async function deleteUserAccount(): Promise<void> {
  const user_id = await currentUserId();

  // 1. Tenta a RPC oficial de exclusão no Supabase (que apaga de auth.users com SECURITY DEFINER)
  const { error: rpcError } = await supabase.rpc('delete_user_account');

  if (rpcError) {
    console.warn('[deleteUserAccount] RPC indisponível no Supabase, apagando tabelas públicas:', rpcError.message);
    // Fallback caso a função ainda não tenha sido executada no SQL Editor
    await supabase.from('transactions').delete().eq('user_id', user_id);
    await supabase.from('bills').delete().eq('user_id', user_id);
    await supabase.from('budgets').delete().eq('user_id', user_id);
  }

  // 2. Encerrar sessão localmente
  await supabase.auth.signOut();
}



