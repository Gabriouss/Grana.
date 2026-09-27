/* Parcelas pelo ciclo da compra original, e entrada no cartão ignorada na fatura
 * (Crédito por ciclo, etapa b, 23/09/2026). Módulos reais:
 * `lib/creditoFaturas.ts`, `lib/faturaCiclo.ts`, `lib/format.ts` e o
 * `_shared/fatura-ciclo.ts` do Granabô.
 *
 * Roda: npx tsx __tests__/corpus-parcelas-estorno.ts
 */
import {
  cicloDoLancamento,
  comprasOriginaisAusentes,
  faturaTemParcelaIncerta,
  filtrarLancamentosDaFatura,
  lembretesDeFatura,
  mesesCivisDasFaturas,
  resumoDeFaturas,
  somaDaFatura,
  valorNaFatura,
} from '../lib/creditoFaturas';
import { mesFaturaDoLancamento } from '../lib/faturaCiclo';
import { addMonthsToISO } from '../lib/format';
import * as deno from '../supabase/functions/_shared/fatura-ciclo';
import type { CreditCard, Transaction } from '../lib/types';
import { readFileSync } from 'fs';
import { join } from 'path';

let total = 0;
let falhas = 0;
function checar<T>(rotulo: string, obtido: T, esperado: T) {
  total++;
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
}

const cartao = (id: string, closing_day: number): CreditCard => ({
  id, user_id: 't', name: id, bank: id, color: '#123456', limit_amount: 1000,
  closing_day, due_day: 10, created_at: '2026-01-01T00:00:00Z',
});
let seq = 0;
const lanc = (card_id: string | null, occurred_on: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: extra.id ?? `t${++seq}`, user_id: 't', type: 'out', description: 'x', amount, category: 'Outros',
  color: '#000', occurred_on, recurring: false, parent_id: null, payment_method: 'credit', bank: 'x',
  card_id: card_id ?? undefined, created_at: '2026-01-01T00:00:00Z', ...extra,
}) as Transaction;

/** Parcelamento como o banco grava: parcela k em compra + (k-1) meses, limitado ao fim do mês. */
function parcelar(card_id: string, compra: string, n: number, valor = 10): Transaction[] {
  const pai = `pai-${card_id}-${compra}-${n}`;
  return Array.from({ length: n }, (_, i) =>
    lanc(card_id, addMonthsToISO(compra, i), valor, {
      id: i === 0 ? pai : `${pai}-${i + 1}`,
      parent_id: i === 0 ? null : pai,
      installment_current: i + 1,
      installment_total: n,
    }));
}
const idx = (c: { year: number; month: number }) => c.year * 12 + c.month;

/* ---------- 1. Fechamento 1-28: a data da parcela basta (varredura) ----------
   É o que autoriza `cicloDoLancamento` a não pedir a compra original abaixo de
   29. Se `addMonthsToISO` ou a regra de fechamento mudarem, isto quebra. */
{
  let fora = 0;
  for (let cd = 1; cd <= 28; cd++) {
    for (let d = new Date(2026, 0, 1); d.getFullYear() < 2028; d.setDate(d.getDate() + 1)) {
      const compra = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const c0 = idx(mesFaturaDoLancamento(compra, cd));
      for (let k = 1; k < 12; k++) if (idx(mesFaturaDoLancamento(addMonthsToISO(compra, k), cd)) !== c0 + k) fora++;
    }
  }
  checar('fechamento 1-28: nenhuma parcela fora de sequência em 2026-27', fora, 0);
}

/* ---------- 2. Fechamento 29-31: parcela pelo ciclo da compra ---------- */
for (const cd of [29, 30, 31]) {
  const c = cartao(`c${cd}`, cd);
  for (const compra of ['2026-01-29', '2026-01-30', '2026-01-31', '2027-03-31']) {
    const parcelas = parcelar(c.id, compra, 12);
    const c0 = idx(mesFaturaDoLancamento(compra, cd));
    const ciclos = parcelas.map((p) => idx(cicloDoLancamento(p, c, new Map()).ciclo));
    // Com o pai carregado junto (mesmo conjunto), cada parcela numa fatura, em sequência.
    const comPai = parcelas.map((p) => {
      const pai = new Map([[parcelas[0].id, compra]]);
      return idx(cicloDoLancamento(p, c, pai).ciclo);
    });
    checar(`fechamento ${cd}, compra ${compra}: uma parcela por fatura, consecutivas`,
      comPai, Array.from({ length: 12 }, (_, k) => c0 + k));
    void ciclos;
    // A lista da fatura (filtrar) vê o pai no próprio conjunto e acerta sozinha.
    for (let k = 0; k < 12; k++) {
      const alvo = new Date(Math.floor((c0 + k) / 12), (c0 + k) % 12, 1);
      const naFatura = filtrarLancamentosDaFatura(parcelas, [c], c.id, alvo.getFullYear(), alvo.getMonth());
      if (naFatura.length !== 1) checar(`fechamento ${cd}, compra ${compra}, fatura +${k}: exatamente uma parcela`, naFatura.length, 1);
    }
  }
}
checar('parcelas de fechamento 29-31 conferidas', true, true);

