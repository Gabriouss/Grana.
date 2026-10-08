const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compilar = (file) => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function ambiente(opcoes = {}) {
  const timers = new Map(), celulas = [], effects = [], eventos = {}, chamadas = [];
  let cursor = 0, agora = 0, serial = 0, pendente;
  const logs = [];
  const globals = {
    console: { warn: (...v) => logs.push(v) },
    crypto: { randomUUID: () => 'referencia-local' },
    Date: class extends Date { static now() { return agora; } },
    setTimeout: (f, ms) => { const id = ++serial; timers.set(id, { f, fim: agora + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    window: { addEventListener: (n, f) => eventos[n] = f, removeEventListener() {} },
    queueMicrotask,
  };
  const cache = {};
  function carregar(file, deps) {
    const exports = {};
    vm.runInNewContext(compilar(file), { ...globals, exports, require: (id) => {
      if (id in deps) return deps[id];
      throw Error('Import não simulado: ' + id);
    } }, { filename: file });
    return exports;
  }
  const session = opcoes.semSessao ? null : { user: { id: 'admin-fixture' }, access_token: 'token-ficticio' };
  const auth = {};
  let authEvent;
  auth.onAuthStateChange = (f) => { authEvent = f; return { data: { subscription: { unsubscribe() {} } } }; };
  for (const nome of ['getSession', 'signInWithPassword', 'signOut', 'listFactors', 'enroll', 'unenroll', 'challenge', 'verify']) {
    auth[nome] = async (...args) => {
      chamadas.push({ nome, args });
      if (opcoes.pendurado === nome) return new Promise((resolve) => pendente = resolve);
      if (opcoes.erro === nome) return { data: null, error: { message: 'SEGREDO-NAO-ECOAR' } };
      if (nome === 'getSession') return { data: { session }, error: null };
      if (nome === 'listFactors') return { data: { totp: opcoes.cadastro ? [] : [{ id: 'f', status: 'verified' }], all: opcoes.incompleto ? [{ id: 'velho', factor_type: 'totp', status: 'unverified', friendly_name: 'Grana Admin' }] : [] }, error: null };
      if (nome === 'enroll') return { data: { id: 'f', totp: { qr_code: '<svg/>', secret: 'SEGREDO-TOTP-FICTICIO' } }, error: null };
      if (nome === 'challenge') return { data: { id: 'desafio' }, error: null };
      return { data: {}, error: null };
    };
  }
  const supabase = { auth: { ...auth, mfa: auth } };
  const client = carregar('lib/admin-web.ts', { './supabase': { supabase } });
  const deadline = carregar('lib/admin-auth-web.ts', { './admin-web': client });
  const consultarAdmin = async (recurso) => {
    chamadas.push({ nome: recurso });
    if (opcoes.limite) throw new client.ErroAdmin('limite', 'Muitas consultas.', 'fixture');
    return { ok: true, contrato: 1, geradoEm: '2026-10-08T12:00:00Z', dados: recurso === 'acesso' ? opcoes.naoAdmin ? { admin: false } : { admin: true, aal: opcoes.pronto ? 'aal2' : 'aal1', totp: 'verificado' } : { fixture: true } };
  };
  const React = {
    useState: (v) => { const i = cursor++; if (!(i in celulas)) celulas[i] = v; return [celulas[i], (x) => celulas[i] = typeof x === 'function' ? x(celulas[i]) : x]; },
    useRef: (v) => { const i = cursor++; return celulas[i] ??= { current: v }; },
    useCallback: (f) => f,
    useEffect: (f) => { const i = cursor++; if (!celulas[i]) { celulas[i] = true; effects.push(f); } },
  };
  const jsx = (type, props) => ({ type, props });
  const page = carregar('components/admin/PainelAdmin.web.tsx', {
    react: React, 'react/jsx-runtime': { jsx, jsxs: jsx }, '@/lib/supabase': { supabase },
    '@/lib/admin-web': { ...client, consultarAdmin }, '@/lib/admin-auth-web': deadline,
    './AdminVisual.web': { default: () => {} },
  });
  return {
    render() { cursor = 0; return page.default().props; },
    async iniciar() { this.render(); effects.forEach((f) => f()); await tick(); return this.render(); },
    async expirar() { agora = 15001; for (const [id, t] of timers) { if (t.fim <= agora) { timers.delete(id); t.f(); } } await tick(); },
    async resolverTarde(data) { pendente?.(data); await tick(); },
    chamadas, logs, eventos, authEvent: (...v) => authEvent(...v), timers,
  };
}

(async () => {
  for (const pendurado of ['getSession', 'listFactors', 'enroll', 'unenroll']) {
    const a = ambiente({ pendurado, cadastro: ['enroll', 'unenroll'].includes(pendurado), incompleto: pendurado === 'unenroll' });
    let p = await a.iniciar(); assert.equal(p.etapa, 'carregando');
    await a.expirar(); p = a.render(); assert.equal(p.etapa, 'erro', pendurado); assert.equal(p.erro.codigo, 'prazo');
    const antes = a.chamadas.length;
    await a.resolverTarde({ data: { session: { user: { id: 'x' } }, all: [], totp: [], id: 'f', totp: { qr_code: '<svg/>', secret: 'TARDIO' } }, error: null });
    assert.equal(a.render().etapa, 'erro'); assert.equal(a.chamadas.length, antes, 'não avança após resposta tardia');
  }
  for (const pendurado of ['signInWithPassword', 'challenge', 'verify', 'signOut']) {
    const a = ambiente({ pendurado, semSessao: pendurado === 'signInWithPassword' });
    let p = await a.iniciar(); p.onCodigoChange('123456'); p = a.render();
    const evt = { preventDefault() {} };
    const tarefa = pendurado === 'signInWithPassword' ? p.onEntrar(evt) : pendurado === 'signOut' ? p.onSair() : p.onVerificar(evt);
    await tick(); assert.equal(a.render().ocupado, true);
    await a.expirar(); await tarefa; p = a.render();
    assert.equal(p.ocupado, false); assert.equal(p.erro.codigo, 'prazo', pendurado); assert.equal(p.resumo, null);
    const antes = a.chamadas.length; await a.resolverTarde({ data: { id: 'tardio' }, error: null });
    assert.equal(a.chamadas.length, antes); assert.equal(a.render().resumo, null);
  }
  {
    const a = ambiente({ pronto: true }); let p = await a.iniciar(); assert.equal(p.etapa, 'pronto');
    a.eventos.pagehide(); assert.equal(a.render().resumo, null); assert.equal(a.render().fator, null);
    a.authEvent('SIGNED_OUT'); p = a.render(); assert.equal(p.etapa, 'sem-sessao'); assert.equal(p.resumo, null);
  }
  for (const opcoes of [{ naoAdmin: true }, { limite: true }, { erro: 'listFactors' }]) {
    const a = ambiente(opcoes); const p = await a.iniciar();
    assert.equal(p.resumo, null);
    assert.equal(p.etapa, opcoes.naoAdmin ? 'nao-admin' : opcoes.limite ? 'limite' : 'erro');
    assert.ok(!JSON.stringify(a.logs).includes('SEGREDO'));
  }
  console.log('admin-web-fluxos: 8 prazos Auth/MFA, resposta tardia, saída, acesso e recibos OK');
})().catch((e) => { console.error(e); process.exitCode = 1; });
