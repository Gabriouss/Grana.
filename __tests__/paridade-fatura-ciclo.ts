/* Paridade da aritmética de fatura entre o app e o Granabô.
 *
 * `lib/faturaCiclo.ts` (app) e `supabase/functions/_shared/fatura-ciclo.ts`
 * (Edge Function) são duas cópias da mesma regra, porque a função não importa
 * de fora de `supabase/functions/`. Se uma mudar sozinha, o Granabô passa a
 * responder com uma fatura e a tela a mostrar outra. Este teste roda os DOIS
 * módulos reais sobre todo fechamento de 1 a 31, todo dia de 2026 a 2028
 * (inclui 29/02/2028) e deslocamentos de -3 a +3.
 *
 * Também trava a invariante que faltava até 23/09/2026: toda data cai dentro
 * da janela da fatura a que ela pertence, e janelas vizinhas encostam sem
 * buraco nem sobreposição. Com fechamento 29-31 isso falhava em mês curto.
 *
 * Roda: npx tsx __tests__/paridade-fatura-ciclo.ts
 */
import * as app from '../lib/faturaCiclo';
import * as deno from '../supabase/functions/_shared/fatura-ciclo';
import * as creditoApp from '../lib/creditoFaturas';

let total = 0;
let falhas = 0;
const exemplos: string[] = [];
function checar(ok: boolean, rotulo: string) {
  total++;
  if (!ok) {
    falhas++;
    if (exemplos.length < 15) exemplos.push(rotulo);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const menosUmDia = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return iso(new Date(y, m - 1, d - 1));
};
const mesmo = (a: { year: number; month: number }, b: { year: number; month: number }) =>
  a.year === b.year && a.month === b.month;

const datas: string[] = [];
for (let d = new Date(2026, 0, 1); d.getFullYear() <= 2028; d.setDate(d.getDate() + 1)) datas.push(iso(d));

for (let cd = 1; cd <= 31; cd++) {
  for (const data of datas) {
    const ca = app.mesFaturaDoLancamento(data, cd);
    const cdn = deno.mesFaturaDoLancamento(data, cd);
    checar(mesmo(ca, cdn), `mesFatura ${data} fecha ${cd}: app ${ca.year}/${ca.month} deno ${cdn.year}/${cdn.month}`);

    const ja = app.janelaFatura(ca.year, ca.month, cd);
    checar(data >= ja.inicio && data < ja.fim, `${data} fora da propria janela (fecha ${cd}): ${ja.inicio}..${ja.fim}`);
  }
  for (let ano = 2026; ano <= 2028; ano++) {
    for (let mes = 0; mes < 12; mes++) {
      const ja = app.janelaFatura(ano, mes, cd);
      const jd = deno.janelaFatura(ano, mes, cd);
      checar(ja.inicio === jd.inicio && menosUmDia(ja.fim) === jd.fim,
        `janela ${ano}/${mes} fecha ${cd}: app ${ja.inicio}..${ja.fim} deno ${jd.inicio}..${jd.fim}`);
      const seguinte = app.janelaFatura(ano, mes + 1, cd);
      checar(ja.fim === seguinte.inicio, `janelas ${ano}/${mes} e seguinte nao encostam (fecha ${cd})`);
      checar(ja.inicio < ja.fim, `janela vazia ${ano}/${mes} fecha ${cd}`);
      for (let due = 1; due <= 31; due++) {
        const va = iso(app.dataVencimentoFatura(ano, mes, due, cd));
        const vd = iso(deno.dataVencimentoFatura(ano, mes, due, cd));
        checar(va === vd, `vencimento ${ano}/${mes} dia ${due} fecha ${cd}: app ${va} deno ${vd}`);
      }
    }
  }
}

for (const hoje of ['2026-01-05', '2026-02-28', '2026-09-23', '2026-12-31', '2028-02-29']) {
  for (let cd = 1; cd <= 31; cd++) {
    for (let k = -3; k <= 3; k++) {
      const ra = app.cicloRelativo(hoje, cd, k);
      const rd = deno.cicloRelativo(hoje, cd, k);
      checar(mesmo(ra, rd), `cicloRelativo ${hoje} fecha ${cd} k=${k}`);
      checar(app.deslocamentoEntre(app.cicloRelativo(hoje, cd, 0), ra) === k, `deslocamentoEntre inverso ${hoje} ${cd} ${k}`);
    }
  }
}

/* Parcela pelo ciclo da compra original: `cicloDoLancamento` (app) contra
   `cicloDaLinha` (Granabô), com e sem a data da compra, para todo
   fechamento 1-31 e compras de 2026, parcelas 1 a 13. */
{
  const addMonths = (s: string, k: number) => {
    const [y, m, d] = s.split('-').map(Number);
    const alvo = new Date(y, m - 1 + k, 1);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    return iso(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d, ultimo)));
  };
  for (let cd = 1; cd <= 31; cd++) {
    const cartao = { id: 'c', closing_day: cd } as never;
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d.setDate(d.getDate() + 3)) {
      const compra = iso(d);
      for (let k = 1; k <= 13; k++) {
        const linha = { id: 'p' + k, occurred_on: addMonths(compra, k - 1), installment_current: k, installment_total: 13, parent_id: k === 1 ? null : 'pai' };
        for (const datas of [new Map([['pai', compra]]), new Map<string, string>()]) {
          const a = creditoApp.cicloDoLancamento(linha as never, cartao, datas);
          const b = deno.cicloDaLinha(linha, cd, datas);
          checar(mesmo(a.ciclo, b.ciclo) && a.incerto === b.incerto,
            `parcela ${k} compra ${compra} fecha ${cd} (${datas.size ? 'com' : 'sem'} pai): app ${a.ciclo.year}/${a.ciclo.month}${a.incerto ? '?' : ''} deno ${b.ciclo.year}/${b.ciclo.month}${b.incerto ? '?' : ''}`);
        }
      }
    }
  }
}

for (const e of exemplos) console.log(`FALHA  ${e}`);
console.log(`\n${total - falhas}/${total} checagens de paridade app x Granabo passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
