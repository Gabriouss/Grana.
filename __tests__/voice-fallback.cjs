const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/voice-transcription.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: api, Blob, FormData, console,
  setTimeout: (fn) => setTimeout(fn, 10), clearTimeout,
  require: () => ({ normalizarTextoTranscrito: (s) => s.trim() }),
});
async function run(primary, secondary) {
  const calls = [];
  const result = await api.transcrever(new ArrayBuffer(4), { mimeType: 'audio/m4a', nomeArquivo: 'qa.m4a',
    provedores: api.provedoresPadrao('qa', 'qa'), fetchComTimeout: async (url) => {
      const nome = url.includes('groq') ? 'groq' : 'openai'; calls.push(nome);
      return nome === 'groq' ? primary() : secondary();
    },
  });
  await new Promise((r) => setTimeout(r, 25));
  return { result, calls };
}
(async () => {
  const ok = () => Response.json({ text: 'mercado 32' });
  const fail = () => new Response('', { status: 503 });
  let r = await run(ok, ok); assert.deepEqual(r.calls, ['groq']);
  r = await run(fail, ok); assert.deepEqual(r.calls, ['groq', 'openai']); assert.equal(r.result.provedor, 'openai');
  r = await run(() => new Promise(() => {}), ok); assert.equal(r.result.provedor, 'openai');
  r = await run(fail, fail); assert.equal(r.result, null); assert.deepEqual(r.calls, ['groq', 'openai']);
  for (const texto of [api.PROMPT_TRANSCRICAO, 'Comando de voz em português do Brasil', 'Merenda 57quenta e sete reais']) {
    r = await run(() => Response.json({ text: texto }), ok);
    assert.equal(r.result.provedor, 'openai', 'transcrição corrompida aciona fallback');
  }
  for (const texto of ['Mercado 34,57 no C6', 'TV 1080p em 12x', 'Água 100ml']) {
    assert.equal(api.temNumeralPartido(texto), false, texto);
  }
  console.log('OK fallback: sucesso rápido sem chamada paga, falha rápida, primário pendurado e falha de ambos.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
