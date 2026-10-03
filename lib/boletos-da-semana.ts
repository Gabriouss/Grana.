import type { Bill } from './types';

/**
 * Contas em aberto que a Início lista em "Vence esta semana": as que vencem nos
 * próximos 7 dias e também as ATRASADAS, que são as que mais precisam de olhar.
 * Só lista; nenhuma delas entra no Livre para gastar (regra 20: conta pendente
 * ou atrasada só conta quando é paga).
 */
export function boletosDaSemana(bills: Bill[], hoje: Date): Bill[] {
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  return bills
    .filter((b) => {
      if (b.status === 'paid') return false;
      const diffDays = Math.round((new Date(b.due_date + 'T00:00:00').getTime() - base.getTime()) / 86400000);
      return diffDays <= 6;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function boletoAtrasado(b: Bill, hoje: Date): boolean {
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  return new Date(b.due_date + 'T00:00:00').getTime() < base.getTime();
}
