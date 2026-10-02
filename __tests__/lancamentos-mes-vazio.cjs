/*
 * Mes vazio em Lancamentos (F5, achado do Vigil no emulador, 02/10/2026).
 *
 *   node __tests__/lancamentos-mes-vazio.cjs
 *
 * A tela so carrega o mes visivel, entao "ha historico?" nao pode sair da
 * lista carregada. O sinal vem de fetchTemLancamento (existencia, 1 linha).
 * Modulo REAL: lib/lancamentos-vazio.ts. A tela e a consulta sao conferidas
 * no fonte (nao compilam aqui).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const ler = (a) => fs.readFileSync(path.join(root, a), 'utf8');
let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };

const saida = {};
vm.runInNewContext(ts.transpileModule(ler('lib/lancamentos-vazio.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: saida });
const { textoDaListaVazia } = saida;

assert.match(textoDaListaVazia(false, true), /neste mês/); assert.doesNotMatch(textoDaListaVazia(false, true), /primeiro/);
ok('mes vazio com historico diz "neste mes", sem "primeiro"');
assert.match(textoDaListaVazia(false, false), /ainda/); assert.match(textoDaListaVazia(false, false), /primeiro/);
ok('conta sem nenhum lancamento mantem "ainda ... primeiro"');
assert.match(textoDaListaVazia(true, true), /filtro/); assert.match(textoDaListaVazia(true, false), /filtro/);
ok('filtro ativo vence o historico');

const tela = ler('app/(app)/lancamentos.tsx');
const dados = ler('lib/data.ts');
assert.ok(/fetchTemLancamento\(\)\.then\(\(tem\) => \{ if \(vigente\(\)\) setTemHistorico\(tem\)/.test(tela), 'a tela consulta a existencia na carga');
assert.ok(/textoDaListaVazia\(!!\(search \|\| categoryFilter\), temHistorico \|\| walletTransactions\.length > 0\)/.test(tela), 'a tela usa o sinal independente do mes');
ok('tela alimenta o texto com o sinal independente do mes');
assert.ok(/buscar_fetchTemLancamento[\s\S]{0,200}\.select\('id'\)\.limit\(1\)/.test(dados), 'consulta leve, sem valores');
assert.ok(!/amount|initial_balance/.test(dados.slice(dados.indexOf('buscar_fetchTemLancamento'), dados.indexOf('buscar_fetchTemLancamento') + 400)), 'sem saldo (regra 20)');
ok('consulta de existencia: 1 id, sem valor nem saldo (regra 20)');
console.log('\n' + n + ' checagens do mes vazio passaram - 0 falhas\n');
