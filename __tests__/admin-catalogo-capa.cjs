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
  const PAINEL = 'aceite pelo autor no painel local'; // validador único (W-C1): só evidência de autor conta
  fs.writeFileSync(ap, JSON.stringify({ aprovacoes: [{ id: c.id, caminho: c.caminho, versao: c.versao, aprovadoEm: '2026-10-09T12:00:00-03:00', evidencia: PAINEL }], ajustes: [] }));
  const v2 = cat.listarPecas(raiz).pecas.find((p) => p.id === v.id);
  assert.strictEqual(v2.capa.aprovada, true, 'com aceite proprio da versao da capa, passa a aprovada');
  // Aceite composto (14/10): so a capa aceita nao basta; o Reel precisa do aceite da versao composta.
  assert.strictEqual(v2.aprovada, false, 'Reel em aprovados sem aceite composto nao conta como aprovado');
  assert.ok(!cat.feed(raiz).pecas.some((p) => p.id === v.id), 'sem aceite composto, o Reel fica fora do feed');
  fs.writeFileSync(ap, JSON.stringify({ aprovacoes: [{ id: c.id, caminho: c.caminho, versao: c.versao, aprovadoEm: '2026-10-09T12:00:00-03:00', evidencia: PAINEL },
    { id: v.id, caminho: v.caminho, versao: v2.versao, aprovadoEm: '2026-10-09T12:01:00-03:00', evidencia: PAINEL }], ajustes: [] }));
  const feedComCapa = cat.feed(raiz).pecas.map((p) => p.nome.split('/').pop());
  assert.ok(feedComCapa.includes('com-capa.mp4') && !feedComCapa.includes('com-capa-capa.png'), 'Reel com aceite composto entra no feed; a capa nao vira post solto');
  fs.rmSync(ap);
  // Aceite composto (14/10): Reel em aprovados com capa sem aceite nao vai ao feed.
  assert.strictEqual(cat.listarPecas(raiz).pecas.find((p) => p.id === v.id).aprovada, false, 'Reel sem a capa aceita nao conta como aprovado');
  const n = por('capa-nova.mp4');
  assert.ok(n.capa && n.capa.aprovada === false, 'capa sem aceite aparece como nao aprovada');
  assert.strictEqual(por('sem-capa.mp4').capa, null);
  const o = por('orfa-capa.png');
  assert.strictEqual(o.capaDe, null); assert.strictEqual(o.capaOrfa, true);
  const feed = cat.feed(raiz).pecas.map((p) => p.nome.split('/').pop());
  assert.ok(!feed.includes('com-capa.mp4') && !feed.includes('com-capa-capa.png'), 'sem aceite da capa, nem o Reel nem a capa entram no feed');
  assert.ok(feed.includes('orfa-capa.png'), 'capa orfa continua visivel (nada some em silencio)');
  console.log('admin-catalogo-capa: ok');
} finally { fs.rmSync(raiz, { recursive: true, force: true }); }
