/*
 * A8 (decisão do autor, 22/11/2026): confirmar a sobra NÃO conta como dia de
 * registro na sequência, no "Mês completo" e no Score. Um lançamento comum no
 * mesmo dia continua contando, e a sobra recategorizada também (marca do P4).
 *
 *   node __tests__/sobra-dia-de-registro.cjs
 *
 * Código REAL de todos os caminhos: lib/format, gamification, lembrete,
 * consulta de dias de lib/data.ts, push no servidor e Granabô. O banco dublado
 * só devolve as colunas pedidas no `select`. A RPC SQL fica em
 * sobra-lancamento-servidor.cjs.
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = (c) => ts.transpileModule(c, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
class Relogio extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-22T12:00:00-03:00'])); } static now() { return new Relogio().getTime(); } }
let passou = 0, falhou = 0;
const ok = (c, nome) => { if (c) passou++; else { falhou++; console.error('  FALHA  ' + nome); } };

let banco = [], pendentes = [];
function supabaseFalso() {
  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), getUser: async () => ({ data: { user: { id: 'u' } } }) },
    from(tabela) {
      let colunas = [];
      const filtros = [];
      const q = {
        select(c) { colunas = c.split(',').map((x) => x.trim()); return q; },
        eq: () => q, in: () => q, order: () => q, range: () => q,
        gte(c, v) { filtros.push((t) => String(t[c]) >= v); return q; },
        lt(c, v) { filtros.push((t) => String(t[c]) < v); return q; },
        then(res, rej) {
          const linhas = (tabela === 'transactions' ? banco : []).filter((t) => filtros.every((f) => f(t)));
          return Promise.resolve({ data: linhas.map((t) => Object.fromEntries(colunas.map((c) => [c, t[c]]))), error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}
const inerte = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : () => () => {}) });
const dublesDoData = {
  './supabase': { supabase: supabaseFalso() },
  './cache-de-tela': { comCacheOffline: (_n, f) => f, invalidarRespostasAtrasadas() {} },
  './sessao-offline': { idDoUsuarioLocal: async () => 'u', sessaoEstaTravada: () => false },
  './fila-pendente': { juntarPendentes: async (lista) => [...pendentes, ...lista], entradasPendentesPorCarteira: async () => [] },
  './widgets-home-events': { notificarDadosDosWidgetsAlterados() {}, observarDadosDosWidgets: () => () => {} },
};
const SO_DUBLE = ['./creditLimitAlert', './voz-pendente-na-lista', './escrita-da-conta'];
const modulos = new Map();
function real(rel) {
  if (modulos.has(rel)) return modulos.get(rel);
  const exports = {}; modulos.set(rel, exports);
  vm.runInNewContext(js(ler(rel)), { exports, Date: Relogio, Intl, console, setTimeout, clearTimeout,
    require(id) {
      if (rel === 'lib/data.ts' && id in dublesDoData) return dublesDoData[id];
      if (rel === 'lib/data.ts' && SO_DUBLE.includes(id)) return inerte;
      if (id.startsWith('.')) return real(path.posix.join(path.posix.dirname(rel), id.endsWith('.ts') ? id : id + '.ts'));
      if (id.startsWith('@/')) return real(id.slice(2) + '.ts');
      return inerte;
    } }, { filename: rel });
  return exports;
}
function trechos(arquivo, escolher) {
  const ast = ts.createSourceFile(arquivo, ler(arquivo), ts.ScriptTarget.Latest, true);
  const r = [];
  (function visitar(n) { if (escolher(n, ast)) r.push(n.getText(ast)); ts.forEachChild(n, visitar); })(ast);
  return r;
}

let id = 0;
const tx = (dia, extra = {}) => ({ id: String(++id), user_id: 'u', type: 'out', amount: 10, category: 'Alimentação',
  occurred_on: dia, created_at: `${dia}T13:00:00.000Z`, ...extra });
/* A sobra: dia 1 no extrato, confirmada (criada) em outro dia. */
const sobra = (criadaEm, extra = {}) => tx('2026-11-01', { type: 'in', category: 'Sobra do mês', amount: 266, created_at: `${criadaEm}T13:00:00.000Z`, ...extra });
const agora = new Relogio();
const doisDias = [tx('2026-11-20'), tx('2026-11-21')];
const casos = [
  ['só a sobra hoje', [...doisDias, sobra('2026-11-22')], 2],
  ['sobra e um lançamento comum hoje', [...doisDias, sobra('2026-11-22'), tx('2026-11-22')], 3],
  ['sobra recategorizada hoje', [...doisDias, sobra('2026-11-22', { category: 'Outros' })], 3],
  ['saída com o nome da categoria', [...doisDias, sobra('2026-11-22', { type: 'out' })], 3],
];

