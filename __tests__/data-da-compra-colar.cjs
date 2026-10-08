/*
 * "Data da compra" editável no Colar, a mesma linha da foto (30/09/2026).
 *
 *   node __tests__/data-da-compra-colar.cjs
 *
 * Executa o components/PasteReceiptModal.tsx REAL, com o
 * components/LinhaDataDaCompra.tsx REAL e as funções reais de leitura
 * (lib/nota-foto-parser, lib/heuristics, lib/format), num mini-runtime de
 * hooks. O relógio é falso (30/09/2026, America/Sao_Paulo). Afirma o que
 * chega ao gravador (`occurred_on`), e não só o que aparece:
 *   1. data lida do texto: campo com o selo "lida do texto", editável, e a
 *      data escolhida é a gravada; futura no seletor vira hoje;
 *   2. texto sem data: hoje, sem selo;
 *   3. data recusada: campo sem data, dica, e o Salvar não grava até a
 *      pessoa escolher;
 *   4. revisão de voz (data na voz): a linha aparece com a data da fala,
 *      lida pela mesma função da tarefa do app e do widget, contada da
 *      captura; data duvidosa deixa o campo vazio com a dica, e o Salvar
 *      não grava até a escolha; a data editada vai no `occurred_on`
 *      (casos 28, 30 e 31 da spec).
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const desfechoReal = require('./desfecho-voz-real.cjs');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (c, nome) => { assert.ok(c, nome); checagens++; console.log('  ok  ' + nome); };

const AGORA = new Date(2026, 8, 30, 12, 0, 0).getTime();
class DataFalsa extends Date {
  constructor(...a) { if (a.length) super(...a); else super(AGORA); }
  static now() { return AGORA; }
}

const compilar = (arquivo, jsx) => ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;

/* lib/ REAL, com o relógio falso. */
const libs = new Map();
function lib(nome) {
  if (libs.has(nome)) return libs.get(nome);
  const exports = {};
  libs.set(nome, exports);
  vm.runInNewContext(compilar(`lib/${nome}.ts`), {
    exports, console, JSON, Date: DataFalsa, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => {
      if (id.startsWith('./')) return lib(id.slice(2));
      throw new Error(`import não simulado em lib/${nome}: ${id}`);
    },
  }, { filename: `lib/${nome}.ts` });
  return exports;
}

/* ── mini-runtime de hooks (efeito só quando as dependências mudam) ────── */
const celulas = [];
let cursor = 0;
const react = {
  useState(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = typeof inicial === 'function' ? inicial() : inicial;
    return [celulas[k], (v) => { celulas[k] = typeof v === 'function' ? v(celulas[k]) : v; }];
  },
  useRef(inicial) {
    const k = cursor++;
    if (!(k in celulas)) celulas[k] = { current: inicial };
    return celulas[k];
  },
  useEffect(efeito, deps) {
    const k = cursor++;
    const antes = celulas[k];
    if (!antes || !deps || deps.some((d, i) => d !== antes[i])) { celulas[k] = deps ?? []; efeito(); }
  },
};

