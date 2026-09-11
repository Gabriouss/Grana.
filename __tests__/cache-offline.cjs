/* Cache de leitura offline — o que o app mostra quando não há rede.
 *
 * O caso que originou isto (10/09/2026): o autor pediu que o app funcionasse
 * sem internet. A auditoria mostrou que só a tela de Lançamentos sobrevivia;
 * Início, Crédito, Boletos, Gráficos e Desafios caíam num `catch` que fazia
 * `setError(...)` e desenhava uma linha de texto sobre nada.
 *
 * O que este corpus protege é menos o cache e mais os seus LIMITES, porque um
 * cache generoso demais num app de dinheiro é pior que nenhum:
 *
 *  - erro que NÃO é de rede continua estourando (a regra 9 do AGENTS.md nasceu
 *    de um `catch` que virou estado benigno e escondeu uma feature quebrada);
 *  - conta diferente no mesmo aparelho nunca vê o dado da anterior;
 *  - sem nada guardado, o erro sobe — lista vazia diria "você não tem
 *    lançamento nenhum", que é mentira;
 *  - o aviso de "dado velho" liga junto com o dado velho.
 *
 * Carregado pela receita da casa (ts.transpileModule + vm), porque o módulo
 * importa AsyncStorage e o cliente Supabase.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

let total = 0;
let falhas = 0;
function checar(nome, condicao, detalhe = '') {
  total++;
  if (condicao) return;
  falhas++;
  console.error('FALHOU  ' + nome + (detalhe ? ' — ' + detalhe : ''));
}

/** Monta o módulo com um disco e uma sessão falsos, controláveis pelo teste. */
function montar(usuarioInicial) {
  const disco = new Map();
  let usuario = usuarioInicial;

  const AsyncStorage = {
    async getItem(k) { return disco.has(k) ? disco.get(k) : null; },
    async setItem(k, v) { disco.set(k, v); },
    async removeItem(k) { disco.delete(k); },
    async getAllKeys() { return [...disco.keys()]; },
    async multiRemove(ks) { ks.forEach((k) => disco.delete(k)); },
  };
  const supabase = {
    auth: { async getSession() { return { data: { session: usuario ? { user: { id: usuario } } : null } }; } },
  };

  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('lib/cache-de-tela.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      console,
      Date,
      JSON,
      Set,
      String,
      Promise,
      /* O prazo que serve o disco quando a rede pendura (ver
         `PRAZO_ATE_SERVIR_DO_CACHE_MS`) usa temporizador. Encurtado mil vezes
         aqui para os quatro segundos de produção passarem em quatro
         milissegundos, sem mexer na constante. */
      setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, Math.ceil((ms || 0) / 1000))),
      clearTimeout,
      require: (id) => {
        /* `__esModule: true` é obrigatório: sem ele o helper `__importDefault`
           do TypeScript embrulha o objeto MAIS UMA VEZ, `AsyncStorage.setItem`
           vira undefined, e o erro morre no catch best-effort do módulo — o
           cache simplesmente não gravava e nada dizia por quê. */
        if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: AsyncStorage };
        if (id === './supabase') return { supabase };
        /* Desde 11/09/2026 o módulo pergunta quem é o dono do cache pelo
           APARELHO, não pela rede. `getSession()` tenta renovar o token antes
           de responder e devolve vazio quando a renovação não tem rede — num
           módulo cujo propósito é servir offline, isso deixava o cache de
           todas as telas ilegível justamente por falta de internet. */
        if (id === './sessao-offline') return { idDoUsuarioLocal: async () => usuario ?? null };
        throw Error(id);
      },
    }
  );
  return { api: exports, disco, trocarUsuario: (id) => { usuario = id; } };
}

const erroDeRede = () => Object.assign(new Error('Network request failed'), { name: 'TypeError' });
const erroPermanente = () => Object.assign(new Error('function public.x does not exist'), { code: 'PGRST202' });

