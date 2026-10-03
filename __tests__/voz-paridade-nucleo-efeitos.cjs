/*
 * PARIDADE DE VOZ app x widget (regra 13), efeitos COMPLETOS, para os commits
 * da997fb, 1b653b7, 79e2c4f e 07fb951 (lacuna aberta no context.md de 02/10).
 *
 *   node __tests__/voz-paridade-nucleo-efeitos.cjs
 *
 * O que cada commit toca, para o teste nao inventar alcance:
 *  - 07fb951 (voz.ts, voz-confiabilidade.ts, widget-voz-task.ts): ESTA no
 *    caminho das duas entradas. Botao do app e widget chamam o mesmo
 *    `executarTarefa`, so muda `source`. Coberto por 9 cenarios x 2 entradas x
 *    (ao vivo, retomada), comparando o instantaneo inteiro dos efeitos.
 *  - 1b653b7 (cache-de-tela.ts): `registrarOperacaoVoz` chama
 *    `lancamentoGravado()` nas duas entradas. Coberto: a gravacao da voz avisa as
 *    telas (ouvinte) e INVALIDA o dado atrasado (a leitura seguinte busca o dado
 *    novo), igual nas duas entradas; uma gravacao que FALHA nao avisa.
 *  - da997fb e 79e2c4f (fila-pendente.ts, offline-cache.ts, goals.ts): sao a fila
 *    GENERICA de lancamento/boleto/meta/parcela. A fila de AUDIO da voz e outra
 *    (`widget-voz-pendentes.ts`) e nao passa por la; a voz so importa
 *    `ITENS_POR_RODADA` e `ehErroPermanente` de fila-pendente. O teste cobre so
 *    esse alcance real: a fila de OPERACOES de voz offline reenvia, preserva o
 *    item ilegivel e limita a rodada igual nas duas entradas. Nenhuma afirmacao
 *    sobre `source` chegar a fila generica (nao chega).
 *
 * Modulos REAIS: widget-voz-task, voz, voz-confiabilidade, heuristics,
 * voice-operations, cache-de-tela (inclusive `isLikelyNetworkError`, que o
 * offline-cache so reexporta), fila-pendente, widget-voz-pendentes. Dubles so nas
 * bordas: reconhecedor do aparelho, rede (fetch e rpc), disco, notificacao,
 * AsyncStorage em memoria, banco. A fila de AUDIO (`widget-voz-pendentes`) e REAL;
 * so o disco (expo-file-system/legacy) e simulado. Os recibos da fila
 * (`voz-recibos-da-fila`) sao dubles: LIMITE declarado, a decisao de recibo e
 * conferida pelo conteudo que a tarefa entrega a ele. `p_source` e a UNICA diferenca permitida entre
 * as entradas (dado de origem, nao regra); `definirEstado` do widget e adaptador
 * de superficie e fica fora do instantaneo.
 *
 * Mutacao: cada fonte pode ser trocada por uma copia alterada, p.ex.
 *   TAREFA_FONTE=<copia de widget-voz-task.ts> node __tests__/voz-paridade-nucleo-efeitos.cjs
 * Variaveis: VOZ_FONTE, TAREFA_FONTE, CONF_FONTE, OPS_FONTE, FILA_FONTE,
 * CACHE_FONTE.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const FONTES = {
  'lib/voz.ts': process.env.VOZ_FONTE,
  'lib/widget-voz-task.ts': process.env.TAREFA_FONTE,
  'lib/voz-confiabilidade.ts': process.env.CONF_FONTE,
  'lib/voice-operations.ts': process.env.OPS_FONTE,
  'lib/fila-pendente.ts': process.env.FILA_FONTE,
  'lib/cache-de-tela.ts': process.env.CACHE_FONTE,
  'lib/widget-voz-pendentes.ts': process.env.PENDENTES_FONTE,
};

let aprovadas = 0;
const ok = (c, nome) => { assert.ok(c, nome); aprovadas++; console.log('  ok  ' + nome); };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); aprovadas++; console.log('  ok  ' + nome); };

const LIXO = 'Acompanhe o processo de produção de um produto de qualidade e de qualidade';
const REDE = () => new TypeError('Network request failed');

function montar() {
  const e = {
    local: null, localChamadas: 0, servidor: null, envios: 0, rpc: [], rpcResposta: null, rpcErro: null,
    recibos: [], arquivos: [], falhas: [], revisoes: [], sucessos: [], apagados: 0, dadoNovo: 0, estados: [],
  };
  const disco = new Map();
  const asyncStorage = {
    getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
    setItem: async (k, v) => { disco.set(k, String(v)); },
    removeItem: async (k) => { disco.delete(k); },
    getAllKeys: async () => [...disco.keys()],
    multiGet: async (ks) => ks.map((k) => [k, disco.has(k) ? disco.get(k) : null]),
    multiSet: async (kv) => { for (const [k, v] of kv) disco.set(k, String(v)); },
    multiRemove: async (ks) => { for (const k of ks) disco.delete(k); },
  };
  const cartoes = [{ id: 'c6', name: 'C6 Bank', bank: 'C6', wallet_id: 'w' }, { id: 'nu', name: 'Nubank', bank: 'Nubank', wallet_id: 'w' }];
  const cache = new Map();
  const sub = {
    './voz-local': { transcreverNoAparelho: async () => { e.localChamadas++; return e.local; } },
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
    'expo-file-system': { File: class { get exists() { return true; } get size() { return 4; } async bytes() { return new Uint8Array(4); } } },
    'expo/fetch': { fetch: async () => { e.envios++; const r = e.servidor; if (r instanceof Error) throw r; return r; } },
    './sessao-offline': { tokenDeAcessoLocal: async () => 't', idDoUsuarioLocal: async () => 'u1', lerSessaoDoDisco: async () => ({ access_token: 't' }) },
    '@/modules/grana-voice-widget': { definirEstado(s) { e.estados.push(s); } },
    './widget-voz-notificacoes': {
      podeNotificar: async () => true,
      notificarRevisao: async (titulo, transcricao) => { e.revisoes.push({ titulo, transcricao }); },
      notificarFalha: async (codigo) => { e.falhas.push(codigo); },
      notificarPendenteOffline: async () => { e.recibos.push('offline'); },
      notificarSucesso: async (...a) => { e.sucessos.push(a); },
      notificarSalvoLocal: async () => { e.recibos.push('salvo-local'); },
    },
    './voz-recibos-da-fila': { guardarReciboDaFila: async (r) => { e.recibos.push(r); } },
    './data': { fetchCreditCards: async () => cartoes, fetchCategories: async () => [] },
    './wallets': { fetchWallets: async () => [{ id: 'w', name: 'Pessoal', is_default: true }] },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './widgets-home-sync': {},
    /* A decisao "e erro de rede?" e regra do nucleo: delega ao modulo real. */
    './offline-cache': { isLikelyNetworkError: (...a) => real('lib/cache-de-tela.ts').isLikelyNetworkError(...a) },
    './supabase': { supabase: {
      auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) },
      rpc: (nome, args) => {
        e.rpc.push({ nome, args });
        const resp = e.rpcErro
          ? { data: null, error: e.rpcErro }
          : { data: e.rpcResposta || { status: 'committed', operation_id: 'op-1', ids: ['tx-1'], replayed: false }, error: null };
        const p = Promise.resolve(resp);
        p.abortSignal = () => p;
        return p;
      },
    } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: asyncStorage },
    /* Disco do aparelho (borda): so registra o que a fila de AUDIO real pede. */
    'expo-file-system/legacy': {
      documentDirectory: 'file:///docs/',
      makeDirectoryAsync: async (d) => { e.arquivos.push(['pasta', d]); },
      copyAsync: async ({ from, to }) => { e.arquivos.push(['copia', from, to]); },
      deleteAsync: async (c) => { e.apagados++; e.arquivos.push(['apaga', c]); },
      getInfoAsync: async () => ({ exists: false }),
      readAsStringAsync: async () => '',
      readDirectoryAsync: async () => [],
    },
  };
  function real(arquivo) {
    if (cache.has(arquivo)) return cache.get(arquivo);
    const exports = {};
    cache.set(arquivo, exports);
    const fonte = FONTES[arquivo] || path.join(root, arquivo);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(fonte, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, {
      exports, console: { ...console, warn() {}, error() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl, Uint8Array,
      FormData: class { append() {} }, AbortController, clearTimeout,
      /* O aviso de dado novo agrupa por 250 ms; so o cache-de-tela ganha o prazo encurtado (os prazos de 15 s da voz ficam reais). */
      setTimeout: arquivo === 'lib/cache-de-tela.ts' ? (f, ms) => setTimeout(f, ms >= 1000 ? 20 : 0) : setTimeout, __DEV__: false,
      process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid' } },
      require: (id) => {
        if (id in sub) return sub[id];
        if (id.startsWith('./') && fs.existsSync(path.join(root, 'lib', id.slice(2) + '.ts'))) return real('lib/' + id.slice(2) + '.ts');
        const puros = require('./modulos-puros-reais.cjs');
        if (id in puros) return puros[id];
        throw new Error('import nao simulado em ' + arquivo + ': ' + id);
      },
    }, { filename: arquivo });
    return exports;
  }
  const tarefa = real('lib/widget-voz-task.ts');
  const cacheDeTela = real('lib/cache-de-tela.ts');
  cacheDeTela.assinarDadoNovo(() => { e.dadoNovo++; });
  const ops = real('lib/voice-operations.ts');
  return {
    e, disco, tarefa, ops, cache: cacheDeTela,
    ok: (t) => Response.json({ status: 'ready', transcript: t }),
    falha: (c, s) => Response.json({ status: 'error', code: c }, { status: s }),
  };
}

