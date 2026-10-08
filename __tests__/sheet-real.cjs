// TransactionSheet real com hooks próprios: a árvore do filho não compartilha
// os slots de estado do modal que o chama. Só plataforma e transporte são dublês.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
module.exports = function sheetReal(imports, DateImpl = Date) {
  const cells = [];
  let cursor = 0;
  const react = {
    useState(initial) { const k = cursor++; if (!(k in cells)) cells[k] = typeof initial === 'function' ? initial() : initial; return [cells[k], (v) => { cells[k] = typeof v === 'function' ? v(cells[k]) : v; }]; },
    useMemo: (fn) => fn(),
    useEffect(fn, deps) { const k = cursor++; const old = cells[k]; if (!old || !deps || deps.some((v, i) => v !== old[i])) { cells[k] = deps; fn(); } },
  };
  const mocked = { ...imports, react, './AppModal': imports['./AppModal'], './ToggleSwitch': 'ToggleSwitch',
    '@/components/AppPressable': imports['./AppPressable'], '@/components/Sheet': imports['./Sheet'],
    '@/components/DatePickerModal': 'DatePickerModal', '@/components/CategoryPickerModal': 'CategoryPickerModal',
    '@/components/LinhaDataDaCompra': { dataEscolhidaNoSeletor: (iso, today) => iso > today ? today : iso },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/TransactionSheet.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Date: DateImpl, console, require: (id) => { if (!(id in mocked)) throw Error('Sheet import: ' + id); return mocked[id]; } });
  return { __esModule: true, default: (props) => { cursor = 0; return exports.default(props); }, reset: () => { cells.length = 0; } };
};