(async () => {
  const gam = real('lib/gamification.ts');
  const lembrete = real('lib/contexto-lembrete.ts');
  const { diasComRegistro } = real('lib/format.ts');
  const data = real('lib/data.ts');
  const push = real('supabase/functions/_shared/push-habit.ts');

  const handler = 'supabase/functions/enviar-lembretes-habito/index.ts';
  const doHandler = trechos(handler, (n, ast) =>
    (ts.isFunctionDeclaration(n) && n.name?.getText(ast) === 'atividadeDosUsuarios')
    || (ts.isVariableStatement(n) && /^const DIAS_DE_ATIVIDADE\b/.test(n.getText(ast))));
  const atividade = {};
  vm.runInNewContext(js(doHandler.join('\n') + '\nexports.f = atividadeDosUsuarios;'), { exports: atividade, supabase: supabaseFalso(), Date: Relogio, Map });

  const granabo = 'supabase/functions/assistente-financeiro/index.ts';
  const casoDoScore = trechos(granabo, (n, ast) => ts.isCaseClause(n) && n.expression.getText(ast) === "'resumoScoreERitmo'" && n.getText(ast).includes('datasComRegistro'))[0];
  const score = {};
  vm.runInNewContext(js(`exports.f = async function () { switch ('resumoScoreERitmo') { ${casoDoScore} } };`), {
    exports: score, supabase: supabaseFalso(), Date: Relogio, Intl, userId: 'u', pad: (n) => String(n).padStart(2, '0'),
    ehLancamentoDeSobra: (...a) => real('supabase/functions/_shared/sobra-lancamento.ts').ehLancamentoDeSobra(...a),
  });

  for (const [nome, lista, esperado] of casos) {
    const hoje = esperado === 3;
    ok(diasComRegistro(lista).size === esperado, `${nome}: dias com registro = ${esperado}`);

    const g = gam.getGamificationState(lista, [], [], undefined, [], { agora });
    ok(gam.calculateStreakAndWeek(lista, agora).streak === esperado, `${nome}: sequência = ${esperado}`);
    const f = gam.calculateScoreBreakdown(lista, [], [], esperado, agora).factors[1];
    ok(f.description.startsWith(`${esperado} de 22`), `${nome}: constância do Score = ${esperado} de 22`);
    ok(g.streak === undefined || g.streak === esperado, `${nome}: estado de Desafios = ${esperado}`);

    const c = lembrete.contextoDoLembrete(lista, agora);
    ok(c.jaLancouHoje === hoje && c.streak === esperado && c.diasInativo === (hoje ? 0 : 1), `${nome}: lembrete local`);

    banco = lista; pendentes = [];
    data.limparDiasComRegistro?.();
    const dias = await data.fetchDiasDeAtividade();
    ok(dias.size === esperado && dias.has('2026-11-22') === hoje, `${nome}: consulta de dias do banco (colunas do select)`);

    banco = doisDias; pendentes = lista.slice(2);
    ok((await data.fetchDiasComRegistroRecentes()).size === esperado, `${nome}: dias da fila offline`);

    banco = lista; pendentes = [];
    const linhas = (await atividade.f(['u'], agora)).get('u');
    const doPush = push.diasDeAtividade(linhas, 'America/Sao_Paulo');
    ok(doPush.length === esperado && push.lancouNoDia(doPush, '2026-11-22') === hoje
      && push.contextoDasDatas(doPush, '2026-11-22').streak === esperado, `${nome}: push do servidor`);

    ok((await score.f()).includes(`(Ritmo): ${esperado} dias seguidos`), `${nome}: Ritmo do Granabô`);
  }

  // Mês completo: o dia 7 de outubro só tem a sobra.
  {
    const outubro = [];
    for (let d = 1; d <= 31; d++) if (d !== 7) outubro.push(tx(`2026-10-${String(d).padStart(2, '0')}`));
    const completo = (lista) => gam.evaluateBadges(lista, [], [], 0, undefined, [], undefined, agora).find((b) => b.id === 'full_month').unlocked;
    const comSobra = [...outubro, sobra('2026-10-07', { occurred_on: '2026-10-01' })];
    ok(!completo(comSobra), 'Mês completo: a sobra não preenche o dia que faltava');
    ok(completo([...comSobra, tx('2026-10-07')]), 'Mês completo: um lançamento comum no mesmo dia preenche');
  }
  // Linha sem created_at cai no dia do extrato, e a marca vale igual.
  {
    const semCriado = sobra('2026-11-22', { created_at: null });
    ok(diasComRegistro([semCriado]).size === 0, 'sem created_at: a sobra não vira o dia 1');
    ok(push.diasDeAtividade([semCriado], 'America/Sao_Paulo').length === 0, 'sem created_at: idem no push');
  }
  // O servidor não importa de lib/: a marca dele tem de decidir igual à do app.
  if (fs.existsSync(path.join(root, 'supabase/functions/_shared/sobra-lancamento.ts'))) {
    const app = real('lib/sobra-lancamento.ts');
    const srv = real('supabase/functions/_shared/sobra-lancamento.ts');
    ok([sobra('2026-11-22'), tx('2026-11-22'), sobra('2026-11-22', { type: 'out' }), sobra('2026-11-22', { category: null })]
      .every((t) => app.ehLancamentoDeSobra(t) === srv.ehLancamentoDeSobra(t)), 'marca do servidor igual à do app');
  } else ok(false, 'marca do servidor igual à do app');

  console.log(`sobra-dia-de-registro: ${passou} checagens ok, ${falhou} falhas`);
  if (falhou) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
