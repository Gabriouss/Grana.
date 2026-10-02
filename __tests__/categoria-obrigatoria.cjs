/*
 * Categoria obrigatória em toda entrada que não é voz (27/09/2026).
 *
 *   node __tests__/categoria-obrigatoria.cjs
 *
 * Decisão do autor de 26/09/2026: lançamento sem categoria clara pergunta
 * "Qual categoria?" e nunca grava em "Outros" nem em categoria padrão. A voz
 * já fazia isso; o Colar comprovante preenchia "Outros" quando nada casava e
 * o Salvar gravava direto (três lançamentos do R5 foram para "Outros", achado
 * do Harbor). QR e foto da nota abriam com "Alimentação" marcada; os
 * formulários manuais com "Alimentação" ou "Salário" (e "Outros" no boleto);
 * a importação de extrato gravava "Outros" em toda linha não reconhecida.
 *
 * Módulos REAIS: lib/heuristics.ts (critério, CSV), lib/ofx-parser.ts e o
 * components/TransactionSheet.tsx executado (o formulário comum de Início,
 * Lançamentos, Contas e Crédito): sem categoria, o Salvar NÃO chama o
 * gravador. Nos modais que só leem a tela (Colar, QR, foto, importação) a
 * guarda é conferida no código, na ordem: pergunta antes de gravar.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };

const cache = new Map();
function carregar(arquivo) {
  const abs = path.join(root, arquivo);
  if (cache.has(abs)) return cache.get(abs);
  const exports = {};
  cache.set(abs, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Set, Map, Intl,
    require: (id) => {
      if (id.startsWith('./')) return carregar(path.join(path.dirname(arquivo), id.slice(2) + '.ts'));
      throw new Error(`import não simulado em ${arquivo}: ${id}`);
    },
  }, { filename: arquivo });
  return exports;
}

const h = carregar('lib/heuristics.ts');
const { parseOfx } = carregar('lib/ofx-parser.ts');

/* ── 1. O critério: palpite não reconhecido é "nenhuma" ─────────────────── */
assert.equal(h.categoriaReconhecida('Transferência 45,00 para Fulano'), null, 'nada casou: nenhuma, nunca "Outros"');
assert.equal(h.guessCategoryFromText('Transferência 45,00 para Fulano').name, 'Outros', '(o palpite cru seria "Outros")');
assert.equal(h.categoriaReconhecida('Mercado 120,00')?.name, 'Alimentação', 'reconhecida continua valendo');
assert.equal(h.categoriaReconhecida('Projeto Aurora 20', [{ name: 'Projeto Aurora', color: '#123' }])?.name, 'Projeto Aurora',
  'categoria criada pela pessoa também é reconhecida');
assert.equal(h.categoriaEscolhida(''), null, 'nada marcado: nenhuma');
assert.equal(h.categoriaEscolhida('  '), null);
assert.equal(h.categoriaEscolhida('Outros')?.name, 'Outros', '"Outros" escolhido de propósito vale');
assert.equal(h.categoriaEscolhida('Projeto Aurora', [{ name: 'Projeto Aurora', color: '#123' }])?.color, '#123');
assert.equal(h.PERGUNTA_CATEGORIA.titulo, 'Qual categoria?', 'o mesmo título que a voz usa');
ok('categoriaReconhecida e categoriaEscolhida: sem reconhecimento nem escolha, nenhuma categoria');

