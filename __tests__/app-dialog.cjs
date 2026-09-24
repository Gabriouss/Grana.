/* T3 (23 e 24/09/2026): confirmações e avisos curtos deixam o alerta nativo e
   passam pelo AppDialog, com o mesmo painel das outras janelas. Boletos e voz
   em 21c80c9; "Desfazer pagamento" da fatura depois.

   Executa o AppDialog real e confere o contrato de que as telas dependem:
   confirmar fecha E executa, cancelar e o X só fecham, aviso sem onConfirm
   não oferece Cancelar, e a ação destrutiva usa a cor de perigo. Depois
   confere que as telas da T3 usam o AppDialog, e não o alerta nativo. */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const jsx = (type, props) => ({ type, props: props ?? {} });
const modulo = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/AppDialog.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: modulo, require: (name) => {
  const mods = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { StyleSheet: { create: (s) => s }, Text: 'Text', View: 'View' },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
    '@/lib/theme': {
      fonts: {}, radius: {}, spacing: {}, type: {}, touchTarget: 48,
      theme: { ink: 'INK', danger: 'DANGER', paper: 'PAPER', inkSoft: 'SOFT', inkFaint: 'FAINT' },
    },
    './AppModal': { __esModule: true, default: 'AppModal' },
    './AppPressable': { __esModule: true, default: 'AppPressable' },
    './Sheet': { __esModule: true, default: 'Sheet' },
  };
  assert.ok(name in mods, `import inesperado: ${name}`);
  return mods[name];
} });
const AppDialog = modulo.default;

function* nos(no) {
  if (!no || typeof no !== 'object') return;
  if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
  yield no;
  yield* nos(no.props?.children);
}
const botoes = (arvore) => [...nos(arvore)].filter((n) => n.type === 'AppPressable');
const textoDe = (botao) => [...nos(botao.props.children)].find((n) => n.type === 'Text')?.props.children;
const botao = (arvore, texto) => botoes(arvore).find((b) => textoDe(b) === texto);
const fechar = (arvore) => botoes(arvore).find((b) => b.props.accessibilityLabel === 'Fechar');
const cores = (b) => [].concat(b.props.style).filter(Boolean).map((s) => s.backgroundColor).filter(Boolean);

// Confirmação destrutiva.
let chamadas = [];
let arvore = AppDialog({
  visible: true, title: 'Desfazer pagamento?', message: 'A saída lançada para essa fatura será removida.',
  confirmLabel: 'Desfazer pagamento', destructive: true,
  onClose: () => chamadas.push('fechou'), onConfirm: () => chamadas.push('confirmou'),
});
assert.equal(arvore.type, 'AppModal');
assert.equal(arvore.props.visible, true);
botao(arvore, 'Desfazer pagamento').props.onPress();
assert.deepEqual(chamadas, ['fechou', 'confirmou'], 'confirmar fecha a janela e executa a ação');
chamadas = [];
botao(arvore, 'Cancelar').props.onPress();
assert.deepEqual(chamadas, ['fechou'], 'Cancelar só fecha');
chamadas = [];
fechar(arvore).props.onPress();
assert.deepEqual(chamadas, ['fechou'], 'o X só fecha');
chamadas = [];
arvore.props.onRequestClose();
assert.deepEqual(chamadas, ['fechou'], 'o voltar do Android só fecha');
assert.ok(cores(botao(arvore, 'Desfazer pagamento')).includes('DANGER'), 'ação destrutiva na cor de perigo');
assert.equal(fechar(arvore).props.style.width, 48, 'X com a área de toque do touchTarget');

// Aviso: só um botão, sem Cancelar e sem cor de perigo.
chamadas = [];
arvore = AppDialog({
  visible: true, title: 'Não entendi', message: 'Tente de novo.', confirmLabel: 'Entendi',
  onClose: () => chamadas.push('fechou'),
});
assert.equal(botao(arvore, 'Cancelar'), undefined, 'aviso não oferece Cancelar');
botao(arvore, 'Entendi').props.onPress();
assert.deepEqual(chamadas, ['fechou']);
assert.ok(!cores(botao(arvore, 'Entendi')).includes('DANGER'));
console.log('OK AppDialog: confirmar fecha e executa; Cancelar, X e voltar só fecham; aviso sem Cancelar.');

// As telas da T3 usam o AppDialog, e não o alerta nativo, nessas confirmações.
const credito = fs.readFileSync('app/(app)/credito.tsx', 'utf8');
assert.ok(!/Alert\.alert\(\s*'Desfazer pagamento'/.test(credito), 'Desfazer pagamento ainda é alerta nativo');
assert.ok(/<AppDialog[\s\S]*?title="Desfazer pagamento\?"[\s\S]*?destructive[\s\S]*?desfazerPagamento\(/.test(credito),
  'Desfazer pagamento confirma pelo AppDialog destrutivo e chama desfazerPagamento');
assert.ok(/function confirmReopenInvoice\(\)[\s\S]*?setDesfazerAlvo\(/.test(credito),
  'o botão de desfazer abre a confirmação em vez de desfazer direto');

const contas = fs.readFileSync('app/(app)/contas.tsx', 'utf8');
assert.ok(!/Alert\.alert\(\s*'Excluir conta'/.test(contas), 'Excluir boleto ainda é alerta nativo');
assert.ok(/<AppDialog[\s\S]*?title="Excluir boleto\?"[\s\S]*?destructive/.test(contas));

const voz = fs.readFileSync('components/VoiceEntryButton.tsx', 'utf8');
assert.ok(/codigo === 'nao_entendi'\) setAvisoVoz\(/.test(voz), '"Não entendi" da voz vai para o AppDialog');
assert.ok(/<AppDialog/.test(voz));
console.log('OK T3: Desfazer pagamento, Excluir boleto e "Não entendi" usam o AppDialog.');
