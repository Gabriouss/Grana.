const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const sentinel = 'SENTINELA_EMAIL_SEGREDO_TRANSCRICAO';
async function main() {
  // O mesmo helper executado por app/widget e WhatsApp, sem rede real.
  for (const canal of ['app', 'widget', 'whatsapp']) {
    for (const modo of ['http', 'excecao', 'json', 'sucesso']) {
      const logs = [];
      let leituras = 0;
      const api = {};
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/voice-transcription.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText, {
        exports: api, require: () => ({ normalizarTextoTranscrito: x => x }),
        Blob, FormData, setTimeout, clearTimeout,
        console: Object.fromEntries(['log', 'warn', 'error'].map(k => [k, (...args) => logs.push(args)])),
      });
      const r = await api.transcrever(new ArrayBuffer(4), {
        mimeType: 'audio/m4a', nomeArquivo: 'audio.m4a',
        provedores: [{ nome: 'groq', url: 'https://fake', model: 'fake', key: () => 'fake' }],
        fetchComTimeout: async () => {
          if (modo === 'excecao') throw new Error(sentinel);
          return { ok: modo !== 'http', status: 503, text: async () => { leituras++; return sentinel; },
            body: { cancel: async () => {} }, json: async () => {
              if (modo === 'json') throw new Error(sentinel);
              return { text: sentinel };
            } };
        },
      });
      assert.equal(JSON.stringify(logs).includes(sentinel), false, `${canal}/${modo}`);
      assert.equal(leituras, 0);
      assert.equal(r?.texto ?? null, modo === 'sucesso' ? sentinel : null);
    }
  }
  console.log('transcricao-log-seguro: 12 cenarios, modulo real, sem conteudo externo no log');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
