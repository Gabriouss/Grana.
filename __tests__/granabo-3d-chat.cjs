/*
 * Granabô 3D no Granachat, na barra flutuante e na navegação lateral.
 *
 *   node __tests__/granabo-3d-chat.cjs
 *
 * Verifica:
 * 1. Os 7 ativos 3D extraídos do Blender (W3 + boca L3, Cycles) existem em
 *    assets/granabo/ e não estão vazios.
 * 2. O módulo real `components/Granabo3D.tsx` transpila e executa em sandbox
 *    com hooks e animações simulados, escolhendo a pose 3D correta para cada
 *    estado (`saudacao`, `repouso`, `pensando`, `feliz`, `inclinado`) e
 *    respeitando `useReducedMotion`.
 * 3. `components/Granachat.tsx` usa `Granabo3D` na saudação da tela vazia
 *    (`variante="hero"`), no cabeçalho e nas bolhas de conversa (inclusive no
 *    estado `carregando` com `estado="pensando"`).
 * 4. `app/(app)/_layout.tsx` (`BotaoGranabo`) e `components/SideNav.tsx` usam
 *    `Granabo3D` no botão de acionar o Granabô, preservando `discoRef` e a
 *    medição `medirReserva`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let passou = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  passou++;
};

/* ── 1. Ativos 3D do Blender presentes e íntegros ────────────────────────── */
const ativosEsperados = [
  'granabo-frente.png',
  'granabo-piscando.png',
  'granabo-inclinado.png',
  'granabo-pensando.png',
  'granabo-feliz.png',
  'granabo-tres-quartos.png',
  'granabo-saudacao.webp',
];
for (const arquivo of ativosEsperados) {
  const abs = path.join(root, 'assets', 'granabo', arquivo);
  ok(fs.existsSync(abs), `ativo 3D existe: assets/granabo/${arquivo}`);
  const stat = fs.statSync(abs);
  ok(stat.size > 10_000, `ativo 3D tem conteúdo real (>10KB): ${arquivo} (${stat.size} bytes)`);
}

/* ── 2. Execução do módulo real components/Granabo3D.tsx ─────────────────── */
function renderizarGranabo3D({ estado, variante, pulsoInteracao = 0, reduzirMovimento = false, plataforma = 'android' }) {
  const codigo = fs.readFileSync(path.join(root, 'components', 'Granabo3D.tsx'), 'utf8');
  const js = ts.transpileModule(codigo, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;

  const elementos = [];
  const React = {
    createElement(tipo, props, ...filhos) {
      const el = { tipo, props: props || {}, filhos };
      elementos.push(el);
      return el;
    },
  };

  class ValorAnimado {
    constructor(v) { this.valor = v; }
    setValue(v) { this.valor = v; }
    interpolate() { return 'interpolado'; }
  }

  const exports = {};
  vm.runInNewContext(
    js,
    {
      exports,
      React,
      setTimeout: () => 1,
      clearTimeout: () => {},
      setInterval: () => 1,
      clearInterval: () => {},
      require(id) {
        if (id === 'react') {
          return {
            useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
            useRef: (init) => ({ current: init }),
            useEffect: () => {},
          };
        }
        if (id === 'react-native') {
          return {
            Animated: {
              Value: ValorAnimado,
              View: 'Animated.View',
              Image: 'Image',
              add: () => 'soma-animada',
              loop: () => ({ start() {}, stop() {} }),
              sequence: () => ({ start() {}, stop() {} }),
              timing: () => ({ start() {}, stop() {} }),
              spring: () => ({ start() {}, stop() {} }),
            },
            Easing: { inOut: (x) => x, out: (x) => x, sin: 'sin', cubic: 'cubic' },
            Image: 'Image',
            Platform: { OS: plataforma },
            StyleSheet: { create: (s) => s },
            View: 'View',
          };
        }
        if (id === 'expo-asset') {
          return { Asset: { fromModule: () => ({ downloadAsync: async () => {} }) } };
        }
        if (id === '@/lib/theme') {
          return {
            menta: (a) => `rgba(174,255,227,${a})`,
            sombras: { abaCentral: 'sombra-aba' },
            theme: { paper: '#052229' },
          };
        }
        if (id === '@/lib/motion') {
          return { useReducedMotion: () => reduzirMovimento };
        }
        if (id.startsWith('@/assets/granabo/')) {
          return id.replace('@/assets/granabo/', '');
        }
        throw new Error(`Import não simulado em Granabo3D: ${id}`);
      },
    },
    { filename: 'components/Granabo3D.tsx' }
  );

  const Granabo3D = exports.default;
  Granabo3D({ tamanho: 80, variante, estado, pulsoInteracao });
  const img = elementos.find((e) => e.tipo === 'Image');
  return { img, elementos };
}

{
  const repouso = renderizarGranabo3D({ estado: 'repouso', variante: 'botao' });
  ok(repouso.img && repouso.img.props.source === 'granabo-frente.png', 'repouso usa granabo-frente.png');

  const pensando = renderizarGranabo3D({ estado: 'pensando', variante: 'avatar' });
  ok(pensando.img && pensando.img.props.source === 'granabo-pensando.png', 'pensando usa granabo-pensando.png');

  const feliz = renderizarGranabo3D({ estado: 'feliz', variante: 'avatar' });
  ok(feliz.img && feliz.img.props.source === 'granabo-feliz.png', 'feliz usa granabo-feliz.png');

  const saudacaoWeb = renderizarGranabo3D({ estado: 'saudacao', variante: 'hero', plataforma: 'web' });
  ok(saudacaoWeb.img && saudacaoWeb.img.props.source === 'granabo-saudacao.webp', 'saudacao na web usa o WebP 3D animado granabo-saudacao.webp');

  const saudacaoReduzido = renderizarGranabo3D({ estado: 'saudacao', variante: 'hero', reduzirMovimento: true });
  ok(saudacaoReduzido.img && saudacaoReduzido.img.props.source === 'granabo-inclinado.png', 'com reduzirMovimento ligado, saudacao usa pose 3D estática granabo-inclinado.png');
}

/* ── 3. Integração no Granachat, _layout e SideNav ───────────────────────── */
{
  const granachat = fs.readFileSync(path.join(root, 'components', 'Granachat.tsx'), 'utf8');
  ok(granachat.includes("import Granabo3D"), 'Granachat importa Granabo3D');
  ok(/variante="hero"/.test(granachat), 'Granachat renderiza Granabo3D em destaque (hero) na tela vazia');
  ok(/estado="pensando"/.test(granachat), 'Granachat exibe o Granabo3D pensando durante a consulta');
  ok(!/<Ionicons name="sparkles"/.test(granachat), 'Granachat não usa mais o ícone chapado sparkles no lugar do mascote 3D');

  const layout = fs.readFileSync(path.join(root, 'app', '(app)', '_layout.tsx'), 'utf8');
  ok(layout.includes("import Granabo3D"), '_layout importa Granabo3D');
  ok(/<Granabo3D tamanho=\{74\} variante="botao"/.test(layout), 'BotaoGranabo usa a esfera 3D de 74dp');
  ok(/ref=\{discoRef\}/.test(layout), 'BotaoGranabo preserva discoRef para medição da reserva da barra');

  const sideNav = fs.readFileSync(path.join(root, 'components', 'SideNav.tsx'), 'utf8');
  ok(sideNav.includes("import Granabo3D"), 'SideNav importa Granabo3D');
  ok(/variante="nav"/.test(sideNav), 'SideNav renderiza Granabo3D no item assistente');
}

console.log(`granabo-3d-chat: ${passou} verificações passaram — 0 falhas`);
