/* Ciclo de fatura do cartão de crédito — a parte pura de lib/faturaCiclo.ts.
 * Design: docs/superpowers/specs/2026-09-03-ciclo-fatura-cartao-design.md
 *
 * Roda: npx tsx __tests__/corpus-fatura-ciclo.ts
 */
import { mesFaturaDoLancamento, janelaFatura, dataVencimentoFatura, rotuloPeriodoFatura, type CicloFatura } from '../lib/faturaCiclo';

let falhas = 0;
let total = 0;
function checar<T>(rotulo: string, obtido: T, esperado: T) {
  total++;
  if (obtido !== esperado) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${obtido} (esperado ${esperado})`);
  }
}
function checarCiclo(rotulo: string, obtido: CicloFatura, esperado: CicloFatura) {
  total++;
  if (obtido.year !== esperado.year || obtido.month !== esperado.month) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = {${obtido.year},${obtido.month}} (esperado {${esperado.year},${esperado.month}})`);
  }
}
function checarISO(rotulo: string, obtido: Date, ano: number, mes0: number, dia: number) {
  total++;
  if (obtido.getFullYear() !== ano || obtido.getMonth() !== mes0 || obtido.getDate() !== dia) {
    falhas++;
    console.log(
      `FALHA  [${rotulo}] = ${obtido.getFullYear()}-${obtido.getMonth()}-${obtido.getDate()} ` +
        `(esperado ${ano}-${mes0}-${dia})`
    );
  }
}

/* ---------- mesFaturaDoLancamento — fechamento no meio do mês (dia 19, ex.: C6) ---------- */

checarCiclo('antes do fechamento (dia 5 < 19) fica no mesmo mês', mesFaturaDoLancamento('2026-09-05', 19), {
  year: 2026,
  month: 8, // setembro, 0-indexado
});
checarCiclo(
  'NO dia do fechamento (dia 19 == 19) já entra na próxima fatura — regra de corte',
  mesFaturaDoLancamento('2026-09-19', 19),
  { year: 2026, month: 9 } // outubro
);
checarCiclo('depois do fechamento (dia 25 > 19) entra na próxima fatura', mesFaturaDoLancamento('2026-09-25', 19), {
  year: 2026,
  month: 9, // outubro
});

/* ---------- fechamento no dia 1 — todo lançamento do mês cai na fatura seguinte ---------- */

checarCiclo('fechamento dia 1: compra no dia 1 já é a próxima fatura', mesFaturaDoLancamento('2026-06-01', 1), {
  year: 2026,
  month: 6, // julho
});
checarCiclo('fechamento dia 1: compra no fim do mês também é a próxima fatura', mesFaturaDoLancamento('2026-06-30', 1), {
  year: 2026,
  month: 6, // julho
});

/* ---------- fechamento no dia 31, mês com menos dias (abril tem 30) ----------
   Desde 23/09/2026 o fechamento 31 cai no ÚLTIMO dia do mês curto, como nos
   bancos. Antes, abril "não fechava" e a janela transbordava para maio. */

checarCiclo(
  'fechamento dia 31: abril fecha dia 30, e a compra do dia 30 já é da fatura de maio',
  mesFaturaDoLancamento('2026-04-30', 31),
  { year: 2026, month: 4 } // maio
);
checarCiclo(
  'fechamento dia 31: compra dia 29 de abril fica em abril',
  mesFaturaDoLancamento('2026-04-29', 31),
  { year: 2026, month: 3 } // abril
);
checarCiclo(
  'fechamento dia 30: fevereiro fecha dia 28, e a compra do dia 28 vai para março',
  mesFaturaDoLancamento('2027-02-28', 30),
  { year: 2027, month: 2 }
);
checarCiclo(
  'fechamento dia 29: fevereiro bissexto fecha dia 29, a compra do dia 28 fica em fevereiro',
  mesFaturaDoLancamento('2028-02-28', 29),
  { year: 2028, month: 1 }
);
checarCiclo(
  'fechamento dia 31: compra dia 1 de maio (< 31) fica em maio',
  mesFaturaDoLancamento('2026-05-01', 31),
  { year: 2026, month: 4 } // maio
);

/* ---------- virada de ano (dezembro fecha em janeiro do ano seguinte) ---------- */

checarCiclo(
  'fechamento dia 19: compra 20/dez entra na fatura que fecha em janeiro do ano seguinte',
  mesFaturaDoLancamento('2026-12-20', 19),
  { year: 2027, month: 0 } // janeiro/2027
);

/* ---------- janelaFatura ---------- */

{
  const j = janelaFatura(2026, 9, 19); // fatura que fecha em outubro/2026
  checar('janela: início é 19/set (mês anterior ao fechamento)', j.inicio, '2026-09-19');
  checar('janela: fim é 19/out (dia do fechamento, exclusivo)', j.fim, '2026-10-19');
}
checar('rótulo mostra o intervalo real, não o mês civil', rotuloPeriodoFatura(2026, 8, 20), '20 ago a 19 set');
checar('rótulo explicita o ano quando o ciclo o atravessa', rotuloPeriodoFatura(2027, 0, 20), '20 dez 2026 a 19 jan 2027');
{
  // Fechamento dia 31 com mês anterior de 30 dias (abril): abril fecha no
  // dia 30, então a fatura de maio começa em 30/04.
  const j = janelaFatura(2026, 4, 31); // fatura que fecha em maio/2026 (mês0=4)
  checar('janela: início é o último dia de abril quando abril não tem dia 31', j.inicio, '2026-04-30');
  const fev = janelaFatura(2027, 1, 31);
  checar('janela fev/2027 fecha 31: início 31/jan', fev.inicio, '2027-01-31');
  checar('janela fev/2027 fecha 31: fim no fechamento de 28/fev', fev.fim, '2027-02-28');
  checar('rótulo fev/2027 fecha 31 não transborda para março', rotuloPeriodoFatura(2027, 1, 31), '31 jan a 27 fev');
  checar('rótulo fev/2028 (bissexto) fecha 31', rotuloPeriodoFatura(2028, 1, 31), '31 jan a 28 fev');
  checar('rótulo de virada de ano', rotuloPeriodoFatura(2027, 0, 20), '20 dez 2026 a 19 jan 2027');
  checar('janela: fim é 31/mai', j.fim, '2026-05-31');
}

/* ---------- dataVencimentoFatura ---------- */

checarISO(
  'vencimento no mesmo mês do fechamento (due_day 25 >= closing_day 19)',
  dataVencimentoFatura(2026, 8, 25, 19), // fatura fecha setembro/2026 (mês0=8)
  2026,
  8,
  25
);
checarISO(
  'vencimento e fechamento em meses civis diferentes (due_day 5 < closing_day 28)',
  dataVencimentoFatura(2026, 8, 5, 28), // fatura fecha setembro/2026, vence em outubro
  2026,
  9,
  5
);
checarISO(
  'vencimento vira o ano quando a fatura fecha em dezembro e vence em janeiro',
  dataVencimentoFatura(2026, 11, 5, 28), // fatura fecha dezembro/2026, vence em janeiro/2027
  2027,
  0,
  5
);

console.log(`\n${total - falhas}/${total} checagens do ciclo de fatura passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
