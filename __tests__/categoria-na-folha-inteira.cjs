/* S10 (22 a 24/09/2026): na folha Nova saída, "Alimentação" aparecia como
   "Alimentaçã", com espaço sobrando à esquerda. Medido no emulador: o
   TextView do nome tinha a largura exata do texto e uma linha de altura; o
   Android mandava a última letra para uma segunda linha, que a altura cortava.

   A correção dá ao nome toda a sobra da linha, alinhado à direita, com o ponto
   de cor dentro do mesmo texto. Este teste executa o TransactionSheet real e
   trava essa estrutura: se a caixa do nome voltar a ter a largura do próprio
   texto, ou se a linha voltar a quebrar e empurrar o valor, ele falha. */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const jsx = (type, props) => ({ type, props: props ?? {} });
const es = (v) => ({ __esModule: true, default: v });
const react = {
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useMemo: (fn) => fn(),
  useEffect: () => {},
};
const modulo = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/TransactionSheet.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: modulo, console, require: (name) => {
  const mods = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s },
      Text: 'Text', TextInput: 'TextInput', View: 'View',
    },
    './AppModal': es('AppModal'),
    './ToggleSwitch': es('ToggleSwitch'),
    '@expo/vector-icons/Ionicons': es('Ionicons'),
    '@/components/AppPressable': es('AppPressable'),
    '@/components/Sheet': es('Sheet'),
    '@/components/DatePickerModal': es('DatePickerModal'),
    '@/components/CategoryPickerModal': es('CategoryPickerModal'),
    '@/lib/format': {
      formatDateLabel: () => '24 set 2026', formatMoney: (v) => String(v), formatMoneyInput: (v) => v,
      parseAmount: () => 0, todayISO: () => '2026-09-24',
    },
    '@/lib/limits': { LIMITS: new Proxy({}, { get: () => 100 }) },
    '@/lib/theme': {
      theme: new Proxy({}, { get: (_, k) => String(k) }), radius: {}, fonts: {}, touchTarget: 48,
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, type: new Proxy({}, { get: () => 14 }),
    },
  };
  assert.ok(name in mods, `import inesperado: ${name}`);
  return mods[name];
} });
const TransactionSheet = modulo.default;

function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no;
  yield* nos(no.props?.children);
}
const achatar = (estilo) => Object.assign({}, ...[].concat(estilo).flat(Infinity).filter(Boolean));

for (const nome of ['Alimentação', 'Educação e desenvolvimento profissional']) {
  const arvore = TransactionSheet({
    visible: true, onClose: () => {}, modo: 'carteira', editando: false, salvando: false, onSalvar: () => {},
    carteiras: [{ id: 'w1', name: 'Principal', is_default: true }],
    inicial: {
      type: 'out', description: '', amount: '', category: nome, color: '#bb6b60', occurred_on: '2026-09-24',
      recurring: false, installments: 1, card_id: null, wallet_id: 'w1',
    },
  });
  const linha = [...nos(arvore)].find((n) => n.props?.accessibilityLabel === `Categoria: ${nome}`);
  assert.ok(linha, 'linha da categoria');
  const estiloLinha = achatar(linha.props.style);
  assert.equal(estiloLinha.flexWrap, 'nowrap', 'o valor não pode descer para outra linha e virar caixa do tamanho do texto');

  const [rotulo, valor] = [].concat(linha.props.children).filter((n) => n && typeof n === 'object');
  assert.equal(rotulo.props.children, 'Categoria');
  const estiloValor = achatar(valor.props.style);
  assert.equal(estiloValor.flex, 1, 'o valor ocupa toda a sobra da linha');
  assert.equal(estiloValor.minWidth, 0, 'e pode encolher, para nome longo quebrar dentro dela');

  const texto = [].concat(valor.props.children).find((n) => n?.type === 'Text');
  const estiloTexto = achatar(texto.props.style);
  assert.equal(estiloTexto.flexGrow, 1, 'a caixa do nome cresce além do próprio texto');
  assert.equal(estiloTexto.textAlign, 'right', 'nome curto fica colado à direita');
  assert.equal(texto.props.numberOfLines, undefined, 'nome longo quebra em vez de ser cortado');
  const partes = [].concat(texto.props.children);
  assert.equal(partes[0].type, 'Text', 'o ponto de cor vem dentro do mesmo texto');
  assert.equal(partes[0].props.style.color, '#bb6b60');
  assert.equal(partes.at(-1), nome, 'o nome entra inteiro');
  assert.equal([].concat(valor.props.children).at(-1).type, 'Ionicons', 'a seta fica depois do nome');
}
console.log('OK categoria na folha: o nome ganha a sobra da linha, à direita, e quebra em vez de cortar (S10).');
