/* Sobra do mês anterior confirmada pela pessoa (Adendo 2 do autor, 07/11/2026).
 * Executa o módulo REAL lib/sobra-do-mes.ts com dublê do Supabase e confere
 * QUAIS chamadas acontecem: a sobra só entra no Livre quando a pessoa
 * confirmou, a tabela ainda não aplicada vira "desligada" (zero e sem
 * pergunta), e qualquer outro erro sobe para virar recibo na tela. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

let resposta = { data: null, error: null };
let usuario = 'u-1';
const chamadas = [];
const supabase = {
  from(tabela) {
    const q = {
      select(c) { chamadas.push(['select', tabela, c]); return q; },
      eq(k, v) { chamadas.push(['eq', k, v]); return q; },
      maybeSingle: async () => resposta,
      upsert: async (linha, op) => { chamadas.push(['upsert', tabela, linha, op]); return { error: resposta.error }; },
    };
    return q;
  },
};
const m = new Module(path.join(root, 'lib/sobra-do-mes.ts'), module);
m.require = (id) => {
  if (id === './supabase') return { supabase };
  if (id === './sessao-offline') return { idDoUsuarioLocal: async () => usuario };
  throw Error('Import inesperado: ' + id);
};
m._compile(ts.transpileModule(fs.readFileSync(m.id, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, m.id);
const s = m.exports;
let n = 0; const ok = (c, r) => { assert.ok(c, r); n++; };
const avisos = []; const avisoReal = console.warn; console.warn = (...a) => avisos.push(a.join(' '));

(async () => {
  resposta = { data: null, error: null };
  const pend = await s.buscarSobraDoMes('2026-11');
  ok(pend.estado === 'pendente' && s.sobraParaOLivre(pend) === 0, 'sem linha: pendente e zero');
  ok(JSON.stringify(chamadas.slice(0, 2)) === JSON.stringify([['select', 'sobra_do_mes', 'valor'], ['eq', 'mes', '2026-11']]), 'lê só o mês pedido');

  resposta = { data: { valor: '812.40' }, error: null };
  const conf = await s.buscarSobraDoMes('2026-11');
  ok(conf.estado === 'confirmada' && s.sobraParaOLivre(conf) === 812.4, 'confirmada entra com o valor');

  for (const code of ['PGRST205', '42P01']) {
    resposta = { data: null, error: { code } };
    const desl = await s.buscarSobraDoMes('2026-11');
    ok(desl.estado === 'desligada' && s.sobraParaOLivre(desl) === 0, `tabela ausente (${code}): desligada e zero`);
  }
  ok(avisos.length === 2, 'tabela ausente deixa log, não silêncio');

  resposta = { data: null, error: { code: '08006', message: 'rede' } };
  await assert.rejects(() => s.buscarSobraDoMes('2026-11')); n++;
  ok(s.sobraParaOLivre(null) === 0, 'não conferida: zero');

  chamadas.length = 0; resposta = { data: null, error: null };
  await s.confirmarSobraDoMes('2026-11', 812.404);
  ok(JSON.stringify(chamadas) === JSON.stringify([['upsert', 'sobra_do_mes', { user_id: 'u-1', mes: '2026-11', valor: 812.4 }, { onConflict: 'user_id,mes' }]]), 'confirmar grava uma linha, ao centavo, por usuário e mês');
  chamadas.length = 0;
  await s.confirmarSobraDoMes('2026-11', 0);
  ok(chamadas[0][2].valor === 0, 'R$ 0 é confirmação válida');

  chamadas.length = 0;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', -1)); n++;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', NaN)); n++;
  usuario = null;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', 10)); n++;
  ok(chamadas.length === 0, 'valor inválido ou sem sessão não grava');
  usuario = 'u-1';
  resposta = { data: null, error: { code: '42501' } };
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', 10)); n++;

  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107120000_sobra_do_mes_confirmada.sql'), 'utf8');
  ok(/enable row level security/.test(migration) && /primary key \(user_id, mes\)/.test(migration), 'migration com RLS e uma linha por usuário e mês');
  ok(/valor >= 0/.test(migration) && !/grant[^;]*delete[^;]*to authenticated/.test(migration), 'sem valor negativo e sem delete pelo cliente');

  console.warn = avisoReal;
  console.log(`sobra-do-mes: ${n} checagens no módulo real`);
})().catch((e) => { console.warn = avisoReal; console.error(e); process.exit(1); });
