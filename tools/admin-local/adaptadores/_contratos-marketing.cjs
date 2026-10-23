'use strict';
// Módulos reais compartilhados; nenhum caminho vem da requisição.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '../../..');
const permitidos = new Set([
  'lib/admin-analytics.ts', 'supabase/functions/_shared/admin-meta.ts',
  'supabase/functions/_shared/admin-analytics.ts', 'supabase/functions/_shared/admin-agregados.ts',
  'supabase/functions/_shared/request-body.ts', 'supabase/functions/_shared/admin-marketing.ts',
  'supabase/functions/_shared/admin-publicacoes-simulacao.ts', 'supabase/functions/_shared/marketing-simulacao.ts',
  'supabase/functions/_shared/admin-publicacoes-reais.ts',
  'supabase/functions/_shared/marketing-real-incidentes.ts',
  'supabase/functions/_shared/marketing-real-heartbeat.ts',
  'supabase/functions/_shared/marketing-real-graph.ts', 'supabase/functions/_shared/seguranca.ts',
]);
const cache = new Map();
function carregar(relativo) {
  const arquivo = path.resolve(raiz, relativo);
  const chave = path.relative(raiz, arquivo).split(path.sep).join('/');
  if (!permitidos.has(chave)) throw new Error('contrato-nao-permitido');
  if (cache.has(chave)) return cache.get(chave).exports;
  const js = ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  cache.set(chave, modulo);
  try {
    new Function('require', 'module', 'exports', js)(nome => {
      if (!nome.startsWith('.')) throw new Error('import-nao-permitido');
      return carregar(path.relative(raiz, path.resolve(path.dirname(arquivo), nome)));
    }, modulo, modulo.exports);
    return modulo.exports;
  } catch (e) { cache.delete(chave); throw e; }
}
module.exports = { carregar };
