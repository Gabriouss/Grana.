/* Cartão "Quanto sobrou na sua conta do mês passado?" (Adendo 2 do autor,
 * 07/11/2026). Executa o componente REAL com hooks simulados e confere o que
 * cada ação faz: confirmar envia o valor digitado (inclusive R$ 0), falha deixa
 * recibo visível (regra 9), "Agora não" não grava nada. E a Início só mostra
 * o cartão na visão total, com a sobra pendente e fora do modo de exemplo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

let estados = [], indice = 0;
const React = {
  useState: (ini) => {
    const i = indice++;
    if (!(i in estados)) estados[i] = typeof ini === 'function' ? ini() : ini;
    return [estados[i], (v) => { estados[i] = typeof v === 'function' ? v(estados[i]) : v; }];
  },
};
const jsx = (tipo, props) => ({ tipo, props: props || {} });
const stub = (id) => {
  if (id === 'react') return React;
  if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
  if (id === 'react-native') return { ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View' };
  if (id === '@/lib/theme') return { theme: new Proxy({}, { get: () => '#000' }), radius: { md: 8 }, spacing: new Proxy({}, { get: () => 8 }), card: { radius: 8, borderWidth: 1, padding: 16 }, fonts: {}, type: new Proxy({}, { get: () => 14 }), lh: () => 20 };
  if (id === '@/lib/limits') return { LIMITS: { amount: 14 } };
  if (id === './AppPressable') return 'AppPressable';
  throw Error('Import inesperado: ' + id);
};
/* lib/format.ts REAL, para o valor digitado ser lido como no app. */
function moduloReal(rel, req) {
  const file = path.join(root, rel);
  const mod = new Module(file, module);
  mod.require = req;
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return mod;
}
const regras = moduloReal('lib/transaction-rules.ts', (id) => { throw Error('Import inesperado: ' + id); });
const fmt = moduloReal('lib/format.ts', (id) => { if (id === './transaction-rules') return regras.exports; throw Error('Import inesperado em format: ' + id); });
const carregarComponente = () => {
  const m = new Module(path.join(root, 'components/PerguntaSobraDoMes.tsx'), module);
  m.require = (id) => (id === '@/lib/format' ? fmt.exports : stub(id));
  return m;
};
const m = carregarComponente();
m._compile(ts.transpileModule(fs.readFileSync(m.id, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, m.id);
const Pergunta = m.exports.default;

const achar = (no, f, out = []) => {
  if (!no || typeof no !== 'object') return out;
  if (Array.isArray(no)) { no.forEach((x) => achar(x, f, out)); return out; }
  if (f(no)) out.push(no);
  achar(no.props && no.props.children, f, out);
  return out;
};
const texto = (no) => (no == null || no === false ? '' : typeof no !== 'object' ? String(no) : Array.isArray(no) ? no.map(texto).join(' ') : texto(no.props && no.props.children));
let n = 0; const ok = (c, r) => { assert.ok(c, r); n++; };

function montar(props) {
  estados = [];
  const render = () => { indice = 0; return Pergunta(props); };
  const botao = (rotulo) => achar(render(), (x) => x.tipo === 'AppPressable' && texto(x).includes(rotulo))[0];
  const campo = () => achar(render(), (x) => x.tipo === 'TextInput')[0];
  return { render, botao, campo };
}

(async () => {
  const erroOriginal = console.error; console.error = () => {};
  const gravados = []; let adiou = 0;
  const t = montar({ sugestao: 1200, onConfirmar: async (v) => { gravados.push(v); }, onAgoraNao: () => { adiou++; } });
  ok(t.campo().props.value === '1.200,00', 'campo vem preenchido com a sugestão');
  ok(/Quanto sobrou na sua conta do mês passado\?/.test(texto(t.render())), 'pergunta do autor, literal');
  t.campo().props.onChangeText('80000');
  await t.botao('Confirmar').props.onPress();
  ok(gravados.length === 1 && gravados[0] === 800, `confirma o valor digitado (800), veio ${gravados[0]}`);
  t.campo().props.onChangeText('');
  await t.botao('Confirmar').props.onPress();
  ok(gravados[1] === 0, 'campo vazio confirma R$ 0');
  t.botao('Agora não').props.onPress();
  ok(adiou === 1 && gravados.length === 2, '"Agora não" não grava');

  const falha = montar({ sugestao: 0, onConfirmar: async () => { throw Error('rede'); }, onAgoraNao: () => {} });
  await falha.botao('Confirmar').props.onPress();
  const alerta = achar(falha.render(), (x) => x.props.accessibilityRole === 'alert')[0];
  ok(alerta && /Não consegui salvar/.test(texto(alerta)), 'falha ao salvar deixa recibo visível');
  console.error = erroOriginal;

  /* Início: condições de exibição e o que a confirmação faz, no código real. */
  const inicio = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
  ok(/!isDemoMode && activeWalletId === 'total' && sobraDoMes\?\.estado === 'pendente' && sobraAdiada === false && !carregandoFontesLivre && \(/.test(inicio), 'Início só pergunta na visão total, pendente, fora do exemplo e depois de ler o adiamento');
  ok(/setSobraAdiada\(true\);\s*if \(userId\) void adiarSobraAteAmanha\(userId, todayISO\(\)\);/.test(inicio), '"Agora não" guarda o dia');

  /* Rodada 2 do autor (07/11/2026): "Agora não" vale até o dia seguinte.
     Módulo REAL lib/sobra-adiada.ts com AsyncStorage simulado. */
  const disco = new Map(); let quebrado = false;
  const adiada = moduloReal('lib/sobra-adiada.ts', (id) => {
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
      getItem: async (k) => { if (quebrado) throw Error('disco'); return disco.has(k) ? disco.get(k) : null; },
      setItem: async (k, v) => { if (quebrado) throw Error('disco'); disco.set(k, v); },
    } };
    throw Error('Import inesperado: ' + id);
  }).exports;
  ok((await adiada.sobraAdiadaHoje('u', '2026-11-07')) === false, 'sem adiamento: pergunta');
  await adiada.adiarSobraAteAmanha('u', '2026-11-07');
  ok((await adiada.sobraAdiadaHoje('u', '2026-11-07')) === true, 'mesmo dia: não pergunta de novo');
  ok((await adiada.sobraAdiadaHoje('u', '2026-11-08')) === false, 'dia seguinte: pergunta de novo');
  ok((await adiada.sobraAdiadaHoje('outra', '2026-11-07')) === false, 'adiamento é por usuário');
  quebrado = true; console.error = () => {};
  ok((await adiada.sobraAdiadaHoje('u', '2026-11-07')) === false, 'falha de leitura: pergunta (sem inventar adiamento)');
  await adiada.adiarSobraAteAmanha('u', '2026-11-07');
  console.error = erroOriginal;
  ok(/await confirmarSobraDoMes\(mes, valor\);\s*setSobraDoMes\(\{ estado: 'confirmada', mes, valor \}\);\s*notificarDadosDosWidgetsAlterados\(\);/.test(inicio), 'confirmar grava, atualiza o Livre e avisa os widgets');
  console.log(`pergunta-sobra-do-mes: ${n} checagens no componente real`);
})().catch((e) => { console.error(e); process.exit(1); });
