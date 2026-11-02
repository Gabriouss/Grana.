const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');
const filtro = carregar('lib/filtro-compras.ts');
const faturas = carregar('lib/creditoFaturas.ts');
let n = 0;
const check = (value, label) => { assert.ok(value, label); n++; };
const compras = [
  { id: 'a', description: 'Ônibus urbano', category: 'Transporte', color: 'cyan', type: 'out', amount: 80, card_id: 'cartao-a' },
  { id: 'b', description: 'Mercado', category: 'Alimentação', color: 'mint', type: 'out', amount: 120, card_id: 'cartao-b' },
  { id: 'c', description: '', category: 'Transporte', color: 'cyan', type: 'out', amount: 20, card_id: 'cartao-a' },
  { id: 'd', description: null, category: 'Transporte', color: 'cyan', type: 'in', amount: 10, card_id: 'cartao-a' },
];
const antes = JSON.stringify(compras);
const ids = linhas => [...linhas].map(t => t.id).join(',');
check(ids(filtro.filtrarCompras(compras, '', 'Transporte')) === 'a,c,d', 'categoria filtra as linhas reais');
check(ids(filtro.filtrarCompras(compras, ' ÔNIBUS ', null)) === 'a', 'busca ignora caixa e espaços nas pontas');
check(ids(filtro.filtrarCompras(compras, 'mercado', 'Alimentação')) === 'b', 'busca e categoria juntas');
check(ids(filtro.filtrarCompras(compras, 'mercado', 'Transporte')) === '', 'busca não passa por outra categoria');
check(filtro.casaComBusca(compras[2], 'transporte'), 'descrição vazia ainda permite buscar categoria');
check(!filtro.casaComBusca(compras[3], 'mercado'), 'descrição nula não quebra a busca');
check(filtro.casaComBusca({}, '   '), 'busca vazia aceita descrição ausente');
const opcoes = filtro.opcoesDeCategoria(compras);
check(JSON.stringify(opcoes) === JSON.stringify([['Alimentação', 'mint'], ['Transporte', 'cyan']]), 'opções únicas com cor e ordem pt-BR');
const selecaoGuardada = 'Transporte';
check(ids(filtro.filtrarCompras([compras[1]], '', selecaoGuardada)) === 'b', 'categoria ausente nesta fatura equivale a Todas');
check(ids(filtro.filtrarCompras(compras, '', selecaoGuardada)) === 'a,c,d', 'categoria volta quando a fatura reaparece');
check(filtro.filtrarCompras([], 'algo', null).length === 0, 'fatura vazia não inventa linha');
const visiveis = filtro.filtrarCompras(compras, '', 'Transporte');
check(faturas.somaDaFatura(visiveis) === 100, 'subtotal respeita somaDaFatura: estorno legado de entrada é ignorado');
check(faturas.somaDaFatura(compras) === 220, 'total da fatura inteira permanece 220');
const cartoes = [{ id: 'cartao-a', name: 'A', color: 'cyan' }, { id: 'cartao-b', name: 'B', color: 'mint' }];
const secoes = faturas.agruparLancamentosPorCartao(visiveis, cartoes);
check(secoes.length === 1 && secoes[0].cartao.id === 'cartao-a' && secoes[0].subtotal === 100, 'cartão sem compra visível some e subtotal usa lista visível');
check(JSON.stringify(compras) === antes && visiveis[0] === compras[0], 'filtro e agrupamento não alteram a lista original nem suas linhas');

const mostra = (o) => filtro.mostrarComprasFiltradas({ filtroAtivo: true, comprasVisiveis: 1, cartaoSelecionado: false, cartoesNaLista: 1, ...o });
check(!mostra({}), 'Total com um cartão só: o cabeçalho do cartão já mostra o número');
check(mostra({ cartoesNaLista: 2 }), 'Total com dois cartões na lista mostra o subtotal');
check(mostra({ cartaoSelecionado: true }), 'cartão selecionado mostra, pois o cabeçalho traz a fatura inteira');
check(!mostra({ cartaoSelecionado: true, comprasVisiveis: 0 }) && !mostra({ cartoesNaLista: 2, comprasVisiveis: 0 }), 'sem resultado não mostra R$ 0,00');
check(!mostra({ filtroAtivo: false, cartaoSelecionado: true, cartoesNaLista: 3 }), 'sem filtro não mostra');

