// V33: a mesma lista precisa manter a ordem depois de uma nova sessao.
// Executa lib/goals.ts real; o duble aplica a ordenacao pedida ao Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const metas = [
  { id: 'b', title: 'Viagem', created_at: '2026-10-15T12:00:00Z', current_amount: 0 },
  { id: 'a', title: 'Reserva', created_at: '2026-10-15T12:00:00Z', current_amount: 100 },
  { id: 'c', title: 'Casa', created_at: '2026-10-16T12:00:00Z', current_amount: 0 },
];

function carregar(linhas, erro = null) {
  const ordens = [];
  const consulta = {
    select(colunas) { assert.equal(colunas, '*'); return this; },
    order(coluna, opcoes) { ordens.push([coluna, opcoes.ascending]); return this; },
    then(resolve, reject) {
      const data = [...linhas].sort((a, b) => {
        for (const [coluna, asc] of ordens) {
          const diferenca = a[coluna] < b[coluna] ? -1 : a[coluna] > b[coluna] ? 1 : 0;
          if (diferenca) return asc ? diferenca : -diferenca;
        }
        return 0;
      });
      return Promise.resolve({ data, error: erro }).then(resolve, reject);
    },
  };
  const deps = {
    './supabase': { supabase: { from(tabela) { assert.equal(tabela, 'goals'); return consulta; } } },
    './cache-de-tela': {
      comCacheOffline(chave, buscar) { return buscar; },
      invalidarRespostasAtrasadas() {},
    },
    './sessao-offline': { idDoUsuarioLocal: async () => 'usuario' },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
  };
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/goals.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require(id) { if (id in deps) return deps[id]; throw new Error('Import inesperado: ' + id); },
  }, { filename: 'lib/goals.ts' });
  return exports;
}

(async () => {
  // Duas sessoes independentes, com ordem fisica inversa para os empates.
  const antes = await carregar(metas).fetchGoals();
  const depois = await carregar([...metas].reverse()).fetchGoals();
  assert.deepEqual(antes.map(g => g.id), ['a', 'b', 'c']);
  assert.deepEqual(depois.map(g => g.id), antes.map(g => g.id));
  console.log('ok: empate de created_at nao muda a ordem entre sessoes');

  // Data continua primaria: o desempate por id nao vira ordem alfabetica/global.
  const datasDistintas = await carregar([
    { id: 'a', created_at: '2026-10-16T12:00:00Z' },
    { id: 'z', created_at: '2026-10-14T12:00:00Z' },
  ]).fetchGoals();
  assert.deepEqual(datasDistintas.map(g => g.id), ['z', 'a']);
  console.log('ok: criacao mais antiga continua primeiro');

  assert.deepEqual(await carregar([]).fetchGoals(), []);
  console.log('ok: lista vazia');

  const erro = { code: '42501', message: 'negado' };
  await assert.rejects(carregar(metas, erro).fetchGoals(), e => e === erro);
  console.log('ok: falha permanente continua visivel ao chamador');
})().catch(e => { console.error(e); process.exitCode = 1; });