/* ── 2. A voz usa a mesma regra ─────────────────────────────────────────── */
const tarefa = fs.readFileSync(path.join(root, 'lib/widget-voz-task.ts'), 'utf8');
assert.match(tarefa, /if \(categoria\.name === 'Outros'\) \{\s*await notificacoes\.notificarRevisao\('Qual categoria\?'/,
  'a voz pergunta "Qual categoria?" no mesmo caso');
ok('a voz continua perguntando no mesmo caso (mesmo critério)');

/* ── 3. Importação: CSV e OFX não inventam "Outros" ─────────────────────── */
{
  const csv = h.parseCsvTextDetalhado('Data;Descrição;Valor\n10/09/2026;Transferência Fulano;-45,00\n11/09/2026;Mercado Extra;-120,00');
  assert.equal(csv.rows.length, 2);
  assert.equal(csv.rows[0].category, '', 'CSV: linha não reconhecida chega sem categoria');
  assert.equal(csv.rows[1].category, 'Alimentação', 'CSV: linha reconhecida mantém');
  const explicito = h.parseCsvTextDetalhado('Data;Descrição;Valor;Categoria\n10/09/2026;Transferência Fulano;-45,00;Outros');
  assert.equal(explicito.rows[0].category, 'Outros', 'CSV: "Outros" escrito no arquivo é escolha, vale');
  const ofx = parseOfx(`<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910<TRNAMT>-45.00<FITID>1<MEMO>Transferencia Fulano</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260911<TRNAMT>-120.00<FITID>2<MEMO>Mercado Extra</STMTTRN>
</BANKTRANLIST></OFX>`);
  assert.equal(ofx.lancamentos.length, 2);
  assert.equal(ofx.lancamentos[0].category, '', 'OFX: linha não reconhecida chega sem categoria');
  assert.equal(ofx.lancamentos[1].category, 'Alimentação');
  const modal = fs.readFileSync(path.join(root, 'components/ImportarExtratoModal.tsx'), 'utf8');
  const confirmar = modal.slice(modal.indexOf('async function confirmar()'), modal.indexOf('return (\n    <>'.replace('\n', modal.includes('\r\n') ? '\r\n' : '\n')));
  const iPergunta = confirmar.indexOf('if (semCategoria > 0)');
  const iGrava = confirmar.indexOf('addTransactionsBatch(');
  assert.ok(iPergunta > 0 && iGrava > iPergunta, 'a importação pergunta ANTES de gravar');
  assert.match(confirmar.slice(iPergunta, iGrava), /PERGUNTA_CATEGORIA\.titulo[\s\S]*return;/, 'e não grava sem escolha');
  assert.match(modal, /l\.category \? l : \{ \.\.\.l, category: name, color \}/, 'a escolha vale só para as linhas sem categoria');
}
ok('importação: CSV e OFX sem palpite chegam sem categoria, e a tela pergunta antes de gravar');

/* ── 3b. O aviso da importação concorda com 1 e com N (item 4b, 30/09/2026) ──
   Com uma linha, a frase dizia "1 lançamento está [...] Escolha a categoria
   deles" (Flare). O texto do Alert é tirado do fonte pela árvore do
   TypeScript (o segundo argumento do Alert dentro de `if (semCategoria > 0)`,
   que tem template aninhado) e AVALIADO com 1 e com 3. */
function avisoSemCategoria(fonte) {
  const sf = ts.createSourceFile('ImportarExtratoModal.tsx', fonte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let alvo = null;
  (function visitar(no) {
    if (ts.isIfStatement(no) && no.expression.getText(sf) === 'semCategoria > 0') {
      (function acharAlert(n) {
        if (!alvo && ts.isCallExpression(n) && n.expression.getText(sf) === 'Alert.alert') alvo = n.arguments[1];
        ts.forEachChild(n, acharAlert);
      })(no.thenStatement);
    }
    if (!alvo) ts.forEachChild(no, visitar);
  })(sf);
  assert.ok(alvo, 'o Alert de "sem categoria" da importação existe');
  const js = ts.transpileModule('module.exports = (semCategoria) => ' + alvo.getText(sf) + ';', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m });
  return m.exports;
}
{
  const aviso = avisoSemCategoria(fs.readFileSync(path.join(root, 'components/ImportarExtratoModal.tsx'), 'utf8'));
  assert.equal(aviso(1), '1 lançamento está sem categoria reconhecida. Escolha uma categoria para cada lançamento antes de importar. Nada foi importado ainda.');
  assert.equal(aviso(3), '3 lançamentos estão sem categoria reconhecida. Escolha uma categoria para cada lançamento antes de importar. Nada foi importado ainda.');
}
ok('importação: o aviso "sem categoria" concorda no singular e no plural');

/* ── 4. Formulário comum executado: sem categoria, não grava ─────────────── */
{
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const es = (v) => ({ __esModule: true, default: v });
  const modulo = {};
  const abertos = [];
  const erros = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'components/TransactionSheet.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: modulo, console, require: (name) => {
    const mods = {
      react: {
        /* O setter de cada estado registra o que a tela faria: pedir a
           categoria (erro) e abrir a lista (picker). */
        useState: (v) => [typeof v === 'function' ? v() : v, (novo) => {
          if (typeof novo === 'string' && /categoria/i.test(novo)) erros.push(novo);
          if (novo === true) abertos.push(true);
        }],
        useMemo: (fn) => fn(),
        useEffect: () => {},
      },
      'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      'react-native': {
        ActivityIndicator: 'ActivityIndicator', ScrollView: 'ScrollView', StyleSheet: { create: (s) => s },
        Text: 'Text', TextInput: 'TextInput', View: 'View',
      },
      './AppModal': es('AppModal'),
      './ToggleSwitch': es('ToggleSwitch'),
      '@expo/vector-icons/Ionicons': es('Ionicons'),
      '@/components/AppPressable': es('AppPressable'),
      '@/components/Sheet': es('Sheet'),
      '@/components/DatePickerModal': es('DatePickerModal'),
      '@/components/LinhaDataDaCompra': { dataEscolhidaNoSeletor: (iso, hoje) => (iso > hoje ? hoje : iso) },
      '@/components/CategoryPickerModal': es('CategoryPickerModal'),
      '@/lib/format': {
        formatDateLabel: () => '27 set 2026', formatMoney: (v) => String(v), formatMoneyInput: (v) => v,
        parseAmount: (v) => Number(String(v).replace(',', '.')) || 0, todayISO: () => '2026-09-27',
      },
      '@/lib/limits': { LIMITS: new Proxy({}, { get: () => 100 }) },
      '@/lib/heuristics': h,
      '@/lib/theme': {
        theme: new Proxy({}, { get: (_, k) => String(k) }), radius: {}, fonts: {}, touchTarget: 48, lh: (n) => n * 1.4,
        spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }, type: new Proxy({}, { get: () => 14 }),
      },
    };
    assert.ok(name in mods, `import inesperado: ${name}`);
    return mods[name];
  } });
  const nos = function* nos(no) {
    if (!no || typeof no !== 'object') return;
    if (Array.isArray(no)) { for (const n of no) yield* nos(n); return; }
    yield no;
    yield* nos(no.props?.children);
  };
  for (const modo of ['carteira', 'credito', 'boleto']) {
    const gravados = [];
    const base = {
      type: 'out', description: 'Mercado', amount: '120', color: '', occurred_on: '2026-09-27',
      recurring: false, installments: 1, card_id: 'c1', wallet_id: 'w1',
    };
    const props = (category) => ({
      visible: true, onClose: () => {}, modo, editando: false, salvando: false, onSalvar: (v) => gravados.push(v),
      carteiras: [{ id: 'w1', name: 'Principal', is_default: true }],
      cartoes: [{ id: 'c1', name: 'C6', wallet_id: 'w1' }],
      inicial: { ...base, category },
    });
    const semCategoria = modulo.default(props(''));
    const linha = [...nos(semCategoria)].find((n) => n.props?.accessibilityLabel === 'Categoria: não escolhida');
    assert.ok(linha, `${modo}: a linha diz que nenhuma categoria foi escolhida`);
    const botao = [...nos(semCategoria)].find((n) => typeof n.props?.onPress === 'function' && n.props.onPress.name === 'salvar');
    assert.ok(botao, `${modo}: botão de salvar encontrado`);
    erros.length = 0; abertos.length = 0;
    botao.props.onPress();
    assert.equal(gravados.length, 0, `${modo}: sem categoria, nada é gravado`);
    assert.ok(erros.some((e) => e.startsWith('Qual categoria?')), `${modo}: pergunta "Qual categoria?"`);
    assert.ok(abertos.length > 0, `${modo}: e abre a lista de categorias`);

    const comCategoria = modulo.default(props('Alimentação'));
    [...nos(comCategoria)].find((n) => typeof n.props?.onPress === 'function' && n.props.onPress.name === 'salvar').props.onPress();
    assert.equal(gravados.length, 1, `${modo}: com categoria escolhida, grava`);
    assert.equal(gravados[0].category, 'Alimentação');
  }
}
ok('formulário comum (Início, Lançamentos, Contas, Crédito): sem categoria, pergunta e não grava, nos três modos');

