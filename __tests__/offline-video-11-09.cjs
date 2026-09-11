/*
 * Regressões vistas no vídeo de teste de usabilidade offline de 11/09/2026.
 *
 * O autor gravou o app em modo avião e três defeitos apareceram na tela:
 *
 *  1. Salvar um lançamento pela Início falhou com "Erro ao salvar / Usuário
 *     não autenticado", e o valor digitado foi PERDIDO — não foi para fila
 *     nenhuma. A causa era `currentUserId()` usar `supabase.auth.getUser()`,
 *     que é ida à rede: ele morria antes de qualquer tentativa de gravar, e
 *     "Usuário não autenticado" não parece erro de rede para quem classifica
 *     a falha, então a fila offline nunca era acionada.
 *  2. O Granabô exibiu uma exceção Java crua na bolha do chat, incluindo o
 *     endereço do projeto Supabase.
 *  3. O app ofereceu "Lançar pelo WhatsApp" — canal desligado por interruptor
 *     remoto — porque sem rede o mapa de flags fica vazio e `ligado()` falha
 *     aberta, devolvendo true para toda chave desconhecida.
 *
 * Testa os MÓDULOS REAIS transpilados em memória. Uma reimplementação da
 * regra passaria mesmo com a produção quebrada.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };

function carregar(caminho, deps, globais = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(caminho, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    js,
    {
      exports,
      console,
      JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math,
      ...globais,
      require: (id) => {
        if (id in deps) return deps[id];
        throw new Error(`import nao simulado em ${caminho}: ${id}`);
      },
    },
    { filename: caminho }
  );
  return exports;
}

/* ── 1. O id do dono vem do APARELHO, e a falha vira a falha REAL ───────── */
{
  const chamadasDeRede = [];
  let sessaoDoCliente = null;
  let idNoDisco = 'u-1';

  const supabaseDuble = {
    auth: {
      getSession: async () => ({ data: { session: sessaoDoCliente } }),
      getUser: async () => {
        chamadasDeRede.push('getUser');
        throw new Error('Network request failed');
      },
    },
    from: () => {
      const q = {
        insert: () => q,
        select: () => q,
        single: async () => ({ data: null, error: Object.assign(new Error('Network request failed'), { code: '' }) }),
      };
      return q;
    },
  };

  const data = carregar('lib/data.ts', {
    './supabase': { supabase: supabaseDuble },
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar, estaServindoDoCache: () => false },
    './sessao-offline': { idDoUsuarioLocal: async () => idNoDisco },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    './format': { isCreditTx: () => false, todayISO: () => '2026-09-11' },
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: { getItem: async () => null, setItem: async () => {} },
    },
  });

  const entrada = {
    type: 'out', description: 'Teste', amount: 765.64,
    category: 'Energético', color: '#fff', occurred_on: '2026-09-11',
  };

  let erro = null;
  return (async () => {
    try {
      await data.addTransaction(entrada);
    } catch (e) {
      erro = e;
    }

    ok(erro !== null, 'sem rede, gravar ainda falha — o servidor nao foi alcancado');
    igual(chamadasDeRede.length, 0, 'nao pergunta ao SERVIDOR quem e o usuario antes de gravar');
    ok(
      !/não autenticado|nao autenticado/i.test(String(erro && erro.message)),
      'a falha nao se disfarca de "Usuário não autenticado" — era isso que escondia a falta de rede'
    );

    /* O ponto todo: a falha precisa ser reconhecivel como "sem rede", porque e
       assim que a tela decide enfileirar em vez de descartar o lancamento. */
    const cacheDeTela = carregar('lib/cache-de-tela.ts', {
      './sessao-offline': { idDoUsuarioLocal: async () => idNoDisco },
      '@react-native-async-storage/async-storage': {
        __esModule: true,
        default: { getItem: async () => null, setItem: async () => {}, getAllKeys: async () => [], multiRemove: async () => {} },
      },
    }, { setTimeout, clearTimeout });

    ok(
      cacheDeTela.isLikelyNetworkError(erro),
      'a falha e classificada como falta de rede, entao a fila offline e acionada'
    );

    // Sem conta nenhuma no aparelho a mensagem honesta continua sendo essa.
    idNoDisco = null;
    let erroSemConta = null;
    try {
      await data.addTransaction(entrada);
    } catch (e) {
      erroSemConta = e;
    }
    ok(
      /não autenticado/i.test(String(erroSemConta && erroSemConta.message)),
      'sem conta no aparelho, "Usuário não autenticado" volta a ser a verdade'
    );

    /* ── 2. Erro do chat nao despeja excecao tecnica na tela ────────────── */
    const erros = carregar('lib/erros.ts', {
      './offline-cache': { isLikelyNetworkError: cacheDeTela.isLikelyNetworkError },
    });

    const excecaoDoVideo = new Error(
      "fetch failed: java.net.UnknownHostException: Unable to resolve host \"cjnuzfbvfuauvlzfoutv.supabase.co\": No address associated with hostname"
    );
    const traduzida = erros.mensagemErro(excecaoDoVideo, 'Algo deu errado. Tenta de novo.');
    ok(!/UnknownHostException/.test(traduzida), 'a excecao Java nao chega a tela');
    ok(!/supabase\.co/.test(traduzida), 'o endereco do projeto nao vaza para o usuario');
    ok(/sem conex/i.test(traduzida), 'a pessoa le que esta sem conexao, que e a causa real');

    /* ── 3. Interruptor remoto nao ressuscita sem rede ──────────────────── */
    const disco = new Map();
    const flagsCache = carregar('lib/flags-cache.ts', {
      '@react-native-async-storage/async-storage': {
        __esModule: true,
        default: {
          getItem: async (k) => (disco.has(k) ? disco.get(k) : null),
          setItem: async (k, v) => void disco.set(k, v),
        },
      },
      './feature-flags-regras': {},
    });

    igual(await flagsCache.lerFlagsGuardadas(), null, 'instalacao nova nao tem mapa guardado');

    const mapaDoServidor = {
      whatsapp: { key: 'whatsapp', enabled: false, mensagem: 'Canal fora do ar.' },
      assinatura_checkout: { key: 'assinatura_checkout', enabled: true, mensagem: null },
    };
    await flagsCache.guardarFlags(mapaDoServidor);

    const lido = await flagsCache.lerFlagsGuardadas();
    ok(lido && lido.whatsapp, 'o mapa confirmado pelo servidor fica guardado');
    igual(lido.whatsapp.enabled, false, 'e o WhatsApp continua DESLIGADO sem rede');

    // `{}` guardado nao pode passar por "li a configuracao": seria falha aberta
    // disfarcada de leitura boa.
    await flagsCache.guardarFlags({});
    igual(await flagsCache.lerFlagsGuardadas(), null, 'mapa vazio conta como ausencia, nao como leitura');

    /* E a regra de avaliacao continua a mesma, sobre o mapa vindo do disco.
       `./versao` entra REAL, nao dublado: a comparacao de versao e parte da
       decisao de ligado/desligado, e dublar isso testaria a minha invencao. */
    const versao = carregar('lib/versao.ts', {});
    const regras = carregar('lib/feature-flags-regras.ts', { './versao': versao });
    igual(
      regras.efetivamenteLigado(mapaDoServidor.whatsapp, '1.10.0', 'android'),
      false,
      'a regra le o flag guardado e mantem o canal desligado'
    );

    console.log(`offline-video-11-09: ${passou} verificacoes OK`);
  })();
}
