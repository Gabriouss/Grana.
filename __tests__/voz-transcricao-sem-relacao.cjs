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
require('./helpers/falha-com-duble-incompleto.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
const ok = (c, nome) => { assert.ok(c, nome); aprovadas++; console.log('  ok  ' + nome); };

const LIXO = 'Acompanhe o processo de produção de um produto de qualidade e de qualidade';
/* Dois dígitos: desde 17/10/2026, "825" nu já grava R$ 8,25 (decisão do autor). */
const FALA = 'Uber 82 credito C6';

function montar(origem) {
  /* Bordas controladas pelo cenário. */
  const e = { local: null, localConsome: false, desvio: 0, prazosLocais: [], localChamadas: 0, servidor: null, envios: 0, token: 't', fila: [], salvos: [], recibos: [], falhas: [], revisoes: [], apagados: 0, estados: [], removidas: [], falhaRevisao: false, erros: [] };
  const cartoes = [{ id: 'c6', name: 'C6 Bank', bank: 'C6', wallet_id: 'w' }, { id: 'nu', name: 'Nubank', bank: 'Nubank', wallet_id: 'w' }];
  const cache = new Map();
  const substitutos = {
    './voz-local': { transcreverNoAparelho: async (_uri, prazoMs) => { e.localChamadas++; e.prazosLocais.push(prazoMs); if (e.localConsome) e.desvio += prazoMs; return e.local; } },
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
    'expo-file-system': { File: class { get exists() { return true; } get size() { return 4; } async bytes() { return new Uint8Array(4); } } },
    'expo/fetch': { fetch: async () => { e.envios++; const r = e.servidor; if (r instanceof Error) throw r; return r; } },
    './sessao-offline': {
      tokenDeAcessoLocal: async () => e.token || null,
      idDoUsuarioLocal: async () => 'u1',
      lerSessaoDoDisco: async () => ({ access_token: 't' }),
    },
    './offline-cache': { isLikelyNetworkError: (x) => /network/i.test(String(x?.message ?? x)) },
    '@/modules/grana-voice-widget': { definirEstado: (estado) => e.estados.push(estado) },
    './widget-voz-notificacoes': {
      podeNotificar: async () => true,
      notificarRevisao: async (titulo, transcricao) => {
        if (e.falhaRevisao) throw new Error('notificacao indisponivel');
        const recibo = real('lib/voz-recibos.ts').RECIBOS_VOZ.repetir(titulo, transcricao);
        e.revisoes.push({ ...recibo, transcricao });
      },
      notificarFalha: async (codigo) => { e.falhas.push(codigo); },
      notificarPendenteOffline: async () => { e.recibos.push('offline'); },
      notificarSucesso: async () => { e.recibos.push('sucesso'); },
      notificarSalvoLocal: async () => {},
    },
    './widget-voz-pendentes': {
      adicionarVozPendente: async (i) => { e.fila.push(i); },
      marcarVozEmRevisao: async (id, t) => { e.fila.push({ revisao: id, transcricao: t ?? null }); },
      removerVozPendente: async (id) => { e.removidas.push(id); },
    },
    './voz-recibos-da-fila': { guardarReciboDaFila: async (r) => { e.recibos.push(r); } },
    './voice-operations': { desfechoDaOperacaoVoz: require('./desfecho-voz-real.cjs'), registrarOperacaoVoz: async (_, __, input) => { e.salvos.push(input); return { ids: ['tx'], operationId: 'op' }; }, desfechoDoErroVoz: () => null, ehRecusaCartaoObrigatorio: () => false },
    './data': { fetchCreditCards: async () => cartoes, fetchApelidosCategoria: async () => [], fetchCategories: async () => [] },
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
      exports, console: { ...console, warn() {}, error: (...args) => e.erros.push(args) }, JSON, Date: class extends Date { static now() { return Date.now() + e.desvio; } }, String, Object, Array, Error, TypeError, Promise, RegExp, Number, Math, Set, Map, Intl, Uint8Array,
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
  return { e, tarefa, confiabilidade: real('lib/voz-confiabilidade.ts'), servidorDiz, servidorFalha, origem };
}

/* Uma execução, na entrada pedida. Botão do app e widget chamam o MESMO
   `executarTarefa`; a diferença é só `source`. `daFila` simula a retomada
   ("Tentar de novo" e retomada automática usam o arquivo da pasta da fila). */
async function rodar(origem, cenario, { daFila = false, requestId = 'r-' + origem } = {}) {
  const m = montar(origem);
  Object.assign(m.e, cenario(m));
  m.desfecho = await m.tarefa.executarTarefa({ caminho: daFila ? '/voz-pendente/a.m4a' : '/a.m4a', requestId, source: origem });
  return m;
}
/* Só o que a pessoa vê ou o que fica guardado; as entradas simuladas (local, servidor) ficam de fora. */
const vazou = (m) => JSON.stringify({ f: m.e.fila, r: m.e.recibos, v: m.e.revisoes, x: m.e.falhas, s: m.e.salvos }).includes('Acompanhe');
const resumo = (m) => JSON.stringify({
  local: m.e.localChamadas, envios: m.e.envios,
  salvos: m.e.salvos.map((s) => ({ kind: s.kind, type: s.type, description: s.description, amount: s.amount, category: s.category, payment_method: s.payment_method, card_id: s.card_id })),
  falhas: m.e.falhas, revisoes: m.e.revisoes, fila: m.e.fila.map((i) => i.revisao ? { revisao: true, t: i.transcricao } : { pendente: true }),
  recibos: m.e.recibos.map((r) => (typeof r === 'string' ? r : { titulo: r.titulo, texto: r.texto, transcricao: r.transcricao ?? null })),
  removidas: m.e.removidas.length,
  desfecho: m.desfecho,
});

(async () => {
  for (const origem of ['app', 'widget']) {
    console.log(`Entrada: ${origem}`);

    /* 1. O caso do autor: aparelho devolve lixo, servidor ouve a fala certa. */
    let m = await rodar(origem, (x) => ({ local: LIXO, servidor: x.servidorDiz(FALA) }));
    ok(m.e.localChamadas === 1 && m.e.envios === 1, `${origem}: lixo do aparelho aciona o servidor (1 local, 1 envio)`);
    ok(m.e.falhas.length === 0, `${origem}: não cai em "não entendi" quando o servidor entendeu`);
    /* "82" solto continua indo à revisão (inteiro nu de dois dígitos). Já com a fala CERTA, a revisão leva o texto certo. */
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

    /* 9. Smoke de 16/10 (Vigil): com rede, silêncio no microfone do emulador.
       O reconhecedor do aparelho, sem fala, só desiste no fim do prazo que
       recebe; recebia os 15 s inteiros e o servidor ficava sem tempo: a
       tentativa nem saía, virava "demorou" e o app dizia "Áudio guardado...
       com conexão" estando online. O servidor tem de ser tentado, dentro do
       mesmo prazo total. */
    m = await rodar(origem, (x) => ({ local: null, localConsome: true, servidor: x.servidorDiz('...') }));
    ok(m.e.envios === 1, `${origem}: reconhecedor do aparelho que esgota o próprio prazo não impede o servidor (1 envio)`);
    ok(m.e.falhas.join() === 'nao_entendi' && !m.e.recibos.includes('offline') && m.e.fila.length === 0, `${origem}: silêncio com rede vira "não entendi", não "Áudio guardado"`);
    ok(m.e.prazosLocais[0] <= 15_000 - 8_000, `${origem}: o aparelho recebe no máximo o prazo menos a reserva do servidor (${m.e.prazosLocais[0]} ms)`);
  }

  /* Paridade: mesma fala, mesma decisão e mesmos efeitos nas duas entradas. */
  // Value alone does not prove that the name survived transcription.
  const PARCIAL = 'credito R$53,54 no credito C6, categoria Alimentacao';
  const COMPLETA = 'Merenda R$53,54 no credito C6, categoria Alimentacao';
  for (const origem of ['app', 'widget']) {
    let m = await rodar(origem, (x) => ({ local: PARCIAL, servidor: x.servidorDiz(COMPLETA) }));
    ok(m.e.localChamadas === 1 && m.e.envios === 1 && m.e.salvos.length === 1 && m.e.salvos[0].description.toLowerCase().startsWith('merenda'), `${origem}: parcial local tenta servidor e salva Merenda da fala completa`);
    const merenda = m.e.salvos[0];
    ok(merenda.amount === 53.54 && merenda.category === 'Alimentação' && merenda.card_id === 'c6' && merenda.payment_method === 'credit', `${origem}: mantém R$ 53,54, Alimentacao e cartao C6 no credito`);

    // If the server also heard only metadata, ask for a new recording without saving.
    for (const daFila of [false, true]) {
      m = await rodar(origem, (x) => ({ local: PARCIAL, servidor: x.servidorDiz(PARCIAL) }), { daFila });
      ok(m.e.envios === 1 && m.e.salvos.length === 0, `${origem}${daFila ? ' fila' : ''}: parcial local e do servidor nao chamam RPC`);
      ok(m.e.revisoes.length === 1 && m.e.revisoes[0].titulo === 'Repita a fala completa' && /Toque no microfone e fale o lan[cç]amento completo/.test(m.e.revisoes[0].texto), `${origem}${daFila ? ' fila' : ''}: recibo pede nova fala no microfone sem abrir app`);
      ok(m.desfecho.repetir === true && m.e.apagados === 1, `${origem}${daFila ? ' fila' : ''}: desfecho pede repeticao e remove o audio incompleto`);
      if (daFila) {
        ok(m.e.removidas.includes('r-' + origem), `${origem}: a fala parcial sai da fila e nao sera reprocessada`);
        const novaFala = await rodar(origem, () => ({ local: COMPLETA, servidor: new Error('nao deveria enviar') }), { requestId: 'nova-' + origem });
        ok(novaFala.e.envios === 0 && novaFala.e.salvos.length === 1 && novaFala.e.salvos[0].description.toLowerCase().startsWith('merenda'), `${origem}: novo toque usa outra captura e request_id`);
      }
    }
  }

  const guard = montar('app').confiabilidade;
  for (const texto of [
    'Recarga de credito R$ 20,00',
    'Credito do celular R$ 20,00',
    'Pagamento de internet R$ 75,00',
  ]) ok(guard.transcricaoTemNomeInformativo(texto), `nome legitimo preservado: ${texto}`);
  ok(!guard.transcricaoTemNomeInformativo(PARCIAL), 'metadado de cartao/categoria sem nome fica incompleto');
  ok(guard.transcricaoTemNomeInformativo(COMPLETA), 'Merenda continua como nome com metadado de categoria');
  ok(guard.transcricaoTemNomeInformativo('Credito Maestri R$53,54 no credito C6, categoria Outros'), 'Credito Maestri nao confunde o estabelecimento com o cartao');
  ok(guard.transcricaoTemNomeInformativo('Credito Netflix R$53,54 no credito C6, categoria Assinaturas'), 'Credito Netflix nao confunde o estabelecimento com o cartao');
  for (const origem of ['app', 'widget']) {
    const texto = 'Credito Maestri R$53,54 no credito C6, categoria Alimentacao';
    const m = await rodar(origem, () => ({ local: texto, servidor: new Error('nao deveria enviar') }));
    ok(m.e.envios === 0 && m.e.salvos.length === 1 && /maestri/i.test(m.e.salvos[0].description), `${origem}: Credito Maestri continua sendo nome valido`);
  }
  const reciboFalhou = await rodar('widget', (x) => ({ local: PARCIAL, servidor: x.servidorDiz(PARCIAL), falhaRevisao: true }));
  ok(reciboFalhou.e.salvos.length === 0 && reciboFalhou.e.fila.some((i) => i.revisao), 'falha ao avisar preserva a captura como revisao, sem RPC');
  ok(reciboFalhou.e.erros.some(([mensagem]) => String(mensagem).includes('recibo de repeticao da fala incompleta falhou')) && reciboFalhou.e.estados.includes('repetir'), 'falha do recibo tem log proprio e estado nativo repetir');

  console.log('Paridade app x widget');
  const cenarios = {
    lixoMaisServidorBom: (x) => ({ local: LIXO, servidor: x.servidorDiz('Uber 825 reais no credito C6') }),
    lixoSemRede: () => ({ local: LIXO, servidor: new TypeError('Network request failed') }),
    lixoDoServidor: (x) => ({ local: null, servidor: x.servidorDiz(LIXO) }),
    valorSolto: (x) => ({ local: LIXO, servidor: x.servidorDiz(FALA) }),
    nomeParcial: (x) => ({ local: PARCIAL, servidor: x.servidorDiz(COMPLETA) }),
    ambosParciais: (x) => ({ local: PARCIAL, servidor: x.servidorDiz(PARCIAL) }),
    aparelhoEsgotaPrazo: (x) => ({ local: null, localConsome: true, servidor: x.servidorDiz('...') }),
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
