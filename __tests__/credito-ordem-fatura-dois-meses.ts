/* Ordem dos lancamentos do Credito numa fatura que atravessa dois meses civis
 * (cartao que fecha dia 14: fatura de outubro = 14/09 a 13/10). Autor, 01/10:
 * os de outubro apareciam DEPOIS dos de setembro, porque loadData junta os
 * meses um depois do outro (porMes.flat()).
 *
 * Roda o modulo real (lib/creditoFaturas.ts) e confere, na fonte da tela, que
 * os DOIS pontos de montagem da lista usam a ordenacao: o dedup de loadData
 * (carga e recarga apos recorrencias) e o memo creditTransactions (que cobre
 * insercao otimista e o carrossel por cartao).
 * Roda: npx tsx __tests__/credito-ordem-fatura-dois-meses.ts
 */
import { readFileSync } from 'node:fs';
import {
  agruparLancamentosPorCartao,
  filtrarLancamentosDaFatura,
  ordenarLancamentosRecentesPrimeiro,
} from '../lib/creditoFaturas';
import type { CreditCard, Transaction } from '../lib/types';

let total = 0;
function igual(real: unknown, esperado: unknown, rotulo: string) {
  total++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    console.error(`FALHOU ${rotulo}\n  real:     ${JSON.stringify(real)}\n  esperado: ${JSON.stringify(esperado)}`);
    process.exit(1);
  }
  console.log('  ok  ' + rotulo);
}

const cartao = { id: 'c1', user_id: 'u', name: 'C6', bank: 'c6', color: '#000', limit_amount: 1000, closing_day: 14, due_day: 21, created_at: '2026-01-01T00:00:00Z' } as CreditCard;
const tx = (id: string, occurred_on: string, created_at: string): Transaction =>
  ({ id, user_id: 'u', type: 'out', amount: 10, category: 'x', description: id, occurred_on, created_at, payment_method: 'credit', card_id: 'c1' } as unknown as Transaction);

const setembro = [tx('s30', '2026-09-30', '2026-09-30T10:00:00Z'), tx('s14', '2026-09-14', '2026-09-14T10:00:00Z')];
const outubro = [tx('o13', '2026-10-13', '2026-10-13T10:00:00Z'), tx('o02', '2026-10-02', '2026-10-02T10:00:00Z')];
const naoFatura = [tx('s13', '2026-09-13', '2026-09-13T10:00:00Z')]; // 13/09 ainda e da fatura anterior (mes 8, base 0)

// Como loadData monta: meses em ordem crescente, cada um decrescente.
const porMesFlat = [...setembro, ...outubro, ...naoFatura];

const fatura = filtrarLancamentosDaFatura(porMesFlat, [cartao], 'c1', 2026, 9);
igual(fatura.map((t) => t.id), ['s30', 's14', 'o13', 'o02'], 'sem ordenar, a fatura sai com setembro antes de outubro (o defeito)');
igual(ordenarLancamentosRecentesPrimeiro(fatura).map((t) => t.id), ['o13', 'o02', 's30', 's14'], 'ordenada: outubro antes de setembro');

// Insercao otimista no topo (pagamento/compra antiga) nao quebra a ordem apos o memo.
const comOtimista = [tx('novaAntiga', '2026-09-20', '2026-10-01T20:00:00Z'), ...porMesFlat];
igual(
  ordenarLancamentosRecentesPrimeiro(filtrarLancamentosDaFatura(comOtimista, [cartao], 'c1', 2026, 9)).map((t) => t.id),
  ['o13', 'o02', 's30', 'novaAntiga', 's14'],
  'compra inserida no topo com data de setembro vai para o lugar dela'
);

// Visao "todos os cartoes": cada secao tambem sai ordenada.
const secoes = agruparLancamentosPorCartao(ordenarLancamentosRecentesPrimeiro(filtrarLancamentosDaFatura(porMesFlat, [cartao], 'all', 2026, 9)), [cartao]);
igual(secoes[0].data.map((t) => t.id), ['o13', 'o02', 's30', 's14'], 'secao do carrossel/lista por cartao ordenada');

// Desempate e ausencia de created_at.
igual(
  ordenarLancamentosRecentesPrimeiro([tx('a', '2026-10-02', '2026-10-02T08:00:00Z'), tx('b', '2026-10-02', '2026-10-02T09:00:00Z'), tx('c', '2026-10-02', '2026-10-02T09:00:00Z')]).map((t) => t.id),
  ['c', 'b', 'a'], 'mesmo dia: created_at e depois id, decrescentes'
);
igual(ordenarLancamentosRecentesPrimeiro([{ id: 'x', occurred_on: '2026-10-02' }, { id: 'y', occurred_on: '2026-10-02', created_at: null as any }]).map((t) => t.id), ['y', 'x'], 'created_at ausente nao quebra');
const original = [...setembro, ...outubro];
ordenarLancamentosRecentesPrimeiro(original);
igual(original.map((t) => t.id), ['s30', 's14', 'o13', 'o02'], 'nao muda o array recebido');

// Fonte da tela: os dois pontos usam a ordenacao.
const tela = readFileSync('app/(app)/credito.tsx', 'utf8');
total++;
if (!/const dedup = [\s\S]{0,120}ordenarLancamentosRecentesPrimeiro\(/.test(tela)) { console.error('FALHOU: dedup de loadData nao ordena'); process.exit(1); }
total++;
if (!/const creditTransactions = useMemo\(\s*\(\) => ordenarLancamentosRecentesPrimeiro\(/.test(tela)) { console.error('FALHOU: creditTransactions nao ordena'); process.exit(1); }
console.log('  ok  credito.tsx: dedup (carga e recarga apos recorrencias) e creditTransactions usam a ordenacao');
console.log(`\n${total}/${total} checagens da ordem da fatura de dois meses passaram`);
