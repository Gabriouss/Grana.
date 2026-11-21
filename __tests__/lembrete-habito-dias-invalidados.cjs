/*
 * Lembrete de hábito na abertura: consulta de dias descartada em voo não é
 * falha (item 1 de 21/11/2026).
 *
 *   node __tests__/lembrete-habito-dias-invalidados.cjs
 *
 * O autor viu no celular "[inicio] lembrete de hábito falhou Error: A
 * consulta de dias foi invalidada". Causa, reproduzida aqui com o
 * `lib/data.ts` REAL: qualquer sinal de dado alterado (gravação, aviso aos
 * widgets, versão da fila offline) durante `fetchDiasDeAtividade` descarta a
 * resposta em voo, por desenho do C-01 (ad97de5c). A Início tratava esse
 * descarte como erro e não reagendava o lembrete.
 *
 * Módulos reais: lib/data.ts (consulta e descarte) e lib/lembrete-habito-dias.ts.
 * Dublês: sessão, paginação, fila e o sinal dos widgets (capturado para
 * disparar no meio da consulta). Afirma QUANTAS consultas aconteceram.
 *
 * RED de base: RAIZ_DO_MODULO aponta para um `git archive` do HEAD anterior.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
let checagens = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); checagens++; console.log('  ok  ' + nome); };

function transpilar(arquivo) {
  return ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}
function carregarSimples(arquivo, dubles = {}) {
  const exports = {};
  const req = (id) => { if (id in dubles) return dubles[id]; throw new Error(`import não simulado em ${arquivo}: ${id}`); };
  vm.runInNewContext(transpilar(arquivo), { exports, require: req, console, Date, Set, Map, Promise, Error }, { filename: arquivo });
  return exports;
}

function montarData() {
  const estado = { usuario: 'a', consultas: 0, versao: 1, ouvintes: [], aoConsultar: null,
    banco: [{ created_at: '2026-11-20T15:00:00Z', occurred_on: '2026-11-20' }] };
  class Relogio extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-21T15:00:00Z'])); } }
  const mocks = {
    './format': require('./_carregar-ts.cjs').carregar('lib/format.ts'),
    './cache-de-tela': { comCacheOffline: (_n, fn) => fn },
    './paginacao': { buscarTodasAsPaginas: async () => {
      estado.consultas++;
      const gancho = estado.aoConsultar; estado.aoConsultar = null;
      if (gancho) { await Promise.resolve(); gancho(); }
      return estado.banco;
    } },
    './sessao-offline': { idDoUsuarioLocal: async () => estado.usuario },
    './widgets-home-events': {
      observarDadosDosWidgets: (fn) => { estado.ouvintes.push(fn); return () => {}; },
      notificarDadosDosWidgetsAlterados: () => estado.ouvintes.forEach((f) => f()),
    },
    './lancamentos-alterados': { versaoDosLancamentos: () => estado.versao, marcarLancamentosAlterados: () => { estado.versao++; } },
    './fila-pendente': { juntarPendentes: async (rows) => rows },
  };
  const inerte = new Proxy({}, { get: (_o, k) => { throw new Error(`dependência não simulada: ${String(k)}`); } });
  const exports = {};
  vm.runInNewContext(transpilar('lib/data.ts'), { exports, require: (id) => mocks[id] ?? inerte, console, Date: Relogio, Set, Map, Promise }, { filename: 'lib/data.ts' });
  const sinal = () => estado.ouvintes.forEach((f) => f());
  return { api: exports, estado, sinal };
}

async function principal() {
  // 1. A causa, com o data.ts real.
  {
    const { api, estado, sinal } = montarData();
    await api.fetchDiasDeAtividade(); // inscreve o ouvinte dos widgets
    estado.aoConsultar = sinal;
    const erro = await api.fetchDiasDeAtividade().then(() => null, (e) => e);
    ok(erro && /invalidada/.test(erro.message), 'causa: aviso de dado alterado em voo descarta a consulta de dias');
    ok(erro.name === 'ConsultaDeDiasInvalidada' && erro.motivo === 'registros', 'descarte por dado alterado sai com motivo "registros"');
  }
  {
    const { api, estado } = montarData();
    await api.fetchDiasDeAtividade();
    estado.aoConsultar = () => { estado.versao++; }; // a fila offline sincronizou no meio
    const erro = await api.fetchDiasDeAtividade().then(() => null, (e) => e);
    ok(erro && erro.motivo === 'registros', 'versão da fila subindo em voo também descarta, com motivo "registros"');
  }
  {
    const { api, estado } = montarData();
    estado.aoConsultar = () => { estado.usuario = 'b'; };
    const erro = await api.fetchDiasDeAtividade().then(() => null, (e) => e);
    ok(erro && erro.motivo === 'conta', 'troca de conta em voo sai com motivo "conta"');
  }

  const { diasParaOLembrete, TENTATIVAS_DIAS_DO_LEMBRETE } = carregarSimples('lib/lembrete-habito-dias.ts');
  ok(TENTATIVAS_DIAS_DO_LEMBRETE === 3, 'teto de 3 tentativas');

  // 2. Descarte por registros: repete e entrega os dias, sem aviso.
  {
    const { api, estado, sinal } = montarData();
    await api.fetchDiasDeAtividade();
    const antes = estado.consultas;
    estado.aoConsultar = sinal;
    const avisos = [];
    const dias = await diasParaOLembrete(api.fetchDiasDeAtividade, () => true, (m) => avisos.push(m));
    ok(dias instanceof Set && dias.has('2026-11-20'), 'depois do descarte, a repetição entrega os dias');
    ok(avisos.length === 0, 'repetição bem-sucedida não gera aviso');
    ok(estado.consultas - antes >= 2 && estado.consultas - antes <= 5, `uma rodada descartada e uma repetição (${estado.consultas - antes} consultas ao banco)`);
  }
  // 3. Descarte persistente: desiste no teto, com aviso, sem lançar.
  {
    const { api, estado, sinal } = montarData();
    await api.fetchDiasDeAtividade();
    let chamadas = 0;
    const buscar = () => { chamadas++; estado.aoConsultar = sinal; return api.fetchDiasDeAtividade(); };
    const avisos = [];
    const dias = await diasParaOLembrete(buscar, () => true, (m) => avisos.push(m));
    ok(dias === null && chamadas === 3, 'descarte em todas as tentativas: para em 3 e devolve null');
    ok(avisos.length === 1 && /3 vezes/.test(avisos[0]), 'desistência deixa aviso no log');
  }
  // 4. Troca de conta: não repete para a conta velha.
  {
    const { api, estado } = montarData();
    let chamadas = 0;
    const buscar = () => { chamadas++; estado.aoConsultar = () => { estado.usuario = 'b'; }; return api.fetchDiasDeAtividade(); };
    const avisos = [];
    ok((await diasParaOLembrete(buscar, () => true, (m) => avisos.push(m))) === null && chamadas === 1, 'troca de conta: não repete, devolve null');
    ok(avisos.length === 1, 'troca de conta deixa aviso no log');
  }
  // 5. Carga da Início superada: não insiste.
  {
    const { api, estado, sinal } = montarData();
    await api.fetchDiasDeAtividade();
    let chamadas = 0;
    const buscar = () => { chamadas++; estado.aoConsultar = sinal; return api.fetchDiasDeAtividade(); };
    ok((await diasParaOLembrete(buscar, () => false, () => {})) === null && chamadas === 1, 'carga superada: não repete');
  }
  // 6. Falha real continua falha.
  {
    const rede = new Error('Network request failed');
    const erro = await diasParaOLembrete(async () => { throw rede; }, () => true, () => {}).then(() => null, (e) => e);
    ok(erro === rede, 'erro de rede sobe para quem chama (a Início continua com console.error)');
  }
  // 7. As duas telas que agendam o lembrete usam o mesmo caminho.
  for (const tela of ['app/(app)/index.tsx', 'app/(app)/perfil.tsx']) {
    const src = fs.readFileSync(path.join(root, tela), 'utf8');
    ok(/diasParaOLembrete\(fetchDiasDeAtividade/.test(src) && !/await fetchDiasDeAtividade\(\)\), almocoAtivo/.test(src), `${tela}: dias do lembrete passam por diasParaOLembrete`);
  }
  console.log(`\n${checagens} verificações passaram.`);
}
principal().catch((e) => { console.error(e); process.exitCode = 1; });
