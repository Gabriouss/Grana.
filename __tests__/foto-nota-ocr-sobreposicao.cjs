/*
 * Item 33 (20/11/2026): a leitura do ML Kit não cancela. Depois do prazo de
 * 20 s a tela segue, mas o `recognize` continua no nativo; a captura seguinte
 * chamava outro `recognize` por cima dele. Executa o `lib/foto-nota-ocr.ts`
 * REAL e conta as chamadas nativas: a nova captura espera a leitura vencida,
 * lê a PRÓPRIA foto e nunca devolve o resultado da antiga.
 *
 *   node __tests__/foto-nota-ocr-sobreposicao.cjs
 *   FOTO_OCR_ARQUIVO=<caminho> node __tests__/foto-nota-ocr-sobreposicao.cjs   (RED contra a base)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const arquivo = process.env.FOTO_OCR_ARQUIVO || path.join(root, 'lib/foto-nota-ocr.ts');
const compilar = (arq) => ts.transpileModule(fs.readFileSync(arq, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const giro = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
const plano = (x) => JSON.parse(JSON.stringify(x));

/** Módulo real com ML Kit controlado: cada `recognize` fica retido até o teste soltar. */
function carregar() {
  const parser = { exports: {} };
  vm.runInNewContext(compilar(path.join(root, 'lib/nota-foto-parser.ts')), { exports: parser.exports, module: parser, Number, Set, RegExp, String, Math });
  const reg = { leituras: [], apagadas: [], prazos: [] };
  const mod = { exports: {} };
  vm.runInNewContext(compilar(arquivo), {
    exports: mod.exports, module: mod, Promise, String, Error,
    setTimeout: (fn) => { const t = { fn, vivo: true }; reg.prazos.push(t); return t; },
    clearTimeout: (t) => { if (t) t.vivo = false; },
    console: { warn() {}, error() {}, log() {} },
    require(id) {
      if (id === './nota-foto-parser') return parser.exports;
      if (id === '@react-native-ml-kit/text-recognition') return { __esModule: true, default: {
        recognize: (uri) => new Promise((resolve, reject) => reg.leituras.push({ uri, resolve, reject })),
      } };
      if (id === 'expo-file-system/legacy') return {
        deleteAsync: async (uri) => { reg.apagadas.push(uri); },
        getInfoAsync: async () => ({ exists: false }),
        readDirectoryAsync: async () => [],
        cacheDirectory: 'file:///cache/',
      };
      throw new Error('Import não simulado: ' + id);
    },
  });
  const foto = (uri) => async () => ({ uri });
  const cupom = (valor) => ({ blocks: [{ lines: [{ text: 'VALOR TOTAL R$ ' + valor }] }] });
  /** Vence o prazo da captura `i` (na ordem em que os prazos foram armados). */
  const vencer = async (i) => { const t = reg.prazos[i]; assert.ok(t && t.vivo, 'prazo ' + i + ' armado e vivo'); t.vivo = false; t.fn(); await giro(); };
  return { m: mod.exports, reg, foto, cupom, vencer };
}

const falhas = [];
let aprovadas = 0;
async function caso(nome, corpo) {
  try { await corpo(); aprovadas++; console.log('  ok  ' + nome); }
  catch (e) { falhas.push(nome); console.log('  FALHOU  ' + nome + '\n          ' + (e && e.message)); }
}

process.exitCode = 1;
(async () => {
  console.log('\nItem 33: leitura vencida não sobrepõe a próxima (' + path.relative(root, arquivo) + ')');

  await caso('controle: duas leituras seguidas, cada uma lê a sua foto', async () => {
    const { m, reg, foto, cupom } = carregar();
    const a = m.fotografarELer(foto('file:///a.jpg'));
    await giro();
    reg.leituras[0].resolve(cupom('10,00'));
    assert.equal((await a).total.valorTotal, 10);
    const b = m.fotografarELer(foto('file:///b.jpg'));
    await giro();
    assert.equal(reg.leituras.length, 2);
    reg.leituras[1].resolve(cupom('20,00'));
    assert.equal((await b).total.valorTotal, 20);
  });

  await caso('leitura vencida ainda no nativo: a nova captura espera, lê a própria foto e não recebe o resultado velho', async () => {
    const { m, reg, foto, cupom, vencer } = carregar();
    const a = m.fotografarELer(foto('file:///a.jpg'));
    await giro();
    assert.equal(reg.leituras.length, 1);
    await vencer(0);
    assert.deepEqual(plano(await a), { ok: false, motivo: 'falhou' }, 'a tela segue no prazo');
    const b = m.fotografarELer(foto('file:///b.jpg'));
    await giro();
    assert.equal(reg.leituras.length, 1, 'recognize sobreposto: a leitura vencida ainda está no nativo');
    reg.leituras[0].resolve(cupom('99,00'));
    await giro();
    assert.equal(reg.leituras.length, 2, 'depois que a antiga volta, a nova lê');
    assert.equal(reg.leituras[1].uri, 'file:///b.jpg', 'a nova lê a própria foto');
    reg.leituras[1].resolve(cupom('20,00'));
    const r = await b;
    assert.equal(r.ok, true);
    assert.equal(r.total.valorTotal, 20, 'o valor é da foto nova, nunca o 99,00 da antiga');
  });

  await caso('leitura vencida que nunca volta: a nova captura vence o próprio prazo sem chamar o nativo e apaga a foto', async () => {
    const { m, reg, foto, vencer } = carregar();
    const a = m.fotografarELer(foto('file:///a.jpg'));
    await giro();
    await vencer(0);
    await a;
    const b = m.fotografarELer(foto('file:///b.jpg'));
    await giro();
    await vencer(1);
    assert.deepEqual(plano(await b), { ok: false, motivo: 'falhou' });
    assert.equal(reg.leituras.length, 1, 'nenhum recognize novo por cima do pendente');
    await giro();
    assert.ok(reg.apagadas.includes('file:///b.jpg'), 'a foto nova não fica no cache');
  });

  await caso('leitura vencida que falha tarde: a nova captura segue e lê', async () => {
    const { m, reg, foto, cupom, vencer } = carregar();
    const a = m.fotografarELer(foto('file:///a.jpg'));
    await giro();
    await vencer(0);
    await a;
    const b = m.fotografarELer(foto('file:///b.jpg'));
    await giro();
    reg.leituras[0].reject(new Error('memória'));
    await giro();
    assert.equal(reg.leituras.length, 2, 'falha da antiga libera a nova');
    reg.leituras[1].resolve(cupom('7,50'));
    assert.equal((await b).total.valorTotal, 7.5);
  });

  if (falhas.length) {
    console.error('\n' + falhas.length + ' falha(s), ' + aprovadas + ' aprovada(s)\n');
    process.exit(1);
  }
  console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de sobreposição do OCR passaram — 0 falhas\n');
  process.exitCode = 0;
})().catch((e) => { console.error('\nFALHOU: ' + (e && e.stack || e)); process.exit(1); });
