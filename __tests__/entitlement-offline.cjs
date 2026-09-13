/*
 * Acesso offline: o app não pode mandar quem paga para a tela de venda só
 * porque o celular está sem rede.
 *
 * Testa o MÓDULO REAL (`lib/entitlement-cache.ts`), transpilado em memória e
 * executado com um `AsyncStorage` dublê — não uma reimplementação da regra,
 * que passaria mesmo se o módulo de produção estivesse errado.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const loja = new Map();
let falharEscrita = false;
const dubleStorage = {
  getItem: async (k) => (loja.has(k) ? loja.get(k) : null),
  setItem: async (k, v) => {
    if (falharEscrita) throw new Error('sem espaço no aparelho');
    loja.set(k, v);
  },
  removeItem: async (k) => void loja.delete(k),
};

const avisos = [];
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('lib/entitlement-cache.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  {
    exports: api,
    Date,
    JSON,
    Number,
    console: { ...console, warn: (...args) => avisos.push(args.join(' ')) },
    // Serve com e sem `esModuleInterop`: o dublê responde no topo e em `default`.
    require: (nome) => {
      if (nome !== '@react-native-async-storage/async-storage') throw new Error(`import inesperado: ${nome}`);
      return { ...dubleStorage, default: dubleStorage, __esModule: true };
    },
  }
);

const AGORA = Date.parse('2026-09-09T12:00:00Z');
const base = {
  enforced: true,
  active: true,
  allowed: true,
  status: 'active',
  access_until: null,
  grace_until: null,
};
const em = (dias) => new Date(AGORA + dias * 86400000).toISOString();

(async () => {
  // ---- prazoOfflineAindaVale: honra o prazo que o servidor já prometeu ----
  const casos = [
    ['sem nada guardado', null, false],
    ['acesso já negado pelo servidor', { ...base, allowed: false, access_until: em(30) }, false],
    ['cobrança desligada no servidor', { ...base, enforced: false, access_until: null }, true],
    ['dentro do prazo pago', { ...base, access_until: em(5) }, true],
    ['prazo pago vencido', { ...base, access_until: em(-1) }, false],
    ['vencido, mas ainda na tolerância', { ...base, access_until: em(-2), grace_until: em(3) }, true],
    ['vencido e fora da tolerância', { ...base, access_until: em(-9), grace_until: em(-2) }, false],
    ['sem data alguma, com cobrança ligada', { ...base }, false],
    ['data corrompida', { ...base, access_until: 'ontem de manhã' }, false],
  ];
  for (const [nome, estado, esperado] of casos) {
    assert.equal(api.prazoOfflineAindaVale(estado, AGORA), esperado, nome);
  }

  // A borda exata não pode liberar: vencido é vencido.
  assert.equal(api.prazoOfflineAindaVale({ ...base, access_until: new Date(AGORA).toISOString() }, AGORA), false,
    'vencimento exatamente agora não vale');

  // ---- guardar e ler ----
  const estado = { ...base, access_until: em(20) };
  await api.guardarAcesso('user-1', estado);
  assert.deepEqual(await api.lerAcessoGuardado('user-1'), estado, 'ida e volta preserva o estado');

  // Trocar de conta no mesmo aparelho não herda o acesso da anterior.
  assert.equal(await api.lerAcessoGuardado('user-2'), null, 'outra conta não lê o acesso guardado');

  // Cache ilegível não pode derrubar o app nem virar acesso liberado.
  const chave = [...loja.keys()][0];
  loja.set(chave, '{isso não é json');
  assert.equal(await api.lerAcessoGuardado('user-1'), null, 'json corrompido devolve nulo');
  assert.ok(avisos.some((a) => a.includes('ilegível')), 'cache ilegível deixa recibo no log');

  // Sair apaga de verdade.
  await api.guardarAcesso('user-1', estado);
  await api.esquecerAcesso();
  assert.equal(await api.lerAcessoGuardado('user-1'), null, 'esquecerAcesso limpa o cache');

  // Aparelho sem espaço degrada para o comportamento antigo, sem lançar.
  falharEscrita = true;
  await api.guardarAcesso('user-1', estado);
  assert.equal(await api.lerAcessoGuardado('user-1'), null, 'escrita falha não inventa cache');
  assert.ok(avisos.some((a) => a.includes('guardar')), 'falha de escrita deixa recibo no log');
  falharEscrita = false;

  // ---- estadoAposFalha: a guarda de navegação não pode piscar ----
  //
  // Regressão da 1.10.1. Um tropeço de rede derrubava `allowed`, a guarda
  // `Stack.Protected` de `app/_layout.tsx` caía junto, o Expo Router
  // desmontava o grupo de telas e a pessoa reaparecia na rota inicial com o
  // teclado fechado no meio de um lançamento. Aqui se fixa QUANDO o acesso
  // pode cair, e sobretudo quando não pode.
  const valendo = { ...base, access_until: em(30) };
  const vencido = { ...base, access_until: em(-9) };

  const quedas = [
    ['guardado válido manda, mesmo sem estado anterior',
      { anterior: null, guardado: valendo, semRede: true }, true],
    ['guardado válido manda também na falha permanente',
      { anterior: null, guardado: valendo, semRede: false }, true],
    ['falha de rede PRESERVA o acesso que já estava de pé',
      { anterior: valendo, guardado: null, semRede: true }, true],
    ['falha PERMANENTE derruba, mesmo com acesso anterior',
      { anterior: valendo, guardado: null, semRede: false }, false],
    ['sem anterior e sem guardado, fecha',
      { anterior: null, guardado: null, semRede: true }, false],
    ['anterior já vencido não ressuscita',
      { anterior: vencido, guardado: null, semRede: true }, false],
    ['anterior que o servidor já negou não vira acesso',
      { anterior: { ...base, allowed: false }, guardado: null, semRede: true }, false],
    ['guardado vencido não manda, mas o anterior válido salva',
      { anterior: valendo, guardado: vencido, semRede: true }, true],
  ];
  for (const [nome, entrada, esperado] of quedas) {
    assert.equal(api.estadoAposFalha({ ...entrada, agora: AGORA }).allowed, esperado, nome);
  }

  // O estado preservado é o MESMO objeto, não um remendo com allowed ligado:
  // devolver prazo ou status diferente do que o servidor prometeu seria
  // inventar acesso.
  assert.deepEqual(
    api.estadoAposFalha({ anterior: valendo, guardado: null, semRede: true, agora: AGORA }),
    valendo,
    'preservar acesso não altera prazo nem status'
  );

  // Fechar é fechar: nada de `enforced:false` por engano, que liberaria tudo.
  const fechado = api.estadoAposFalha({ anterior: null, guardado: null, semRede: false, agora: AGORA });
  assert.equal(fechado.allowed, false, 'estado fechado nega acesso');
  assert.equal(fechado.enforced, true, 'estado fechado mantém a cobrança ligada');

  // ---- deveSegurarRotas: a raiz não monta rotas sem saber o acesso ----
  //
  // Regressão do defeito de 13/09/2026 na web: "Ativando sua assinatura…"
  // aparecia em /graficos e /contas. A guarda antiga só segurava se o sinal de
  // carregando estivesse ligado, e ele nasce desligado — então a primeira
  // pintura com sessão e sem estado passava, todos os grupos protegidos
  // fechavam e o roteador caía em `ativar`.
  const guardas = [
    ['sessão ainda carregando segura', { carregandoSessao: true, temSessao: false, estadoAcesso: null }, true],
    ['sem sessão monta as rotas públicas', { carregandoSessao: false, temSessao: false, estadoAcesso: null }, false],
    // O caso do defeito. Antes: `session && carregando && !estado` com
    // carregando=false dava false e deixava a pilha desenhar sem acesso.
    ['COM sessão e SEM estado segura, mesmo sem nada carregando', { carregandoSessao: false, temSessao: true, estadoAcesso: null }, true],
    ['com sessão e acesso liberado monta o app', { carregandoSessao: false, temSessao: true, estadoAcesso: base }, false],
    ['com sessão e acesso negado monta a tela de assinar', { carregandoSessao: false, temSessao: true, estadoAcesso: { ...base, allowed: false } }, false],
    ['sessão recarregando segura mesmo com estado antigo', { carregandoSessao: true, temSessao: true, estadoAcesso: base }, true],
  ];
  for (const [nome, entrada, esperado] of guardas) {
    assert.equal(api.deveSegurarRotas(entrada), esperado, nome);
  }

  // A propriedade que de fato impede a queda em `ativar`: sempre que a guarda
  // libera uma pessoa logada, o estado tem `allowed` booleano. Com `true` abre
  // `(app)`, com `false` abre `assinar` — nunca os dois grupos fechados juntos.
  let liberacoesComSessao = 0;
  for (const [, entrada] of guardas) {
    if (entrada.temSessao && !api.deveSegurarRotas(entrada)) {
      liberacoesComSessao += 1;
      assert.equal(typeof entrada.estadoAcesso?.allowed, 'boolean', 'rota liberada com sessão sempre tem allowed definido');
    }
  }
  assert.ok(liberacoesComSessao >= 2, 'a propriedade foi exercitada nos dois lados (liberado e negado)');

  // E a garantia que sustenta segurar sem medo de spinner eterno: nenhuma
  // falha devolve estado nulo, então a recarga sempre destrava a guarda.
  for (const [nome, entrada] of quedas) {
    assert.ok(api.estadoAposFalha({ ...entrada, agora: AGORA }), `falha nunca vira estado nulo: ${nome}`);
  }

  console.log(`OK acesso offline: ${casos.length + quedas.length + 10} verificações — prazo do servidor honrado, conta trocada, cache corrompido, disco cheio e guarda de navegação estável.`);
  console.log(`OK guarda de rotas: ${guardas.length + 1 + quedas.length} verificações — com sessão e sem acesso a raiz segura, e nenhuma falha deixa o estado nulo.`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
