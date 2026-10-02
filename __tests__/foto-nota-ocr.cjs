// lib/foto-nota-ocr.ts: o módulo REAL, com o ML Kit, a câmera e o disco
// simulados. Confere cada desfecho, porque cada um vira uma mensagem diferente
// na tela e nenhum pode ser engolido em silêncio, e confere o PRAZO TOTAL: do
// toque até o resultado, cobrindo a foto, o carregamento do módulo e a leitura
// (N2, reaberto em 26/09/2026: o prazo cobria só o reconhecimento, e a tela
// passou quase um minuto em "Lendo a nota...").
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compilar = (arq) => ts.transpileModule(fs.readFileSync(arq, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

// Virtual clock: flush microtasks before advancing the module timer.
const timers = { pedidos: [], ativos: new Map(), agora: 0 };
function setTimeoutControlado(fn, ms) {
  timers.pedidos.push(ms);
  const t = { fn, em: timers.agora + ms };
  timers.ativos.set(t, t);
  return t;
}
function clearTimeoutControlado(t) { timers.ativos.delete(t); }
const nunca = () => new Promise(() => {});
const giro = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
async function aguardar(pendente) {
  let terminou = false, resultado, erro;
  pendente.then((r) => { resultado = r; terminou = true; }, (e) => { erro = e; terminou = true; });
  await giro();
  if (!terminou) {
    const proximo = [...timers.ativos.values()].sort((a, b) => a.em - b.em)[0];
    assert.ok(proximo, 'pending without a deadline in the real module');
    timers.agora = proximo.em;
    timers.ativos.delete(proximo);
    proximo.fn();
    await giro();
  }
  assert.ok(terminou, 'still pending after advancing the virtual clock');
  if (erro) throw erro;
  return resultado;
}

function carregar({ mlkit, deleteAsync } = {}) {
  const parser = { exports: {} };
  vm.runInNewContext(compilar('lib/nota-foto-parser.ts'), { exports: parser.exports, module: parser, Number, Set, RegExp, String, Math });
  const disco = { apagadas: [], existe: new Set() };
  const mod = { exports: {} };
  const avisos = [];
  vm.runInNewContext(compilar('lib/foto-nota-ocr.ts'), {
    exports: mod.exports, module: mod, Promise, String, Error,
    setTimeout: setTimeoutControlado, clearTimeout: clearTimeoutControlado,
    console: { warn: (...a) => avisos.push(['warn', ...a]), error: (...a) => avisos.push(['error', ...a]) },
    require(id) {
      if (id === './nota-foto-parser') return parser.exports;
      if (id === '@react-native-ml-kit/text-recognition') return mlkit();
      if (id === 'expo-file-system/legacy') return {
        deleteAsync: deleteAsync ?? (async (uri) => { disco.apagadas.push(uri); disco.existe.delete(uri); }),
        getInfoAsync: async (uri) => ({ exists: disco.existe.has(uri) || [...disco.existe].some((f) => f.startsWith(uri)) }),
        readDirectoryAsync: async (pasta) => [...disco.existe].filter((f) => f.startsWith(pasta)).map((f) => f.slice(pasta.length)),
        cacheDirectory: 'file:///cache/',
      };
      throw new Error('Import não simulado: ' + id);
    },
  });
  const foto = (uri = 'file:///foto.jpg') => async () => { disco.existe.add(uri); return { uri }; };
  return { ...mod.exports, avisos, disco, foto };
}
const kit = (recognize) => () => ({ __esModule: true, default: { recognize } });

// Objetos criados dentro do vm têm outro Object.prototype; comparar como JSON.
const plano = (x) => JSON.parse(JSON.stringify(x));
let ok = 0;
const passou = (n) => { ok++; console.log('  ok  ' + n); };


(async () => {
  {
    const chamadas = [];
    const m = carregar({ mlkit: kit(async (uri) => {
      chamadas.push(uri);
      return { text: '', blocks: [
        { lines: [{ text: 'MERCADO' }, { text: 'VALOR TOTAL R$ 42,50' }] },
        { lines: [{ text: 'CARTAO 42,50' }] },
      ] };
    }) });
    timers.pedidos.length = 0;
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.deepEqual(chamadas, ['file:///foto.jpg']);
    assert.equal(r.ok, true);
    assert.equal(r.total.valorTotal, 42.5);
    assert.deepEqual(timers.pedidos, [20000], 'um prazo só, o de produção');
    assert.equal(timers.ativos.size, 0, 'o prazo é desarmado quando tudo termina antes');
    await giro();
    assert.deepEqual(m.disco.apagadas, ['file:///foto.jpg'], 'a foto é apagada depois da leitura');
    assert.equal(m.avisos.length, 0);
    passou('foto lida: acha o total, desarma o prazo e apaga a foto');
  }
  {
    /* Cupom em colunas, como o ML Kit devolve: rótulos num bloco, valores
       noutro. Antes de 26/09/2026 o módulo juntava bloco a bloco e voltava
       sem total; agora junta por fileira, pela caixa de cada linha. */
    const L = (text, top, left) => ({ text, frame: { top, left, height: 30, width: 200 } });
    const m = carregar({ mlkit: kit(async () => ({ text: '', blocks: [
      { lines: [L('PADARIA AUDIT', 30, 90), L('VALOR TOTAL R$', 300, 40), L('Cartao de Debito', 345, 40)] },
      { lines: [L('18,75', 303, 610), L('18,75', 344, 610)] },
    ] })) });
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.equal(r.total.valorTotal, 18.75, JSON.stringify(plano(r)));
    assert.ok(r.texto.split('\n').includes('VALOR TOTAL R$ 18,75'));
    passou('cupom em colunas: rótulo e valor se encontram pela posição na foto');
  }
  {
    const m = carregar({ mlkit: () => { throw new Error('Cannot find module'); } });
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.deepEqual(plano(r), { ok: false, motivo: 'indisponivel' });
    assert.equal(m.avisos.length, 1, 'módulo ausente deixa log, não some calado');
    await giro();
    assert.deepEqual(m.disco.apagadas, ['file:///foto.jpg'], 'e a foto é apagada mesmo assim');
    passou('sem o módulo (Expo Go, build antiga): indisponível, com log, foto apagada');
  }
  {
    const m = carregar({ mlkit: kit(async () => {
      throw new Error("The package '@react-native-ml-kit/text-recognition' doesn't seem to be linked.");
    }) });
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.deepEqual(plano(r), { ok: false, motivo: 'indisponivel' });
    passou('módulo importa mas o nativo não está ligado: indisponível');
  }
  {
    const m = carregar({ mlkit: kit(async () => { throw new Error('OOM'); }) });
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    assert.equal(m.avisos[0][0], 'error', 'falha de leitura deixa log de erro');
    passou('leitura que falha: "falhou", com log de erro');
  }
  {
    const m = carregar({ mlkit: kit(async () => ({ blocks: [] })) });
    const r = await aguardar(m.fotografarELer(async () => { throw new Error('camera fechou'); }));
    assert.deepEqual(plano(r), { ok: false, motivo: 'sem_foto' });
    assert.ok(m.avisos.some((a) => a[0] === 'error' && /fotografar/.test(a[1])));
    passou('câmera que não entrega a foto: "sem_foto", com log');
  }

  /* ── Prazo total: cada etapa travada, uma de cada vez ─────────────────── */
  {
    // O reconhecimento nunca termina (o N2 original).
    timers.pedidos.length = 0;
    const m = carregar({ mlkit: kit(nunca) });
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    assert.deepEqual(timers.pedidos, [20000]);
    assert.ok(m.avisos.some((a) => a[0] === 'error' && /passaram de 20 s/.test(a[1])), 'o estouro deixa log com o prazo');
    await giro();
    assert.deepEqual(m.disco.apagadas, ['file:///foto.jpg'], 'a foto da leitura pendurada é apagada no estouro');
    passou('reconhecimento pendurado: "falhou" em 20 s, e a foto não fica no cache');
  }
  {
    // A FOTO nunca chega: antes, fora do prazo, a tela ficava em "Lendo a nota..." para sempre.
    const m = carregar({ mlkit: kit(async () => ({ blocks: [] })) });
    const r = await aguardar(m.fotografarELer(nunca));
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    passou('foto pendurada: coberta pelo mesmo prazo');
  }
  {
    // A foto chega DEPOIS do prazo: não é lida, é apagada na hora.
    let entregar;
    const lidas = [];
    const m = carregar({ mlkit: kit(async (uri) => { lidas.push(uri); return { blocks: [] }; }) });
    const r = await aguardar(m.fotografarELer(() => new Promise((res) => { entregar = res; })));
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    m.disco.existe.add('file:///tarde.jpg');
    entregar({ uri: 'file:///tarde.jpg' });
    await giro();
    assert.deepEqual(lidas, [], 'foto tardia não é lida');
    assert.deepEqual(m.disco.apagadas, ['file:///tarde.jpg'], 'e é apagada');
    passou('foto que chega depois do prazo: apagada sem ler');
  }
  {
    // O carregamento do módulo nunca termina: também dentro do prazo.
    const m = carregar({ mlkit: () => { throw new Error('nunca chamado'); } });
    const r = await aguardar(m.fotografarELer(async () => { await nunca(); }));
    assert.deepEqual(plano(r), { ok: false, motivo: 'falhou' });
    passou('etapa antes da leitura pendurada: coberta');
  }
  {
    // A exclusão da foto trava: o resultado sai mesmo assim (a tela não espera por ela).
    const m = carregar({ mlkit: kit(async () => ({ blocks: [{ lines: [{ text: 'TOTAL R$ 5,00' }] }] })), deleteAsync: nunca });
    timers.pedidos.length = 0;
    const r = await aguardar(m.fotografarELer(m.foto()));
    assert.equal(r.ok, true);
    assert.equal(r.total.valorTotal, 5);
    passou('exclusão da foto pendurada não segura a confirmação');
  }
  {
    // Exclusão que falha deixa log.
    const m = carregar({ mlkit: kit(async () => ({ blocks: [] })), deleteAsync: async () => { throw new Error('EACCES'); } });
    await aguardar(m.fotografarELer(m.foto()));
    await giro();
    assert.ok(m.avisos.some((a) => a[0] === 'error' && /apagar a foto/.test(a[1])));
    passou('exclusão que falha: log de erro');
  }
  {
    // prepararLeitura: o módulo carrega uma vez, e a leitura usa o mesmo.
    let imports = 0;
    const m = carregar({ mlkit: () => { imports++; return { __esModule: true, default: { recognize: async () => ({ blocks: [] }) } }; } });
    await m.prepararLeitura();
    await m.prepararLeitura();
    await aguardar(m.fotografarELer(m.foto()));
    assert.equal(imports, 1);
    passou('o módulo é carregado uma vez ao abrir a câmera e reaproveitado na leitura');
  }
  {
    // App fechado à força no meio da leitura: a foto sobra no cache e é apagada na próxima abertura da câmera.
    const m = carregar({ mlkit: kit(async () => ({ blocks: [] })) });
    m.disco.existe.add('file:///cache/Camera/esquecida-1.jpg');
    m.disco.existe.add('file:///cache/Camera/esquecida-2.jpg');
    m.disco.existe.add('file:///cache/outra-coisa.txt');
    const n = await m.limparFotosEsquecidas();
    assert.equal(n, 2);
    assert.deepEqual(m.disco.apagadas.sort(), ['file:///cache/Camera/esquecida-1.jpg', 'file:///cache/Camera/esquecida-2.jpg']);
    assert.ok(m.disco.existe.has('file:///cache/outra-coisa.txt'), 'só a pasta da câmera');
    assert.equal(await carregar({ mlkit: kit(async () => ({ blocks: [] })) }).limparFotosEsquecidas(), 0, 'sem pasta, nada a fazer');
    passou('foto esquecida por uma leitura interrompida é apagada ao abrir a câmera de novo');
  }
  console.log('\n' + ok + '/' + ok + ' checagens de foto-nota-ocr passaram\n');
})().catch((e) => { console.error('FALHOU: ' + (e.stack || e)); process.exit(1); });
