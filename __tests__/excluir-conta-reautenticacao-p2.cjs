'use strict';
const assert = require('node:assert/strict');
const { runtime, pending, flush } = require('./helpers/auth-ui-runtime.cjs');
const file = 'components/ExcluirContaSheet.tsx';
function form(options = {}, valid = true) {
  const r = runtime(file, options); if (valid) r.field('Sua senha', 'SenhaFicticia19'); return r;
}
function freed(r) { r.render(); assert.equal(r.busy, false); assert.equal(r.submit().props.disabled, false); }
function untouched(r) {
  assert.equal(r.count('deleteUserAccount'), 0, 'zero exclusao quando identidade nao foi confirmada');
  assert.equal(r.count('signOut'), 0, 'zero saida em falha de reautenticacao');
  assert.equal(r.count('onClose'), 0); assert.equal(r.routes.length, 0); assert.equal(r.alerts.length, 0);
}
const cases = [];
const test = (name, body) => cases.push([name, body]);
for (const [label, value] of [['Error', Error('falha-sintetica')], ['null', null]]) {
  test(`reautenticacao rejeitada (${label}) nao apaga e libera UI`, async () => {
    const r = form({ reauthenticate: async () => { throw value; } });
    const outcome = await Promise.resolve(r.send()).then(() => ({ rejected: false }), () => ({ rejected: true }));
    untouched(r); assert.equal(r.count('reauthenticate'), 1);
    assert.equal(outcome.rejected, false, 'rejeicao deve ser capturada pelo componente'); freed(r);
    assert.ok(r.text.includes('falha-sintetica') || r.text.includes('Não foi possível excluir agora'));
    assert.equal(r.logs.length, 1); assert.equal(r.logs[0].length, 1, 'aviso fixo sem senha/erro bruto');
    assert.doesNotMatch(JSON.stringify(r.logs), /SenhaFicticia/);
  });
}
test('reautenticacao recusada por retorno preserva mensagem e zero efeitos destrutivos', async () => {
  const r = form({ reauthenticate: async () => ({ ok: false, error: 'Senha recusada de teste.' }) });
  await r.send(); untouched(r); freed(r); assert.match(r.text, /Senha recusada de teste/);
});
test('reautenticacao recusada sem texto preserva fallback', async () => {
  const r = form({ reauthenticate: async () => ({ ok: false }) });
  await r.send(); untouched(r); freed(r); assert.match(r.text, /confirmar sua identidade/);
});
test('senha vazia nao chama sequer reautenticacao', async () => {
  const r = form({}, false); await r.send(); untouched(r); freed(r);
  assert.equal(r.count('reauthenticate'), 0); assert.match(r.text, /Digite sua senha/);
});
test('reautenticacao pendente e depois rejeitada nunca inicia exclusao', async () => {
  const d = pending(); const r = form({ reauthenticate: () => d.promise });
  const outcome = Promise.resolve(r.send()).then(() => null, e => e);
  await flush(); r.render(); assert.equal(r.busy, true); untouched(r);
  d.reject(Error('falha-sintetica')); const error = await outcome;
  untouched(r); assert.equal(error, null, 'falha tardia deve ser capturada'); freed(r);
});
test('nova tentativa explicita depois da rejeicao so apaga apos identidade confirmada', async () => {
  let attempt = 0;
  const r = form({ reauthenticate: async () => { if (++attempt === 1) throw Error('falha-sintetica'); return { ok: true }; } });
  const outcome = await Promise.resolve(r.send()).then(() => null, e => e);
  untouched(r); assert.equal(outcome, null); freed(r);
  await r.send(); freed(r);
  assert.equal(r.count('reauthenticate'), 2); assert.equal(r.count('deleteUserAccount'), 1); assert.equal(r.count('signOut'), 1);
  assert.deepEqual(r.calls.map(c => c.name), ['reauthenticate', 'reauthenticate', 'deleteUserAccount', 'signOut']);
  assert.deepEqual(r.routes, ['/sign-in']);
});
test('sucesso completo preserva ordem e redirecionamento', async () => {
  const r = form(); await r.send(); freed(r);
  assert.deepEqual(r.calls.map(c => c.name), ['reauthenticate', 'deleteUserAccount', 'signOut']);
  assert.deepEqual(r.routes, ['/sign-in']); assert.equal(r.alerts.length, 0);
});
test('sucesso parcial preserva alerta antes de redirecionar', async () => {
  const r = form({ deleteUserAccount: async () => ({ completo: false }) });
  await r.send(); freed(r); assert.equal(r.count('deleteUserAccount'), 1); assert.equal(r.count('signOut'), 1);
  assert.equal(r.alerts.length, 1); assert.equal(r.alerts[0][0], 'Dados apagados'); assert.equal(r.routes.length, 0);
  r.alerts[0][2][0].onPress(); assert.deepEqual(r.routes, ['/sign-in']);
});
test('falha de exclusao mantem recibo, libera e nao sai', async () => {
  const r = form({ deleteUserAccount: async () => { throw Error('falha-exclusao-sintetica'); } });
  await r.send(); freed(r); assert.equal(r.count('reauthenticate'), 1); assert.equal(r.count('deleteUserAccount'), 1);
  assert.equal(r.count('signOut'), 0); assert.equal(r.routes.length, 0); assert.match(r.text, /falha-exclusao-sintetica/);
});
test('falha na saida apos exclusao mantem erro visivel e nao redireciona', async () => {
  const r = form({ signOut: async () => { throw Error('falha-saida-sintetica'); } });
  await r.send(); freed(r); assert.equal(r.count('deleteUserAccount'), 1); assert.equal(r.count('signOut'), 1);
  assert.equal(r.routes.length, 0); assert.match(r.text, /falha-saida-sintetica/);
});
(async () => {
  let failed = 0;
  for (const [name, body] of cases) { try { await body(); console.log('OK', name); } catch (e) { failed++; console.log('FAIL', name, e.message); } }
  console.log(JSON.stringify({ suite: 'excluir-conta-reautenticacao-p2', total: cases.length, passed: cases.length - failed, failed, base: process.env.AUTH_UI_BASE ?? 'working-tree' }));
  process.exitCode = failed ? 1 : 0;
})();