/* ── 5. Nenhuma tela abre com categoria padrão, e os modais perguntam antes ── */
{
  const ler = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  for (const [arquivo, funcoes] of [
    ['app/(app)/index.tsx', ['openTxModal', 'openBillModal']],
    ['app/(app)/lancamentos.tsx', ['openNewModal']],
    ['app/(app)/contas.tsx', ['openNewModal', 'abrirNovaContaDoTexto']],
    ['app/(app)/credito.tsx', ['abrirNovaCompra', 'abrirNovaCompraDoTexto']],
  ]) {
    const fonte = ler(arquivo);
    for (const nome of funcoes) {
      const i = fonte.indexOf(`function ${nome}(`);
      assert.ok(i >= 0, `${arquivo}: ${nome} existe`);
      const corpo = fonte.slice(i, fonte.indexOf('\n  }', i));
      assert.doesNotMatch(corpo, /CATEGORIES\[(0|CATEGORIES\.length - 1)\]|'Salário'|guessCategoryFromText/,
        `${arquivo}: ${nome} não marca categoria padrão nem "Outros" de palpite`);
    }
  }
  for (const arquivo of ['components/PasteReceiptModal.tsx', 'components/QrScannerModal.tsx', 'components/FotoNotaModal.tsx']) {
    const fonte = ler(arquivo);
    assert.doesNotMatch(fonte, /useState\('Alimentação'\)|setCategory\('Alimentação'\)/, `${arquivo}: não abre com "Alimentação"`);
    assert.doesNotMatch(fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /guessCategoryFromText/, `${arquivo}: não usa o palpite cru (que cai em "Outros")`);
    const salvar = fonte.slice(fonte.indexOf('async function handleSave()'));
    const iPergunta = salvar.indexOf('PERGUNTA_CATEGORIA.titulo');
    const iGrava = Math.min(...['registrarOperacaoVoz(', 'salvarOuGuardarNoAparelho(', 'montarLancamentoDaFoto(']
      .map((f) => salvar.indexOf(f)).filter((i) => i >= 0));
    assert.ok(iPergunta > 0 && iPergunta < iGrava, `${arquivo}: pergunta a categoria ANTES de gravar`);
    assert.match(salvar.slice(0, iGrava), /categoriaEscolhida\(/, `${arquivo}: só grava a categoria escolhida`);
  }
}
ok('nenhuma tela de lançamento abre com categoria padrão; Colar, QR e foto perguntam antes de gravar');

console.log(`\n${checagens} checagens da categoria obrigatória passaram — 0 falhas`);