/* ---------- 3. Pai ausente: incerto, e a fatura se declara incompleta ---------- */
{
  const c = cartao('c30', 30);
  const parcelas = parcelar(c.id, '2026-01-30', 3);
  const soFilhas = parcelas.slice(1); // a compra original ficou em mês não carregado
  const r = cicloDoLancamento(soFilhas[0], c, new Map());
  checar('parcela sem pai em cartão 30 fica incerta', r.incerto, true);
  checar('comprasOriginaisAusentes pede o pai', comprasOriginaisAusentes(soFilhas, [c]), [parcelas[0].id]);
  const ciclo = mesFaturaDoLancamento(soFilhas[0].occurred_on, 30);
  checar('fatura com parcela incerta é declarada incompleta',
    faturaTemParcelaIncerta(soFilhas, [c], c.id, ciclo.year, ciclo.month), true);
  const extras = new Map([[parcelas[0].id, '2026-01-30']]);
  checar('com a data buscada, deixa de ser incerta', cicloDoLancamento(soFilhas[0], c, extras).incerto, false);
  checar('com a data buscada, nada mais falta', comprasOriginaisAusentes(soFilhas, [c], extras), []);
  const certo = cicloDoLancamento(soFilhas[0], c, extras).ciclo;
  checar('com a data buscada, a fatura não fica incompleta',
    faturaTemParcelaIncerta(soFilhas, [c], c.id, certo.year, certo.month, extras), false);

  const c20 = cartao('c20', 20);
  const filhas20 = parcelar(c20.id, '2026-01-30', 3).slice(1);
  checar('cartão 20 não precisa do pai: nunca incerto', cicloDoLancamento(filhas20[0], c20, new Map()).incerto, false);
  checar('cartão 20 não pede compra original', comprasOriginaisAusentes(filhas20, [c20]), []);
}

/* ---------- 4. Meses a buscar ---------- */
checar('cartões 1-28: mês do fechamento e o anterior',
  mesesCivisDasFaturas([{ year: 2026, month: 0 }], [cartao('a', 20)]),
  [{ year: 2025, month: 11 }, { year: 2026, month: 0 }]);
checar('com cartão 29-31: um mês de folga de cada lado',
  mesesCivisDasFaturas([{ year: 2026, month: 0 }], [cartao('a', 20), cartao('b', 31)]).length, 4);
checar('ciclos repetidos não repetem mês',
  mesesCivisDasFaturas([{ year: 2026, month: 5 }, { year: 2026, month: 5 }, { year: 2026, month: 6 }], [cartao('a', 10)]).length, 3);

