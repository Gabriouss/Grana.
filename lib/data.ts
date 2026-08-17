import { supabase } from './supabase';
import { CATEGORIES } from './types';
import type { Bill, BillStatus, Budget, Category, CategoryType, Transaction, TxType, WhatsappLink } from './types';

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

/* O filtro por user_id é redundante com a RLS — e é de propósito. Se uma
   política for desabilitada por engano no painel do Supabase, estas chamadas
   continuam escopadas ao dono em vez de virarem IDOR na hora. */
export async function updateTransaction(id: string, changes: Partial<Transaction>): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('transactions').update(changes).eq('id', id).eq('user_id', user_id);
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
  const user_id = await currentUserId();
  const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', user_id);
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
  recurring?: boolean;
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
  const user_id = await currentUserId();
  const { error } = await supabase.from('bills').update(changes).eq('id', id).eq('user_id', user_id);
  if (error) throw error;
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
  const tx = await addTransaction({
    type: 'out',
    description: bill.description,
    amount: Number(bill.amount),
    category: bill.category,
    color: bill.color,
    occurred_on: paidOn,
  });

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('bills')
    .update({ status: 'paid', paid_transaction_id: tx.id })
    .eq('id', bill.id)
    .eq('user_id', user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Reabre uma conta paga. Se ela tinha uma saída gerada por payBill, apaga
 * essa saída também — reabrir é desfazer o pagamento, e deixá-la no histórico
 * contaria a despesa duas vezes se a conta fosse paga de novo depois.
 */
export async function reopenBill(bill: Bill): Promise<Bill> {
  if (bill.paid_transaction_id) {
    await deleteTransaction(bill.paid_transaction_id).catch(() => {});
  }

  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('bills')
    .update({ status: 'due', paid_transaction_id: null })
    .eq('id', bill.id)
    .eq('user_id', user_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBill(id: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bills').delete().eq('id', id).eq('user_id', user_id);
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
export async function seedDefaultCategories(): Promise<void> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return;
  if (userData.user.user_metadata?.categorias_semeadas) return;

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
  await supabase.auth.updateUser({ data: { categorias_semeadas: true } });
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
  const user_id = await currentUserId();
  const { error } = await supabase
    .from('categories')
    .update({ name: changes.name, color: changes.color })
    .eq('id', id)
    .eq('user_id', user_id);
  if (error) throw error;

  await Promise.all([
    supabase.from('transactions').update({ category: changes.name, color: changes.color }).eq('user_id', user_id).eq('category', oldName),
    supabase.from('bills').update({ category: changes.name, color: changes.color }).eq('user_id', user_id).eq('category', oldName),
    supabase.from('budgets').update({ category: changes.name, color: changes.color }).eq('user_id', user_id).eq('category', oldName),
  ]);
}

/**
 * Exclui uma categoria personalizada. Lançamentos, contas e orçamentos que a
 * usavam são reclassificados para "Outros" antes da remoção — a alternativa
 * seria deixar histórico financeiro apontando para uma categoria que não
 * existe mais em lugar nenhum da lista.
 */
export async function deleteCategory(id: string, name: string): Promise<void> {
  const user_id = await currentUserId();
  const outros = CATEGORIES.find((c) => c.name === 'Outros')!;

  await Promise.all([
    supabase.from('transactions').update({ category: outros.name, color: outros.color }).eq('user_id', user_id).eq('category', name),
    supabase.from('bills').update({ category: outros.name, color: outros.color }).eq('user_id', user_id).eq('category', name),
    supabase.from('budgets').update({ category: outros.name, color: outros.color }).eq('user_id', user_id).eq('category', name),
  ]);

  const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
}

/* ---- vínculo de WhatsApp ---- */

export async function fetchWhatsappLink(): Promise<WhatsappLink | null> {
  const user_id = await currentUserId();
  const { data, error } = await supabase.from('whatsapp_links').select('*').eq('user_id', user_id).maybeSingle();
  if (error) throw error;
  return data;
}

function gerarCodigoPareamento(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Cria (ou substitui) o pedido de vínculo do usuário com um número de
 * WhatsApp, gerando um código de pareamento de 6 dígitos. A verificação em si
 * acontece do lado de fora do app: a pessoa manda esse código pelo WhatsApp
 * para o número do Grana., e supabase/functions/whatsapp-webhook marca
 * `verified = true` ao reconhecer o código.
 */
export async function createWhatsappPairing(phone: string): Promise<WhatsappLink> {
  const user_id = await currentUserId();
  const pairing_code = gerarCodigoPareamento();

  // Remove qualquer vínculo anterior do usuário antes de criar outro — só um
  // número por conta, e o `unique (phone)` da tabela impede reusar um número
  // já vinculado a outra pessoa.
  await supabase.from('whatsapp_links').delete().eq('user_id', user_id);

  const { data, error } = await supabase
    .from('whatsapp_links')
    .insert({ user_id, phone, pairing_code, verified: false })
    .select()
    .single();
  if (error) throw error;
  return data;
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

export async function deleteUserAccount(): Promise<void> {
  const user_id = await currentUserId();

  // 1. Tenta a RPC oficial de exclusão no Supabase (que apaga de auth.users com SECURITY DEFINER)
  const { error: rpcError } = await supabase.rpc('delete_user_account');

  if (rpcError) {
    // Sem o texto do erro do backend: o log do aparelho não é lugar de
    // detalhe interno do banco.
    console.warn('[deleteUserAccount] RPC indisponível; apagando apenas as tabelas públicas.');
    // Fallback caso a função ainda não tenha sido executada no SQL Editor
    await supabase.from('transactions').delete().eq('user_id', user_id);
    await supabase.from('bills').delete().eq('user_id', user_id);
    await supabase.from('budgets').delete().eq('user_id', user_id);
    await supabase.from('categories').delete().eq('user_id', user_id);
    await supabase.from('whatsapp_links').delete().eq('user_id', user_id);
  }

  // 2. Encerrar sessão localmente
  await supabase.auth.signOut();
}



