// Capa de reel no catalogo: <video>-capa.png na mesma pasta. Modulo real, repositorio temporario.
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-capa-'));
const sem = path.join(raiz, 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27');
const grava = (estado, nome, conteudo) => { const f = path.join(sem, estado, 'pecas/reels', nome); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, conteudo); };
try {
  grava('aprovados', 'com-capa.mp4', 'v1'); grava('aprovados', 'com-capa-capa.png', 'c1');   // capa aprovada
  grava('para-aprovacao', 'capa-nova.mp4', 'v2'); grava('para-aprovacao', 'capa-nova-capa.png', 'c2'); // capa ainda sem aceite
  grava('aprovados', 'sem-capa.mp4', 'v3');
  grava('aprovados', 'orfa-capa.png', 'c4');                                                    // capa sem video
  const pecas = cat.listarPecas(raiz).pecas;
  const ap = path.join(raiz, 'docs/marketing/painel/aprovacoes.json');
  const por = (nome) => pecas.find((p) => p.nome.endsWith(nome));
  const v = por('com-capa.mp4'); const c = por('com-capa-capa.png');
  assert.ok(v.capa && v.capa.url.endsWith('com-capa-capa.png') && v.capa.pecaId === c.id);
  assert.strictEqual(v.capa.aprovada, false, 'capa na pasta aprovados sem aceite proprio nao herda a aprovacao do video');
  assert.strictEqual(c.aprovada, false); assert.strictEqual(c.estadoEfetivo, 'aguardando-aceite');
  assert.ok(!cat.feed(raiz).pecas.some((p) => p.id === c.id), 'capa nao e publicacao propria');
  assert.strictEqual(c.capaDe, v.id, 'a capa aponta para o video e continua peca (o autor precisa aceita-la)');
  fs.mkdirSync(path.dirname(ap), { recursive: true });
  fs.writeFileSync(ap, JSON.stringify({ aprovacoes: [{ id: c.id, versao: c.versao, aprovadoEm: '2026-10-09T12:00:00-03:00', evidencia: 'teste' }], ajustes: [] }));
  const v2 = cat.listarPecas(raiz).pecas.find((p) => p.id === v.id);
  assert.strictEqual(v2.capa.aprovada, true, 'com aceite proprio da versao da capa, passa a aprovada');
  fs.rmSync(ap);
  const n = por('capa-nova.mp4');
  assert.ok(n.capa && n.capa.aprovada === false, 'capa sem aceite aparece como nao aprovada');
  assert.strictEqual(por('sem-capa.mp4').capa, null);
  const o = por('orfa-capa.png');
  assert.strictEqual(o.capaDe, null); assert.strictEqual(o.capaOrfa, true);
  const feed = cat.feed(raiz).pecas.map((p) => p.nome.split('/').pop());
  assert.ok(feed.includes('com-capa.mp4') && !feed.includes('com-capa-capa.png'), 'capa pareada nao vira post solto no feed');
  assert.ok(feed.includes('orfa-capa.png'), 'capa orfa continua visivel (nada some em silencio)');
  console.log('admin-catalogo-capa: ok');
} finally { fs.rmSync(raiz, { recursive: true, force: true }); }
