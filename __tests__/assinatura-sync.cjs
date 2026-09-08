const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function carregar(dependencias) {
  const exports = {};
  const fonte = fs.readFileSync(path.join(root, 'lib/assinatura.ts'), 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    console: { warn() {}, error() {}, log() {} },
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error('Import não simulado: ' + id);
    },
  }, { filename: 'lib/assinatura.ts' });
  return exports;
}

async function main() {
  const chave = '@grana_token_ativacao_pendente';
  const storage = new Map();
  const chamadas = [];
  let respostas = {};
  const api = carregar({
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => storage.get(key) ?? null,
      setItem: async (key, value) => storage.set(key, value),
      removeItem: async (key) => storage.delete(key),
    },
    './supabase': {
      supabase: {
        rpc: async (nome) => {
          chamadas.push(nome);
          const resposta = respostas[nome];
          if (typeof resposta === 'function') return resposta();
          return resposta ?? { data: null, error: null };
        },
      },
    },
  });

  respostas = {
    vincular_assinatura_automatica: { data: null, error: { code: 'PGRST202', message: 'RPC ausente' } },
  };
  let resultado = await api.vincularAssinaturasPendentes();
  assert.equal(resultado.houveFalha, true);
  assert.equal(resultado.tokenPendente, false);
  assert.equal(resultado.motivo, 'sincronizacao_email');

  storage.set(chave, 'token-de-teste');
  respostas = {
    vincular_assinatura_automatica: { data: null, error: null },
    vincular_assinatura_por_token: { data: true, error: null },
  };
  resultado = await api.vincularAssinaturasPendentes();
  assert.equal(resultado.houveFalha, false);
  assert.equal(resultado.tokenPendente, false);
  assert.equal(storage.has(chave), false);

  storage.set(chave, 'token-recusado');
  respostas.vincular_assinatura_por_token = { data: false, error: null };
  resultado = await api.vincularAssinaturasPendentes();
  assert.equal(resultado.houveFalha, true);
  assert.equal(resultado.tokenPendente, true);
  assert.equal(resultado.motivo, 'token_recusado');
  assert.equal(storage.has(chave), true);
  assert.deepEqual(chamadas, [
    'vincular_assinatura_automatica',
    'vincular_assinatura_automatica',
    'vincular_assinatura_por_token',
    'vincular_assinatura_automatica',
    'vincular_assinatura_por_token',
  ]);

  console.log('OK sincronização de assinatura: falha visível, vínculo por token e retry preservado.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
