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
/* Resposta da leitura com as colunas novas; `null` usa `resposta`. */
let respostaColunasNovas = null;
let respostaRpc = { data: { estado: 'convertida', mes: '2026-11', transaction_id: 'tx-1' }, error: null };
let usuario = 'u-1';
const chamadas = [];
const avisosDeGravacao = [];
const supabase = {
  from(tabela) {
    let colunas = '';
    const q = {
      select(c) { colunas = c; chamadas.push(['select', tabela, c]); return q; },
      eq(k, v) { chamadas.push(['eq', k, v]); return q; },
      maybeSingle: async () => (respostaColunasNovas && colunas !== 'valor' ? respostaColunasNovas : resposta),
      upsert: async (linha, op) => { chamadas.push(['upsert', tabela, linha, op]); return { error: resposta.error }; },
    };
    return q;
  },
  rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return respostaRpc; },
};
const DateReal = Date;
class DataFixa extends DateReal { constructor(...a) { super(...(a.length ? a : ['2026-11-07T12:00:00-03:00'])); } }
const m = new Module(path.join(root, 'lib/sobra-do-mes.ts'), module);
m.require = (id) => {
  if (id === './supabase') return { supabase };
  if (id === './sessao-offline') return { idDoUsuarioLocal: async () => usuario };
  if (id === './lancamentos-alterados') return { marcarLancamentosAlterados: () => avisosDeGravacao.push('lancamentos') };
  if (id === './widgets-home-events') return { notificarDadosDosWidgetsAlterados: () => avisosDeGravacao.push('widgets') };
  throw Error('Import inesperado: ' + id);
};
global.Date = DataFixa;
m._compile(ts.transpileModule(fs.readFileSync(m.id, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, m.id);
const s = m.exports;
let n = 0; const ok = (c, r) => { assert.ok(c, r); n++; };
const avisos = []; const avisoReal = console.warn; console.warn = (...a) => avisos.push(a.join(' '));

(async () => {
  resposta = { data: null, error: null };
  const pend = await s.buscarSobraDoMes('2026-11', 'u-1');
  ok(pend.estado === 'pendente' && s.sobraParaOLivre(pend, 'u-1', '2026-11') === 0, 'sem linha: pendente e zero');
  ok(JSON.stringify(chamadas.slice(0, 3)) === JSON.stringify([['select', 'sobra_do_mes', 'valor, transaction_id, convertida'], ['eq', 'mes', '2026-11'], ['eq', 'user_id', 'u-1']]), 'lê só o mês pedido, com a ligação ao lançamento');

  resposta = { data: { valor: '812.40', transaction_id: null, convertida: false }, error: null };
  const conf = await s.buscarSobraDoMes('2026-11', 'u-1');
  ok(conf.estado === 'confirmada' && s.sobraParaOLivre(conf, 'u-1', '2026-11') === 812.4, 'legada (não convertida) entra com o valor');
  ok(s.sobraPrecisaConverter(conf), 'legada com valor pede conversão');

  resposta = { data: { valor: 0, transaction_id: 'tx-9', convertida: true }, error: null };
  const lancada = await s.buscarSobraDoMes('2026-11', 'u-1');
  ok(lancada.estado === 'confirmada' && lancada.transactionId === 'tx-9' && s.sobraParaOLivre(lancada, 'u-1', '2026-11') === 0 && !s.sobraPrecisaConverter(lancada),
    'convertida: nada por fora, aponta para o lançamento, não pede conversão');
  const tx = (amount, occurred_on = '2026-11-01') => [{ id: 'tx-9', type: 'in', amount, occurred_on }];
  ok(s.sobraLancadaNoMes(lancada, tx(266.31), 'u-1', '2026-11') === 266.31, '"Inclui sobra" lê o valor do lançamento ligado');
  ok(s.sobraLancadaNoMes(lancada, tx(300), 'u-1', '2026-11') === 300, 'lançamento editado: valor novo');
  ok(s.sobraLancadaNoMes(lancada, [], 'u-1', '2026-11') === 0, 'lançamento apagado (ou fora da carteira da visão): some');
  ok(s.sobraLancadaNoMes(lancada, tx(300, '2026-10-31'), 'u-1', '2026-11') === 0, 'lançamento movido para outro mês: sai da linha');
  ok(s.sobraLancadaNoMes(lancada, tx(300), 'u-2', '2026-11') === 0, 'outra conta: zero');

  // Servidor sem a migration de 21/11: coluna ausente lê o modelo antigo, sem erro.
  chamadas.length = 0;
  respostaColunasNovas = { data: null, error: { code: '42703', message: 'column sobra_do_mes.transaction_id does not exist' } };
  resposta = { data: { valor: '812.40' }, error: null };
  const antigo = await s.buscarSobraDoMes('2026-11', 'u-1');
  respostaColunasNovas = null;
  ok(antigo.estado === 'confirmada' && s.sobraParaOLivre(antigo, 'u-1', '2026-11') === 812.4 && !s.sobraPrecisaConverter(antigo),
    'servidor antigo: lê só valor, conta pela via antiga e não tenta converter');
  ok(chamadas.filter((c) => c[0] === 'select').map((c) => c[2]).join('|') === 'valor, transaction_id, convertida|valor', 'servidor antigo: tenta as colunas novas e cai para valor');

  ok(s.sobraParaOLivre(conf, 'u-1', '2026-12') === 0, 'sobra de novembro não entra em dezembro');
  ok(s.sobraParaOLivre(conf, 'u-2', '2026-11') === 0, 'sobra nunca troca de dono');
  chamadas.length = 0;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-10', 10, 'u-1'), /mês mudou/); n++;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', 10, 'u-2'), /conta mudou/); n++;
  ok(chamadas.length === 0, 'formulário vencido ou outra conta não escreve');

  for (const code of ['PGRST205', '42P01']) {
    resposta = { data: null, error: { code } };
    const desl = await s.buscarSobraDoMes('2026-11', 'u-1');
    ok(desl.estado === 'desligada' && s.sobraParaOLivre(desl, 'u-1', '2026-11') === 0, `tabela ausente (${code}): desligada e zero`);
  }
  ok(avisos.filter((a) => /ainda não existe/.test(a)).length === 2, 'tabela ausente deixa log, não silêncio');

  resposta = { data: null, error: { code: '08006', message: 'rede' } };
  await assert.rejects(() => s.buscarSobraDoMes('2026-11', 'u-1')); n++;
  ok(s.sobraParaOLivre(null, 'u-1', '2026-11') === 0, 'não conferida: zero');

  chamadas.length = 0; avisosDeGravacao.length = 0; resposta = { data: null, error: null };
  const gravada = await s.confirmarSobraDoMes('2026-11', 812.404, 'u-1');
  ok(JSON.stringify(chamadas) === JSON.stringify([['rpc', 'confirmar_sobra_do_mes', { p_mes: '2026-11', p_valor: 812.4 }]]), 'confirmar chama a RPC uma vez, ao centavo, e nenhum upsert');
  ok(gravada.transactionId === 'tx-1' && avisosDeGravacao.join(',') === 'lancamentos,widgets', 'lançamento criado: avisa a lista e os widgets');
  chamadas.length = 0; avisosDeGravacao.length = 0;
  respostaRpc = { data: { estado: 'convertida', mes: '2026-11', transaction_id: null }, error: null };
  await s.confirmarSobraDoMes('2026-11', 0, 'u-1');
  ok(chamadas[0][2].p_valor === 0 && avisosDeGravacao.join(',') === 'widgets', 'R$ 0 é confirmação válida, sem lançamento');

  // RPC ausente (servidor antigo): recibo, nunca o upsert antigo.
  chamadas.length = 0;
  respostaRpc = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  const semRpc = await s.confirmarSobraDoMes('2026-11', 10, 'u-1').then(() => null, (e) => e);
  ok(semRpc && semRpc.name === 'SobraServidorDesatualizado' && /servidor ainda não está pronto/.test(semRpc.message), 'PGRST202: erro próprio com recibo legível');
  ok(chamadas.every((c) => c[0] !== 'upsert'), 'PGRST202: não cai no upsert antigo');
  ok(await s.converterSobraLegada('2026-11', 'u-1') === 'indisponivel', 'converter sem RPC: indisponível, sem lançar');
  respostaRpc = { data: { estado: 'convertida', mes: '2026-11', transaction_id: 'tx-2' }, error: null };
  chamadas.length = 0;
  ok(await s.converterSobraLegada('2026-11', 'u-1') === 'convertida' && chamadas[0][2].p_valor === null, 'converter chama a mesma RPC sem valor');
  respostaRpc = { data: null, error: { code: '42501' } };
  await assert.rejects(() => s.converterSobraLegada('2026-11', 'u-1')); n++;
  respostaRpc = { data: { estado: 'convertida', mes: '2026-11', transaction_id: 'tx-1' }, error: null };

  chamadas.length = 0;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', -1, 'u-1')); n++;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', NaN, 'u-1')); n++;
  usuario = null;
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', 10, 'u-1')); n++;
  ok(chamadas.length === 0, 'valor inválido ou sem sessão não grava');
  usuario = 'u-1';
  respostaRpc = { data: null, error: { code: '42501' } };
  await assert.rejects(() => s.confirmarSobraDoMes('2026-11', 10, 'u-1')); n++;

  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107120000_sobra_do_mes_confirmada.sql'), 'utf8');
  ok(/enable row level security/.test(migration) && /primary key \(user_id, mes\)/.test(migration), 'migration com RLS e uma linha por usuário e mês');
  ok(/valor >= 0/.test(migration) && !/grant[^;]*delete[^;]*to authenticated/.test(migration), 'sem valor negativo e sem delete pelo cliente');

  console.warn = avisoReal; global.Date = DateReal;
  console.log(`sobra-do-mes: ${n} checagens no módulo real`);
})().catch((e) => { console.warn = avisoReal; global.Date = DateReal; console.error(e); process.exit(1); });
