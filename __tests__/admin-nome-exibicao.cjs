'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const ts = require('typescript');
const catalogo = require('../tools/admin-local/marketing/catalogo.cjs');
const calendario = require('../tools/admin-local/marketing/calendario.cjs');
const nome = catalogo.nomeExibicaoPeca;
// Decisão do autor (18/10): nome do arquivo (sem extensão) + formato; nunca título da copy, legenda ou semana.
assert.equal(nome({ nomeArquivo: 'O café, o delivery.png', tipo: 'imagem' }), 'O café, o delivery · Post');
assert.equal(nome({ nomeArquivo: 'Notificação do banco vira lançamento.mp4', tipo: 'video' }), 'Notificação do banco vira lançamento · Reels');
assert.equal(nome({ nomeArquivo: 'reels/Seu mês em dia.mp4', tipo: 'video' }), 'Seu mês em dia · Reels');
assert.equal(nome({ nomeArquivo: 'Seu mês em dia.png', tipo: 'imagem', codigo: 'S01' }), 'Seu mês em dia · Stories');
assert.equal(nome({ nomeArquivo: 'Tudo em um só lugar', tipo: 'carrossel' }), 'Tudo em um só lugar · Carrossel');
assert.equal(nome({ nomeArquivo: 'roteiro.md', tipo: 'texto' }), 'roteiro · Texto');
assert.equal(nome({ tituloPublicacao: 'Outro', primeiraLinhaLegenda: 'Legenda', tipo: 'imagem', semana: { numero: 42 } }), 'Sem nome · Post', 'título e legenda não nomeiam; semana nunca');
assert.ok(!/Semana/.test(nome({ tipo: 'video', semana: { numero: 42 } })));
const uiBase = path.resolve('tools/admin-local/web/telas'), cache = new Map();
function ui(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo).exports;
  const m = { exports: {} }; cache.set(arquivo, m);
  let fonte = fs.readFileSync(path.join(uiBase, arquivo), 'utf8');
  if (arquivo === 'feed.js') fonte += '\nexport { normalizar };\n';
  vm.runInNewContext(ts.transpileModule(fonte, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module: m, exports: m.exports, URL, Intl, Date, console, require: id => ui(id.replace('./', '')) }, { filename: arquivo });
  return m.exports;
}
const helpers = ui('_pecas.js');
assert.equal(helpers.tituloPeca({ nomeExibicao: 'Seu mês · Post', nome: 'arquivo.png' }), 'Seu mês · Post');
assert.equal(helpers.tituloPeca({ nome: 'reels/arquivo.mp4', tipo: 'video', semana: { numero: 40 } }), 'arquivo · Reels', 'fallback do cliente: nome do arquivo, nunca Semana N');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-nomes-'));
try {
  const semana = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
  const pasta = path.join(dir, semana, 'aprovados/pecas'); fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'E01.png'), 'fixture');
  fs.writeFileSync(path.join(pasta, 'R01.mp4'), 'fixture');
  fs.writeFileSync(path.join(pasta, 'C01-01.png'), 'fixture1'); fs.writeFileSync(path.join(pasta, 'C01-02.png'), 'fixture2');
  fs.writeFileSync(path.join(pasta, 'S01.png'), 'fixture');
  fs.writeFileSync(path.join(pasta, 'arquivo-cru.png'), 'fixture');
  const copy = '## E01 · Assunto editorial\n\n**Título:** Seu dinheiro tem destino\n\n**Legenda:** Primeira linha.\nSegunda linha.\n\n## R01 · Reel\n\n**Legenda:** Notificação vira lançamento.\n\n## C01 · Seu mês em cartões\n\n**Legenda:** Confira os cartões.\n\n## S01 · Story\n\n**Legenda:** Olhe seu mês.\n';
  fs.writeFileSync(path.join(pasta, 'COPYS-FINAIS.md'), copy);
  const antes = catalogo.montarCatalogo(dir), por = sufixo => antes.find(p => p.caminho.endsWith(sufixo));
  assert.equal(por('E01.png').nomeExibicao, 'E01 · Post');
  assert.equal(por('R01.mp4').nomeExibicao, 'R01 · Reels');
  assert.equal(por('S01.png').nomeExibicao, 'S01 · Stories');
  assert.equal(antes.find(p => p.tipo === 'carrossel').nomeExibicao, 'c01 · Carrossel');
  assert.equal(por('arquivo-cru.png').nomeExibicao, 'arquivo-cru · Post');
  // Trocar só o título de apresentação não invalida os bytes e a legenda já aceitos.
  fs.writeFileSync(path.join(pasta, 'COPYS-FINAIS.md'), copy.replace('Seu dinheiro tem destino', 'Cada gasto tem um lugar'));
  const depois = catalogo.montarCatalogo(dir).find(p => p.id === por('E01.png').id);
  assert.equal(depois.versao, por('E01.png').versao); assert.equal(depois.legenda, por('E01.png').legenda);
  assert.equal(depois.nomeExibicao, 'E01 · Post', 'o título da copy não renomeia a peça');
  const feed = catalogo.feed(dir).pecas;
  assert.equal(feed.find(p => p.id === depois.id).nomeExibicao, depois.nomeExibicao);
  const mes = calendario.obterCalendario(dir, '2099-01');
  assert.equal(mes.aprovadosSemData.find(p => p.id === depois.id).nomeExibicao, depois.nomeExibicao);
  const normalizados = ui('feed.js').normalizar(feed, { urlArquivo: u => u });
  assert.equal(normalizados.find(p => p.id === depois.id).titulo, depois.nomeExibicao);
  assert.ok(normalizados.every(p => !/\.png|\.mp4|reels\//.test(p.titulo)), 'nenhum caminho cru vira título do Feed');
} finally {
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('grana-nomes-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('admin-nome-exibicao: título/copy/primeira linha, formatos, fallback, catálogo/feed/calendário e versão preservada OK');
