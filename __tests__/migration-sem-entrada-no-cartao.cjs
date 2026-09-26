/* Lado do banco e do servidor de "entrada no cartão não existe" (decisão do
 * autor, 26/09/2026). O lado do app está em `sem-entrada-no-cartao.cjs`.
 *
 *   node __tests__/migration-sem-entrada-no-cartao.cjs
 *
 * A migration `20260926130000_transactions_sem_entrada_no_cartao.sql` foi
 * EXECUTADA num Postgres embutido fora do repositório
 * (E:\Grana-temporarios\credito-ciclo\pglite\teste-entrada-no-cartao.mjs,
 * 11/11): entrada com `card_id` ou `payment_method = 'credit'` é recusada
 * com 23514, compra no cartão e entrada comum continuam, e com dado inválido
 * já gravado a migration falha em vez de apagar. Aqui ficam as guardas de
 * texto, a igualdade com o `schema.sql` e a soma de fatura do servidor sem o
 * ramo de abate. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const semComentario = (s) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };

const CHECK = "check (type <> 'in' or (card_id is null and payment_method is distinct from 'credit'))";
const migration = semComentario(ler('supabase/migrations/20260926130000_transactions_sem_entrada_no_cartao.sql'));
ok(migration.includes('add constraint transactions_entrada_nunca_no_cartao'), 'migration cria a restrição com nome estável');
ok(migration.includes(CHECK), 'recusa entrada com cartão OU com método crédito');
ok(!/\bdelete\b|\bupdate\b|not valid/i.test(migration), 'não apaga, não altera dado e nasce validada');
ok(semComentario(ler('supabase/schema.sql')).includes(CHECK), 'schema.sql traz a mesma restrição');

/* Soma de fatura do servidor: sem ramo de abate, e só compras. */
const fatura = ler('supabase/functions/_shared/fatura-ciclo.ts');
ok(!/valorNaFatura|type === 'in'/.test(fatura), '_shared/fatura-ciclo.ts não tem mais regra para entrada no cartão');
const granabo = ler('supabase/functions/assistente-financeiro/index.ts');
ok(!/valorNaFatura/.test(granabo), 'Granabô soma a fatura pelo valor, sem ramo de abate');
const consultasDeCredito = granabo.match(/\.eq\('payment_method', 'credit'\)(\s*\.eq\('type', 'out'\))?/g) ?? [];
ok(consultasDeCredito.length >= 5, `acha as consultas de fatura (${consultasDeCredito.length})`);
ok(consultasDeCredito.every((c) => c.includes("eq('type', 'out')")),
  "toda consulta de crédito do Granabô filtra type = 'out': entrada no cartão gravada por build antiga é ignorada, nunca somada");
ok(!/estorn/i.test(ler('supabase/functions/_shared/caixa.ts')), '_shared/caixa.ts não fala mais de estorno');

console.log(`migration-sem-entrada-no-cartao: ${passou} checagens OK`);
