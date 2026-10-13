'use strict';
// Calendário e Tráfego (Lumen, 13/10): o conteúdo principal vem primeiro e o contexto fica
// recolhido. Módulos reais num DOM falso; zero POST e zero rede.
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
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date, URLSearchParams,
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {},
    fetch: () => { throw Error('rede proibida'); } });
  return m.exports;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter(Boolean),
  appendChild(n) { this.children.push(n); return n; }, replaceChildren(...n) { this.children = n.flat(Infinity).filter(Boolean); },
  get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((x) => x !== n); },
  setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, classList: { add() {}, remove() {} },
  focus() { this.focada = true; }, scrollIntoView() { this.rolada = true; } });
const walk = (n) => [n, ...(n.children || []).filter((c) => typeof c === 'object').flatMap(walk)];
const text = (n) => walk(n).map((x) => x.attrs.texto || '').join(' ');
const indice = (raiz, pred) => walk(raiz).findIndex(pred);

const base = (api) => ({
  h: node, obsoleta: () => false, recarregar() {}, navegar() {}, aviso() {},
  formatar: { data: (d) => String(d), dataHora: (d) => String(d), isoLocal: (d) => d.toISOString().slice(0, 10), reais: (v) => `R$ ${v}` },
  estado: { carregando: (r, t) => r.replaceChildren(node('p', { texto: t })), erro: (_r, e) => assert.fail(e.message), bloco: { vazio: (t) => node('p', { texto: t }) } },
  cabecalho: (r, t) => r.appendChild(node('header', { texto: t })),
  secao: (t, ...f) => node('section', { class: 'secao' }, node('h2', { texto: t }), ...f),
  alerta: (nivel, t) => node('p', { class: `alerta alerta-${nivel}`, texto: t }), tabela: () => node('table'),
  selo: (_n, t) => node('span', { texto: t }), urlArquivo: (u) => u, markdown: (t) => node('p', { texto: t }),
  acao: () => assert.fail('POST proibido'), formulario: () => assert.fail('nada abre sozinho'), api,
});

(async () => {
  // Calendário
  const semData = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, versao: 'a'.repeat(40), titulo: `AUDIT ${i}`, tipo: 'imagem' }));
  const dadosCal = { itens: [{ id: 'q', versao: 'b'.repeat(40), titulo: 'AUDIT marcada', tipo: 'imagem', data: '2099-01-10', canal: 'reels' }],
    semData, desatualizados: [{ id: 'x', titulo: 'AUDIT velha', data: '2099-01-02', motivo: 'versão mudou' }], referenciaFunil: [{ ordem: 1, peca: 'S1', situacao: 'ok' }] };
  const apiCal = async (url) => {
    if (url === '/api/marketing/cronograma') return { dados: null };
    if (url.endsWith('/ensaio')) return { dados: { modo: 'ensaio', realHabilitado: false, chamadasMeta: 0, itens: [], geradoEm: '2099-01-01T10:00:00-03:00' } };
    if (url.startsWith('/api/marketing/calendario?')) return { dados: dadosCal };
    throw Error('GET inesperado ' + url);
  };
  const cal = load('calendario.js');
  for (const params of [{ mes: '2099-01' }, { mes: '2099-01', secao: 'sem-data' }]) {
    const raiz = node('main');
    await cal.montar(raiz, { ...base(apiCal), params });
    await Promise.resolve();
    const mes = indice(raiz, (n) => n.attrs.class === 'calendario');
    const cronograma = indice(raiz, (n) => n.attrs['aria-label'] === 'Cronograma editorial');
    const ensaio = indice(raiz, (n) => n.attrs['aria-label'] === 'Ensaio do calendário Meta');
    assert.ok(mes > 0 && cronograma > mes && ensaio > mes, 'mês antes do cronograma e do ensaio');
    const recolhidos = walk(raiz).filter((n) => n.tag === 'details' && n.attrs.class === 'secao-recolhida');
    const titulos = recolhidos.map((d) => d.children[0].attrs.texto);
    for (const t of ['Cronograma editorial', 'Ensaio do calendário Meta', 'Previsões e entradas no calendário (1)', 'Planejamentos que perderam a validade (1)', 'Ordem do funil (FUNIL.md)']) assert.ok(titulos.includes(t), t);
    assert.ok(recolhidos.every((d) => !d.attrs.open), 'contexto começa recolhido');
    const bloco = walk(raiz).find((n) => n.attrs.class === 'cal-sem-data-bloco');
    assert.equal(bloco.children[0].attrs.texto, 'Aprovados sem data (12)', 'contagem visível com o bloco fechado');
    assert.equal(!!bloco.attrs.open, params.secao === 'sem-data', 'só o atalho abre o bloco');
    const coluna = walk(raiz).find((n) => n.attrs.id === 'aprovados-sem-data');
    assert.equal(!!coluna.focada, params.secao === 'sem-data');
    assert.ok(text(raiz).includes('1 planejamento perdeu a validade'), 'aviso curto no topo');
    assert.ok(indice(raiz, (n) => /planejamento perdeu a validade/.test(n.attrs.texto || '')) < mes, 'aviso acima do mês');
  }

  // Tráfego
  const dadosTr = {
    portas: [{ estado: 'fechada', texto: 'AUDIT pixel' }, { estado: 'aberta', texto: 'AUDIT conta' }],
    prerequisitos: [{ estado: 'pendente', texto: 'AUDIT domínio' }, { estado: 'feito', texto: 'AUDIT página' }],
    limitesDeReferencia: { aviso: 'AUDIT', itens: [{ sinal: 'CTR', limite: '1%', decisao: 'trocar' }] },
    angulosPorEtapa: { prospeccao: 'AUDIT', fonte: 'FUNIL.md' },
    campanhas: [{ id: 'c1', nome: 'AUDIT campanha', status: 'rascunho', orcamentoDiario: 10, periodo: { relativo: 'D+1 a D+7' }, pecasVinculadas: [] }],
    pecasAprovadasDisponiveis: [], fonte: ['FUNIL.md'],
  };
  const chamadas = [];
  const raiz = node('main');
  await load('trafego.js').montar(raiz, { ...base(async (url) => { chamadas.push(url); return { dados: dadosTr }; }), params: {} });
  const bloqueio = indice(raiz, (n) => /^Verba bloqueada: 1 de 2 portas/.test(n.attrs.texto || ''));
  const campanhas = indice(raiz, (n) => n.attrs.texto === 'Campanhas planejadas');
  const portas = indice(raiz, (n) => n.attrs.texto === 'Portas para abrir verba (1 de 2 abertas)');
  assert.ok(bloqueio > 0 && campanhas > bloqueio && portas > campanhas, 'bloqueio resumido, campanhas, depois portas');
  const titulos = walk(raiz).filter((n) => n.tag === 'details').map((d) => d.children[0].attrs.texto);
  assert.deepEqual(titulos, ['Portas para abrir verba (1 de 2 abertas)', 'Pré-requisitos técnicos (1 pendente)', 'Limites de referência', 'Ângulos por etapa']);
  assert.ok(walk(raiz).filter((n) => n.tag === 'details').every((d) => !d.attrs.open));
  assert.ok(text(raiz).includes('AUDIT campanha'));
  assert.deepEqual(chamadas, ['/api/marketing/trafego'], 'só leitura');
  console.log('admin-calendario-trafego-layout: mês e campanhas no topo, sem-data recolhido com contagem e atalho, contexto em details, bloqueio de verba visível: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
