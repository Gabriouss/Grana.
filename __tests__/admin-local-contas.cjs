'use strict';
// Tela Contas do painel local (decisão do autor, 24/10/2026): adaptador, rota e tela reais,
// sem rede nem banco. Confere o SQL que sai, o DTO fechado, a máscara do e-mail e a busca.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Readable } = require('node:stream');
const repo = path.resolve(__dirname, '..');
const agora = Date.parse('2026-10-24T18:00:00Z');
class Relogio extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return agora; } }
class ErroIntegracao extends Error { constructor(codigo, mensagem, status = 502) { super(mensagem); this.integracao = true; this.codigo = codigo; this.status = status; } }
const PROIBIDO = 'CANARIO_NAO_PODE_SAIR';

function carregarAdaptador(http, { configurado = true } = {}) {
  const m = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'tools/admin-local/adaptadores/supabase.cjs'), 'utf8'), {
    module: m, exports: m.exports, Date: Relogio, console, Buffer,
    process: { env: new Proxy({}, { get() { throw new Error('ENV REAL PROIBIDO'); } }) },
    fetch() { throw new Error('REDE REAL PROIBIDA'); },
    require: (id) => {
      if (id === '../config.cjs') return { RAIZ: repo, ler: () => 'TOKEN_FICTICIO', tem: () => configurado, refSupabase: () => 'ref-ficticia' };
      if (id === './_http.cjs') return { pedirJson: async (...a) => http(...a), ErroIntegracao };
      if (id === './git-local.cjs' || id === './recibos-funcoes.cjs') return {};
      if (id === 'fs') return fs;
      if (id === 'path') return path;
      throw new Error('IMPORT PROIBIDO ' + id);
    },
  }, { filename: 'supabase.cjs' });
  return m.exports;
}

const linhas = [
  { email: 'ana.souza@example.com', cadastro: '2026-09-01T12:00:00+00:00', email_confirmado: true, ultimo_login: '2026-10-01T12:00:00+00:00',
    ultimo_acesso: '2026-10-24T10:00:00+00:00', provider: 'interno', status: 'active', access_until: '2099-12-31T00:00:00+00:00', grace_until: null,
    id: PROIBIDO, ip: PROIBIDO, user_agent: PROIBIDO },
  { email: 'bo@example.org', cadastro: '2026-09-20T12:00:00+00:00', email_confirmado: false, ultimo_login: '2026-10-05T12:00:00+00:00',
    ultimo_acesso: '2026-10-05T12:00:00+00:00', provider: 'cakto', status: 'canceled', access_until: '2026-10-10T00:00:00+00:00', grace_until: null },
  { email: 'c@example.net', cadastro: '2026-10-20T12:00:00+00:00', email_confirmado: true, ultimo_login: '2026-10-21T12:00:00+00:00',
    ultimo_acesso: '2026-10-21T12:00:00+00:00', provider: 'cakto', status: 'past_due', access_until: '2026-10-22T00:00:00+00:00', grace_until: '2026-10-27T00:00:00+00:00' },
  { email: 'sem.login@example.com', cadastro: '2026-08-01T12:00:00+00:00', email_confirmado: false, ultimo_login: null, ultimo_acesso: null,
    provider: null, status: null, access_until: null, grace_until: null },
];

let n = 0;
async function test(nome, fn) { await fn(); n++; console.log('OK ' + nome); }

