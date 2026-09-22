const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real component handler, including modified-click behavior.
const source = fs.readFileSync('components/SideNav.tsx', 'utf8') + '\nexport { ItemBarra };';
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const exportsUnderTest = {};
vm.runInNewContext(code, { exports: exportsUnderTest, require(name) {
  if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (name === 'react-native') return { StyleSheet: { create: x => x } };
  if (name === '@/lib/theme') return { theme: {}, spacing: {}, radius: {}, type: {}, fonts: {} };
  return {};
} });
for (const extra of [{}, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
  const calls = [];
  const element = exportsUnderTest.ItemBarra({ item: { rota: 'credito', rotulo: 'Credito' }, ativo: false, mostrarRotulo: true, onPress: () => calls.push('navigate') });
  assert.equal(element.props.href, '/credito');
  element.props.onPress({ preventDefault: () => calls.push('prevent'), ...extra });
  assert.deepEqual(calls, Object.keys(extra).length ? [] : ['prevent', 'navigate']);
}
console.log('SideNav: clique comum navega uma vez; 5 cliques modificados preservam comportamento do navegador.');
