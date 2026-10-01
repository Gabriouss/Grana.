/* O dado que chega atrasado em `lib/cache-de-tela.ts`: dono e escrita.
 *
 *   node __tests__/cache-de-tela-atrasadas.cjs
 *
 * Auditoria de 01/10/2026 (achados Q3 e Q5), medidos com este mesmo módulo:
 *
 *  - Q5, privacidade: o mapa `atrasados` não tinha dono e `esquecerTelas` só
 *    limpava o disco. A conta B, entrando no aparelho em até 15 s depois de A
 *    ter recebido uma resposta lenta, lia o dado de A.
 *  - Q3: busca lenta que atravessa uma escrita chegava DEPOIS de
 *    `lancamentoGravado()`, repunha o dado de antes da escrita no mapa e no
 *    disco, e a tela mostrava a lista sem o item recém-gravado por até 15 s.
 *
 * Módulo REAL (receita de cache-offline.cjs: ts.transpileModule + vm), com
 * disco, relógio e sessão falsos. Para provar que o teste pega o defeito, rode
 * contra o fonte antigo:
 *   CACHE_DE_TELA_FONTE=<arquivo .ts> node __tests__/cache-de-tela-atrasadas.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const FONTE = process.env.CACHE_DE_TELA_FONTE || path.join(__dirname, '..', 'lib', 'cache-de-tela.ts');
let total = 0;
let falhas = 0;
function checar(nome, condicao, detalhe = '') {
  total++;
  if (condicao) { console.log('  ok  ' + nome); return; }
  falhas++;
  console.error('FALHOU  ' + nome + (detalhe ? ' — ' + detalhe : ''));
}
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function montar(usuarioInicial) {
  const disco = new Map();
  let usuario = usuarioInicial;
  const relogio = { t: 1_000_000_000_000 };
  const AsyncStorage = {
    async getItem(k) { return disco.has(k) ? disco.get(k) : null; },
    async setItem(k, v) { disco.set(k, v); },
    async removeItem(k) { disco.delete(k); },
    async getAllKeys() { return [...disco.keys()]; },
    async multiRemove(ks) { ks.forEach((k) => disco.delete(k)); },
  };
  function RelogioFalso(...a) { return new Date(...a); }
  RelogioFalso.now = () => relogio.t;
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(FONTE, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports, console, Date: RelogioFalso, JSON, Set, Map, String, Promise,
      /* Os 4 s de produção viram 4 ms; o relógio de 15 s é controlado à mão. */
      setTimeout: (fn, ms) => setTimeout(fn, Math.max(0, Math.ceil((ms || 0) / 1000))),
      clearTimeout,
      require: (id) => {
        if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: AsyncStorage };
        if (id === './sessao-offline') return { idDoUsuarioLocal: async () => usuario ?? null };
        throw Error(id);
      },
    }
  );
  const lerDisco = (nome) => {
    const bruto = disco.get('grana:cache:tela:' + nome);
    return bruto ? JSON.parse(bruto).dados : null;
  };
  return { api: exports, relogio, lerDisco, trocarUsuario: (id) => { usuario = id; } };
}

/** Uma busca controlável: 'inicial' e 'fresca' respondem na hora, 'lenta' fica pendurada até soltar(). */
function buscaControlavel(valores) {
  const s = { fase: 'inicial', soltar: null };
  const lenta = new Promise((r) => { s.soltar = r; });
  s.buscar = async () => {
    if (s.fase === 'lenta') return lenta;
    return valores[s.fase];
  };
  return s;
}

