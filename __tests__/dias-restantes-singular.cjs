/*
 * "1 dia restante" no último dia do mês, igual em todo lugar (30/09/2026).
 *
 *   node __tests__/dias-restantes-singular.cjs
 *
 * Achado do Vigil no P2: no dia 30/09 a Início mostrava "Livre no total ·
 * 1 dia restantes". O widget Livre dizia "1 dias restantes" e "· 1 dias", e o
 * Granabô recebia "(1 dias restantes)" no texto da ferramenta. A mesma
 * palavra mostra o mesmo texto em todo lugar (regra 20).
 *
 * Módulos REAIS: `rotuloDiasRestantes` de lib/safe-to-spend.ts e de
 * supabase/functions/_shared/caixa.ts, e o components/SafeToSpendCard.tsx
 * executado (dublês só para react-native, tema e PrivacyValue). O Kotlin do
 * widget não compila aqui: o texto dele é conferido no fonte, contra a saída
 * do módulo TS.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
let checagens = 0;
const ok = (nome) => { checagens++; console.log('  ok  ' + nome); };
const ler = (arquivo) => fs.readFileSync(path.join(root, arquivo), 'utf8');

function carregar(arquivo, dubles = {}) {
  const exports = {};
  const js = ts.transpileModule(ler(arquivo), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, Date, Math,
    require: (id) => {
      if (id in dubles) return dubles[id];
      throw new Error('import nao simulado em ' + arquivo + ': ' + id);
    },
  });
  return exports;
}

const app = carregar('lib/safe-to-spend.ts', { './transaction-rules': { isCreditTx: () => false } });
const granabo = carregar('supabase/functions/_shared/caixa.ts');

/* ── 1. O texto, e o mesmo na Início e no Granabô ─────────────────────── */
assert.equal(app.rotuloDiasRestantes(1), '1 dia restante');
assert.equal(app.rotuloDiasRestantes(2), '2 dias restantes');
assert.equal(app.rotuloDiasRestantes(31), '31 dias restantes');
for (let n = 1; n <= 31; n++) {
  assert.equal(granabo.rotuloDiasRestantes(n), app.rotuloDiasRestantes(n), `Granabô x Início com ${n} dia(s)`);
}
ok('rotuloDiasRestantes: "1 dia restante" e "N dias restantes", iguais na Início e no Granabô');

/* ── 2. O card da Início executado com 1 e com 3 dias ─────────────────── */
function textoDoCard(diasRestantes) {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const qualquer = new Proxy({}, { get: (_alvo, chave) => (chave === Symbol.toPrimitive ? () => 0 : qualquer) });
  const { default: Card } = carregar('components/SafeToSpendCard.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: (s) => s }, Text: 'Text', View: 'View' },
    '@/lib/theme': { theme: qualquer, radius: qualquer, spacing: qualquer, card: qualquer, fonts: qualquer, type: qualquer, lh: () => 0 },
    '@/lib/format': { formatBRLSaldo: String, formatBRLSubtraido: String, formatMoney: String },
    '@/lib/safe-to-spend': app,
    './PrivacyValue': { __esModule: true, default: 'PrivacyValue' },
  });
  const textos = [];
  (function juntar(no) {
    if (no == null || no === false) return;
    if (typeof no === 'string' || typeof no === 'number') { textos.push(String(no)); return; }
    if (Array.isArray(no)) { no.forEach(juntar); return; }
    if (no.type === 'Text') { textos.push([].concat(no.props.children).filter((c) => typeof c !== 'object').join('')); }
    juntar(no.props?.children);
  })(Card({ data: { livrePorDia: 10, livreTotal: 10 * diasRestantes, saldoAtual: 100, reservadoEmMetas: 0, diasRestantes } }));
  return textos;
}
{
  const um = textoDoCard(1);
  assert.ok(um.includes('Livre no total · 1 dia restante'), 'Início com 1 dia: ' + JSON.stringify(um));
  assert.ok(!um.some((t) => /1 dias?\s+restantes/.test(t)), 'Início com 1 dia não diz "restantes"');
  assert.ok(textoDoCard(3).includes('Livre no total · 3 dias restantes'), 'Início com 3 dias');
}
ok('Início: "Livre no total · 1 dia restante" no último dia, plural nos outros');

/* ── 3. Widget Livre (Kotlin), conferido no fonte contra o TS ─────────── */
{
  const dir = 'modules/grana-voice-widget/android/src/main/java/com/gabriouss/grana/voicewidget/';
  const texto = ler(dir + 'WidgetText.kt');
  const provider = ler(dir + 'LivreParaGastarWidgetProvider.kt');
  const longo = texto.match(/fun diasRestantes\(dias: Int\): String = if \(dias == 1\) "([^"]+)" else "\$dias ([^"]+)"/);
  assert.ok(longo, 'WidgetText.diasRestantes com o singular no 1');
  assert.equal(longo[1], app.rotuloDiasRestantes(1), 'widget e Início, 1 dia');
  assert.equal('2 ' + longo[2], app.rotuloDiasRestantes(2), 'widget e Início, 2 dias');
  const curto = texto.match(/fun dias\(dias: Int\): String = if \(dias == 1\) "1 dia" else "\$dias dias"/);
  assert.ok(curto, 'WidgetText.dias com o singular no 1');
  assert.match(provider, /WidgetText\.diasRestantes\(snapshot\.safeToSpend\.diasRestantes\)/, 'o widget sem saldo usa o rótulo');
  assert.match(provider, /no total · \$\{WidgetText\.dias\(snapshot\.safeToSpend\.diasRestantes\)\}/, 'o widget com saldo usa o rótulo curto');
  assert.ok(!/diasRestantes\} dias/.test(provider), 'nenhum "N dias" montado à mão no widget');
}
ok('widget Livre: "1 dia restante" e "· 1 dia", com o mesmo texto da Início');

/* ── 4. Granabô: a ferramenta do Livre usa o rótulo ──────────────────── */
{
  const indice = ler('supabase/functions/assistente-financeiro/index.ts');
  assert.match(indice, /por dia \(\$\{rotuloDiasRestantes\(r\.diasRestantes\)\}\)/, 'o texto do Livre no Granabô usa o rótulo');
  assert.ok(!/diasRestantes\} dias restantes/.test(indice), 'nenhum "N dias restantes" montado à mão no Granabô');
}
ok('Granabô: o texto do Livre para gastar usa o mesmo rótulo');

console.log(`\n${checagens} checagens de "dias restantes" passaram — 0 falhas`);
