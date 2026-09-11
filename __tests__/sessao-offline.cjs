/*
 * Sessão sem internet: o app não pode se comportar como se nunca tivesse
 * havido login só porque o token de acesso venceu longe de uma rede.
 *
 * Em 11/09/2026 o autor abriu o app num lugar sem sinal e caiu na tela de
 * entrada. A causa não era a sessão ter sumido — ela estava inteira no
 * aparelho. É que `supabase.auth.getSession()` NÃO é leitura de disco: com o
 * token vencido ele tenta renovar antes de responder, e sem rede a renovação
 * falha e a resposta vira `session: null`, indistinguível de "nunca logou".
 * Todo lugar que perguntava "quem é o usuário" por ali passava a agir como se
 * o aparelho estivesse deslogado — inclusive a fila de voz, que RECUSAVA
 * guardar a fala gravada, que é o único trabalho que ela tem sem rede.
 *
 * Testa os MÓDULOS REAIS (`lib/sessao-offline.ts` e `lib/voice-operations.ts`)
 * transpilados em memória, com dublês para armazenamento e rede. Uma
 * reimplementação da regra passaria mesmo com a produção quebrada.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };

function compilar(caminho) {
  return ts.transpileModule(fs.readFileSync(caminho, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
}

/* ── Gaveta da sessão: o mesmo LargeSecureStore, só que em memória ──────── */
const disco = new Map();
const armazenamentoSessao = {
  getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
  setItem: async (k, v) => void disco.set(k, v),
  removeItem: async (k) => void disco.delete(k),
};

const URL_PROJETO = 'https://cjnuzfbvfuauvlzfoutv.supabase.co';
const CHAVE_SESSAO = `sb-${URL_PROJETO.replace(/^https?:\/\//, '').split('.')[0]}-auth-token`;

/* A chave é a mesma que o `supabase-js` montaria sozinho se ninguém passasse
   `storageKey`. Se um dia divergir, toda instalação existente perde a sessão
   na atualização — e o sintoma seria "o app deslogou todo mundo", sem pista. */
igual(
  CHAVE_SESSAO,
  `sb-${new URL(URL_PROJETO).hostname.split('.')[0]}-auth-token`,
  'a chave da sessão é idêntica ao padrão do supabase-js'
);

/* ── Dublê do cliente Supabase ─────────────────────────────────────────── */
let respostaGetSession = { data: { session: null }, error: null };
let chamadasRpc = [];
let respostaRpc = () => { throw Object.assign(new Error('Network request failed'), { code: '' }); };
const supabaseDuble = {
  auth: { getSession: async () => respostaGetSession },
  /* O módulo real chama `supabase.rpc(...).abortSignal(sinal)`, então o dublê
     precisa devolver um encadeável, não uma promessa crua. Sem isto a chamada
     estourava com `abortSignal is not a function`, o `catch` do módulo
     traduzia aquilo em "pendente", e o teste passaria verde pelo motivo
     errado — foi o que aconteceu na primeira versão deste arquivo. */
  rpc: (nome, args) => {
    chamadasRpc.push(nome);
    const p = Promise.resolve().then(() => respostaRpc(nome, args));
    p.abortSignal = () => p;
    return p;
  },
};

const avisos = [];
const consoleDuble = {
  ...console,
  warn: (...a) => avisos.push(a.map(String).join(' ')),
  error: (...a) => avisos.push(a.map(String).join(' ')),
};

const sessaoOffline = {};
vm.runInNewContext(compilar('lib/sessao-offline.ts'), {
  exports: sessaoOffline,
  console: consoleDuble,
  JSON, Date, String, Object, Error, Promise,
  require: (nome) => {
    if (nome === './supabase') {
      return { armazenamentoSessao, CHAVE_SESSAO, supabase: supabaseDuble, __esModule: true };
    }
    throw new Error(`import inesperado em sessao-offline: ${nome}`);
  },
});

/* ── Fila de voz: o módulo real, com o sessao-offline real por baixo ────── */
const loja = new Map();
const AsyncStorageDuble = {
  getItem: async (k) => (loja.has(k) ? loja.get(k) : null),
  setItem: async (k, v) => void loja.set(k, v),
  removeItem: async (k) => void loja.delete(k),
  getAllKeys: async () => [...loja.keys()],
  multiGet: async (ks) => ks.map((k) => [k, loja.get(k) ?? null]),
};

