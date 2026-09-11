/* Bateria 6: os quatro caminhos de lançamento por voz, com e sem rede.
 *
 *   node __tests__/voz-auditoria-rodada6.cjs
 *
 * Exploratória, como as rodadas 3, 4 e 5: as expectativas escritas aqui são o
 * comportamento DESEJADO, não o atual. Reprovação é achado, não regressão.
 *
 * Todos os módulos são os de produção, compilados em memória e executados com
 * dublês. Cada caso afirma sobre o EFEITO COLATERAL — qual notificação saiu,
 * em que estado o widget ficou, se o arquivo foi apagado, se a fila guardou o
 * item — e não apenas sobre o valor devolvido.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function carregar(arquivo, dependencias = {}, globais = {}) {
  const exports = {};
  const fonte = fs.readFileSync(path.join(root, arquivo), 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, Date, setTimeout, clearTimeout, Promise, JSON, Math, Number, String,
    Object, Array, Error, RegExp, AbortController, Blob, File, Response, Request,
    Uint8Array, TextEncoder, TextDecoder, __DEV__: false,
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error('Import nao simulado em ' + arquivo + ': ' + id);
    },
    ...globais,
  }, { filename: arquivo });
  return exports;
}

let total = 0;
const falhas = [];
function check(familia, caso, obtido, esperado) {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas.push({ familia, caso, obtido, esperado });
}

function memoriaLocal() {
  const mapa = new Map();
  return {
    mapa,
    async getItem(k) { return mapa.has(k) ? mapa.get(k) : null; },
    async setItem(k, v) { mapa.set(k, v); },
    async removeItem(k) { mapa.delete(k); },
    async getAllKeys() { return [...mapa.keys()]; },
    async multiGet(ks) { return ks.map((k) => [k, mapa.get(k) ?? null]); },
  };
}

const heuristics = (() => {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const source = fs.readFileSync(absolute, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, console, Date, setTimeout, clearTimeout, require(id) {
      return load(path.resolve(path.dirname(absolute), id.endsWith('.ts') ? id : id + '.ts'));
    } }, { filename: absolute });
    return exports;
  }
  return load('lib/heuristics.ts');
})();
const { precisaRevisarValorVoz } = carregar('lib/voz-confiabilidade.ts', { './heuristics': heuristics });

/* =====================================================================
 * PARTE A - lib/voice-operations.ts: o que acontece quando o SERVIDOR
 * recusa de forma permanente. Em 07/09/2026 a RPC nao existia em producao
 * e o app disse "salvo no aparelho" por dois dias.
 * ===================================================================== */
function montarOperacoes(opts) {
  const o = opts || {};
  const store = memoriaLocal();
  const mod = carregar('lib/voice-operations.ts', {
    './supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      rpc: () => {
        const p = Promise.resolve(o.erroRpc
          ? { data: null, error: o.erroRpc }
          : { data: { status: o.statusRpc || 'committed', ids: ['t1'], operation_id: 'op1', replayed: false }, error: null });
        p.abortSignal = () => p;
        return p;
      },
    } },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    '@react-native-async-storage/async-storage': { __esModule: true, default: store },
  });
  return { mod, store };
}