/* ---------- 5. Entrada no cartão é ignorada (decisão A, 26/09/2026) ----------
   Decisão do autor: entrada no cartão, inclusive a linha ANTIGA que já está
   no banco, é ignorada em todo lugar (fatura, total, limite, lembretes). No
   Grana. não existe estorno; lançamento errado se exclui. Até esta noite a
   linha `in` abatia a fatura, e esta seção afirmava isso. Trava: a fatura com
   uma linha `in` antiga dá o MESMO total que sem ela. */
{
  const c = cartao('c6', 14);
  const compras = [
    lanc('c6', '2026-09-15', 130),
    lanc('c6', '2026-09-21', 0.1),
    lanc('c6', '2026-09-22', 0.2),
  ];
  const comEntradaAntiga = [...compras, lanc('c6', '2026-09-20', 30, { type: 'in' })];
  checar('valorNaFatura: entrada no cartão pesa zero', valorNaFatura(comEntradaAntiga[3]), 0);
  /* Lado do servidor (Harbor, 26/09/2026): o Granabô soma a fatura pelo valor,
     sem ramo de abate. */
  checar('Granabô sem regra de abate na fatura', 'valorNaFatura' in deno, false);
  const fatura = filtrarLancamentosDaFatura(comEntradaAntiga, [c], 'c6', 2026, 9);
  checar('entrada antiga não entra na lista da fatura', fatura.length, 3);
  checar('total com a entrada antiga = total sem ela, em centavos',
    somaDaFatura(fatura), somaDaFatura(filtrarLancamentosDaFatura(compras, [c], 'c6', 2026, 9)));
  checar('soma da fatura: 130 + 0,10 + 0,20', somaDaFatura(fatura), 130.3);
  checar('somaDaFatura direto na lista crua também ignora a entrada', somaDaFatura(comEntradaAntiga), 130.3);
  const [lembrete] = lembretesDeFatura(comEntradaAntiga, [c], [], '2026-09-23');
  checar('lembrete da fatura aberta ignora a entrada', lembrete.restante, 130.3);
  const pago = lembretesDeFatura(comEntradaAntiga, [c], [{
    id: 'p', user_id: 't', card_id: 'c6', year: 2026, month: 9, amount: 130.3, paid_on: '2026-09-23',
    wallet_id: null, paid_transaction_id: null, created_at: '2026-09-23',
  }], '2026-09-23')[0];
  checar('pagar o total das compras quita a fatura', pago.restante, 0);
  const alerta = readFileSync(join(__dirname, '..', 'lib/creditLimitAlert.ts'), 'utf8');
  const consultaDoLimite = alerta.slice(alerta.indexOf(".eq('payment_method', 'credit')"), alerta.indexOf('if (erroTx'));
  checar('alerta de limite só soma saída no cartão', consultaDoLimite.includes(".eq('type', 'out')"), true);
  /* Uma entrada antiga com cara de parcela sem a compra original, em cartão
     de fechamento 30, deixaria o resumo "incerto" se fosse olhada. Ignorada,
     não pode. */
  const c30 = cartao('c30e', 30);
  const entradaParcela = lanc('c30e', '2026-09-05', 10, { type: 'in', id: 'in-2', parent_id: 'pai-sumido', installment_current: 2, installment_total: 3 });
  checar('entrada antiga não deixa o resumo incerto',
    resumoDeFaturas([entradaParcela], [c30], 2026, 8, '2026-09-10').incerto, false);
  checar('nem a fatura incompleta',
    faturaTemParcelaIncerta([entradaParcela], [c30], c30.id, 2026, 8), false);
}

/* ---------- 6. Tela de Crédito e resumo da Início somam pelo mesmo lugar ----------
   Um reduce de `+ Number(amount)` numa soma de fatura faz o estorno voltar a
   somar. As duas telas grandes não rodam em vm, então a guarda é no fonte. */
for (const arquivo of ['app/(app)/credito.tsx', 'components/CreditSummaryCard.tsx']) {
  const fonte = readFileSync(join(__dirname, '..', arquivo), 'utf8');
  checar(`${arquivo}: nenhuma soma de fatura sem sinal`, /\+\s*Number\(\w+\.amount\)/.test(fonte), false);
}
const creditoTela = readFileSync(join(__dirname, '..', 'app/(app)/credito.tsx'), 'utf8');
const resumoTela = readFileSync(join(__dirname, '..', 'components/CreditSummaryCard.tsx'), 'utf8');
const regra = readFileSync(join(__dirname, '..', 'lib/creditoFaturas.ts'), 'utf8');
checar('Crédito usa somaDaFatura', creditoTela.includes('somaDaFatura('), true);
checar('resumo usa a regra compartilhada', resumoTela.includes('resumoDeFaturas('), true);
checar('regra do resumo soma com sinal', /function resumoDeFaturas\([\s\S]*?somaDaFatura\(filtrarLancamentosDaFatura\(/.test(regra), true);
{
  const tela = readFileSync(join(__dirname, '..', 'app/(app)/credito.tsx'), 'utf8');
  checar('Crédito busca os meses pelas faturas', tela.includes('mesesCivisDasFaturas('), true);
  checar('Crédito busca a compra original das parcelas', tela.includes('fetchDatasDeCompra(ausentes)'), true);
  checar('Crédito avisa quando a fatura tem parcela incerta', tela.includes('{parcelaIncerta && ('), true);
}

console.log(`\n${total - falhas}/${total} checagens de parcelas e estorno passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
