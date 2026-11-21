// Achados do Vigil (21/11/2026) no Mural de Desafios em fonte do sistema 1,3:
// o Android partia palavras ("Conquistad / o", "Primeiro Regis / tro").
// 1) O selo de estado fica em uma linha e encolhe.
// 2) Título de duas palavras não passa por semViuva: o \u00a0 transformaria
//    "Primeiro Registro" (168 dp em 1,3) num bloco inquebrável mais largo que a
//    coluna. A partir de três palavras, semViuva continua (regra 29).
// Módulo real (BadgeCard) em vm; React, RN e ícones são dublês.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const raiz = path.resolve(__dirname, '..');

const jsx = (tipo, props) => ({ tipo, props: props ?? {} });
function realSemViuva() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(raiz, 'lib/sem-viuva.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  return exports;
}
function carregar() {
  const arquivo = path.join(raiz, 'components/BadgeCard.tsx');
  const exports = {};
  const mods = {
    react: { __esModule: true, default: {}, useState: (v) => [v, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (v) => v } },
    '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Ionicons' },
    '@/lib/theme': { fonts: {}, radius: {}, spacing: {}, theme: {}, type: {}, lh: () => 1 },
    '@/lib/sem-viuva': realSemViuva(),
  };
  const src = fs.readFileSync(arquivo, 'utf8');
  vm.runInNewContext(ts.transpileModule(src, { fileName: arquivo, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports,
    require(id) {
      if (id in mods) return mods[id];
      if (id.startsWith('./') || id.startsWith('@/')) return { __esModule: true, default: 'Componente' };
      throw new Error('import inesperado ' + id);
    },
  });
  return exports.default;
}
function nos(no, pred, acc = []) { if (no == null || typeof no !== 'object') return acc; if (Array.isArray(no)) no.forEach((n) => nos(n, pred, acc)); else { if (pred(no)) acc.push(no); nos(no.props?.children, pred, acc); } return acc; }
const texto = (no) => (no == null || typeof no === 'boolean' ? '' : typeof no !== 'object' ? String(no) : Array.isArray(no) ? no.map(texto).join('') : texto(no.props?.children));

const BadgeCard = carregar();
const render = (badge) => BadgeCard({ badge: { icone: 'leaf-outline', unlocked: true, progress: 1, description: 'Fez o primeiro lançamento no app.', ...badge } });
let falhas = 0;
const caso = (nome, fn) => { try { fn(); console.log('MuralFonteGrande OK ' + nome); } catch (e) { falhas++; console.error('MuralFonteGrande FALHA ' + nome + ': ' + e.message); } };

caso('selo de estado em uma linha, encolhendo', () => {
  for (const b of [{ unlocked: true }, { unlocked: false, progress: 0.86 }]) {
    const selo = nos(render({ title: 'X Y', ...b }), (n) => n.tipo === 'Text' && /Conquistado|concluído/.test(texto(n)))[0];
    assert.ok(selo, 'selo não encontrado');
    assert.equal(selo.props.numberOfLines, 1);
    assert.equal(selo.props.adjustsFontSizeToFit, true);
    assert.ok(selo.props.minimumFontScale <= 0.6, 'escala ' + selo.props.minimumFontScale);
  }
});
caso('título de duas palavras sem espaço inquebrável', () => {
  const titulos = nos(render({ title: 'Primeiro Registro' }), (n) => n.tipo === 'Text' && texto(n).includes('Primeiro'));
  assert.equal(texto(titulos[0]), 'Primeiro Registro');
});
caso('título de três palavras ou mais continua sem viúva', () => {
  const titulos = nos(render({ title: 'Uma semana inteira' }), (n) => n.tipo === 'Text' && texto(n).includes('semana'));
  assert.equal(texto(titulos[0]), 'Uma semana\u00a0inteira');
});
console.log(`MuralFonteGrande ${3 - falhas}/3`);
process.exitCode = falhas ? 1 : 0;

// Nit do item 52: a amostra da legenda começa na borda da primeira casa, não
// na da célula. O recuo vem da mesma constante do anel, sem medida copiada.
{
  const cal = fs.readFileSync(path.join(raiz, 'components/DesafiosCalendario.tsx'), 'utf8');
  try {
    assert.match(cal, /anel: \{[^}]*padding: spacing\.fio[^}]*borderWidth: BORDA_ANEL/, 'anel usa BORDA_ANEL');
    assert.match(cal, /RECUO_CASA = spacing\.fio \+ BORDA_ANEL/);
    assert.match(cal, /legenda: \{[^}]*paddingLeft: RECUO_CASA/, 'legenda recuada até a casa');
    console.log('MuralFonteGrande OK legenda alinhada à primeira casa');
  } catch (e) { process.exitCode = 1; console.error('MuralFonteGrande FALHA legenda: ' + e.message); }
}
