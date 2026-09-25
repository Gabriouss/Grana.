/* Texto gravado no pagamento de fatura (T23, 25/09/2026).
 *
 *   node __tests__/texto-pagamento-fatura.cjs
 *
 * "Pagamento fatura — C6 (09/2026)" virou "Pagamento da fatura C6 (09/2026)",
 * e "... — restante" virou ", restante" (copy do Grana. sem travessão). A
 * migration 20260925010000 recria pagar_fatura_cartao e
 * pagar_restante_fatura_cartao COPIANDO o corpo das migrations de origem, que
 * são o que está em produção. Estas guardas garantem que só a string mudou.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const nova = ler('supabase/migrations/20260925010000_texto_pagamento_fatura.sql');
const schema = ler('supabase/schema.sql');
let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

const semComentario = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const corpo = (sql, nome) => {
  const i = sql.indexOf(`create or replace function public.${nome}(`);
  assert.ok(i >= 0, `${nome} não encontrada`);
  return sql.slice(i, sql.indexOf('\n$$;', i) + 4);
};
const diferencas = (a, b) => {
  const x = a.split('\n'), y = b.split('\n');
  assert.equal(x.length, y.length, 'mesmo número de linhas');
  return x.map((l, i) => (l === y[i] ? null : [l, y[i]])).filter(Boolean);
};

const FUNCOES = [
  ['pagar_fatura_cartao', 'supabase/migrations/20260923230100_pagar_fatura_valida_ciclo.sql', "'Pagamento da fatura %s (%s/%s)'"],
  ['pagar_restante_fatura_cartao', 'supabase/migrations/20260916200000_pagar_restante_fatura.sql', "'Pagamento da fatura %s (%s/%s), restante'"],
];
for (const [nome, origem, texto] of FUNCOES) {
  const novo = corpo(nova, nome);
  const antigo = corpo(ler(origem), nome);
  const d = diferencas(antigo, novo);
  ok(d.length === 1, `${nome}: difere da migration de origem (= produção) em UMA linha só`);
  ok(d[0][0].includes('Pagamento fatura —') && d[0][1].includes(texto), `${nome}: e essa linha é a do texto`);
  ok(corpo(schema, nome) === novo, `${nome}: schema.sql igual à migration`);
  ok(new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon;`).test(nova), `${nome}: revoga de public e anon`);
  ok(new RegExp(`grant execute on function public\\.${nome}\\([^)]*\\) to authenticated;`).test(nova), `${nome}: concede a authenticated`);
}
ok(!/—/.test(semComentario(nova)), 'nenhum travessão no código da migration');
ok(!/Pagamento fatura/.test(semComentario(nova)), 'texto antigo não sobrou na migration');
ok(!/'Pagamento fatura —/.test(schema), 'nem no schema.sql');
ok((nova.match(/\$\$/g) ?? []).length % 2 === 0, 'delimitadores $$ pareados');

console.log(`texto-pagamento-fatura: ${passou} checagens OK`);
