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
  created_at: string;
};

export type Budget = {
  user_id: string;
  category: string;
  amount: number;
  color: string;
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
  { name: 'Outros', color: '#8b9198' },
];
