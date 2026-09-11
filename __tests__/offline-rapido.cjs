/* Guarda de regressão da lentidão sem rede.
 *
 *   node __tests__/offline-rapido.cjs
 *
 * Dois sintomas relatados pelo autor em 11/09/2026: o app demorava a abrir
 * sem internet, e o lançamento por voz demorava a ser agendado na fila.
 *
 * Os dois têm a mesma causa. Rede AUSENTE devolve erro em milissegundos, mas
 * rede que ACEITA a conexão e não responde deixa o `fetch` pendurado até o
 * tempo do sistema operacional. Enquanto isso o app esperava, mesmo tendo o
 * dado no disco.
 *
 * Os módulos são os de produção, compilados em memória. O relógio é falso e o
 * `setTimeout` é encurtado mil vezes, então um prazo de 4 segundos passa em
 * 4 milissegundos e a bateria inteira roda instantânea, sem mexer em nenhuma
 * constante de produção.
 */
const assert = require('node:assert/strict');
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
    exports, console, Date, Promise, JSON, Math, Number, String, Object, Array, Error, RegExp,
    AbortController, Blob, File, Response, Request, Uint8Array, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, __DEV__: false,
    require(id) {
      if (id in dependencias) return dependencias[id];
      throw new Error('Import nao simulado em ' + arquivo + ': ' + id);
    },
    ...globais,
  }, { filename: arquivo });
  return exports;
}

/** Encurta mil vezes: 4000 ms de produção viram 4 ms de teste. */
const rapido = (fn, ms) => setTimeout(fn, Math.max(0, Math.ceil((ms || 0) / 1000)));

/** Falha o teste em vez de pendurar para sempre quando a correção sai. */
function comLimite(promessa, rotulo, ms = 2000) {
  let t;
  return Promise.race([
    promessa.finally(() => clearTimeout(t)),
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error('TRAVOU: ' + rotulo)), ms); }),
  ]);
}

const nunca = () => new Promise(() => {});
let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

function montarCache({ disco = new Map(), buscar } = {}) {
  const gravados = [];
  const mod = carregar('lib/cache-de-tela.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      async getItem(k) { return disco.has(k) ? disco.get(k) : null; },
      async setItem(k, v) { disco.set(k, v); gravados.push(k); },
      async getAllKeys() { return [...disco.keys()]; },
      async multiRemove(ks) { ks.forEach((k) => disco.delete(k)); },
    } },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
    } } },
    // O dono do cache passou a ser lido pelo aparelho (11/09/2026).
    './sessao-offline': { idDoUsuarioLocal: async () => 'u1' },
  }, { setTimeout: rapido });
  return { mod, disco, gravados, buscar };
}

function guardar(disco, chave, dados) {
  disco.set('grana:cache:tela:' + chave, JSON.stringify({
    userId: 'u1', dados, guardadoEm: new Date().toISOString(),
  }));
}

async function telasAbremRapido() {
  console.log('\nTelas sem rede');

  // 1. Rede pendurada COM dado no disco: serve o disco dentro do prazo.
  {
    const { mod, disco } = montarCache();
    guardar(disco, 'transacoes', [{ id: 'do-disco' }]);
    const buscar = mod.comCacheOffline('transacoes', nunca);
    const dados = await comLimite(buscar(), 'rede pendurada nao pode segurar a tela');
    assert.deepEqual(dados, [{ id: 'do-disco' }]);
    assert.equal(mod.estaServindoDoCache(), true, 'a tela precisa saber que o dado e velho');
    ok('rede pendurada devolve o disco e avisa que o dado e velho');
  }

  // 2. Rede pendurada SEM dado no disco: continua esperando, não inventa vazio.
  {
    const { mod } = montarCache();
    const buscar = mod.comCacheOffline('conquistas', nunca);
    let desfecho = 'ainda esperando';
    void buscar().then(() => { desfecho = 'resolveu'; }, () => { desfecho = 'rejeitou'; });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(desfecho, 'ainda esperando', 'sem disco, lista vazia seria mentira');
    ok('sem nada no disco, o prazo nao inventa resposta');
  }

  // 3. Falha permanente continua estourando, mesmo com disco cheio (regra 9).
  {
    const { mod, disco } = montarCache();
    guardar(disco, 'saldos', [{ id: 'velho' }]);
    const buscar = mod.comCacheOffline('saldos', async () => {
      throw Object.assign(new Error('function not found'), { code: 'PGRST202' });
    });
    await assert.rejects(buscar(), /function not found/);
    ok('falha permanente nao vira dado velho');
  }

  // 4. Rede que responde depois do prazo grava o dado fresco para a proxima vez.
  {
    const { mod, disco } = montarCache();
    guardar(disco, 'metas', [{ id: 'velho' }]);
    const buscar = mod.comCacheOffline('metas', () => new Promise((resolve) => {
      setTimeout(() => resolve([{ id: 'fresco' }]), 40);
    }));
    const servido = await comLimite(buscar(), 'resposta tardia');
    assert.deepEqual(servido, [{ id: 'velho' }], 'quem ja esperou recebe o disco');
    await new Promise((r) => setTimeout(r, 80));
    const guardadoAgora = JSON.parse(disco.get('grana:cache:tela:metas')).dados;
    assert.deepEqual(guardadoAgora, [{ id: 'fresco' }], 'a proxima abertura precisa nascer atual');
    ok('resposta tardia atualiza o disco sem atropelar a tela');
  }

  // 5. Rede sadia continua sendo o caminho normal, sem prazo nenhum no meio.
  {
    const { mod } = montarCache();
    const buscar = mod.comCacheOffline('categorias', async () => [{ id: 'ao-vivo' }]);
    const dados = await comLimite(buscar(), 'rede sadia');
    assert.deepEqual(dados, [{ id: 'ao-vivo' }]);
    assert.equal(mod.estaServindoDoCache(), false);
    ok('rede sadia responde ao vivo e limpa o aviso de dado velho');
  }
}

