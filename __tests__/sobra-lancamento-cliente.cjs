/*
 * Sobra do mês como lançamento, lado do cliente (plano de 21/11/2026, T1, T2,
 * T5, T6, T9 e P4). Módulos REAIS: lib/safe-to-spend.ts (fonte única do
 * Livre, a mesma do Granabô), lib/creditoFaturas.ts (carteira da visão),
 * lib/widgets-home-snapshot.ts, lib/sobra-do-mes.ts, lib/projections.ts e
 * lib/gamification.ts. Dados inventados.
 *
 *   node __tests__/sobra-lancamento-cliente.cjs
 *
 * O teste da gravação (RPC uma vez, nenhum upsert, PGRST202 com recibo) está
 * em sobra-do-mes.cjs e sobra-ciclo-de-vida.cjs; o servidor, em
 * sobra-lancamento-servidor.cjs.
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const root = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');

const cache = new Map();
function real(rel, dubles = {}) {
  const file = path.resolve(root, rel);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, Date, console, Math, JSON, Number, String, Set, Map, Array, Object, Intl,
    require(id) {
      if (id in dubles) return dubles[id];
      if (id.startsWith('@/')) return real(id.slice(2) + '.ts', dubles);
      if (id.startsWith('.')) return real(path.relative(root, path.resolve(path.dirname(file), id + '.ts')), dubles);
      throw Error('Import inesperado: ' + id);
    } }, { filename: file });
  return exports;
}
const dublesSobra = {
  './supabase': { supabase: {} }, './sessao-offline': { idDoUsuarioLocal: async () => 'u' },
  './lancamentos-alterados': { marcarLancamentosAlterados() {} }, './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
};
const { calcularSafeToSpend } = real('lib/safe-to-spend.ts');
const { lancamentosDaCarteira } = real('lib/creditoFaturas.ts');
const { montarSnapshotWidgets } = real('lib/widgets-home-snapshot.ts', dublesSobra);
const sobra = real('lib/sobra-do-mes.ts', dublesSobra);
const { sugerirSobraDoMesAnterior } = real('lib/safe-to-spend.ts');

let checagens = 0;
const ok = (c, nome) => { assert.ok(c, nome); checagens++; console.log('  ok  ' + nome); };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); checagens++; console.log('  ok  ' + nome); };

const U = 'u', P = 'w-principal', O = 'w-outra', X = 266.31;
const base = [
  { id: 't1', type: 'in', amount: 3000, category: 'Salário', occurred_on: '2026-11-05', wallet_id: P, created_at: '2026-11-05T12:00:00Z' },
  { id: 't2', type: 'out', amount: 420.5, category: 'Alimentação', occurred_on: '2026-11-03', wallet_id: P, created_at: '2026-11-03T12:00:00Z' },
  { id: 't3', type: 'out', amount: 90, category: 'Transporte', occurred_on: '2026-11-04', wallet_id: O, created_at: '2026-11-04T12:00:00Z' },
  { id: 't4', type: 'in', amount: 200, category: 'Outros', occurred_on: '2026-11-02', wallet_id: O, created_at: '2026-11-02T12:00:00Z' },
];
const lancSobra = { id: 'tx-sobra', type: 'in', amount: X, category: 'Sobra do mês', color: '#74a17c', description: 'Sobra de outubro', occurred_on: '2026-11-01', wallet_id: P, payment_method: null, card_id: null, created_at: '2026-11-07T12:00:00Z' };
const legada = { estado: 'confirmada', mes: '2026-11', userId: U, valor: X, convertida: false, transactionId: null };
const convertida = { estado: 'confirmada', mes: '2026-11', userId: U, valor: 0, convertida: true, transactionId: 'tx-sobra' };

/* Como a Início calcula (app/(app)/index.tsx): carteira da visão, sobra legada por fora. */
function inicio(transacoes, estado, carteira, dia) {
  const daVisao = lancamentosDaCarteira(transacoes, [], carteira, P);
  const r = calcularSafeToSpend(daVisao, [], new Date(`${dia}T12:00:00`), { cards: [], payments: [], sobraConfirmada: sobra.sobraParaOLivre(estado, U, dia.slice(0, 7), carteira, P) });
  return { livreTotal: r.livreTotal, livrePorDia: r.livrePorDia, saldoAtual: r.saldoAtual, inclui: r.sobraConfirmada + sobra.sobraLancadaNoMes(estado, daVisao, U, dia.slice(0, 7)) };
}

// T1. Paridade: modelo antigo (X por fora) e novo (lançamento X no dia 1) dão os mesmos números.
for (const dia of ['2026-11-01', '2026-11-07', '2026-11-15', '2026-11-30']) {
  for (const carteira of ['total', P, O]) {
    const antigo = inicio(base, legada, carteira, dia);
    const novo = inicio([...base, lancSobra], convertida, carteira, dia);
    igual(novo, antigo, `T1 ${dia} ${carteira}: Livre, Livre por dia, Saldo atual e "Inclui sobra" iguais`);
  }
}