(async () => {
  await test('lista: um SELECT no endpoint read-only, e-mail parcial, DTO fechado e contagens de acesso', async () => {
    const consultas = [];
    const sb = carregarAdaptador((_, url, op) => { consultas.push({ url, query: op.corpo.query }); return { status: 201, dados: [{ contas: linhas }] }; });
    const r = await sb.contas();
    assert.equal(consultas.length, 1);
    assert.match(consultas[0].url, /\/database\/query\/read-only$/);
    const q = consultas[0].query;
    assert.match(q, /^\s*select/i);
    assert.ok(/auth\.sessions/.test(q) && /auth\.refresh_tokens/.test(q) && /last_sign_in_at/.test(q), 'último acesso usa sessões e tokens');
    assert.ok(!/where lower\(u\.email\)/.test(q), 'lista não filtra por e-mail');
    assert.ok(!/\b(insert|update|delete|drop|alter|grant)\b/i.test(q), 'só leitura');
    assert.equal(JSON.stringify(r).includes(PROIBIDO), false, 'colunas extras não saem');
    assert.deepEqual(r.contas.map((c) => c.email), ['an•••@example.com', 'b•••@example.org', 'c•••@example.net', 'se•••@example.com']);
    assert.ok(!JSON.stringify(r).includes('ana.souza'), 'e-mail completo não sai na lista');
    assert.deepEqual(Object.keys(r.contas[0]).sort(), ['assinatura', 'cadastro', 'email', 'emailConfirmado', 'ultimoAcesso', 'ultimoLogin']);
    assert.equal(r.busca, false);
    assert.deepEqual({ ...r.acessaram }, { ultimos7: 2, ultimos30: 3 });
    const [a, b, c, d] = r.contas;
    assert.deepEqual({ ...a.assinatura }, { origem: 'cortesia', status: 'active', comAcesso: true, acessoAte: '2099-12-31T00:00:00.000Z' });
    assert.equal(b.assinatura.comAcesso, false); assert.equal(b.assinatura.origem, 'venda'); assert.equal(b.emailConfirmado, false);
    assert.equal(c.assinatura.comAcesso, true, 'atrasada dentro da carência mantém acesso, como usuario_tem_direito');
    assert.equal(d.assinatura, null); assert.equal(d.ultimoLogin, null); assert.equal(d.ultimoAcesso, null);
  });

  await test('busca: e-mail normalizado no SQL, completo na resposta e sem contagens', async () => {
    const consultas = [];
    const sb = carregarAdaptador((_, __, op) => { consultas.push(op.corpo.query); return { status: 201, dados: [{ contas: [linhas[0]] }] }; });
    const r = await sb.contas('  Ana.Souza@Example.com ');
    assert.match(consultas[0], /where lower\(u\.email\) = 'ana\.souza@example\.com'/);
    assert.equal(r.busca, true); assert.equal(r.contas[0].email, 'ana.souza@example.com'); assert.equal(r.acessaram, null);
  });

  await test('busca recusa qualquer coisa fora de um e-mail, sem tocar no banco', async () => {
    let chamadas = 0;
    const sb = carregarAdaptador(() => { chamadas++; return { status: 201, dados: [{ contas: [] }] }; });
    for (const ruim of ["a'@b.com", "x@y.com' or '1'='1", 'a b@c.com', 'sem-arroba', 'a@b', '', 'a@b.c', `${'a'.repeat(250)}@b.com`]) {
      await assert.rejects(() => sb.contas(ruim), (e) => e.codigo === 'pedido-invalido' && e.status === 400, ruim);
    }
    assert.equal(chamadas, 0);
  });

  await test('formato inesperado vira erro de integração e falta de token vira ausente', async () => {
    const sb = carregarAdaptador(() => ({ status: 201, dados: [{ contas: 'nao-e-lista' }] }));
    await assert.rejects(() => sb.contas(), (e) => e.codigo === 'supabase-formato');
    let chamadas = 0;
    const semToken = carregarAdaptador(() => { chamadas++; return { status: 201, dados: [] }; }, { configurado: false });
    assert.equal((await semToken.contas()).status, 'ausente'); assert.equal(chamadas, 0);
  });

  await test('rota: sessão completa, só o filtro email, busca fora do cache', async () => {
    const pedidos = [];
    let sessao = null;
    const m = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(repo, 'tools/admin-local/rotas.cjs'), 'utf8'), {
      module: m, exports: m.exports, Buffer, console, Date, URL, Set, Map, __dirname: path.join(repo, 'tools/admin-local'),
      require: (id) => {
        if (id === 'path') return path;
        if (id === './config.cjs') return { RAIZ_DADOS: '.', SIMULAR: false, ocultar: String };
        if (id === './seguranca.cjs') return { checarApi: () => null, sessaoDe: () => sessao, dentroDoLimite: () => true };
        if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: 1 }) };
        if (id === './auditoria.cjs') return { registrar() {} };
        if (id === './adaptadores/supabase.cjs') return { contas: async (email) => { pedidos.push(email); return { status: 'ok', busca: email != null, contas: [] }; } };
        throw new Error('IMPORT PROIBIDO ' + id);
      },
    }, { filename: 'rotas.cjs' });
    const get = async (query) => {
      const req = Readable.from([]); req.headers = { 'x-grana-admin': '1' }; req.method = 'GET';
      const res = { headersSent: false, statusCode: 200, setHeader() {}, writeHead(status) { this.statusCode = status; this.headersSent = true; }, end(s) { this.body = JSON.parse(s); } };
      await m.exports.tratarApi(req, res, new URL('http://127.0.0.1:4317/api/supabase/contas' + query));
      return res;
    };
    assert.equal((await get('')).statusCode, 401); assert.equal(pedidos.length, 0);
    sessao = { id: 'fixture', s: { etapa: 'totp', geracao: 1 } };
    assert.equal((await get('')).statusCode, 401, 'login pela metade não lê contas'); assert.equal(pedidos.length, 0);
    sessao.s.etapa = 'ok';
    assert.equal((await get('')).statusCode, 200);
    assert.equal((await get('')).statusCode, 200);
    assert.deepEqual(pedidos, [undefined], 'lista repetida sai do cache');
    assert.equal((await get('?email=a%40b.com')).statusCode, 200);
    assert.equal((await get('?email=a%40b.com')).statusCode, 200);
    assert.deepEqual(pedidos.slice(1), ['a@b.com', 'a@b.com'], 'busca sempre vai ao banco');
    for (const q of ['?nome=ana', '?email=a%40b.com&email=c%40d.com', '?email=a%40b.com&limite=9']) assert.equal((await get(q)).statusCode, 400, q);
    assert.equal(pedidos.length, 3);
  });

  await test('tela: e-mail, datas, assinatura e busca codificada', async () => {
    const node = (tag, attrs, ...filhos) => {
      const el = { tag, attrs: attrs || {}, filhos: filhos.flat(Infinity).filter((x) => x != null && x !== false), ouvintes: {}, hidden: !!(attrs && attrs.hidden), value: '' };
      el.addEventListener = (ev, fn) => { el.ouvintes[ev] = fn; };
      el.replaceChildren = (...f) => { el.filhos = f; };
      el.appendChild = (f) => el.filhos.push(f);
      return el;
    };
    const texto = (x) => x == null ? '' : Array.isArray(x) ? x.map(texto).join(' ') : typeof x === 'object' ? [x.attrs?.texto || '', ...(x.filhos || []).map(texto)].join(' ') : String(x);
    const achar = (x, f) => !x || typeof x !== 'object' ? null : f(x) ? x : (x.filhos || []).reduce((a, c) => a || achar(c, f), null);
    const blocos = [];
    const sb = carregarAdaptador(() => ({ status: 201, dados: [{ contas: linhas }] }));
    const dto = JSON.parse(JSON.stringify(await sb.contas()));
    const ctx = {
      h: node, cabecalho: () => {}, recarregar: () => {},
      bloco: (titulo, rota, desenhar) => { blocos.push(rota); return node('section', null, titulo, desenhar(dto)); },
      cartao: (a) => node('article', null, a.titulo, a.valor, a.detalhe),
      tabela: (colunas, ls) => node('table', null, colunas.map((c) => c.titulo), ls.map((l) => node('tr', null, colunas.map((c) => c.valor(l))))),
      selo: (_s, t) => node('span', { texto: t }),
      formatar: { numero: (v) => String(v), dataHora: (v) => `DH(${v})`, data: (v) => `D(${v})` },
    };
    const raiz = node('main');
    const fonte = fs.readFileSync(path.join(repo, 'tools/admin-local/web/telas/contas.js'), 'utf8').replace('export async function montar', 'async function montar');
    const sandbox = { ctx, raiz, encodeURIComponent };
    vm.runInNewContext(fonte, sandbox);
    await vm.runInNewContext('montar(raiz, ctx)', sandbox);
    const t = texto(raiz);
    assert.deepEqual(blocos, ['/api/supabase/contas']);
    for (const esperado of ['an•••@example.com', '(e-mail não confirmado)', 'Cortesia', 'Assinatura paga vencida', 'Sem assinatura', 'nunca', 'sem registro', 'DH(2026-10-24T10:00:00.000Z)', 'Acessaram em 7 dias']) {
      assert.ok(t.includes(esperado), esperado);
    }
    assert.ok(!t.includes('ana.souza'));
    const form = achar(raiz, (x) => x.tag === 'form');
    const campo = achar(raiz, (x) => x.tag === 'input');
    campo.value = ' a+b@c.com ';
    form.attrs.onsubmit({ preventDefault() {} });
    assert.equal(blocos[1], '/api/supabase/contas?email=a%2Bb%40c.com');
    assert.equal(achar(raiz, (x) => x.tag === 'button' && x.attrs.texto === 'Ver todas').hidden, false);
  });

  console.log(`admin-local-contas: ${n} casos OK, sem rede nem banco`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
