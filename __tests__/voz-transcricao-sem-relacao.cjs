/*
 * Transcrição sem relação com a fala nunca chega como "ouvido", e o servidor
 * é o plano B do reconhecedor do aparelho. Botão do app E widget.
 *
 *   node __tests__/voz-transcricao-sem-relacao.cjs
 *
 * Caso do autor (02/10/2026): falou "Uber 825 crédito C6" no widget; o app
 * mostrou "Não entendi a fala guardada. Ouvi: 'Acompanhe o processo de
 * produção de um produto de qualidade e de qualidade'" e a revisão abriu com
 * R$ 0,00. A frase não existe no repositório nem no prompt do servidor. A ORIGEM
 * dela NÃO está provada (sem o M4A do widget nem o log do provedor; o servidor,
 * com recortes do áudio do vídeo, devolveu a fala certa): este teste prova o
 * TRATAMENTO, não a causa.
 *
 * Módulos REAIS: lib/voz.ts, lib/voz-confiabilidade.ts, lib/heuristics.ts e
 * lib/widget-voz-task.ts (`executarTarefa`, o núcleo que o BOTÃO DO APP chama
 * com source 'app' e a tarefa do widget chama com source 'widget'). Dublês só
 * nas bordas: reconhecedor do aparelho, rede, disco, notificação, banco. As
 * asserções contam QUAIS chamadas aconteceram. Contra o fonte antigo:
 *   VOZ_FONTE=<voz.ts> TAREFA_FONTE=<widget-voz-task.ts> CONF_FONTE=<voz-confiabilidade.ts> node ...
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
const ok = (c, nome) => { assert.ok(c, nome); aprovadas++; console.log('  ok  ' + nome); };

const LIXO = 'Acompanhe o processo de produção de um produto de qualidade e de qualidade';
const FALA = 'Uber 825 credito C6';

function montar(origem) {
  /* Bordas controladas pelo cenário. */
  const e = { local: null, localChamadas: 0, servidor: null, envios: 0, token: 't', fila: [], salvos: [], recibos: [], falhas: [], revisoes: [], apagados: 0 };
  const cartoes = [{ id: 'c6', name: 'C6 Bank', bank: 'C6', wallet_id: 'w' }, { id: 'nu', name: 'Nubank', bank: 'Nubank', wallet_id: 'w' }];
  const cache = new Map();
  const substitutos = {
    './voz-local': { transcreverNoAparelho: async () => { e.localChamadas++; return e.local; } },
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
    'expo-file-system': { File: class { get exists() { return true; } get size() { return 4; } async bytes() { return new Uint8Array(4); } } },
    'expo/fetch': { fetch: async () => { e.envios++; const r = e.servidor; if (r instanceof Error) throw r; return r; } },
    './sessao-offline': {
      tokenDeAcessoLocal: async () => e.token || null,
      idDoUsuarioLocal: async () => 'u1',
      lerSessaoDoDisco: async () => ({ access_token: 't' }),
    },
    './offline-cache': { isLikelyNetworkError: (x) => /network/i.test(String(x?.message ?? x)) },
    '@/modules/grana-voice-widget': { definirEstado() {} },
    './widget-voz-notificacoes': {
      podeNotificar: async () => true,
      notificarRevisao: async (titulo, transcricao) => { e.revisoes.push({ titulo, transcricao }); },
      notificarFalha: async (codigo) => { e.falhas.push(codigo); },
      notificarPendenteOffline: async () => { e.recibos.push('offline'); },
      notificarSucesso: async () => { e.recibos.push('sucesso'); },
      notificarSalvoLocal: async () => {},
    },
    './widget-voz-pendentes': {
      adicionarVozPendente: async (i) => { e.fila.push(i); },
      marcarVozEmRevisao: async (id, t) => { e.fila.push({ revisao: id, transcricao: t ?? null }); },
      removerVozPendente: async () => {},
    },
    './voz-recibos-da-fila': { guardarReciboDaFila: async (r) => { e.recibos.push(r); } },
    './voice-operations': { desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'), registrarOperacaoVoz: async (_, __, input) => { e.salvos.push(input); return { ids: ['tx'], operationId: 'op' }; }, desfechoDoErroVoz: () => null, ehRecusaCartaoObrigatorio: () => false },
    './data': { fetchCreditCards: async () => cartoes, fetchCategories: async () => [] },
    './wallets': { fetchWallets: async () => [{ id: 'w', name: 'Pessoal', is_default: true }] },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) } } },
    './widgets-home-sync': {}, '@react-native-async-storage/async-storage': {},
    'expo-file-system/legacy': { deleteAsync: async () => { e.apagados++; } },
  };
  const fontes = { 'lib/voz.ts': process.env.VOZ_FONTE, 'lib/widget-voz-task.ts': process.env.TAREFA_FONTE, 'lib/voz-confiabilidade.ts': process.env.CONF_FONTE };
  function real(arquivo) {
    if (cache.has(arquivo)) return cache.get(arquivo);
    const exports = {};
    cache.set(arquivo, exports);
    const fonte = fontes[arquivo] || path.join(root, arquivo);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(fonte, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, {
      exports, console: { ...console, warn() {}, error() {} }, JSON, Date, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl, Uint8Array,
      FormData: class { append() {} }, AbortController, setTimeout, clearTimeout, __DEV__: false,
      process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid' } },
      require: (id) => {
        if (id in substitutos) return substitutos[id];
        if (id.startsWith('./') && fs.existsSync(path.join(root, 'lib', id.slice(2) + '.ts'))) return real('lib/' + id.slice(2) + '.ts');
        const puros = require('./modulos-puros-reais.cjs');
        if (id in puros) return puros[id];
        throw new Error('import nao simulado em ' + arquivo + ': ' + id);
      },
    }, { filename: arquivo });
    return exports;
  }
  const tarefa = real('lib/widget-voz-task.ts');
  const servidorDiz = (transcript) => Response.json({ status: 'ready', transcript });
  const servidorFalha = (code, status) => Response.json({ status: 'error', code }, { status });
  return { e, tarefa, servidorDiz, servidorFalha, origem };
}

