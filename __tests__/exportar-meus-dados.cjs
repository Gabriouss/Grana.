'use strict';
// Módulos reais, inclusive leitor padrão e paginação; nenhum dado/serviço real.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar(opcoes = {}) {
  const ctx = {
    sessao: { user: { id: 'conta-A' }, access_token: 'token-fixture-A' },
    usuario: { id: 'conta-A', email: 'confirmado@invalid.test' },
    acesso: { allowed: true, enforced: true, access_until: '2026-11-01T00:00:00Z', status: 'active' },
    agora: Date.parse('2026-10-25T15:00:00Z'), chamadas: [], rpcs: [], usuarios: [], logs: [],
    efeitos: { blob: 0, url: 0, link: 0, click: 0, file: 0, create: 0, write: 0, delete: 0, share: 0 },
    desinscricoes: 0, disponivel: true,
  };
  class Clock extends Date {
    constructor(...a) { super(...(a.length ? a : [ctx.agora])); }
    static now() { return ctx.agora; }
  }
  const promessavel = (pedido, resolver) => ({
    setHeader(nome, valor) { assert.equal(nome, 'Authorization'); assert.equal(valor, 'Bearer token-fixture-A', 'HTTP fica fixo no token confirmado'); pedido.tokenFixo = true; return this; },
    then(a, b) { assert.equal(pedido.tokenFixo, true); return Promise.resolve().then(resolver).then(a, b); },
  });
  const supabase = {
    auth: {
      getSession: async () => { await opcoes.onSessao?.(ctx); return { data: { session: ctx.sessao }, error: null }; },
      getUser: async token => { assert.equal(token, 'token-fixture-A'); ctx.usuarios.push(true); await opcoes.onUser?.(ctx); return { data: { user: ctx.usuario }, error: ctx.erroUser ?? null }; },
      onAuthStateChange: fn => { ctx.ouvinte = fn; return { data: { subscription: { unsubscribe: () => { ctx.desinscricoes++; ctx.ouvinte = null; } } } }; },
    },
    rpc(nome) {
      assert.equal(nome, 'obter_estado_acesso'); const pedido = { nome };
      return promessavel(pedido, async () => { ctx.rpcs.push(pedido); await opcoes.onRpc?.(ctx); return { data: ctx.acesso, error: ctx.erroRpc ?? null }; });
    },
    from(tabela) {
      const pedido = { tabela };
      const q = promessavel(pedido, async () => {
        assert.equal(pedido.select, '*'); assert.equal(pedido.filtro, 'user_id'); assert.equal(pedido.dono, 'conta-A');
        assert.equal(pedido.ordem, tabela === 'user_gamification' ? 'user_id' : tabela === 'user_achievements' ? 'badge_id' : 'id');
        assert.equal(pedido.asc, true); assert.equal(pedido.ate, pedido.de + 999);
        ctx.chamadas.push(pedido);
        const n = (opcoes.linhas ?? {})[tabela] ?? 0;
        const data = Array.from({ length: Math.max(0, Math.min(1000, n - pedido.de)) }, (_, i) => ({
          id: `${tabela}-${pedido.de + i}`, user_id: 'conta-A', badge_id: `badge-${pedido.de + i}`,
        }));
        const resposta = { data, error: null };
        await opcoes.onPagina?.(ctx, pedido, resposta);
        return resposta;
      });
      q.select = valor => { pedido.select = valor; return q; };
      q.eq = (k, v) => { pedido.filtro = k; pedido.dono = v; return q; };
      q.order = (k, o) => { pedido.ordem = k; pedido.asc = o.ascending; return q; };
      q.range = (de, ate) => { pedido.de = de; pedido.ate = ate; return q; };
      return q;
    },
  };
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const m = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      module: m, exports: m.exports, Date: Clock, setTimeout: () => 0,
      console: { warn: (...a) => ctx.logs.push(a) },
      Blob: class { constructor() { ctx.efeitos.blob++; } },
      URL: { createObjectURL: () => { ctx.efeitos.url++; return 'blob:fixture'; }, revokeObjectURL() {} },
      document: { createElement() { ctx.efeitos.link++; return { click() { ctx.efeitos.click++; } }; } },
      require(nome) {
        if (nome === 'react-native') return { Platform: { OS: opcoes.plataforma ?? 'web' } };
        if (nome === './supabase') return { supabase };
        if (nome === './paginacao') return load('lib/paginacao.ts');
        if (nome === 'expo-file-system') { opcoes.onModulo?.(ctx); return { Paths: { cache: 'cache' }, File: class {
          constructor() { ctx.efeitos.file++; this.uri = 'cache/fixture'; this.exists = false; }
          create() { ctx.efeitos.create++; } write() { ctx.efeitos.write++; } delete() { ctx.efeitos.delete++; }
        } }; }
        if (nome === 'expo-sharing') return {
          isAvailableAsync: async () => { await opcoes.onDisponibilidade?.(ctx); return ctx.disponivel; },
          shareAsync: async () => { ctx.efeitos.share++; },
        };
        throw Error(`import não dublado: ${nome}`);
      },
    }, { filename: file });
    return cache[file] = m.exports;
  }
  ctx.mudarSessao = (sessao) => { ctx.sessao = sessao; ctx.ouvinte?.('SIGNED_OUT', sessao); };
  return Object.assign(ctx, { modulo: load('lib/exportar-meus-dados.ts') });
}

