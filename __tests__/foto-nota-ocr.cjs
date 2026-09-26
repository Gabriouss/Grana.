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

/* Relógio do sandbox: o prazo de produção (20 s) não é encurtado no código;
   aqui um timer com esse tamanho dispara na hora, e o teste confere QUAL prazo
   o módulo pediu. */
const timers = { pedidos: [], ativos: new Set() };
function setTimeoutControlado(fn, ms) {
  timers.pedidos.push(ms);
  const t = setTimeout(() => { timers.ativos.delete(t); fn(); }, 0);
  timers.ativos.add(t);
  return t;
}
function clearTimeoutControlado(t) { timers.ativos.delete(t); clearTimeout(t); }

function carregar(mlkit) {
  const parser = { exports: {} };
  vm.runInNewContext(compilar('lib/nota-foto-parser.ts'), { exports: parser.exports, module: parser, Number, Set, RegExp, String });
  const mod = { exports: {} };
  const avisos = [];
  vm.runInNewContext(compilar('lib/foto-nota-ocr.ts'), {
    exports: mod.exports, module: mod, Promise, String, Error,
    setTimeout: setTimeoutControlado, clearTimeout: clearTimeoutControlado,
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

/* Vigia: sem o prazo no módulo, a leitura pendurada deixaria o Node sair
   calado, com código 0, e o test:ci passaria. */
const vigia = setTimeout(() => { console.error('FALHOU: a leitura ficou pendurada (sem prazo?)'); process.exit(1); }, 5000);

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
  {
    /* N2/C1-c (26/09/2026): recognize que nunca resolve nem rejeita, como o
       ML Kit em laço de entrega do Play Services. Antes a tela ficava presa. */
    timers.pedidos.length = 0;
    let soltarTarde;
    const m = carregar(() => ({ __esModule: true, default: { recognize: () => new Promise((r) => { soltarTarde = r; }) } }));
    const r = await m.lerTotalDaFoto('file:///foto.jpg');
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    assert.deepEqual(timers.pedidos, [20000], 'o prazo pedido é o de produção, 20 s');
    assert.equal(m.PRAZO_LEITURA_MS, 20000);
    assert.ok(m.avisos.some((a) => a[0] === 'error' && /20 s/.test(String(a[2]?.message))), 'o estouro deixa log de erro com o prazo');
    soltarTarde({ text: '', blocks: [{ lines: [{ text: 'TOTAL 10,00' }] }] });
    await new Promise((res) => setTimeout(res, 5));
    passou('leitura que não termina: "falhou" no prazo de 20 s, e a resposta tardia é ignorada');
  }
  {
    /* Leitura normal não deixa o timer do prazo pendurado. */
    timers.pedidos.length = 0;
    const m = carregar(() => ({ __esModule: true, default: { recognize: async () => ({ text: '', blocks: [{ lines: [{ text: 'TOTAL R$ 5,00' }] }] }) } }));
    const r = await m.lerTotalDaFoto('file:///foto.jpg');
    assert.equal(r.ok, true);
    assert.equal(timers.ativos.size, 0, 'o prazo é desarmado quando a leitura termina antes');
    passou('leitura dentro do prazo desarma o timer');
  }
  clearTimeout(vigia);
  console.log('\n' + ok + '/' + ok + ' checagens de foto-nota-ocr passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });
