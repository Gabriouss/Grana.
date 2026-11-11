const assert = require('node:assert/strict');
const { ambiente, flush, pendente } = require('./helpers/react-fronteiras.cjs');
const rejeicoes = [];
process.on('unhandledRejection', e => rejeicoes.push(e));
function preparar({ ler = async () => null, gravar = async () => {}, prevenir = async () => {}, permitir = async () => {}, plataforma = 'android' } = {}) {
  const chamadas = [];
  const a = ambiente({ '@react-native-async-storage/async-storage': {
    getItem: k => { chamadas.push(['ler', k]); return ler(); },
    setItem: (k, v) => { chamadas.push(['gravar', v]); return gravar(v); },
  } });
  a.rn.Platform.OS = plataforma;
  // Inclui o JS instalado do Expo: seus activeTags também fazem parte da regressão.
  const sdk = a.carregar('node_modules/expo-screen-capture/src/ScreenCapture.ts', {
    expo: { createPermissionHook: () => () => {}, PermissionStatus: {} },
    'expo-modules-core': { UnavailabilityError: Error },
    './ExpoScreenCapture': {
      preventScreenCapture: () => { chamadas.push(['prevenir']); return prevenir(); },
      allowScreenCapture: () => { chamadas.push(['permitir']); return permitir(); },
    },
  });
  const mod = a.carregar('lib/screen-capture-context.tsx', { 'expo-screen-capture': sdk });
  const p = a.montar(() => mod.ScreenCaptureProvider({ children: 'app' }));
  return { ...a, chamadas, valor: () => p.render().props.value };
}
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
caso('não confirma proteção antes da resolução nativa', async () => {
  const n = pendente(), a = preparar({ prevenir: () => n.promise });
  assert.equal(a.valor().bloqueado, false); await flush(); assert.equal(a.valor().bloqueado, false);
  assert.equal(a.chamadas.filter(c => c[0] === 'prevenir').length, 1);
  n.resolve(); await flush(); assert.equal(a.valor().bloqueado, true);
});
caso('leitura falha mantém padrão seguro aplicado e avisa sem dados privados', async () => {
  const a = preparar({ ler: async () => { throw Error('SEGREDO PRIVADO'); } }); await flush();
  assert.equal(a.valor().bloqueado, true); assert.equal(a.chamadas.filter(c => c[0] === 'prevenir').length, 1);
  assert.ok(a.alertas.length); assert.ok(a.logs.length); assert.doesNotMatch(JSON.stringify([a.logs, a.alertas]), /SEGREDO PRIVADO/);
});
caso('padrão seguro não espera leitura pendente', async () => {
  const l = pendente(), a = preparar({ ler: () => l.promise }); await flush();
  assert.equal(a.chamadas[0][0], 'prevenir'); assert.equal(a.valor().bloqueado, true);
  l.resolve(null); await flush();
});
caso('preferência desligada só muda após confirmação Android', async () => {
  const n = pendente(), a = preparar({ ler: async () => '0', permitir: () => n.promise }); await flush();
  assert.equal(a.valor().bloqueado, true); assert.equal(a.chamadas.filter(c => c[0] === 'permitir').length, 1);
  n.resolve(); await flush(); assert.equal(a.valor().bloqueado, false);
});
caso('falha nativa não confirma, não persiste e pode tentar realmente de novo', async () => {
  let falhar = true;
  const a = preparar({ prevenir: async () => { if (falhar) throw Error('SEGREDO PRIVADO'); } }); await flush();
  assert.equal(a.valor().bloqueado, false); assert.ok(a.alertas.length); assert.ok(a.logs.length);
  assert.equal(a.chamadas.filter(c => c[0] === 'gravar').length, 0);
  falhar = false; await a.valor().alternar(); await flush(); assert.equal(a.valor().bloqueado, true);
  assert.equal(a.chamadas.filter(c => c[0] === 'prevenir').length, 2);
  assert.doesNotMatch(JSON.stringify([a.logs, a.alertas]), /SEGREDO PRIVADO/);
});
caso('toggles concorrentes se aplicam em série ao estado confirmado', async () => {
  const n = pendente(), a = preparar({ permitir: () => n.promise }); await flush();
  const alternar = a.valor().alternar, p = alternar(), q = alternar(); await flush();
  assert.equal(a.valor().bloqueado, true);
  assert.equal(a.chamadas.filter(c => c[0] === 'permitir').length, 1);
  assert.equal(a.chamadas.filter(c => c[0] === 'prevenir').length, 1);
  assert.equal(a.chamadas.filter(c => c[0] === 'gravar').length, 0);
  n.resolve(); await Promise.all([p, q]); await flush(); assert.equal(a.valor().bloqueado, true);
  assert.deepEqual(a.chamadas.filter(c => ['prevenir', 'permitir'].includes(c[0])).map(c => c[0]), ['prevenir', 'permitir', 'prevenir']);
  assert.deepEqual(a.chamadas.filter(c => c[0] === 'gravar').map(c => c[1]), ['0', '1']);
});
caso('escrita rejeitada preserva estado nativo confirmado, avisa e libera fila', async () => {
  const a = preparar({ gravar: async () => { throw Error('SEGREDO PRIVADO'); } }); await flush();
  await a.valor().alternar(); assert.equal(a.valor().bloqueado, false); assert.ok(a.alertas.length);
  await a.valor().alternar(); assert.equal(a.valor().bloqueado, true);
  assert.doesNotMatch(JSON.stringify([a.logs, a.alertas]), /SEGREDO PRIVADO/);
});
caso('falha ao desligar não grava sucesso e deixa fila recuperável', async () => {
  let falhar = true; const a = preparar({ permitir: async () => { if (falhar) throw Error('SEGREDO PRIVADO'); } }); await flush();
  await a.valor().alternar(); assert.equal(a.valor().bloqueado, false); assert.ok(a.alertas.length);
  assert.equal(a.chamadas.filter(c => c[0] === 'gravar').length, 0);
  falhar = false; await a.valor().alternar(); assert.equal(a.valor().bloqueado, true);
  assert.equal(a.chamadas.filter(c => c[0] === 'prevenir').length, 2);
});
caso('recibo também é protegido se Alert falha', async () => {
  const a = preparar({ ler: async () => { throw Error('SEGREDO PRIVADO'); } });
  a.rn.Alert.alert = () => { throw Error('SEGREDO PRIVADO'); }; await flush();
  assert.equal(a.valor().bloqueado, true); assert.ok(a.logs.length >= 2);
  await a.valor().alternar(); assert.equal(a.valor().bloqueado, false);
  assert.doesNotMatch(JSON.stringify(a.logs), /SEGREDO PRIVADO/);
});
caso('falha na limpeza da chave Expo não impede outra tentativa nativa', async () => {
  let falhar = true;
  const a = preparar({ prevenir: async () => { if (falhar) throw Error('SEGREDO PRIVADO'); }, permitir: async () => { throw Error('SEGREDO PRIVADO'); } }); await flush();
  assert.equal(a.valor().bloqueado, false); assert.ok(a.alertas.length); assert.ok(a.logs.length >= 2);
  falhar = false; await a.valor().alternar(); assert.equal(a.valor().bloqueado, true);
  assert.equal(a.chamadas.filter(c => c[0] === 'prevenir').length, 2);
});
caso('web e iOS não chamam armazenamento nem Android', async () => {
  for (const plataforma of ['web', 'ios']) { const a = preparar({ plataforma }); await flush(); await a.valor().alternar(); assert.equal(a.valor().disponivel, false); assert.equal(a.valor().bloqueado, false); assert.equal(a.chamadas.length, 0); }
});
(async () => {
  let falhas = 0;
  for (const [nome, fn] of casos) { try { await fn(); console.log('OK ' + nome); } catch (e) { falhas++; console.error('FALHA ' + nome + ': ' + e.message); } }
  await new Promise(setImmediate); assert.equal(rejeicoes.length, 0, 'rejeições não tratadas');
  console.log(`${casos.length - falhas}/${casos.length} grupos`); process.exitCode = falhas ? 1 : 0;
})().catch(e => { console.error(e.message); process.exitCode = 1; });
