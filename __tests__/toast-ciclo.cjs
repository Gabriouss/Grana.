// Executa os hooks reais do Toast com relógio e animações controlados.
// Cobre o que o plano `plans/003-base-motion-feedback.md` exige: substituição
// perto do fim da leitura, substituição DURANTE a saída, re-render do pai sem
// mensagem nova, desmontagem e redução de movimento.
//
// Não substitui verificação em aparelho: aqui não há renderer nativo nem
// medição de frames — o que se testa é a máquina de estados dos callbacks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

/* ── Relógio, animações e hooks controlados ─────────────────────────────── */
let agora = 0;
let timers = [];
let animacoes = [];

function avancar(ms) {
  agora += ms;
  const vencidos = timers.filter((t) => !t.cancelado && t.quando <= agora);
  timers = timers.filter((t) => t.cancelado || t.quando > agora);
  vencidos.forEach((t) => t.fn());
}

function criarAnimacao() {
  const anim = {
    parado: false,
    callback: null,
    start(cb) { anim.callback = cb ?? null; },
    stop() { anim.parado = true; },
    /** Conclui como o Animated faria ao chegar no fim. */
    concluir() { anim.callback?.({ finished: !anim.parado }); },
  };
  animacoes.push(anim);
  return anim;
}

const slots = [];
let cursor = 0;
let efeitos = [];
const react = {
  useRef(initial) {
    const i = cursor++;
    if (!slots[i]) slots[i] = { current: initial };
    return slots[i];
  },
  useEffect(fn, deps) {
    const i = cursor++;
    const antigo = slots[i];
    if (!antigo || !antigo.deps || deps.some((d, k) => !Object.is(d, antigo.deps[k]))) {
      slots[i] = { deps, cleanup: antigo?.cleanup };
      efeitos.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    }
  },
};

const valorAnimado = () => ({ setValue() {} });
const reactNative = {
  AccessibilityInfo: { announceForAccessibility() {} },
  Platform: { OS: 'android' },
  StyleSheet: { create: (o) => o },
  Text: 'Text',
  Easing: { bezier: () => 'bezier' },
  Animated: {
    Value: function () { return valorAnimado(); },
    View: 'Animated.View',
    /* Só o `parallel` entra na lista rastreada: é nele que o componente chama
       `.start()`/`.stop()`. Rastrear também os `timing` internos encheria a
       lista de objetos que ninguém opera e tornaria os índices enganosos. */
    timing: () => ({ start() {}, stop() {} }),
    parallel: () => criarAnimacao(),
  },
};

const exportsObject = {};
const fonte = fs.readFileSync(path.join(__dirname, '../components/Toast.tsx'), 'utf8');
vm.runInNewContext(
  ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  {
    exports: exportsObject,
    require(nome) {
      if (nome === 'react') return react;
      if (nome === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (nome === 'react-native') return reactNative;
      if (nome === '@/lib/theme') {
        return { theme: {}, radius: {}, spacing: { sm: 8 }, fonts: {}, type: {} };
      }
      if (nome === '@/lib/tab-bar') return { useTabBarInset: () => ({ total: 100 }) };
      if (nome === '@/lib/motion') {
        return { UI_OUT: [0.23, 1, 0.32, 1], useReducedMotion: () => reduzirMovimento };
      }
      throw new Error(`import inesperado: ${nome}`);
    },
    setTimeout(fn, ms) {
      const t = { fn, quando: agora + ms, cancelado: false };
      timers.push(t);
      return t;
    },
    clearTimeout(t) { if (t) t.cancelado = true; },
  }
);

const Toast = exportsObject.default;
let reduzirMovimento = false;
let escondido = 0;

/** Renderiza o componente e roda os efeitos pendentes, como o React faria. */
function render(props) {
  cursor = 0;
  efeitos = [];
  Toast(props);
  efeitos.forEach((e) => e());
}

function reiniciar() {
  slots.length = 0;
  timers = [];
  animacoes = [];
  agora = 0;
  escondido = 0;
  reduzirMovimento = false;
}

/* ── 1. Re-render do pai não reinicia o tempo de leitura ────────────────── */
reiniciar();
render({ message: 'Salvo', visible: true, onHide: () => escondido++ });
avancar(1500);
// O pai re-renderiza (arrow inline nova a cada render, como nas 5 telas reais).
render({ message: 'Salvo', visible: true, onHide: () => escondido++ });
avancar(600); // total 2100ms: a leitura já deveria ter terminado
assert.ok(animacoes.some((a) => a.callback), 'a saída precisa ter começado após 2s reais');
animacoes.filter((a) => a.callback).forEach((a) => a.concluir());
assert.equal(escondido, 1, 're-render do pai não pode reiniciar o timer de leitura');

/* ── 2. Mensagem nova durante a SAÍDA não é fechada pela anterior ───────── */
reiniciar();
render({ message: 'Primeira', visible: true, onHide: () => escondido++ });
avancar(2000); // dispara a saída da primeira
const saidaAntiga = animacoes.find((a) => a.callback);
assert.ok(saidaAntiga, 'saída da primeira mensagem deveria existir');
// Chega a segunda mensagem enquanto a primeira ainda sai.
render({ message: 'Segunda', visible: true, onHide: () => escondido++ });
// A animação antiga termina AGORA, já obsoleta.
saidaAntiga.concluir();
assert.equal(escondido, 0, 'callback obsoleto não pode fechar a mensagem nova');

/* ── 3. A mensagem nova ainda encerra normalmente no seu próprio tempo ──── */
avancar(2000);
const saidaNova = animacoes.filter((a) => a.callback && a !== saidaAntiga).pop();
assert.ok(saidaNova, 'a segunda mensagem precisa ter a própria saída');
saidaNova.concluir();
assert.equal(escondido, 1, 'a mensagem nova encerra pelo próprio callback');

/* ── 4. Animação interrompida não chama onHide ──────────────────────────── */
reiniciar();
render({ message: 'Interrompida', visible: true, onHide: () => escondido++ });
avancar(2000);
const interrompida = animacoes.find((a) => a.callback);
interrompida.stop();
interrompida.concluir(); // finished: false
assert.equal(escondido, 0, 'saída interrompida não pode chamar onHide');

/* ── 5. Desmontagem para as animações, não só o timer ───────────────────── */
reiniciar();
render({ message: 'Desmonta', visible: true, onHide: () => escondido++ });
const entrada = animacoes[0];
slots.forEach((s) => s.cleanup?.());
assert.equal(entrada.parado, true, 'a entrada precisa ser parada na limpeza');

/* ── 6. Redução de movimento: sem animação, leitura preservada ──────────── */
reiniciar();
reduzirMovimento = true;
render({ message: 'Reduzido', visible: true, onHide: () => escondido++ });
assert.equal(animacoes.length, 0, 'modo reduzido não cria animação');
avancar(1999);
assert.equal(escondido, 0, 'o tempo de leitura é o mesmo no modo reduzido');
avancar(1);
assert.equal(escondido, 1, 'modo reduzido encerra pelo timer');

console.log('OK: leitura, substituição durante saída, interrupção, limpeza e redução de movimento.');
