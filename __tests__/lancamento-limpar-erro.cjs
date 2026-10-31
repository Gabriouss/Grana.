// Executa o TransactionSheet real; só plataforma e componentes filhos são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const cache = {};
function lib(name) {
  if (cache[name]) return cache[name];
  const exports = cache[name] = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, Date, console, require: (id) => lib(id.replace('./', '')) });
  return exports;
}
const imports = {
  'react/jsx-runtime': { Fragment: 'Fragment', jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': { ActivityIndicator: 'ActivityIndicator', Text: 'Text', TextInput: 'TextInput', View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s } },
  './AppModal': 'AppModal', './AppPressable': 'AppPressable', './Sheet': 'Sheet', '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, hitSlopPara: () => 0, lh: () => 0 },
  '@/lib/format': lib('format'), '@/lib/limits': lib('limits'), '@/lib/heuristics': lib('heuristics'),
};
function nodes(root) {
  if (!root || typeof root !== 'object') return [];
  if (Array.isArray(root)) return root.flatMap(nodes);
  return [root, ...nodes(root.props?.children)];
}
let failed = 0;
for (const escolha of ['categoria', 'cartao', 'carteira', 'hoje', 'ontem', 'calendario']) {
  try {
    const writes = [];
    const sheet = require('./sheet-real.cjs')(imports);
    const inicial = { type: 'out', description: 'Compra exemplo', amount: '25,00', category: 'Outros', color: '#fff', occurred_on: '2026-10-01', recurring: false, installments: 1, card_id: 'c', wallet_id: 'p' };
    if (escolha === 'categoria') inicial.category = '';
    if (escolha === 'cartao') inicial.card_id = null;
    if (escolha === 'carteira') inicial.wallet_id = '';
    if (['hoje', 'ontem', 'calendario'].includes(escolha)) inicial.occurred_on = '';
    const props = { visible: true, onClose() {}, modo: escolha === 'cartao' ? 'credito' : 'carteira', editando: false, salvando: false, inicial,
      semCarteiraPadrao: escolha === 'carteira',
      carteiras: [{ id: 'p', name: 'Pessoal', is_default: true, color: '#fff' }],
      cartoes: [{ id: 'c', name: 'Principal', wallet_id: 'p', color: '#fff' }],
      onSalvar: (value) => writes.push(value) };
    const render = () => nodes(sheet.default(props));
    render();
    const find = (predicate) => { const n = render().find(predicate); assert.ok(n, 'controle existe'); return n; };
    const press = (label) => find((n) => n.props?.accessibilityLabel === label).props.onPress();
    const salvar = () => find((n) => n.type === 'AppPressable' && nodes(n).some((c) => c.type === 'Text' && c.props.children === (props.modo === 'credito' ? 'Salvar compra' : 'Salvar lançamento'))).props.onPress();
    const erros = () => render().filter((n) => n.props?.role === 'alert');
    salvar();
    assert.equal(erros().length, 1, 'campo ausente exibe erro');
    assert.equal(writes.length, 0, 'validação impede onSalvar');
    if (escolha === 'categoria') {
      press('Categoria: não escolhida');
      assert.equal(erros().length, 1, 'só abrir o seletor não limpa');
      find((n) => n.type === 'CategoryPickerModal').props.onSelectCategory({ name: 'Outros', color: '#fff' });
    } else if (escolha === 'cartao') press('Cartão Principal');
    else if (escolha === 'carteira') press('Carteira Pessoal');
    else if (escolha === 'calendario') {
      find((n) => n.type === 'DatePickerModal').props.onSelectDate('2026-10-20');
    } else press(`Data: ${escolha}`);
    assert.equal(erros().length, 0, 'escolher limpa a mensagem anterior imediatamente');
    assert.equal(writes.length, 0, 'escolher não salva');
    salvar();
    assert.equal(writes.length, 1, 'próximo Salvar aceita o campo corrigido uma vez');
    assert.equal(writes[0].category, 'Outros');
    assert.equal(writes[0].wallet_id, 'p');
    assert.ok(writes[0].occurred_on);
    // Limpar uma mensagem não pode desativar a validação seguinte.
    find((n) => n.type === 'TextInput' && n.props.value === '25,00').props.onChangeText('');
    salvar();
    assert.equal(erros().length, 1, 'valor vazio ainda é recusado');
    assert.equal(writes.length, 1, 'recusa não chama onSalvar outra vez');
    console.log(`ok ${escolha}`);
  } catch (error) { failed++; console.error(`FALHOU ${escolha}: ${error.message}`); }
}
if (failed) process.exitCode = 1;
