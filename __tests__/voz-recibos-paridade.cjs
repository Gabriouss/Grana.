/* Voz no botão do app e no widget, iguais (regra 13): os achados V2, V4 e o
 * texto nativo de V1/V3 do Watchtower (26/09/2026).
 *
 *   node __tests__/voz-recibos-paridade.cjs
 *
 *  1. Os recibos que o Kotlin mostra antes de existir JavaScript ("Não ouvi
 *     nada", "Fala guardada") são cópias EXATAS de lib/voz-recibos.ts.
 *  2. V2: o toque na notificação de revisão do widget decide o destino com as
 *     mesmas carteiras e cartões da Início (lib/destino-da-fala-referencias.ts,
 *     módulo REAL, com o destinoDaFala REAL).
 *  3. V4: a fala que o widget não conseguiu entregar ao JS fica guardada e é
 *     adotada pela fila de áudios (lib/widget-voz-pendentes.ts, módulo REAL,
 *     com disco e AsyncStorage simulados). O Kotlin não roda aqui: o teste lê
 *     o ramo do `startService` e confere que ele não apaga o áudio.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let ok = 0;
const passou = (n) => { ok++; console.log('  ok  ' + n); };

const cache = new Map();
function carregar(arquivo, dubles = {}, globais = {}) {
  const chave = arquivo + JSON.stringify(Object.keys(dubles));
  if (cache.has(chave)) return cache.get(chave);
  const exports = {};
  cache.set(chave, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console: globais.console ?? console, Promise, JSON, Object, Array, String, Number, Error, RegExp, Set, Map, Math, Date,
    setTimeout: globais.setTimeout ?? setTimeout, clearTimeout,
    require(id) {
      if (id in dubles) return dubles[id];
      if (id in require('./modulos-puros-reais.cjs')) return require('./modulos-puros-reais.cjs')[id];
      if (id.startsWith('./')) {
        const alvo = path.join(path.dirname(arquivo), id.slice(2) + '.ts');
        if (fs.existsSync(path.join(root, alvo))) return carregar(alvo, dubles, globais);
      }
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

(async () => {
  /* ── 1. Texto nativo = catálogo ──────────────────────────────────────── */
  const recibos = carregar('lib/voz-recibos.ts');
  const xml = fs.readFileSync(path.join(root, 'modules/grana-voice-widget/android/src/main/res/values/strings.xml'), 'utf8');
  const texto = (nome) => {
    const m = xml.match(new RegExp(`<string name="${nome}">([^<]*)</string>`));
    assert.ok(m, 'string ausente: ' + nome);
    return m[1];
  };
  assert.equal(texto('grana_voice_nao_ouvi_titulo'), recibos.RECIBOS_VOZ.naoOuvi.titulo);
  assert.equal(texto('grana_voice_nao_ouvi_texto'), recibos.RECIBOS_VOZ.naoOuvi.texto);
  assert.equal(texto('grana_voice_guardada_titulo'), recibos.RECIBOS_VOZ.falaGuardada.titulo);
  assert.equal(texto('grana_voice_guardada_texto'), recibos.RECIBOS_VOZ.falaGuardada.texto);
  passou('"Não ouvi nada" e "Fala guardada" do Kotlin são as mesmas palavras do catálogo');

  const todos = [
    ...Object.values(recibos.RECIBOS_VOZ).filter((v) => typeof v === 'object'),
    recibos.RECIBOS_VOZ.sucesso('Almoço · R$ 38,50', 'Alimentação · Pix'),
    recibos.RECIBOS_VOZ.revisao('Qual cartão?', 'uber 25 no crédito'),
  ];
  for (const r of todos) {
    assert.doesNotMatch(r.titulo + ' ' + r.texto, /[—–]/, 'sem travessão: ' + r.titulo);
    assert.doesNotMatch(r.texto, /não é .*, é /i, 'sem "não é X, é Y": ' + r.titulo);
  }
  passou('catálogo sem travessão e sem "não é X, é Y"');

  // B3 (Harbor, 26/09/2026): transcrição com ponto final não dobra a pontuação.
  const r3 = recibos.RECIBOS_VOZ.revisao('Confirme o valor que ouvi', 'Mercado R$ 120 no débito.');
  assert.equal(r3.texto, 'Ouvi: "Mercado R$ 120 no débito". Confira os dados antes de salvar.');
  assert.equal(recibos.RECIBOS_VOZ.revisao('X', 'uber 25 no crédito?!  ').texto, 'Ouvi: "uber 25 no crédito". Confira os dados antes de salvar.');
  assert.equal(recibos.RECIBOS_VOZ.revisao('X', ' . ').texto, 'Confira os dados antes de salvar.', 'só pontuação é o mesmo que nada ouvido');
  assert.equal(recibos.RECIBOS_VOZ.revisao('X', 'R$ 18,99').texto, 'Ouvi: "R$ 18,99". Confira os dados antes de salvar.', 'a vírgula do valor fica');
  passou('recibo de revisão sem pontuação dobrada quando a transcrição já termina em ponto');

  /* ── 2. V2: mesmo destino com as mesmas listas ──────────────────────── */
  const carteiras = [{ id: 'w1', name: 'Crédito Casa' }, { id: 'w2', name: 'Nubank' }];
  const cartoes = [{ id: 'c1', name: 'Nubank', bank: 'nubank', wallet_id: 'w2' }];
  const destinoMod = carregar('lib/destino-da-fala.ts', {});
  let carregouCarteiras = 0;
  let carregouCartoes = 0;
  const refs = carregar('lib/destino-da-fala-referencias.ts', {
    './data': { fetchCreditCards: async () => { carregouCartoes++; return cartoes; } },
    './wallets': { fetchWallets: async () => { carregouCarteiras++; return carteiras; } },
    './destino-da-fala': destinoMod,
  });
  const FRASE = 'almoço 40 na carteira Crédito Casa';
  const naInicio = destinoMod.destinoDaFala(FRASE, carteiras, cartoes); // o que index.tsx faz
  const noWidgetAntes = destinoMod.destinoDaFala(FRASE); // o que RespostaVozWidget fazia
  assert.equal(naInicio, 'revisao');
  assert.equal(noWidgetAntes, 'credito', 'o defeito: sem as listas, "Crédito Casa" virava compra no cartão');
  assert.equal(await refs.destinoDaFalaComReferencias(FRASE), naInicio);
  assert.ok(carregouCarteiras === 1 && carregouCartoes === 1, 'carrega as duas listas');
  for (const t of ['mercado 80 no cartão nubank', 'recebi 500 no nubank', 'conta de luz 180 vence dia 10', 'uber 25 no crédito', 'almoço 38,50']) {
    assert.equal(await refs.destinoDaFalaComReferencias(t), destinoMod.destinoDaFala(t, carteiras, cartoes), t);
  }
  passou('carteira com nome parecido com crédito: a notificação do widget e a Início abrem a mesma tela');

  const erros = [];
  const semRede = carregar('lib/destino-da-fala-referencias.ts', {
    './data': { fetchCreditCards: async () => { throw new Error('offline sem cache'); } },
    './wallets': { fetchWallets: () => new Promise(() => {}) },
    './destino-da-fala': destinoMod,
    __semRede: true,
  }, { console: { ...console, error: (...a) => erros.push(a) }, setTimeout: (fn) => setTimeout(fn, 0) });
  assert.equal(await semRede.destinoDaFalaComReferencias(FRASE), noWidgetAntes, 'sem as listas, decide como antes');
  assert.equal(erros.length, 2, 'e deixa log das duas faltas (prazo e erro)');
  passou('sem listas (erro ou prazo de 8 s), decide pelo texto e deixa log');

  const tela = fs.readFileSync(path.join(root, 'components/RespostaVozWidget.tsx'), 'utf8');
  assert.match(tela, /await destinoDaFalaComReferencias\(texto\)/);
  assert.doesNotMatch(tela, /destinoDaFala\(texto\)/);
  passou('RespostaVozWidget usa a decisão com as listas');

  /* ── 3. V4: a fala guardada entra na fila ───────────────────────────── */
  const disco = new Map();
  const log = [];
  const falharCopia = new Set();
  const AsyncStorage = {
    getItem: async (k) => disco.get('as:' + k) ?? null,
    setItem: async (k, v) => { disco.set('as:' + k, v); },
  };
  /* Data de modificação (segundos) dos arquivos, como o expo-file-system dá. */
  const mtimes = new Map();
  const fsDuble = {
    documentDirectory: 'file:///files/',
    getInfoAsync: async (p) => ({ exists: [...disco.keys()].some((k) => k.startsWith(p)), ...(mtimes.has(p) ? { modificationTime: mtimes.get(p) } : null) }),
    readAsStringAsync: async (p) => { if (!disco.has(p)) throw new Error('sem arquivo'); return disco.get(p); },
    readDirectoryAsync: async (p) => [...disco.keys()].filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)),
    makeDirectoryAsync: async () => {},
    copyAsync: async ({ from, to }) => {
      if (falharCopia.has(from)) throw new Error('disco cheio');
      disco.set(to, disco.get(from));
    },
    deleteAsync: async (p) => { disco.delete(p); },
  };
  const pendentes = carregar('lib/widget-voz-pendentes.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage },
    'expo-file-system/legacy': fsDuble,
  }, { console: { ...console, error: (...a) => log.push(a) } });

  assert.equal(pendentes.PASTA_ORFA, 'voz-orfa');
  const kt = fs.readFileSync(path.join(root,
    'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget/GranaVoiceCaptureService.kt'), 'utf8');
  assert.match(kt, /const val PASTA_ORFA = "voz-orfa"/, 'mesma pasta nos dois lados');

  disco.set('file:///files/voz-orfa/req-orfa-1.m4a', 'AUDIO');
  const adotadas = await pendentes.adotarVozesOrfas('u-1');
  assert.equal(adotadas, 1);
  const fila = await pendentes.listarVozesPendentes();
  assert.deepEqual(JSON.parse(JSON.stringify(fila.map(({ criadoEm, ...r }) => r))), [
    /* Órfã sem o `.json` da captura (de antes da data na voz): a referência
       é aproximada, e expressão relativa vai para revisão (F1). */
    { caminho: 'file:///files/voz-pendente/req-orfa-1.m4a', requestId: 'req-orfa-1', userId: 'u-1', source: 'widget', referenciaAproximada: true },
  ], 'entra na fila com o requestId do widget');
  assert.equal(disco.get('file:///files/voz-pendente/req-orfa-1.m4a'), 'AUDIO', 'o áudio foi copiado para a fila');
  assert.ok(!disco.has('file:///files/voz-orfa/req-orfa-1.m4a'), 'e só então sai da pasta de guardados');
  assert.equal(await pendentes.adotarVozesOrfas('u-1'), 0, 'não adota duas vezes');
  passou('fala guardada pelo widget entra na fila com o mesmo requestId, sem duplicar');

  disco.set('file:///files/voz-orfa/req-orfa-2.m4a', 'AUDIO2');
  falharCopia.add('file:///files/voz-orfa/req-orfa-2.m4a');
  assert.equal(await pendentes.adotarVozesOrfas('u-1'), 0);
  assert.ok(disco.has('file:///files/voz-orfa/req-orfa-2.m4a'), 'cópia que falha não apaga a fala');
  assert.ok(log.some((a) => /não entrou na fila/.test(String(a[0]))), 'e deixa log');
  passou('cópia que falha mantém a fala guardada para a próxima abertura, com log');

  /* Data na voz (F1, 30/09/2026): a órfã carrega a captura num `.json` ao
     lado do áudio, escrito pelo Kotlin no INÍCIO da gravação. Adotada dias
     depois, ela continua com a data de quando foi dita. */
  const capturaAntesDaMeiaNoite = new Date(2026, 8, 29, 23, 58).getTime();
  disco.set('file:///files/voz-orfa/req-orfa-3.m4a', 'AUDIO3');
  disco.set('file:///files/voz-orfa/req-orfa-3.json', JSON.stringify({ capturadoEm: capturaAntesDaMeiaNoite, dataCaptura: '2026-09-29' }));
  mtimes.set('file:///files/voz-orfa/req-orfa-3.m4a', new Date(2026, 8, 30, 0, 2).getTime() / 1000);
  assert.equal(await pendentes.adotarVozesOrfas('u-1'), 1);
  let item = (await pendentes.listarVozesPendentes()).find((i) => i.requestId === 'req-orfa-3');
  assert.equal(item.dataCaptura, '2026-09-29', 'a data da captura vem do .json (início às 23h58), e não do fim do áudio (00h02)');
  assert.equal(item.criadoEm, capturaAntesDaMeiaNoite, 'o instante é o do início');
  assert.equal(item.referenciaAproximada, undefined, 'e não é aproximada');
  assert.ok(!disco.has('file:///files/voz-orfa/req-orfa-3.json') && !disco.has('file:///files/voz-orfa/req-orfa-3.m4a'), 'o .json sai junto, depois da adoção');
  passou('órfã com .json: a data é a do início da captura, mesmo que o áudio termine depois da meia-noite');

  /* .json ilegível ou com data inválida: o áudio nunca se perde; a data vira a
     do fim do áudio, marcada aproximada. */
  for (const [id, conteudo] of [['req-orfa-4', '{quebrado'], ['req-orfa-5', JSON.stringify({ capturadoEm: 1, dataCaptura: '2026-02-30' })]]) {
    disco.set(`file:///files/voz-orfa/${id}.m4a`, 'AUDIO');
    disco.set(`file:///files/voz-orfa/${id}.json`, conteudo);
    mtimes.set(`file:///files/voz-orfa/${id}.m4a`, new Date(2026, 8, 30, 0, 2).getTime() / 1000);
  }
  assert.equal(await pendentes.adotarVozesOrfas('u-1'), 2, 'metadado ruim não impede a adoção');
  for (const id of ['req-orfa-4', 'req-orfa-5']) {
    item = (await pendentes.listarVozesPendentes()).find((i) => i.requestId === id);
    assert.ok(item && disco.get(`file:///files/voz-pendente/${id}.m4a`) === 'AUDIO', `${id}: o áudio está na fila`);
    assert.equal(item.referenciaAproximada, true, `${id}: referência aproximada`);
    assert.equal(item.dataCaptura, undefined, `${id}: sem data de captura inventada`);
    assert.equal(item.criadoEm, new Date(2026, 8, 30, 0, 2).getTime(), `${id}: o instante é o fim do áudio`);
  }
  passou('órfã com .json ilegível ou inválido: áudio na fila, data aproximada pelo fim do áudio');

  const tarefa = fs.readFileSync(path.join(root, 'lib/widget-voz-task.ts'), 'utf8');
  const retomada = tarefa.slice(tarefa.indexOf('async function retomarFilaDeFalas'));
  assert.ok(retomada.indexOf('await adotarVozesOrfas(userId)') > 0
    && retomada.indexOf('await adotarVozesOrfas(userId)') < retomada.indexOf('listarVozesPendentes()).filter'),
    'a retomada da fila adota as falas guardadas antes de ler a fila');
  passou('a retomada da fila (ao abrir o app) adota antes de processar');

  // Kotlin: o ramo do `startService` recusado guarda, avisa e deixa o widget em atenção.
  const ramo = kt.slice(kt.indexOf('startService(ponte)'), kt.indexOf('finalizar(null)'));
  assert.doesNotMatch(ramo, /destino\.delete\(\)/, 'o áudio válido não é mais apagado');
  assert.match(ramo, /guardarParaOApp\(destino, id, inicio, dataDaFala\)/);
  assert.match(ramo, /publicarRecibo\(R\.string\.grana_voice_guardada_titulo, R\.string\.grana_voice_guardada_texto\)/);
  assert.match(ramo, /finalizar\(EstadoWidget\.ATENCAO\)/);
  const guardar = kt.slice(kt.indexOf('private fun guardarParaOApp'), kt.indexOf('private fun publicarRecibo'));
  assert.match(guardar, /File\(filesDir, PASTA_ORFA\)/);
  assert.match(guardar, /"\$id\.m4a"/, 'o nome do arquivo é o requestId');
  passou('Kotlin: ponte recusada guarda o áudio em filesDir/voz-orfa, publica o recibo e põe o widget em atenção');

  /* Data na voz (F1): conferência de FONTE do Kotlin, não execução. O que o
     JavaScript faz com o .json e com os extras está executado acima e em
     voz-data-paridade.cjs; a escrita real no aparelho depende do APK (QA do
     Vigil/Sentinel), e não está validada por este teste. */
  assert.match(kt, /capturadoEm = System\.currentTimeMillis\(\)\s*\n\s*dataCaptura = SimpleDateFormat\("yyyy-MM-dd", Locale\.US\)\.format\(Date\(capturadoEm\)\)/,
    'o início da captura é anotado junto com o requestId');
  assert.ok(guardar.indexOf('"$id.json"') > 0 && guardar.indexOf('"$id.json"') < guardar.indexOf('"$id.m4a"'), 'o .json é escrito antes de o áudio ir para a pasta');
  const ponte = kt.slice(kt.indexOf('val ponte = Intent'), kt.indexOf('startService(ponte)'));
  assert.match(ponte, /putExtra\("capturadoEm", inicio\.toDouble\(\)\)/);
  assert.match(ponte, /putExtra\("dataCaptura", dataDaFala\)/);
  passou('Kotlin (fonte; a execução depende do APK): captura anotada no início, extras na ponte e .json antes do áudio');

  console.log(`\n${ok}/${ok} checagens de paridade dos recibos de voz passaram\n`);
})().catch((e) => { console.error(e); process.exit(1); });