async function vozAgendaRapido() {
  console.log('\nVoz sem rede');

  function montarVoz({ orcamentoMs, msLocal = 0 } = {}) {
    const reg = { prazoLocalRecebido: null, envios: 0 };
    let relogio = 1000000;
    const mod = carregar('lib/voz.ts', {
      './voz-local': {
        PRAZO_LOCAL_PADRAO_MS: 30000,
        transcreverNoAparelho: async (_uri, prazoMs) => {
          reg.prazoLocalRecebido = prazoMs;
          relogio += msLocal;
          return null;
        },
      },
      'react-native': { Platform: { OS: 'android' } },
      'expo-file-system': { File: class {
        get exists() { return true; }
        get size() { return 4; }
        async bytes() { return new Uint8Array([1, 2, 3, 4]); }
      } },
      './supabase': { supabase: { auth: { getSession: async () => ({
        data: { session: { access_token: 'tok' } },
      }) } } },
      './sessao-offline': { tokenDeAcessoLocal: async () => 'tok' },
      'expo/fetch': { fetch: async (_url, init) => {
        reg.envios++;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('Abortado');
            e.name = 'AbortError';
            reject(e);
          }, { once: true });
        });
      } },
    }, {
      FormData: class { append() {} },
      process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://exemplo.invalido' } },
      Date: { now: () => relogio },
      setTimeout: rapido,
    });
    return { mod, reg, orcamentoMs };
  }

  // 6. O botao do app desiste dentro do proprio orcamento, nao no do widget.
  {
    const { mod, reg } = montarVoz();
    const r = await comLimite(
      mod.transcreverAudio('file:///a.m4a', { orcamentoMs: mod.ORCAMENTO_COM_PESSOA_ESPERANDO_MS }),
      'botao de voz com rede pendurada',
    );
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'demorou');
    assert.equal(reg.envios, 1, 'nao pode tentar de novo fora do prazo');
    ok('botao de voz com rede pendurada desiste e nao trava');
  }

  // 7. O passo local nao pode gastar mais do que o total de quem chamou.
  {
    const { mod, reg } = montarVoz();
    await comLimite(mod.transcreverAudio('file:///a.m4a', { orcamentoMs: 15000 }), 'prazo local');
    assert.ok(reg.prazoLocalRecebido <= 15000,
      'reconhecimento local recebeu ' + reg.prazoLocalRecebido + 'ms para um orcamento de 15000ms');
    ok('o reconhecimento local cabe no orcamento de quem chamou');
  }

  // 8. Sem orcamento explicito, o widget headless mantem o minuto inteiro.
  {
    const { mod, reg } = montarVoz();
    await comLimite(mod.transcreverAudio('file:///a.m4a'), 'prazo do widget');
    assert.equal(reg.prazoLocalRecebido, 60000, 'o widget nao pode ter perdido o orcamento dele');
    ok('sem orcamento explicito o widget segue com o minuto de sempre');
  }

  // 9. Quem limita o reconhecimento local ao teto de 30s e o proprio modulo
  //    local, nao quem chama. Ler a constante de fora ja pulou o passo local
  //    em silencio duas vezes, trocando trabalho de graca por chamada paga.
  {
    const prazos = [];
    const local = carregar('lib/voz-local.ts', {
      'react-native': { Platform: { OS: 'android', Version: 34 } },
    }, { setTimeout: (fn, ms) => { prazos.push(ms); return rapido(fn, ms); } });

    await local.transcreverNoAparelho('file:///a.m4a', 60000);
    assert.equal(prazos.at(-1), local.PRAZO_LOCAL_PADRAO_MS, 'orcamento maior nao pode esticar o teto local');
    await local.transcreverNoAparelho('file:///a.m4a', 9000);
    assert.equal(prazos.at(-1), 9000, 'orcamento menor precisa encurtar o teto local');
    ok('o teto do reconhecimento local mora no proprio modulo local');
  }

  // 10. O orcamento do botao precisa ser MENOR que o do widget, senao a
  //     correcao nao existe.
  {
    const { mod } = montarVoz();
    assert.ok(mod.ORCAMENTO_COM_PESSOA_ESPERANDO_MS < 60000,
      'o orcamento com pessoa esperando precisa ser menor que o total do widget');
    ok('o orcamento com pessoa esperando e menor que o do widget');
  }
}

(async () => {
  await telasAbremRapido();
  await vozAgendaRapido();
  console.log('\n' + aprovadas + '/' + aprovadas + ' guardas de lentidao sem rede passaram — 0 falhas\n');
})().catch((erro) => {
  console.error('\nFALHOU: ' + erro.message + '\n');
  process.exit(1);
});