const voiceOps = {};
vm.runInNewContext(compilar('lib/voice-operations.ts'), {
  exports: voiceOps,
  console: consoleDuble,
  JSON, Date, String, Object, Error, Promise, RegExp, Array, Math, Number,
  AbortController, setTimeout, clearTimeout,
  require: (nome) => {
    if (nome === './supabase') return { supabase: supabaseDuble, __esModule: true };
    if (nome === './sessao-offline') return { ...sessaoOffline, __esModule: true };
    if (nome === './widgets-home-events') {
      return { notificarDadosDosWidgetsAlterados: () => {}, __esModule: true };
    }
    if (nome === '@react-native-async-storage/async-storage') {
      return { ...AsyncStorageDuble, default: AsyncStorageDuble, __esModule: true };
    }
    throw new Error(`import inesperado em voice-operations: ${nome}`);
  },
});

const UID = 'u-111';
const sessaoValida = {
  access_token: 'jwt-valido',
  refresh_token: 'refresh-1',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: UID },
};
const sessaoExpirada = {
  ...sessaoValida,
  access_token: 'jwt-vencido',
  expires_at: Math.floor(Date.now() / 1000) - 60,
};

const gravarNoDisco = (s) => disco.set(CHAVE_SESSAO, JSON.stringify(s));

