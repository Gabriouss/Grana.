/*
 * Com o teclado aberto, a barra de abas e o "+" saem de cena.
 *
 *   node __tests__/teclado-esconde-barra.cjs
 *
 * Achado W3 (M1, 18/09/2026): na busca de Lançamentos, ao digitar, a barra de
 * abas, o botão do Granabô e o "+" subiam junto com o teclado e cobriam o
 * resultado que a pessoa acabou de buscar. No Android a janela encolhe para o
 * teclado, e o que é preso à base sobe com ela. A barra é própria
 * (`FloatingTabBar`), então o `tabBarHideOnKeyboard` do navegador não vale.
 *
 * Checagem do fonte, porque os dois são componentes com hooks e layout nativo.
 * O que ela prende: os dois leem o teclado, só fora da web, e somem com ele.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let ok = 0;
const passou = (m) => { ok++; console.log('  ok  ' + m); };

const layout = fs.readFileSync(path.join(root, 'app/(app)/_layout.tsx'), 'utf8');
const barra = layout.slice(layout.indexOf('function FloatingTabBar'), layout.indexOf('return (', layout.indexOf('function FloatingTabBar')) + 400);
assert.ok(/const alturaTeclado = useKeyboardHeight\(\);/.test(barra), 'a barra precisa ler o teclado');
assert.ok(/const tecladoAberto = Platform\.OS !== 'web' && alturaTeclado > 0;/.test(barra), 'so fora da web');
assert.ok(/tecladoAberto && \{ display: 'none' \}/.test(barra), 'a barra some, mas continua montada');
passou('a barra de abas some com o teclado aberto, fora da web');

const fab = fs.readFileSync(path.join(root, 'components/FabButton.tsx'), 'utf8');
assert.ok(/const alturaTeclado = useKeyboardHeight\(\);/.test(fab), 'o "+" precisa ler o teclado');
assert.ok(/const tecladoAberto = Platform\.OS !== 'web' && alturaTeclado > 0;/.test(fab));
assert.ok(/\) : tecladoAberto \? null : \(\s*<View style=\{posicaoStyle\}>/.test(fab), 'o "+" fechado some com o teclado');
passou('o "+" some com o teclado aberto, fora da web');

/* O hook nao pode ser chamado dentro de uma condicao (regra dos hooks): foi o
   primeiro rascunho desta correcao. */
for (const [nome, fonte] of [['_layout', barra], ['FabButton', fab]]) {
  assert.ok(!/&& useKeyboardHeight\(\)/.test(fonte), nome + ': useKeyboardHeight chamado dentro de condicao');
}
passou('useKeyboardHeight chamado sem condicao nos dois');

console.log('\n' + ok + '/' + ok + ' guardas de teclado passaram — 0 falhas\n');