// T2. Uma vez em todas as superfícies, no estado convertido.
{
  const dia = '2026-11-15';
  const semSobra = inicio(base, null, 'total', dia);
  const comSobra = inicio([...base, lancSobra], convertida, 'total', dia);
  ok(Math.abs(comSobra.saldoAtual - semSobra.saldoAtual - X) < 0.005, 'T2 Início: o Saldo atual sobe X uma vez');
  const snap = montarSnapshotWidgets({ userId: U, transactions: [...base, lancSobra], bills: [], goals: [], privacyHidden: false, cards: [], payments: [],
    sobraConfirmada: sobra.sobraParaOLivre(convertida, U, '2026-11'), hoje: new Date(`${dia}T12:00:00`) });
  ok(Math.abs(snap.safeToSpend.livreTotal - comSobra.livreTotal) < 0.005, 'T2 widget: mesmo Livre da Início (X uma vez)');
  /* Granabô no servidor: lê sobra_do_mes.valor, que é 0 depois da conversão, e os lançamentos. */
  const granabo = calcularSafeToSpend([...base, lancSobra], [], new Date(`${dia}T12:00:00`), { sobraConfirmada: 0 });
  ok(Math.abs(granabo.livreTotal - comSobra.livreTotal) < 0.005, 'T2 Granabô (valor 0 do servidor): mesmo Livre, X uma vez');
  const saldo = sobra.sobraNoSaldoDoMes({ estado: convertida, userId: U, mes: '2026-11', mesAtual: '2026-11', carteiraId: 'total', principalId: P, filtrado: false, carregando: false, erro: false, semConexao: false });
  const entradas = [...base, lancSobra].filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  ok(saldo.valor === 0 && entradas === 3200 + X, 'T2 Lançamentos: nada por fora; o Saldo do mês já tem X nas Entradas');
  ok(comSobra.inclui === X, 'T2 "Inclui sobra" mostra X uma vez');
}

// T3 (parte de cálculo). Legada sem lançamento conta X uma vez, pela via antiga.
{
  const r = inicio(base, legada, 'total', '2026-11-15');
  const semSobra = inicio(base, null, 'total', '2026-11-15');
  ok(Math.abs(r.saldoAtual - semSobra.saldoAtual - X) < 0.005 && sobra.sobraPrecisaConverter(legada), 'T3 legada: X uma vez e pede conversão');
}

// T5. Apagar: o lançamento some, o Livre perde X, "Inclui sobra" some.
{
  const apagado = { ...convertida, transactionId: null };
  const r = inicio(base, apagado, 'total', '2026-11-15');
  igual(r, inicio(base, null, 'total', '2026-11-15'), 'T5 apagar: números de quem não tem sobra, sem "Inclui sobra"');
  ok(apagado.estado === 'confirmada', 'T5 a linha continua respondida: a Início não pergunta de novo');
}

// T6. Editar: valor novo no Livre e no "Inclui sobra"; outro mês tira da linha.
{
  const editado = { ...lancSobra, amount: 300 };
  const r = inicio([...base, editado], convertida, 'total', '2026-11-15');
  ok(r.inclui === 300 && Math.abs(r.saldoAtual - inicio(base, null, 'total', '2026-11-15').saldoAtual - 300) < 0.005, 'T6 valor editado vale no Livre e no "Inclui sobra"');
  const movido = { ...lancSobra, occurred_on: '2026-10-31' };
  ok(inicio([...base, movido], convertida, 'total', '2026-11-15').inclui === 0, 'T6 movido para outubro: sai do "Inclui sobra" de novembro');
  const outraCarteira = { ...lancSobra, wallet_id: O };
  ok(inicio([...base, outraCarteira], convertida, P, '2026-11-15').inclui === 0 && inicio([...base, outraCarteira], convertida, O, '2026-11-15').inclui === X,
    'T6 carteira trocada: "Inclui sobra" acompanha a carteira do lançamento');
}

// T9. A sugestão de dezembro inclui a sobra lançada em novembro (é entrada de novembro).
{
  const semSobra = sugerirSobraDoMesAnterior(base, [], '2026-12-02');
  const comSobra = sugerirSobraDoMesAnterior([...base, lancSobra], [], '2026-12-02');
  ok(Math.abs(comSobra - semSobra - X) < 0.005, 'T9 sugestão do mês seguinte inclui a sobra lançada');
}

// P4. Fora da média de renda das projeções e das conquistas.
{
  const proj = real('lib/projections.ts', dublesSobra);
  const gam = real('lib/gamification.ts', { ...dublesSobra, './data': {} });
  const meses = ['2026-08', '2026-09', '2026-10'];
  const renda = meses.flatMap((m, i) => [
    { id: 'r' + i, type: 'in', amount: 3000, category: 'Salário', occurred_on: m + '-05', created_at: m + '-05T12:00:00Z' },
    { id: 'g' + i, type: 'out', amount: 2900, category: 'Moradia', occurred_on: m + '-10', created_at: m + '-10T12:00:00Z' },
  ]);
  const sobras = meses.map((m, i) => ({ ...lancSobra, id: 's' + i, amount: 1500 + i * 700, occurred_on: m + '-01' }));
  const hoje = new Date('2026-11-15T12:00:00');
  igual(proj.sugerirEvolucaoArquetipo([...renda, ...sobras], [], [], 'equilibrista', hoje), proj.sugerirEvolucaoArquetipo(renda, [], [], 'equilibrista', hoje),
    'P4 projeções: a sobra não muda a média de renda nem a sugestão');
  const nomes = (lista) => gam.evaluateBadges(lista, [], [], 0, undefined, [], new Set(), hoje).filter((b) => b.unlocked).map((b) => b.id).sort();
  igual(nomes([lancSobra]), nomes([]), 'P4 conquistas: uma sobra sozinha não desbloqueia conquista de receita nem de contagem');
}

console.log(`\nsobra-lancamento-cliente: ${checagens} checagens ok`);