/* Instantaneo de TUDO que a pessoa ve ou que fica guardado. So `p_source` fica
   de fora: e dado de origem, comparado a parte. */
function instantaneo(m) {
  const rpc = m.e.rpc.map((c) => ({ nome: c.nome, args: { ...c.args, p_source: undefined } }));
  return JSON.parse(JSON.stringify({
    local: m.e.localChamadas, envios: m.e.envios, rpc,
    arquivos: m.e.arquivos, falhas: m.e.falhas, revisoes: m.e.revisoes, sucessos: m.e.sucessos, recibos: m.e.recibos,
    apagados: m.e.apagados, dadoNovo: m.e.dadoNovo,
    disco: [...m.disco.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [
      k,
      v.replace(/"criadoEm":"[^"]*"/g, '"criadoEm":"-"').replace(/"(adicionadoEm|criadoEm)":\d+/g, '"$1":0').replace(/"source":"(app|widget)"/g, '"source":"-"'),
    ]),
  }));
}

async function rodar(origem, cenario, { daFila = false } = {}) {
  const m = montar();
  Object.assign(m.e, cenario(m));
  await m.tarefa.executarTarefa({ caminho: daFila ? '/voz-pendente/a.m4a' : '/a.m4a', requestId: 'req-1', source: origem });
  await new Promise((r) => setTimeout(r, 15)); // deixa o aviso agrupado de dado novo disparar
  return m;
}

