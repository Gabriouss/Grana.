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
  isValidElement: (n) => !!n && typeof n === 'object' && 'props' in n,
  cloneElement: (n, props) => ({ ...n, props: { ...n.props, ...props } }),
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
    if (!efeitoIgual(dono.slots[i], deps)) {
      dono.slots[i] = deps;
      dono.efeitos.push(() => { dono.limpezas[i]?.(); dono.limpezas[i] = fn(); });
    }
  },
};
const jsx = (type, props) => ({ type, props: props || {} });
const TransactionSheet = function TransactionSheet() {};
let diario = [], erroDiario = false, erroGravacao = false, erroAjustes = false, erroAceite = false, aceiteDoTeste = false;
/* Falha só a escrita da caixa escolhida: pula as primeiras e recusa as seguintes. */
let falhaCaixa = { pular: 0, vezes: 0 };
let falhaFormas = false, avisosDoConsole = [];
/* Falha a marca "janela ja fechada" na leitura e/ou na gravacao. */
let falhaMarca = { ler: false, gravar: false };
let chamadas = [], alertas = [], copiado = '', dadosLocais = {}, historico = [];
let privacidadeOculta = false;
let erroReferencias = false;
let leiturasDoHistorico = 0;
const disco = new Map();
const intervalos = new Set();
const animacoes = [];
class ValorAnimado {
  constructor(valor) { this.valor = valor; }
  setValue(valor) { this.valor = valor; }
  interpolate() { return this; }
}
const nativo = {
  avisosDisponivel: true,
  estadoAvisos: () => ({ acesso: false, aceite: aceiteDoTeste, ultimoSinal: 0, desconectadoEm: 0, ultimaFalha: null }),
  listarAppsAvisos: () => [{ pacote: 'com.nu.production', nome: 'Nubank', ligado: false, contagem: 0 }, { pacote: 'com.whatsapp', nome: 'WhatsApp', ligado: true, contagem: 2 }],
  definirAceiteAvisos: (valor) => { if (erroAceite) throw new Error('disco'); aceiteDoTeste = valor; chamadas.push(['aceite', valor]); },
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
  '@/lib/privacy-context': { usePrivacy: () => ({ hidden: privacidadeOculta }) },
  'expo-blur': { BlurView: 'BlurView' },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { Platform: { OS: 'android' }, View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (s) => s }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    FlatList: 'FlatList', Keyboard: { dismiss() {} }, BackHandler: { addEventListener: () => ({ remove() {} }) },
    useWindowDimensions: () => ({ width: 390, height: 800, fontScale: 1 }),
    Easing: { bezier: () => () => {} },
    Animated: { Value: ValorAnimado, View: 'AnimatedView', multiply: (v) => v,
      timing: (valor, config) => ({ start: (fim) => animacoes.push({ valor, config, fim }) }) } },
  'react-native-safe-area-context': { initialWindowMetrics: { insets: { top: 24, bottom: 24 } } },
  '@/lib/modal-accessibility': { useModalAccessibility() {} },
  '@/lib/breakpoints': { geometriaDaConversa: () => ({ top: 24, left: 16, largura: 358, altura: 650 }) },
  '@/lib/assistente': { fetchMensagens: async () => [], dentroDoPrazo: () => true,
    enviarPergunta: () => { throw new Error('envio inesperado'); } },
  '@react-native-async-storage/async-storage': { getItem: async (k) => {
      if (falhaFormas && k.startsWith('grana_avisos_formas:')) throw new Error('disco');
      if (falhaMarca.ler && k.startsWith('grana_avisos_janela_fechada:')) throw new Error('disco');
      return disco.get(k) ?? null;
    },
    setItem: async (k, v) => {
      if (falhaFormas && k.startsWith('grana_avisos_formas:')) throw new Error('disco');
      if (falhaMarca.gravar && k.startsWith('grana_avisos_janela_fechada:')) throw new Error('disco');
      if (k.startsWith('grana_avisos_caixa:')) {
        if (falhaCaixa.pular > 0) falhaCaixa.pular--;
        else if (falhaCaixa.vezes > 0) { falhaCaixa.vezes--; throw new Error('disco'); }
      }
      disco.set(k, v);
    }, removeItem: async (k) => { disco.delete(k); } },
  '@/modules/grana-avisos': nativo,
  '@/lib/cache-de-tela': { lerTela: async (chave) => { if (erroReferencias) throw new Error('referencias indisponiveis'); return chave in dadosLocais ? { dados: dadosLocais[chave] } : null; } },
  '@/lib/data': Object.fromEntries(['seedDefaultCategories', 'fetchCategories', 'addCategory', 'updateCategory', 'deleteCategory']
    .map((nome) => [nome, () => { chamadas.push(['rede-proibida', nome]); throw new Error(`Rede proibida: ${nome}`); }])),
  '@/lib/offline-cache': { getCachedTransactions: async () => { leiturasDoHistorico++; return historico; } },
  '../offline-cache': { salvarOuGuardarNoAparelho: salvar, salvarOuGuardarParceladaNoAparelho: async (...args) => {
    chamadas.push(['parcelada']); return salvar(...args);
  } },
  '../data': { payBill: async (conta, data) => { chamadas.push(['pagar', conta.id, data]); },
    deleteTransaction: async (id) => { chamadas.push(['apagar', id]); } },
  /* A pergunta de exclusão real (lib/excluir-lancamento.ts) usa './alerta': cai no mesmo registro. */
  './alerta': { Alert: { alert: (...args) => alertas.push(args) } },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/erros': { mensagemErro: (e) => e.message },
  '@/lib/alerta': { Alert: { alert: (...args) => alertas.push(args) } },
  '@/lib/lancamentos-alterados': { marcarLancamentosAlterados: () => chamadas.push(['alterados']) },
  '@/lib/theme': { fonts: { light: 'Light', regular: 'Regular' }, type: { apoio: 14, titulo: 20, legenda: 12 },
    theme: {}, spacing: {}, radius: {}, screenRhythm: {}, sombras: {}, menta: () => '#123456',
    PALETTE_30: ['#123456'], lh: (n) => n * 1.4, hitSlopPara: () => 12, touchTarget: 48 },
  '@/lib/motion': { useReducedMotion: () => true, UI_OUT: [0, 0, 1, 1] },
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
  if (arquivo.endsWith('AvisosAConferir.tsx')) fonte += '\nexport { ListaAConferir, CartaoDoAviso, CartaoDoEstorno, RecibosDeEstorno, ReciboEmJanela };';
  if (arquivo.endsWith('AvisosBancoSecao.tsx')) fonte += '\nexport { DiarioDoTeste };';
  const resultado = ts.transpileModule(fonte, { reportDiagnostics: true, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  assert.equal((resultado.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0, relativo);
  const exports = {};
  cache.set(arquivo, exports);
  vm.runInNewContext(resultado.outputText, { exports, console: { error() {}, warn: (...a) => avisosDoConsole.push(a) },
    setInterval: (fn) => { intervalos.add(fn); return fn; }, clearInterval: (fn) => intervalos.delete(fn), setTimeout, clearTimeout,
    require(id) {
      if ((arquivo.endsWith('AvisosAConferir.tsx') || arquivo.endsWith('AvisosBancoSecao.tsx')) && id === '@/lib/data') {
        throw new Error(`T2: import de rede na tela: ${id}`);
      }
      if (id in stub) return stub[id];
      if (id === './TransactionSheet') return { default: TransactionSheet, __esModule: true };
      if (id === './PrivacyValue') return carregar('components/PrivacyValue.tsx');
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
  const ctx = { slots: [], cursor: 0, efeitos: [], limpezas: [], tree: null };
  /* `novas`: o pai redesenhou e entregou props novas ao MESMO componente, como o React faz. */
  ctx.render = (novas) => { if (novas) props = novas; ctx.cursor = 0; corrente = ctx; ctx.tree = fn(props); for (const efeito of ctx.efeitos.splice(0)) efeito(); return ctx.tree; };
  ctx.settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); ctx.render(); };
  ctx.unmount = () => { for (const limpar of ctx.limpezas) limpar?.(); ctx.limpezas = []; };
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
  diario = Array.isArray(avisoTeste) ? avisoTeste : [avisoTeste]; historico = 'historico' in opcoes ? opcoes.historico : [];
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
  {
    const original = aviso('Mensagem ambigua R$ 123,45 para Pessoa Sintetica', 'Aviso');
    const { ctx: revisao, card: avisoReal } = await lista(original);
    assert.equal(avisoReal().props.item.tipo, 'nao_entendi');
    const PrivacyValue = carregar('components/PrivacyValue.tsx').default;
    function expandir(no) {
      if (Array.isArray(no)) return no.map(expandir);
      if (!no || typeof no !== 'object') return no;
      if (no.type === PrivacyValue) return expandir(PrivacyValue(no.props));
      return { ...no, props: { ...no.props, children: expandir(no.props?.children) } };
    }
    privacidadeOculta = true;
    const protegido = expandir(telas.CartaoDoAviso(avisoReal().props));
    assert.doesNotMatch(texto(protegido), /123,45|Pessoa Sintetica/, 'F02: cartao nao expoe texto bancario');
    assert.ok(elementos(protegido).some(e => e.props.accessibilityLabel === 'Valor oculto'));
    const preencher = elementos(protegido).find(e => e.props.rotulo === 'Preencher');
    assert.ok(preencher && !preencher.props.desligado, 'F02: Preencher continua disponivel');
    preencher.props.onPress(); revisao.render();
    const escolher = alertas.at(-1);
    escolher[2].find(b => b.text === 'Débito').onPress(); revisao.render();
    const sheet = elementos(revisao.tree).find(e => e.type === TransactionSheet);
    assert.ok(sheet, 'F02: acao abre folha de revisao');
    assert.doesNotMatch(texto(expandir(sheet.props.avisoDeOrigem)), /123,45|Pessoa Sintetica/, 'F02: origem tambem protegida');
    privacidadeOculta = false;
    assert.match(texto(expandir(telas.CartaoDoAviso(avisoReal().props))), /123,45.*Pessoa Sintetica/);
    assert.match(texto(expandir(sheet.props.avisoDeOrigem)), /123,45.*Pessoa Sintetica/);
    revisao.unmount();
    ok('F02: cartao e origem ocultam texto bancario; Preencher abre revisao e modo visivel preserva texto');
  }

  {
    const DIA = 24 * 60 * 60 * 1000;
    const antigo = { ...aviso('Compra no débito de R$ 53,00 em Mercado Modelo'), quando: Date.now() - 31 * DIA };
    disco.clear(); diario = [antigo];
    await caixa.sincronizarCaixa('dono', antigo.quando);
    diario = [];
    erroReferencias = true;
    const falhou = montar(telas.ListaAConferir, { dono: 'dono', aoMudar() {}, aoAdiar() {} });
    await falhou.settle();
    assert.equal(elementos(falhou.tree).filter(e => e.type === telas.CartaoDoAviso).length, 0);
    assert.equal((await caixa.listarCaixa('dono'))[0].vencimentoVisto, undefined, 'F01: falha antes de desenhar nao marca vencimento');
    assert.equal((await caixa.sincronizarCaixa('dono')).itens.length, 1, 'F01: aviso nao exibido sobrevive a sincronizacao');
    erroReferencias = false;
    elementos(falhou.tree).find(e => e.props.rotulo === 'Tentar de novo').props.onPress(); await falhou.settle();
    assert.equal((await caixa.listarCaixa('dono'))[0].vencimentoVisto, undefined, 'F01: referencias prontas sem layout ainda nao marcam');
    const exibido = elementos(falhou.tree).find(e => e.props.onLayout && elementos(e).some(c => c.type === telas.CartaoDoAviso));
    assert.ok(exibido, 'F01: cartao expoe confirmacao do layout');
    const outro = { ...antigo, id: 'outro', quando: antigo.quando - 1000, chave: 'outra' };
    diario = [outro];
    await caixa.sincronizarCaixa('dono', outro.quando);
    diario = [];
    exibido.props.onLayout();
    const guardados = await caixa.listarCaixa('dono');
    assert.equal(guardados.find(i => i.avisoIds.includes(antigo.id)).vencimentoVisto, true);
    assert.equal(guardados.find(i => i.avisoIds.includes(outro.id)).vencimentoVisto, undefined, 'F01: item que chegou depois do desenho permanece intocado');
    assert.equal((await caixa.sincronizarCaixa('dono')).itens.length, 1);
    falhou.unmount();
    ok('F01: falha nao marca nem apaga; so o ID cujo cartao recebeu layout e marcado');
  }

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
    { ...aviso('Compra de R$ 89,90 em Mercado Modelo final 1234'), pacote: 'com.google.android.apps.walletnfcrel' },
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

  /* Granachat, contador e conferência REAIS; a animação nativa fica pendente no dublê. */
  {
    preparar([]);
    const chatProps = { visivel: false, onFechar() {} };
    const chat = montar(carregar('components/Granachat.tsx').default, chatProps);
    assert.equal(janelas.quantasJanelasAbertas(), 0, 'chat fechado não se conta');
    chatProps.visivel = true; chat.render(); await chat.settle();
    assert.equal(janelas.quantasJanelasAbertas(), 1);
    const conferencia = montar(telas.default, { dono: 'dono-chat' }); await conferencia.settle();
    const lerNovos = [...intervalos].at(-1);
    diario = [aviso('Compra no débito de R$ 35,00 em Mercado Modelo')];
    await lerNovos(); await conferencia.settle(); await conferencia.settle();
    assert.equal(listaAberta(conferencia), false, 'aviso novo espera a conversa');
    chatProps.visivel = false; chat.render();
    const saida = animacoes.at(-1);
    assert.equal(saida.config.toValue, 0);
    await conferencia.settle();
    assert.equal(janelas.quantasJanelasAbertas(), 1, 'a animação de saída ainda ocupa a janela');
    assert.equal(listaAberta(conferencia), false);
    saida.fim({ finished: false }); await chat.settle();
    chatProps.visivel = true; chat.render(); await chat.settle();
    assert.equal(janelas.quantasJanelasAbertas(), 1, 'reabrir saída interrompida não duplica registro');
    chatProps.visivel = false; chat.render(); animacoes.at(-1).fim({ finished: true }); await chat.settle();
    assert.equal(janelas.quantasJanelasAbertas(), 0);
    await conferencia.settle(); await conferencia.settle();
    assert.equal(listaAberta(conferencia), true, 'só abre após terminar a saída');
    assert.equal(chamadas.length, 0, 'espera e liberação não gravam nem apagam dinheiro');
    chatProps.visivel = true; chat.render(); await chat.settle();
    assert.equal(janelas.quantasJanelasAbertas(), 1);
    chat.unmount(); chat.unmount(); conferencia.unmount();
    assert.equal(janelas.quantasJanelasAbertas(), 0, 'desmontagem libera uma vez');
    ok('aviso novo espera Granachat, inclusive saída/reabertura, e abre após liberação sem escrita financeira');
  }

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
  assert.match(texto(p.tree), /Leitura desligada/);
  assert.match(texto(p.tree), /Sem sinal/);
  assert.match(texto(p.tree), /Permitir configurações\s+restritas/);
  chamadas = [];
  botao(p, 'Liberar')(); p.render();
  assert.equal(chamadas.length, 0, 'ajustes não abrem antes do aceite');
  assert.ok(elementos(p.tree).some((e) => e.type === './Sheet'), 'aviso em janela do DS');
  assert.match(texto(p.tree), /título e (?:o )?texto/);
  assert.match(texto(p.tree), /WhatsApp/); // só a explicação do que nunca é lido
  botao(p, 'Agora não')(); p.render();
  assert.equal(chamadas.length, 0);
  assert.equal(elementos(p.tree).filter((e) => e.type === './Sheet').length, 0);
  botao(p, 'Liberar')(); p.render();
  elementos(p.tree).find((e) => e.type === './AppModal' && e.props.visible).props.onRequestClose(); p.render();
  assert.equal(chamadas.length, 0, 'Voltar também não aceita');
  botao(p, 'Liberar')(); p.render();
  erroAceite = true;
  botao(p, 'Aceitar e continuar')(); p.render();
  assert.equal(chamadas.length, 0, 'falha ao persistir não abre ajustes');
  assert.match(texto(p.tree), /Não consegui/);
  erroAceite = false;
  const aceitar = botao(p, 'Aceitar e continuar'); aceitar(); aceitar(); p.render();
  assert.equal(JSON.stringify(chamadas), JSON.stringify([['aceite', true], ['acesso']]), 'aceite gravado antes dos ajustes, uma vez');
  assert.doesNotMatch(texto(p.tree), /WhatsApp|Apps que notificaram|notificações, sem leitura/);
  assert.equal(elementos(p.tree).filter((e) => e.props.onToggle).length, 10, 'só os dez bancos do catálogo');
  const toggle = elementos(p.tree).find((e) => e.props.onToggle);
  toggle.props.onToggle(); assert.equal(chamadas.at(-1)[0], 'app');
  erroAjustes = true; botao(p, 'Liberar')(); p.render(); botao(p, 'Aceitar e continuar')(); p.render();
  assert.match(texto(p.tree), /Não consegui abrir/);
  erroAjustes = false;
  botao(p, 'Agora não')(); p.render();
  botao(p, 'Desligar leitura')(); p.render(); assert.deepEqual(chamadas.at(-1), ['aceite', false]);
  ok('Perfil só lista bancos, exige aceite em janela antes dos ajustes, cancela/Voltar não aceitam e falhas deixam recibo');

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

  /* Rodada 2 (07/11/2026): cartão próprio do estorno e recibo do descarte automático. */
  {
    const hoje = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const dia = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
    const lancamento = { id: 't1', type: 'out', amount: 25, occurred_on: dia, description: 'Loja Modelo', bank: 'nubank', card_id: null, installment_total: 1 };
    const estorno = () => aviso('Estorno de R$ 25,00 em Loja Modelo', 'Estorno');
    const cartaoDoEstorno = (card) => {
      const el = telas.CartaoDoAviso(card().props);
      assert.equal(el.type, telas.CartaoDoEstorno, 'estorno usa o cartão próprio');
      return { el, arvore: telas.CartaoDoEstorno(el.props) };
    };

    let r = await lista(estorno(), { historico: [lancamento] });
    let { arvore } = cartaoDoEstorno(r.card);
    assert.deepEqual(rotulos(arvore), ['Manter lançamento', 'Remover lançamento']);
    assert.match(texto(arvore), /Estorno de R\$/);
    assert.match(texto(arvore), /parece desfazer o lançamento de .*Loja.Modelo/);
    ok('estorno com um lançamento candidato: cartão próprio com Manter e Remover, sem Confirmar nem Editar');

    /* Remover: a pergunta de exclusão real, e só o "Excluir" apaga. */
    r.card().props.aoRemoverLancamento(lancamento);
    assert.equal(chamadas.filter((c) => c[0] === 'apagar').length, 0, 'nada apagado antes da resposta');
    const pergunta = alertas.at(-1);
    assert.equal(pergunta[0], 'Excluir lançamento');
    pergunta[2].find((b) => b.text === 'Excluir').onPress();
    await r.ctx.settle();
    assert.deepEqual(chamadas.filter((c) => c[0] === 'apagar'), [['apagar', 't1']]);
    assert.equal(chamadas.filter((c) => c[0] === 'gravar').length, 0, 'estorno nunca grava');
    assert.equal((await caixa.listarCaixa('dono')).length, 0, 'o estorno sai da lista');
    ok('Remover lançamento pergunta, apaga só o lançamento escolhido e tira o estorno');

    /* Manter: tira da lista sem apagar nada. */
    r = await lista(estorno(), { historico: [lancamento] });
    r.card().props.aoDescartar(); await r.ctx.settle();
    assert.equal(chamadas.filter((c) => c[0] === 'apagar' || c[0] === 'gravar').length, 0);
    assert.equal((await caixa.listarCaixa('dono')).length, 0);
    ok('Manter lançamento tira o estorno da lista sem apagar nem gravar');

    for (const candidato of [{ ...lancamento, bank: 'c6' }, { ...lancamento, bank: undefined }]) {
      r = await lista(estorno(), { historico: [candidato] });
      ({ arvore } = cartaoDoEstorno(r.card));
      assert.deepEqual(rotulos(arvore), ['Entendi'], 'outro banco ou banco ausente não oferece remover');
      assert.equal(chamadas.length, 0, 'oferta recusada não grava nem apaga');
      assert.equal((await caixa.listarCaixa('dono')).length, 1, 'estorno continua para revisão');
    }
    ok('estorno real com confirmado de outro banco ou sem banco não oferece remover nem escreve dinheiro');

    /* Sem candidato, dois candidatos ou sem histórico: só "Entendi", nunca botão que dá erro. */
    for (const [historicoTeste, frase] of [
      [[], /Não achei um lançamento igual/],
      [[lancamento, { ...lancamento, id: 't2' }], /mais de um lançamento igual/],
      [null, /Histórico indisponível/],
    ]) {
      r = await lista(estorno(), { historico: historicoTeste });
      ({ arvore } = cartaoDoEstorno(r.card));
      assert.deepEqual(rotulos(arvore), ['Entendi']);
      assert.match(texto(arvore), frase);
    }
    r.card().props.aoDescartar(); await r.ctx.settle();
    assert.equal(chamadas.filter((c) => c[0] === 'apagar' || c[0] === 'gravar').length, 0);
    ok('sem candidato, com dois ou sem histórico: explica em uma frase e só oferece Entendi');

    /* Recibo: na janela de conferência e, sem pendência, em janela flutuante pequena (regra do autor, 07/11/2026: nada de bloco na Início). */
    preparar([
      aviso('Compra de R$ 25,00 aprovada em Loja Modelo no cartão final 4321'),
      { ...aviso('Estorno de R$ 25,00 em Loja Modelo no cartão final 4321', 'Estorno'), quando: Date.now() + 60000 },
    ]);
    janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
    assert.equal(listaAberta(janela), false, 'o recibo sozinho não abre a janela de conferência');
    assert.equal(elementos(janela.tree).some((e) => e.type === telas.RecibosDeEstorno), false, 'nenhum bloco de recibo na Início');
    const reciboJanela = elementos(janela.tree).find((e) => e.type === telas.ReciboEmJanela);
    assert.ok(reciboJanela && reciboJanela.props.recibos.length === 1, 'o recibo vira janela');
    const jr = montar(telas.ReciboEmJanela, reciboJanela.props); await jr.settle();
    const modalRecibo = elementos(jr.tree).find((e) => e.type === './AppModal');
    assert.ok(modalRecibo && modalRecibo.props.visible === true && modalRecibo.props.transparent, 'abre como janela');
    assert.ok(elementos(jr.tree).some((e) => e.type === './Sheet' && e.props.centered), 'Sheet centralizada');
    modalRecibo.props.onRequestClose(); elementos(jr.tree).find((e) => e.type === './Sheet').props.onClose();
    await jr.settle();
    assert.equal(elementos(jr.tree).find((e) => e.type === './AppModal').props.visible, true, 'Voltar e tocar fora não fecham');
    assert.match(texto(jr.tree), /Compra de R\$.*Loja Modelo foi estornada\. Tirei as duas da.lista\./);
    assert.ok(elementos(jr.tree).some((e) => e.props.accessibilityLiveRegion === 'polite' && /estornada/.test(texto(e))), 'leitor de tela anuncia');
    // Expande o PrivacyValue REAL: o texto e o anúncio reais não sobrevivem ao modo oculto.
    const PrivacyValue = carregar('components/PrivacyValue.tsx').default;
    function expandir(no) {
      if (Array.isArray(no)) return no.map(expandir);
      if (!no || typeof no !== 'object') return no;
      if (no.type === PrivacyValue) return expandir(PrivacyValue(no.props));
      return { ...no, props: { ...no.props, children: expandir(no.props?.children) } };
    }
    privacidadeOculta = true;
    const oculto = expandir(jr.tree);
    assert.doesNotMatch(texto(oculto), /25,00|Loja Modelo/);
    assert.ok(elementos(oculto).some(n => n.props.accessibilityLabel === 'Valor oculto'));
    assert.equal(elementos(oculto).some(n => n.props.accessibilityLiveRegion && /25,00|Loja Modelo/.test(texto(n))), false);
    privacidadeOculta = false;
    assert.match(texto(expandir(jr.tree)), /25,00.*Loja Modelo/);
    // Nunca por cima de outra janela: espera ela fechar.
    const liberar = janelas.registrarJanelaAberta();
    const bloqueada = montar(telas.ReciboEmJanela, reciboJanela.props); await bloqueada.settle();
    assert.equal(elementos(bloqueada.tree).find((e) => e.type === './AppModal').props.visible, false, 'com outra janela aberta, o recibo espera');
    liberar(); await bloqueada.settle(); await bloqueada.settle();
    assert.equal(elementos(bloqueada.tree).find((e) => e.type === './AppModal').props.visible, true, 'a outra fechou: o recibo abre');
    // Entendi dispensa o recibo.
    elementos(jr.tree).find((n) => n.props.rotulo === 'Entendi' && n.props.onPress).props.onPress();
    await janela.settle(); await janela.settle();
    assert.equal(elementos(janela.tree).find((e) => e.type === telas.ReciboEmJanela)?.props.recibos.length ?? 0, 0);
    assert.equal((await caixa.recibosDaCaixa('dono')).length, 0, 'Entendi tira o recibo do disco');
    ok('recibo do descarte automático abre em janela, é anunciado, espera outra janela e sai com Entendi');

    preparar([
      aviso('Compra de R$ 25,00 aprovada em Loja Modelo no cartão final 4321'),
      { ...aviso('Estorno de R$ 25,00 em Loja Modelo no cartão final 4321', 'Estorno'), quando: Date.now() + 60000 },
      { ...aviso('Compra no débito de R$ 35,00 em Mercado Modelo'), quando: Date.now() + 120000 },
    ]);
    janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
    const propsLista = elementos(janela.tree).find((e) => e.type === telas.ListaAConferir).props;
    assert.equal(propsLista.recibos.length, 1, 'com pendência, o recibo vai para a janela');
    const dentro = montar(telas.ListaAConferir, { ...propsLista, aoMudar() {} }); await dentro.settle();
    assert.ok(elementos(dentro.tree).some((e) => e.type === telas.RecibosDeEstorno && e.props.recibos.length === 1));
    ok('com item pendente, o recibo aparece dentro da janela');
  }

  /* "Revisar depois" (decisão do autor, 07/11/2026): adia sem gravar nem descartar. A janela abre sozinha UMA vez; depois só o sininho a abre. */
  {
    const appState = stub['react-native'].AppState;
    const adicionarOriginal = appState.addEventListener;
    const ouvintes = [];
    appState.addEventListener = (evento, fn) => { ouvintes.push(fn); return { remove() {} }; };
    const conferencia = carregar('lib/avisos-banco/conferencia-aberta.ts');
    try {
      preparar([aviso('Compra no débito de R$ 41,00 em Mercado Modelo')]);
      await caixa.sincronizarCaixa('dono');
      let adiou = 0;
      const sozinha = montar(telas.ListaAConferir, { dono: 'dono', aoAdiar: () => { adiou++; }, aoMudar() {} }); await sozinha.settle();
      const revisar = elementos(sozinha.tree).find((e) => e.props.onPress && texto(e) === 'Revisar depois');
      assert.ok(revisar, 'Revisar depois visível');
      assert.equal(revisar.type, './AppPressable', 'componente do design system');
      assert.match(revisar.props.accessibilityHint, /voltar/);
      revisar.props.onPress();
      assert.equal(adiou, 1);

      /* Primeira vez: abre sozinha, e a pergunta da sobra espera por ela. */
      janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
      assert.equal(listaAberta(janela), true, 'primeira vez abre sozinha');
      assert.equal(conferencia.avisosNaFrenteAgora(), true, 'aberta: a pergunta da sobra espera');
      elementos(janela.tree).find((e) => e.type === telas.ListaAConferir).props.aoAdiar();
      await janela.settle(); await janela.settle();
      assert.equal(listaAberta(janela), false, 'adiada, a janela fecha');
      assert.equal(disco.get('grana_avisos_janela_fechada:dono'), '1', 'a marca fica gravada por dono');
      assert.equal((await caixa.listarCaixa('dono')).length, 1, 'nada descartado');
      assert.equal(chamadas.filter((c) => c[0] === 'gravar' || c[0] === 'apagar').length, 0, 'nada gravado');
      assert.equal(conferencia.avisosNaFrenteAgora(), false, 'fechada de vez: a pergunta da sobra não espera mais');
      /* Os 15 s de releitura e a volta do app ao primeiro plano não reabrem. */
      await janela.settle(); await janela.settle();
      assert.equal(listaAberta(janela), false);
      ouvintes.at(-1)('active'); await janela.settle(); await janela.settle();
      assert.equal(listaAberta(janela), false, 'a volta do app não reabre');
      /* App aberto do zero também não. */
      const nova = montar(telas.default, { dono: 'dono' }); await nova.settle(); await nova.settle();
      assert.equal(listaAberta(nova), false, 'nova montagem não reabre sozinha');
      assert.equal(conferencia.pendentesAgora(), 1, 'a contagem do sininho continua');
      /* O sininho reabre. */
      conferencia.pedirConferencia(); for (let i = 0; i < 3; i++) await nova.settle();
      assert.equal(listaAberta(nova), true, 'o sininho abre a qualquer momento');
      /* Fechar uma janela aberta pelo sininho não muda nada: continua só pelo sininho. */
      elementos(nova.tree).find((e) => e.type === telas.ListaAConferir).props.aoAdiar();
      await nova.settle(); await nova.settle();
      assert.equal(listaAberta(nova), false);
      nova.unmount(); janela.unmount();
      ok('janela abre sozinha só na primeira vez; depois de fechada nem a volta do app nem nova montagem a reabrem, só o sininho');

      /* Resolvido o último item, item novo não reabre sozinho. */
      preparar([aviso('Compra no débito de R$ 42,00 em Mercado Modelo')]);
      const resolvida = montar(telas.default, { dono: 'dono' }); await resolvida.settle(); await resolvida.settle();
      assert.equal(listaAberta(resolvida), true);
      elementos(resolvida.tree).find((e) => e.type === telas.ListaAConferir).props.aoMudar([]);
      await resolvida.settle(); await resolvida.settle();
      assert.equal(listaAberta(resolvida), false);
      assert.equal(disco.get('grana_avisos_janela_fechada:dono'), '1', 'resolver o último item também grava a marca');
      diario = [aviso('Compra no débito de R$ 43,00 em Mercado Modelo')];
      await [...intervalos].at(-1)(); await resolvida.settle(); await resolvida.settle();
      assert.equal(listaAberta(resolvida), false, 'item novo não reabre sozinho');
      assert.equal(conferencia.avisosNaFrenteAgora(), false);
      resolvida.unmount();
      ok('depois de resolver o último item, item novo só avisa o sininho e não reabre a janela');

      /* A marca é por dono. */
      preparar([aviso('Compra no débito de R$ 44,00 em Mercado Modelo')]);
      disco.set('grana_avisos_janela_fechada:dono', '1');
      const outraConta = montar(telas.default, { dono: 'outra-conta' }); await outraConta.settle(); await outraConta.settle();
      assert.equal(listaAberta(outraConta), true, 'outra conta ainda abre na primeira vez');
      outraConta.unmount();
      const mesmaConta = montar(telas.default, { dono: 'dono' }); await mesmaConta.settle(); await mesmaConta.settle();
      assert.equal(listaAberta(mesmaConta), false, 'a conta já marcada não abre');
      mesmaConta.unmount();
      ok('a marca de janela já fechada é por dono');

      /* Leitura da marca falhando: não abre sozinha, o sininho funciona, avisa no console. */
      preparar([aviso('Compra no débito de R$ 45,00 em Mercado Modelo')]);
      avisosDoConsole = []; falhaMarca = { ler: true, gravar: false };
      const semMarca = montar(telas.default, { dono: 'dono' }); await semMarca.settle(); await semMarca.settle();
      assert.equal(listaAberta(semMarca), false, 'sem conseguir ler a marca, não abre sozinha');
      assert.ok(avisosDoConsole.some((a) => /marca da janela não foi lida/.test(a[0])), 'registra o aviso');
      assert.equal(conferencia.avisosNaFrenteAgora(), false);
      conferencia.pedirConferencia(); for (let i = 0; i < 3; i++) await semMarca.settle();
      assert.equal(listaAberta(semMarca), true, 'o sininho segue funcionando');
      semMarca.unmount();
      /* Gravação falhando: a marca fica em memória na sessão e o aviso aparece. */
      preparar([aviso('Compra no débito de R$ 46,00 em Mercado Modelo')]);
      avisosDoConsole = []; falhaMarca = { ler: false, gravar: true };
      const semGravar = montar(telas.default, { dono: 'dono' }); await semGravar.settle(); await semGravar.settle();
      assert.equal(listaAberta(semGravar), true);
      elementos(semGravar.tree).find((e) => e.type === telas.ListaAConferir).props.aoAdiar();
      await semGravar.settle(); await semGravar.settle();
      assert.equal(listaAberta(semGravar), false);
      assert.ok(avisosDoConsole.some((a) => /marca da janela não gravou/.test(a[0])), 'registra a falha de gravação');
      await [...intervalos].at(-1)(); await semGravar.settle(); await semGravar.settle();
      assert.equal(listaAberta(semGravar), false, 'a marca em memória segura a sessão');
      semGravar.unmount();
      ok('marca ilegível não abre sozinha e registra; marca que não grava vale na sessão e registra');
    } finally {
      falhaMarca = { ler: false, gravar: false };
      appState.addEventListener = adicionarOriginal;
    }
  }

  /* Atalho no cabeçalho da Início e item do último dia (07/11/2026). */
  {
    const AtalhoDeAvisos = carregar('components/AtalhoDeAvisos.tsx').default;
    const conferencia = carregar('lib/avisos-banco/conferencia-aberta.ts');
    conferencia.publicarPendentes(0);
    const atalho = montar(AtalhoDeAvisos, {}); atalho.render();
    assert.equal(atalho.tree, null, 'sem pendência o atalho some');

    preparar([aviso('Compra no débito de R$ 52,00 em Mercado Modelo')]);
    janela = montar(telas.default, { dono: 'dono' }); await janela.settle(); await janela.settle();
    atalho.render();
    assert.equal(atalho.tree.type, './HeaderAction', 'mesmo componente do botão do olho');
    assert.equal(atalho.tree.props.label, '1');
    assert.equal(atalho.tree.props.destaque, true, 'com pendência o sininho fica em menta');
    assert.equal(atalho.tree.props.accessibilityLabel, '1 lançamento para conferir');
    assert.equal(atalho.tree.props.icon, 'notifications-outline');
    assert.equal(conferencia.rotuloDoAtalho(3), '3 lançamentos para conferir');

    /* Depois do "Revisar depois" a janela fecha; o toque no atalho a abre de novo, sem descartar nada. */
    elementos(janela.tree).find((e) => e.type === telas.ListaAConferir).props.aoAdiar();
    await janela.settle(); await janela.settle();
    assert.equal(listaAberta(janela), false);
    atalho.render();
    assert.equal(atalho.tree.props.label, '1', 'adiada, a contagem continua');
    atalho.tree.props.onPress(); for (let i = 0; i < 4; i++) await janela.settle();
    assert.equal(listaAberta(janela), true, 'toque abre mesmo adiada');
    assert.equal((await caixa.listarCaixa('dono')).length, 1);
    assert.equal(chamadas.filter((c) => c[0] === 'gravar' || c[0] === 'apagar').length, 0);

    /* Com outra janela aberta o toque não abre por cima: espera. */
    elementos(janela.tree).find((e) => e.type === telas.ListaAConferir).props.aoAdiar();
    await janela.settle(); await janela.settle();
    const liberar = janelas.registrarJanelaAberta();
    atalho.tree.props.onPress(); for (let i = 0; i < 4; i++) await janela.settle();
    assert.equal(listaAberta(janela), false, 'outra janela aberta: não abre por cima');
    liberar(); for (let i = 0; i < 3; i++) await janela.settle();
    assert.equal(listaAberta(janela), true, 'abre quando a outra fecha');

    /* Resolvido o último item, o atalho some. */
    elementos(janela.tree).find((e) => e.type === telas.ListaAConferir).props.aoMudar([]);
    await janela.settle(); atalho.render();
    assert.equal(atalho.tree, null);
    /* HeaderAction REAL: sem `destaque` fica igual ao de hoje; com ele, só acrescenta o par menta do botão principal da janela. */
    const HeaderAction = carregar('components/HeaderAction.tsx').default;
    const estilosDe = (props, hovered = false) => elementos(HeaderAction(props)).find((e) => e.type === './AppPressable').props.style({ hovered }).filter(Boolean);
    const normal = estilosDe({ icon: 'eye-outline', label: '2', onPress() {} });
    const comMenta = estilosDe({ icon: 'eye-outline', label: '2', onPress() {}, destaque: true });
    assert.equal(normal.length, 2, 'sem destaque: só base e rótulo, como antes');
    assert.equal(comMenta.length, 3, 'com destaque: um estilo a mais');
    assert.equal(comMenta[0], normal[0], 'mesma base (tamanho, padding, raio)');
    assert.equal(comMenta[1], normal[1], 'mesmo padding de rótulo');
    assert.equal(estilosDe({ icon: 'eye-outline', onPress() {} }).length, 2, 'só ícone sem destaque não muda');
    assert.equal(estilosDe({ icon: 'eye-outline', label: '2', onPress() {}, destaque: true }, true).length, 4, 'hover continua visível no destaque');
    const fonteHeader = fs.readFileSync(path.join(root, 'components/HeaderAction.tsx'), 'utf8');
    const fonteAvisos = fs.readFileSync(path.join(root, 'components/AvisosAConferir.tsx'), 'utf8');
    assert.match(fonteHeader, /destaque: \{ backgroundColor: theme\.accent2, borderColor: theme\.accent2 \}/);
    assert.match(fonteHeader, /textoDestaque: \{ color: theme\.paper \}/);
    assert.match(fonteAvisos, /botaoDestaque: \{ backgroundColor: theme\.accent2, borderColor: theme\.accent2 \}/, 'mesmo par do Confirmar');
    assert.match(fonteAvisos, /botaoTextoDestaque: \{ color: theme\.paper \}/);
    ok('atalho do cabeçalho: contagem da própria janela, abre mesmo depois de fechada, em menta, não abre por cima de outra janela e some sem pendência');
  }

  {
    const DIA = 24 * 60 * 60 * 1000;
    /* Aviso de 29,5 dias atrás: está no último dia da validade. */
    const velho = { ...aviso('Compra no débito de R$ 53,00 em Mercado Modelo'), quando: Date.now() - 29.5 * DIA };
    const fresco = { ...aviso('Compra no débito de R$ 54,00 em Mercado Modelo'), quando: Date.now() - 2 * DIA };
    ({ ctx } = await lista([velho, fresco]));
    const cartoes = elementos(ctx.tree).filter((e) => e.type === telas.CartaoDoAviso);
    const textos = cartoes.map((c) => texto(telas.CartaoDoAviso(c.props)));
    const doVelho = textos.find((t) => /53,00/.test(t)), doFresco = textos.find((t) => /54,00/.test(t));
    assert.match(doVelho, /Vence hoje/);
    assert.doesNotMatch(doFresco, /Vence hoje/);
    elementos(ctx.tree).filter(e => e.props.onLayout).forEach(e => e.props.onLayout());
    const guardados = await caixa.listarCaixa('dono');
    assert.equal(guardados.find((i) => i.valor === 53).vencimentoVisto, true, 'a janela registrou que mostrou a marca');
    assert.equal(guardados.find((i) => i.valor === 54).vencimentoVisto, undefined);
    /* Visto e vencido: a próxima leitura o tira; o fresco fica. */
    diario = [fresco]; // o diário real só guarda 7 dias: o aviso de 29 dias já saiu dele
    const depois = await caixa.sincronizarCaixa('dono', Date.now() + 2 * DIA);
    assert.equal(depois.itens.map((i) => i.valor).join(","), "54");
    assert.equal(chamadas.filter((c) => c[0] === 'gravar' || c[0] === 'apagar').length, 0);
    ok('janela mostra "Vence hoje" no último dia, registra que mostrou e só então a validade tira o item');
  }

  {
    /* Build 31, 07/11/2026 (707ade87): a janela-mãe passava `aoMudar` como função
       nova a cada desenho. A lista recarrega quando `aoMudar` muda, avisa a mãe,
       a mãe redesenha e o ciclo não parava: JS do aparelho em 100%, o disco
       congestionado e o app inteiro sem carregar. Aqui mãe e lista rodam juntas,
       como no React: cada desenho da mãe entrega props novas à MESMA lista. */
    preparar([aviso('Compra no débito de R$ 55,00 em Mercado Modelo')]);
    const mae = montar(telas.default, { dono: 'dono' }); await mae.settle(); await mae.settle();
    const daLista = () => elementos(mae.tree).find((e) => e.type === telas.ListaAConferir);
    assert.ok(daLista(), 'a janela abriu');
    leiturasDoHistorico = 0;
    const filha = montar(telas.ListaAConferir, daLista().props);
    for (let ciclo = 0; ciclo < 6; ciclo++) {
      await filha.settle(); // a lista termina de ler e chama aoMudar: a mãe guarda a lista nova
      mae.render(); // a mãe redesenha
      filha.render(daLista().props); // e entrega as props do novo desenho à mesma lista
    }
    await filha.settle();
    assert.equal(leiturasDoHistorico, 1, `a lista releu o histórico ${leiturasDoHistorico} vezes: laço de recarga`);
    ok('janela aberta pela mãe carrega uma vez só, sem laço de recarga quando a mãe redesenha (build 31)');
  }

  console.log(`\n${checagens} grupos de verificação passaram. Sem rede ou aparelho.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