(async () => {
  // ── lerSessaoDoDisco ──────────────────────────────────────────────────
  disco.clear();
  igual(await sessaoOffline.lerSessaoDoDisco(), null, 'aparelho sem login não inventa sessão');

  gravarNoDisco(sessaoExpirada);
  const lida = await sessaoOffline.lerSessaoDoDisco();
  ok(lida && lida.user.id === UID, 'sessão vencida ainda é devolvida — é ela que identifica a conta');

  // Registro pela metade é pior que nenhum: viraria sessão fantasma.
  for (const [nome, ruim] of [
    ['sem refresh_token', { ...sessaoExpirada, refresh_token: undefined }],
    ['sem user', { ...sessaoExpirada, user: undefined }],
    ['sem id de usuário', { ...sessaoExpirada, user: {} }],
    ['sem access_token', { ...sessaoExpirada, access_token: undefined }],
  ]) {
    disco.set(CHAVE_SESSAO, JSON.stringify(ruim));
    igual(await sessaoOffline.lerSessaoDoDisco(), null, `registro ${nome} é recusado`);
  }

  // Gaveta ilegível não pode explodir, mas também não pode passar em silêncio.
  avisos.length = 0;
  disco.set(CHAVE_SESSAO, '{ isto nao e json');
  igual(await sessaoOffline.lerSessaoDoDisco(), null, 'JSON corrompido vira ausência de sessão');
  ok(avisos.some((a) => a.includes('[sessao]')), 'gaveta ilegível deixa recibo no log');

  // ── sessaoVencida ─────────────────────────────────────────────────────
  const agora = Date.now();
  igual(sessaoOffline.sessaoVencida(null, agora), false, 'sem sessão não é sessão vencida');
  igual(sessaoOffline.sessaoVencida(sessaoValida, agora), false, 'token dentro do prazo não está vencido');
  igual(sessaoOffline.sessaoVencida(sessaoExpirada, agora), true, 'token fora do prazo está vencido');

  // ── idDoUsuarioLocal: cliente primeiro, disco como queda ──────────────
  gravarNoDisco(sessaoExpirada);
  respostaGetSession = { data: { session: null }, error: new Error('Network request failed') };
  igual(await sessaoOffline.idDoUsuarioLocal(), UID, 'sem rede, o dono do aparelho vem do disco');

  respostaGetSession = { data: { session: { ...sessaoValida, user: { id: 'u-999' } } }, error: null };
  igual(await sessaoOffline.idDoUsuarioLocal(), 'u-999', 'com rede, vale a resposta do cliente, não o disco');

  // Cliente que LANÇA (não só devolve vazio) também cai para o disco.
  const getSessionOriginal = supabaseDuble.auth.getSession;
  supabaseDuble.auth.getSession = async () => { throw new Error('cliente indisponível'); };
  igual(await sessaoOffline.idDoUsuarioLocal(), UID, 'exceção no cliente não derruba a identificação local');
  supabaseDuble.auth.getSession = getSessionOriginal;

  disco.clear();
  respostaGetSession = { data: { session: null }, error: null };
  igual(await sessaoOffline.idDoUsuarioLocal(), null, 'sem cliente e sem disco, não há dono');

  // ── tokenDeAcessoLocal: entrega o token VENCIDO de propósito ──────────
  gravarNoDisco(sessaoExpirada);
  igual(
    await sessaoOffline.tokenDeAcessoLocal(),
    'jwt-vencido',
    'sem rede, devolve o token vencido para a tentativa acontecer e falhar como sem_rede'
  );
  respostaGetSession = { data: { session: sessaoValida }, error: null };
  igual(await sessaoOffline.tokenDeAcessoLocal(), 'jwt-valido', 'com rede, prefere o token renovado');

  // ── esquecerSessaoDoDisco ─────────────────────────────────────────────
  /* Sem isto, sair da conta sem internet não apagaria nada: o `signOut` do
     auth-js consulta `getSession()` por dentro, recebe o erro da renovação e
     volta sem tocar no disco — e a próxima abertura traria a pessoa de volta. */
  gravarNoDisco(sessaoExpirada);
  await sessaoOffline.esquecerSessaoDoDisco();
  igual(disco.has(CHAVE_SESSAO), false, 'sair da conta apaga o registro do aparelho');

  // ── O caso que motivou tudo: gravar a fala sem rede ───────────────────
  loja.clear();
  disco.clear();
  gravarNoDisco(sessaoExpirada);
  respostaGetSession = { data: { session: null }, error: new Error('Network request failed') };
  chamadasRpc = [];
  respostaRpc = () => { throw Object.assign(new Error('Network request failed'), { code: '' }); };

  const payload = {
    kind: 'transaction',
    description: 'Padaria',
    amount: 18.99,
    category: 'Alimentação',
    color: '#fff',
    wallet_id: 'w-1',
    occurred_on: '2026-09-11',
    type: 'expense',
  };
  const resultado = await voiceOps.registrarOperacaoVoz('req-1', 'widget', payload);

  igual(resultado.status, 'pending', 'sem rede, a fala fica pendente em vez de dar erro');
  const chave = `grana:voz:operacao:${UID}:req-1`;
  ok(loja.has(chave), 'a fala foi GRAVADA no aparelho, sob a conta certa');
  igual(JSON.parse(loja.get(chave)).payload.description, 'Padaria', 'o payload guardado é o original');
  igual(chamadasRpc.length, 1, 'tentou enviar uma vez antes de enfileirar — não desistiu sem tentar');

  // A fila lista o que está pendente, mesmo com o token vencido.
  const pendentes = await voiceOps.listarOperacoesVozLocais();
  igual(pendentes.length, 1, 'a fila pendente continua visível sem rede');

  // ── E a rede volta: a mesma fila sobe sozinha ─────────────────────────
  respostaGetSession = { data: { session: sessaoValida }, error: null };
  respostaRpc = () => ({
    data: { status: 'committed', operation_id: 'op-1', kind: 'transaction', ids: ['t-1'], replayed: false },
    error: null,
  });
  const resumo = await voiceOps.sincronizarOperacoesVoz();
  igual(resumo.sincronizadas, 1, 'com a rede de volta, a fala guardada é enviada');
  igual(loja.has(chave), false, 'e sai da fila depois de confirmada');

  // ── Trocar de conta não pode herdar a fila da anterior ────────────────
  loja.clear();
  disco.clear();
  gravarNoDisco(sessaoExpirada);
  respostaGetSession = { data: { session: null }, error: new Error('Network request failed') };
  respostaRpc = () => { throw Object.assign(new Error('Network request failed'), { code: '' }); };
  await voiceOps.registrarOperacaoVoz('req-2', 'app', payload);
  ok(loja.has(`grana:voz:operacao:${UID}:req-2`), 'fala guardada na conta de origem');

  gravarNoDisco({ ...sessaoExpirada, user: { id: 'outra-conta' } });
  const pendentesDeOutra = await voiceOps.listarOperacoesVozLocais();
  igual(pendentesDeOutra.length, 0, 'a conta seguinte do aparelho não enxerga a fila da anterior');

  console.log(`sessao-offline: ${passou} verificacoes OK`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