(async () => {
  /* ── Caminho feliz: grava o que trouxe ─────────────────────────────────── */
  {
    const { api, disco } = montar('u1');
    const buscar = async () => [{ id: 'a' }];
    const envolvido = api.comCacheOffline('metas', buscar);
    const r = await envolvido();
    checar('devolve o dado fresco', JSON.stringify(r) === JSON.stringify([{ id: 'a' }]));
    checar('gravou no disco', [...disco.keys()].some((k) => k.includes('metas')));
    checar('não está em modo offline', api.estaServindoDoCache() === false);
  }

  /* ── Falha de REDE cai para o guardado ─────────────────────────────────── */
  {
    const { api } = montar('u1');
    let falhar = false;
    const envolvido = api.comCacheOffline('metas', async () => {
      if (falhar) throw erroDeRede();
      return [{ id: 'a' }];
    });
    await envolvido();
    falhar = true;
    const r = await envolvido();
    checar('rede caída devolve o guardado', JSON.stringify(r) === JSON.stringify([{ id: 'a' }]));
    checar('liga o aviso de dado velho', api.estaServindoDoCache() === true);
  }

  /* ── Falha PERMANENTE nunca é mascarada ────────────────────────────────── */
  {
    const { api } = montar('u1');
    let permanente = false;
    const envolvido = api.comCacheOffline('metas', async () => {
      if (permanente) throw erroPermanente();
      return [{ id: 'a' }];
    });
    await envolvido();
    permanente = true;
    let estourou = false;
    try { await envolvido(); } catch (e) { estourou = e.code === 'PGRST202'; }
    checar('erro permanente continua estourando', estourou,
      'dado velho no lugar de erro permanente é a regra 9 quebrada de novo');
  }

  /* ── Sem nada guardado, o erro de rede sobe ────────────────────────────── */
  {
    const { api } = montar('u1');
    const envolvido = api.comCacheOffline('metas', async () => { throw erroDeRede(); });
    let estourou = false;
    try { await envolvido(); } catch { estourou = true; }
    checar('sem cache, o erro de rede sobe', estourou,
      'devolver lista vazia diria que a pessoa não tem lançamento nenhum');
  }

  /* ── Conta diferente não herda o dinheiro da anterior ──────────────────── */
  {
    const { api, trocarUsuario } = montar('u1');
    let falhar = false;
    const envolvido = api.comCacheOffline('metas', async () => {
      if (falhar) throw erroDeRede();
      return [{ id: 'da-conta-1' }];
    });
    await envolvido();
    trocarUsuario('u2');
    falhar = true;
    let estourou = false;
    try { await envolvido(); } catch { estourou = true; }
    checar('outra conta não lê o cache da primeira', estourou);
    const guardado = await api.lerTela('metas');
    checar('lerTela recusa registro de outro usuário', guardado === null);
  }

  /* ── Cache por ARGUMENTO ───────────────────────────────────────────────── */
  {
    const { api } = montar('u1');
    let falhar = false;
    const envolvido = api.comCacheOffline(
      'credito-mes',
      async (ano, mes) => { if (falhar) throw erroDeRede(); return [`${ano}-${mes}`]; },
      (ano, mes) => `${ano}-${mes}`
    );
    await envolvido(2026, 3);
    await envolvido(2026, 4);
    falhar = true;
    checar('março volta março', (await envolvido(2026, 3))[0] === '2026-3');
    checar('abril volta abril', (await envolvido(2026, 4))[0] === '2026-4',
      'sem chave por argumento, abril serviria a fatura de março');
  }

  /* ── Sair da conta apaga tudo ──────────────────────────────────────────── */
  {
    const { api, disco } = montar('u1');
    await api.comCacheOffline('metas', async () => [{ id: 'a' }])();
    await api.comCacheOffline('boletos', async () => [{ id: 'b' }])();
    checar('gravou os dois', [...disco.keys()].length >= 2);
    await api.esquecerTelas();
    checar('esquecerTelas limpa o disco', [...disco.keys()].filter((k) => k.includes(':tela:')).length === 0);
  }

  /* ── O aviso avisa ─────────────────────────────────────────────────────── */
  {
    const { api } = montar('u1');
    const vistos = [];
    const cancelar = api.assinarModoOffline((v) => vistos.push(v));
    let falhar = false;
    const envolvido = api.comCacheOffline('metas', async () => {
      if (falhar) throw erroDeRede();
      return [{ id: 'a' }];
    });
    await envolvido();
    falhar = true;
    await envolvido();
    falhar = false;
    await envolvido();
    cancelar();
    checar('assinante recebe entrada e saída do modo offline',
      JSON.stringify(vistos) === JSON.stringify([true, false]), JSON.stringify(vistos));
  }

  /* ── isLikelyNetworkError ──────────────────────────────────────────────── */
  {
    const { api } = montar('u1');
    for (const msg of ['Network request failed', 'Failed to fetch', 'sem conexão', 'timeout of 30000ms']) {
      checar('reconhece erro de rede: ' + msg, api.isLikelyNetworkError(new Error(msg)) === true);
    }
    for (const msg of ['duplicate key value', 'permission denied for table', 'invalid input syntax']) {
      checar('não confunde erro real com rede: ' + msg, api.isLikelyNetworkError(new Error(msg)) === false);
    }
  }

  console.log(`\n${total - falhas}/${total} checagens de cache offline passaram — ${falhas} falhas`);
  if (falhas > 0) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
