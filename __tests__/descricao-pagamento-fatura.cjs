/*
 * Descrição do pagamento de fatura sem travessão e com "da" (achado T23 do
 * Sentinel, 25/09/2026).
 *
 *   node __tests__/descricao-pagamento-fatura.cjs
 *
 * Gravava "Pagamento fatura — C6 (09/2026)" e "... — restante". A regra de
 * copy do projeto proíbe travessão. Texto combinado com o maestro:
 * "Pagamento da fatura C6 (09/2026)" e "Pagamento da fatura C6 (09/2026),
 * restante". Aqui fica o lado do app (`app/(app)/credito.tsx`, que monta a
 * descrição no modo de exemplo); o servidor grava a sua na RPC.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'app/(app)/credito.tsx'), 'utf8');
const descricoes = [...fonte.matchAll(/description: `(Pagamento[^`]*)`/g)].map((m) => m[1]);

assert.equal(descricoes.length, 2, `esperava 2 descrições de pagamento, achei ${descricoes.length}`);
for (const d of descricoes) {
  assert.ok(!/[—–]/.test(d), `travessão na descrição do pagamento: ${d}`);
  assert.ok(d.startsWith('Pagamento da fatura ${selectedCard.name} ('), `formato fora do combinado: ${d}`);
}
assert.ok(descricoes.some((d) => d.endsWith('), restante')), 'falta a descrição do pagamento do restante');
console.log('descricao-pagamento-fatura: 2 descrições sem travessão, com "da" e ", restante"');