let checks = 0;
const ok = (v, n) => { assert.ok(v, n); checks++; };
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; };
const puro = v => JSON.parse(JSON.stringify(v));
async function aborta(c, codigo, opcoes) {
  await assert.rejects(c.modulo.exportarMeusDados(opcoes), e => e.codigo === codigo); checks++;
  ok(Object.values(c.efeitos).every(n => n === 0), 'aborto não pode produzir Blob/File/share/link');
  ok(c.logs.length > 0, 'falha deixa recibo sem payload');
  eq(c.desinscricoes, c.ouvinte ? 0 : (codigo === 'sessao-ausente' ? 0 : 1));
}

async function main() {
  for (const n of [0, 1000, 1001, 2000]) {
    const c = carregar({ linhas: { transactions: n, user_gamification: 1, user_achievements: 1001 } });
    const e = await c.modulo.montarExportacao({ agora: new Date('2026-10-25T15:00:00Z'), conta: { id: 'conta-A', email: 'rotulo-arbitrario@invalid.test' } });
    const corpo = JSON.parse(e.conteudo);
    eq(e.contagem.transactions, n);
    eq(new Set(corpo.dados.transactions.map(x => x.id)).size, n, 'não perde/duplica na fronteira');
    eq(c.chamadas.filter(p => p.tabela === 'transactions').length, Math.floor(n / 1000) + 1);
    eq(e.contagem.user_achievements, 1001);
    eq(c.chamadas.filter(p => p.tabela === 'user_gamification').length, 1);
    eq(corpo.conta.email, 'confirmado@invalid.test', 'rótulo arbitrário nunca identifica a conta exportada');
    eq(e.parcial, true); ok(e.nomeArquivo.includes('-parcial-'));
    eq(corpo.observacoes.copia, 'parcial'); ok(corpo.observacoes.consistencia.includes('não é um snapshot atômico'));
    eq(c.chamadas.some(p => p.tabela === 'feedbacks'), false, 'vazio por RLS não é ausência de feedbacks');
    eq(corpo.dados.feedbacks, undefined); eq(e.contagem.feedbacks, undefined);
    eq(puro(e.indisponiveis).map(i => [i.tabela, i.tipo]), [['feedbacks', 'permanente']]);
    ok(e.indisponiveis[0].motivo.includes('suporte')); eq(c.desinscricoes, 1);
  }
  {
    const c = carregar({ linhas: { transactions: 1001 }, onPagina(_c, p, r) {
      if (p.tabela === 'transactions' && p.de === 1000) r.error = { message: 'Network request failed: PRIVADO', code: '08006' };
      if (p.tabela === 'wallets') r.error = { message: 'PRIVADO', code: '42P01' };
    } });
    const e = await c.modulo.montarExportacao(); const corpo = JSON.parse(e.conteudo);
    eq(corpo.dados.transactions, undefined, 'falha na página 2 descarta toda a tabela, não só a página');
    eq(e.contagem.transactions, undefined); eq(corpo.dados.wallets, undefined);
    eq(e.indisponiveis.find(i => i.tabela === 'transactions').tipo, 'temporaria');
    eq(e.indisponiveis.find(i => i.tabela === 'wallets').tipo, 'permanente');
    ok(!e.conteudo.includes('PRIVADO')); ok(!JSON.stringify(c.logs).includes('PRIVADO'));
    ok(Object.hasOwn(corpo.dados, 'subscriptions'), 'falha local permite partes independentes');
  }
  for (const plataforma of ['web', 'android']) {
    let c = carregar({ plataforma }); c.sessao = null; await aborta(c, 'sessao-ausente'); eq(c.chamadas.length, 0);
    c = carregar({ plataforma }); c.usuario = null; await aborta(c, 'sessao-nao-confirmada'); eq(c.chamadas.length, 0);
    c = carregar({ plataforma }); await aborta(c, 'conta-divergente', { conta: { id: 'conta-B', email: null } }); eq(c.chamadas.length, 0);
    c = carregar({ plataforma }); c.usuario.id = 'conta-B'; await aborta(c, 'conta-divergente');
    c = carregar({ plataforma }); c.acesso.allowed = false; await aborta(c, 'acesso-negado'); eq(c.chamadas.length, 0);
    c = carregar({ plataforma }); c.acesso.access_until = '2026-10-24T15:00:00Z'; await aborta(c, 'acesso-negado');
    c = carregar({ plataforma, onPagina(ctx) { ctx.agora = Date.parse('2026-11-02T15:00:00Z'); } }); await aborta(c, 'acesso-negado'); eq(c.chamadas.length, 1);
    c = carregar({ plataforma, onPagina(ctx) { ctx.acesso.allowed = false; } }); await aborta(c, 'acesso-negado'); eq(c.chamadas.length, 1);
    c = carregar({ plataforma, onPagina(ctx) { ctx.mudarSessao({ user: { id: 'conta-B' }, access_token: 'token-fixture-B' }); } }); await aborta(c, 'sessao-alterada'); eq(c.chamadas.length, 1);
    c = carregar({ plataforma, onPagina(ctx) { const original = ctx.sessao; ctx.mudarSessao(null); ctx.mudarSessao(original); } }); await aborta(c, 'sessao-alterada');
    c = carregar({ plataforma, onPagina(ctx) { ctx.mudarSessao({ user: { id: 'conta-A' }, access_token: 'token-renovado-fixture' }); } }); await aborta(c, 'sessao-alterada');
    c = carregar({ plataforma, onPagina(_ctx, _p, r) { r.data = [{ user_id: 'conta-B' }]; } }); await aborta(c, 'dono-divergente');
    for (const error of [{ code: '42501' }, { code: 'PGRST301' }, { code: 'PGRST300' }, { code: '28000' }, { status: 401 }, { status: 403 }]) {
      c = carregar({ plataforma, onPagina(_ctx, _p, r) { r.error = error; } });
      await aborta(c, error.code?.startsWith('PGRST30') || error.code === '28000' || error.status === 401 ? 'sessao-nao-confirmada' : 'acesso-negado'); eq(c.chamadas.length, 1);
    }
    c = carregar({ plataforma, onRpc(ctx) { if (ctx.rpcs.length === 2) ctx.erroRpc = { code: '08006', message: 'Network failed' }; } }); await aborta(c, 'acesso-nao-confirmado');
    c = carregar({ plataforma, onRpc(ctx) { if (ctx.rpcs.length === 2) throw Error('Network failed'); } }); await aborta(c, 'acesso-nao-confirmado'); eq(c.chamadas.length, 1, 'rejeição da guarda nunca vira falha local de tabela');
    c = carregar({ plataforma, onPagina(ctx) { ctx.falharProximaSessao = true; }, onSessao(ctx) {
      if (ctx.falharProximaSessao) { ctx.falharProximaSessao = false; throw Error('Network failed'); }
    } }); await aborta(c, 'sessao-nao-confirmada'); eq(c.chamadas.length, 1, 'rejeição da sessão nunca é capturada como tabela indisponível');
    c = carregar({ plataforma, onUser(ctx) { if (ctx.usuarios.length === 2) ctx.mudarSessao(null); } }); await aborta(c, 'sessao-alterada');
    c = carregar({ plataforma, onUser(ctx) { if (ctx.usuarios.length === 3) ctx.acesso.allowed = false; } }); await aborta(c, 'acesso-negado');
    c = carregar({ plataforma }); const e = await c.modulo.exportarMeusDados(); eq(e.compartilhado, true); eq(e.parcial, true); eq(c.desinscricoes, 1);
    eq(c.efeitos[plataforma === 'web' ? 'click' : 'share'], 1);
  }
  for (const alterar of ['modulo', 'disponibilidade']) {
    const c = carregar({ plataforma: 'android', [alterar === 'modulo' ? 'onModulo' : 'onDisponibilidade']: ctx => ctx.mudarSessao(null) });
    await aborta(c, 'sessao-alterada');
  }
  const c = carregar({ plataforma: 'android' }); c.disponivel = false;
  const e = await c.modulo.exportarMeusDados(); eq(e.compartilhado, false); eq(c.efeitos.write, 1); eq(c.efeitos.share, 0);
  console.log(JSON.stringify({ suite: 'exportar-meus-dados-modulo-real-leitor-padrao', checks }));
}
module.exports = { carregar };
if (require.main === module) main().then(() => require('./exportar-meus-dados-botao.cjs').main()).catch(e => { console.error(e); process.exitCode = 1; });
