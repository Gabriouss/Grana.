'use strict';
// Capa e Reel vinculados em qualquer estado (autor, 23/10/2026: "aqui consta que o reels não tem capa,
// mas a capa está ali sendo considerada uma alternativa"). A aprovação promove uma metade do par antes
// da outra; o par tem de sobreviver. Catálogo e aprovacao.js reais, repositório temporário, DOM falso.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const base = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'grana-capa-estados-'));
const raiz = path.join(base, 'repo');
process.env.GRANA_ADMIN_PASTA_CONTA = path.join(base, 'conta');
process.env.GRANA_ADMIN_RAIZ_DADOS = raiz;
fs.mkdirSync(raiz, { recursive: true });
const configPath = require.resolve('../tools/admin-local/config.cjs');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: {
  RAIZ: path.resolve(__dirname, '..'), RAIZ_DADOS: raiz, ler: () => null, tem: () => false,
  ocultar: (s) => String(s), registrarSegredo() {}, refSupabase: () => null } };
global.fetch = () => { throw Error('rede proibida'); };
const cat = require('../tools/admin-local/marketing/catalogo.cjs');

const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date,
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {},
    fetch: () => { throw Error('rede proibida'); } });
  return m.exports;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter(Boolean),
  appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n.flat(Infinity).filter(Boolean); },
  get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); },
  setAttribute(k, v) { this.attrs[k] = v; }, focus() {} });
const walk = (n) => [n, ...(n.children || []).filter((c) => typeof c === 'object').flatMap(walk)];
const text = (n) => walk(n).map((x) => x.attrs.texto || '').join(' ');

