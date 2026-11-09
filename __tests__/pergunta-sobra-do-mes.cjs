/* Janela "Quanto sobrou na sua conta do mês passado?" (Adendo 2 do autor,
 * 07/11/2026; janela flutuante por regra do autor de 07/11/2026). Executa o componente REAL com hooks simulados e confere o que
 * cada ação faz: confirmar envia o valor digitado (inclusive R$ 0), falha deixa
 * recibo visível (regra 9), "Agora não" não grava nada. E a Início só mostra
 * o cartão na visão total, com a sobra pendente e fora do modo de exemplo. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

let atual;
const outraJanela = { valor: false };
const privacidade = { valor: false };
const React = {
  useEffect: (fn, deps) => {
    const ctx = atual, i = ctx.indice++, anterior = ctx.slots[i];
    if (!anterior || !deps || !anterior.deps || deps.length !== anterior.deps.length || deps.some((v, j) => !Object.is(v, anterior.deps[j]))) {
      ctx.efeitos.push(() => {
        if (typeof anterior?.limpar === 'function') anterior.limpar();
        ctx.slots[i] = { deps, limpar: fn() };
      });
    }
  },
  useState: (ini) => {
    const ctx = atual, i = ctx.indice++;
    if (!(i in ctx.slots)) ctx.slots[i] = typeof ini === 'function' ? ini() : ini;
    return [ctx.slots[i], (v) => { const novo = typeof v === 'function' ? v(ctx.slots[i]) : v; if (!Object.is(novo, ctx.slots[i])) ctx.mudou = true; ctx.slots[i] = novo; }];
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
  if (id === './AppModal') return 'AppModal';
  if (id === './Sheet') return 'Sheet';
  if (id === '@/lib/privacy-context') return { usePrivacy: () => ({ hidden: privacidade.valor }) };
  if (id === '@/lib/janelas-abertas') return { useHaJanelaAberta: () => outraJanela.valor };
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
  const ctx = { slots: [], indice: 0, efeitos: [], mudou: false };
  const render = () => {
    let arvore;
    for (let i = 0; i < 4; i++) {
      atual = ctx; ctx.indice = 0; ctx.efeitos = []; ctx.mudou = false;
      arvore = Pergunta(props);
      ctx.efeitos.forEach((f) => f());
      if (!ctx.mudou) break;
    }
    return arvore;
  };
  const modal = () => achar(render(), (x) => x.tipo === 'AppModal')[0];
  const botao = (rotulo) => achar(render(), (x) => x.tipo === 'AppPressable' && texto(x).includes(rotulo))[0];
  const campo = () => achar(render(), (x) => x.tipo === 'TextInput')[0];
  return { render, botao, campo, modal };
}

(async () => {
  const erroOriginal = console.error; console.error = () => {};
  const gravados = []; let adiou = 0;
  const t = montar({ pode: true, sugestao: 1200, onConfirmar: async (v) => { gravados.push(v); }, onAgoraNao: () => { adiou++; } });
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

  const falha = montar({ pode: true, sugestao: 0, onConfirmar: async () => { throw Error('rede'); }, onAgoraNao: () => {} });
  await falha.botao('Confirmar').props.onPress();
  const alerta = achar(falha.render(), (x) => x.props.accessibilityRole === 'alert')[0];
  ok(alerta && /Não consegui salvar/.test(texto(alerta)), 'falha ao salvar deixa recibo visível');
  console.error = erroOriginal;

  /* Janela flutuante: abre com a Início em foco e sem outra janela, nunca por
     cima de outra, e só "Agora não" e "Confirmar" a fecham. */
  outraJanela.valor = false;
  const aberta = montar({ pode: true, sugestao: 0, onConfirmar: async () => {}, onAgoraNao: () => { adiou++; } });
  ok(aberta.modal().props.visible === true && aberta.modal().props.transparent, 'abre como janela quando está pendente, em foco e sem outra janela');
  ok(achar(aberta.render(), (x) => x.tipo === 'Sheet' && x.props.centered)[0], 'usa a Sheet centralizada do design system');
  const antes = adiou;
  aberta.modal().props.onRequestClose();
  achar(aberta.render(), (x) => x.tipo === 'Sheet')[0].props.onClose();
  ok(aberta.modal().props.visible === true && adiou === antes, 'Voltar e tocar fora NÃO fecham nem adiam');
  outraJanela.valor = true;
  ok(aberta.modal().props.visible === true, 'depois de aberta, contar a si mesma no registro não a fecha');
  const bloqueada = montar({ pode: true, sugestao: 0, onConfirmar: async () => {}, onAgoraNao: () => {} });
  ok(bloqueada.modal().props.visible === false, 'com outra janela aberta, não abre por cima');
  outraJanela.valor = false;
  ok(bloqueada.modal().props.visible === true, 'quando a outra fecha, a da sobra abre');
  const semFoco = montar({ pode: false, sugestao: 0, onConfirmar: async () => {}, onAgoraNao: () => {} });
  ok(semFoco.modal().props.visible === false, 'fora de foco ou adiada, não abre');


  /* A-01 / A-02 da revisão do Harbor (08/11/2026). Escritos ANTES da correção:
     no código antigo (useState só na montagem, sem usePrivacy) os quatro falham. */
  {
    const gr = [];
    const p1 = { pode: false, sugestao: 0, onConfirmar: async (v) => { gr.push(v); }, onAgoraNao: () => {} };
    const a = montar(p1);
    a.render();
    p1.pode = true; p1.sugestao = 1200;
    ok(a.campo().props.value === '1.200,00', 'A-01: sugestão que chega depois da montagem entra no campo');
    a.campo().props.onChangeText('50000');
    p1.sugestao = 900;
    ok(a.campo().props.value === '500,00', 'A-01: o que a pessoa digitou nunca é sobrescrito pela sugestão nova');

    privacidade.valor = true;
    const p2 = { pode: true, sugestao: 1200, onConfirmar: async (v) => { gr.push(v); }, onAgoraNao: () => {} };
    const b = montar(p2);
    ok(b.campo().props.value === '' && b.campo().props.placeholder === '0,00', 'A-02: com valores ocultos o campo abre vazio, com placeholder 0,00');
    const visivel = JSON.stringify(b.render(), (k, v) => (typeof v === 'function' ? undefined : v));
    ok(!/1\.200/.test(visivel), 'A-02: a sugestão não aparece em nenhum texto ou rótulo da janela');
    const antesGr = gr.length;
    await b.botao('Confirmar').props.onPress();
    const alertaPriv = achar(b.render(), (x) => x.props.accessibilityRole === 'alert')[0];
    ok(gr.length === antesGr && alertaPriv && /Digite o valor que sobrou \(pode ser 0,00\)\./.test(texto(alertaPriv)), 'A-02: confirmar vazio com privacidade não confirma zero e mostra o erro');
    b.campo().props.onChangeText('30000');
    await b.botao('Confirmar').props.onPress();
    ok(gr[gr.length - 1] === 300, 'A-02: digitar 300 e confirmar chama onConfirmar(300)');

    const c = montar({ pode: true, sugestao: 1200, onConfirmar: async () => {}, onAgoraNao: () => {} });
    ok(c.campo().props.value === '', 'A-01: com privacidade ligada o campo segue vazio');
    privacidade.valor = false;
    ok(c.campo().props.value === '1.200,00', 'A-01: privacidade desligada e campo não editado passa a mostrar a sugestão');
    const d = montar({ pode: true, sugestao: 1200, onConfirmar: async (v) => { gr.push(v); }, onAgoraNao: () => {} });
    d.campo().props.onChangeText('');
    await d.botao('Confirmar').props.onPress();
    ok(gr[gr.length - 1] === 0, 'sem privacidade, campo vazio continua valendo zero');
  }

  /* Início: condições de exibição e o que a confirmação faz, no código real. */
  const inicio = fs.readFileSync(path.join(root, 'app/(app)/index.tsx'), 'utf8');
  ok(/!isDemoMode && sobraDoMes\?\.estado === 'pendente' && \(/.test(inicio) && /pode=\{carteiraIncluiSobra && sobraAdiada === false && !carregandoFontesLivre && inicioEmFoco\}/.test(inicio), 'Início pergunta no Total ou Principal canonica, pendente, fora do exemplo, em foco e depois de ler o adiamento');
  const blocoSaldo = inicio.slice(inicio.indexOf('saldo: () => ('), inicio.indexOf('cofrinhos: () => ('));
  ok(!/PerguntaSobraDoMes/.test(blocoSaldo), 'a Início não tem mais card da sobra no bloco do saldo (regra do autor: nada de bloco novo)');
  ok(/onAgoraNao=\{adiarSobra\}/.test(inicio), '"Agora não" usa o ciclo de vida compartilhado');

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
  ok(/await confirmarSobra\(valor\);\s*notificarDadosDosWidgetsAlterados\(\);/.test(inicio), 'confirmação validada avisa os widgets');
  await require('./sobra-ciclo-de-vida.cjs')();
  console.log(`pergunta-sobra-do-mes: ${n} checagens no componente real`);
})().catch((e) => { console.error(e); process.exit(1); });
