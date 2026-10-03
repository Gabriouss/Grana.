/*
 * Campos de nome respeitam o teto do banco (P2 do Vigil, 03/10/2026): "Nome da
 * carteira" nao tinha maxLength e o app mostrava 'wallets_name_len' cru.
 * O cartao usava o limite da descricao (200) contra um teto de 100.
 *
 *   node __tests__/nomes-com-limite.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const ler = (a) => fs.readFileSync(path.join(root, a), 'utf8');
const carregar = (a, deps = {}) => {
  const mod = {};
  vm.runInNewContext(ts.transpileModule(ler(a), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: mod, console: { ...console, error() {} }, Error, String, Object, RegExp, require: (id) => { if (id in deps) return deps[id]; throw new Error('import ' + id); } });
  return mod;
};
const { LIMITS } = carregar('lib/limits.ts');
const schema = ler('supabase/schema.sql');
const tetoNoBanco = (constraint) => {
  const i = schema.indexOf('add constraint ' + constraint);
  return Number(/<= ([0-9]+)/.exec(schema.slice(i, i + 120))?.[1]);
};

/* 1. LIMITS bate com o schema. */
for (const [constraint, chave] of [['wallets_name_len', 'walletName'], ['credit_cards_name_len', 'cardName'], ['categories_name_len', 'category'], ['goals_title_len', 'goalTitle']]) {
  assert.equal(LIMITS[chave], tetoNoBanco(constraint), `LIMITS.${chave} = ${constraint}`);
}

/* 2. Cada campo de nome usa o limite certo. */
const campo = (arquivo, rotulo) => {
  const s = ler(arquivo);
  const i = s.indexOf(`accessibilityLabel="${rotulo}"`);
  assert.ok(i > 0, `${arquivo}: campo ${rotulo}`);
  return s.slice(i, i + 200);
};
assert.match(campo('components/WalletPickerModal.tsx', 'Nome da carteira'), /maxLength=\{LIMITS\.walletName\}/);
assert.match(campo('components/WalletPickerModal.tsx', 'Nome da nova carteira'), /maxLength=\{LIMITS\.walletName\}/);
assert.match(campo('app/(app)/credito.tsx', 'Nome do cartão'), /maxLength=\{LIMITS\.cardName\}/);
assert.match(campo('components/GoalsCarousel.tsx', 'Nome da meta'), /maxLength=\{LIMITS\.goalTitle\}/);
assert.match(campo('components/CategoryPickerModal.tsx', 'Nome da nova categoria'), /maxLength=\{LIMITS\.category\}/);

/* 3. Se mesmo assim o banco recusar, a pessoa le uma frase, nao a constraint. */
const { mensagemErro } = carregar('lib/erros.ts', { './offline-cache': { isLikelyNetworkError: () => false } });
const cru = { code: '23514', message: 'new row for relation "wallets" violates check constraint "wallets_name_len"' };
assert.equal(mensagemErro(cru), 'O nome da carteira aceita até 60 caracteres.');
assert.equal(mensagemErro({ message: 'violates check constraint "credit_cards_name_len"' }), 'O nome do cartão aceita até 100 caracteres.');
assert.equal(mensagemErro(new Error('algo diferente')), 'algo diferente', 'outros erros seguem iguais');
console.log('  ok  nomes: limites iguais ao banco, campos limitados, erro traduzido');
