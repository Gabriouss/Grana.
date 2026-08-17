export type TxType = 'in' | 'out';
export type BillStatus = 'due' | 'paid';

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
  /** Id da saída lançada automaticamente quando a conta foi paga (ver payBill em lib/data.ts), ou null se ainda não foi paga / foi paga antes desta feature existir. */
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

/** Categoria do usuário — inclui tanto as 8 padrão (semeadas com is_default) quanto as criadas do zero. */
export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  type: CategoryType;
  is_default: boolean;
  created_at: string;
};

export const CATEGORIES: { name: string; color: string }[] = [
  { name: 'Alimentação', color: '#bb6b60' },
  { name: 'Moradia', color: '#93739e' },
  { name: 'Transporte', color: '#6b9dc2' },
  { name: 'Lazer', color: '#c66f8e' },
  { name: 'Saúde', color: '#74a17c' },
  { name: 'Assinaturas', color: '#d3b869' },
  { name: 'Salário', color: '#4f9483' },
  { name: 'Outros', color: '#8b9198' },
];