const registro = { alertas: [], gravados: [], voz: [] };
/** O que o núcleo devolve na próxima gravação de voz (caso 31). */
let respostaDaVoz = null;
const imports = {
  react,
  'react/jsx-runtime': {
    Fragment: 'Fragment',
    jsx: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
    jsxs: (type, props) => (typeof type === 'function' ? type(props) : { type, props }),
  },
  'react-native': { ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (s) => s }, Text: 'Text', TextInput: 'TextInput', View: 'View', ScrollView: 'ScrollView' },
  './AppModal': { __esModule: true, default: 'AppModal' },
  '@/lib/alerta': { Alert: { alert: (...a) => registro.alertas.push(a) } },
  '@expo/vector-icons/Ionicons': 'Ionicons',
  '@/lib/theme': { theme: {}, radius: {}, spacing: {}, type: {}, fonts: {}, touchTarget: 48, hitSlopPara: () => 0, lh: () => 0 },
  '@/lib/heuristics': lib('heuristics'),
  '@/lib/format': lib('format'),
  '@/lib/nota-foto-parser': lib('nota-foto-parser'),
  '@/lib/voz-confiabilidade': lib('voz-confiabilidade'),
  '@/lib/limits': lib('limits'),
  '@/lib/data': { fetchCategories: async () => [] },
  '@/lib/offline-cache': { salvarOuGuardarNoAparelho: async (input) => { registro.gravados.push(input); return { guardado: false }; } },
  '@/lib/lancamentos-alterados': { marcarLancamentosAlterados() {} },
  '@/lib/erros': { mensagemErro: (e) => String(e) },
  '@/lib/demo-context': { useDemo: () => ({ isDemoMode: false }) },
  '@/lib/wallet-context': { useWallet: () => ({ wallets: [{ id: 'w', name: 'AUDIT', is_default: true, color: '#fff' }], activeWallet: { id: 'w' } }) },
  './CategoryChips': 'CategoryChips',
  './AppPressable': 'AppPressable',
  './Sheet': 'Sheet',
  './DatePickerModal': 'DatePickerModal',
  'expo-crypto': { randomUUID: () => 'op-1' },
  '@/lib/voice-operations': {
    desfechoDaOperacaoVoz: desfechoReal,
    registrarOperacaoVoz: async (id, source, payload, transcricao, falaGuardada) => {
      registro.voz.push({ id, source, payload, falaGuardada });
      return respostaDaVoz ?? { status: 'committed', operationId: id, kind: payload.kind, ids: ['tx'], replayed: false };
    },
  },
  '@/lib/voz': { mensagemDeErroVoz: (c) => ({ titulo: 'Erro ' + c, texto: '' }) },
  '@/lib/data-da-fala': lib('data-da-fala'),
};
function componente(arquivo) {
  const exports = {};
  vm.runInNewContext(compilar(arquivo, true), {
    exports, console, Promise, String, Number, Object, Array, JSON, Date: DataFalsa,
    require: (n) => { assert.ok(n in imports, `import não simulado em ${arquivo}: ${n}`); return imports[n]; },
  }, { filename: arquivo });
  return exports;
}
imports['./LinhaDataDaCompra'] = componente('components/LinhaDataDaCompra.tsx');
imports['./TransactionSheet'] = require('./sheet-real.cjs')(imports, DataFalsa);
const PasteReceiptModal = componente('components/PasteReceiptModal.tsx').default;

let props;
const render = () => { cursor = 0; return PasteReceiptModal(props); };
function achar(no, pred, acc = []) {
  if (!no || typeof no !== 'object') return acc;
  if (Array.isArray(no)) { no.forEach((n) => achar(n, pred, acc)); return acc; }
  if (pred(no)) acc.push(no);
  achar(no.props?.children, pred, acc);
  return acc;
}
const porRotulo = (arvore, re) => achar(arvore, (n) => re.test(String(n.props?.accessibilityLabel)))[0];
const linhaData = (arvore) => porRotulo(arvore, /^Data do lançamento:/);
const seletor = (arvore) => achar(arvore, (n) => n.type === 'DatePickerModal')[0];
const textos = (arvore) => achar(arvore, (n) => n.type === 'Text').map((n) => [].concat(n.props.children).join(''));
const esperar = () => new Promise((r) => setImmediate(r));

function abrir(extra = {}) {
  celulas.length = 0;
  imports['./TransactionSheet'].reset();
  props = { visible: true, onClose() {}, onSuccess() {}, ...extra };
  return render();
}
function colar(texto) {
  abrir();
  porRotulo(render(), /^Texto do comprovante$/).props.onChangeText(texto);
  achar(render(), (n) => n.props?.onPress?.name === 'handleProcessText')[0].props.onPress();
  return render();
}
async function salvar() {
  await achar(render(), (n) => n.props?.onPress?.name === 'salvar')[0].props.onPress();
  await esperar();
}

