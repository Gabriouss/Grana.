'use strict';
// Componentes completos reais; somente hooks, apresentacao e fronteiras I/O simulados.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const jsx = (type, props) => ({ type, props });
const defaultExport = name => ({ __esModule: true, default: name });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(tree) { return nodes(tree).flatMap(n => [n.props?.children].flat(Infinity).filter(x => typeof x === 'string')).join(' '); }
function runtime(file, options = {}) {
  const slots = [], effects = [], calls = [], logs = [], routes = [], alerts = [], focuses = [];
  let cursor = 0, tree;
  const compile = (rel, mocks) => {
    const source = process.env.AUTH_UI_BASE && /^(app|components)\//.test(rel)
      ? cp.execFileSync('git', ['show', `${process.env.AUTH_UI_BASE}:${rel}`], { cwd: root, encoding: 'utf8', windowsHide: true })
      : fs.readFileSync(path.join(root, rel), 'utf8');
    const exports = {};
    vm.runInNewContext(ts.transpileModule(source, { fileName: rel, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { exports, require(id) {
      if (!(id in mocks)) throw Error(`Fronteira nao simulada: ${id}`);
      return mocks[id];
    }, console: { warn: (...a) => logs.push(a), error: (...a) => logs.push(a) }, Error }, { filename: rel });
    return exports;
  };
  const method = (name, normal) => (...args) => { calls.push({ name, args }); return (options[name] ?? normal)(...args); };
  const session = {
    signIn: method('signIn', async () => ({ error: null })),
    signUp: method('signUp', async () => ({ error: null, needsEmailConfirmation: false })),
    recuperarSenha: method('recuperarSenha', async () => ({ error: null })),
    signOut: method('signOut', async () => {}),
  };
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++; if (!(i in slots) || deps.some((v, j) => v !== slots[i][j])) { slots[i] = deps; effects.push(fn); } },
  };
  const mock = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'ScrollView', 'Text', 'TextInput', 'View', 'Modal'].map(n => [n, n])),
    'expo-router': { useRouter: () => ({ push: r => routes.push(r), replace: r => routes.push(r) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons/Ionicons': defaultExport('Icon'),
    '@/lib/auth-context': { useSession: () => session },
    '@/lib/envio-unico': compile('lib/envio-unico.ts', {}),
    '@/lib/limits': compile('lib/limits.ts', {}),
    '@/lib/breakpoints': { colunaFormulario: {} },
    '@/lib/pwned': {
      checarSenhaVazada: method('checarSenhaVazada', async () => ({ status: 'segura' })),
      mensagemSenhaVazada: vezes => `Senha vazada (${vezes}).`,
    },
    '@/lib/theme': { theme: {}, spacing: {}, radius: {}, fonts: {}, type: {}, lh: () => 20, hitSlopPara: () => 0 },
    '@/lib/alerta': { Alert: { alert: (...a) => alerts.push(a) } },
    '@/lib/data': {
      reauthenticate: method('reauthenticate', async () => ({ ok: true })),
      deleteUserAccount: method('deleteUserAccount', async () => ({ completo: true })),
    },
    '@/lib/teclado': { useKeyboardHeight: () => 0 },
    '@/lib/modal-accessibility': { useModalAccessibility: () => {} },
    '@/lib/motion': { useReducedMotion: () => true },
    '@/lib/erros': compile('lib/erros.ts', { './offline-cache': { isLikelyNetworkError: () => false } }),
  };
  mock['react-native'].Platform = { OS: 'android' };
  mock['react-native'].StyleSheet = { create: x => x };
  for (const name of ['AppPressable', 'BrandLogotype', 'PasswordInput', 'TextoComLinks', 'RecuperarSenhaModal', 'AppModal', 'Sheet']) {
    mock[`@/components/${name}`] = mock[`./${name}`] = defaultExport(name);
  }
  const Component = compile(file, mock).default;
  const props = file.startsWith('components/') ? { visible: true, onClose: () => calls.push({ name: 'onClose', args: [] }) } : {};
  function render() {
    cursor = 0; effects.length = 0; tree = Component(props);
    for (const n of nodes(tree)) if (n.props?.ref) n.props.ref.current = { focus: () => focuses.push(n.props.accessibilityLabel ?? n.type) };
    effects.splice(0).forEach(f => f());
    return tree;
  }
  function field(label, value) {
    const n = nodes(tree).find(x => x.props?.accessibilityLabel === label || x.props?.placeholder === label);
    if (!n?.props?.onChangeText) throw Error(`Campo ausente: ${label}`);
    n.props.onChangeText(value); render();
  }
  const submit = () => nodes(tree).find(x => x.type === 'AppPressable' && typeof x.props.disabled === 'boolean' && x.props.accessibilityLabel !== 'Fechar');
  render();
  return { render, field, calls, logs, routes, alerts, focuses, slots,
    get tree() { return tree; }, get text() { return text(tree); },
    get busy() { return nodes(tree).some(n => n.type === 'ActivityIndicator'); },
    submit, send: () => submit().props.onPress(), count: name => calls.filter(c => c.name === name).length,
    acceptTerms() { nodes(tree).find(n => n.props?.accessibilityRole === 'checkbox').props.onPress(); render(); },
    keyboard() { return nodes(tree).find(n => n.props?.onSubmitEditing && n.props.returnKeyType === 'go').props.onSubmitEditing(); },
  };
}
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
module.exports = { runtime, nodes, pending, flush };