const S = 'docs/marketing/2026-10/semana-42-2026-10-12-a-2026-10-18';
const grava = (rel, c) => { const f = path.join(raiz, S, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };
const por = (pecas, rel) => pecas.find((p) => p.caminho === `${S}/${rel}`);

async function tela(pecaId) {
  const dto = JSON.parse(JSON.stringify(cat.listarPecas(raiz)));
  const r = node('main');
  await load('aprovacao.js').montar(r, { h: node, params: { peca: pecaId }, obsoleta: () => false, recarregar() {}, cabecalho() {}, navegar() {},
    midia: () => node('img'), markdown: (t) => node('p', { texto: t }), urlArquivo: (u) => u,
    selo: (_n, t) => node('span', { texto: t }), alerta: (_n, t) => node('p', { texto: t }), formatar: { data: (d) => d, dataHora: (d) => d },
    estado: { carregando() {}, erro: (_r, e) => assert.fail(e.message), vazio() {}, bloco: { vazio: (t) => node('p', { texto: t }) } },
    api: async (url) => ({ dados: url.endsWith('/pecas') ? dto : { pedidos: [], remoto: { status: 'ativo' } } }),
    acao: () => assert.fail('nenhuma mutação pela tela'), formulario: () => assert.fail('nada abre sozinho'), contadorAprovacao() {} });
  const alt = walk(r).find((n) => n.attrs.class === 'demanda-alternativas');
  return { texto: text(r), capa: walk(r).find((n) => n.attrs.class === 'demanda-capa'), alternativas: alt ? text(alt) : '' };
}

(async () => {
  try {
    grava('INDICE.md', '# AUDIT\n');
    // O caso do Pix: capa aprovada sozinha e promovida; o Reel ficou em para-aprovacao.
    grava('aprovados/pecas/reels/Recebeu um Pix-capa.png', 'AUDIT-capa-pix');
    grava('para-aprovacao/pecas/reels/Recebeu um Pix.mp4', 'AUDIT-video-pix');
    // O inverso: Reel promovido primeiro, capa ainda em para-aprovacao.
    grava('aprovados/pecas/reels/Inverso.mp4', 'AUDIT-video-inv');
    grava('para-aprovacao/pecas/reels/Inverso-capa.png', 'AUDIT-capa-inv');
    // Revisões com o mesmo nome nos dois estados: cada vídeo com a capa do próprio estado.
    grava('aprovados/pecas/reels/Revisao.mp4', 'AUDIT-video-rev-a'); grava('aprovados/pecas/reels/Revisao-capa.png', 'AUDIT-capa-rev-a');
    grava('para-aprovacao/pecas/reels/Revisao.mp4', 'AUDIT-video-rev-b'); grava('para-aprovacao/pecas/reels/Revisao-capa.png', 'AUDIT-capa-rev-b');
    // Fora da regra: historico, outra subpasta e capa sem vídeo continuam órfãs.
    grava('historico/pecas/reels/Antigo-capa.png', 'AUDIT-capa-hist'); grava('para-aprovacao/pecas/reels/Antigo.mp4', 'AUDIT-video-hist');
    grava('aprovados/pecas/outros/Outra-capa.png', 'AUDIT-capa-sub'); grava('para-aprovacao/pecas/reels/Outra.mp4', 'AUDIT-video-sub');
    grava('aprovados/pecas/reels/Sozinha-capa.png', 'AUDIT-capa-so');

    const { pecas } = cat.listarPecas(raiz);
    const par = (video, capa) => {
      const v = por(pecas, video), c = por(pecas, capa);
      assert.ok(v && c, `fixture: ${video} / ${capa}`);
      assert.equal(v.capa?.pecaId, c.id, `${video} aponta para ${capa}`);
      assert.equal(c.capaDe, v.id, `${capa} aponta para ${video}`);
      assert.equal(c.capaOrfa, false); assert.equal(c.familia, v.familia, 'capa na família do Reel');
      assert.ok(v.composicao && v.composicao.capaPecaId === c.id, 'aceite composto (W-A2) sela a capa vinculada');
      return { v, c };
    };
    const pix = par('para-aprovacao/pecas/reels/Recebeu um Pix.mp4', 'aprovados/pecas/reels/Recebeu um Pix-capa.png');
    par('aprovados/pecas/reels/Inverso.mp4', 'para-aprovacao/pecas/reels/Inverso-capa.png');
    par('aprovados/pecas/reels/Revisao.mp4', 'aprovados/pecas/reels/Revisao-capa.png');
    par('para-aprovacao/pecas/reels/Revisao.mp4', 'para-aprovacao/pecas/reels/Revisao-capa.png');
    for (const [video, capa] of [['para-aprovacao/pecas/reels/Antigo.mp4', 'historico/pecas/reels/Antigo-capa.png'],
      ['para-aprovacao/pecas/reels/Outra.mp4', 'aprovados/pecas/outros/Outra-capa.png']]) {
      assert.equal(por(pecas, video).capa, null, `${video} não pega capa de ${capa}`);
      assert.equal(por(pecas, capa).capaOrfa, true, `${capa} continua órfã`);
    }
    assert.equal(por(pecas, 'aprovados/pecas/reels/Sozinha-capa.png').capaOrfa, true);

    // Trocar a capa vinculada de outro estado gera versão nova do Reel (W-A2 intacto).
    const antes = pix.v.versao;
    grava('aprovados/pecas/reels/Recebeu um Pix-capa.png', 'AUDIT-capa-pix-v2');
    assert.notEqual(por(cat.listarPecas(raiz).pecas, 'para-aprovacao/pecas/reels/Recebeu um Pix.mp4').versao, antes, 'capa nova muda a versão do Reel');

    // Capa vinculada não vira post próprio no feed.
    const feed = cat.feed(raiz).pecas.map((p) => p.id);
    assert.ok(!feed.includes(pix.c.id), 'capa vinculada fora do feed');

    // Tela: o Reel mostra a capa, sem aviso de "sem capa" e sem a capa em Alternativas.
    const t = await tela(pix.v.id);
    assert.ok(t.capa, 'bloco "Capa deste Reel" presente');
    assert.ok(!t.texto.includes('ainda não tem capa vinculada'), t.texto);
    assert.ok(!t.alternativas.includes('Recebeu um Pix'), `capa vinculada não é alternativa: ${t.alternativas}`);
    // Capa órfã da mesma família também não é alternativa de post (segue visível na galeria como "Capa sem Reel").
    const o = await tela(por(pecas, 'para-aprovacao/pecas/reels/Antigo.mp4').id);
    assert.ok(o.texto.includes('ainda não tem capa vinculada'), 'Reel realmente sem capa continua avisando');
    assert.ok(!o.alternativas.includes('Antigo-capa'), `capa órfã não é alternativa: ${o.alternativas}`);

    console.log('admin-capa-reel-estados: capa e Reel vinculados entre aprovados e para-aprovacao nos dois sentidos; revisões de mesmo nome com a capa do próprio estado; historico, outra subpasta e capa sozinha seguem órfãs; W-A2 intacto; tela sem aviso falso e sem capa em Alternativas: OK');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
