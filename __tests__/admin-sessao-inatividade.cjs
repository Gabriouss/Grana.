// Inatividade do login do painel local: 30 min (decisao do autor, 09/10/2026), absoluto 1 h.
// Exercita o modulo real com Date.now falso.
const assert = require('node:assert');
const seg = require('../tools/admin-local/seguranca.cjs');
const real = Date.now;
let t = real();
Date.now = () => t;
const MIN = 60_000;
const req = (id) => ({ headers: { cookie: `grana_admin=${id}` } });
const nova = () => seg.criarSessao({ etapa: 'ok', loginEm: t, atividadeEm: t });
try {
  let id = nova();
  assert.strictEqual(seg.resumoDaSessao(seg.sessaoDe(req(id), false)).inatividadeSeg, 1800);
  t += 29 * MIN;
  assert.ok(seg.sessaoDe(req(id), false).s, 'aos 29 min ainda vale');
  t += 2 * MIN; // 31 min sem gesto humano
  assert.strictEqual(seg.sessaoDe(req(id), false).encerrada, 'inatividade');

  id = nova();
  t += 25 * MIN; assert.ok(seg.sessaoDe(req(id), true).s); // gesto renova
  t += 25 * MIN; assert.ok(seg.sessaoDe(req(id), true).s, 'renovado, 50 min depois do login ainda vale');
  t += 20 * MIN; // passa de 1 h do login, mesmo com atividade
  assert.strictEqual(seg.sessaoDe(req(id), true).encerrada, 'sessao-expirada');
  console.log('admin-sessao-inatividade: ok');
} finally { Date.now = real; }
