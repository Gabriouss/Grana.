const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/_shared/ai-quota.ts'), 'utf8');
const api = {};
vm.runInNewContext(ts.transpileModule(fonte, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: api,
  console: { error() {}, warn() {}, log() {} },
});

(async () => {
  let chamada = null;
  const permitido = await api.consumirCotaIA({
    rpc: async (nome, parametros) => {
      chamada = { nome, parametros };
      return { data: [{ permitido: true, motivo: null, minuto_restante: 9, dia_restante: 119 }], error: null };
    },
  }, 'assistente');
  assert.equal(chamada.nome, 'consumir_cota_ia');
  assert.equal(chamada.parametros.p_tipo, 'assistente');
  assert.equal(permitido.permitido, true);
  assert.equal(permitido.motivo, null);
  assert.equal(permitido.minutoRestante, 9);
  assert.equal(permitido.diaRestante, 119);

  const bloqueado = await api.consumirCotaIA({
    rpc: async () => ({
      data: [{ permitido: false, motivo: 'dia', minuto_restante: 0, dia_restante: 0 }],
      error: null,
    }),
  }, 'voz');
  assert.equal(bloqueado.permitido, false);
  assert.match(api.mensagemCotaEsgotada('voz', bloqueado.motivo), /amanhã/);

  await assert.rejects(
    api.consumirCotaIA({
      rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'RPC ausente' } }),
    }, 'voz'),
    /ai_quota_unavailable/
  );
  console.log('OK cota de IA: reserva, bloqueio diário e falha da RPC ficam verificáveis.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