/* Uma execução, na entrada pedida. Botão do app e widget chamam o MESMO
   `executarTarefa`; a diferença é só `source`. `daFila` simula a retomada
   ("Tentar de novo" e retomada automática usam o arquivo da pasta da fila). */
async function rodar(origem, cenario, { daFila = false } = {}) {
  const m = montar(origem);
  Object.assign(m.e, cenario(m));
  await m.tarefa.executarTarefa({ caminho: daFila ? '/voz-pendente/a.m4a' : '/a.m4a', requestId: 'r-' + origem, source: origem });
  return m;
}
/* Só o que a pessoa vê ou o que fica guardado; as entradas simuladas (local, servidor) ficam de fora. */
const vazou = (m) => JSON.stringify({ f: m.e.fila, r: m.e.recibos, v: m.e.revisoes, x: m.e.falhas, s: m.e.salvos }).includes('Acompanhe');
const resumo = (m) => JSON.stringify({
  local: m.e.localChamadas, envios: m.e.envios, salvos: m.e.salvos.length,
  falhas: m.e.falhas, revisoes: m.e.revisoes, fila: m.e.fila.map((i) => i.revisao ? { revisao: true, t: i.transcricao } : { pendente: true }),
  recibos: m.e.recibos.map((r) => (typeof r === 'string' ? r : { titulo: r.titulo, texto: r.texto, transcricao: r.transcricao ?? null })),
});

