/* Contrato do alerta visual: o módulo real mantém uma fila, conserva a ordem
   dos botões e só executa uma ação depois que o pedido saiu da fila. A guarda
   também impede que um Alert nativo volte a ser importado fora de lib/alerta. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function carregar(file) {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: (id) => { throw new Error(`import inesperado em alerta: ${id}`); },
  }, { filename: file });
  return exports;
}

const alerta = carregar(path.join('lib', 'alerta.ts'));
let cancelados = 0;
let destrutivos = 0;
let dispensados = 0;

alerta.Alert.alert('Primeiro', 'Escolha uma ação.', [
  { text: 'Cancelar', style: 'cancel', onPress: () => { cancelados++; } },
  { text: 'Excluir', style: 'destructive', onPress: () => { destrutivos++; } },
], { onDismiss: () => { dispensados++; } });
alerta.Alert.alert('Segundo', 'Fica aguardando o primeiro.');

const primeiro = alerta.obterAlertaAtual();
assert.equal(primeiro.title, 'Primeiro');
assert.equal(primeiro.buttons[1].style, 'destructive');
assert.equal(alerta.pressionarAlerta(primeiro.id, 0), true);
assert.equal(cancelados, 1, 'botão cancel executa sua ação');
assert.equal(destrutivos, 0, 'ação destrutiva não é escolhida por engano');
assert.equal(dispensados, 1, 'onDismiss acontece uma vez ao fechar');
assert.equal(alerta.obterAlertaAtual().title, 'Segundo', 'a fila libera o próximo alerta');
assert.equal(alerta.pressionarAlerta(primeiro.id, 0), false, 'alerta já fechado não executa de novo');

const segundo = alerta.obterAlertaAtual();
assert.equal(alerta.dispensarAlerta(segundo.id), true, 'cancelamento por fechar dispensa a janela');
assert.equal(alerta.dispensarAlerta(segundo.id), false, 'cancelamento repetido não tem efeito');
assert.equal(alerta.obterAlertaAtual(), undefined);

const host = fs.readFileSync(path.join('components', 'AlertaHost.tsx'), 'utf8');
assert.match(host, /AppModal/);
assert.match(host, /Sheet/);
assert.match(host, /touchTarget/);
assert.match(host, /theme\.accent/);
assert.match(host, /theme\.danger/);
assert.doesNotMatch(host, /fontWeight|textTransform/);

function listarArquivos(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const nome = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return listarArquivos(nome);
    return /\.(?:ts|tsx)$/.test(entrada.name) ? [nome] : [];
  });
}

const importNativo = /import\s+(?:Alert\s*,?\s*|\{[^}]*\bAlert\b[^}]*}\s*)from\s*['"]react-native['"]/s;
for (const arquivo of ['app', 'components', 'lib'].flatMap(listarArquivos)) {
  if (path.normalize(arquivo) === path.normalize('lib/alerta.ts')) continue;
  const source = fs.readFileSync(arquivo, 'utf8');
  assert.doesNotMatch(source, importNativo, `Alert nativo fora de lib/alerta.ts: ${arquivo}`);
  if (/\bAlert\.alert\s*\(/.test(source)) {
    assert.match(source, /from\s+['"](?:@\/lib\/alerta|\.\/alerta)['"]/, `alerta fora da API visual: ${arquivo}`);
  }
}

console.log('OK alerta: fila, cancelamento, destrutivo, onDismiss único e guarda contra Alert nativo.');
