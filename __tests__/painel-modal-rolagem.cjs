// Regressão (01/11/2026): o AccessibleModalPanel era um Pressable de `onPress`
// vazio, ANCESTRAL da rolagem. No Android isso fazia o toque em área comum virar
// responder de JS e a lista só rolava com o dedo começando em algo tocável. O
// fundo que fecha é ancestral do painel nos dez chamadores, então o painel tem
// de segurar o toque sem reivindicá-lo. Aqui o módulo REAL é compilado, nas duas
// plataformas, e a árvore devolvida é inspecionada.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert');
const ts = require('typescript');

const fonte = ts.transpileModule(fs.readFileSync('components/AccessibleModalPanel.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function montar(os) {
  const el = (type, props) => ({ type, props: props || {} });
  const acessibilidade = [];
  const mocked = {
    'react/jsx-runtime': { jsx: el, jsxs: el, Fragment: 'Fragment' },
    react: { useRef: () => ({ current: null }) },
    'react-native': { Platform: { OS: os }, View: 'View', Pressable: 'Pressable' },
    '@/lib/modal-accessibility': { useModalAccessibility: (...a) => acessibilidade.push(a) },
  };
  const saida = {};
  vm.runInNewContext(fonte, {
    exports: saida,
    console,
    require: (id) => { if (!(id in mocked)) throw Error('AccessibleModalPanel import: ' + id); return mocked[id]; },
  });
  const fechar = () => {};
  return { arvore: saida.default({ ativo: true, children: 'filhos', style: { flex: 1 }, onClose: fechar }), acessibilidade, fechar };
}

const eventoFalso = () => {
  const ev = { parou: 0, stopPropagation() { ev.parou += 1; } };
  return ev;
};

for (const os of ['android', 'ios', 'web']) {
  const { arvore, acessibilidade, fechar } = montar(os);
  assert.strictEqual(arvore.type, 'View', `${os}: o painel não pode ser Pressable, senão vira responder e prende a rolagem`);
  assert.strictEqual(arvore.props.onPress, undefined, `${os}: painel sem onPress`);
  assert.strictEqual(arvore.props.children, 'filhos', `${os}: conteúdo segue dentro do painel`);
  assert.deepStrictEqual(arvore.props.style, { flex: 1 }, `${os}: estilo do chamador intacto`);

  const ev = eventoFalso();
  assert.strictEqual(arvore.props.onStartShouldSetResponder(ev), false, `${os}: o painel não reivindica o toque`);
  assert.strictEqual(ev.parou, 1, `${os}: o toque não pode subir até o fundo, que reivindicaria e fecharia`);

  assert.strictEqual(arvore.props.role, 'dialog', `${os}: papel de diálogo`);
  assert.strictEqual(arvore.props.focusable, true, `${os}: painel recebe foco`);
  assert.strictEqual(arvore.props.accessibilityViewIsModal, true, `${os}: isola o leitor de tela no iOS`);
  assert.strictEqual(arvore.props.collapsable, false, `${os}: a view existe de verdade para o foco nativo achar`);
  assert.strictEqual(acessibilidade.length, 1, `${os}: passa por useModalAccessibility`);
  assert.strictEqual(acessibilidade[0][1], true, `${os}: repassa ativo`);
  assert.strictEqual(acessibilidade[0][2], fechar, `${os}: repassa o fechar, que é o Escape na web`);

  if (os === 'web') {
    const clique = eventoFalso();
    arvore.props.onClick(clique);
    assert.strictEqual(clique.parou, 1, 'web: clique dentro não pode subir ao fundo, que fecha pelo click');
  } else {
    assert.strictEqual(arvore.props.onClick, undefined, `${os}: onClick é só da web`);
  }
}

console.log('painel-modal-rolagem: ok');