(async () => {
  for (const origem of ['app', 'widget']) {
    console.log(`Entrada: ${origem}`);

    /* 1. O caso do autor: aparelho devolve lixo, servidor ouve a fala certa. */
    let m = await rodar(origem, (x) => ({ local: LIXO, servidor: x.servidorDiz(FALA) }));
    ok(m.e.localChamadas === 1 && m.e.envios === 1, `${origem}: lixo do aparelho aciona o servidor (1 local, 1 envio)`);
    ok(m.e.falhas.length === 0, `${origem}: não cai em "não entendi" quando o servidor entendeu`);
    /* "825" solto continua indo à revisão (regra de 14/09: pode ser R$ 8,25). Já com a fala CERTA, a revisão leva o texto certo. */
    ok(m.e.revisoes.length === 1 && m.e.revisoes[0].titulo === 'Confirme o valor que ouvi' && m.e.revisoes[0].transcricao === FALA, `${origem}: a revisão recebe "${FALA}", não o lixo`);

    /* 2. Mesma fala dita com "reais": grava saída de 825, crédito no C6, descrição Uber. */
    m = await rodar(origem, (x) => ({ local: LIXO, servidor: x.servidorDiz('Uber 825 reais no credito C6') }));
    const s = m.e.salvos[0];
    ok(m.e.salvos.length === 1 && s.amount === 825 && s.card_id === 'c6' && s.type === 'out' && /uber/i.test(s.description) && s.payment_method === 'credit', `${origem}: "Uber 825 reais no crédito C6" grava saída 825, C6, crédito, Uber`);
    ok(s.card_id === 'c6' && s.category === 'Transporte', `${origem}: categoria Transporte`);

    /* 3. Aparelho bom: não gasta o servidor. */
    m = await rodar(origem, () => ({ local: 'Uber 825 reais no credito C6', servidor: new Error('nao deveria enviar') }));
    ok(m.e.envios === 0 && m.e.salvos.length === 1, `${origem}: texto bom do aparelho não chama o servidor`);

    /* 4. Lixo do aparelho e sem rede: a fala espera (fila), nunca "ouvi" o lixo. */
    m = await rodar(origem, () => ({ local: LIXO, servidor: new TypeError('Network request failed') }));
    ok(m.e.salvos.length === 0 && m.e.falhas.length === 0 && m.e.fila.length === 1 && m.e.fila[0].revisao === undefined, `${origem}: sem rede, a fala vai para a fila (não vira "não entendi")`);
    ok(!vazou(m), `${origem}: o lixo não aparece em nenhum recibo, revisão ou fila`);

    /* 5. Servidor devolve lixo (aparelho sem reconhecedor): ao vivo = "não entendi" sem mostrar a frase. */
    m = await rodar(origem, (x) => ({ local: null, servidor: x.servidorDiz(LIXO) }));
    ok(m.e.salvos.length === 0 && m.e.falhas.join() === 'nao_entendi', `${origem}: lixo do servidor ao vivo vira "não entendi"`);
    ok(!vazou(m), `${origem}: a frase inventada não é repetida na falha ao vivo`);

    /* 6. Retomada ("Tentar de novo"), lixo do servidor: o recibo não cita "Ouvi:", e a fala continua guardada. */
    m = await rodar(origem, (x) => ({ local: LIXO, servidor: x.servidorDiz(LIXO) }), { daFila: true });
    const recibo = m.e.recibos.find((r) => typeof r === 'object');
    ok(recibo && recibo.titulo === 'Não entendi a fala guardada' && !/Ouvi/.test(recibo.texto) && !recibo.transcricao, `${origem}: retomada com lixo: recibo claro, sem "Ouvi:" e sem a frase`);
    ok(m.e.fila.some((i) => i.revisao) && m.e.apagados === 0, `${origem}: o áudio continua guardado para nova tentativa`);

    /* 7. Texto incompleto mas financeiro ("mercado") continua aparecendo, para completar à mão. */
    m = await rodar(origem, (x) => ({ local: null, servidor: x.servidorDiz('mercado') }), { daFila: true });
    const r7 = m.e.recibos.find((r) => typeof r === 'object');
    ok(r7 && /Ouvi: "mercado"/.test(r7.texto), `${origem}: "mercado" sem valor continua sendo mostrado como ouvido`);

    /* 8. Servidor recusa de vez (nao_entendi) com lixo do aparelho: não mostra o lixo. */
    m = await rodar(origem, (x) => ({ local: LIXO, servidor: x.servidorFalha('nao_entendi', 422) }), { daFila: true });
    ok(!vazou(m) && m.e.fila.some((i) => i.revisao), `${origem}: servidor também não entendeu: revisão sem o lixo e áudio guardado`);
  }

  /* Paridade: mesma fala, mesma decisão e mesmos efeitos nas duas entradas. */
  console.log('Paridade app x widget');
  const cenarios = {
    lixoMaisServidorBom: (x) => ({ local: LIXO, servidor: x.servidorDiz('Uber 825 reais no credito C6') }),
    lixoSemRede: () => ({ local: LIXO, servidor: new TypeError('Network request failed') }),
    lixoDoServidor: (x) => ({ local: null, servidor: x.servidorDiz(LIXO) }),
    valorSolto: (x) => ({ local: LIXO, servidor: x.servidorDiz(FALA) }),
  };
  for (const [nome, c] of Object.entries(cenarios)) {
    for (const daFila of [false, true]) {
      const a = resumo(await rodar('app', c, { daFila }));
      const w = resumo(await rodar('widget', c, { daFila }));
      ok(a === w, `paridade (${nome}${daFila ? ', retomada' : ''}): botão do app e widget decidem igual`);
    }
  }
  console.log(`\n${aprovadas} checagens ok`);
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
