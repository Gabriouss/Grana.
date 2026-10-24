/*
 * Assinatura vencida com o app aberto não pode deixar as telas zeradas
 * (autor, 24/10/2026). O app pergunta de novo pelo acesso ao voltar ao
 * primeiro plano, no fim do prazo e depois de gravação recusada (42501).
 *
 *   node __tests__/vigia-acesso.cjs
 *
 * Módulo REAL (`lib/vigia-acesso.ts`), transpilado em memória. Relógio,
 * temporizador e evento de primeiro plano são dublês: afirma QUANTAS recargas
 * aconteceram e quando (regra 9), inclusive que eventos em rajada não viram laço.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const avisos = [];
const m = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('lib/vigia-acesso.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: m, Date, Math, Number, Promise, Set, console: { ...console, warn: (...a) => avisos.push(a.join(' ')) } },
);

let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };
const T0 = Date.parse('2026-10-24T12:00:00Z');
const em = (ms) => new Date(T0 + ms).toISOString();
const base = { enforced: true, allowed: true, status: 'canceled', access_until: null, grace_until: null };
const espera = () => new Promise((r) => setImmediate(r));

function montar() {
  const ctx = { agora: T0, recargas: [], timers: new Map(), seq: 0, primeiroPlano: null, desligouPP: false };
  const vigia = m.criarVigiaDoAcesso({
    recarregar: () => { ctx.recargas.push(ctx.agora); },
    ouvirPrimeiroPlano: (fn) => { ctx.primeiroPlano = fn; return () => { ctx.desligouPP = true; }; },
    agendar: (fn, ms) => { const id = ++ctx.seq; ctx.timers.set(id, { fn, ms, em: ctx.agora + ms }); return id; },
    cancelar: (id) => ctx.timers.delete(id),
    agora: () => ctx.agora,
  });
  ctx.vigia = vigia;
  ctx.avancar = (ms) => {
    ctx.agora += ms;
    for (const [id, t] of [...ctx.timers]) if (t.em <= ctx.agora) { ctx.timers.delete(id); t.fn(); }
  };
  return ctx;
}

(async () => {
  // ---- msAteFimDoAcesso: mesma regra de tem_assinatura_ativa() ----
  assert.equal(m.msAteFimDoAcesso({ ...base, access_until: em(60_000) }, T0), 62_000);
  ok('prazo dentro do alcance: dispara 2 s depois do fim');
  assert.equal(m.msAteFimDoAcesso({ ...base, status: 'past_due', access_until: em(-1000), grace_until: em(30_000) }, T0), 32_000);
  ok('past_due: vale a carência');
  assert.equal(m.msAteFimDoAcesso({ ...base, status: 'canceled', access_until: em(10_000), grace_until: em(900_000) }, T0), 12_000);
  ok('carência só conta para past_due');
  assert.equal(m.msAteFimDoAcesso({ ...base, access_until: '2099-12-31T00:00:00Z' }, T0), null);
  ok('cortesia até 2099: além do temporizador, fica para o primeiro plano');
  for (const [nome, e] of [['negado', { ...base, allowed: false, access_until: em(1000) }], ['cobrança desligada', { ...base, enforced: false, access_until: em(1000) }], ['sem data', base], ['nulo', null]]) {
    assert.equal(m.msAteFimDoAcesso(e, T0), null, nome);
  }
  ok('sem prazo a vigiar: negado, cobrança desligada, sem data, nulo');
  assert.equal(m.msAteFimDoAcesso({ ...base, access_until: em(-5000) }, T0), 2000);
  ok('prazo já passou: pergunta logo');

  // ---- respostaNegaAcesso ----
  const rest = 'https://x.supabase.co/rest/v1/transactions';
  assert.equal(m.respostaNegaAcesso(403, rest, '{"code":"42501","message":"new row violates row-level security policy"}'), true);
  assert.equal(m.respostaNegaAcesso(403, 'https://x.supabase.co/rest/v1/rpc/guardar', '{"code":"42501"}'), true);
  assert.equal(m.respostaNegaAcesso(401, rest, '{"code":"42501"}'), false);
  assert.equal(m.respostaNegaAcesso(403, 'https://x.supabase.co/auth/v1/token', '{"code":"42501"}'), false);
  assert.equal(m.respostaNegaAcesso(403, rest, '{"code":"PGRST301"}'), false);
  ok('recusa 42501 só em chamada de dados com 403');

  // ---- Primeiro plano: pergunta de novo, sem laço ----
  let c = montar();
  c.primeiroPlano(); await espera();
  assert.equal(c.recargas.length, 0, 'logo depois da consulta inicial, não repete');
  c.avancar(m.RECONSULTA_MINIMA_MS); c.primeiroPlano(); await espera();
  assert.equal(c.recargas.length, 1);
  for (let i = 0; i < 10; i++) { c.avancar(1000); c.primeiroPlano(); }
  await espera();
  assert.equal(c.recargas.length, 1, 'dez voltas em 10 s fazem uma consulta só');
  ok('voltar ao primeiro plano reconsulta, com intervalo mínimo de 60 s');

  // ---- Recusa 42501: pergunta de novo, sem laço ----
  c.avancar(m.RECONSULTA_MINIMA_MS);
  for (let i = 0; i < 5; i++) m.avisarAcessoNegado();
  await espera();
  assert.equal(c.recargas.length, 2, 'rajada de recusas faz uma consulta só');
  ok('gravação recusada reconsulta, uma vez por rajada');

  // ---- Fim do prazo com o app aberto ----
  c.vigia.acompanhar({ ...base, access_until: em(c.agora - T0 + 5 * 60_000) });
  assert.equal(c.timers.size, 1);
  c.vigia.acompanhar({ ...base, access_until: em(c.agora - T0 + 10 * 60_000) });
  assert.equal(c.timers.size, 1, 'estado novo troca o temporizador, não acumula');
  c.avancar(5 * 60_000 + 2000); await espera();
  assert.equal(c.recargas.length, 2, 'o prazo antigo foi cancelado');
  c.avancar(5 * 60_000); await espera();
  assert.equal(c.recargas.length, 3, 'no fim do prazo novo, pergunta');
  c.vigia.acompanhar({ ...base, allowed: false, access_until: em(-1) });
  assert.equal(c.timers.size, 0, 'acesso negado: nada a vigiar');
  ok('no instante do vencimento, pergunta sem esperar o primeiro plano');

  // ---- Parar desliga tudo ----
  c.vigia.acompanhar({ ...base, access_until: em(c.agora - T0 + 60_000) });
  c.vigia.parar();
  assert.equal(c.timers.size, 0); assert.equal(c.desligouPP, true);
  c.avancar(10 * 60_000); m.avisarAcessoNegado(); c.primeiroPlano(); await espera();
  assert.equal(c.recargas.length, 3, 'depois de parar, nada reconsulta');
  ok('sair da conta desliga temporizador, primeiro plano e recusa');

  // ---- Recarga que falha não derruba a vigia e deixa recibo ----
  let relogio = T0;
  const falha = m.criarVigiaDoAcesso({
    recarregar: async () => { throw Object.assign(new Error('x'), { name: 'TypeError' }); },
    ouvirPrimeiroPlano: () => () => {}, agendar: () => 1, cancelar: () => {}, agora: () => relogio,
  });
  relogio += m.RECONSULTA_MINIMA_MS;
  m.avisarAcessoNegado(); await espera(); await espera();
  assert.ok(avisos.some((a) => a.includes('reconsulta falhou')), 'falha registrada');
  falha.parar();
  ok('recarga que falha registra aviso e não quebra');

  // ---- Tela que tinha dados volta vazia: acesso caiu com o app aberto ----
  const disco = new Map();
  let leiturasDoDisco = 0;
  const cache = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('lib/cache-de-tela.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    {
      exports: cache, console, Promise, JSON, Date, Math, Array, setTimeout, clearTimeout,
      require(id) {
        if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
          getItem: async (k) => { leiturasDoDisco++; return disco.has(k) ? disco.get(k) : null; },
          setItem: async (k, v) => void disco.set(k, v),
          removeItem: async (k) => void disco.delete(k),
        } };
        if (id === './sessao-offline') return { idDoUsuarioLocal: async () => 'u1', sessaoEstaTravada: () => false };
        throw new Error('import não simulado: ' + id);
      },
    },
  );
  const noDisco = (nome) => JSON.parse(disco.get('grana:cache:tela:' + nome)).dados;
  let resposta = [{ id: 'a' }, { id: 'b' }];
  const buscarLancamentos = cache.comCacheOffline('lancamentos-vigia', async () => resposta);
  await buscarLancamentos();
  leiturasDoDisco = 0;
  resposta = [];
  await buscarLancamentos();
  assert.equal(leiturasDoDisco, 0, 'sem ouvinte, a leitura vazia não lê o disco');
  ok('sem ouvinte, leitura vazia custa o mesmo de antes');

  const v = montar();
  v.avancar(m.RECONSULTA_MINIMA_MS);
  const pararLeitura = cache.assinarLeituraEsvaziou(m.avisarAcessoNegado);
  resposta = [{ id: 'a' }];
  await buscarLancamentos(); await espera();
  assert.equal(v.recargas.length, 0, 'lista com dados não é sinal');
  resposta = [];
  await buscarLancamentos(); await espera();
  assert.equal(v.recargas.length, 1, 'vazio sobre disco cheio pergunta pelo acesso');
  assert.deepEqual(noDisco('lancamentos-vigia'), [], 'a leitura vazia segue para o disco, como antes');
  v.avancar(m.RECONSULTA_MINIMA_MS);
  await buscarLancamentos(); await espera();
  assert.equal(v.recargas.length, 1, 'vazio sobre disco já vazio não pergunta');
  const buscarPerfil = cache.comCacheOffline('perfil-vigia', async () => ({ nome: 'AUDIT' }));
  await buscarPerfil(); await buscarPerfil(); await espera();
  assert.equal(v.recargas.length, 1, 'dado que não é lista não é sinal');
  pararLeitura();
  resposta = [{ id: 'c' }]; await buscarLancamentos();
  resposta = []; v.avancar(m.RECONSULTA_MINIMA_MS); await buscarLancamentos(); await espera();
  assert.equal(v.recargas.length, 1, 'depois de desligar, nada');
  v.vigia.parar();
  ok('tela que tinha dados e volta vazia pergunta pelo acesso, uma vez');

  console.log(`\nvigia-acesso: ${checagens} checagens, 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });
