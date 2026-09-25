/* Paridade da regra 20: o "saldo" e o "livre para gastar" do Granabô são os
 * mesmos números da Início e dos widgets.
 *
 *   node __tests__/paridade-livre-para-gastar.cjs
 *
 * `lib/safe-to-spend.ts` (app) e `supabase/functions/_shared/caixa.ts`
 * (Granabô, porque o Deno não importa de `lib/`) são duas cópias da mesma
 * regra. A lição do A12 é que o defeito não era o cálculo, era haver dois:
 * este teste roda os DOIS módulos reais sobre milhares de históricos gerados e
 * exige os cinco campos iguais. Datas de outros meses, compra e estorno no
 * cartão, cartão com `payment_method` nulo, crédito sem cartão, cofrinhos,
 * saldo negativo, fim de fevereiro e virada de ano.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const cache = new Map();
function carregar(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo).exports;
  const m = new Module(arquivo, module);
  cache.set(arquivo, m);
  m.require = (id) => {
    if (id.startsWith('.')) return carregar(path.resolve(path.dirname(arquivo), id.endsWith('.ts') ? id : `${id}.ts`));
    throw new Error(`Import não simulado em ${arquivo}: ${id}`);
  };
  m._compile(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, arquivo);
  return m.exports;
}
const app = carregar(path.join(root, 'lib/safe-to-spend.ts'));
const servidor = carregar(path.join(root, 'supabase/functions/_shared/caixa.ts'));

let passou = 0;
const CAMPOS = ['saldoAtual', 'reservadoEmMetas', 'diasRestantes', 'livreTotal', 'livrePorDia'];
function comparar(transacoes, metas, hojeISO, rotulo) {
  const [a, m, d] = hojeISO.split('-').map(Number);
  const doApp = app.calcularSafeToSpend(transacoes, metas, new Date(a, m - 1, d, 12));
  const doServidor = servidor.calcularLivreParaGastar(transacoes, metas, hojeISO);
  for (const campo of CAMPOS) {
    assert.ok(Math.abs(doApp[campo] - doServidor[campo]) < 1e-9,
      `${rotulo}: ${campo} app=${doApp[campo]} servidor=${doServidor[campo]} (hoje ${hojeISO})`);
  }
  assert.deepEqual(Object.keys(doServidor).sort(), Object.keys(doApp).sort(), `${rotulo}: mesmos campos`);
  passou++;
  return doApp;
}

/* ── Caso de referência do autor (setembro/2026) ───────────────────────── */
const tx = (type, amount, occurred_on, extra = {}) => ({ type, amount, occurred_on, payment_method: null, card_id: null, ...extra });
const ref = comparar([
  tx('in', 9000, '2026-08-10'), tx('in', 2948, '2026-09-05'), tx('out', 2805.33, '2026-09-10'),
  tx('out', 500, '2026-09-12', { payment_method: 'credit', card_id: 'c6' }),
], [], '2026-09-24', 'referência do autor');
assert.ok(Math.abs(ref.saldoAtual - 142.67) < 1e-9 && ref.diasRestantes === 7 && ref.livrePorDia.toFixed(2) === '20.38');
passou++;

/* ── Históricos gerados ─────────────────────────────────────────────────── */
let semente = 20260925;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const dataISO = (ms) => new Date(ms).toISOString().slice(0, 10);
const DIAS = ['2026-01-01', '2026-01-31', '2026-02-28', '2028-02-29', '2026-09-24', '2026-09-30', '2026-12-31', '2027-01-01'];
for (let i = 0; i < 3000; i++) {
  const hojeISO = i < DIAS.length * 20 ? DIAS[i % DIAS.length] : dataISO(Date.UTC(2026, 0, 1) + Math.floor(aleatorio() * 800) * 86400000);
  const base = Date.parse(`${hojeISO}T12:00:00Z`);
  const n = Math.floor(aleatorio() * 15);
  const transacoes = [];
  for (let k = 0; k < n; k++) {
    const sorte = aleatorio();
    transacoes.push({
      type: aleatorio() < 0.4 ? 'in' : 'out',
      amount: Math.round(aleatorio() * 300000) / 100,
      occurred_on: dataISO(base + Math.floor((aleatorio() - 0.6) * 70) * 86400000),
      payment_method: sorte < 0.15 ? 'credit' : sorte < 0.3 ? null : sorte < 0.6 ? 'pix' : 'debit',
      card_id: sorte < 0.1 || (sorte >= 0.15 && sorte < 0.2) ? 'c6' : null,
    });
  }
  const metas = Array.from({ length: Math.floor(aleatorio() * 3) }, () => ({ current_amount: Math.round(aleatorio() * 50000) / 100 }));
  comparar(transacoes, metas, hojeISO, `gerado #${i}`);
}

console.log(`paridade-livre-para-gastar: ${passou} checagens OK (app x Granabô)`);
