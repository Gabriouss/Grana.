/*
 * Reconhecedor do aparelho ausente: sem erro solto na tela (26/09/2026).
 *
 *   node __tests__/voz-local-sem-modulo.cjs
 *
 * No Expo Go o módulo nativo `ExpoSpeechRecognition` não existe, e o pacote
 * `expo-speech-recognition` lança ao carregar. O Metro manda esse erro ao
 * LogBox como "Uncaught Error" e DEVOLVE `undefined` ao `import()`, em vez de
 * rejeitar (metro-runtime, `guardedLoadModule`). O autor viu isso no celular.
 * A transcrição seguia certa pelo servidor, mas com o erro solto na tela.
 *
 * Módulo REAL `lib/voz-local.ts`. O dublê do pacote do reconhecedor falha o
 * teste se for carregado quando o módulo nativo não existe.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function carregarVozLocal(presente, carregamentos) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/voz-local.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console: { ...console, warn() {} }, Promise, setTimeout, clearTimeout, Math, Number, Error,
    require(id) {
      if (id === 'react-native') return { Platform: { OS: 'android', Version: 34 } };
      if (id === 'expo-modules-core') {
        return { requireOptionalNativeModule: (nome) => (nome === 'ExpoSpeechRecognition' && presente ? {} : null) };
      }
      carregamentos.push(id);
      if (id === 'expo-speech-recognition') {
        if (!presente) assert.fail('o pacote do reconhecedor foi carregado sem o módulo nativo');
        return { ExpoSpeechRecognitionModule: { supportsOnDeviceRecognition: () => false } };
      }
      throw new Error('import não simulado: ' + id);
    },
  }, { filename: 'lib/voz-local.ts' });
  return exports;
}

(async () => {
  const semModulo = [];
  const ausente = carregarVozLocal(false, semModulo);
  assert.equal(ausente.reconhecedorLocalPresente(), false);
  assert.equal(await ausente.transcreverNoAparelho('file:///a.m4a', 5000), null, 'sem o módulo, a fala segue pelo servidor');
  assert.deepEqual(semModulo, [], 'e o pacote do reconhecedor nem é carregado');
  console.log('  ok  sem o módulo nativo (Expo Go), nada é carregado e a transcrição segue pelo servidor');

  const comModulo = [];
  const presente = carregarVozLocal(true, comModulo);
  assert.equal(presente.reconhecedorLocalPresente(), true);
  assert.equal(await presente.transcreverNoAparelho('file:///a.m4a', 5000), null);
  assert.ok(comModulo.includes('expo-speech-recognition'), 'com o módulo, o reconhecedor do aparelho é tentado');
  console.log('  ok  com o módulo nativo, o reconhecedor do aparelho continua sendo tentado');

  const perfil = fs.readFileSync(path.join(root, 'app/(app)/perfil.tsx'), 'utf8');
  const botao = perfil.slice(perfil.indexOf('Preparar português para voz offline') - 1500, perfil.indexOf('Preparar português para voz offline'));
  assert.ok(botao.indexOf('reconhecedorLocalPresente()') > 0
    && botao.indexOf('reconhecedorLocalPresente()') < botao.indexOf("import('expo-speech-recognition')"),
    'o botão do Perfil pergunta pelo módulo antes de carregar o pacote');
  console.log('  ok  o botão "Preparar português para voz offline" pergunta antes de carregar');
  console.log('\n3/3 checagens do reconhecedor ausente passaram');
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
