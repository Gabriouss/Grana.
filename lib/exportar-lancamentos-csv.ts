import { escaparCelulaCsv, protegerInjecaoFormulaCsv } from './admin-relatorio-csv';
import { lancamentosDaCarteira } from './creditoFaturas';
import type { CreditCard, Transaction, Wallet } from './types';

export type PeriodoCsv = 'tudo' | string; // mês civil AAAA-MM; validado antes de usar
export type OpcoesCsvLancamentos = {
  userId: string;
  lancamentos: Transaction[];
  carteiras: Wallet[];
  cartoes: CreditCard[];
  carteiraId: string; // total ou id real; nunca o nome exibido
  periodo: PeriodoCsv;
};
export type CsvLancamentos = { nomeArquivo: string; conteudo: string; quantidade: number };
const FORMAS: Record<string, string> = { pix: 'Pix', debit: 'Débito', credit: 'Crédito', cash: 'Dinheiro' };

function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split('-').map(Number);
  return ano >= 1000 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= new Date(ano, mes, 0).getDate();
}

/** Exporta registros, sem gerar sobra, saldo, recorrência nem pagamento novo. */
export function montarCsvLancamentos(opcoes: OpcoesCsvLancamentos): CsvLancamentos {
  const { userId, lancamentos, carteiraId, periodo } = opcoes;
  if (!userId || lancamentos.some((t) => t.user_id !== userId)) throw new Error('Confirme a conta antes de exportar.');
  if (periodo !== 'tudo' && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo) || !dataValida(periodo + '-01'))) throw new Error('Período inválido.');
  const carteiras = opcoes.carteiras.filter((w) => w.user_id === userId);
  const padrao = carteiras.filter((w) => w.is_default)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))[0];
  const porCarteira = new Map(carteiras.map((w) => [w.id, w]));
  if (carteiraId !== 'total' && !porCarteira.has(carteiraId)) throw new Error('A carteira mudou. Escolha novamente.');
  const cartoes = opcoes.cartoes.filter((c) => c.user_id === userId);
  const porCartao = new Map(cartoes.map((c) => [c.id, c]));
  const destino = (t: Transaction): string | null => {
    const cartao = t.card_id ? porCartao.get(t.card_id) : undefined;
    const id = cartao ? cartao.wallet_id : t.wallet_id;
    if (id) return id;
    if (!padrao) throw new Error('Não foi possível identificar a carteira Principal padrão.');
    return padrao.id;
  };
  // Normaliza o legado e passa pelo filtro compartilhado de cartão/carteira.
  const normalizados = lancamentos.map((t) => {
    if (!dataValida(t.occurred_on) || typeof t.amount !== 'number' || !Number.isFinite(t.amount)
      || !Number.isSafeInteger(Math.round(t.amount * 100)) || !['in', 'out'].includes(t.type)) {
      throw new Error('Lançamento com data, tipo ou valor inválido. Corrija antes de exportar.');
    }
    return { ...t, wallet_id: destino(t) };
  });
  const cartoesComCarteira = cartoes.map((c) => ({ ...c, wallet_id: c.wallet_id ?? padrao?.id }));
  const selecionados = lancamentosDaCarteira(normalizados, cartoesComCarteira, carteiraId)
    .filter((t) => periodo === 'tudo' || t.occurred_on.startsWith(periodo + '-'))
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id));
  const celula = (v: string): string => escaparCelulaCsv(protegerInjecaoFormulaCsv(v), ';');
  const linhas = [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Forma de pagamento', 'Carteira', 'Cartão']];
  for (const t of selecionados) {
    const [ano, mes, dia] = t.occurred_on.split('-');
    const cartao = t.card_id ? porCartao.get(t.card_id) : undefined;
    const valor = (Math.round((Number(t.amount) + Number.EPSILON) * 100) / 100).toFixed(2).replace('.', ',');
    linhas.push([`${dia}/${mes}/${ano}`, t.description ?? '', t.category ?? '', t.type === 'in' ? 'Entrada' : 'Saída', valor,
      FORMAS[t.payment_method ?? ''] ?? 'Não informada', porCarteira.get(t.wallet_id ?? '')?.name ?? 'Carteira indisponível',
      cartao?.name ?? (t.card_id ? 'Cartão indisponível' : '')]);
  }
  return { nomeArquivo: `grana-lancamentos-${periodo === 'tudo' ? 'todos' : periodo}.csv`, quantidade: selecionados.length,
    conteudo: '\uFEFF' + linhas.map((linha) => linha.map(celula).join(';')).join('\r\n') + '\r\n' };
}