async function parteA() {
  const F = 'A. servidor recusa de forma permanente';
  const payload = { kind: 'transaction', type: 'out', description: 'Mercado', amount: 32,
    category: 'Alimentacao', color: '#fff', occurred_on: '2026-09-11', wallet_id: 'w1' };

  {
    const { mod, store } = montarOperacoes({ erroRpc: { code: 'PGRST202', message: 'function not found' } });
    let erro = null, res = null;
    try { res = await mod.registrarOperacaoVoz('r1', 'widget', payload); } catch (e) { erro = e; }
    /* Estas duas asserções exigiam que PGRST202 LANÇASSE e DESCARTASSE a
       operação. Invertidas em 11/09/2026, porque contradiziam o teste mais
       antigo `voz-offline.cjs` e, pior, a própria mensagem que o app mostra.

       PGRST202 significa que a função não existe no servidor, ou seja,
       migration não aplicada — um erro NOSSO, que será corrigido.
       `explicarFalhaDeEnvio` promete na tela "Nada foi perdido", e descartar
       quebraria essa promessa. Em 07/09/2026 a RPC ficou dois dias fora do
       ar: sob a regra antiga, todo lançamento por voz daqueles dois dias
       seria APAGADO em vez de sincronizar quando a migration entrasse.

       O risco oposto, fila crescendo para sempre se o objeto nunca voltar,
       é real e menor, e está coberto: a mensagem manda avisar o suporte. */
    check(F, 'PGRST202 fica pendente ate a migration entrar', res ? res.status : 'erro:' + (erro && erro.code), 'pending');
    check(F, 'PGRST202 nao apaga o lancamento da pessoa', store.mapa.size, 1);
  }

  {
    const { mod, store } = montarOperacoes({ erroRpc: { code: '42501', message: 'permission denied' } });
    let erro = null;
    try { await mod.registrarOperacaoVoz('r2', 'widget', payload); } catch (e) { erro = e; }
    check(F, '42501 estoura para quem chamou', erro && erro.code, '42501');
    check(F, '42501 limpa a fila local', store.mapa.size, 0);
  }

  {
    const { mod, store } = montarOperacoes({ erroRpc: { message: 'network request failed' } });
    const res = await mod.registrarOperacaoVoz('r3', 'widget', payload);
    check(F, 'rede cai vira pendente', res.status, 'pending');
    check(F, 'rede cai guarda a operacao', store.mapa.size, 1);
  }

  {
    const { mod, store } = montarOperacoes();
    const res = await mod.registrarOperacaoVoz('r4', 'widget', payload);
    check(F, 'sucesso confirma', res.status, 'committed');
    check(F, 'sucesso nao deixa chave', store.mapa.size, 0);
  }

  {
    const { mod, store } = montarOperacoes({ erroRpc: { code: 'PGRST202', message: 'x' } });
    store.mapa.set('grana:voz:operacao:u1:r5', JSON.stringify({ requestId: 'r5', source: 'widget', payload }));
    const resumo = await mod.sincronizarOperacoesVoz();
    check(F, 'sync conta a falha', resumo.falhas, 1);
    check(F, 'sync explica que nao se resolve sozinho', /suporte/.test(resumo.mensagem || ''), true);
    check(F, 'sync nao descarta a operacao', store.mapa.size, 1);
  }
}

/* =====================================================================
 * PARTE B - lib/widget-voz-task.ts: estado final, recibo e arquivo.
 * ===================================================================== */
function montarWidget(opts) {
  const o = opts || {};
  const reg = { estados: [], notificacoes: [], apagados: [], fila: [], removidos: [], pendenteNotificado: 0 };
  let task;
  carregar('lib/widget-voz-task.ts', {
    'react-native': { Platform: { OS: 'android' }, AppRegistry: { registerHeadlessTask: (_n, f) => { task = f(); } } },
    './offline-cache': { isLikelyNetworkError: (e) => /network|rede/i.test(String((e && e.message) || e)) },
    '@/modules/grana-voice-widget': { definirEstado: (e) => reg.estados.push(e) },
    './voz': { transcreverAudio: o.transcrever || (async () => ({ ok: true, transcript: 'mercado 32,50 no pix' })) },
    './heuristics': heuristics,
    './voz-confiabilidade': { precisaRevisarValorVoz },
    './data': { fetchCategories: async () => [], fetchCreditCards: async () => (o.cartoes || []) },
    './wallets': { fetchWallets: async () => (o.carteiras || [{ id: 'w1', name: 'Pessoal', is_default: true }]) },
    './voice-operations': { registrarOperacaoVoz: o.registrar || (async () => ({ status: 'committed', ids: ['t1'], operationId: 'op1' })) },
    './widget-voz-notificacoes': {
      podeNotificar: async () => o.podeNotificar !== false,
      notificarRevisao: async (t) => reg.notificacoes.push(['revisao', t]),
      notificarSucesso: async () => reg.notificacoes.push(['sucesso']),
      notificarFalha: async (c) => reg.notificacoes.push(['falha', c]),
      notificarSalvoLocal: async () => reg.notificacoes.push(['salvo-local']),
      notificarPendenteOffline: async () => {
        reg.pendenteNotificado++;
        if (o.notificacaoQuebrada) throw new Error('canal indisponivel');
      },
    },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: o.semSessao ? null : { user: { id: o.userId || 'u1' } } } }),
      getUser: async () => ({ data: { user: null } }),
    } } },
    './widgets-home-sync': { sincronizarWidgetsHome: async () => {} },
    '@react-native-async-storage/async-storage': { __esModule: true, default: memoriaLocal() },
    './widget-voz-pendentes': {
      adicionarVozPendente: async (item) => reg.fila.push(item),
      removerVozPendente: async (id) => reg.removidos.push(id),
      listarVozesPendentes: async () => (o.pendentes || []),
    },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    'expo-file-system/legacy': { deleteAsync: async (uri) => reg.apagados.push(uri) },
  });
  return { task, reg };
}

