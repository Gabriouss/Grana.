'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const catalogo = require('../tools/admin-local/marketing/catalogo.cjs');
const calls = [];
function carregar(rel, imports = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), {
    module: mod, exports: mod.exports, __dirname: path.dirname(path.join(ROOT, rel)),
    Date, Intl, Buffer, console, URL,
    fetch() { calls.push('fetch'); throw new Error('REDE PROIBIDA'); },
    process: { argv: [], env: new Proxy({}, { get() { calls.push('env'); throw new Error('ENV PROIBIDO'); } }) },
    require: (id) => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (!['node:crypto', 'node:path'].includes(id)) throw new Error('IMPORT PROIBIDO ' + id);
      return require(id);
    },
  }, { filename: rel });
  return mod.exports;
}
const real = carregar('tools/admin-local/marketing/meta-ensaio.cjs', { './catalogo.cjs': catalogo });
function fixture() {
  const p = { id: 'a'.repeat(16), versao: 'b'.repeat(40), estado: 'aprovados', caminho: 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/aprovados/card.jpg', arquivos: [{ nome: 'card.jpg', tipo: 'imagem' }] };
  const plano = { diaD: '2026-10-09', planejados: [{ id: p.id, versao: p.versao, caminho: p.caminho, data: '2026-10-10', hora: '14:30', canal: 'instagram-feed' }] };
  const a = { id: p.id, versao: p.versao, caminho: p.caminho, aprovadoEm: '2026-10-08T10:00:00-03:00', evidencia: 'aceite explícito do autor' };
  const leituras = [];
  const ensaiar = real.criarEnsaio({ agora: () => Date.parse('2026-10-08T18:00:00Z'), lerPlano: () => { leituras.push('plano'); return plano; }, pecas: () => { leituras.push('pecas'); return [p]; }, aceites: () => { leituras.push('aceites'); return [a]; } });
  return { p, plano, a, leituras, run: () => ensaiar('/fixture') };
}
let n = 0;
function test(nome, fn) { fn(); n++; console.log('OK ' + nome); }
function negado(h, codigo) { const r = h.run(); assert(r.itens[0].bloqueios.includes(codigo)); assert.equal(r.itens[0].estado, 'bloqueado'); return r; }
test('ensaio real converte Sao Paulo/UTC; apenas tres leituras sem Meta/env', () => {
  const h = fixture(), r = h.run(); assert.equal(r.itens[0].quandoUtc, '2026-10-10T17:30:00.000Z');
  assert.equal(r.itens[0].estado, 'ensaio'); assert.equal(r.modo, 'ensaio'); assert.equal(r.realHabilitado, false);
  assert.equal(r.chamadasMeta, 0); assert.deepEqual(h.leituras, ['plano', 'pecas', 'aceites']); assert.deepEqual(calls, []);
});
test('dia D nulo e data anterior deixam recibo por item', () => {
  let h = fixture(); h.plano.diaD = null; negado(h, 'dia-d-nao-declarado');
  h = fixture(); h.plano.diaD = '2026-10-11'; negado(h, 'antes-do-dia-d');
});
test('pasta para-aprovacao mesmo com aceite nunca entra', () => {
  const h = fixture(); h.p.estado = 'para-aprovacao'; h.p.caminho = h.p.caminho.replace('/aprovados/', '/para-aprovacao/');
  h.plano.planejados[0].caminho = h.p.caminho; h.a.caminho = h.p.caminho; negado(h, 'fora-de-aprovados');
});
test('evidencia datada exige caminho, SHA, autor e data real nao futura', () => {
  for (const patch of [{ evidencia: '' }, { aprovadoEm: null }, { aprovadoEm: '2026-02-30T10:00:00Z' }, { aprovadoEm: '2026-10-09T10:00:00Z' }, { versao: 'c'.repeat(40) }, { caminho: 'outro' }]) {
    const h = fixture(); Object.assign(h.a, patch); negado(h, 'sem-evidencia-datada-desta-versao');
  }
});
test('peca alterada removida ou historica conserva recusa visivel', () => {
  let h = fixture(); h.p.versao = 'c'.repeat(40); negado(h, 'versao-ou-caminho-mudou');
  h = fixture(); h.plano.planejados[0].id = 'd'.repeat(16); negado(h, 'peca-ausente');
  h = fixture(); h.p.estado = 'historico'; negado(h, 'fora-de-aprovados');
});
test('hora obrigatoria data impossivel passado e virada UTC', () => {
  for (const patch of [{ hora: null }, { hora: '25:00' }, { data: '2026-02-30' }, { data: '2026-10-08', hora: '14:00' }]) {
    const h = fixture(); Object.assign(h.plano.planejados[0], patch); assert.equal(h.run().itens[0].estado, 'bloqueado');
  }
  assert.equal(real.instante('2026-10-10', '23:59'), '2026-10-11T02:59:00.000Z');
  assert.equal(real.instante('2026-10-10', '00:00'), '2026-10-10T03:00:00.000Z');
});
test('anuncio e canal estranho nao viram publicacao organica', () => {
  let h = fixture(); h.plano.planejados[0].canal = 'anuncio'; negado(h, 'anuncio-fora-do-fluxo-organico');
  h = fixture(); h.plano.planejados[0].canal = 'facebook-inventado'; negado(h, 'canal-invalido');
});
test('formatos nao confirmados recusados; Reel MP4 e Story JPEG ensaiados', () => {
  let h = fixture(); h.p.arquivos[0].nome = 'card.svg'; negado(h, 'formato-de-midia-nao-validado');
  h = fixture(); h.plano.planejados[0].canal = 'reels'; negado(h, 'formato-de-midia-nao-validado');
  h.p.arquivos = [{ nome: 'reel.mp4', tipo: 'video' }]; assert.equal(h.run().itens[0].estado, 'ensaio');
  h = fixture(); h.plano.planejados[0].canal = 'stories'; assert.equal(h.run().itens[0].estado, 'ensaio');
});
test('recibo determinista distingue horario/canal; repeticao nao escreve nem publica', () => {
  const h = fixture(), a = h.run(); assert.equal(h.run().itens[0].recibo, a.itens[0].recibo);
  h.plano.planejados.push({ ...h.plano.planejados[0] }); negado({ run: () => ({ itens: [h.run().itens[1]] }) }, 'planejamento-duplicado');
  h.plano.planejados[0].hora = '15:30'; assert.notEqual(h.run().itens[0].recibo, a.itens[0].recibo); assert.deepEqual(calls, []);
});
test('nao devolve nota livre legenda URL ou dado inesperado do plano', () => {
  const h = fixture(); h.plano.planejados[0].observacao = 'SEGREDO'; h.p.legenda = 'SEGREDO'; h.p.arquivos[0].url = 'https://privado/SEGREDO';
  const s = JSON.stringify(h.run()); assert(!s.includes('SEGREDO'));
  h.plano.planejados[0].data = 'SEGREDO'; h.plano.planejados[0].hora = 'SEGREDO'; assert(!JSON.stringify(h.run()).includes('SEGREDO'));
});
test('CLI real recusa qualquer parametro de modo real e sanitiza excecao', () => {
  let chamados = 0;
  const cli = carregar('tools/admin-local/marketing/meta-ensaio-cli.cjs', { './meta-ensaio.cjs': { ensaiar() { chamados++; throw new Error('SEGREDO INTERNO'); } } });
  assert.equal(cli.executar(['--real']).ok, false); assert.equal(chamados, 0);
  const r = cli.executar([]); assert.equal(chamados, 1); assert.equal(r.codigo, 'ensaio-indisponivel'); assert(!JSON.stringify(r).includes('SEGREDO'));
});
test('fonte real em disco: catalogo recalcula SHA e JSON nao muda', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-meta-ensaio-'));
  try {
    const pasta = path.join(dir, 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11/aprovados');
    fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(path.join(pasta, 'card.jpg'), 'fixture1');
    const p = catalogo.montarCatalogo(dir).find((i) => i.tipo === 'imagem'); assert(p);
    const base = path.join(dir, 'docs/marketing/painel'); fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'calendario.json'), JSON.stringify({ diaD: '2099-01-01', planejados: [{ id: p.id, versao: p.versao, caminho: p.caminho, canal: 'instagram-feed', data: '2099-01-02', hora: '09:00' }] }));
    fs.writeFileSync(path.join(base, 'aprovacoes.json'), JSON.stringify({ aprovacoes: [{ id: p.id, versao: p.versao, caminho: p.caminho, aprovadoEm: '2026-10-01T10:00:00Z', evidencia: 'aceite datado fixture' }] }));
    const antes = fs.readFileSync(path.join(base, 'calendario.json'), 'utf8'); assert.equal(real.ensaiar(dir).itens[0].estado, 'ensaio');
    fs.writeFileSync(path.join(pasta, 'card.jpg'), 'fixture-alterada-maior'); negado({ run: () => real.ensaiar(dir) }, 'versao-ou-caminho-mudou');
    assert.equal(fs.readFileSync(path.join(base, 'calendario.json'), 'utf8'), antes); assert.deepEqual(calls, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
async function testarRota() {
  let leituras = 0, etapa = 'ok', sessao = true;
  const r = carregar('tools/admin-local/rotas.cjs', {
    path,
    './config.cjs': { RAIZ_DADOS: '/fixture', SIMULAR: false, ocultar: (v) => v },
    './seguranca.cjs': { checarApi: () => null, dentroDoLimite: () => true, sessaoDe: () => sessao ? { id: 'fixture', s: { etapa, geracao: 'g' } } : null },
    './autenticacao.cjs': { situacaoConta: () => ({ estado: 'ok', geracao: 'g' }) },
    './auditoria.cjs': { registrar() {} },
    [path.join(ROOT, 'tools/admin-local/marketing/meta-ensaio.cjs')]: { ensaiar(raiz) { assert.equal(raiz, '/fixture'); leituras++; return fixture().run(); } },
  });
  async function get() {
    let body, status;
    await r.tratarApi({ method: 'GET', headers: { 'x-grana-admin': '1' } }, { writeHead(s) { status = s; }, end(s) { body = JSON.parse(s); } }, new URL('http://127.0.0.1:4317/api/marketing/calendario/ensaio'));
    return { status, body };
  }
  let resposta = await get(); assert.equal(resposta.status, 200); assert.equal(resposta.body.dados.modo, 'ensaio'); assert.equal(leituras, 1);
  etapa = 'totp'; resposta = await get(); assert.equal(resposta.status, 401); assert.equal(leituras, 1);
  sessao = false; resposta = await get(); assert.equal(resposta.status, 401); assert.equal(leituras, 1);
  assert.deepEqual(calls, []); n++; console.log('OK rota real exige sessao completa antes de ler calendario/ensaio');
}
testarRota().then(() => console.log(`admin-meta-ensaio: ${n} grupos passaram (modulos reais, zero rede/env)`)).catch((e) => { console.error(e); process.exitCode = 1; });
