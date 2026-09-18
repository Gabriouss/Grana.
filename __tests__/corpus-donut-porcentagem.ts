/*
 * O número do arco e o número da legenda dizem a mesma coisa.
 *
 * Achado V1 da varredura de 17/09/2026 (M1): na Início, o arco cinza do donut
 * mostrava 59% e o chip da legenda, para a MESMA fatia, dizia 58%.
 *
 * A causa não era o desenho: era porcentagem calculada duas vezes, em bases
 * diferentes. A Início arredondava a porcentagem ANTES de entregar ao
 * `PieChart` (58,4 → 58) e o componente, cujo contrato é receber valor e
 * calcular a fatia sozinho, recalculava sobre a soma dos já arredondados —
 * que não fecha 100. 58 de 99 volta 59.
 *
 * Este teste roda os módulos reais (`prepararFatias`, `percentualDaFatia`) e
 * prende as duas metades: o caminho antigo DIVERGIA (para o caso não virar
 * hipótese), e o caminho de hoje não pode divergir em nenhuma fatia. Fecha
 * com uma checagem estática de que a Início não volta a pré-arredondar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { percentualDaFatia, prepararFatias } from '../lib/chart-colors';
import type { PieSlice } from '../components/PieChart';

let total = 0;
let falhas = 0;
function conferir(nome: string, ok: boolean, visto?: unknown) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

/* Gastos de um mês qualquer, em reais. Escolhidos para cair em fração quebrada:
   somam R$ 1.000,00, e "Outros" fica com 58,4% — o caso do print da auditoria. */
const gastos: Array<[string, number]> = [
  ['Outros', 584],
  ['Alimentação', 213],
  ['Transporte', 121],
  ['Moradia', 82],
];
const somaGastos = gastos.reduce((s, [, v]) => s + v, 0);

const soma = (fatias: PieSlice[]) => fatias.reduce((s, f) => s + f.value, 0);
/* A mesma conta que o `PieChart` faz por dentro para escrever o rótulo do
   arco: fração da fatia sobre a soma do que ele recebeu. */
const rotuloDoArco = (fatia: PieSlice, fatias: PieSlice[]) =>
  Math.round((fatia.value / soma(fatias)) * 100);

/* ── 1. O caminho antigo divergia mesmo ─────────────────────────────────── */
{
  const fatias = prepararFatias(
    gastos.map(([name, valor]) => ({ name, color: '#000', value: Math.round((valor / somaGastos) * 100) }))
  );
  const divergentes = fatias.filter((f) => f.value !== rotuloDoArco(f, fatias));
  conferir(
    'o jeito antigo (porcentagem pré-arredondada) fazia legenda e arco divergirem',
    divergentes.length > 0,
    fatias.map((f) => ({ nome: f.name, legenda: f.value, arco: rotuloDoArco(f, fatias) }))
  );
  const outros = fatias.find((f) => f.name === 'Outros')!;
  conferir('era exatamente o 58 contra 59 do print', outros.value === 58 && rotuloDoArco(outros, fatias) === 59, {
    legenda: outros.value,
    arco: rotuloDoArco(outros, fatias),
  });
}

/* ── 2. O caminho de hoje não pode divergir ─────────────────────────────── */
{
  const fatias = prepararFatias(gastos.map(([name, valor]) => ({ name, color: '#000', value: valor })));
  const totalFatias = soma(fatias);
  for (const fatia of fatias) {
    conferir(
      `${fatia.name}: legenda e arco dizem o mesmo número`,
      percentualDaFatia(fatia.value, totalFatias) === rotuloDoArco(fatia, fatias),
      { legenda: percentualDaFatia(fatia.value, totalFatias), arco: rotuloDoArco(fatia, fatias) }
    );
  }
  conferir('sem gasto nenhum, a legenda escreve 0% em vez de dividir por zero', percentualDaFatia(0, 0) === 0);
}

/* ── 3. A Início não volta a pré-arredondar ─────────────────────────────── */
{
  const inicio = readFileSync(join(__dirname, '..', 'app', '(app)', 'index.tsx'), 'utf8');
  conferir(
    'a Início entrega valor em reais ao donut, não porcentagem',
    !/value:\s*totalOut\s*\?\s*Math\.round/.test(inicio)
  );
  conferir(
    'a legenda da Início usa percentualDaFatia',
    /percentualDaFatia\(seg\.value, totalPie\)/.test(inicio)
  );
}

console.log(`\n${total - falhas}/${total} checagens do donut passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
