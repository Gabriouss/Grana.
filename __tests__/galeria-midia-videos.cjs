'use strict';
// Galeria local (scripts/galeria-midia.mjs): vídeos no scanner, MIME e Range, e <video> no card
// e no lightbox. O módulo real roda num sandbox: o servidor nunca escuta (http é dublê), a ponte
// `maestri ask` nunca roda (exec é dublê) e nenhuma escrita em disco é permitida. A fixture fica
// numa pasta temporária (GRANA_TEMP, ou a do sistema) e é apagada no fim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Writable } = require('node:stream');
const ts = require('typescript');

const raiz = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'galeria-midia-'));
const mk = path.join(raiz, 'docs/marketing');
for (const d of ['.lixeira', 'solicitacoes-correcao', 'semana/para-aprovacao/pecas/reels', 'semana/aprovados/pecas']) fs.mkdirSync(path.join(mk, d), { recursive: true });
const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
const arquivos = {
  'semana/para-aprovacao/pecas/reels/reel-audit.mp4': bytes,
  'semana/para-aprovacao/pecas/reels/reel-audit.webm': bytes.subarray(0, 300),
  'semana/para-aprovacao/pecas/reels/reel-audit.mov': bytes.subarray(0, 200),
  'semana/para-aprovacao/pecas/reels/slide-1.mp4': bytes.subarray(0, 50),
  'semana/aprovados/pecas/card-audit.png': Buffer.from('png'),
  'semana/aprovados/pecas/carrossel-1.png': Buffer.from('p1'),
  'semana/aprovados/pecas/carrossel-2.png': Buffer.from('p2'),
  'semana/aprovados/pecas/notas.txt': Buffer.from('texto'),
};
for (const [rel, b] of Object.entries(arquivos)) fs.writeFileSync(path.join(mk, rel), b);

let handler = null;
let escutou = 0;
let execs = 0;
const escritas = [];
const proibido = (nome) => (...a) => { escritas.push([nome, a[0]]); throw new Error(`escrita proibida: ${nome}`); };
const fsSandbox = { ...fs, mkdirSync: proibido('mkdirSync'), renameSync: proibido('renameSync'), writeFileSync: proibido('writeFileSync'),
  rmSync: proibido('rmSync'), unlinkSync: proibido('unlinkSync'), appendFileSync: proibido('appendFileSync') };
const pathSandbox = { ...path, resolve: (...a) => path.resolve(raiz, ...a) };
const dependencias = {
  'node:http': { createServer: (fn) => { handler = fn; return { listen: () => { escutou++; } }; } },
  'node:fs': fsSandbox,
  'node:path': pathSandbox,
  'node:child_process': { exec: () => { execs++; } },
};
const fonte = fs.readFileSync(path.join(__dirname, '../scripts/galeria-midia.mjs'), 'utf8');
const js = ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  + '\n;globalThis.__galeria = { listarImagensBrutas, agruparMidias, servirArquivo, MIME, BASE_DIR };';
const sandbox = { exports: {}, console: { log() {} }, URL, Buffer,
  require: (id) => { if (id in dependencias) return dependencias[id]; throw new Error(`Import não simulado: ${id}`); } };
vm.runInNewContext(js, sandbox, { filename: 'galeria-midia.mjs' });
const g = sandbox.__galeria;

class Resposta extends Writable {
  constructor() { super(); this.status = null; this.cabecalhos = {}; this.partes = []; }
  writeHead(status, cab = {}) { this.status = status; this.cabecalhos = cab; return this; }
  _write(c, _e, cb) { this.partes.push(Buffer.from(c)); cb(); }
  get corpo() { return Buffer.concat(this.partes); }
}
const pedir = (url, { metodo = 'GET', range } = {}) => new Promise((resolve) => {
  const res = new Resposta();
  const fimOriginal = res.end.bind(res);
  res.end = (...a) => { const r = fimOriginal(...a); return r; };
  res.on('finish', () => resolve(res));
  handler({ url, method: metodo, headers: range ? { range } : {} }, res);
});

