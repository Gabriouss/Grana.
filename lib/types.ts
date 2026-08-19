export type TxType = 'in' | 'out';
export type BillStatus = 'due' | 'paid';
export type PaymentMethod = 'debit' | 'credit' | 'pix' | 'cash';

export type BankInfo = {
  id: string;
  name: string;
  color: string;
  bgDark: string;
  iconName?: string;
  packageNames?: string[]; // IDs de pacotes Android para detecção de push
};

export const BANKS: BankInfo[] = [
  { id: 'nubank', name: 'Nubank', color: '#820ad1', bgDark: '#3b045e', packageNames: ['com.nu.production'] },
  { id: 'itau', name: 'Itaú', color: '#ec7000', bgDark: '#5e2d00', packageNames: ['com.itau', 'com.itau.personnalite'] },
  { id: 'inter', name: 'Inter', color: '#ff7a00', bgDark: '#663100', packageNames: ['br.com.intermedium'] },
  { id: 'bradesco', name: 'Bradesco', color: '#cc092f', bgDark: '#540313', packageNames: ['com.bradesco'] },
  { id: 'santander', name: 'Santander', color: '#ec0000', bgDark: '#590000', packageNames: ['com.santander.app'] },
  { id: 'c6', name: 'C6 Bank', color: '#242424', bgDark: '#121212', packageNames: ['com.c6bank.app'] },
  { id: 'mercadopago', name: 'Mercado Pago', color: '#009ee3', bgDark: '#00405c', packageNames: ['com.mercadopago.wallet'] },
  { id: 'caixa', name: 'Caixa', color: '#0066b3', bgDark: '#002c4d', packageNames: ['br.com.gabba.Caixa'] },
  { id: 'bb', name: 'Banco do Brasil', color: '#f8d117', bgDark: '#5e4e00', packageNames: ['br.com.bb.android'] },
  { id: 'btg', name: 'BTG Pactual', color: '#001e62', bgDark: '#000f30', packageNames: ['com.btg.pactual.banking'] },
  { id: 'outro', name: 'Outro Banco', color: '#8b9198', bgDark: '#2a2f35' },
];

export type Wallet = {
  id: string;
  user_id: string;
  name: string; // Ex: "Principal", "Casamento", "Coroa Aposentada", "Carteira"
  initial_balance: number;
  color: string;
  icon: string;
  is_default: boolean;
  created_at: string;
};

export type CreditCard = {
  id: string;
  user_id: string;
  name: string; // Ex: "Nubank Ultravioleta" ou "Itaú Click"
  bank: string; // Ex: 'nubank', 'itau', etc.
  color: string;
  last_digits?: string; // Ex: "1234"
  limit_amount: number; // Limite total
  closing_day: number; // Dia de fechamento da fatura (1 a 31)
  due_day: number; // Dia de vencimento da fatura (1 a 31)
  wallet_id?: string | null;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string; // 'YYYY-MM-DD'
  recurring: boolean;
  parent_id: string | null;
  /** Método de pagamento da movimentação */
  payment_method?: PaymentMethod;
  /** Banco emissor / conta vinculada (ex: 'nubank', 'itau') */
  bank?: string;
  /** Cartão de crédito associado se payment_method === 'credit' */
  card_id?: string | null;
  /** Posição desta parcela dentro da compra (1-based) — 1 para lançamentos avulsos. */
  installment_current?: number;
  /** Total de parcelas da compra — 1 para lançamentos avulsos. */
  installment_total?: number;
  /** Carteira / Conta à qual esta transação pertence */
  wallet_id?: string | null;
  created_at: string;
};

export type Bill = {
  id: string;
  user_id: string;
  description: string;
  amount: number;
  category: string;
  color: string;
  due_date: string; // 'YYYY-MM-DD'
  status: BillStatus;
  recurring: boolean;
  /** Id da saída lançada automaticamente quando a conta foi paga */
  paid_transaction_id: string | null;
  /** Carteira vinculada ao boleto/conta fixa */
  wallet_id?: string | null;
  created_at: string;
};

/** Registro de pagamento de fatura de cartão — existe só quando a fatura daquele mês já foi paga. */
export type CreditCardInvoicePayment = {
  id: string;
  user_id: string;
  card_id: string;
  year: number;
  month: number; // 0-based, mesma convenção de isSameMonth()
  amount: number;
  paid_on: string; // 'YYYY-MM-DD'
  wallet_id: string | null;
  paid_transaction_id: string | null;
  created_at: string;
};

export type Budget = {
  user_id: string;
  category: string;
  amount: number;
  color: string;
  updated_at: string;
};

export type WhatsappLink = {
  id: string;
  user_id: string;
  phone: string;
  pairing_code: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
};

export type CategoryType = 'in' | 'out' | 'both';

/** Categoria do usuário */
export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  type: CategoryType;
  is_default: boolean;
  created_at: string;
};

/** Cofrinho / meta financeira */
export type Goal = {
  id: string;
  user_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  color: string;
  icon: string;
  deadline: string | null;
  /** Carteira associada */
  wallet_id?: string | null;
  created_at: string;
};

/** Perfil de gamificação com XP vitalício */
export type UserGamification = {
  user_id: string;
  lifetime_xp: number;
  streak_shields: number;
  updated_at: string;
};

export const CATEGORIES: { name: string; color: string }[] = [
  { name: 'Alimentação', color: '#bb6b60' },
  { name: 'Moradia', color: '#93739e' },
  { name: 'Transporte', color: '#6b9dc2' },
  { name: 'Lazer', color: '#c66f8e' },
  { name: 'Saúde', color: '#74a17c' },
  { name: 'Assinaturas', color: '#d3b869' },
  { name: 'Salário', color: '#4f9483' },
  { name: 'Investimentos', color: '#c1a24c' },
  { name: 'Outros', color: '#8b9198' },
];
