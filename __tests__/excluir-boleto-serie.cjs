/* A confirmação "Excluir boleto?" NÃO promete levar a série: desde a migration
   20261002120000 o banco mantém as outras contas quando a primeira é apagada.
   Trava a volta do aviso antigo, e confere que a migration existe e é a que o
   texto descreve. Módulo real, e a tela ligada a ele. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const exportsM = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'lib/excluir-boleto.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exportsM);
const { mensagemExcluirBoleto: msg } = exportsM;

const cab = { id: 'cab', description: 'Aluguel', status: 'due' };
let n = 0; const ok = (c, t) => { assert.ok(c, t); n++; };

ok(/Remover “Aluguel”\?/.test(msg(cab)), 'nomeia o boleto');
ok(/Os lembretes de vencimento dele também saem/.test(msg(cab)), 'em aberto: lembretes saem');
ok(/continua em Lançamentos/.test(msg({ ...cab, status: 'paid' })), 'pago: a saída continua');
ok(!/série|seguintes|removid/.test(msg(cab)) && !/série|seguintes|removid/.test(msg({ ...cab, status: 'paid' })), 'não promete levar a série');
const tela = fs.readFileSync(path.join(root, 'app/(app)/contas.tsx'), 'utf8');
ok(/mensagemExcluirBoleto\(deleteTarget\)/.test(tela), 'a tela usa o módulo');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261002120000_apagar_primeira_conta_mantem_a_serie.sql'), 'utf8');
ok(/after delete on public\.bills/.test(mig) && /"A0_promover_proxima_conta_da_serie"/.test(mig), 'o gatilho é AFTER DELETE e dispara antes do cascade');
ok(/revoke all on function public\.promover_proxima_conta_da_serie\(\)\s+from public, anon, authenticated/.test(mig), 'a função do gatilho não é executável por cliente');
console.log(`excluir-boleto-serie: ${n} checagens OK`);
