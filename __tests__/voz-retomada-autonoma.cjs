/* Módulos reais, processo reiniciado e bordas de disco/rede/Android dubladas.
   Não comprova WorkManager, captura de microfone ou reboot no aparelho. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const compilados = new Map();
let verificacoes = 0;
function igual(a, b, nome) { assert.deepEqual(JSON.parse(JSON.stringify(a)), b, nome); verificacoes++; }
function ok(a, nome) { assert.ok(a, nome); verificacoes++; }

function ambiente(persistido = {}) {
  const disco = persistido.disco || new Map();
  const arquivos = persistido.arquivos || new Map();
  const banco = persistido.banco || new Map();
  const e = { dono: 'a', rede: true, rpcErro: null, transcript: 'mercado 43,48 no pix', agora: Date.parse('2026-10-27T15:00:00Z'),
    chamadas: [], envios: 0, avisos: [], acks: [], agenda: [], estados: [], logs: [], snapshots: 0, falharRecibo: false, trocarAntesRpc: false };
  const cache = new Map();
  const storage = {
    getItem: async (k) => { if (e.falharLeituraFila && k === 'grana:queue:widget-voz-pendente-v1') throw Error('EIO leitura da fila'); return disco.get(k) ?? null; }, setItem: async (k, v) => { disco.set(k, v); },
    removeItem: async (k) => { disco.delete(k); }, getAllKeys: async () => [...disco.keys()],
    multiGet: async (ks) => ks.map((k) => [k, disco.get(k) ?? null]),
  };
  const arquivoDuble = {
    documentDirectory: 'file:///docs/', makeDirectoryAsync: async () => {},
    getInfoAsync: async (p) => ({ exists: arquivos.has(p) || [...arquivos.keys()].some((k) => k.startsWith(p)), modificationTime: e.agora / 1000 }),
    readDirectoryAsync: async (p) => { if (e.travarPasta) await e.travarPasta; return [...arquivos.keys()].filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)); },
    readAsStringAsync: async (p) => { if (!arquivos.has(p)) throw Error('arquivo ausente'); return arquivos.get(p); },
    writeAsStringAsync: async (p, valor) => { arquivos.set(p, valor); },
    copyAsync: async ({ from, to }) => { if (!arquivos.has(from)) throw Error('áudio ausente: ' + from); arquivos.set(to, arquivos.get(from)); },
    deleteAsync: async (p) => { arquivos.delete(p); },
  };
  const nativo = {
    definirEstado: (s) => { e.estados.push(s); },
    agendarRetomadaVoz: async (...a) => { e.agenda.push(a); return true; },
    cancelarRetomadaVoz: async () => {},
    concluirRetomadaVoz: async (...a) => { e.acks.push(a); },
  };
  const notificacoes = {
    podeNotificar: async () => true,
    notificarRevisao: async (...a) => { e.avisos.push(['revisao', ...a]); },
    notificarFalha: async (...a) => { e.avisos.push(['falha', ...a]); },
    notificarSucesso: async (...a) => { if (e.falharRecibo) throw Error('recibo indisponível'); e.avisos.push(['sucesso', ...a]); },
    notificarPendenteOffline: async (...a) => { e.avisos.push(['audio', ...a]); },
    notificarSalvoLocal: async (...a) => { e.avisos.push(['operacao', ...a]); },
    notificarProblemaServico: async (...a) => { e.avisos.push(['servico', ...a]); },
  };
  const deps = {
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask() {} } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    '@/modules/grana-voice-widget': nativo,
    'expo-file-system/legacy': arquivoDuble,
    'expo-file-system': { File: class { get size() { return 4096; } get exists() { return true; } async bytes() { return new Uint8Array(4096); } } },
    'expo/fetch': { fetch: async () => { e.envios++; if (!e.rede) throw TypeError('Network request failed'); return Response.json({ status: 'ready', transcript: e.transcript }); } },
    './sessao-offline': { idDoUsuarioLocal: async () => e.dono, sessaoEstaTravada: () => false,
      tokenDeAcessoLocal: async () => e.dono ? 'token-' + e.dono : null, lerSessaoDoDisco: async () => e.dono ? { user: { id: e.dono } } : null },
    './voz-local': { transcreverNoAparelho: async () => e.travarReconhecimento ? await e.travarReconhecimento : null },
    './widget-voz-notificacoes': notificacoes,
    './offline-cache': { isLikelyNetworkError: (erro) => /network/i.test(String(erro?.message)) },
    './data': { fetchCategories: async () => [], fetchApelidosCategoria: async () => [], fetchCreditCards: async () => [{ id: 'c6', name: 'C6', wallet_id: 'w', closing_day: 10 }] },
    './wallets': { fetchWallets: async () => [{ id: 'w', name: 'Pessoal', is_default: true }] },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './cache-de-tela': { lancamentoGravado() {} },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => { e.snapshots++; } },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './supabase': { supabase: { auth: { getUser: async () => ({ data: { user: e.dono ? { id: e.dono } : null } }), getSession: async () => ({ data: { session: { user: { id: e.dono }, access_token: 'token-' + e.dono } } }) },
      rpc: (nome, args) => { let token; const envio = { setHeader: (_, valor) => { token = valor; return envio; }, abortSignal: async () => {
        if (e.trocarAntesRpc) e.dono = 'b';
        e.chamadas.push({ nome, args, dono: e.dono, token });
        if (!e.rede) return { error: { message: 'Network request failed' } };
        if (e.rpcErro) return { error: e.rpcErro };
        const id = args.p_request_id;
        const replayed = banco.has(id);
        if (!replayed) banco.set(id, args);
        if (e.falharLeituraDepoisRpc) e.falharLeituraFila = true;
        return { data: { status: 'committed', operation_id: 'op-' + id, ids: ['tx-' + id], replayed } };
      } }; return envio; },
    } },
  };
  class Relogio extends Date { constructor(...a) { super(...(a.length ? a : [e.agora])); } static now() { return e.agora; } }
  function real(nome) {
    const arquivo = nome.startsWith('lib/') ? nome : 'lib/' + nome + '.ts';
    if (cache.has(arquivo)) return cache.get(arquivo);
    const exports = {}; cache.set(arquivo, exports);
    if (!compilados.has(arquivo)) compilados.set(arquivo, ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText);
    vm.runInNewContext(compilados.get(arquivo), {
      exports, console: { ...console, warn: (...a) => e.logs.push(a), error: (...a) => e.logs.push(a) },
      Date: Relogio, JSON, Object, Array, Map, Set, Promise, Number, String, RegExp, Math, Error, TypeError, Intl, Uint8Array, AbortController,
      setTimeout: (fn, ms) => { (e.prazos ||= []).push(ms); return setTimeout(fn, e.acelerarPrazo && ms >= 100000 ? 5 : ms); }, clearTimeout, FormData: class { append() {} }, __DEV__: false,
      process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid' } },
      require: (id) => { if (id in deps) return deps[id]; if (id.startsWith('./')) return real(id.slice(2)); throw Error('import sem dublê: ' + arquivo + ' ' + id); },
    }, { filename: arquivo });
    return exports;
  }
  return { e, disco, arquivos, banco, real, nativo, notificacoes, deps,
    reiniciar: () => ambiente({ disco, arquivos, banco }),
    worker: (requestId, userId = 'a') => real('widget-voz-task').executarRetomadaVoz({ requestId, userId, execucaoId: 'exec-' + requestId }) };
}

(async () => {
  for (const source of ['app', 'widget']) {
    let m = ambiente();
    m.arquivos.set('file:///captura.m4a', 'audio'); m.e.rede = false;
    igual(await m.real('widget-voz-task').executarTarefa({ caminho: 'file:///captura.m4a', requestId: 'rede', userId: 'a', source, dataCaptura: '2026-10-25', capturadoEm: m.e.agora - 172800000 }),
      { guardada: true, motivo: 'sem_rede' }, source + ' preserva fala offline');
    ok(m.e.agenda.some((a) => a[0] === 'rede' && a[1] === 'a' && a[2] === 150000), 'reserva tem watchdog durável');
    igual(m.e.agenda.filter((a) => a[0] === 'rede').map((a) => a.slice(1)), [['a', 150000], ['a', 0]],
      source + ' reserva com 150s e antecipa a mesma intenção/dono só quando fica pronta');
    igual(m.e.chamadas.length, 0, 'falha na transcrição não grava');
    m = m.reiniciar();
    m.e.transcript = 'mercado 43,48 no pix ontem';
    await m.worker('rede');
    igual(m.e.acks.at(-1), ['exec-rede', 'concluida'], 'Worker confirma conclusão');
    igual(m.banco.size, 1, 'uma gravação depois de reiniciar sem abrir UI');
    igual(m.e.chamadas[0].args.p_request_id, 'rede', 'mesma intenção');
    igual(m.e.chamadas[0].args.p_payload.occurred_on, '2026-10-24', 'ontem usa a data da captura original');
    igual(m.e.chamadas[0].args.p_source, source, 'origem preservada');
    await m.worker('rede');
    igual(m.e.chamadas.length, 1, 'Worker repetido sem item não envia de novo');
    igual(m.arquivos.size, 0, 'áudio consumido não sobra no disco');
  }

  const payload = { kind: 'transaction', type: 'out', description: 'Mercado', amount: 43.48, category: 'Alimentação', color: '#fff', occurred_on: '2026-10-27', wallet_id: 'w' };
  let m = ambiente(); m.e.rede = false;
  await m.real('voice-operations').registrarOperacaoVoz('op-offline', 'widget', payload);
  m = m.reiniciar();
  await m.worker('op-offline');
  igual(m.banco.size, 1, 'operação offline sobe sem áudio e sem abrir app');
  igual(m.e.acks.at(-1), ['exec-op-offline', 'concluida'], 'operação confirmada tem ACK');
  ok(m.e.avisos.some((a) => a[0] === 'sucesso'), 'sucesso real tem recibo');
  igual(m.e.avisos.find((a) => a[0] === 'sucesso')[2], 'op-offline', 'recibo final substitui a mesma intenção na bandeja');
  igual(m.e.snapshots, 1, 'Worker de operação sem áudio também atualiza snapshots');
  igual((await m.real('voice-operations').listarOperacoesVozLocais()).length, 0, 'operação sai da fila depois do recibo');

  m = ambiente(); m.e.rede = false;
  await m.real('voice-operations').registrarOperacaoVoz('troca', 'app', payload);
  m = m.reiniciar(); m.e.dono = 'b';
  await m.worker('troca');
  igual(m.e.chamadas.length, 0, 'B não envia intenção de A');
  igual(m.e.envios, 0, 'B não transcreve áudio de A');
  igual(m.e.acks.at(-1), ['exec-troca', 'aguardar_usuario'], 'troca bloqueia Worker');
  ok(m.disco.has('grana:voz:operacao:a:troca'), 'intenção de A preservada');

  m = ambiente(); m.arquivos.set('file:///captura.m4a', 'audio');
  await m.real('widget-voz-pendentes').reservarFalaEmAndamento({ caminho: 'file:///captura.m4a', requestId: 'ocupada', userId: 'a' });
  m = m.reiniciar(); await m.worker('ocupada');
  igual(m.e.acks.at(-1), ['exec-ocupada', 'tentar_novamente'], 'reserva viva não é atropelada');
  igual(m.e.envios + m.e.chamadas.length, 0, 'reserva viva sem transcrição ou escrita');
  m.e.agora += 150001; await m.worker('ocupada');
  igual(m.banco.size, 1, 'reserva vencida retoma no mesmo núcleo');

  m = ambiente(); m.arquivos.set('file:///docs/voz-orfa/legada.m4a', 'sem dono');
  igual(await m.real('widget-voz-pendentes').adotarVozesOrfas('a'), 0, 'órfã legada nunca é atribuída ao login atual');
  ok(m.arquivos.has('file:///docs/voz-orfa/legada.m4a'), 'órfã sem dono não é apagada');
  m.arquivos.set('file:///docs/voz-orfa/identificada.m4a', 'dono a');
  m.arquivos.set('file:///docs/voz-orfa/identificada.json', JSON.stringify({ userId: 'a', capturadoEm: m.e.agora, dataCaptura: '2026-10-27' }));
  igual(await m.real('widget-voz-pendentes').adotarVozesOrfas('a'), 1, 'órfã identificada segue a fila real');

  m = ambiente(); m.arquivos.set('file:///captura-orfa.m4a', 'audio');
  m.e.agenda.push(['orfa-pronta', 'a', 150000]); // watchdog criado no começo da captura nativa
  await m.real('widget-voz-pendentes').guardarVozOrfa({ caminho: 'file:///captura-orfa.m4a', requestId: 'orfa-pronta', userId: 'a' });
  igual(m.e.agenda.filter((a) => a[0] === 'orfa-pronta').map((a) => a.slice(1)), [['a', 150000], ['a', 0]],
    'órfã pronta antecipa watchdog preservando id e dono');

  for (const source of ['app', 'widget']) {
    m = ambiente(); m.arquivos.set('file:///captura.m4a', 'audio'); m.e.transcript = 'mercado';
    await m.real('widget-voz-pendentes').adicionarVozPendente({ caminho: 'file:///captura.m4a', requestId: 'incompleta', userId: 'a', source });
    await m.worker('incompleta');
    igual(m.banco.size, 0, source + ' não inventa valor para fala incompleta');
    if (source === 'widget') ok(m.e.estados.includes('repetir'), source + ' pede nova fala no widget');
    igual(m.e.acks.at(-1), ['exec-incompleta', 'aguardar_usuario'], source + ' revisão sai da retomada automática');
    await m.worker('incompleta');
    igual(m.banco.size, 0, 'Worker repetido não tenta salvar fala ambígua');
  }

  m = ambiente(); m.e.rede = false;
  await m.real('voice-operations').registrarOperacaoVoz('recibo', 'widget', payload);
  m = m.reiniciar(); m.e.falharRecibo = true; await m.worker('recibo');
  igual(m.banco.size, 1, 'falha de recibo não desfaz a gravação');
  igual(m.e.acks.at(-1), ['exec-recibo', 'tentar_novamente'], 'recibo falho preserva intenção para readback');
  m.e.falharRecibo = false; await m.worker('recibo');
  igual(m.banco.size, 1, 'repetição conserva idempotência após falha de recibo');
  ok(m.e.avisos.some((a) => a[0] === 'falha' && a[1] === 'ja_lancada'), 'replay não anuncia lançamento novo');

  m = ambiente(); m.arquivos.set('file:///captura.m4a', 'audio'); m.e.trocarAntesRpc = true;
  await m.real('widget-voz-task').executarTarefa({ caminho: 'file:///captura.m4a', requestId: 'token-fixado', userId: 'a', source: 'widget' });
  igual(m.e.chamadas[0].token, 'Bearer token-a', 'troca durante fetch não envia operação de A com credencial de B');
  igual(m.e.avisos.filter((a) => a[0] === 'sucesso').length, 0, 'conta B não recebe recibo financeiro de A');
  igual(m.banco.size, 1, 'gravação já em voo é conservada para readback do mesmo requestId');

  // WT02: leitura inconclusiva jamais significa que a intenção terminou.
  for (const invalida of ['EIO', 'JSON']) {
    m = ambiente();
    const fila = [{ caminho: 'file:///docs/voz-pendente/leitura.m4a', requestId: 'leitura', userId: 'a', criadoEm: m.e.agora }];
    const original = invalida === 'JSON' ? '{truncado' : JSON.stringify(fila);
    m.disco.set('grana:queue:widget-voz-pendente-v1', original);
    m.arquivos.set(fila[0].caminho, 'audio');
    m.e.falharLeituraFila = invalida === 'EIO';
    await m.worker('leitura');
    igual(m.e.acks.at(-1), ['exec-leitura', 'tentar_novamente'], invalida + ' não encerra agenda');
    igual(m.disco.get('grana:queue:widget-voz-pendente-v1'), original, invalida + ' não regrava índice');
    igual(m.e.envios + m.e.chamadas.length, 0, invalida + ' não transcreve nem grava');
    ok(m.arquivos.has(fila[0].caminho), invalida + ' conserva áudio');
  }

  m = ambiente(); m.arquivos.set('file:///captura.m4a', 'audio');
  await m.real('widget-voz-pendentes').adicionarVozPendente({ caminho: 'file:///captura.m4a', requestId: 'limpeza-eio', userId: 'a', source: 'widget' });
  m.e.falharLeituraDepoisRpc = true;
  const indiceAntes = m.disco.get('grana:queue:widget-voz-pendente-v1');
  await m.worker('limpeza-eio');
  igual(m.e.acks.at(-1), ['exec-limpeza-eio', 'tentar_novamente'], 'EIO na conclusão também preserva agenda');
  igual(m.disco.get('grana:queue:widget-voz-pendente-v1'), indiceAntes, 'falha de conclusão não regrava índice vazio');
  igual(m.banco.size, 1, 'gravação confirmada é conservada durante falha da limpeza');
  m.e.falharLeituraDepoisRpc = false; m.e.falharLeituraFila = false;
  await m.worker('limpeza-eio');
  igual(m.banco.size, 1, 'recuperação da limpeza usa replay sem duplicar');
  igual(m.e.acks.at(-1), ['exec-limpeza-eio', 'concluida'], 'limpeza recuperada conclui a intenção');

  // WT02 final: EIO do journal não comprova que uma órfã não tem dono.
  m = ambiente();
  const audioMeta = 'file:///docs/voz-orfa/meta-eio.m4a';
  const journalMeta = 'file:///docs/voz-orfa/meta-eio.json';
  const metadadosOriginais = JSON.stringify({ userId: 'a', requestId: 'meta-eio', source: 'widget', capturadoEm: m.e.agora, dataCaptura: '2026-10-27', capturaFinalizada: true });
  m.arquivos.set(audioMeta, 'audio'); m.arquivos.set(journalMeta, metadadosOriginais);
  const lerJournal = m.deps['expo-file-system/legacy'].readAsStringAsync;
  m.deps['expo-file-system/legacy'].readAsStringAsync = async (p) => {
    if (p === journalMeta) throw Object.assign(Error('EIO temporário do journal'), { code: 'EIO' });
    return lerJournal(p);
  };
  await m.worker('meta-eio');
  igual(m.e.acks.at(-1), ['exec-meta-eio', 'tentar_novamente'], 'EIO do journal mantém a agenda durável');
  igual(m.e.envios + m.e.chamadas.length, 0, 'EIO do journal não transcreve nem grava');
  igual(m.disco.size, 0, 'EIO do journal não cria índice nem infere dono');
  igual(m.arquivos.get(journalMeta), metadadosOriginais, 'EIO do journal conserva todos os metadados');
  igual(m.arquivos.get(audioMeta), 'audio', 'EIO do journal conserva áudio');
  m.deps['expo-file-system/legacy'].readAsStringAsync = lerJournal;
  await m.worker('meta-eio');
  igual(m.e.acks.at(-1), ['exec-meta-eio', 'concluida'], 'leitura recuperada conclui o mesmo requestId');
  igual(m.banco.size, 1, 'leitura recuperada grava exatamente uma intenção');
  igual(m.e.chamadas[0].args.p_request_id, 'meta-eio', 'recuperação do journal conserva a idempotência');

  for (const [caso, journal] of [['sem-dono', '{}'], ['outro-dono', '{"userId":"b"}'], ['legado-ilegivel', '{truncado']]) {
    m = ambiente();
    m.arquivos.set(`file:///docs/voz-orfa/${caso}.m4a`, 'audio');
    m.arquivos.set(`file:///docs/voz-orfa/${caso}.json`, journal);
    await m.worker(caso);
    igual(m.e.acks.at(-1), ['exec-' + caso, 'concluida'], caso + ' legível ou inválido não é confundido com EIO temporário');
    igual(m.e.envios + m.e.chamadas.length + m.disco.size, 0, caso + ' não é adotado na conta atual');
    igual(m.arquivos.size, 2, caso + ' conserva áudio e journal');
  }

  // WT03: o teto nasce antes da adoção e a continuação tardia não escreve.
  m = ambiente(); m.e.acelerarPrazo = true;
  let destravar;
  m.e.travarPasta = new Promise((resolve) => { destravar = resolve; });
  m.arquivos.set('file:///docs/voz-orfa/prazo.m4a', 'audio');
  m.arquivos.set('file:///docs/voz-orfa/prazo.json', JSON.stringify({ userId: 'a', dataCaptura: '2026-10-27', capturadoEm: m.e.agora }));
  await m.worker('prazo');
  igual(m.e.acks.at(-1), ['exec-prazo', 'tentar_novamente'], 'adoção pendurada encerra com ACK de retry');
  ok(m.e.prazos.includes(107000) && m.e.prazos.includes(5000), '107s de trabalho mais margem5s para ACK');
  destravar(); await new Promise((r) => setTimeout(r, 15));
  igual(m.e.envios + m.e.chamadas.length, 0, 'adoção liberada após abandono não chega à rede');
  igual(m.disco.size, 0, 'adoção liberada após abandono não grava o índice');
  igual(m.arquivos.size, 2, 'adoção liberada após abandono não apaga a intenção original');

  m = ambiente(); m.arquivos.set('file:///captura.m4a', 'audio');
  await m.real('widget-voz-pendentes').adicionarVozPendente({ caminho: 'file:///captura.m4a', requestId: 'reconhecedor-tardio', userId: 'a', source: 'widget' });
  m.e.acelerarPrazo = true;
  let liberarReconhecedor;
  m.e.travarReconhecimento = new Promise((resolve) => { liberarReconhecedor = resolve; });
  await m.worker('reconhecedor-tardio');
  igual(m.e.acks.at(-1), ['exec-reconhecedor-tardio', 'tentar_novamente'], 'reconhecedor pendurado cabe no teto compartilhado');
  liberarReconhecedor(null); await new Promise((r) => setTimeout(r, 15));
  igual(m.e.envios + m.e.chamadas.length, 0, 'reconhecedor liberado após cancelamento não inicia fallback pago nem RPC');
  ok(m.disco.get('grana:queue:widget-voz-pendente-v1').includes('reconhecedor-tardio'), 'cancelamento conserva fala para tentativa nova');

  // WT04: falha de serviço é ação de suporte, nunca nova fala ou falta de rede.
  m = ambiente(); m.e.rede = false;
  await m.real('voice-operations').registrarOperacaoVoz('servico', 'widget', payload);
  m = m.reiniciar(); m.e.rpcErro = { code: 'PGRST202', message: 'RPC ausente' };
  await m.worker('servico');
  igual(m.e.acks.at(-1), ['exec-servico', 'aguardar_usuario'], 'falha permanente não entra em retry benigno');
  ok(m.disco.has('grana:voz:operacao:a:servico'), 'falha permanente conserva intenção');
  ok(m.e.avisos.some((a) => a[0] === 'servico' && /suporte/.test(a[1])), 'falha de serviço aparece com diagnóstico');
  igual(m.e.avisos.filter((a) => a[0] === 'revisao' || a[0] === 'sucesso').length, 0, 'falha permanente não orienta repetir nem afirma sucesso');
  ok(m.e.estados.includes('atencao') && !m.e.estados.includes('pendente'), 'falha permanente não diz aguardando conexão');

  // Auth-js REAL: timer de refresh desligado, token vencido renova na tentativa ativa.
  m = ambiente();
  const { createClient } = require('@supabase/supabase-js');
  const agora = Math.floor(Date.now() / 1000);
  const usuario = { id: 'a', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' };
  const sessaoVelha = { access_token: 'x.y.z', refresh_token: 'refresh-sintetico', token_type: 'bearer', expires_in: 3600, expires_at: agora - 60, user: usuario };
  const authDisco = new Map([['teste-voz-auth', JSON.stringify({ ...sessaoVelha, expires_at: agora + 3600 })]]);
  const authChamadas = [];
  const supabaseReal = createClient('https://auth-voz.invalid', 'anon-sintetico', {
    auth: { storageKey: 'teste-voz-auth', storage: { getItem: async (k) => authDisco.get(k) ?? null,
      setItem: async (k, v) => authDisco.set(k, v), removeItem: async (k) => authDisco.delete(k) },
      autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    global: { fetch: async (url, opcoes) => {
      authChamadas.push([String(url), new Headers(opcoes?.headers).get('Authorization')]);
      if (String(url).includes('/auth/v1/token')) return Response.json({ access_token: 'renovado-sintetico', refresh_token: 'refresh-novo', token_type: 'bearer', expires_in: 3600, expires_at: agora + 3600, user: usuario });
      if (String(url).includes('/rest/v1/rpc/registrar_operacao_voz')) return Response.json({ status: 'committed', operation_id: 'op-auth', ids: ['tx-auth'], replayed: false });
      throw Error('chamada inesperada: ' + url);
    } },
  });
  await supabaseReal.auth.getSession();
  supabaseReal.auth.stopAutoRefresh();
  authDisco.set('teste-voz-auth', JSON.stringify(sessaoVelha));
  igual(authChamadas.length, 0, 'cliente inicializado em background sem renovação por timer');
  m.deps['./supabase'] = { supabase: supabaseReal };
  const gravada = await m.real('voice-operations').registrarOperacaoVoz('auth-ativa', 'widget', payload);
  igual(gravada.status, 'committed', 'sessão vencida renova durante envio sem timer do app');
  igual(authChamadas.filter((a) => a[0].includes('/auth/v1/token')).length, 1, 'uma renovação ativa real');
  igual(authChamadas.find((a) => a[0].includes('/rest/v1/rpc/'))[1], 'Bearer renovado-sintetico', 'RPC usa token renovado fixado na conta');
  await supabaseReal.auth.dispose();

  console.log(`OK: ${verificacoes} verificações, retomada autônoma JS, paridade app/widget, dono, data, idempotência, reserva e recibos reais.`);
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
