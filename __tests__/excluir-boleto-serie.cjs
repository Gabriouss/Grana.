/* A confirmação "Excluir boleto?" avisa quando apagar a cabeça leva a série
   (bills.parent_id é on delete cascade). Módulo real, e a tela ligada a ele. */
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
const filhos = (n) => Array.from({ length: n }, () => ({ parent_id: 'cab' }));
let n = 0; const ok = (c, t) => { assert.ok(c, t); n++; };

ok(!/série|seguintes/.test(msg(cab, [{ parent_id: null }, { parent_id: 'outra' }])), 'boleto avulso ou de outra série: sem aviso');
ok(/o do mês seguinte também será removido/.test(msg(cab, filhos(1))), 'um filho: singular');
ok(/os 3 dos meses seguintes também serão removidos/.test(msg(cab, filhos(3))), 'vários filhos: conta quantos');
ok(/Os lembretes de vencimento dele também saem/.test(msg(cab, filhos(2))) && /série/.test(msg(cab, filhos(2))), 'o aviso soma ao texto de sempre');
ok(/continua em Lançamentos/.test(msg({ ...cab, status: 'paid' }, filhos(2))) && /série/.test(msg({ ...cab, status: 'paid' }, filhos(2))), 'pago também avisa');
const tela = fs.readFileSync(path.join(root, 'app/(app)/contas.tsx'), 'utf8');
ok(/mensagemExcluirBoleto\(deleteTarget, bills\)/.test(tela), 'a tela usa o módulo com a lista carregada');
console.log(`excluir-boleto-serie: ${n} checagens OK`);
