'use strict';
// Galeria da Aprovação (Lumen, 13/10): formatos Reels | Estáticos, capa dentro do Reel,
// carrossel como uma peça só e o contador do menu igual à galeria.
// Módulos reais (_pecas.js, ajustes.js, aprovacao.js) num DOM falso; zero rede e zero POST.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date,
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {},
    fetch: () => { throw Error('rede proibida'); } });
  return m.exports;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter(Boolean),
  appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n; },
  get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); },
  setAttribute(k, v) { this.attrs[k] = v; }, focus() {} });
const walk = (n) => [n, ...(n.children || []).filter((c) => typeof c === 'object').flatMap(walk)];
const text = (n) => walk(n).map((x) => x.attrs.texto || '').join(' ');

const _pecas = load('_pecas.js');
const ajustes = load('ajustes.js');
const SEM = { numero: 41, inicio: '2026-10-05', fim: '2026-10-11' };
const D = 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/para-aprovacao/pecas/';
const peca = (id, extra) => ({ id, versao: id[0].repeat(40), semana: SEM, estado: 'para-aprovacao', arquivos: [], ...extra });
const reel = peca('a'.repeat(16), { tipo: 'video', caminho: D + 'reels/reel-audit.mp4', nome: 'reels/reel-audit.mp4', capa: { pecaId: 'b'.repeat(16), url: '/x/capa.png' } });
const capa = peca('b'.repeat(16), { tipo: 'imagem', caminho: D + 'reels/reel-audit-capa.png', nome: 'reels/reel-audit-capa.png', capaDe: reel.id });
const orfa = peca('c'.repeat(16), { tipo: 'imagem', caminho: D + 'solta-1080x1920-capa.png', nome: 'solta-1080x1920-capa.png', capaOrfa: true });
const carrossel = peca('d'.repeat(16), { tipo: 'carrossel', caminho: D + 'carrossel-audit-*', nome: 'carrossel-audit-*',
  arquivos: [1, 2, 3].map((i) => ({ nome: `carrossel-audit-${i}.png`, tipo: 'imagem', url: `/x/${i}.png` })) });
const story = peca('e'.repeat(16), { tipo: 'imagem', caminho: D + 'stories/story-audit.png', nome: 'stories/story-audit.png' });
const vertical = peca('f'.repeat(16), { tipo: 'imagem', caminho: D + 'arte-1080x1920.png', nome: 'arte-1080x1920.png' });
const planejadaFeed = peca('1'.repeat(16), { tipo: 'imagem', caminho: D + 'cafe.png', nome: 'cafe.png', planejamento: { data: '2026-10-20', canal: 'instagram-feed' } });

// 1. Formato: capa pertence ao Reel; 9:16 sozinho não prova Stories.
assert.equal(_pecas.formatoDaPeca(reel), 'reels');
assert.equal(_pecas.formatoDaPeca(capa), 'reels');
assert.equal(_pecas.formatoDaPeca(orfa), 'reels');
assert.equal(_pecas.formatoDaPeca(carrossel), 'carrossel');
assert.equal(_pecas.formatoDaPeca(story), 'stories', 'destino escrito na pasta');
assert.equal(_pecas.formatoDaPeca(vertical), 'conferir', 'imagem vertical sem destino fica a conferir');
assert.equal(_pecas.formatoDaPeca(planejadaFeed), 'feed', 'canal do planejamento prova o destino');
assert.equal(_pecas.ROTULOS_FORMATO.conferir, 'Formato a conferir');

// 2. Capa separada pelo agrupamento volta para dentro do Reel; órfã continua sozinha.
const soltas = [{ chave: 'r', principal: reel, pecas: [reel] }, { chave: 'c', principal: capa, pecas: [capa] }, { chave: 'o', principal: orfa, pecas: [orfa] }];
const juntas = _pecas.juntarCapasAoReel(soltas);
assert.equal(juntas.length, 2);
assert.deepEqual(juntas[0].pecas.map((p) => p.id), [reel.id, capa.id]);
assert.equal(juntas[1].principal.id, orfa.id, 'capa órfã continua visível');
assert.equal(_pecas.juntarCapasAoReel([{ chave: 'c', principal: capa, pecas: [capa] }]).length, 1, 'capa sem o vídeo na lista não some');

// 3. Tela real: famílias do servidor deixam a capa fora; a galeria junta e o menu conta igual.
(async () => {
  const acervo = [reel, capa, orfa, carrossel, story, vertical];
  const familias = [{ id: 'f1', chave: 'r', principal: reel, alternativas: [], capas: [] }];
  const chamadas = [];
  const contagens = [];
  const ctx = { h: node, params: {}, obsoleta: () => false, recarregar() {}, cabecalho() {}, midia: () => node('img'), markdown: (t) => node('p', { texto: t }),
    selo: (_n, t) => node('span', { texto: t }), alerta: (_n, t) => node('p', { texto: t }),
    formatar: { data: (d) => d, dataHora: (d) => d }, estado: { carregando() {}, erro: () => assert.fail('falha UI'), vazio() {} },
    api: async (url) => { chamadas.push(url); return { dados: url.endsWith('/pecas') ? { pecas: acervo, familias } : { pedidos: [], remoto: { status: 'ativo' } } }; },
    acao: () => assert.fail('POST proibido'), contadorAprovacao: (n) => contagens.push(n) };
  const raiz = node('main');
  await load('aprovacao.js').montar(raiz, ctx);
  const cards = () => walk(raiz).filter((n) => n.attrs.class === 'demanda-familia');
  assert.equal(cards().length, 5, 'seis arquivos, cinco cards: a capa pareada entra no Reel');
  assert.ok(!walk(raiz).some((n) => n.attrs.class === 'galeria-card-titulo' && n.attrs.texto === 'reels/reel-audit-capa.png'), 'capa pareada nunca é card');
  assert.equal(contagens.at(-1), 5, 'menu conta as mesmas cinco famílias da galeria');
  const formatos = walk(raiz).filter((n) => n.attrs.class === 'galeria-card-formato').map((n) => n.attrs.texto);
  assert.ok(formatos.includes('Carrossel · 3 páginas'), 'carrossel é uma peça com as páginas juntas');
  assert.ok(formatos.includes('Formato a conferir'));
  assert.ok(formatos.includes('Stories'));
  assert.ok(text(raiz).includes('Capa sem Reel'), 'órfã tem aviso no card');
  // A janela do Reel (selecionado ao montar) mostra a capa dele, com aceite próprio.
  assert.ok(text(raiz).includes('Capa deste Reel'));
  const ficha = (t) => walk(raiz).find((n) => n.tag === 'button' && n.attrs.class === 'chip' && n.attrs.texto === t);
  ficha('Reels').attrs.onclick();
  assert.equal(cards().length, 2, 'Reels: o Reel (com a capa) e a capa órfã');
  ficha('Estáticos').attrs.onclick();
  assert.equal(cards().length, 3, 'Estáticos: carrossel, story e a imagem a conferir');
  ficha('Stories').attrs.onclick();
  assert.equal(cards().length, 1);
  ficha('Formato a conferir').attrs.onclick();
  assert.equal(cards().length, 1);
  ficha('Todos').attrs.onclick();
  assert.equal(cards().length, 5);
  assert.deepEqual(chamadas, ['/api/marketing/ajustes', '/api/marketing/pecas'], 'só leitura');
  console.log('admin-galeria-aprovacao: formatos, capa no Reel, órfã visível, carrossel uma peça, filtros e contador igual à galeria: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
