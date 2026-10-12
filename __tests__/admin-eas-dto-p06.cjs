'use strict';
// DTO e consumidores reais; CLI, Git, filesystem do app e integrações são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const agora = Date.parse('2026-10-11T18:00:00Z');
class Relogio extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return agora; } }
const fonte = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const cliChamadas = [];
const saldoDatas = ['2026-10-08T18:00:00Z', '2026-10-01T18:00:00Z'];
function modulo(rel, requireFake, extras = {}) {
  const m = { exports: {} };
  vm.runInNewContext(fonte(rel), { module: m, exports: m.exports, require: requireFake, Date: Relogio, console,
    process: { execPath: 'node-ficticio', env: { LOCALAPPDATA: 'cache-ficticio' } }, ...extras }, { filename: rel });
  return m.exports;
}
const app = JSON.stringify({ expo: { version: '0.0.0' } });
const fsFake = { readdirSync: () => ['cache'], existsSync: () => true,
  readFileSync: (p) => String(p).endsWith('package.json') ? '{"version":"1.0.0"}' : app };
const eas = modulo('tools/admin-local/adaptadores/eas.cjs', (id) => {
  if (id === 'fs') return fsFake;
  if (id === 'path') return path;
  if (id === '../config.cjs') return { RAIZ: '/fixture', SIMULAR: true };
  if (id === './git-local.cjs') return { datasDosPreparos: () => saldoDatas };
  if (id.endsWith('teto-de-builds.ts')) return { situacaoDoTeto: () => ({ feitos: 1, teto: 3, podePreparar: true, zeraEm: new Relogio('2026-10-12T03:00:00Z'), daSemana: [saldoDatas[0]] }) };
  if (id === 'child_process') return {
    execFileSync: (cmd, args) => { assert.equal(cmd, 'git'); assert.equal(args.join(' '), 'show HEAD:app.json'); return app; },
    execFile: (cmd, args, op, cb) => {
      cliChamadas.push({ cmd, args }); assert.equal(args[1], 'build:list');
      cb(null, JSON.stringify([{ id: 'sim-build', status: 'FINISHED', appVersion: '0.0.0', buildProfile: 'preview', createdAt: '2026-10-07T18:00:00Z', artifacts: { buildUrl: 'https://example.invalid/fixture.apk' } }]), '');
    },
  };
  if (id === './build-acoes.cjs') return { persistencia: () => ({}), gitReal: {}, criarAcoesBuild: () => ({ estado: () => null }) };
  throw Error('Import não autorizado: ' + id);
});
function simulador() {
  const s = { Date: Relogio, URLSearchParams };
  vm.runInNewContext(fonte('tools/admin-local/web/simulado.js').replace('export const SIMULADO', 'const SIMULADO') + '\nglobalThis.simulado = SIMULADO;', s);
  return s.simulado;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter((x) => x != null),
  appendChild(n) { this.children.push(n); }, removeChild(n) { this.children.splice(this.children.indexOf(n), 1); }, get firstChild() { return this.children[0]; } });