// Contrato da tela real: busca filtra apenas seções, nunca total/pagamento.
const file = 'app/(app)/credito.tsx';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variaveis = new Map(); const atributos = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node)) variaveis.set(node.name.getText(ast), node.initializer?.getText(ast) ?? '');
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'SectionList') {
    for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr)) atributos.set(attr.name.getText(ast), attr.initializer);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
check(/somaDaFatura\(creditTransactions\)/.test(variaveis.get('totalInvoice')) && !/comprasVisiveis/.test(variaveis.get('totalInvoice')), 'totalInvoice continua sobre creditTransactions');
check(!/buscaCompra|categoriaCompra|comprasVisiveis/.test(variaveis.get('creditTransactions')), 'fatura original não recebe filtro de busca');
check(/comprasVisiveis/.test(variaveis.get('secoesDeLancamentos')) && !/creditTransactions/.test(variaveis.get('secoesDeLancamentos')), 'só as seções recebem comprasVisiveis');
check(/totalInvoice/.test(variaveis.get('invoiceSituacao')) && !/subtotalFiltrado/.test(variaveis.get('invoiceSituacao')), 'situação e pagamento usam o total completo');
check(atributos.get('keyboardShouldPersistTaps')?.text === 'handled', 'toques persistem com teclado aberto');
check(atributos.get('renderItem')?.expression?.getText(ast) === 'renderCompra' && /useCallback/.test(variaveis.get('renderCompra')), 'renderItem é estável');
check(ts.isJsxFragment(atributos.get('ListHeaderComponent')?.expression), 'cabeçalho continua elemento, preservando foco na digitação');

// Componentes extraídos reais: limpar busca e distinguir Todas do chip já ativo.
const jsx = (type, props) => ({ type, props });
function componente(arquivo) {
  const exports = {};
  const tokens = new Proxy({}, { get: () => 12 });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    exports, require(id) {
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react-native') return { View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', StyleSheet: { create: x => x } };
      if (id === '@/lib/theme') return { fonts: tokens, radius: tokens, spacing: tokens, theme: tokens, type: tokens, lh: x => x, hitSlopPara: () => 8 };
      if (id === './AppPressable') return { __esModule: true, default: 'AppPressable' };
      if (id === '@expo/vector-icons/Ionicons') return { __esModule: true, default: 'Icon' };
      throw new Error(id);
    },
  }); return exports.default;
}
function nodes(n) { return Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props?.children)] : []; }
const Campo = componente('components/CampoBusca.tsx');
let texto = 'mercado';
const campo = Campo({ value: texto, onChangeText: v => { texto = v; } });
nodes(campo).find(n => n.type === 'AppPressable').props.onPress();
check(texto === '', 'X limpa o campo real');
const Chips = componente('components/ChipsCategoria.tsx');
let selecionada, todas = 0;
const chips = Chips({ opcoes, selecionada: 'Transporte', onSelect: v => { selecionada = v; }, onTodas: () => { todas++; } });
const botoes = nodes(chips).filter(n => n.type === 'AppPressable');
botoes[0].props.onPress();
check(todas === 1 && selecionada === undefined, 'Todas mantém callback específico de Lançamentos');
botoes[2].props.onPress();
check(selecionada === null, 'chip ativo desmarca a categoria');
check(Chips({ opcoes: [], selecionada: null, onSelect: () => {} }) === null, 'sem categorias, nenhum chip');
const chipsCredito = Chips({ opcoes, selecionada: null, onSelect: () => {}, keyboardShouldPersistTaps: 'handled' });
check(nodes(chipsCredito).find(n => n.type === 'ScrollView').props.keyboardShouldPersistTaps === 'handled', 'fileira horizontal também entrega o toque ao chip com teclado aberto');
console.log(`credito-filtro-compras: ${n} verificações passaram`);
