'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const chamadas = [], mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date,
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {},
    fetch: () => { throw Error('rede proibida'); } });
  return m.exports;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean),
  appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n; },
  get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); },
  setAttribute(k, v) { this.attrs[k] = v; }, focus() {} });
const walk = (n) => [n, ...(n.children || []).filter((c) => typeof c === 'object').flatMap(walk)];
const text = (n) => walk(n).map((x) => x.attrs.texto || '').join(' ');
const canario = 'PRIVADO_NAO_MOSTRAR';
const tipos = ['pedido', 'entrega', 'correcao', 'custo', 'aceite', 'promocao', 'data'];
const eventos = tipos.map((tipo, i) => ({ tipo, em: `2026-10-12T10:0${i}:00Z`,
  id: canario, pedidoId: canario, lease: { id: canario }, textoOriginal: canario, evidencia: canario,
  ...(tipo === 'custo' ? { custo: { valorReais: 12.5, ferramenta: canario } } : {}),
  ...(tipo === 'data' ? { data: '2026-10-20', hora: '19:00' } : {}) }));
const p = { id: 'audit', tipo: 'imagem', titulo: 'Peça AUDIT', estado: 'para-aprovacao', trilha: { eventos: [...eventos].reverse() } };
const pedidos = [{ pecaId: p.id, estado: 'novo', eventos, alertas: [{ codigo: 'entrega-parada', motivo: 'Pedido aguardando. O vigia está inativo.', proximoPasso: 'Verifique o vigia para retomar a entrega do pedido.' }] }];
const ctx = { h: node, params: {}, obsoleta: () => false, cabecalho() {}, midia: () => node('img'), markdown: (t) => node('p', { texto: t }),
  selo: (_nivel, t) => node('span', { texto: t }), alerta: (_nivel, t) => node('p', { texto: t }),
  formatar: { data: (d) => d.split('-').reverse().join('/'), dataHora: (d) => `LOCAL(${d})` },
  estado: { carregando() {}, erro: () => assert.fail('falha UI'), vazio() {} },
  api: async (url) => { chamadas.push(url); return { dados: url.endsWith('/pecas') ? { pecas: [p] } : { pedidos } }; },
  acao: () => assert.fail('POST proibido'), contadorAprovacao: (n) => ctx.contagem = n,
};
(async () => {
  const helper = load('_pecas.js').historicoDaPeca;
  const antes = JSON.stringify({ p, pedidos });
  const historico = helper(ctx, p, pedidos);
  assert.equal(JSON.stringify({ p, pedidos }), antes);
  assert.equal(JSON.stringify(historico).includes(canario), false, 'nenhum id, texto livre ou ferramenta vira rotulo');
  const tempos = walk(historico).filter((n) => n.tag === 'time').map((n) => n.attrs.datetime);
  assert.deepEqual(tempos, eventos.map((e) => e.em), 'ASC e sem repeticao entre DTO peca/pedido');
  const t = text(historico);
  for (const label of ['Pedido registrado', 'Peça entregue', 'Correção registrada', 'Custo registrado: R$', '12,50', 'Versão aceita', 'Movida para aprovados', 'Data marcada: 20/10/2026 às 19:00']) assert(t.includes(label), label);
  assert(!t.includes('—')); assert(text(helper(ctx, { id: 'vazio' })).includes('Ainda não há eventos registrados.'));
  const invalidos = helper(ctx, { id: 'x', trilha: { eventos: [{ tipo: canario, em: eventos[0].em }, { tipo: 'pedido', em: 'invalido' }] } });
  assert.equal(walk(invalidos).filter((n) => n.tag === 'time').length, 0);
  const custo = helper(ctx, { id: 'c', trilha: { eventos: [{ tipo: 'custo-autorizado', em: eventos[0].em, custo: { valorReais: 0 } }, { tipo: 'custo-recusado', em: eventos[1].em }] } });
  assert(text(custo).includes('Custo autorizado pela conversa: R$')); assert(text(custo).includes('Custo recusado pela conversa: valor não informado'));
  const root = node('main'); await load('aprovacao.js').montar(root, ctx);
  const inserido = walk(root).find((n) => n.attrs.class === 'demanda-historico'); assert(inserido);
  assert.equal(walk(inserido).filter((n) => n.tag === 'time').length, 7);
  assert(walk(root).some((n) => n.attrs.class === 'demanda-atencao campo-ajuda' && n.attrs.texto.includes('Verifique o vigia')));
  assert.equal(ctx.contagem, 1); assert(text(root).includes('Precisa de você (1)'));
  assert.deepEqual(chamadas, ['/api/marketing/ajustes', '/api/marketing/pecas']);
  console.log('admin-peca-historico-tela: modulos reais, ASC, deduplicacao, custo R$, sem ids/texto privado, vazio, insercao no detalhe/alerta/contador OK; zero POST/rede');
})().catch((e) => { console.error(e); process.exitCode = 1; });
