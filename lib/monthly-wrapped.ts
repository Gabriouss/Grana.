/**
 * Retrospectiva do Mês ("Wrapped") — Épico 4 do PLANO_DE_EVOLUCAO.md.
 *
 * Consolida o mês FECHADO (o anterior ao atual) numa estrutura pronta para os
 * slides. Só olha para o mês anterior de propósito: o mês corrente ainda está
 * acontecendo, e um "resumo" de um mês pela metade dá uma impressão errada de
 * quanto se gastou.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Bill, Budget, Transaction } from './types';
import { calcularLevelState, type LevelState } from './gamification-infinite';

const CHAVE_VISTO = '@grana_wrapped_visto';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export type CategoriaCampea = {
  nome: string;
  cor: string;
  total: number;
  /** Fatia deste gasto sobre o total de saídas do mês, 0 a 1. */
  fatiaDasSaidas: number;
  /** Orçamento definido para a categoria, ou null se não havia. */
  orcamento: number | null;
  /** Gasto ÷ orçamento (pode passar de 1), ou null se não havia orçamento. */
  usoDoOrcamento: number | null;
};

export type MonthlyWrapped = {
  ano: number;
  mes: number; // 0-11
  /** Chave estável do mês, ex: '2026-07' — usada para lembrar que já foi visto. */
  chave: string;
  label: string; // 'Julho de 2026'
  entradas: number;
  saidas: number;
  /** entradas − saidas. Negativo = déficit. */
  saldo: number;
  /** Fatia da renda que sobrou, 0 a 1. Null quando não houve entrada no mês. */
  taxaPoupanca: number | null;
  totalLancamentos: number;
  maiorDespesa: Transaction | null;
  categoriaCampea: CategoriaCampea | null;
  boletosPagos: number;
  valorBoletosPagos: number;
  level: LevelState;
  /** true quando não houve movimentação nenhuma — a retrospectiva não deve ser exibida. */
  vazio: boolean;
};

function ehDoMes(dataISO: string, ano: number, mes: number): boolean {
  const [y, m] = dataISO.split('-').map(Number);
  return y === ano && m - 1 === mes;
}

/** Ano/mês do último mês fechado em relação a `hoje`. */
export function mesFechadoAnterior(hoje: Date = new Date()): { ano: number; mes: number } {
  const ref = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { ano: ref.getFullYear(), mes: ref.getMonth() };
}

export function chaveDoMes(ano: number, mes: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

/**
 * A retrospectiva de um mês é exibida uma vez só. O plano original previa
 * abrir "no dia 1º", mas isso significaria que quem não abrisse o app
 * exatamente naquele dia perderia o resumo para sempre — então a regra aqui é
 * "no primeiro acesso após o mês virar, seja qual for o dia".
 */
export async function wrappedJaVisto(chave: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE_VISTO)) === chave;
  } catch {
    // Sem acesso ao storage, o menos pior é não insistir num modal de tela cheia.
    return true;
  }
}

export async function marcarWrappedVisto(chave: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_VISTO, chave);
  } catch {
    // Se não deu para gravar, o modal reaparece no próximo acesso — irritante, não quebrado.
  }
}

export function gerarMonthlyWrapped(
  transactions: Transaction[],
  bills: Bill[],
  budgets: Budget[],
  lifetimeXp: number,
  hoje: Date = new Date()
): MonthlyWrapped {
  const { ano, mes } = mesFechadoAnterior(hoje);

  const doMes = transactions.filter((t) => ehDoMes(t.occurred_on, ano, mes));
  const saidasTx = doMes.filter((t) => t.type === 'out');

  const entradas = doMes.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const saidas = saidasTx.reduce((s, t) => s + Number(t.amount), 0);

  const maiorDespesa = saidasTx.reduce<Transaction | null>(
    (maior, t) => (!maior || Number(t.amount) > Number(maior.amount) ? t : maior),
    null
  );

  const porCategoria = new Map<string, { total: number; cor: string }>();
  for (const t of saidasTx) {
    const atual = porCategoria.get(t.category) ?? { total: 0, cor: t.color };
    atual.total += Number(t.amount);
    porCategoria.set(t.category, atual);
  }

  let categoriaCampea: CategoriaCampea | null = null;
  for (const [nome, { total, cor }] of porCategoria) {
    if (categoriaCampea && total <= categoriaCampea.total) continue;
    const orcamentoDaCat = budgets.find((b) => b.category === nome);
    const orcamento = orcamentoDaCat ? Number(orcamentoDaCat.amount) : null;
    categoriaCampea = {
      nome,
      cor,
      total,
      fatiaDasSaidas: saidas > 0 ? total / saidas : 0,
      orcamento,
      usoDoOrcamento: orcamento && orcamento > 0 ? total / orcamento : null,
    };
  }

  /* Um boleto conta como "pago no mês" pela data de vencimento, não pela data
     em que foi quitado: `bills` não guarda quando o pagamento aconteceu, só o
     vencimento e o status atual. Contar pelo vencimento é a leitura possível
     e também a mais intuitiva — "as contas de julho". */
  const boletosDoMes = bills.filter((b) => b.status === 'paid' && ehDoMes(b.due_date, ano, mes));

  return {
    ano,
    mes,
    chave: chaveDoMes(ano, mes),
    label: `${MESES[mes]} de ${ano}`,
    entradas,
    saidas,
    saldo: entradas - saidas,
    taxaPoupanca: entradas > 0 ? (entradas - saidas) / entradas : null,
    totalLancamentos: doMes.length,
    maiorDespesa,
    categoriaCampea,
    boletosPagos: boletosDoMes.length,
    valorBoletosPagos: boletosDoMes.reduce((s, b) => s + Number(b.amount), 0),
    level: calcularLevelState(lifetimeXp),
    vazio: doMes.length === 0,
  };
}