const CENARIOS = {
  lixoMaisServidorBom: (x) => ({ local: LIXO, servidor: x.ok('Uber 825 reais no credito C6') }),
  localBom: () => ({ local: 'gastei 40 reais no mercado', servidor: new Error('nao deveria enviar') }),
  lixoSemRede: () => ({ local: LIXO, servidor: REDE() }),
  lixoDoServidor: (x) => ({ local: null, servidor: x.ok(LIXO) }),
  valorSolto: (x) => ({ local: LIXO, servidor: x.ok('Uber 825 credito C6') }),
  mercadoSemValor: (x) => ({ local: null, servidor: x.ok('mercado') }),
  servidorNaoEntendeu: (x) => ({ local: LIXO, servidor: x.falha('nao_entendi', 422) }),
  receita: (x) => ({ local: null, servidor: x.ok('recebi 1500 reais de salario') }),
  parcelado: (x) => ({ local: null, servidor: x.ok('comprei uma tv de 1200 reais em 4 vezes no credito C6') }),
};

(async () => {
  console.log('07fb951: mesma fala, mesmo instantaneo (RPC, destino, recibos, fila, revisao, disco) nas duas entradas');
  for (const [nome, c] of Object.entries(CENARIOS)) {
    for (const daFila of [false, true]) {
      const a = instantaneo(await rodar('app', c, { daFila }));
      const w = instantaneo(await rodar('widget', c, { daFila }));
      igual(a, w, `${nome}${daFila ? ' (retomada)' : ''}: app e widget com efeitos identicos`);
    }
  }

  console.log('Valores absolutos (os dois lados nao podem errar juntos)');
  for (const origem of ['app', 'widget']) {
    let m = await rodar(origem, CENARIOS.lixoMaisServidorBom);
    ok(m.e.localChamadas === 1 && m.e.envios === 1, `${origem}: lixo do aparelho cai no servidor, 1 e 1`);
    const rpc = m.e.rpc.find((r) => r.nome === 'registrar_operacao_voz');
    ok(rpc && rpc.args.p_source === origem, `${origem}: RPC carrega p_source=${origem} (unica diferenca permitida)`);
    ok(rpc.args.p_payload.amount === 825 && rpc.args.p_payload.card_id === 'c6' && rpc.args.p_payload.type === 'out' && /uber/i.test(rpc.args.p_payload.description), `${origem}: grava saida 825 no C6, descricao Uber`);
    ok(m.e.dadoNovo === 1, `${origem}: gravacao avisa as telas montadas (1b653b7)`);

    m = await rodar(origem, CENARIOS.lixoSemRede);
    ok(m.e.rpc.length === 0 && m.e.dadoNovo === 0 && !JSON.stringify([...m.disco]).includes('Acompanhe'), `${origem}: sem rede, nada grava, nao avisa telas e o lixo nao vai ao disco`);

    m = await rodar(origem, CENARIOS.lixoDoServidor);
    ok(m.e.rpc.length === 0 && m.e.falhas.join() === 'nao_entendi' && !JSON.stringify(m.e).includes('Acompanhe'), `${origem}: lixo do servidor ao vivo vira "nao entendi" sem repetir a frase`);

    m = await rodar(origem, CENARIOS.localBom);
    ok(m.e.envios === 0 && m.e.rpc.length === 1, `${origem}: texto bom do aparelho nao gasta o servidor`);
  }

  console.log('1b653b7: gravacao que falha nao avisa as telas, igual nas duas entradas');
  const falhando = () => ({ local: 'gastei 40 reais no mercado', rpcErro: { code: '42501', message: 'negado' } });
  const a1 = instantaneo(await rodar('app', falhando));
  const w1 = instantaneo(await rodar('widget', falhando));
  igual(a1, w1, 'RPC recusado: efeitos identicos');
  ok(a1.dadoNovo === 0, 'RPC recusado: nenhuma tela e avisada de gravacao que nao houve');

  console.log('1b653b7: gravar pela voz invalida o dado atrasado (a leitura seguinte busca o dado NOVO)');
  const operacoesNoDisco = (m) => [...m.disco.keys()].filter((k) => k.startsWith('grana:voz:operacao:'));
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const leituraAposGravar = async (origem) => {
    const m = montar();
    m.e.local = 'gastei 40 reais no mercado';
    await m.cache.guardarTela('lancamentos', ['velho']);
    let soltar;
    let buscas = 0;
    const buscar = () => { buscas++; return buscas === 1 ? new Promise((r) => { soltar = r; }) : Promise.resolve(['novo']); };
    const ler = m.cache.comCacheOffline('lancamentos', buscar);
    ok(JSON.stringify(await ler()) === JSON.stringify(['velho']), `${origem}: rede lenta serve o disco`);
    soltar(['tardio']);
    await pausa(40);
    ok(JSON.stringify(await ler()) === JSON.stringify(['tardio']) && buscas === 1, `${origem}: o dado atrasado e servido sem nova busca (controle)`);
    await m.tarefa.executarTarefa({ caminho: '/a.m4a', requestId: 'req-1', source: origem });
    const depois = JSON.stringify(await ler());
    return { depois, buscas };
  };
  for (const origem of ['app', 'widget']) {
    const r = await leituraAposGravar(origem);
    ok(r.depois === JSON.stringify(['novo']) && r.buscas === 2, `${origem}: depois de gravar por voz a leitura busca o dado novo, nao o atrasado anterior a gravacao`);
  }

  console.log('Operacoes de voz offline (alcance real de da997fb/79e2c4f: ITENS_POR_RODADA e ehErroPermanente)');
  const offline = () => ({ local: 'gastei 40 reais no mercado', rpcErro: { message: 'Network request failed' } });
  const sincronizar = async (origem, { lixoNoDisco = false, extras = 0 } = {}) => {
    const m = await rodar(origem, offline);
    ok(operacoesNoDisco(m).length === 1 && m.e.dadoNovo === 1, `${origem}: sem rede a operacao fica guardada e as telas sao avisadas (1b653b7)`);
    for (let i = 0; i < extras; i++) {
      m.disco.set(`grana:voz:operacao:u1:extra-${String(i).padStart(3, '0')}`, JSON.stringify({ requestId: 'extra-' + i, source: origem, payload: { kind: 'transaction', amount: 1, description: 'x' } }));
    }
    if (lixoNoDisco) m.disco.set('grana:voz:operacao:u1:aaa-ilegivel', '{nao e json');
    m.e.rpcErro = null;
    m.e.rpc.length = 0;
    const resumo = await m.ops.sincronizarOperacoesVoz();
    await new Promise((r) => setTimeout(r, 15));
    return { m, resumo, enviadas: m.e.rpc.length };
  };
  const [sa, sw] = [await sincronizar('app'), await sincronizar('widget')];
  igual({ resumo: JSON.parse(JSON.stringify(sa.resumo)), ...instantaneo(sa.m) }, { resumo: JSON.parse(JSON.stringify(sw.resumo)), ...instantaneo(sw.m) }, 'reenvio: mesmo resumo, mesmo RPC e disco limpo nas duas entradas');
  ok(sa.resumo.sincronizadas === 1 && operacoesNoDisco(sa.m).length === 0 && sa.m.e.rpc[0].args.p_source === 'app' && sw.m.e.rpc[0].args.p_source === 'widget', 'reenvio: 1 sincronizada, fila vazia, e cada operacao volta ao servidor com a SUA origem');
  const [la, lw] = [await sincronizar('app', { lixoNoDisco: true }), await sincronizar('widget', { lixoNoDisco: true })];
  igual({ resumo: JSON.parse(JSON.stringify(la.resumo)), ...instantaneo(la.m) }, { resumo: JSON.parse(JSON.stringify(lw.resumo)), ...instantaneo(lw.m) }, 'item ilegivel: igual nas duas entradas');
  ok(la.resumo.sincronizadas === 1 && la.resumo.falhas === 1 && la.m.disco.has('grana:voz:operacao:u1:aaa-ilegivel'), 'item ilegivel: nao impede o valido e e preservado no disco (nao apagado)');
  const [ma, mw] = [await sincronizar('app', { extras: 60 }), await sincronizar('widget', { extras: 60 })];
  ok(ma.enviadas === 50 && mw.enviadas === 50 && operacoesNoDisco(ma.m).length === 11 && operacoesNoDisco(mw.m).length === 11, 'rodada: no maximo ITENS_POR_RODADA (50) por sincronizacao, o resto espera, nas duas entradas');
  console.log(`\n${aprovadas} checagens ok`);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
