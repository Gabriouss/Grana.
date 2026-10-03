/*
 * Regressoes da auditoria de 03/10/2026 (V08, V19, V22), modulos reais.
 *   node __tests__/auditoria-0310-textos-e-projecao.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const ler = (a) => fs.readFileSync(path.join(root, a), 'utf8');

function carregar(arquivo, deps) {
  const mod = {};
  const js = ts.transpileModule(ler(arquivo), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports: mod, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math, Map, Set,
    require: (id) => { if (id in deps) return deps[id]; throw new Error('import nao simulado: ' + id); },
  }, { filename: arquivo });
  return mod;
}

/* V08: nenhum asterisco, #, crase nem marcador de lista cru chega ao chat. */
const { textoDoAssistente } = carregar('lib/assistente.ts', { './supabase': { supabase: {} } });
assert.equal(textoDoAssistente('Total **R$ 50** ok'), 'Total R$ 50 ok');
assert.equal(textoDoAssistente('*(Além disso, a fatura for paga).*'), '(Além disso, a fatura for paga).');
assert.equal(textoDoAssistente('um *itálico* e 2 * 3'), 'um itálico e 2 * 3');
assert.equal(textoDoAssistente('## Resumo\n* item um\n- item dois'), 'Resumo\n• item um\n• item dois');
assert.equal(textoDoAssistente('use `código`'), 'use código');
assert.equal(textoDoAssistente('R$ 20*2 + R$ 10*3'), 'R$ 20*2 + R$ 10*3');
assert.ok(!/[*`]/.test(textoDoAssistente('**a** *b* c `d`')));
assert.equal(textoDoAssistente('*(Além disso, fatura paga).* 📊'), '(Além disso, fatura paga). 📊');
console.log('  ok  V08 texto do assistente sem markdown cru');

/* V19: o texto do Livre para gastar segue a regra 20. */
const layout = ler('lib/home-layout.ts');
assert.ok(!/contas e reservas/.test(layout));
assert.ok(/saldo do mês, menos o que você guardou nos cofrinhos/.test(layout));
console.log('  ok  V19 descricao do Livre sem "contas"');

/* V22: e-mail avanca para a senha (entrar e criar conta). */
for (const f of ['app/sign-in.tsx', 'app/sign-up.tsx']) {
  const s = ler(f);
  assert.ok(/returnKeyType="next"\s+onSubmitEditing=\{\(\) => campoSenha\.current\?\.focus\(\)\}/.test(s), f + ' sem next no e-mail');
}
/* Enter na ultima senha envia pelo MESMO handler do botao. */
assert.ok(/returnKeyType="go"\s+onSubmitEditing=\{handleSignIn\}/.test(ler('app/sign-in.tsx')));
assert.ok(/returnKeyType="go"\s+onSubmitEditing=\{handleSignUp\}/.test(ler('app/sign-up.tsx')));
assert.ok(/onPress=\{handleSignIn\}/.test(ler('app/sign-in.tsx')) && /onPress=\{handleSignUp\}/.test(ler('app/sign-up.tsx')));
console.log('  ok  V22 e-mail foca a senha; Enter na senha envia');
