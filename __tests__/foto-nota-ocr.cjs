// lib/foto-nota-ocr.ts: o módulo real, com o ML Kit simulado. Confere os três
// desfechos, porque cada um vira uma mensagem diferente na tela e nenhum pode
// ser engolido em silêncio: lido, módulo nativo ausente, leitura que falhou.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compilar = (arq) => ts.transpileModule(fs.readFileSync(arq, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function carregar(mlkit) {
  const parser = { exports: {} };
  vm.runInNewContext(compilar('lib/nota-foto-parser.ts'), { exports: parser.exports, module: parser, Number, Set, RegExp, String });
  const mod = { exports: {} };
  const avisos = [];
  vm.runInNewContext(compilar('lib/foto-nota-ocr.ts'), {
    exports: mod.exports, module: mod, Promise, String,
    console: { warn: (...a) => avisos.push(['warn', ...a]), error: (...a) => avisos.push(['error', ...a]) },
    require(id) {
      if (id === './nota-foto-parser') return parser.exports;
      if (id === '@react-native-ml-kit/text-recognition') return mlkit();
      throw new Error('Import não simulado: ' + id);
    },
  });
  return { ...mod.exports, avisos };
}

// Objetos criados dentro do vm têm outro Object.prototype; comparar como JSON.
const plano = (x) => JSON.parse(JSON.stringify(x));
let ok = 0;
const passou = (n) => { ok++; console.log('  ok  ' + n); };

(async () => {
  {
    const chamadas = [];
    const m = carregar(() => ({ __esModule: true, default: { recognize: async (uri) => {
      chamadas.push(uri);
      return { text: '', blocks: [
        { lines: [{ text: 'MERCADO' }, { text: 'VALOR TOTAL R$ 42,50' }] },
        { lines: [{ text: 'CARTAO 42,50' }] },
      ] };
    } } }));
    const r = await m.lerTotalDaFoto('file:///foto.jpg');
    assert.deepEqual(chamadas, ['file:///foto.jpg']);
    assert.equal(r.ok, true);
    assert.equal(r.total.valorTotal, 42.5);
    assert.equal(r.texto.split('\n').length, 3, 'as linhas de todos os blocos entram no texto');
    passou('foto lida: junta as linhas dos blocos e acha o total');
  }
  {
    const m = carregar(() => { throw new Error('Cannot find module'); });
    const r = await m.lerTotalDaFoto('file:///foto.jpg');
    assert.deepEqual(plano(r), { ok: false, motivo: 'indisponivel' });
    assert.equal(m.avisos.length, 1, 'módulo ausente deixa log, não some calado');
    passou('sem o módulo (Expo Go, build antiga): indisponível, com log');
  }
  {
    const m = carregar(() => ({ __esModule: true, default: { recognize: async () => {
      throw new Error("The package '@react-native-ml-kit/text-recognition' doesn't seem to be linked.");
    } } }));
    const r = await m.lerTotalDaFoto('file:///foto.jpg');
    assert.deepEqual(plano(r), { ok: false, motivo: 'indisponivel' });
    passou('módulo importa mas o nativo não está ligado: indisponível');
  }
  {
    const m = carregar(() => ({ __esModule: true, default: { recognize: async () => { throw new Error('OOM'); } } }));
    const r = await m.lerTotalDaFoto('file:///foto.jpg');
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    assert.equal(m.avisos[0][0], 'error', 'falha de leitura deixa log de erro');
    passou('leitura que falha: "falhou", com log de erro');
  }
  console.log('\n' + ok + '/' + ok + ' checagens de foto-nota-ocr passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });
