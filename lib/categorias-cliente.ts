import { fetchCardInvoicePayments, fetchTransactionsDoPeriodo } from './data';
import { estaServindoDoCache } from './cache-de-tela';
import { idDoUsuarioLocal } from './sessao-offline';
import { apurarGastosCategoria, valorDaVisao, type ConsumoApurado, type Visao } from './gastos-categoria';
import type { Transaction } from './types';

export type CategoriasConsultadas = {
  userId: string; inicio: string; fim: string; atualizadoEm: string;
  linhas: Transaction[]; consumo: ConsumoApurado; doCache: boolean;
};
export type ResultadoCategorias = { resultado: CategoriasConsultadas | null; erro: string | null };

/** Os buscadores existentes paginam, conciliam a fila e identificam o cache offline. */
export async function consultarCategorias(inicio: string, fim: string, anterior?: CategoriasConsultadas | null): Promise<ResultadoCategorias> {
  const userId = await idDoUsuarioLocal();
  if (!userId) return { resultado: null, erro: 'Entre na sua conta para consultar as categorias.' };
  try {
    const [linhas, pagamentos] = await Promise.all([fetchTransactionsDoPeriodo(inicio, fim), fetchCardInvoicePayments()]);
    if (await idDoUsuarioLocal() !== userId) return { resultado: null, erro: 'A conta mudou. Atualize as categorias.' };
    const idsPagamentos = new Set(pagamentos.flatMap(p => [p.paid_transaction_id, ...(p.extra_transaction_ids ?? [])].filter((id): id is string => !!id)));
    return { resultado: { userId, inicio, fim, atualizadoEm: new Date().toISOString(), linhas, consumo: apurarGastosCategoria(linhas, { inicio, fim, idsPagamentos }), doCache: estaServindoDoCache() }, erro: null };
  } catch (e) {
    console.error('[categorias] consulta falhou', e);
    return { resultado: anterior?.userId === userId ? anterior : null, erro: 'Não foi possível atualizar as categorias.' };
  }
}

/** A lista usa os IDs do mesmo cálculo, incluindo a conciliação de duplicatas. */
export function linhasDaCategoria(r: CategoriasConsultadas, categoria: string | null, visao: Visao): Transaction[] {
  const ids = new Set(r.consumo.saidas.filter(s => (!categoria || s.category === categoria) && (visao === 'tudo' || s.forma === visao)).map(s => s.id));
  const vistos = new Set<string>();
  return r.linhas.filter(t => {
    if (!ids.has(t.id) || vistos.has(t.id)) return false;
    vistos.add(t.id); return true;
  });
}

export function categoriasDaVisao(consumo: ConsumoApurado, visao: Visao) {
  return consumo.porCategoria.map(c => ({ name: c.category, color: c.color, value: valorDaVisao(c, visao) / 100 })).filter(c => c.value > 0);
}