(async () => {
  /* ── Q5: troca de conta dentro da janela de 15 s ───────────────────────── */
  {
    const { api, trocarUsuario } = montar('conta-A');
    const b = buscaControlavel({ inicial: ['A-antigo'], fresca: ['dado-de-B'] });
    const f = api.comCacheOffline('saldos', b.buscar);
    await f();
    b.fase = 'lenta';
    await f();                                    // perde a corrida de 4 s, serve o disco
    b.soltar(['A-atualizado']);                   // chega atrasado e vai para o mapa
    await pausa(30);
    await api.esquecerTelas();                    // a saída da conta
    trocarUsuario('conta-B');
    b.fase = 'fresca';
    const lido = await f();
    checar('Q5: a conta B não lê o dado atrasado da conta A', JSON.stringify(lido) === JSON.stringify(['dado-de-B']), 'leu ' + JSON.stringify(lido));
  }

  /* Q5, variante: troca de conta SEM passar por esquecerTelas (o dono do dado
     é conferido na leitura, não só na saída). */
  {
    const { api, trocarUsuario } = montar('conta-A');
    const b = buscaControlavel({ inicial: ['A-antigo'], fresca: ['dado-de-B'] });
    const f = api.comCacheOffline('saldos', b.buscar);
    await f();
    b.fase = 'lenta';
    await f();
    b.soltar(['A-atualizado']);
    await pausa(30);
    trocarUsuario('conta-B');
    b.fase = 'fresca';
    const lido = await f();
    checar('Q5: o dono do dado atrasado é conferido na leitura', JSON.stringify(lido) === JSON.stringify(['dado-de-B']), 'leu ' + JSON.stringify(lido));
  }

  /* Q5, disco: resposta lenta de A que chega DEPOIS da saída não pode ser
     gravada no disco carimbada com o dono que entrou. */
  {
    const { api, trocarUsuario, lerDisco } = montar('conta-A');
    const b = buscaControlavel({ inicial: ['A-antigo'], fresca: ['dado-de-B'] });
    const f = api.comCacheOffline('saldos', b.buscar);
    await f();
    b.fase = 'lenta';
    await f();
    await api.esquecerTelas();
    trocarUsuario('conta-B');
    b.soltar(['A-chegou-depois-da-saida']);
    await pausa(30);
    checar('Q5: resposta de A depois da saída não vai ao disco de B', lerDisco('saldos') === null, 'disco: ' + JSON.stringify(lerDisco('saldos')));
  }

  /* ── Q3: busca lenta que atravessa uma escrita ─────────────────────────── */
  {
    const { api, relogio, lerDisco } = montar('conta-A');
    const b = buscaControlavel({ inicial: ['D0'], fresca: ['D2-com-a-escrita'] });
    const f = api.comCacheOffline('boletos', b.buscar);
    await f();
    b.fase = 'lenta';
    const servida = await f();
    checar('Q3: perdeu a corrida e serviu o disco', JSON.stringify(servida) === JSON.stringify(['D0']));
    api.lancamentoGravado();                      // a escrita acontece com o pedido ainda no ar
    b.soltar(['D1-de-antes-da-escrita']);
    await pausa(30);
    b.fase = 'fresca';
    const logo = await f();
    checar('Q3: a resposta anterior à escrita não é servida', JSON.stringify(logo) === JSON.stringify(['D2-com-a-escrita']), 'leu ' + JSON.stringify(logo));
    checar('Q3: a resposta anterior à escrita não sobrescreve o disco', JSON.stringify(lerDisco('boletos')) !== JSON.stringify(['D1-de-antes-da-escrita']), 'disco: ' + JSON.stringify(lerDisco('boletos')));
    relogio.t += 16_000;
  }

  /* O que NÃO pode mudar: sem escrita nem troca de conta, a resposta tardia
     continua sendo guardada e servida (é o laço do vídeo de 12/09). */
  {
    const { api, relogio, lerDisco } = montar('conta-A');
    const b = buscaControlavel({ inicial: ['D0'], fresca: ['nunca-lido'] });
    const f = api.comCacheOffline('boletos', b.buscar);
    await f();
    b.fase = 'lenta';
    await f();
    b.soltar(['D1-tardio']);
    await pausa(30);
    checar('sem escrita: a resposta tardia vai ao disco', JSON.stringify(lerDisco('boletos')) === JSON.stringify(['D1-tardio']));
    b.fase = 'fresca';
    checar('sem escrita: a recarga encontra o dado tardio', JSON.stringify(await f()) === JSON.stringify(['D1-tardio']));
    relogio.t += 16_000;
    checar('sem escrita: passada a validade, volta à rede', JSON.stringify(await f()) === JSON.stringify(['nunca-lido']));
  }

  console.log(`${total - falhas}/${total} verificações`);
  if (falhas) process.exit(1);
})();
