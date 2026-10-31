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
  '@react-native-async-storage/async-storage': { getItem: async (k) => disco.get(k) ?? null,
    setItem: async (k, v) => { disco.set(k, v); }, removeItem: async (k) => { disco.delete(k); } },
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
  vm.runInNewContext(resultado.outputText, { exports, console: { error() {} },
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
const carteira = { id: 'w', is_default: true, name: 'Principal' };
let sequencia = 0;
const aviso = (texto, titulo = 'Compra aprovada') => ({ id: (++sequencia).toString(16).padEnd(64, '0'),
  pacote: 'com.nu.production', chave: `k${sequencia}`, quando: Date.now(), titulo, texto });
const telas = carregar('components/AvisosAConferir.tsx');
const perfil = carregar('components/AvisosBancoSecao.tsx');
const caixa = carregar('lib/avisos-banco/caixa.ts');
async function lista(avisoTeste, opcoes = {}) {
  disco.clear(); chamadas = []; alertas = []; erroGravacao = false; erroDiario = false;
  diario = Array.isArray(avisoTeste) ? avisoTeste : [avisoTeste]; historico = opcoes.historico ?? [];
  dadosLocais = { carteiras: [carteira], cartoes: [{ id: 'c', last_digits: '1234', wallet_id: 'w', bank: 'nubank' }],
    categorias: [], 'apelidos-categoria': [{ chave: 'mercado modelo', valor: 'Alimentação' }],
    'boletos:todos': opcoes.contas ?? [] };
  await caixa.sincronizarCaixa('dono');
  const ctx = montar(telas.ListaAConferir, { dono: 'dono', aoFechar() {}, aoMudar() {}, nomeDoPerfil: 'Pessoa Modelo' });
  await ctx.settle();
  const card = () => elementos(ctx.tree).find((e) => e.type === telas.CartaoDoAviso);
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
  console.log(`\n${checagens} grupos de verificação passaram. Sem rede ou aparelho.`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
