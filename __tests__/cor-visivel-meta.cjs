// V16: toda cor da paleta de 30 deve dar 3:1 como traço sobre o círculo do ícone e sobre a trilha.
const fs = require('fs'), ts = require('typescript'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/../lib/cor-visivel.ts', 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: 'ES2020' } }).outputText;
const m = { exports: {} };
vm.runInNewContext(js, { module: m, exports: m.exports, Math, parseInt });
const { corVisivel, razaoDeContraste } = m.exports;
const theme = fs.readFileSync(__dirname + '/../lib/theme.ts', 'utf8');
const bloco = theme.slice(theme.indexOf('PALETTE_30'));
const pal = bloco.slice(0, bloco.indexOf('];')).match(/#[0-9a-f]{6}/gi);
const h = (s) => { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const card = [0x0b, 0x2d, 0x35], paper = [0x05, 0x22, 0x29];
let falhas = 0, mudou = 0;
if (pal.length !== 30) { console.error('paleta esperada com 30 cores, achei', pal.length); process.exit(1); }
for (const x of pal) {
  const v = corVisivel(x), c = h(x), a = h(v);
  const circ = c.map((k, i) => Math.round(k * 0.1875 + card[i] * 0.8125));
  const r = Math.min(razaoDeContraste(a, circ), razaoDeContraste(a, paper));
  if (v !== x) mudou++;
  if (r < 3) { falhas++; console.error('abaixo de 3:1', x, '->', v, r.toFixed(2)); }
}
if (corVisivel('#12a8de') !== '#12a8de') { console.error('cor que ja passa nao deve mudar'); falhas++; }
if (falhas) process.exit(1);
console.log('ok: 30 cores >= 3:1; ajustadas:', mudou);