(async () => {
  /* ── 1. Data lida do texto: selo, edição e a data gravada ─────────────── */
  let tela = colar('Pix enviado para Mercado AUDIT R$ 50,00 em 26/09/2026 18:42');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: 26 set 2026, lida do texto', 'a data do texto aparece no campo, com o selo');
  ok(!textos(tela).some((t) => /Também reconhecido:.*data/.test(t)), 'a data não aparece mais como chip em "Também reconhecido"');
  {
    /* Selo cortado a 1.3 (achado do P2, 30/09/2026): a linha quebra no fluxo,
       e nenhum texto dela encolhe ou cresce (424dd7a). O estilo é provado
       aqui; a geometria do Yoga em tela fica no P2, a 1.0 e 1.3. */
    const linha = linhaData(tela);
    const estilo = linha.props.style;
    ok(estilo.flexWrap === 'wrap' && 'rowGap' in estilo && estilo.flexDirection === 'row', 'a linha "Data da compra" quebra quando não cabe (flexWrap + rowGap)');
    const textos = achar(linha, (n) => n.type === 'Text');
    ok(textos.length >= 2 && textos.every((t) => !('flexShrink' in (t.props.style ?? {})) && !('flexGrow' in (t.props.style ?? {}))), 'nenhum texto da linha usa flexShrink ou flexGrow');
  }
  linhaData(tela).props.onPress();
  ok(seletor(render()).props.visible === true && seletor(render()).props.currentISO === '2026-09-26', 'o toque abre o seletor na data lida');
  seletor(render()).props.onSelectDate('2026-10-02');
  seletor(render()).props.onClose();
  ok(linhaData(render()).props.accessibilityLabel === 'Data do lançamento: 30 set 2026', 'futura no seletor vira hoje, sem selo');
  ok(seletor(render()).props.visible === false, 'o seletor fecha');
  seletor(render()).props.onSelectDate('2026-09-20');
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados.length === 1 && registro.gravados[0].occurred_on === '2026-09-20', 'grava a data escolhida no campo');

  /* ── 1b. Descrição sem o resto da data (achado do P2, 30/09/2026) ─────── */
  tela = colar('AUDIT Pix recebido em 29/09/2026 R$ 500,00');
  ok(porRotulo(tela, /^Descrição do lançamento$/)?.props.value === 'AUDIT Pix recebido', 'a descrição sai sem "em / /"');
  ok(porRotulo(tela, /^Valor do lançamento em reais$/)?.props.value === '500,00', 'o valor é 500,00');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: 29 set 2026, lida do texto', 'a data continua lida do texto original, com o selo');
  /* "AUDIT Pix recebido" não tem categoria reconhecida: a pessoa escolhe. */
  achar(render(), (n) => n.type === 'CategoryPickerModal')[0].props.onSelectCategory({ name: 'Alimentação', color: '#123456' });
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados[0]?.occurred_on === '2026-09-29' && registro.gravados[0]?.description === 'AUDIT Pix recebido' && registro.gravados[0]?.amount === 500,
    'grava a descrição limpa, o valor e a data do texto');
  tela = colar('TV parcela 2/12 R$ 1.250,50 em 26/09/2026');
  ok(porRotulo(tela, /^Valor do lançamento em reais$/)?.props.value === '1.250,50', 'valor decimal intacto');
  ok(/parcela/i.test(porRotulo(tela, /^Descrição do lançamento$/)?.props.value ?? ''), 'a parcela "2/12" não é lida como data');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: 26 set 2026, lida do texto', 'e a data certa é a 26/09');

  /* ── 2. Sem data no texto: hoje, sem selo ─────────────────────────────── */
  tela = colar('Pix enviado para Mercado AUDIT R$ 50,00');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: 30 set 2026', 'sem data no texto, hoje e sem selo');
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados[0]?.occurred_on === '2026-09-30', 'grava hoje');

  /* ── 3. Data recusada: campo sem data, dica e Salvar bloqueado ────────── */
  tela = colar('Pix enviado para Mercado AUDIT R$ 50,00 em 05/10/2026 18:42');
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: Escolha a data', 'data futura no texto: o campo fica sem data');
  ok(textos(tela).includes('A data do texto não foi usada. Escolha a data.'), 'com a dica');
  registro.gravados.length = 0;
  registro.alertas.length = 0;
  await salvar();
  ok(registro.gravados.length === 0 && textos(render()).includes('Escolha a data'), 'o Salvar não grava sem data e pede a escolha');
  linhaData(render()).props.onPress();
  seletor(render()).props.onSelectDate('2026-09-28');
  ok(!textos(render()).includes('A data do texto não foi usada. Escolha a data.'), 'escolhida a data, a dica some');
  await salvar();
  ok(registro.gravados.length === 1 && registro.gravados[0].occurred_on === '2026-09-28', 'e grava a data escolhida');

  /* ── 4. Revisão de voz: a data da fala, pelo núcleo ───────────────────── */
  const REF = (referencia, aproximada = false) => ({ referencia, aproximada });
  const descricao = (arvore) => porRotulo(arvore, /^Descrição do lançamento$/)?.props.value;
  abrir({ initialText: 'mercado 50 reais ontem', falaGuardada: 'fala-1', referenciaDaVoz: REF('2026-09-30') });
  tela = render();
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: 29 set 2026', 'voz: "ontem" vira 29/09 no campo, sem selo');
  ok(descricao(tela) === 'Mercado', 'e a descrição fica sem "ontem"');
  registro.voz.length = 0;
  await salvar();
  ok(registro.voz.length === 1 && registro.voz[0].payload.occurred_on === '2026-09-29' && registro.voz[0].falaGuardada === 'fala-1',
    'grava 29/09, com a fala guardada');

  /* Caso 28: fala guardada revista 3 dias depois conta da captura. */
  abrir({ initialText: 'almoço ontem 30 reais', falaGuardada: 'fala-2', referenciaDaVoz: REF('2026-09-27') });
  ok(linhaData(render())?.props.accessibilityLabel === 'Data do lançamento: 26 set 2026', 'caso 28: captura em 27/09, "ontem" é 26/09 mesmo revisto em 30/09');

  /* Caso 30: data futura dita. Campo vazio, dica, Salvar bloqueado; a data
     escolhida é a enviada. */
  abrir({ initialText: 'cinema amanhã 40 reais', referenciaDaVoz: REF('2026-09-30') });
  tela = render();
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: Escolha a data', 'futura: campo vazio, nada pré-selecionado');
  ok(textos(tela).includes('Você disse 01/10, que ainda não chegou.'), 'com a dica da data dita');
  registro.voz.length = 0;
  registro.alertas.length = 0;
  await salvar();
  ok(registro.voz.length === 0 && textos(render()).includes('Escolha a data'), 'o Salvar não grava sem a escolha');
  linhaData(render()).props.onPress();
  seletor(render()).props.onSelectDate('2026-10-01');
  ok(linhaData(render()).props.accessibilityLabel === 'Data do lançamento: 30 set 2026', 'o seletor não aceita a futura: vira hoje');
  seletor(render()).props.onSelectDate('2026-09-28');
  ok(!textos(render()).includes('Você disse 01/10, que ainda não chegou.'), 'escolhida a data, a dica some');
  await salvar();
  ok(registro.voz.length === 1 && registro.voz[0].payload.occurred_on === '2026-09-28', 'caso 30: a data editada vai no occurred_on');

  /* Referência aproximada (fala antiga) e sem referência: relativa pede escolha. */
  abrir({ initialText: 'almoço ontem 30 reais', referenciaDaVoz: REF('2026-09-30', true) });
  ok(linhaData(render())?.props.accessibilityLabel === 'Data do lançamento: Escolha a data', 'aproximada: "ontem" fica para a pessoa escolher');
  /* r2 do Forge: a incerteza é explicada, com a data que a fala indicou, sem
     pré-selecioná-la; e nada é gravado antes da escolha. */
  ok(textos(render()).includes('Você disse ontem. Entendi 29/09.'), 'aproximada: a dica mostra a proposta');
  registro.voz.length = 0;
  registro.alertas.length = 0;
  await salvar();
  ok(registro.voz.length === 0 && textos(render()).includes('Escolha a data'), 'aproximada: nada gravado antes da escolha');
  abrir({ initialText: 'mercado 50 reais hoje', referenciaDaVoz: REF('2026-09-30', true) });
  ok(textos(render()).includes('Você disse hoje. Entendi 30/09.'), 'aproximada: "hoje" também pede escolha, com a dica');
  abrir({ initialText: 'almoço ontem 30 reais' });
  ok(linhaData(render())?.props.accessibilityLabel === 'Data do lançamento: Escolha a data', 'sem referência: idem');
  ok(textos(render()).includes('Você disse ontem. Entendi 30/09.'.replace('30/09', '29/09')), 'sem referência: a dica também aparece');
  abrir({ initialText: 'mercado dia 30 de fevereiro 20 reais', referenciaDaVoz: REF('2026-09-30') });
  ok(textos(render()).includes('Você disse 30/02, que não existe.'), 'impossível: a dica aparece');
  abrir({ initialText: 'mercado 50 reais' });
  ok(linhaData(render())?.props.accessibilityLabel === 'Data do lançamento: 30 set 2026', 'sem data dita: hoje');

  /* Achado 8: "passe do dia 10 reais" abre na data da captura, com o 10
     como valor e "dia" no nome, e grava assim. */
  abrir({ initialText: 'passe do dia 10 reais', referenciaDaVoz: REF('2026-09-30') });
  tela = render();
  ok(linhaData(tela)?.props.accessibilityLabel === 'Data do lançamento: 30 set 2026', 'achado 8: campo na data da captura, nunca 10/09');
  ok(porRotulo(tela, /^Valor do lançamento em reais$/)?.props.value === '10,00', 'achado 8: o valor é 10');
  ok(/dia/i.test(descricao(tela) ?? ''), `achado 8: o "dia" fica no nome (${descricao(tela)})`);

  /* Caso 31: a revisão troca a data de uma fala que já foi ao servidor; o
     núcleo devolve o 22023 como "já usada" (C3), e a tela mostra o recibo. */
  abrir({ initialText: 'mercado 50 reais ontem', falaGuardada: 'fala-3', referenciaDaVoz: REF('2026-09-30') });
  linhaData(render()).props.onPress();
  seletor(render()).props.onSelectDate('2026-09-27');
  respostaDaVoz = { status: 'committed', operationId: 'fala-3', kind: 'transaction', ids: [], replayed: true, conflito: true };
  registro.alertas.length = 0;
  await salvar();
  respostaDaVoz = null;
  ok(registro.alertas.at(-1)?.[0] === 'Erro ja_usada', 'caso 31: "Fala já usada", sem recibo de lançamento novo');

  /* ── 5. Categoria criada na própria lista (B1, 08/10/2026) ─────────────── */
  /* Com a janela única a categoria vem do seletor, que também CRIA e renomeia
     categoria. A lista que o Colar buscou ao abrir não a conhece (aqui
     `fetchCategories` devolve vazio): a escolha da pessoa vale, com o nome e
     a cor que o seletor entregou. Antes o Salvar respondia "Qual categoria?"
     com a categoria escolhida na tela, e nunca gravava. */
  const escolher = (categoria) => achar(render(), (n) => n.type === 'CategoryPickerModal')[0].props.onSelectCategory(categoria);
  colar('AUDIT Pix recebido em 29/09/2026 R$ 500,00');
  escolher({ name: 'Freela AUDIT', color: '#3fd46a' });
  registro.gravados.length = 0;
  registro.alertas.length = 0;
  await salvar();
  ok(registro.gravados.length === 1 && registro.gravados[0].category === 'Freela AUDIT' && registro.gravados[0].color === '#3fd46a',
    'Colar: categoria criada no seletor é gravada, com o nome e a cor escolhidos');
  ok(!registro.alertas.some((a) => a[0] === 'Qual categoria?'), 'Colar: sem a pergunta "Qual categoria?" depois da escolha');
  abrir({ initialText: 'bico de sábado 80 reais', referenciaDaVoz: REF('2026-09-30') });
  escolher({ name: 'Freela AUDIT', color: '#3fd46a' });
  registro.voz.length = 0;
  registro.alertas.length = 0;
  await salvar();
  ok(registro.voz.length === 1 && registro.voz[0].payload.category === 'Freela AUDIT' && registro.voz[0].payload.color === '#3fd46a',
    'voz no débito: categoria criada no seletor é gravada pelo núcleo da voz');
  /* E continua valendo: sem categoria nenhuma, nada é gravado. */
  colar('AUDIT Pix recebido em 29/09/2026 R$ 500,00');
  registro.gravados.length = 0;
  await salvar();
  ok(registro.gravados.length === 0, 'Colar: sem categoria escolhida, continua sem gravar');

  console.log(`\n${checagens} checagens da data da compra no Colar passaram — 0 falhas`);
})().catch((e) => { console.error(e); process.exit(1); });
