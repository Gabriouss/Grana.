/**
 * Núcleo PURO de gasto por categoria: débito e crédito juntos (pedido do
 * autor, 01/11/2026; spec do Compass, seção 2). Sem React Native, Expo nem
 * Deno: pode ser usado pelo app e, depois, pela Edge Function.
 *
 * DEFINIÇÃO DE CONSUMO: `type = 'out'` na data `occurred_on`, incluindo a
 * compra no crédito (conta no dia da compra) e EXCLUINDO o pagamento da
 * fatura, senão a compra contaria em dobro. Entrada nunca abate gasto; meta e
 * cofrinho não são lançamento; não existe tipo "transferência". Investimentos
 * como saída conta. Categoria vazia vira "Outros"; categoria personalizada é
 * preservada como veio.
 *
 * "Tudo" = à vista + crédito. "À vista" é tudo que não é crédito (débito,
 * Pix, dinheiro, boleto pago, legado sem forma). Crédito = `payment_method =
 * 'credit'` OU `card_id` preenchido (mesma regra de `isCreditTx`).
 *
 * O período é do chamador (`inicio` e `fim`, inclusive, em ISO local): o
 * Padrão de gastos corta em hoje; categorias e tetos usam o mês civil inteiro.
 * Mesma classificação, intervalos explicitamente diferentes.
 *
 * Tudo em CENTAVOS inteiros.
 */
import { isCreditTx } from './transaction-rules';
import type { Transaction } from './types';

export const CATEGORIA_PAGAMENTO_FATURA = 'Cartão de crédito';
export const CATEGORIA_SEM_NOME = 'Outros';

export type LinhaDeGasto = Pick<
  Transaction,
  'id' | 'type' | 'amount' | 'occurred_on' | 'category' | 'description' | 'payment_method' | 'card_id'
> &
  Partial<Pick<Transaction, 'color'>>;

export type PagamentosConhecidos = {
  /** Ids de lançamentos que o banco registra como pagamento de fatura
   *  (`credit_card_invoices.paid_transaction_id` e `extra_transaction_ids`). */
  idsDePagamento?: ReadonlySet<string>;
};

/**
 * É o pagamento de uma fatura? Três sinais, qualquer um basta:
 *  1. o id está em `credit_card_invoices` (o vínculo oficial);
 *  2. saída da categoria "Cartão de crédito" que NÃO é compra no crédito
 *     (é o que `pagar_fatura_cartao` grava, sem `card_id`);
 *  3. descrição "Pagamento da fatura ..." ou "Pagamento fatura ..." (builds
 *     antigas), mesmo sem categoria.
 * Compra de verdade no crédito traz `payment_method = 'credit'` ou `card_id` e
 * nunca é tratada como pagamento.
 */
export function ehPagamentoDeFatura(t: LinhaDeGasto, conhecidos: PagamentosConhecidos = {}): boolean {
  if (conhecidos.idsDePagamento?.has(t.id)) return true;
  if (isCreditTx(t)) return false;
  if (t.category === CATEGORIA_PAGAMENTO_FATURA) return true;
  return /^\s*pagamento\s+(da\s+)?fatura\b/i.test(t.description ?? '');
}

export type Forma = 'avista' | 'credito';

export type SaidaDeConsumo = {
  id: string;
  iso: string;
  centavos: number;
  category: string;
  color?: string;
  forma: Forma;
};

export type TotaisEmCentavos = { tudo: number; avista: number; credito: number };

export type ConsumoPorCategoria = TotaisEmCentavos & { category: string; color?: string };
export type ConsumoPorDia = TotaisEmCentavos & { iso: string };

export type ConsumoApurado = {
  /** As linhas que entraram, com forma e centavos (para listar sem refazer conta). */
  saidas: SaidaDeConsumo[];
  /** Ids das linhas que entraram. */
  ids: string[];
  /** Por categoria, maior "Tudo" primeiro. */
  porCategoria: ConsumoPorCategoria[];
  /** Por dia, em ordem de data. */
  porDia: ConsumoPorDia[];
  total: TotaisEmCentavos;
};

export type OpcoesDeApuracao = {
  /** Primeiro dia, inclusive (ISO local `AAAA-MM-DD`). */
  inicio: string;
  /** Último dia, inclusive. */
  fim: string;
  idsPagamentos?: ReadonlySet<string>;
};

const vazio = (): TotaisEmCentavos => ({ tudo: 0, avista: 0, credito: 0 });
function somarEm(t: TotaisEmCentavos, s: SaidaDeConsumo): void {
  t.tudo += s.centavos;
  t[s.forma] += s.centavos;
}

/** Valor em reais para centavos inteiros, sem erro de ponto flutuante. */
export function emCentavos(valor: number | string): number {
  return Math.round(Number(valor) * 100);
}

/**
 * Soma o consumo do intervalo. Cada linha entra no máximo uma vez (por id,
 * quando a lista traz o mesmo lançamento duas vezes, como fila + banco).
 */
export function apurarGastosCategoria(
  linhas: ReadonlyArray<LinhaDeGasto>,
  { inicio, fim, idsPagamentos }: OpcoesDeApuracao
): ConsumoApurado {
  const conhecidos: PagamentosConhecidos = { idsDePagamento: idsPagamentos };
  const vistos = new Set<string>();
  const saidas: SaidaDeConsumo[] = [];

  for (const t of linhas) {
    if (t.type !== 'out') continue;
    if (!t.occurred_on || t.occurred_on < inicio || t.occurred_on > fim) continue;
    if (ehPagamentoDeFatura(t, conhecidos)) continue;
    if (t.id) {
      if (vistos.has(t.id)) continue;
      vistos.add(t.id);
    }
    saidas.push({
      id: t.id,
      iso: t.occurred_on,
      centavos: emCentavos(t.amount),
      category: t.category && t.category.trim() ? t.category : CATEGORIA_SEM_NOME,
      color: t.color,
      forma: isCreditTx(t) ? 'credito' : 'avista',
    });
  }

  const total = vazio();
  const cats = new Map<string, ConsumoPorCategoria>();
  const dias = new Map<string, ConsumoPorDia>();
  for (const s of saidas) {
    somarEm(total, s);
    const c = cats.get(s.category) ?? { category: s.category, color: s.color, ...vazio() };
    somarEm(c, s);
    if (!c.color && s.color) c.color = s.color;
    cats.set(s.category, c);
    const d = dias.get(s.iso) ?? { iso: s.iso, ...vazio() };
    somarEm(d, s);
    dias.set(s.iso, d);
  }

  return {
    saidas,
    ids: saidas.map((s) => s.id),
    porCategoria: [...cats.values()].sort((a, b) => b.tudo - a.tudo || a.category.localeCompare(b.category)),
    porDia: [...dias.values()].sort((a, b) => (a.iso < b.iso ? -1 : 1)),
    total,
  };
}

/** Parte de uma categoria lida numa visão. */
export type Visao = 'tudo' | 'avista' | 'credito';
export function valorDaVisao(t: TotaisEmCentavos, visao: Visao): number {
  return t[visao];
}

/** Quanto passou do teto (centavos, em "Tudo"); 0 se não passou. */
export function acimaDoTeto(consumoTudo: number, tetoEmReais: number): number {
  return Math.max(0, consumoTudo - emCentavos(tetoEmReais));
}