const texto = (n) => n == null ? '' : typeof n !== 'object' ? String(n) : [n.attrs?.texto || '', ...n.children.map(texto)].join(' ');
const achar = (n, label) => n.attrs?.texto === label ? n : n.children?.map((c) => typeof c === 'object' && achar(c, label)).find(Boolean);
async function tela(nome, resposta) {
  const root = node('main'), cartoes = [], vazios = [], recibos = [], linhas = [], blocos = [];
  const ctx = { h: node, obsoleta: () => false, cabecalho() {}, recarregar() {},
    api: async () => resposta, bloco: (_titulo, _rota, montar) => { const box = node('div'); blocos.push(() => box.appendChild(node('div', {}, montar(resposta.dados)))); return box; },
    cartao: (c) => { cartoes.push(c); return node('article', {}, c.titulo, c.valor, c.detalhe); },
    alerta: (tipo, t) => node('p', { tipo, texto: t }), selo: (tipo, t) => node('span', { tipo, texto: t || tipo }),
    secao: (t, n) => node('section', {}, t, n),
    tabela: (cols, ls) => { linhas.push(...ls); return node('table', {}, ls.map((l) => node('tr', {}, cols.map((c) => c.valor(l))))); },
    estado: { carregando() {}, erro(_n, e) { throw e; }, bloco: { vazio: (t) => { vazios.push(t); return node('p', { texto: t }); } } },
    formatar: { numero: String, reais: String, data: String, dataHora: String, relativo: String },
  };
  const s = { montarReciboBuild: (_ctx, _root, p) => recibos.push(p) };
  vm.runInNewContext(fonte(`tools/admin-local/web/telas/${nome}.js`).replace(/^import .*\r?\n/gm, '').replace('export async function ', 'async function '), s);
  await s.montar(root, ctx);
  for (const carregar of blocos) carregar();
  return { root, cartoes, vazios, recibos, linhas };
}
const keys = (o) => Object.keys(o).sort().join(',');
(async () => {
  const real = await eas.builds(), sim = simulador(), r = await sim.ler('/api/eas/builds');
  assert.equal(r.simulado, true);
  assert.equal(keys(r.dados), keys(real), 'simulado usa o envelope do adaptador real');
  for (const [a, b] of [[r.dados.itens[0], real.itens[0]], [r.dados.saldo, real.saldo], [r.dados.saldo.semana, real.saldo.semana], [r.dados.saldo.mes, real.saldo.mes]]) assert.equal(keys(a), keys(b));
  assert.equal(cliChamadas.length, 1, 'uma listagem dublada; nenhum disparo');
  for (const dados of [r.dados, real]) {
    const t = await tela('eas', { dados });
    assert.equal(t.cartoes[0].valor, '1 de 3'); assert.equal(t.cartoes[1].valor, '2 de 15');
    assert.equal(t.linhas.length, 1); assert.ok(texto(t.root).includes('Pronta'));
    assert.equal(achar(t.root, 'APK')?.attrs.href || null, dados.itens[0].apk);
    assert.equal(achar(t.root, 'Preparar build').attrs.disabled, false);
  }
  const saldo = real.saldo;
  const teto = await tela('eas', { dados: { ...real, saldo: { ...saldo, semana: { ...saldo.semana, feitos: 3, podePreparar: false } } } });
  assert.equal(achar(teto.root, 'Preparar build').attrs.disabled, true, 'teto do DTO real continua bloqueando');
  const pendente = { id: 'fixture', estado: 'desconhecido' };
  const p = await tela('eas', { dados: { ...real, preparoPersistido: pendente } });
  assert.equal(achar(p.root, 'Preparar build').attrs.disabled, true); assert.equal(p.recibos[0], pendente);
  const ausencia = await tela('eas', { dados: { status: 'ausente', motivo: 'CLI indisponível (fixture).', saldo, itens: [] } });
  assert.ok(ausencia.vazios[0].includes('CLI')); assert.equal(ausencia.cartoes[0].valor, '1 de 3');
  const semSaldo = await tela('eas', { dados: { status: 'ok', itens: [], saldo: { status: 'erro', erro: { codigo: 'fixture' } } } });
  assert.equal(semSaldo.cartoes[0].valor, 'sem dado'); assert.ok(texto(semSaldo.root).includes('Saldo da semana ainda não lido'));
  const geral = await sim.ler('/api/visao-geral');
  const geralReal = modulo('tools/admin-local/adaptadores/visao-geral.cjs', (id) => {
    if (id === 'fs') return fsFake;
    if (id === 'path') return path;
    if (id === '../config.cjs') return { RAIZ: '/fixture', SIMULAR: true };
    if (id === './_http.cjs') return { statusDe: async (fn) => fn() };
    if (id === './eas.cjs') return eas;
    if (id === './git-local.cjs') return { estado: () => ({ status: 'ok', origemMain: { atras: 0 } }) };
    if (id === './supabase.cjs') return { resumo: async () => ({ status: 'ok', assinaturas: { status: 'ok', ativas: 0 } }), funcoes: async () => ({ status: 'ok', alertas: [] }), appRelease: async () => ({ status: 'ok', linha: null }) };
    if (id === './vercel.cjs') return { deployments: async () => ({ status: 'ok' }) };
    if (id === './github.cjs') return { releases: async () => ({ status: 'ok', itens: [] }) };
    if (id === './cakto.cjs') return { resumo: async () => ({ status: 'ausente', motivo: 'Fixture indisponível.' }) };
    throw Error('Import não autorizado: ' + id);
  }, { setTimeout, clearTimeout });
  const cache = (_key, _ms, fn) => Promise.resolve().then(fn);
  cache.espiar = () => ({ valor: real, em: 'fixture' });
  const dtoGeral = await geralReal.resumo(cache, false);
  assert.equal(keys(geral.dados.buildsDaSemana), keys(dtoGeral.buildsDaSemana));
  const realG = await tela('visao-geral', { dados: dtoGeral });
  assert.equal(realG.cartoes.find((c) => c.titulo === 'Builds desta semana').valor, '1 de 3');
  assert.ok(realG.cartoes.find((c) => c.titulo === 'Builds desta semana').detalhe.includes('2 de 15'));
  assert.equal(geral.simulado, true); assert.equal(geral.dados.builds, undefined);
  const g = await tela('visao-geral', geral);
  assert.equal(g.cartoes.find((c) => c.titulo === 'Builds desta semana').valor, '1 de 3');
  assert.ok(g.cartoes.find((c) => c.titulo === 'Builds desta semana').detalhe.includes('2 de 15'));
  assert.ok(texto(g.root).includes('(simulado)')); assert.ok(texto(g.root).includes('CLI não logada'));
  const indisponivel = await tela('visao-geral', { dados: { buildsDaSemana: null, integracoes: {} } });
  assert.equal(indisponivel.cartoes.find((c) => c.titulo === 'Builds desta semana').valor, 'sem dado');
  console.log('P06: DTO do adaptador real/simulado, duas telas, saldo/teto, pendência/recibo e indisponibilidade OK; zero rede/CLI/Git real');
})().catch((e) => { console.error(e); process.exitCode = 1; });
