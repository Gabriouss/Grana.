/*
 * Desafios fase 2, camada de lógica: calendário e fonte única de dias com registro.
 *
 *   node __tests__/desafios-calendario.cjs
 *
 * Módulos reais: lib/gamification.ts e lib/desafios-calendario.ts.
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const { carregar } = require('./_carregar-ts.cjs');
const { diasComRegistro, calculateStreakAndWeek, calculateScoreBreakdown } = carregar('lib/gamification.ts');
const cal = carregar('lib/desafios-calendario.ts');

let n = 0;
const ok = (c, nome) => { assert.ok(c, nome); n++; console.log('  ok  ' + nome); };
assert.equal(new Date(2026, 9, 1).getTimezoneOffset(), 180, 'TZ de São Paulo não aplicou; o teste de fuso seria vazio');

// created_at às 21h50 locais = 00h50 UTC do dia seguinte.
const noite = (dia) => new Date(2026, 9, dia, 21, 50).toISOString();
const tx = (parcial) => ({ id: 'x', type: 'out', amount: 1, category: 'Outros', occurred_on: '2026-10-01', ...parcial });

// 1. Virada às 21h50: mesmo dia local, não o seguinte em UTC.
{
  assert.ok(noite(10).startsWith('2026-10-11'), 'pré-condição: UTC já é o dia seguinte');
  const dias = diasComRegistro([tx({ created_at: noite(10), occurred_on: '2026-10-10' })]);
  ok(dias.has('2026-10-10') && !dias.has('2026-10-11'), '21h50 local fica no dia 10, não vira 11');
}

// 2. Sem created_at usa occurred_on.
ok(diasComRegistro([tx({ created_at: null, occurred_on: '2026-10-05' })]).has('2026-10-05'), 'sem created_at usa occurred_on');

// 3. Hipótese da spec: ocorrência antiga registrada hoje. Pela fonte nova conta HOJE.
{
  const agora = new Date(2026, 9, 20, 22, 0);
  const antigo = tx({ created_at: new Date(2026, 9, 20, 21, 50).toISOString(), occurred_on: '2026-09-01' });
  const { streak } = calculateStreakAndWeek([antigo], agora);
  ok(streak === 1, 'lançamento de data antiga registrado hoje conta como hoje na sequência');
}

// 4. Sequência, Score e calendário dão o mesmo número, também às 21h50.
{
  const agora = new Date(2026, 9, 12, 21, 55);
  const linhas = [8, 9, 10, 11, 12].map((d) => tx({ id: 'd' + d, created_at: noite(d), occurred_on: `2026-10-${String(d).padStart(2, '0')}` }));
  const dias = diasComRegistro(linhas);
  const { streak, weekActivity } = calculateStreakAndWeek(linhas, agora);
  const score = calculateScoreBreakdown(linhas, [], [], streak, agora);
  const c = cal.montarCalendario(dias, 2026, 9, agora);
  ok(streak === 5, 'sequência de 5 dias às 21h55 (sem zerar)');
  ok(c.diasComRegistro === 5 && c.diasVividos === 12, 'calendário: 5 de 12 dias');
  const constancia = score.factors.find((f) => f.label === 'Constância no mês');
  ok(constancia.description.startsWith('5 de 12'), 'Score "Constância no mês" também diz 5 de 12');
  ok(weekActivity.filter((w) => w.active).length === 1 && weekActivity[0].dateISO === '2026-10-12' && weekActivity[0].active, 'ritmo da semana (segunda 12/10) lê o mesmo dia');
  ok(c.resumo === '5 de 12 dias com registro', 'resumo do cabeçalho');
  const dia1 = cal.montarCalendario(new Set(['2026-11-01']), 2026, 10, new Date(2026, 10, 1, 12));
  ok(dia1.diasVividos === 1 && dia1.resumo === '1 de 1 dia com registro', 'dia 1 do mês: singular, "1 de 1 dia com registro"');
  ok(cal.montarCalendario(new Set(), 2026, 10, new Date(2026, 10, 1, 12)).resumo === '0 de 1 dia com registro', 'dia 1 sem registro: "0 de 1 dia"');
  ok(calculateStreakAndWeek([], agora, dias).streak === 5, 'sequência lê o conjunto de dias passado');
  const s2 = calculateScoreBreakdown([], [], [], 5, agora, dias).factors.find((f) => f.label === 'Constância no mês');
  ok(s2.description.startsWith('5 de 12'), 'Score lê o conjunto de dias passado');
}

// 5. Dia sem registro e dia futuro não trazem marca.
{
  const agora = new Date(2026, 9, 12, 10, 0);
  const c = cal.montarCalendario(new Set(['2026-10-03']), 2026, 9, agora);
  const cel = c.semanas.flat().filter(Boolean);
  ok(cel.find((x) => x.dia === 3).registro === true, 'dia 3 com registro');
  ok(cel.find((x) => x.dia === 4).registro === false, 'dia 4 sem registro, sem marca');
  ok(cel.find((x) => x.dia === 20).futuro && !cel.find((x) => x.dia === 20).registro, 'dia futuro sem marca');
  ok(cel.find((x) => x.dia === 12).hoje === true, 'hoje marcado');
  ok(cal.montarCalendario(new Set(['2026-10-25']), 2026, 9, agora).diasComRegistro === 0, 'registro futuro não conta');
  // outubro de 2026 começa na quinta: 3 pontas vazias antes do dia 1, semana de segunda a domingo
  ok(c.semanas[0].slice(0, 3).every((x) => x === null) && c.semanas[0][3].dia === 1, 'semana começa na segunda');
  ok(c.semanas.every((s) => s.length === 7), 'toda semana tem 7 colunas');
}

// 6. Mês anterior e limite de 12 meses.
{
  const hoje = new Date(2026, 9, 12);
  ok(cal.podeIrParaMesAnterior(2026, 9, hoje), 'de outubro vai a setembro');
  ok(!cal.podeIrParaProximoMes(2026, 9, hoje), 'nunca além do mês atual');
  ok(cal.mesNavegavel(2025, 9, hoje), 'outubro/2025 (12 meses atrás) é navegável');
  ok(!cal.mesNavegavel(2025, 8, hoje), 'setembro/2025 (13 meses atrás) não é');
  ok(!cal.podeIrParaMesAnterior(2025, 9, hoje), 'no limite não anda mais para trás');
  ok(cal.deslocarMes(2026, 0, -1).ano === 2025 && cal.deslocarMes(2026, 0, -1).mes === 11, 'virada de ano');
  const mesPassado = cal.montarCalendario(new Set(['2026-09-01']), 2026, 8, hoje);
  ok(mesPassado.diasVividos === 30, 'mês passado: todos os dias vividos');
}

// 7. Limites de consulta: início do mês LOCAL, não UTC.
{
  const l = cal.limitesDoMes(2026, 9);
  ok(l.inicio.startsWith('2026-10-01T03:00'), 'início do mês local = 03:00Z');
  ok(l.fim.startsWith('2026-11-01T03:00'), 'fim = início do mês seguinte');
}
console.log(`\n${n} verificações passaram.`);

// C-01: executa o data.ts real; só sessão, paginação, fila e plataforma são dubladas.
function cacheDiasReal() {
  const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
  const { root } = require('./_carregar-ts.cjs');
  const path = require('node:path');
  const estado = { usuario: 'a', chamadas: 0, pendentes: [], espera: null,
    bancos: { a: [{ created_at: '2026-10-10T15:00:00Z', occurred_on: '2026-10-10' }], b: [] } };
  class Relogio extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-08T15:00:00Z'])); } }
  const mocks = {
    './format': carregar('lib/format.ts'),
    './cache-de-tela': { comCacheOffline: (_nome, fn) => fn },
    './paginacao': { buscarTodasAsPaginas: async () => { estado.chamadas++; const rows = estado.bancos[estado.usuario]; if (estado.espera) await estado.espera; return rows; } },
    './sessao-offline': { idDoUsuarioLocal: async () => estado.usuario },
    './widgets-home-events': { observarDadosDosWidgets: () => () => {} },
    './lancamentos-alterados': { versaoDosLancamentos: () => 1 },
    './fila-pendente': { juntarPendentes: async rows => [...rows, ...estado.pendentes] },
  };
  // Imports fora do caminho testado ficam inertes; chamada inesperada falha.
  const inerte = new Proxy({}, { get: (_obj, key) => { throw new Error(`dependência não simulada: ${String(key)}`); } });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/data.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require: id => mocks[id] ?? inerte, console, Date: Relogio, Set, Map, Promise });
  return { api: exports, estado };
}
async function testarCacheDias() {
  const paralela = cacheDiasReal();
  assert((await paralela.api.fetchDiasDeAtividade()).has('2026-10-10'), 'C-01: primeira carga paralela de meses nao se invalida');
  const { api, estado } = cacheDiasReal();
  assert((await api.fetchDiasComRegistro(2026, 9)).has('2026-10-10'));
  estado.usuario = 'b';
  assert.equal((await api.fetchDiasComRegistro(2026, 9)).size, 0, 'C-01: conta B não herda dias de A');
  assert.equal(estado.chamadas, 2, 'C-01: outra conta consulta seu próprio banco');
  estado.usuario = null;
  await assert.rejects(api.fetchDiasComRegistro(2026, 9), /conta|sessão|autenticado/i, 'C-01: sem sessão não serve cache');
  estado.usuario = 'a';
  api.limparDiasComRegistro();
  estado.bancos.a = [];
  assert.equal((await api.fetchDiasComRegistro(2026, 9)).size, 0, 'C-01: limpeza remove cache mesmo mantendo usuário');
  for (const voltaParaA of [false, true]) {
    api.limparDiasComRegistro(); estado.usuario = 'a';
    estado.bancos.a = [{ created_at: '2026-10-11T15:00:00Z', occurred_on: '2026-10-11' }];
    let liberar;
    estado.espera = new Promise(resolve => { liberar = resolve; });
    const voo = api.fetchDiasComRegistro(2026, 9);
    // Espera o buscador ter atravessado os awaits iniciais de sessão.
    const chamadasAntes = estado.chamadas;
    while (estado.chamadas === chamadasAntes) await Promise.resolve();
    estado.usuario = 'b';
    if (voltaParaA) { api.limparDiasComRegistro(); estado.usuario = 'a'; }
    estado.espera = null; liberar();
    await assert.rejects(voo, /conta|invalidada/i, 'C-01: resposta em voo é descartada após troca/invalidação');
  }
  console.log('C-01: isolamento de conta, limpeza e consultas em voo passaram.');
}
testarCacheDias().catch(e => { console.error(e); process.exitCode = 1; });

async function testarPendentesNoCache() {
  const { api, estado } = cacheDiasReal();
  estado.bancos.a = [];
  estado.pendentes = [{ created_at: '2026-10-31T23:30:00-03:00', occurred_on: '2026-09-01' }];
  assert((await api.fetchDiasComRegistro(2026, 9)).has('2026-10-31'), 'C-02: primeira consulta inclui criadoEm local, nao occurred_on');
  const segunda = await api.fetchDiasComRegistro(2026, 9);
  assert(segunda.has('2026-10-31'), 'C-02: cache reune pendente novamente');
  assert.equal(estado.chamadas, 1, 'C-02: cache evita outra consulta ao banco');
  estado.pendentes = [];
  assert.equal((await api.fetchDiasComRegistro(2026, 9)).size, 0, 'C-02: retirar pendente nao deixa dia persistido');
  estado.pendentes = [{ created_at: '2026-11-01T03:30:00Z', occurred_on: '2026-10-31' }];
  assert.equal((await api.fetchDiasComRegistro(2026, 9)).size, 0, 'C-02: registro criado em novembro nao entra em outubro');
  console.log('C-02: pendentes no cache, remocao e limite de mes passaram.');
}
testarPendentesNoCache().catch(e => { console.error(e); process.exitCode = 1; });