async function parteB() {
  const F = 'B. widget: estado, recibo e arquivo';

  {
    const { task, reg } = montarWidget();
    await task({ caminho: '/cache/a.m4a', requestId: 'w1', source: 'widget' });
    check(F, 'sucesso grava e volta ao repouso', reg.estados, ['ocioso']);
    check(F, 'sucesso deixa recibo', reg.notificacoes.map((n) => n[0]), ['sucesso']);
    check(F, 'sucesso apaga o audio', reg.apagados.length, 1);
  }

  {
    const { task, reg } = montarWidget({ registrar: async () => ({ status: 'pending', ids: [], operationId: 'op1' }) });
    await task({ caminho: '/cache/b.m4a', requestId: 'w2', source: 'widget' });
    check(F, 'pendente avisa que ficou no aparelho', reg.notificacoes.map((n) => n[0]), ['salvo-local']);
    /* Apagar o audio aqui esta CERTO: `registrarOperacaoVoz` ja gravou o
       payload estruturado no aparelho antes de tentar a rede, entao a fala
       bruta nao e mais necessaria para concluir o lancamento. */
    check(F, 'pendente apaga o audio porque o payload ja esta salvo', reg.apagados.length, 1);
    check(F, 'pendente volta ao repouso, nao acende atencao', reg.estados, ['ocioso']);
  }

  {
    const { task, reg } = montarWidget({ podeNotificar: false });
    await task({ caminho: '/cache/c.m4a', requestId: 'w3', source: 'widget' });
    check(F, 'sem permissao acende atencao', reg.estados, ['atencao']);
    /* QUESTAO DE DESENHO, nao defeito claro: o codigo so protege audio ja
       preservado. Uma gravacao nova feita sem permissao de notificacao e
       descartada, e quem falou precisa repetir depois de liberar a permissao. */
    check(F, 'gravacao nova sem permissao deveria sobreviver', reg.apagados.length, 0);
  }

  {
    const { task, reg } = montarWidget({ podeNotificar: false });
    await task({ caminho: '/docs/voz-pendente/w4.m4a', requestId: 'w4', source: 'widget' });
    check(F, 'fila nao e apagada por falta de permissao', reg.apagados.length, 0);
    check(F, 'fila nao perde o item', reg.removidos.length, 0);
  }

  {
    const { task, reg } = montarWidget({ transcrever: async () => ({ ok: false, codigo: 'sem_rede' }) });
    await task({ caminho: '/cache/e.m4a', requestId: 'w5', source: 'widget' });
    check(F, 'sem rede enfileira', reg.fila.length, 1);
    check(F, 'sem rede preserva o requestId', reg.fila[0] && reg.fila[0].requestId, 'w5');
    check(F, 'sem rede preserva o arquivo', reg.apagados.length, 0);
    check(F, 'sem rede avisa quem falou', reg.pendenteNotificado, 1);
    check(F, 'sem rede acende atencao', reg.estados, ['atencao']);
  }

  {
    const { task, reg } = montarWidget({ transcrever: async () => ({ ok: false, codigo: 'sem_rede' }), notificacaoQuebrada: true });
    await task({ caminho: '/cache/f.m4a', requestId: 'w6', source: 'widget' });
    check(F, 'fila sobrevive a notificacao quebrada', reg.fila.length, 1);
    check(F, 'arquivo sobrevive a notificacao quebrada', reg.apagados.length, 0);
  }

  {
    const { task, reg } = montarWidget({ transcrever: async () => ({ ok: false, codigo: 'sem_rede' }), semSessao: true });
    await task({ caminho: '/cache/g.m4a', requestId: 'w7', source: 'widget' });
    check(F, 'sem sessao nao enfileira', reg.fila.length, 0);
    check(F, 'sem sessao descarta sem atribuir a outra conta', reg.apagados.length, 1);
    check(F, 'sem sessao explica descarte', reg.notificacoes, [['falha', 'sem_sessao']]);
    check(F, 'sem sessao acende atencao', reg.estados, ['atencao']);
  }

  {
    const { task, reg } = montarWidget();
    await task({ caminho: '/docs/voz-pendente/h.m4a', requestId: 'w8', source: 'app', transcricao: 'mercado 32,50 no pix' });
    check(F, 'app aplica mesma decisao do widget', reg.notificacoes.map((n) => n[0]), ['sucesso']);
    check(F, 'app nao altera estado da outra superficie', reg.estados, []);
  }

  {
    const { task, reg } = montarWidget({ transcrever: async () => ({ ok: false, codigo: 'demorou' }) });
    await task({ caminho: '/cache/i.m4a', requestId: 'w9', source: 'widget' });
    check(F, 'demorou enfileira para tentar de novo', reg.fila.length, 1);
    check(F, 'demorou preserva o arquivo', reg.apagados.length, 0);
  }

  {
    const { task, reg } = montarWidget({ transcrever: async () => ({ ok: false, codigo: 'sem_provedor' }) });
    await task({ caminho: '/cache/j.m4a', requestId: 'w10', source: 'widget' });
    check(F, 'sem provedor avisa', reg.notificacoes.map((n) => n[0]), ['falha']);
    check(F, 'sem provedor nao enfileira', reg.fila.length, 0);
    check(F, 'sem provedor acende atencao', reg.estados, ['atencao']);
  }

  {
    const { task, reg } = montarWidget();
    await task({ caminho: '/cache/k.m4a', source: 'widget' });
    check(F, 'sem requestId nao grava', reg.notificacoes.filter((n) => n[0] === 'sucesso').length, 0);
    check(F, 'sem requestId acende atencao', reg.estados, ['atencao']);
  }
}