(async () => {
  try {
    assert.equal(g.BASE_DIR, mk, 'a raiz aponta para a fixture');
    assert.equal(escutou, 1, 'listen é dublê: nenhum servidor real');

    // Scanner: vídeos entram, texto não, e vídeo nunca vira página de carrossel.
    const brutas = g.listarImagensBrutas(mk);
    const porNome = Object.fromEntries(brutas.map((b) => [b.nome, b]));
    for (const n of ['reel-audit.mp4', 'reel-audit.webm', 'reel-audit.mov', 'slide-1.mp4']) assert.equal(porNome[n]?.midia, 'video', n);
    assert.equal(porNome['card-audit.png'].midia, 'imagem');
    assert.equal(porNome['notas.txt'], undefined);
    const grupos = g.agruparMidias(brutas);
    const carrossel = grupos.filter((x) => x.tipo === 'carrossel');
    assert.equal(carrossel.length, 1);
    assert.equal(JSON.stringify(carrossel[0].paginas.map((p) => p.nome)), JSON.stringify(['carrossel-1.png', 'carrossel-2.png']));
    assert.equal(grupos.find((x) => x.nome === 'slide-1.mp4')?.tipo, 'unico', 'vídeo com nome de slide não vira carrossel');
    assert.equal(grupos.find((x) => x.nome === 'reel-audit.mp4')?.midia, 'video');

    // MIME.
    assert.equal(g.MIME['.mp4'], 'video/mp4');
    assert.equal(g.MIME['.webm'], 'video/webm');
    assert.equal(g.MIME['.mov'], 'video/quicktime');
    assert.equal(g.MIME['.png'], 'image/png');

    // /api/imagens pelo handler real.
    const lista = await pedir('/api/imagens');
    assert.equal(lista.status, 200);
    assert.ok(JSON.parse(lista.corpo.toString()).some((x) => x.midia === 'video' && x.nome === 'reel-audit.mp4'));

    // /midia: inteiro, faixa, sufixo, fora do fim, HEAD, diretório e travessia.
    const base = '/midia/' + encodeURIComponent('semana/para-aprovacao/pecas/reels/reel-audit.mp4');
    const inteiro = await pedir(base);
    assert.equal(inteiro.status, 200);
    assert.equal(inteiro.cabecalhos['Content-Type'], 'video/mp4');
    assert.equal(inteiro.cabecalhos['Accept-Ranges'], 'bytes');
    assert.equal(inteiro.cabecalhos['Content-Length'], 1000);
    assert.ok(inteiro.corpo.equals(bytes));
    const faixa = await pedir(base, { range: 'bytes=100-199' });
    assert.equal(faixa.status, 206);
    assert.equal(faixa.cabecalhos['Content-Range'], 'bytes 100-199/1000');
    assert.equal(faixa.cabecalhos['Content-Length'], 100);
    assert.ok(faixa.corpo.equals(bytes.subarray(100, 200)));
    const aberta = await pedir(base, { range: 'bytes=990-' });
    assert.equal(aberta.cabecalhos['Content-Range'], 'bytes 990-999/1000');
    assert.ok(aberta.corpo.equals(bytes.subarray(990)));
    const sufixo = await pedir(base, { range: 'bytes=-10' });
    assert.equal(sufixo.status, 206);
    assert.ok(sufixo.corpo.equals(bytes.subarray(990)));
    const alem = await pedir(base, { range: 'bytes=5000-' });
    assert.equal(alem.status, 416);
    assert.equal(alem.cabecalhos['Content-Range'], 'bytes */1000');
    assert.equal((await pedir(base, { range: 'lixo' })).status, 416);
    const cabeca = await pedir(base, { metodo: 'HEAD', range: 'bytes=0-9' });
    assert.equal(cabeca.status, 206);
    assert.equal(cabeca.corpo.length, 0, 'HEAD sem corpo');
    const mov = await pedir('/midia/' + encodeURIComponent('semana/para-aprovacao/pecas/reels/reel-audit.mov'));
    assert.equal(mov.cabecalhos['Content-Type'], 'video/quicktime');
    assert.equal((await pedir('/midia/' + encodeURIComponent('semana/aprovados/pecas'))).status, 404, 'diretório não é servido');
    assert.equal((await pedir('/midia/' + encodeURIComponent('../../fora.txt'))).status, 404, 'travessia barrada');

    // HTML: <video> no card e no lightbox, com o regex do cliente intacto.
    const html = (await pedir('/')).corpo.toString();
    assert.ok(html.includes('<video class="lightbox-img" id="lightboxVideo" controls playsinline preload="metadata" hidden></video>'));
    assert.ok(html.includes("item.midia === 'video'") && html.includes('controls playsinline preload="metadata" onclick="event.stopPropagation()"'));
    assert.ok(html.includes('/\\.(mp4|webm|mov)$/i'), 'regex do cliente chega com a barra');
    assert.ok(html.includes('pararVideoDoLightbox();'), 'fechar o lightbox para o vídeo');
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
    assert.doesNotThrow(() => new vm.Script(script), 'o JavaScript gerado para o navegador compila');

    // Nada foi escrito, movido ou enviado.
    assert.deepEqual(escritas, [], 'zero escrita em disco');
    assert.equal(execs, 0, 'a ponte maestri ask não foi chamada');
    console.log('galeria-midia-videos: scanner com mp4/webm/mov, MIME, Range 206/416, HEAD, travessia, <video> no card e no lightbox; zero servidor, escrita ou exec: OK');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
