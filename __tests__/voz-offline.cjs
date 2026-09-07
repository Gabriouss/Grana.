const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function carregar(file, deps) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (id) => { if (!(id in deps)) throw Error(id); return deps[id]; },
    console, setTimeout, clearTimeout, AbortController });
  return exports;
}
(async () => {
  const storage = new Map();
  let usuario = 'a', offline = true, envios = [];
  const operacoes = carregar('lib/voice-operations.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async k => storage.get(k) ?? null,
      setItem: async (k, v) => storage.set(k, v),
      removeItem: async k => storage.delete(k),
      getAllKeys: async () => [...storage.keys()],
      multiGet: async keys => keys.map(k => [k, storage.get(k)]),
    } },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: usuario } } } }) },
      rpc: (_, args) => ({ abortSignal: async () => {
        envios.push(args);
        if (offline) return { error: { message: 'Network request failed' } };
        return { data: { status: 'committed', operation_id: args.p_request_id, ids: ['tx'], replayed: false } };
      } }),
    } },
  });
  const payload = { kind: 'transaction', type: 'out', amount: 25.17, description: 'Merenda', category: 'Alimentação', color: '#fff', occurred_on: '2026-09-07' };
  assert.equal((await operacoes.registrarOperacaoVoz('id1', 'widget', payload)).status, 'pending');
  assert.equal(storage.size, 1);
  usuario = 'b'; offline = false;
  await operacoes.sincronizarOperacoesVoz();
  assert.equal(envios.length, 1, 'outra conta não sincroniza o gasto');
  usuario = 'a';
  await operacoes.registrarOperacaoVoz('id1', 'widget', { ...payload, amount: 100 });
  assert.equal(envios.at(-1).p_payload.amount, 25.17, 'retomada conserva valor original');
  assert.equal(storage.size, 0);
  await operacoes.sincronizarOperacoesVoz();
  assert.equal(envios.length, 2);

  offline = true;
  await operacoes.registrarOperacaoVoz('id2', 'widget', payload);
  await operacoes.registrarOperacaoVoz('id3', 'widget', payload);
  storage.set('grana:voz:operacao:a:corrompida', '{');
  offline = false;
  const primeiraSync = operacoes.sincronizarOperacoesVoz();
  const segundaSync = operacoes.sincronizarOperacoesVoz();
  assert.equal(primeiraSync, segundaSync, 'toques simultâneos aguardam a mesma tentativa');
  const resumo = await primeiraSync;
  assert.equal(resumo.sincronizadas, 2, 'fila realmente sincroniza após retorno da rede');
  assert.equal(resumo.falhas, 1, 'item corrompido permanece recuperável');
  assert.equal(storage.size, 1, 'só remove operações confirmadas');
  assert.ok(!resumo.mensagem.includes('conexão'), 'erro local não é apresentado como falta de internet');
  storage.clear();

  const listeners = new Map();
  let installed = true, starts = 0;
  const local = carregar('lib/voz-local.ts', {
    'react-native': { Platform: { OS: 'android', Version: 33 } },
    'expo-speech-recognition': { ExpoSpeechRecognitionModule: {
      supportsOnDeviceRecognition: () => true,
      getSupportedLocales: async () => ({ installedLocales: installed ? ['pt-BR'] : [] }),
      addListener: (event, cb) => { listeners.set(event, cb); return { remove: () => listeners.delete(event) }; },
      abort() {}, start: opts => {
        starts++;
        assert.equal(opts.requiresOnDeviceRecognition, true);
        assert.equal(opts.audioSource.uri, 'file:///voz.m4a');
        listeners.get('result')({ isFinal: true, results: [{ transcript: 'Merenda 25,17' }] });
        listeners.get('end')();
      },
    } },
  });
  assert.equal(await local.transcreverNoAparelho('file:///voz.m4a'), 'Merenda 25,17');
  assert.equal(listeners.size, 0);
  installed = false;
  assert.equal(await local.transcreverNoAparelho('file:///voz.m4a'), null);
  assert.equal(starts, 1, 'sem modelo não abre reconhecimento remoto do sistema');
  console.log('OK: reconhecimento local obrigatório, idioma instalado, persistência offline, isolamento de conta e retomada imutável.');
})().catch(e => { console.error(e); process.exitCode = 1; });
