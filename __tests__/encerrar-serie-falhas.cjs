/*
 * "Este e os proximos" (`encerrarSerieAPartirDe`, lib/data.ts) contra um
 * Postgres de verdade, e a falha NO meio dos dois passos.
 *
 *   node __tests__/encerrar-serie-falhas.cjs
 *
 * O modulo e o REAL (lib/data.ts transpilado em memoria). So o cliente do
 * Supabase e substituido: um adaptador minimo traduz as chamadas que a funcao
 * faz (update/delete + eq/gte/select) em SQL no PGlite, com as migrations
 * reais de recorrencia aplicadas. O adaptador NAO imita o PostgREST inteiro:
 * se a funcao passar a usar outro metodo, ele lanca erro em vez de fingir.
 *
 * Lacuna 3 do relatorio de 01/10: o teste antigo cobre a ordem (parar e
 * depois apagar) e a falha ao parar, mas nao a falha NO delete depois de
 * parar, nem a contagem devolvida, nem o efeito combinado com o gatilho.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { novoBanco, aplicar, novoUsuario, inserir } = require('./helpers/postgres-t5.cjs');

const root = path.join(__dirname, '..');
let aprovadas = 0;
const ok = (r) => { aprovadas++; console.log('  ok  ' + r); };

function carregarData(supabase, userId, eventos) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/data.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const regras = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'lib/transaction-rules.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: regras.exports, module: regras, console, require: () => ({}) });
  const deps = {
    './supabase': { supabase },
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar },
    './sessao-offline': { idDoUsuarioLocal: async () => userId },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() { eventos.push('widgets'); } },
    './lancamentos-alterados': { marcarLancamentosAlterados() { eventos.push('alterados'); } },
    './fila-pendente': { juntarPendentes: async (l) => l },
    './voz-pendente-na-lista': { juntarVozPendente: async (l) => l },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './transaction-rules': regras.exports,
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  };
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math,
    require: (id) => { if (id in deps) return deps[id]; throw new Error('import nao simulado: ' + id); },
  }, { filename: 'lib/data.ts' });
  return exports;
}

/* Adaptador: so update/delete em transactions com eq/gte/select('id'). `falhaNoDelete` simula erro do servidor. */
function adaptador(db, { falhaNoDelete = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    supabase: {
      from(tabela) {
        assert.equal(tabela, 'transactions');
        const op = { tipo: null, set: null, filtros: [], select: false };
        const q = {
          update(obj) { op.tipo = 'update'; op.set = obj; return q; },
          delete() { op.tipo = 'delete'; return q; },
          eq(c, v) { op.filtros.push([c, '=', v]); return q; },
          gte(c, v) { op.filtros.push([c, '>=', v]); return q; },
          select(cols) { assert.equal(cols, 'id'); op.select = true; return q; },
          then(resolve, reject) {
            chamadas.push(op.tipo);
            const colunasOk = ['id', 'user_id', 'parent_id', 'occurred_on'];
            op.filtros.forEach(([c]) => assert.ok(colunasOk.includes(c), 'coluna nao prevista no adaptador: ' + c));
            const where = op.filtros.map(([c, o], i) => c + ' ' + o + ' $' + (i + 1 + (op.tipo === 'update' ? Object.keys(op.set).length : 0))).join(' and ');
            const vals = op.filtros.map(([, , v]) => v);
            let p;
            if (op.tipo === 'delete' && falhaNoDelete) {
              p = Promise.resolve({ data: null, error: falhaNoDelete });
            } else if (op.tipo === 'delete') {
              p = db.query('delete from public.transactions where ' + where + (op.select ? ' returning id' : ''), vals)
                .then((r) => ({ data: r.rows, error: null }));
            } else if (op.tipo === 'update') {
              const cols = Object.keys(op.set);
              p = db.query('update public.transactions set ' + cols.map((c, i) => c + ' = $' + (i + 1)).join(', ') + ' where ' + where,
                [...cols.map((c) => op.set[c]), ...vals]).then(() => ({ data: null, error: null }));
            } else throw new Error('operacao nao prevista: ' + op.tipo);
            return p.then(resolve, reject);
          },
        };
        return q;
      },
    },
  };
}

async function preparar() {
  const db = await novoBanco();
  for (const m of ['20261001120000', '20261001130000', '20261001140000']) await aplicar(db, m);
  return db;
}
const estado = async (db, ids) =>
  (await db.query('select id, parent_id, recurring, occurred_on::text d from public.transactions where id = any($1) order by occurred_on', [ids])).rows;