/* =====================================================================
 * PARTE C - lib/widget-voz-pendentes.ts: a fila em si.
 * ===================================================================== */
async function parteC() {
  const F = 'C. fila de voz pendente';
  const store = memoriaLocal();
  const copiados = [], apagados = [];
  const mod = carregar('lib/widget-voz-pendentes.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: store },
    'expo-file-system/legacy': {
      documentDirectory: 'file:///docs/',
      makeDirectoryAsync: async () => {},
      copyAsync: async (args) => copiados.push(args),
      deleteAsync: async (uri) => apagados.push(uri),
    },
  });

  await mod.adicionarVozPendente({ caminho: '/cache/x.m4a', requestId: 'q1', userId: 'u1', source: 'widget' });
  check(F, 'grava o item', (await mod.listarVozesPendentes()).length, 1);
  check(F, 'copia o audio para area propria', /voz-pendente\/q1\.m4a$/.test((copiados[0] && copiados[0].to) || ''), true);
  check(F, 'guarda o caminho novo', (await mod.listarVozesPendentes())[0].caminho, 'file:///docs/voz-pendente/q1.m4a');

  await mod.adicionarVozPendente({ caminho: '/cache/x.m4a', requestId: 'q1', userId: 'u1', source: 'widget' });
  check(F, 'mesmo requestId nao duplica', (await mod.listarVozesPendentes()).length, 1);
  check(F, 'mesmo requestId nao recopia o arquivo', copiados.length, 1);

  await mod.adicionarVozPendente({ caminho: '/cache/y.m4a', requestId: 'q2', userId: 'u2', source: 'widget' });
  check(F, 'aceita item de outra conta', (await mod.listarVozesPendentes()).length, 2);

  await mod.removerVozPendente('q1');
  check(F, 'remove pelo requestId', (await mod.listarVozesPendentes()).map((i) => i.requestId), ['q2']);

  store.mapa.set('grana:queue:widget-voz-pendente-v1', '{"nao":"e-uma-lista"}');
  check(F, 'armazenamento corrompido devolve fila vazia', (await mod.listarVozesPendentes()).length, 0);

  store.mapa.set('grana:queue:widget-voz-pendente-v1', JSON.stringify([
    { caminho: 'file:///docs/voz-pendente/velho.m4a', requestId: 'velho', userId: 'u9',
      criadoEm: Date.now() - 90 * 24 * 3600 * 1000 },
  ]));
  await mod.limparVozesDaConta('u9');
  check(F, 'logout remove audio antigo da conta', (await mod.listarVozesPendentes()).length, 0);
  check(F, 'logout remove arquivo financeiro', apagados, ['file:///docs/voz-pendente/velho.m4a']);
}

