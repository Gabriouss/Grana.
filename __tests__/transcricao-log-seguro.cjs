const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const sentinel = 'SENTINELA_EMAIL_SEGREDO_TRANSCRICAO';
async function conferirLogDaTarefa() {
  const tecnico = 'confiabilidade.textoVozSemDicaDeCategoria is not a function';
  for (const source of ['app', 'widget']) {
    for (const [erro, esperado] of [
      [new TypeError(tecnico), tecnico],
      [vm.runInNewContext(`new TypeError(${JSON.stringify(tecnico)})`), tecnico],
      [new ReferenceError('funcaoAusente is not defined'), 'funcaoAusente is not defined'],
      [new Error(sentinel), 'mensagem omitida'],
      [new TypeError(`Cannot read properties of undefined (reading '${sentinel}')`), 'Cannot read properties of undefined'],
      [new TypeError(`${tecnico}: ${sentinel}`), 'mensagem omitida'],
    ]) {
      const logs = [], chamadas = [];
      const api = {};
      const desfecho = require('./desfecho-voz-real.cjs');
      const dubles = {
        'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
        './offline-cache': { isLikelyNetworkError: () => false },
        './sessao-offline': { idDoUsuarioLocal: async () => 'u-teste' },
        '@/modules/grana-voice-widget': { definirEstado: e => chamadas.push(['estado', e]) },
        './widget-voz-pendentes': {
          reservarFalaEmAndamento: async () => true,
          liberarFalaEmAndamento: async () => {},
          reservarVozPendente: async () => { chamadas.push(['reserva']); return true; },
          removerVozPendente: async () => chamadas.push(['remove']),
        },
        './voice-operations': {
          desfechoDoErroVoz: desfecho.desfechoDoErroVoz,
          registrarOperacaoVoz: async () => chamadas.push(['grava']),
        },
        './voz': { transcreverAudio: async () => { chamadas.push(['transcreve']); throw erro; } },
        './heuristics': {}, './data': {},
        'expo-file-system/legacy': { deleteAsync: async () => chamadas.push(['apaga']) },
      };
      vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/widget-voz-task.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText, {
        exports: api, Error, Date, setTimeout, clearTimeout,
        console: Object.fromEntries(['log', 'warn', 'error'].map(k => [k, (...args) => logs.push(args)])),
        require(id) {
          if (id in dubles) return dubles[id];
          if (id in require('./modulos-puros-reais.cjs')) return require('./modulos-puros-reais.cjs')[id];
          throw new Error('Import não simulado: ' + id);
        },
      });
      await api.executarTarefa({ source, caminho: '/audio-teste.m4a', requestId: 'req-teste', userId: 'u-teste' }, {
        podeNotificar: async () => true,
        notificarFalha: async codigo => chamadas.push(['falha', codigo]),
      });
      assert.ok(chamadas.some(c => c[0] === 'transcreve'), 'exercita o catch real após transcrição');
      assert.equal(chamadas.filter(c => c[0] === 'grava').length, 0, 'nenhuma gravação financeira');
      assert.equal(chamadas.filter(c => c[0] === 'falha' && c[1] === 'erro_interno').length, 1, 'um recibo de falha');
      const log = logs.find(a => a[0] === '[voz:widget] tarefa interrompida');
      assert.ok(log, 'diagnóstico presente');
      assert.ok(log.includes(esperado), `${source}: mensagem técnica segura ${esperado}`);
      assert.equal(JSON.stringify(logs).includes(sentinel), false, `${source}: sem conteúdo externo`);
    }
  }
}
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
  await conferirLogDaTarefa();
  console.log('transcricao-log-seguro: 12 cenarios de transcricao + 12 de catch app/widget, modulos reais, sem conteudo externo no log');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
