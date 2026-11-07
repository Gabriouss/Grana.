// Componentes e handlers reais, TypeScript em vm. Só as fronteiras são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
let corrente;
let checagens = 0;
const ok = (texto) => { checagens++; console.log(`ok ${checagens}: ${texto}`); };
const efeitoIgual = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const react = {
  useState(inicial) {
    const dono = corrente, i = dono.cursor++;
    if (!(i in dono.slots)) dono.slots[i] = typeof inicial === 'function' ? inicial() : inicial;
    return [dono.slots[i], (v) => { dono.slots[i] = typeof v === 'function' ? v(dono.slots[i]) : v; }];
  },
  useRef(inicial) { return react.useState(() => ({ current: inicial }))[0]; },
  useMemo(fn, deps) {
    const i = corrente.cursor++;
    const antes = corrente.slots[i];
    if (!antes || !efeitoIgual(antes.deps, deps)) corrente.slots[i] = { deps, valor: fn() };
    return corrente.slots[i].valor;
  },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  useEffect(fn, deps) {
    const dono = corrente, i = dono.cursor++;
    if (!efeitoIgual(dono.slots[i], deps)) { dono.slots[i] = deps; dono.efeitos.push(fn); }
  },
};
const jsx = (type, props) => ({ type, props: props || {} });
const TransactionSheet = function TransactionSheet() {};
let diario = [], erroDiario = false, erroGravacao = false, erroAjustes = false;
/* Falha só a escrita da caixa escolhida: pula as primeiras e recusa as seguintes. */
let falhaCaixa = { pular: 0, vezes: 0 };
let falhaFormas = false, avisosDoConsole = [];
let chamadas = [], alertas = [], copiado = '', dadosLocais = {}, historico = [];
const disco = new Map();
const nativo = {
  avisosDisponivel: true,
  estadoAvisos: () => ({ acesso: false, ultimoSinal: 0, desconectadoEm: 0, ultimaFalha: null }),
  listarAppsAvisos: () => [{ pacote: 'com.exemplo.banco', nome: 'Banco Exemplo', ligado: false, contagem: 2 }],
  definirDonoAvisos() {}, garantirListaInicialAvisos() {},
  definirAppAvisos: (...args) => chamadas.push(['app', ...args]),
  abrirAcessoAvisos: () => { if (erroAjustes) throw new Error('ajustes'); chamadas.push(['acesso']); },
  abrirInformacoesDoAppAvisos: () => chamadas.push(['informacoes']),
  lerDiarioAvisos: async () => { if (erroDiario) throw new Error('disco'); return { itens: diario, ilegiveis: 0 }; },
  apagarDiarioAvisos: async () => { if (erroDiario) throw new Error('disco'); diario = []; chamadas.push(['apagar']); },
};
const salvar = async (entrada, chave) => {
  chamadas.push(['gravar', entrada, chave]);
  if (erroGravacao) throw new Error('gravação indisponível');
  await new Promise((r) => setImmediate(r));
  return { guardado: false };
};
const stub = {
  react,
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (s) => s }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
  '@react-native-async-storage/async-storage': { getItem: async (k) => {
      if (falhaFormas && k.startsWith('grana_avisos_formas:')) throw new Error('disco');
      return disco.get(k) ?? null;
    },
    setItem: async (k, v) => {
      if (falhaFormas && k.startsWith('grana_avisos_formas:')) throw new Error('disco');
      if (k.startsWith('grana_avisos_caixa:')) {
        if (falhaCaixa.pular > 0) falhaCaixa.pular--;
        else if (falhaCaixa.vezes > 0) { falhaCaixa.vezes--; throw new Error('disco'); }
      }
      disco.set(k, v);
    }, removeItem: async (k) => { disco.delete(k); } },
  '@/modules/grana-avisos': nativo,
  '@/lib/cache-de-tela': { lerTela: async (chave) => chave in dadosLocais ? { dados: dadosLocais[chave] } : null },
  '@/lib/data': Object.fromEntries(['seedDefaultCategories', 'fetchCategories', 'addCategory', 'updateCategory', 'deleteCategory']
    .map((nome) => [nome, () => { chamadas.push(['rede-proibida', nome]); throw new Error(`Rede proibida: ${nome}`); }])),
  '@/lib/offline-cache': { getCachedTransactions: async () => historico },
  '../offline-cache': { salvarOuGuardarNoAparelho: salvar, salvarOuGuardarParceladaNoAparelho: async (...args) => {
    chamadas.push(['parcelada']); return salvar(...args);
  } },
  '../data': { payBill: async (conta, data) => { chamadas.push(['pagar', conta.id, data]); } },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/erros': { mensagemErro: (e) => e.message },
  '@/lib/alerta': { Alert: { alert: (...args) => alertas.push(args) } },
  '@/lib/lancamentos-alterados': { marcarLancamentosAlterados: () => chamadas.push(['alterados']) },
  '@/lib/theme': { fonts: { light: 'Light', regular: 'Regular' }, type: { apoio: 14, titulo: 20, legenda: 12 },
    theme: {}, spacing: {}, radius: {}, PALETTE_30: ['#123456'], lh: (n) => n * 1.4, hitSlopPara: () => 12, touchTarget: 48 },
  '@/lib/motion': { useReducedMotion: () => true },
  '@expo/vector-icons/Ionicons': { default: 'Ionicons', __esModule: true },
  'expo-clipboard': { setStringAsync: async (s) => { copiado = s; } },
};
const cache = new Map();
function carregar(relativo) {
  let arquivo = path.resolve(root, relativo);
  if (!path.extname(arquivo)) arquivo += fs.existsSync(arquivo + '.ts') ? '.ts' : '.tsx';
  if (cache.has(arquivo)) return cache.get(arquivo);
  let fonte = fs.readFileSync(arquivo, 'utf8');
  // Expõe só ao harness os componentes privados, sem alterar seus handlers.
  if (arquivo.endsWith('AvisosAConferir.tsx')) fonte += '\nexport { ListaAConferir, CartaoDoAviso };';
  if (arquivo.endsWith('AvisosBancoSecao.tsx')) fonte += '\nexport { DiarioDoTeste };';
  const resultado = ts.transpileModule(fonte, { reportDiagnostics: true, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  assert.equal((resultado.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, relativo);
  const exports = {};
  cache.set(arquivo, exports);
  vm.runInNewContext(resultado.outputText, { exports, console: { error() {}, warn: (...a) => avisosDoConsole.push(a) },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
    require(id) {
      if ((arquivo.endsWith('AvisosAConferir.tsx') || arquivo.endsWith('AvisosBancoSecao.tsx')) && id === '@/lib/data') {
        throw new Error(`T2: import de rede na tela: ${id}`);
      }
      if (id in stub) return stub[id];
      if (id === './TransactionSheet') return { default: TransactionSheet, __esModule: true };
      if (id.startsWith('@/components/')) return { default: './' + id.split('/').at(-1), useKeyboardHeight: () => 0, __esModule: true };
      if (id.startsWith('./') && arquivo.includes(`${path.sep}components${path.sep}`)) {
        return { default: id, InsetsDoModal: 'InsetsDoModal', JanelaFlutuante: 'JanelaFlutuante', useKeyboardHeight: () => 0, __esModule: true };
      }
      if (id.startsWith('@/lib/data') || id === '@/lib/wallets') throw new Error(`T2: import de rede proibido: ${id}`);
      if (id.startsWith('@/')) return carregar(id.slice(2));
      if (id.startsWith('.')) return carregar(path.relative(root, path.resolve(path.dirname(arquivo), id)));
      throw new Error(`Import sem dublê: ${id}`);
    },
  }, { filename: relativo });
  return exports;
}
function montar(fn, props) {
  const ctx = { slots: [], cursor: 0, efeitos: [], tree: null };
  ctx.render = () => { ctx.cursor = 0; corrente = ctx; ctx.tree = fn(props); for (const efeito of ctx.efeitos.splice(0)) efeito(); return ctx.tree; };
  ctx.settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); ctx.render(); };
  ctx.render();
  return ctx;
}
function elementos(no, resultado = []) {
  if (Array.isArray(no)) { no.forEach((n) => elementos(n, resultado)); return resultado; }
  if (typeof no === 'function') return elementos(no({ top: 0, bottom: 0, scrimStyle: {}, sheetStyle: {}, aoMedirFundo() {} }), resultado);
  if (!no || typeof no !== 'object') return resultado;
  resultado.push(no); elementos(no.props?.children, resultado); return resultado;
}
function texto(no) {
  if (Array.isArray(no)) return no.map(texto).join(' ');
  if (typeof no === 'function') return texto(no({ top: 0, bottom: 0, scrimStyle: {}, sheetStyle: {}, aoMedirFundo() {} }));
  if (no && typeof no === 'object') return texto(no.props?.children);
  return no == null || typeof no === 'boolean' ? '' : String(no);
}
function botao(ctx, rotulo) {
  const e = elementos(ctx.tree).find((n) => n.props.onPress && texto(n) === rotulo);
  assert.ok(e, `Botão ${rotulo} visível`); return e.props.onPress;
}
/* Botao guarda o texto em `rotulo`, então `texto()` não o enxerga. */
const rotulos = (no) => elementos(no).map((n) => n.props.rotulo).filter(Boolean);
const carteira = { id: 'w', is_default: true, name: 'Principal' };
let sequencia = 0;
const aviso = (texto, titulo = 'Compra aprovada') => ({ id: (++sequencia).toString(16).padEnd(64, '0'),
  pacote: 'com.nu.production', chave: `k${sequencia}`, quando: Date.now(), titulo, texto });
const telas = carregar('components/AvisosAConferir.tsx');
const perfil = carregar('components/AvisosBancoSecao.tsx');
const caixa = carregar('lib/avisos-banco/caixa.ts');
async function lista(avisoTeste, opcoes = {}) {
  if (!opcoes.manterDisco) disco.clear();
  chamadas = []; alertas = []; erroGravacao = false; erroDiario = false; falhaCaixa = { pular: 0, vezes: 0 };
  diario = Array.isArray(avisoTeste) ? avisoTeste : [avisoTeste]; historico = opcoes.historico ?? [];
  dadosLocais = { carteiras: [carteira], cartoes: [{ id: 'c', last_digits: '1234', wallet_id: 'w', bank: 'nubank' }],
    categorias: [], 'apelidos-categoria': [{ chave: 'mercado modelo', valor: 'Alimentação' }],
    'boletos:todos': opcoes.contas ?? [] };
  await caixa.sincronizarCaixa(opcoes.dono ?? 'dono');
  const ctx = montar(telas.ListaAConferir, { dono: opcoes.dono ?? 'dono', aoFechar() {}, aoMudar() {}, nomeDoPerfil: 'Pessoa Modelo' });
  await ctx.settle();
  /* O aviso mais novo fica por último: com `manterDisco`, os anteriores seguem na lista. */
  const card = () => elementos(ctx.tree).filter((e) => e.type === telas.CartaoDoAviso).at(-1);
  assert.ok(card(), 'aviso entrou na lista');
  return { ctx, card };
}
async function main() {
  ok('componentes carregam sem importar data, wallets ou fazer rede (T2)');
  let { ctx, card } = await lista(aviso('Compra no crédito de R$ 89,90 em Mercado Modelo final 1234'));
  assert.equal(chamadas.length, 0);
  const confirmar = card().props.aoConfirmar;
  confirmar(); confirmar();
  await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 1);
  assert.equal(chamadas.find((c) => c[0] === 'gravar')[1].payment_method, 'credit');
  assert.equal((await caixa.listarCaixa('dono')).length, 0);
  confirmar(); await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 1);
  ok('Confirmar chama gravarItem real, remove só depois e bloqueia toque duplo e handler antigo');

  ({ ctx, card } = await lista(aviso('Compra no débito de R$ 35,00 em Mercado Modelo')));
  card().props.aoDescartar(); await ctx.settle();
  assert.equal((await caixa.listarCaixa('dono')).length, 0);
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0);
  await caixa.sincronizarCaixa('dono');
  assert.equal((await caixa.listarCaixa('dono')).length, 0);
  ok('Descartar chama caixa real, nunca grava dinheiro e o mesmo aviso não retorna');

  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 89,90 em Mercado Modelo final 1234')));
  erroGravacao = true;
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal((await caixa.listarCaixa('dono')).length, 1);
  assert.equal(alertas.at(-1)[0], 'Não consegui salvar');
  erroGravacao = false; card().props.aoConfirmar(); await ctx.settle();
  assert.equal((await caixa.listarCaixa('dono')).length, 0);
  ok('falha de gravação deixa recibo e preserva o aviso para nova tentativa');

  ({ ctx, card } = await lista(aviso('Compra no débito de R$ 22,00 em Loja Exemplo')));
  card().props.aoConfirmar(); await ctx.settle();
  let sheet = elementos(ctx.tree).find((e) => e.type === TransactionSheet);
  assert.ok(sheet); assert.equal(sheet.props.inicial.category, '');
  assert.ok(sheet.props.categoriasLocais.length > 0, 'revisão recebe as opções locais');
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0);
  ok('sem categoria abre TransactionSheet com categoria vazia e não grava');

  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 89,90 em Mercado Modelo final 1234'), {
    historico: [{ type: 'out', amount: 89.9, occurred_on: new Date().toLocaleDateString('en-CA') }],
  }));
  // A data do item real evita depender do formato de locale instalado no Windows.
  const item = card().props.item;
  card().props.dados.lancamentos[0].occurred_on = item.data;
  assert.match(texto(telas.CartaoDoAviso(card().props)), /Parece já lançado/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.ok(elementos(ctx.tree).some((e) => e.type === TransactionSheet));
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0);
  ok('Parece já lançado fica visível e Confirmar exige revisão');

  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 120,00 em Mercado Modelo em 3x final 1234')));
  assert.equal(card().props.item.parcelas, 3);
  card().props.aoConfirmar(); await ctx.settle();
  sheet = elementos(ctx.tree).find((e) => e.type === TransactionSheet);
  assert.equal(sheet.props.inicial.installments, 3);
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0);
  await sheet.props.onSalvar({ ...sheet.props.inicial, category: 'Alimentação', color: '#123456' });
  await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'parcelada').length, 1);
  ok('parcelada exige revisão e só depois chama o gravador parcelado real');

  ({ ctx, card } = await lista(aviso('Boleto pago no valor de R$ 150,00', 'Pagamento confirmado'), {
    contas: [{ id: 'conta', amount: 150, description: 'Conta Modelo', status: 'due' }],
  }));
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(chamadas.filter((c) => ['gravar', 'pagar'].includes(c[0])).length, 0);
  const pagar = alertas.at(-1)[2].find((b) => b.text === 'Sim, marcar como paga');
  assert.ok(pagar); pagar.onPress(); pagar.onPress(); await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'pagar').length, 1);
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0);
  ok('boleto casado pede revisão e confirmação paga a conta sem segunda saída');

  /* A6: pagou a conta e só a retirada da lista falhou. Nunca vira também saída avulsa. */
  ({ ctx, card } = await lista(aviso('Boleto pago no valor de R$ 150,00', 'Pagamento confirmado'), {
    contas: [{ id: 'conta', amount: 150, description: 'Conta Modelo', status: 'due' }],
  }));
  card().props.aoConfirmar(); await ctx.settle();
  const opcoesBoleto = alertas.at(-1)[2];
  falhaCaixa = { pular: 1, vezes: 1 };
  opcoesBoleto.find((b) => b.text === 'Sim, marcar como paga').onPress(); await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'pagar').length, 1);
  assert.equal(alertas.at(-1)[0], 'Conta marcada como paga', 'recibo diz o que aconteceu');
  assert.equal(card().props.jaSalvo, true);
  assert.equal(chamadas.filter((c) => c[0] === 'alterados').length, 1, 'as telas ficam sabendo do pagamento');
  assert.deepEqual(rotulos(telas.CartaoDoAviso(card().props)), ['Tirar da lista']);
  /* A janela antiga do alerta ainda oferece as duas saídas: nenhuma mexe no dinheiro de novo */
  opcoesBoleto.find((b) => b.text === 'Sim, marcar como paga').onPress(); await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'pagar').length, 1, 'não paga duas vezes');
  ({ ctx, card } = await lista(aviso('Boleto pago no valor de R$ 151,00', 'Pagamento confirmado'), {
    contas: [{ id: 'conta', amount: 151, description: 'Conta Modelo', status: 'due' }],
  }));
  card().props.aoConfirmar(); await ctx.settle();
  const opcoesAntigas = alertas.at(-1)[2];
  falhaCaixa = { pular: 1, vezes: 1 };
  opcoesAntigas.find((b) => b.text === 'Sim, marcar como paga').onPress(); await ctx.settle();
  opcoesAntigas.find((b) => b.text === 'Não, lançar saída').onPress(); await ctx.settle();
  const sheetBoleto = elementos(ctx.tree).find((e) => e.type === TransactionSheet);
  await sheetBoleto.props.onSalvar({ ...sheetBoleto.props.inicial, category: 'Casa', color: '#123456' }); await ctx.settle();
  assert.deepEqual(chamadas.filter((c) => ['gravar', 'pagar'].includes(c[0])).map((c) => c[0]), ['pagar'], 'só o pagamento');
  assert.equal((await caixa.listarCaixa('dono')).length, 0);
  ok('A6: conta paga com falha na retirada não vira saída avulsa, e o recibo diz que pagou');

  /* A6: o pagamento falhou sem resposta. Pode ter chegado, então nada de oferecer outra saída */
  ({ ctx, card } = await lista(aviso('Boleto pago no valor de R$ 152,00', 'Pagamento confirmado'), {
    contas: [{ id: 'conta', amount: 152, description: 'Conta Modelo', status: 'due' }],
  }));
  card().props.aoConfirmar(); await ctx.settle();
  const pagarAntes = stub['../data'].payBill;
  stub['../data'].payBill = async () => { chamadas.push(['pagar']); throw new Error('sem resposta'); };
  alertas.at(-1)[2].find((b) => b.text === 'Sim, marcar como paga').onPress(); await ctx.settle();
  stub['../data'].payBill = pagarAntes;
  assert.equal(alertas.at(-1)[0], 'Não consegui confirmar o pagamento');
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(alertas.at(-1)[0], 'Pagamento já iniciado', 'a lista recarregou e sabe do pagamento');
  ok('A6: pagamento incerto dá recibo próprio e a lista passa a saber dele');

  /* A7: gravou e só a retirada falhou. O recibo não diz que falhou, e não há edição que se perca. */
  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 89,90 em Mercado Modelo final 1234')));
  falhaCaixa = { pular: 0, vezes: 1 };
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 1);
  assert.equal(alertas.at(-1)[0], 'Lançamento salvo');
  assert.equal(chamadas.filter((c) => c[0] === 'alterados').length, 1);
  assert.equal(card().props.jaSalvo, true);
  assert.match(texto(telas.CartaoDoAviso(card().props)), /Já salvo/);
  assert.deepEqual(rotulos(telas.CartaoDoAviso(card().props)), ['Tirar da lista']);
  assert.deepEqual(rotulos(telas.CartaoDoAviso({ ...card().props, jaSalvo: false })), ['Descartar', 'Editar', 'Confirmar'], 'controle: sem a marca, as três ações');
  elementos(telas.CartaoDoAviso(card().props)).find((n) => n.props.rotulo === 'Tirar da lista').props.onPress();
  await ctx.settle();
  assert.equal((await caixa.listarCaixa('dono')).length, 0);
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 1);
  assert.equal(disco.get('grana_avisos_gravados:dono'), '{}', 'a marca sai junto');
  ok('A7: recibo certo, sem Confirmar nem Editar, e Tirar da lista não grava de novo');

  /* A7: a mesma falha com a revisão aberta. Ela fecha, e a revisão antiga não finge que corrigiu. */
  ({ ctx, card } = await lista(aviso('Compra no débito de R$ 22,00 em Loja Exemplo')));
  card().props.aoConfirmar(); await ctx.settle();
  const revisaoAberta = elementos(ctx.tree).find((e) => e.type === TransactionSheet);
  const valoresRevisao = { ...revisaoAberta.props.inicial, category: 'Alimentação', color: '#123456' };
  falhaCaixa = { pular: 0, vezes: 1 };
  await revisaoAberta.props.onSalvar(valoresRevisao); await ctx.settle();
  assert.equal(alertas.at(-1)[0], 'Lançamento salvo');
  assert.ok(!elementos(ctx.tree).some((e) => e.type === TransactionSheet), 'a revisão fecha');
  await revisaoAberta.props.onSalvar({ ...valoresRevisao, amount: '90,00' }); await ctx.settle();
  const gravacoes = chamadas.filter((c) => c[0] === 'gravar');
  assert.equal(gravacoes.length, 1);
  assert.equal(gravacoes[0][1].amount, 22);
  assert.match(texto(ctx.tree), /já estava salvo/);
  assert.doesNotMatch(texto(ctx.tree), /Lançamento salvo/);
  ok('A7: revisão antiga não grava e o recibo manda corrigir nos lançamentos');

  ({ ctx, card } = await lista([
    aviso('Compra no crédito de R$ 89,90 em Mercado Modelo final 1234'),
    { ...aviso('Compra de R$ 89,90 em Mercado Modelo'), pacote: 'com.google.android.apps.walletnfcrel' },
  ]));
  assert.equal(elementos(ctx.tree).filter((e) => e.type === telas.CartaoDoAviso).length, 1);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 1);
  ok('mesma compra avisada por banco e carteira aparece e grava uma única vez');

  diario = [aviso('Pagamento de fatura de R$ 150,00 confirmado', 'Fatura paga')]; disco.clear();
  assert.equal((await caixa.sincronizarCaixa('dono')).itens.length, 0);
  ok('fatura paga não aparece na caixa de gastos');

  const faixa = montar(telas.default, { dono: 'dono' }); await faixa.settle();
  assert.equal(elementos(faixa.tree).filter((e) => e.type === 'View').length, 0);
  ok('zero itens não renderiza a faixa');

  /* 07/11/2026: a barra saiu da Início. Janela bloqueante no centro, aberta pelo contador de janelas. */
  const janelas = carregar('lib/janelas-abertas.ts');
  const preparar = (itens) => {
    disco.clear(); chamadas = []; alertas = []; erroGravacao = false; erroDiario = false;
    diario = itens;
    dadosLocais = { carteiras: [carteira], cartoes: [], categorias: [], 'apelidos-categoria': [{ chave: 'mercado modelo', valor: 'Alimentação' }],
      'boletos:todos': [] };
  };
  const listaAberta = (c) => elementos(c.tree).some((e) => e.type === telas.ListaAConferir);

  preparar([aviso('Compra no débito de R$ 35,00 em Mercado Modelo')]);
  let janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
  assert.equal(listaAberta(janela), true);
  assert.equal(elementos(janela.tree).some((e) => e.props.rotulo === 'Fechar' || texto(e) === 'Fechar'), false, 'não há botão Fechar');
  assert.doesNotMatch(texto(janela.tree), /para conferir/, 'sem barra de contagem na Início');
  ok('com aviso pendente e nenhuma outra janela, a janela abre sozinha (sem barra)');

  /* Bloqueante: o Voltar do Android e o toque fora não fecham nada. */
  ({ ctx } = await lista(aviso('Compra no débito de R$ 36,00 em Mercado Modelo')));
  const modalAvisos = elementos(ctx.tree).find((e) => e.type === './AppModal');
  const sheetAvisos = elementos(ctx.tree).find((e) => e.type === './Sheet');
  assert.ok(modalAvisos && sheetAvisos);
  assert.equal(modalAvisos.props.semRegistro, true, 'não se conta como outra janela');
  assert.equal(modalAvisos.props.transparent, true);
  const antes = (await caixa.listarCaixa('dono')).length;
  modalAvisos.props.onRequestClose(); sheetAvisos.props.onClose(); await ctx.settle();
  assert.equal((await caixa.listarCaixa('dono')).length, antes, 'Voltar e toque fora não resolvem nem apagam item');
  assert.equal(modalAvisos.props.visible, true, 'continua visível');
  assert.equal(elementos(ctx.tree).some((e) => e.props.rotulo === 'Fechar'), false);
  assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0);
  ok('Voltar do Android e toque fora não fecham a janela nem gravam ou descartam');

  /* Não abre por cima de outra janela; abre quando ela fecha; e não some se outra abrir depois. */
  preparar([aviso('Compra no débito de R$ 37,00 em Mercado Modelo')]);
  const liberarOutra = janelas.registrarJanelaAberta();
  janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
  assert.equal(listaAberta(janela), false, 'outra janela aberta: espera');
  liberarOutra(); await janela.settle(); await janela.settle();
  assert.equal(listaAberta(janela), true, 'abre quando a outra fecha');
  const liberarDepois = janelas.registrarJanelaAberta(); await janela.settle();
  assert.equal(listaAberta(janela), true, 'já aberta, outra janela não a derruba');
  liberarDepois();
  preparar([aviso('Compra no débito de R$ 38,00 em Mercado Modelo')]);
  janela = montar(telas.default, { dono: 'dono', bloqueado: true }); await janela.settle(); await janela.settle();
  assert.equal(listaAberta(janela), false, 'tutorial em primeiro plano: espera');
  ok('não abre por cima de outra janela nem do tutorial, abre ao liberar e não é derrubada depois');

  /* Fecha sozinha ao resolver o último item. */
  const filho = elementos(janela.tree).find((e) => e.type === telas.ListaAConferir);
  preparar([aviso('Compra no débito de R$ 39,00 em Mercado Modelo')]);
  janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
  const propsDaLista = elementos(janela.tree).find((e) => e.type === telas.ListaAConferir).props;
  assert.equal(typeof propsDaLista.aoMudar, 'function');
  propsDaLista.aoMudar([]); await janela.settle(); await janela.settle();
  assert.equal(listaAberta(janela), false, 'sem item pendente a janela fecha');
  assert.equal(filho, undefined);
  ok('fecha sozinha quando o último item é resolvido');

  /* Falha de leitura sem barra: recibo por alerta, uma vez só. */
  preparar([]); erroDiario = true;
  janela = montar(telas.default, { dono: 'dono' }); await janela.settle();
  const alertasDeLeitura = alertas.filter((a) => a[0] === 'Avisos do banco');
  assert.equal(alertasDeLeitura.length, 1);
  assert.match(alertasDeLeitura[0][1], /Não consegui ler/);
  erroDiario = false;
  ok('falha ao ler o diário deixa recibo (alerta) em vez de barra');

  const p = montar(perfil.default, {}); await p.settle();
  assert.match(texto(p.tree), /Android entrega todas/);
  assert.match(texto(p.tree), /Acesso desligado/);
  assert.match(texto(p.tree), /Sem sinal/);
  assert.match(texto(p.tree), /Permitir configurações\s+restritas/);
  botao(p, 'Liberar')(); assert.equal(chamadas.at(-1)[0], 'acesso');
  const toggle = elementos(p.tree).find((e) => e.props.onToggle);
  toggle.props.onToggle(); assert.equal(chamadas.at(-1)[0], 'app');
  erroAjustes = true; botao(p, 'Liberar')(); p.render();
  assert.match(texto(p.tree), /Não consegui abrir/);
  ok('Perfil explica acesso, sem sinal, restrição oficial, toggle local e erro dos ajustes');

  erroDiario = true;
  const d = montar(perfil.DiarioDoTeste, { aoFechar() {} }); await d.settle();
  assert.match(texto(d.tree), /Não consegui ler o diário/);
  erroDiario = false; diario = [aviso('Compra no débito de R$ 22,00 em Mercado Modelo')];
  botao(d, 'Atualizar diário')(); await d.settle();
  botao(d, 'Copiar')(); await d.settle();
  assert.match(copiado, /Mercado Modelo/); assert.match(copiado, /Entendi:/); assert.match(copiado, /R\$22,00/);
  botao(d, 'Apagar tudo')();
  assert.equal(diario.length, 1, 'abrir confirmação não apaga');
  await alertas.at(-1)[2].find((b) => b.text === 'Apagar tudo').onPress(); await d.settle();
  assert.equal(diario.length, 0);
  ok('diário mostra falha, permite tentar novamente, copia entendimento e confirma antes de apagar');

  const seletor = carregar('components/CategoryPickerModal.tsx').default;
  chamadas = [];
  let selecionada;
  const cat = montar(seletor, { visible: true, categoriasLocais: [{ name: 'Alimentação', color: '#123456', is_default: true }],
    onClose() {}, onSelectCategory: (c) => { selecionada = c; }, tipo: 'out' });
  await cat.settle();
  assert.match(texto(cat.tree), /Alimentação/);
  assert.doesNotMatch(texto(cat.tree), /Criar categoria/);
  assert.equal(elementos(cat.tree).filter((n) => n.props.accessibilityLabel?.startsWith('Editar categoria')).length, 0);
  const escolher = elementos(cat.tree).find((n) => n.props.onPress && typeof n.props.style === 'function' && /Alimentação/.test(texto(n)));
  escolher.props.onPress();
  assert.equal(selecionada.name, 'Alimentação');
  assert.equal(chamadas.length, 0);
  ok('seletor real em modo local não semeia, busca, cria nem edita categoria no servidor');

  const sheetReal = carregar('components/TransactionSheet.tsx').default;
  let salvou = false;
  const revisaoReal = montar(sheetReal, { visible: true, modo: 'carteira', editando: false,
    inicial: { type: 'out', description: 'Loja Modelo', amount: '22,00', category: '', color: '',
      occurred_on: '2026-10-30', recurring: false, installments: 1, card_id: null, wallet_id: 'w' },
    carteiras: [carteira], salvando: false, onClose() {}, onSalvar: () => { salvou = true; },
    categoriasLocais: [{ name: 'Alimentação', color: '#123456' }],
  });
  await revisaoReal.settle();
  botao(revisaoReal, 'Salvar lançamento')(); revisaoReal.render();
  assert.equal(salvou, false);
  const seletorEncaminhado = elementos(revisaoReal.tree).find((n) => n.type === './CategoryPickerModal');
  assert.equal(seletorEncaminhado.props.visible, true);
  assert.equal(seletorEncaminhado.props.categoriasLocais[0].name, 'Alimentação');
  ok('TransactionSheet real exige categoria e encaminha somente as opções locais ao seletor');

  chamadas = [];
  for (const nome of ['seedDefaultCategories', 'fetchCategories']) {
    stub['@/lib/data'][nome] = async () => {
      chamadas.push([nome]);
      return nome === 'fetchCategories' ? [{ id: 'normal', name: 'Alimentação', color: '#123456', is_default: true }] : undefined;
    };
  }
  const seletorNormal = montar(seletor, { visible: true, onClose() {}, tipo: 'out' });
  await seletorNormal.settle();
  assert.deepEqual(chamadas.map((c) => c[0]), ['seedDefaultCategories', 'fetchCategories']);
  assert.match(texto(seletorNormal.tree), /Criar categoria/);
  ok('modo normal do seletor mantém a semeadura, consulta e criação existentes');
  /* Forma identificada: o que a tela mostra e o que grava */
  const gravados = () => chamadas.filter((c) => c[0] === 'gravar').map((c) => c[1]);
  const CHAVE_FORMAS = 'grana_avisos_formas:dono';
  const naoPerguntou = () => assert.equal(alertas.filter((a) => a[0] === 'Como foi pago?').length, 0);
  const detalhe = (cartao) => texto(telas.CartaoDoAviso(cartao().props));
  const folhaDe = (tela) => elementos(tela.tree).find((e) => e.type === TransactionSheet);
  async function responder(tela, cartao, forma, extra = {}) {
    cartao().props.aoConfirmar(); await tela.settle();
    const pergunta = alertas.at(-1);
    assert.equal(pergunta[0], 'Como foi pago?');
    pergunta[2].find((b) => b.text === forma).onPress(); tela.render();
    const folha = folhaDe(tela);
    await folha.props.onSalvar({ ...folha.props.inicial, category: 'Alimentação', color: '#123456', ...extra });
    await tela.settle();
  }

  for (const [textoDoAviso, titulo, rotulo, metodo] of [
    ['R$ 30,00 com Pix', 'Você pagou Mercado Modelo', /Pix/, 'pix'],
    ['Compra de R$ 30,00 em Mercado Modelo. Saldo atual: R$ 90,00', 'Compra aprovada', /Débito/, 'debit'],
    ['Debitamos R$ 30,00 da sua conta.', 'Você pagou Mercado Modelo', /Débito/, 'debit'],
    ['Compra de R$ 30,00 em Mercado Modelo. Seu saldo disponível em conta agora é R$ 900,00', 'Compra aprovada', /Débito/, 'debit'],
  ]) {
    ({ ctx, card } = await lista(aviso(textoDoAviso, titulo)));
    assert.match(detalhe(card), rotulo, 'a forma aparece antes do toque');
    assert.equal(gravados().length, 0, 'nada grava antes do toque (T4)');
    card().props.aoConfirmar(); await ctx.settle();
    naoPerguntou();
    const folha = folhaDe(ctx);
    if (folha) { await folha.props.onSalvar({ ...folha.props.inicial, category: 'Alimentação', color: '#123456' }); await ctx.settle(); }
    assert.equal(gravados()[0].payment_method, metodo);
    assert.equal(gravados()[0].amount, 30, 'o valor do saldo nunca vira o da compra');
    assert.equal(gravados()[0].card_id, undefined);
  }
  ok('forma pela palavra e pelo sinal: aparece antes do toque, não pergunta e grava certo');

  ({ ctx, card } = await lista(aviso('Debitamos R$ 30,00 da sua conta.', 'Você pagou Mercado Modelo')));
  assert.match(detalhe(card), /Mercado Modelo/);
  assert.match(detalhe(card), /Débito/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(folhaDe(ctx), undefined, 'grava em um toque');
  assert.equal(gravados()[0].description, 'Mercado Modelo');
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(gravados()[0].amount, 30);
  ok('aviso do banco sozinho: um toque grava a loja do título, em débito');

  ({ ctx, card } = await lista(aviso('Compra de R$ 30,00 em Mercado Modelo. Limite disponível: R$ 900,00')));
  assert.match(detalhe(card), /Crédito/);
  card().props.aoConfirmar(); await ctx.settle();
  naoPerguntou();
  assert.equal(gravados().length, 0, 'crédito sem cartão abre a revisão');
  assert.equal(folhaDe(ctx).props.modo, 'credito');
  assert.equal(folhaDe(ctx).props.inicial.card_id, null);
  ok('limite disponível responde crédito e continua pedindo o cartão');

  /* Memória: cancelar não ensina */
  const FINAL_NOVO = 'Compra de R$ 30,00 em Mercado Modelo final 5678';
  ({ ctx, card } = await lista(aviso(FINAL_NOVO)));
  assert.match(detalhe(card), /Forma não informada/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(alertas.at(-1)[0], 'Como foi pago?');
  alertas.at(-1)[2].find((b) => b.text === 'Débito').onPress(); ctx.render();
  folhaDe(ctx).props.onClose(); ctx.render();
  assert.equal(folhaDe(ctx), undefined);
  assert.equal(disco.has(CHAVE_FORMAS), false, 'tocar na pergunta e cancelar não ensina');
  assert.equal(gravados().length, 0);
  ok('cancelar a revisão não ensina');

  /* Responde uma vez e o próximo aviso do mesmo final já chega com a forma */
  await responder(ctx, card, 'Débito');
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(disco.get(CHAVE_FORMAS), '{"5678":"debit"}', 'só o final e a forma, sem texto do aviso (T2)');
  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  assert.match(detalhe(card), /Débito/);
  card().props.aoConfirmar(); await ctx.settle();
  naoPerguntou();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(gravados()[0].amount, 40);
  assert.equal(gravados()[0].card_id, undefined);
  ok('pergunta uma vez e, no aviso seguinte do mesmo final, não pergunta e grava débito');

  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 4321'), { manterDisco: true }));
  assert.match(detalhe(card), /Forma não informada/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(alertas.at(-1)[0], 'Como foi pago?');
  assert.equal(gravados().length, 0);
  ok('outro final continua perguntando');

  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 5678'), { manterDisco: true, dono: 'outro' }));
  assert.match(detalhe(card), /Forma não informada/);
  assert.equal(disco.has('grana_avisos_formas:outro'), false);
  ok('outro dono não herda');

  await responder(ctx, card, 'Crédito', { card_id: 'c' });
  assert.equal(gravados()[0].payment_method, 'credit');
  assert.equal(disco.get('grana_avisos_formas:outro'), '{"5678":"credit"}');
  assert.equal(disco.get(CHAVE_FORMAS), '{"5678":"debit"}', 'cada dono com a sua memória');
  await caixa.limparCaixa('outro');
  assert.equal(disco.has('grana_avisos_formas:outro'), false, 'sair da conta leva a memória');
  assert.equal(disco.has(CHAVE_FORMAS), true);
  ok('a resposta fica por dono, e sair da conta leva a memória');

  /* A palavra vence a memória */
  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 40,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  assert.match(detalhe(card), /Crédito/);
  card().props.aoConfirmar(); await ctx.settle();
  naoPerguntou();
  assert.equal(folhaDe(ctx).props.modo, 'credito');
  ok('palavra explícita vence a memória');

  /* A memória vence o "final cadastrado é crédito". Antes de ensinar, o final responde crédito. */
  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 1234')));
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'credit');
  assert.equal(gravados()[0].card_id, 'c');
  ({ ctx, card } = await lista(aviso('Compra no débito de R$ 20,00 em Mercado Modelo final 1234')));
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(disco.get(CHAVE_FORMAS), '{"1234":"debit"}');
  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 1234'), { manterDisco: true }));
  assert.match(detalhe(card), /Débito/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(gravados()[0].card_id, undefined, 'débito não vai para a fatura do cartão cadastrado');
  ok('a memória vence o final cadastrado');

  /* Crédito aprendido sem cartão identificado continua pedindo o cartão */
  ({ ctx, card } = await lista(aviso(FINAL_NOVO)));
  await responder(ctx, card, 'Crédito', { card_id: 'c' });
  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  card().props.aoConfirmar(); await ctx.settle();
  naoPerguntou();
  assert.equal(gravados().length, 0);
  assert.equal(folhaDe(ctx).props.modo, 'credito');
  assert.equal(folhaDe(ctx).props.inicial.card_id, null);
  ok('crédito aprendido sem cartão identificado abre a revisão para escolher o cartão');

  /* Sem final, dinheiro entrando ou boleto não ensinam */
  ({ ctx, card } = await lista(aviso('Compra de R$ 30,00 em Mercado Modelo')));
  await responder(ctx, card, 'Pix');
  assert.equal(gravados()[0].payment_method, 'pix');
  assert.equal(disco.has(CHAVE_FORMAS), false);
  ({ ctx, card } = await lista(aviso('Você recebeu um Pix de R$ 300,00 de Carlos Exemplo final 5678', 'Pix recebido')));
  card().props.aoConfirmar(); await ctx.settle();
  let folhaSemEnsinar = folhaDe(ctx);
  await folhaSemEnsinar.props.onSalvar({ ...folhaSemEnsinar.props.inicial, category: 'Alimentação', color: '#123456' }); await ctx.settle();
  assert.equal(gravados()[0].type, 'in');
  assert.equal(disco.has(CHAVE_FORMAS), false);
  ({ ctx, card } = await lista(aviso('Boleto pago de R$ 210,00 para Energia Modelo final 5678', 'Boleto pago')));
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados().length, 0, 'boleto continua abrindo a revisão');
  folhaSemEnsinar = folhaDe(ctx);
  await folhaSemEnsinar.props.onSalvar({ ...folhaSemEnsinar.props.inicial, category: 'Moradia', color: '#123456' }); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(disco.has(CHAVE_FORMAS), false);
  ok('sem final, entrada de dinheiro e boleto não ensinam');

  /* Cartão múltiplo: gravado com duas formas, o final para de responder */
  const SEM_SINAL_1234 = 'Compra de R$ 40,00 em Mercado Modelo final 1234';
  const SEM_SINAL_5678 = 'Compra de R$ 40,00 em Mercado Modelo final 5678';
  ({ ctx, card } = await lista(aviso('Compra no débito de R$ 20,00 em Mercado Modelo final 1234')));
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(disco.get(CHAVE_FORMAS), '{"1234":"debit"}');
  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 20,00 em Mercado Modelo final 1234'), { manterDisco: true }));
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'credit');
  assert.equal(disco.get(CHAVE_FORMAS), '{"1234":"variavel"}', 'duas formas no mesmo final');

  ({ ctx, card } = await lista(aviso(SEM_SINAL_1234), { manterDisco: true }));
  assert.match(detalhe(card), /Forma não informada/, 'nem a memória nem o final cadastrado respondem');
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(alertas.at(-1)[0], 'Como foi pago?');
  assert.equal(gravados().length, 0);
  ok('final com duas formas e cartão cadastrado: aviso sem sinal pergunta e não grava');

  alertas.at(-1)[2].find((b) => b.text === 'Crédito').onPress(); ctx.render();
  assert.equal(folhaDe(ctx).props.inicial.card_id, 'c', 'respondido crédito, o cartão do final continua sugerido');
  await folhaDe(ctx).props.onSalvar({ ...folhaDe(ctx).props.inicial, category: 'Alimentação', color: '#123456' }); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'credit');
  assert.equal(gravados()[0].card_id, 'c');
  assert.equal(disco.get(CHAVE_FORMAS), '{"1234":"variavel"}', 'gravar de novo não desfaz a marca');
  ok('a resposta grava certo e o final continua variável');

  ({ ctx, card } = await lista(aviso('Compra no débito de R$ 20,00 em Mercado Modelo final 1234'), { manterDisco: true }));
  assert.match(detalhe(card), /Débito/);
  card().props.aoConfirmar(); await ctx.settle();
  naoPerguntou();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(gravados()[0].card_id, undefined);
  ok('com a palavra escrita, o final variável não pergunta');

  ({ ctx, card } = await lista(aviso(FINAL_NOVO)));
  await responder(ctx, card, 'Débito');
  ({ ctx, card } = await lista(aviso('Compra de R$ 30,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  assert.match(detalhe(card), /Débito/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(disco.get(CHAVE_FORMAS), '{"5678":"debit"}', 'a mesma forma de novo não marca');
  ({ ctx, card } = await lista(aviso('Compra no crédito de R$ 30,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  card().props.aoConfirmar(); await ctx.settle();
  await folhaDe(ctx).props.onSalvar({ ...folhaDe(ctx).props.inicial, category: 'Alimentação', color: '#123456', card_id: 'c' }); await ctx.settle();
  assert.equal(disco.get(CHAVE_FORMAS), '{"5678":"variavel"}');
  ({ ctx, card } = await lista(aviso(SEM_SINAL_5678), { manterDisco: true }));
  assert.match(detalhe(card), /Forma não informada/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(alertas.at(-1)[0], 'Como foi pago?');
  ok('final com duas formas e sem cartão cadastrado: aviso sem sinal pergunta');

  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 4321')));
  disco.set(CHAVE_FORMAS, '{"4321":"pix","5678":"variavel"}');
  ({ ctx, card } = await lista(aviso('Compra de R$ 41,00 em Mercado Modelo final 4321'), { manterDisco: true }));
  assert.match(detalhe(card), /Pix/);
  card().props.aoConfirmar(); await ctx.settle();
  naoPerguntou();
  assert.equal(gravados()[0].payment_method, 'pix');
  assert.equal(disco.get(CHAVE_FORMAS), '{"4321":"pix","5678":"variavel"}');
  ok('outro final não é afetado');

  disco.set(CHAVE_FORMAS, '{"1234":"debit","5678":"credit"}');
  ({ ctx, card } = await lista(aviso(SEM_SINAL_1234), { manterDisco: true }));
  assert.match(detalhe(card), /Débito/);
  card().props.aoConfirmar(); await ctx.settle();
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal(disco.get(CHAVE_FORMAS), '{"1234":"debit","5678":"credit"}');
  ok('memória no formato anterior continua valendo');

  /* Disco da memória falhando: a lista e a gravação seguem, com log */
  avisosDoConsole = [];
  falhaFormas = true;
  ({ ctx, card } = await lista(aviso(FINAL_NOVO)));
  assert.match(detalhe(card), /Forma não informada/);
  await responder(ctx, card, 'Débito');
  assert.equal(gravados()[0].payment_method, 'debit');
  assert.equal((await caixa.listarCaixa('dono')).length, 0, 'o item sai da lista');
  assert.ok(avisosDoConsole.length >= 2, 'leitura e gravação deixam aviso no log');
  assert.ok(avisosDoConsole.every((a) => !a.join(' ').includes('Mercado')), 'o log não leva texto do aviso');
  falhaFormas = false;
  disco.set(CHAVE_FORMAS, 'isto não é json');
  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  assert.match(detalhe(card), /Forma não informada/);
  disco.set(CHAVE_FORMAS, '{"5678":"qualquer","abc":"debit","1111":"pix"}');
  ({ ctx, card } = await lista(aviso('Compra de R$ 40,00 em Mercado Modelo final 5678'), { manterDisco: true }));
  assert.match(detalhe(card), /Forma não informada/);
  ok('memória ilegível ou com falha no disco não derruba a lista nem a gravação');

  console.log(`\n${checagens} grupos de verificação passaram. Sem rede ou aparelho.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
