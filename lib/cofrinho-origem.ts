import type { Goal } from './types';

export type OrigemCofrinho = 'mes' | 'anterior';
export function mesDoCofrinho(hoje = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}
export function valorResgatavel(goal: Goal, origem: OrigemCofrinho, mes = mesDoCofrinho()): number {
  const doMes = Math.max(0, Number(goal.month_reserves?.[mes] ?? 0));
  return origem === 'mes' ? doMes : Math.max(0, Number(goal.current_amount) - doMes);
}
/** Adaptador do modo de exemplo; a conta real valida e trava a linha na RPC. */
export function movimentarCofrinhoLocal(goal: Goal, delta: number, origem: OrigemCofrinho, mes = mesDoCofrinho()): Goal {
  const valor = Math.round(delta * 100) / 100;
  if (!Number.isFinite(valor) || valor === 0) throw new Error('Informe um valor válido.');
  if (valor < 0 && -valor > valorResgatavel(goal, origem, mes)) throw new Error('Valor maior que o disponível nessa origem.');
  const reservas = { ...goal.month_reserves };
  if (origem === 'mes') reservas[mes] = Math.round((Number(reservas[mes] ?? 0) + valor) * 100) / 100;
  return { ...goal, current_amount: Math.round((Number(goal.current_amount) + valor) * 100) / 100, month_reserves: reservas };
}