/* =====================================================================
 * PARTE D - lib/voz.ts: prazo, retentativa e erros de sessao.
 * ===================================================================== */
function montarVoz(opts) {
  const o = opts || {};
  const reg = { envios: 0, locais: 0 };
  let relogio = 1000000;
  const mod = carregar('lib/voz.ts', {
    './voz-local': {
      /* O modulo real exporta o teto padrao, e `transcreverAudio` usa esse
         valor para caber no orcamento de quem chamou. Um duble sem ele fazia
         o passo local ser pulado calado, e o teste media outra coisa. */
      PRAZO_LOCAL_PADRAO_MS: 30000,
      transcreverNoAparelho: async (_uri, prazoMs) => {
        reg.locais++; reg.prazoLocal = prazoMs; relogio += o.msLocal || 0; return o.textoLocal || null;
      },
    },
    'react-native': { Platform: { OS: 'android' } },
    'expo-file-system': { File: class {
      get exists() { return o.arquivoExiste !== false; }
      get size() { return o.tamanho === undefined ? 4 : o.tamanho; }
      async bytes() { return new Uint8Array([1, 2, 3, 4]); }
    } },
    './supabase': { supabase: { auth: { getSession: async () => ({
      data: { session: o.semSessao ? null : { access_token: 'tok' } },
    }) } } },
    'expo/fetch': { fetch: async (_url, init) => {
      reg.envios++;
      relogio += o.msEnvio || 0;
      if (o.erroEnvio) throw o.erroEnvio;
      if (o.pendurar) {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('Abortado');
            e.name = 'AbortError';
            reject(e);
          }, { once: true });
        });
      }
      return o.resposta ? o.resposta(reg.envios) : {
        ok: true, status: 200, json: async () => ({ status: 'ready', transcript: 'mercado 32,50 no pix' }),
      };
    } },
  }, {
    FormData: class { append() {} },
    process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://exemplo.invalido' } },
    Date: { now: () => relogio },
    setTimeout: o.rapido ? ((fn) => setTimeout(fn, 1)) : setTimeout,
  });
  return { mod, reg, agora: () => relogio };
}