(async () => {
  const db = await preparar();
  const u = await novoUsuario(db);
  const cab = await inserir(db, u, { recurring: true });
  const datas = ['2026-02-05', '2026-03-05', '2026-04-05', '2026-05-05'];
  const filhas = [];
  for (const d of datas) filhas.push(await inserir(db, u, { occurred_on: d, recurring: true, parent_id: cab }));
  const tocada = { parent_id: cab, occurred_on: '2026-04-05', installment_total: null };

  // 1. Falha NO delete depois de parar: a serie fica parada, nada sai, o erro chega a quem chamou.
  {
    const eventos = [];
    const { supabase, chamadas } = adaptador(db, { falhaNoDelete: { code: '57014', message: 'tempo esgotado' } });
    const data = carregarData(supabase, u, eventos);
    await assert.rejects(data.encerrarSerieAPartirDe(tocada), (e) => e.code === '57014', 'o erro do delete sobe, nao e engolido');
    assert.deepEqual(chamadas, ['update', 'delete'], 'parou a serie e so entao tentou apagar');
    const cabeca = (await db.query('select recurring, recurrence_skipped_months m from public.transactions where id=$1', [cab])).rows[0];
    assert.equal(cabeca.recurring, false, 'ESTADO DEIXADO: a serie ficou parada');
    assert.deepEqual(cabeca.m, [], 'nenhum mes foi marcado, porque nada foi apagado');
    assert.equal((await estado(db, filhas)).length, 4, 'os meses seguintes continuam la');
    assert.deepEqual(eventos, [], 'sem sucesso, as telas/widgets nao sao avisados de mudanca');
    ok('falha no delete apos parar: erro sobe, serie parada, 4 meses intactos, sem aviso falso de sucesso');
  }

  // 2. Repetir o gesto depois da falha conclui o trabalho, e devolve a contagem certa.
  {
    const eventos = [];
    const data = carregarData(adaptador(db).supabase, u, eventos);
    const n = await data.encerrarSerieAPartirDe(tocada);
    assert.equal(n, 2, 'a contagem e a de linhas realmente apagadas (abril e maio)');
    assert.deepEqual(eventos.sort(), ['alterados', 'widgets']);
    assert.deepEqual((await estado(db, filhas)).map((r) => r.d), ['2026-02-05', '2026-03-05'], 'os meses anteriores ficam');
    const m = (await db.query('select recurrence_skipped_months m from public.transactions where id=$1', [cab])).rows[0].m;
    assert.deepEqual(m, ['2026-04', '2026-05'], 'o gatilho marcou so os meses apagados');
    ok('repetir apos a falha conclui: devolve 2, preserva o passado, gatilho marca abril e maio');
  }

  // 3. Idempotencia: encerrar de novo nao apaga nada e devolve 0.
  {
    const data = carregarData(adaptador(db).supabase, u, []);
    assert.equal(await data.encerrarSerieAPartirDe(tocada), 0);
    assert.equal((await estado(db, filhas)).length, 2);
    ok('encerrar a serie ja encerrada devolve 0 e nao toca em nada');
  }

  // 4. Escopo por dono: outro usuario com o mesmo parent_id nao apaga nada (a cabeca nao e dele).
  {
    const outro = await novoUsuario(db);
    const data = carregarData(adaptador(db).supabase, outro, []);
    const n = await data.encerrarSerieAPartirDe({ parent_id: cab, occurred_on: '2026-01-01', installment_total: null });
    assert.equal(n, 0, 'o delete e restrito ao dono: nada de A sai');
    assert.equal((await estado(db, filhas)).length, 2);
    ok('outro dono chamando com a cabeca alheia nao apaga e nao para nada');
  }

  // 5. Efeito combinado com a 140000: apagar a origem agora preserva os 2 meses antigos.
  {
    await db.query('delete from public.transactions where id=$1', [cab]);
    const sobra = await estado(db, filhas);
    assert.equal(sobra.length, 2, 'apagar a origem encerrada nao leva os meses ligados a ela');
    assert.ok(sobra.every((r) => r.parent_id === null && r.recurring === false));
    ok('depois de encerrar, apagar a origem deixa os meses antigos como lancamentos comuns');
  }

  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de encerrar-serie-falhas passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });
