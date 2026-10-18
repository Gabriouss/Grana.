'use strict';
// Formato da estática pela proporção do arquivo, não pelo nome: módulos reais (catálogo + _pecas.js).
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const catalogo = require('../tools/admin-local/marketing/catalogo.cjs');
const png = (l, a) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(l, 16); b.writeUInt32BE(a, 20); return b; };
const jpg = (l, a) => { const b = Buffer.alloc(40); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0; b.writeUInt16BE(6, 4); b[10] = 0xff; b[11] = 0xc0; b.writeUInt16BE(17, 12); b[14] = 8; b.writeUInt16BE(a, 15); b.writeUInt16BE(l, 17); return b; };
function modulo(arq) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', arq), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: () => ({}), console, URL, Intl, Date }); return m.exports;
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-formato-'));
try {
  const pasta = path.join(dir, 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07/aprovados');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, '../INDICE.md'), '# Semana\n');
  fs.writeFileSync(path.join(pasta, 'Quanto dá pra gastar hoje.png'), png(1080, 1440));      // 3:4, nome sem pista
  fs.writeFileSync(path.join(pasta, 'Quatro por cinco.jpg'), jpg(1080, 1350));                // 4:5, JPEG
  fs.writeFileSync(path.join(pasta, 'Quadrado.png'), png(1080, 1080));                        // 1:1
  fs.writeFileSync(path.join(pasta, 'Tela cheia.png'), png(1080, 1920));                      // 9:16
  fs.writeFileSync(path.join(pasta, 'Medida estranha.png'), png(1200, 628));                  // fora dos casos
  fs.writeFileSync(path.join(pasta, 'Sem cabecalho.png'), 'lixo');                            // ilegível
  // Reel renomeado pelo título + capa 9:16 renomeada junto: o pareamento por nome sobrevive e a capa é de Reels.
  fs.mkdirSync(path.join(pasta, 'pecas/reels'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'pecas/reels/Fala o gasto, pronto.mp4'), 'video-fixture');
  fs.writeFileSync(path.join(pasta, 'pecas/reels/Fala o gasto, pronto-capa.png'), png(1080, 1920));
  const { formatoDaPeca } = modulo('_pecas.js');
  const por = (nome) => catalogo.montarCatalogo(dir).find((p) => p.nome === nome || p.caminho.endsWith('/' + nome));
  const capa = por('Fala o gasto, pronto-capa.png'), reel = por('Fala o gasto, pronto.mp4');
  assert.equal(capa.capaDe, reel.id, 'capa renomeada continua ligada ao Reel renomeado');
  assert.equal(formatoDaPeca(capa), 'reels', 'capa 9:16 é de Reels, nunca stories nem feed');
  assert.equal(formatoDaPeca(por('Quanto dá pra gastar hoje.png')), 'feed', '3:4 renomeado');
  assert.equal(formatoDaPeca(por('Quatro por cinco.jpg')), 'feed', '4:5 JPEG');
  assert.equal(formatoDaPeca(por('Quadrado.png')), 'feed', '1:1');
  assert.equal(formatoDaPeca(por('Tela cheia.png')), 'conferir', '9:16 sem prova fica a conferir, de propósito');
  assert.equal(formatoDaPeca({ ...por('Tela cheia.png'), planejamento: { canal: 'stories' } }), 'stories', '9:16 com prova de stories');
  assert.equal(formatoDaPeca(por('Medida estranha.png')), 'conferir', 'medida fora dos casos');
  assert.equal(formatoDaPeca(por('Sem cabecalho.png')), 'conferir', 'sem medida legível');
  assert.equal(por('Quanto dá pra gastar hoje.png').largura, 1080);
  // Nenhuma estática 3:4 do painel real fica a conferir.
  const reais = catalogo.listarPecas('.').pecas.filter((p) => p.tipo === 'imagem' && !p.capaDe && p.largura && Math.abs(p.largura / p.altura - 0.75) < 0.02);
  assert.ok(reais.length > 0 && reais.every((p) => formatoDaPeca(p) === 'feed' || formatoDaPeca(p) === 'stories'), 'estática 3:4 real nunca é "conferir"');
  console.log('admin-formato-por-proporcao: 3:4, 4:5, 1:1 = feed, 9:16 só com prova, arquivo renomeado, medida fora = conferir OK');
} finally { assert.ok(path.basename(dir).startsWith('grana-formato-')); fs.rmSync(dir, { recursive: true, force: true }); }
