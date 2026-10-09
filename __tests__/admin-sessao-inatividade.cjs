// Login do painel local: 12 h de inatividade e 12 h de teto absoluto (decisao do autor, 09/10/2026;
// antes 30 min e 1 h). Exercita o modulo real com Date.now falso.
const assert = require('node:assert');
const seg = require('../tools/admin-local/seguranca.cjs');
const real = Date.now;
let t = real();
Date.now = () => t;
const MIN = 60_000; const H = 60 * MIN;
const req = (id) => ({ headers: { cookie: `grana_admin=${id}` } });
const nova = () => seg.criarSessao({ etapa: 'ok', loginEm: t, atividadeEm: t });
// consulta automatica (humano=false) mantem o pareamento vivo sem renovar a inatividade
const ate = (alvo, id) => { while (t < alvo) { t += Math.min(alvo - t, 4 * H); const r = seg.sessaoDe(req(id), false); if (r.encerrada) return r; } return null; };
try {
  let id = nova(); const t0 = t;
  assert.strictEqual(seg.resumoDaSessao(seg.sessaoDe(req(id), false)).inatividadeSeg, 12 * 3600);
  assert.strictEqual(ate(t0 + 11 * H, id), null); assert.ok(seg.sessaoDe(req(id), false).s, 'aos 11 h ainda vale (antes caia aos 30 min)');
  t = t0 + 12 * H + MIN; // passou de 12 h sem gesto humano
  // com os dois prazos em 12 h o teto absoluto vence junto; o ramo 'inatividade' so aparece se os prazos divergirem
  assert.ok(['inatividade', 'sessao-expirada'].includes(seg.sessaoDe(req(id), false).encerrada), 'aos 12 h + 1 min a sessao morre');

  id = nova(); const t1 = t; // gesto humano renova a inatividade; o teto absoluto continua valendo
  t = t1 + 7 * H; assert.ok(seg.sessaoDe(req(id), true).s);
  t = t1 + 11 * H; assert.ok(seg.sessaoDe(req(id), true).s, 'renovado, 11 h depois do login ainda vale (antes caia em 1 h)');
  t = t1 + 12 * H + MIN; // passa de 12 h do login, mesmo com atividade
  assert.strictEqual(seg.sessaoDe(req(id), true).encerrada, 'sessao-expirada');
  console.log('admin-sessao-inatividade: ok');
} finally { Date.now = real; }
