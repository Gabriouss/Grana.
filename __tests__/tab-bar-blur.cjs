// Executa os hooks reais do componente com relógio/AppState controlados.
// Não substitui validação do renderer nativo e da biometria no Android.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const slots = [];
let cursor = 0, dirty = false, effects = [], frameId = 0;
const frames = new Map();
let listener;
const lock = { pronto: true, bloqueado: false };
const platform = { OS: 'android' };
const react = {
  useState(initial) {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: initial };
    return [slots[index].value, value => {
      if (slots[index].value !== value) { slots[index].value = value; dirty = true; }
    }];
  },
  useEffect(fn, deps) {
    const index = cursor++;
    const old = slots[index];
    if (!old || deps.some((d, i) => !Object.is(d, old.deps[i]))) {
      slots[index] = { deps, cleanup: old?.cleanup };
      effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn(); });
    }
  },
};
const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, '../components/TabBarBlur.tsx'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, {
  exports: exportsObject,
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (name === 'react-native') return { Platform: platform, StyleSheet: { absoluteFill: {} }, AppState: {
      currentState: 'active', addEventListener: (_, callback) => {
        listener = callback; return { remove: () => { listener = null; } };
      },
    } };
    if (name === 'expo-blur') return { BlurView: 'NativeBlurView' };
    if (name === '@/lib/app-lock-context') return { useAppLock: () => lock };
    throw new Error(name);
  },
  requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
  cancelAnimationFrame(id) { frames.delete(id); },
});
let target = null;
let output;
function render() {
  do {
    dirty = false; cursor = 0;
    output = exportsObject.default({ target });
    const pending = effects; effects = []; pending.forEach(fn => fn());
  } while (dirty);
  return output;
}
function frame() {
  const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());
  return render();
}
assert.equal(render(), null, 'sem alvo não monta captura nativa');
target = { current: { nativeTag: 1 } };
assert.equal(render(), null);
assert.equal(frame(), null, 'aguarda layout após primeiro frame');
assert.equal(frame().props.blurTarget, target);
lock.bloqueado = true;
assert.equal(render(), null, 'bloqueio remove blur');
lock.bloqueado = false;
assert.equal(render(), null);
frame();
listener('background');
assert.equal(render(), null);
frame();
assert.equal(frames.size, 0, 'cancela ativação pendente ao sair');
listener('active'); render(); frame();
assert.equal(frame().props.blurTarget, target);
target = { current: { nativeTag: 2 } };
assert.equal(render(), null, 'troca de alvo não reutiliza captura anterior');
frame(); assert.equal(frame().props.blurTarget, target);
listener('active');
assert.equal(render(), null, 'evento active repetido também rearma');
frame(); assert.ok(frame());
lock.pronto = false;
assert.equal(render(), null, 'não captura antes da leitura da trava');
lock.pronto = true; render();
slots.forEach(slot => slot.cleanup?.());
assert.equal(frames.size, 0, 'desmontagem cancela frames');
assert.equal(listener, null, 'desmontagem remove listener');
console.log('OK: alvo, troca de tela, bloqueio, retomada e limpeza do blur.');

// Exercita também a publicação do alvo real: somente após layout, com nova
// identidade, e restauração no replay de efeitos do Strict Mode.
const targetExports = {};
let setup;
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
  '../components/TabBlurTarget.tsx'), 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, {
  exports: targetExports,
  require(name) {
    if (name === 'react') return {
      useRef: value => ({ current: value }), useEffect: fn => { setup = fn; },
    };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
    if (name === 'react-native') return { Platform: platform, View: 'View' };
    if (name === 'expo-blur') return { BlurTargetView: 'NativeTarget' };
    throw new Error(name);
  },
});
const calls = [];
const screen = { type: 'ScreenContent' };
const tree = targetExports.default({ children: screen, routeKey: 'home',
  register: (...args) => calls.push(args) });
assert.equal(tree.type, 'NativeTarget');
assert.equal(tree.props.children, screen, 'alvo contém somente conteúdo da rota');
let cleanup = setup();
assert.equal(calls.length, 0, 'efeito inicial não publica antes do layout');
tree.props.ref.current = { nativeTag: 3 };
tree.props.onLayout();
assert.equal(calls.at(-1)[1].current, tree.props.ref.current);
assert.notEqual(calls.at(-1)[1], tree.props.ref, 'publica snapshot imutável do ref');
cleanup();
assert.equal(calls.at(-1)[1], null);
cleanup = setup();
assert.equal(calls.at(-1)[1].current, tree.props.ref.current, 'Strict Mode restaura alvo');
cleanup();
console.log('OK: publicação após layout, árvore isolada e replay de efeitos.');
