'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const file = path.resolve(__dirname, '../tools/admin-local/adaptadores/build-acoes.cjs');
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module: mod, exports: mod.exports, process,
  require: (id) => id === '../config.cjs' ? { RAIZ: 'fixture' } : id === 'child_process' ? { execFile() { throw new Error('REAL PROCESS FORBIDDEN'); } } : require(id),
});
const { criarAcoesBuild, hashApp } = mod.exports;
const nota = 'Corrige a tela de entrada\n\nConserva a fala no aparelho\nPermite conferir a nota da build';
function fixture(opts = {}) {
  let state = opts.state ? structuredClone(opts.state) : null;
  const calls = []; let releases = { status: 'ok', linha: { version: '1.10.7', notes: 'nota truncada' } };
  const deps = {
    ler: () => state && structuredClone(state), salvar: (s) => { calls.push(['salvar', s.estado]); state = structuredClone(s); },
    id: () => 'fixture-id', agora: () => '2026-10-08T16:00:00Z', versao: () => opts.versao || '1.10.7',
    simular: !!opts.simular, appSha: () => hashApp(JSON.stringify({ expo: { version: '1.10.7' } })),
    git: async (args) => {
      calls.push(['git', ...args]);
      if (opts.gitFail && args[0] === opts.gitFail) throw new Error('git offline');
      if (args[0] === 'rev-list') return opts.atras ? '1' : '0';
      if (args[0] === 'diff') return opts.stage ? 'lib/outro.ts' : '';
      if (args[0] === 'log') return args.includes('origin/main..HEAD') ? (opts.estrangeiro || opts.unpublished ? 'foreign\n' : '') + (state?.estado === 'push-falhou' ? 'own' : '') : 'own';
      if (args[0] === 'show') return JSON.stringify({ expo: { version: args[1] === 'HEAD:app.json' ? '1.10.6' : opts.remota || '1.10.7' } });
      if (args[0] === 'status') return opts.sujo ? ' M other.ts' : '';
      return '';
    },
    preparar: async (p) => { calls.push(['preparar', p.mensagem]); return opts.bloqueado ? { ok: false, codigo: 'preparar-bloqueado' } : { ok: true, dados: { simulado: false } }; },
    cli: () => opts.semCli ? null : '/fixture/eas/run', pacoteSeguro: () => !opts.inseguro,
    eas: async (cli, args) => { calls.push(['eas', cli, ...args]); if (opts.easpende) await opts.easpende; if (opts.easthrow) throw new Error('timeout'); return { codigo: opts.easFail ? -1 : 0 }; },
    release: async () => { calls.push(['release']); return releases; },
    regravar: async (versao, antes, aprovada) => { calls.push(['regravar', versao, antes, aprovada]); releases.linha.notes = aprovada; },
  };
  return { calls, deps, api: criarAcoesBuild(deps), state: () => state, restart: () => criarAcoesBuild(deps) };
}
let passed = 0;
async function check(name, fn) { await fn(); console.log('OK ' + name); passed++; }
const pedido = { confirmacao: 'PREPARAR BUILD', tipo: 'patch', mensagem: nota };
const enviado = { id: 'fixture-id', versao: '1.10.7', nota, commit: 'own', estado: 'enviado' };
const disparo = { confirmacao: 'DISPARAR BUILD', preparoId: 'fixture-id' };
(async () => {
  await check('frases no servidor; nenhum processo no ensaio', async () => {
    const f = fixture({ simular: true }); assert.equal((await f.api.preparar({ ...pedido, confirmacao: 'sim' })).ok, false);
    assert.equal((await f.api.preparar(pedido)).dados.simulado, true); assert.equal(f.calls.length, 0);
  });
  await check('preparo bloqueado, remoto atrasado ou stage de outro: nao commita nem builda', async () => {
    for (const opts of [{ bloqueado: true }, { atras: true }, { stage: true }, { gitFail: 'fetch' }]) {
      const f = fixture(opts); assert.equal((await f.api.preparar(pedido)).ok, false);
      assert(!f.calls.some((c) => c[0] === 'eas' || c[1] === 'commit' || c[1] === 'push'));
    }
  });
  await check('commit por caminho, fetch/log antes push, sem outros arquivos', async () => {
    const f = fixture(); const r = await f.api.preparar(pedido); assert.equal(r.ok, true); assert.equal(f.state().estado, 'preparado');
    const git = f.calls.filter((c) => c[0] === 'git');
    assert.deepEqual(Array.from(git.find((c) => c[1] === 'add')), ['git', 'add', '--', 'app.json']);
    assert(git.find((c) => c[1] === 'commit').includes('--only'));
    const push = git.findIndex((c) => c[1] === 'push'); assert(git.slice(0, push).some((c) => c.includes('origin/main..HEAD')));
    assert(!f.calls.some((c) => c[0] === 'eas'));
  });
  await check('commit estrangeiro ou push recusado: recibo e nao publica outros', async () => {
    for (const opts of [{ estrangeiro: true }, { gitFail: 'push' }]) {
      const f = fixture(opts); const r = await f.api.preparar(pedido); assert.equal(r.codigo, 'preparo-nao-publicado');
      assert.equal(f.state().estado, 'push-falhou'); assert(!f.calls.some((c) => c[0] === 'eas'));
      if (opts.estrangeiro) assert(!f.calls.some((c) => c[1] === 'push'));
    }
  });
  await check('disparo exige frase, preparo publicado, versao igual, git limpo e pacote seguro', async () => {
    for (const opts of [{ unpublished: true }, { semCli: true }, { remota: '1.10.8' }, { sujo: true }, { inseguro: true }, { gitFail: 'merge-base' }]) {
      const f = fixture({ ...opts, state: { ...enviado, estado: 'preparado' } }); assert.equal((await f.api.disparar(disparo)).ok, false); assert(!f.calls.some((c) => c[0] === 'eas'));
    }
    const f = fixture({ state: { ...enviado, estado: 'preparado' } }); assert.equal((await f.api.disparar({ ...disparo, confirmacao: 'sim' })).ok, false);
  });
  await check('nota multiline como unico argumento, flags fixas e idempotencia apos restart', async () => {
    const f = fixture({ state: { ...enviado, estado: 'preparado' } }); assert.equal((await f.api.disparar(disparo)).ok, true);
    const c = f.calls.find((c) => c[0] === 'eas'); assert.equal(c[c.indexOf('--message') + 1], nota);
    assert(c.includes('--non-interactive')); assert(c.includes('--no-wait'));
    assert.equal((await f.restart().disparar(disparo)).ok, false); assert.equal(f.calls.filter((c) => c[0] === 'eas').length, 1);
    assert(f.calls.findIndex((c) => c[0] === 'salvar' && c[1] === 'disparando') < f.calls.findIndex((c) => c[0] === 'eas'));
  });
  await check('falha/timeout EAS nao vira reenviavel', async () => {
    for (const opts of [{ easFail: true }, { easthrow: true }]) {
      const f = fixture({ ...opts, state: { ...enviado, estado: 'preparado' } }); assert.equal((await f.api.disparar(disparo)).codigo, 'resultado-desconhecido');
      assert.equal(f.state().estado, 'desconhecido'); assert.equal((await f.restart().disparar(disparo)).ok, false);
    }
  });
  await check('clique simultaneo nao dispara duas builds', async () => {
    let release; const wait = new Promise((r) => { release = r; });
    const f = fixture({ easpende: wait, state: { ...enviado, estado: 'preparado' } }); const first = f.api.disparar(disparo);
    await Promise.resolve(); assert.equal((await f.api.disparar(disparo)).codigo, 'build-em-andamento'); release(); assert.equal((await first).ok, true);
    assert.equal(f.calls.filter((c) => c[0] === 'eas').length, 1);
  });
  await check('nota divergente: escrita fixa CAS e repetir nao regrava', async () => {
    const f = fixture({ state: enviado }); assert.equal((await f.api.verificar(disparo)).dados.estado, 'nota-divergente');
    assert.equal((await f.api.regravar({ ...disparo, confirmacao: 'REGRAVAR NOTA' })).dados.estado, 'nota-confirmada');
    await f.api.regravar({ ...disparo, confirmacao: 'REGRAVAR NOTA' }); assert.equal(f.calls.filter((c) => c[0] === 'regravar').length, 1);
    const c = f.calls.find((c) => c[0] === 'regravar'); assert.equal(c[1], '1.10.7'); assert.equal(c[2], 'nota truncada'); assert.equal(c[3], nota);
  });
  await check('adaptador EAS real chama script sem shell e preserva nota longa/multiline', async () => {
    const childCalls = []; let wired;
    const fakeFs = { readdirSync: () => ['fixture'], existsSync: () => true, readFileSync: (p) => String(p).endsWith('app.json') ? '{"expo":{"version":"1.10.6"}}' : '{"version":"1.0.0"}' };
    const m = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../tools/admin-local/adaptadores/eas.cjs'), 'utf8'), {
      module: m, exports: m.exports, process, console, Date,
      require: (id) => {
        if (id === 'fs') return fakeFs;
        if (id === '../config.cjs') return { RAIZ: '/fixture', SIMULAR: false };
        if (id === './git-local.cjs') return { datasDosPreparos: () => [] };
        if (id.endsWith('teto-de-builds.ts')) return { situacaoDoTeto: () => ({ feitos: 0, teto: 3, podePreparar: true, zeraEm: new Date(), daSemana: [] }) };
        if (id === './build-acoes.cjs') return { persistencia: () => ({}), gitReal() {}, criarAcoesBuild: (d) => { wired = d; return { estado: () => ({ id: 'fixture-id', estado: 'preparado' }) }; } };
        if (id === 'child_process') return { execFileSync: () => '{"expo":{"version":"1.10.6"}}', execFile: (exe, args, options, done) => { childCalls.push({ exe, args, options }); done(null, 'OK', ''); } };
        return require(id);
      },
    });
    const long = nota + '\n' + 'Conserva a fala no aparelho. '.repeat(30);
    const r = await wired.preparar({ tipo: 'patch', mensagem: long }); assert.equal(r.ok, true);
    assert.equal(childCalls.length, 1); assert.equal(childCalls[0].exe, process.execPath);
    assert(childCalls[0].args.some((a) => a.endsWith('preparar-lancamento.ts')));
    assert.equal(childCalls[0].args.at(-1), long.trim()); assert.equal(childCalls[0].options.shell, false);
    const view = await m.exports.builds(); assert.equal(view.preparoPersistido.id, 'fixture-id');
  });
  await check('rotas reais barram falta de step-up e frase antes do adaptador', async () => {
    const { EventEmitter } = require('node:events');
    function routes(step) {
      const calls = []; const m = { exports: {} };
      const seg = { checarApi: () => null, dentroDoLimite: () => true, sessaoDe: () => ({ id: 'fixture', s: { etapa: 'ok', geracao: 'g' } }), stepUpValido: () => step, checarCabecalhos: () => null };
      vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../tools/admin-local/rotas.cjs'), 'utf8'), { module: m, exports: m.exports, Buffer, console, Date,
        require: (id) => {
          if (id === './config.cjs') return { RAIZ_DADOS: '/fixture', SIMULAR: false, ocultar: (v) => v };
          if (id === './seguranca.cjs') return seg;
          if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: 'g' }) };
          if (id === './auditoria.cjs') return { registrar() {} };
          if (id === './adaptadores/eas.cjs') return { dispararBuild: async (p) => { calls.push(p); return { ok: true, dados: { simulado: true } }; } };
          return require(id);
        },
      });
      return { calls, request: async (body) => {
        const req = new EventEmitter(); req.method = 'POST'; req.headers = { 'x-grana-admin': '1' };
        let output; const res = { writeHead: (status) => { res.statusCode = status; }, end: (s) => { output = JSON.parse(s); } };
        const p = m.exports.tratarApi(req, res, new URL('http://127.0.0.1:4317/api/eas/disparar-build'));
        req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); await p; return { status: res.statusCode, output };
      } };
    }
    const denied = routes(false); assert.equal((await denied.request(disparo)).status, 403); assert.equal(denied.calls.length, 0);
    const allowed = routes(true); assert.equal((await allowed.request({ ...disparo, confirmacao: 'sim' })).status, 400); assert.equal(allowed.calls.length, 0);
    assert.equal((await allowed.request(disparo)).status, 200); assert.equal(allowed.calls.length, 1); assert.equal(allowed.calls[0].confirmacao, 'DISPARAR BUILD');
  });
  await check('falha de release tem recibo; nao vira aguardando anuncio', async () => {
    const f = fixture({ state: enviado }); f.deps.release = async () => ({ status: 'erro' });
    assert.equal((await f.api.verificar(disparo)).codigo, 'nota-indisponivel');
    f.deps.release = async () => { throw new Error('offline'); };
    assert.equal((await f.api.verificar(disparo)).status, 503);
    assert.equal(f.calls.filter((c) => c[0] === 'regravar').length, 0);
  });
  await check('Supabase real: regrava apenas id1/versao/nota anterior com literal escapado', async () => {
    const calls = []; const m = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../tools/admin-local/adaptadores/supabase.cjs'), 'utf8'), { module: m, exports: m.exports, Date, console,
      require: (id) => {
        if (id === '../config.cjs') return { RAIZ: '/fixture', ler: () => 'fixture-token', tem: () => true, refSupabase: () => 'fixture' };
        if (id === './_http.cjs') return { ErroIntegracao: Error, pedirJson: async (...args) => { calls.push(args); return { status: 201, dados: [{ version: '1.10.7' }] }; } };
        if (id === './git-local.cjs' || id === './recibos-funcoes.cjs') return {};
        return require(id);
      },
    });
    await m.exports.regravarNotaRelease('1.10.7', "Antes d'?gua", "Corrige d'?gua\nSegunda linha");
    assert.equal(calls.length, 1); const query = calls[0][2].corpo.query;
    assert(query.startsWith('update public.app_release set notes='));
    assert(query.includes("where id=1 and version='1.10.7' and notes='Antes d''?gua' returning version"));
    assert(query.includes("Corrige d''?gua\nSegunda linha"));
    await assert.rejects(() => m.exports.regravarNotaRelease('arbitrario', '', '')); assert.equal(calls.length, 1);
  });
  await check('B1 commit falha: retoma a mesma versao, sem novo preparo', async () => {
    const f = fixture({ gitFail: 'commit' }); assert.equal((await f.api.preparar(pedido)).ok, false); assert.equal(f.state().estado, 'commit-falhou');
    assert.equal((await f.api.preparar(pedido)).codigo, 'preparo-pendente');
    const baseGit = f.deps.git;
    f.deps.git = async (args) => args[0] === 'commit' ? '' : baseGit(args);
    assert.equal((await f.api.retomar({ preparoId: 'fixture-id', confirmacao: 'PUBLICAR PREPARO' })).ok, true);
    assert.equal(f.calls.filter((c) => c[0] === 'preparar').length, 1); assert.equal(f.state().estado, 'preparado');
  });
  await check('B2 desconhecido: anuncio confirma; conferencia manual libera sem build', async () => {
    const f = fixture({ state: { ...enviado, estado: 'desconhecido' } }); await f.api.verificar(disparo); assert.equal(f.state().estado, 'enviado');
    const manual = fixture({ state: { ...enviado, estado: 'desconhecido' } });
    assert.equal((await manual.api.resolver({ ...disparo, confirmacao: 'sim' })).ok, false);
    assert.equal((await manual.api.resolver({ ...disparo, confirmacao: 'CONFERI NO EAS: NAO SAIU' })).ok, true);
    assert.equal(manual.state().estado, 'preparado'); assert(!manual.calls.some((c) => c[0] === 'eas'));
  });
  console.log(`admin-build-acoes: ${passed} grupos passaram; zero processo/rede real`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