async function parteD() {
  const F = 'D. cliente de transcricao';

  {
    const { mod, reg } = montarVoz({ textoLocal: 'mercado 32,50 no pix' });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'local resolve', r.ok && r.transcript, 'mercado 32,50 no pix');
    check(F, 'local resolvendo nao gasta a nuvem', reg.envios, 0);
  }

  {
    const { mod, reg } = montarVoz({ semSessao: true });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'sem sessao devolve codigo proprio', r.ok === false && r.codigo, 'sem_sessao');
    check(F, 'sem sessao nao gasta upload', reg.envios, 0);
  }

  {
    const { mod, reg } = montarVoz({ resposta: () => ({ ok: true, status: 200, json: async () => null }) });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'corpo ilegivel acaba em erro interno', r.ok === false && r.codigo, 'erro_interno');
    check(F, 'corpo ilegivel tenta exatamente duas vezes', reg.envios, 2);
  }

  {
    const { mod, reg } = montarVoz({ resposta: (n) => n === 1
      ? { ok: true, status: 200, json: async () => null }
      : { ok: true, status: 200, json: async () => ({ status: 'ready', transcript: 'padaria 12' }) } });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'segunda tentativa aproveita', r.ok && r.transcript, 'padaria 12');
    check(F, 'segunda tentativa nao tenta uma terceira', reg.envios, 2);
  }

  {
    const { mod } = montarVoz({ resposta: () => ({ ok: false, status: 401, json: async () => null }) });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, '401 vira sessao expirada', r.ok === false && r.codigo, 'nao_autenticado');
  }

  {
    const { mod } = montarVoz({ erroEnvio: Object.assign(new Error('Network request failed'), { name: 'TypeError' }) });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'falha de rede vira sem_rede', r.ok === false && r.codigo, 'sem_rede');
  }

  {
    const { mod } = montarVoz({ erroEnvio: new Error('quebrou ao serializar') });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'falha local nao mente dizendo sem rede', r.ok === false && r.codigo, 'erro_interno');
  }

  {
    const { mod } = montarVoz({ resposta: () => ({ ok: false, status: 429, json: async () => ({ code: 'muitas_tentativas' }) }) });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'codigo da funcao chega intacto', r.ok === false && r.codigo, 'muitas_tentativas');
  }

  {
    const { mod } = montarVoz({ resposta: () => ({ ok: true, status: 200, json: async () => ({ status: 'ready', transcript: '   ' }) }) });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'transcricao vazia nao vira sucesso', r.ok === false && r.codigo, 'nao_entendi');
  }

  {
    // Reconhecimento local gasta 30s e a rede PENDURA. Quem corta e o
    // AbortController do proprio modulo; o relogio falso e o setTimeout
    // encurtado fazem os 30s restantes passarem em milissegundos.
    const { mod, reg } = montarVoz({ msLocal: 30000, pendurar: true, rapido: true });
    const r = await mod.transcreverAudio('file:///a.m4a');
    check(F, 'rede pendurada vira demorou, nao trava', r.ok === false && r.codigo, 'demorou');
    check(F, 'rede pendurada nao tenta de novo sem prazo', reg.envios, 1);
  }

  {
    const { mod, reg } = montarVoz({ tamanho: 0 });
    const r = await mod.transcreverAudio('file:///a.m4a', { tamanhoBytes: 0 });
    check(F, 'arquivo vazio avisa', r.ok === false && r.codigo, 'audio_ausente');
    check(F, 'arquivo vazio nao gasta upload', reg.envios, 0);
  }

  {
    const grande = 3 * 1024 * 1024;
    const { mod, reg } = montarVoz({ tamanho: grande });
    const r = await mod.transcreverAudio('file:///a.m4a', { tamanhoBytes: grande });
    check(F, 'arquivo grande avisa', r.ok === false && r.codigo, 'audio_grande');
    check(F, 'arquivo grande nao gasta upload', reg.envios, 0);
  }

  {
    const { mod } = montarVoz();
    const codigos = ['nao_autenticado', 'sem_sessao', 'audio_ausente', 'audio_grande', 'formato_invalido',
      'muitas_tentativas', 'sem_provedor', 'nao_entendi', 'erro_interno', 'sem_rede', 'demorou'];
    for (const c of codigos) {
      const m = mod.mensagemDeErroVoz(c);
      check(F, 'mensagem de ' + c + ' tem titulo', typeof m.titulo === 'string' && m.titulo.length > 0, true);
      check(F, 'mensagem de ' + c + ' nao vaza jargao', /erro_|_invalido|undefined/.test(m.texto), false);
    }
  }
}

module.exports = { carregar, montarWidget, montarOperacoes, memoriaLocal, heuristics, montarVoz };
if (require.main === module) (async () => {
  await parteA();
  await parteB();
  await parteC();
  await parteD();

  const porFamilia = new Map();
  for (const f of falhas) {
    const e = porFamilia.get(f.familia) || [];
    e.push(f);
    porFamilia.set(f.familia, e);
  }
  console.log('\nBateria 6 - ' + total + ' assercoes, ' + (total - falhas.length) + ' aprovadas, ' + falhas.length + ' reprovadas\n');
  for (const [familia, itens] of porFamilia) {
    console.log('  ' + familia + ' - ' + itens.length + ' reprovacoes');
    for (const i of itens.slice(0, 8)) {
      console.log('    - ' + i.caso);
      console.log('        obtido:   ' + JSON.stringify(i.obtido));
      console.log('        esperado: ' + JSON.stringify(i.esperado));
    }
  }
  if (!falhas.length) console.log('  nenhuma reprovacao');
  if (falhas.length) process.exitCode = 1;
  console.log('');
})();
