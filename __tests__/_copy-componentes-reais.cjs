/* Copy dos componentes reais, com JSX/nativo inertes e formatacao real. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar } = require('./_carregar-ts.cjs');
function componente(arquivo, complemento = '') {
  const api = {};
  const jsx = (type, props) => ({ type, props });
  const inertes = new Set(['react', '@expo/vector-icons/Ionicons', '@/lib/haptics',
    './PrivacyValue', './AppPressable', './AppModal', '@/lib/modal-accessibility',
    './ExportPdfButton', '@/lib/motion', './SegmentedTabs']);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText + complemento, { exports: api, console, Date, require(id) {
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (id === 'react-native') return { Text: 'Text', View: 'View', StyleSheet: { create: s => s } };
    if (id === '@/lib/theme') return { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, card: {}, lh: () => 1 };
    if (id === '@/lib/format') return carregar('lib/format.ts');
    if (id === '@/lib/sem-viuva') return carregar('lib/sem-viuva.ts');
    if (inertes.has(id)) return {};
    throw new Error('Import de copy nao simulado: ' + id);
  } }, { filename: arquivo });
  return api;
}
function textos(no) {
  if (no == null || typeof no === 'boolean') return [];
  if (typeof no === 'string' || typeof no === 'number') return [String(no).replace(/\s+/g, ' ')];
  return Array.isArray(no) ? no.flatMap(textos) : textos(no.props?.children);
}
module.exports = { componente, textos };
