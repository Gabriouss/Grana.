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
  for (const texto of [
    'Mercado 34,57 no C6', 'TV 1080p em 12x', 'Água 100ml',
    'internet 5g 120 reais', 'comprei em 12x de 50 reais',
    'merenda de cinquenta e sete reais e sessenta e seis centavos',
    'uber 23,50', 'mercado 120 reais',
  ]) {
    assert.equal(api.temNumeralPartido(texto), false, 'escrita legítima barrada: ' + texto);
    assert.equal(api.ehEcoDoPrompt(texto), false, 'fala legítima tratada como eco: ' + texto);
  }

  /* Os dois casos REAIS de 08/09/2026, na íntegra.

     O do numeral partido é a frase exata que produziu a notificação
     "Merenda de 57quenta e — R$ 7,66 · salvo no Grana." quando o autor tinha
     falado R$ 57,66: rodada no parser, ela devolve 7,66 com categoria
     Alimentação, que são as duas condições do salvamento automático do
     widget. Por isso ela é asserida inteira, e não numa versão encurtada —
     é o comprimento todo que reproduz o defeito. */
  assert.equal(api.temNumeralPartido('Merenda de 57quenta e sete reais e sessenta e seis centavos'), true);
  assert.equal(api.temNumeralPartido('vinte 20mil reais'), true, '"20mil" é a mesma corrupção');

  /* O eco do vídeo parou no meio do prompt e nunca chegou ao fim dele, então
     a comparação precisa ser por TRECHO. Derivado do PROMPT_TRANSCRICAO real
     em vez de colado: uma cópia testaria um prompt que deixa de existir no
     minuto em que alguém reescrever a instrução, que foi exatamente o que
     aconteceu quando este defeito foi corrigido. */
  const truncado = api.PROMPT_TRANSCRICAO.slice(0, Math.floor(api.PROMPT_TRANSCRICAO.length * 0.6)) + '!';
  assert.equal(api.ehEcoDoPrompt(truncado), true, 'eco truncado precisa ser reconhecido');

  /* Falha honesta quando ninguém ouviu: com os DOIS provedores devolvendo
     lixo, o resultado tem de ser null. É o que faz quem chamou dizer "não
     entendi" em vez de abrir uma folha preenchida com o prompt e R$ 0,00. */
  r = await run(() => Response.json({ text: truncado }), () => Response.json({ text: 'Merenda de 57quenta e sete reais' }));
  assert.equal(r.result, null, 'lixo nos dois provedores nunca pode virar lançamento');

  /* Guarda de regressão do PRÓPRIO prompt, que é a causa raiz dos dois
     defeitos: mandar o Whisper escrever dígitos faz ele ecoar a instrução no
     silêncio e produzir híbridos como "57quenta" na fala. O parser já lê a
     forma falada sem ajuda ("onze e setenta e nove" -> 11,79), então a
     instrução nunca precisou existir. Se alguém reintroduzir, quebra aqui. */
  assert.ok(
    !/(vírgula|virgula) como separador|nunca ponto|11[.,]79|use d[íi]gitos/i.test(api.PROMPT_TRANSCRICAO),
    'o prompt voltou a induzir formatação numérica — foi essa instrução que causou o eco e o numeral partido'
  );

  console.log('OK fallback: sucesso rápido sem chamada paga, falha rápida, primário pendurado, falha de ambos, eco do prompt e numeral partido.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
