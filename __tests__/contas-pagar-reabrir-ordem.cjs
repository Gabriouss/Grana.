/* Item 49 (20/11/2026): tocar duas vezes na mesma conta (pagar e reabrir) com
   as duas RPCs em voo deixava a ordem das respostas decidir o recibo: a UI
   mostrava "Conta reaberta" e depois "Conta paga" fora da ordem do estado
   final. Executa o toggleStatus REAL de app/(app)/contas.tsx, extraído pela
   AST, com payBill/reopenBill controlados, e asserta QUAIS RPCs aconteceram e
   em que ordem. ARQUIVO=<caminho> roda outra versão (baseline RED). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const adiado = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

const arquivo = process.env.ARQUIVO || 'app/(app)/contas.tsx';
const fonte = ts.createSourceFile(arquivo, fs.readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let funcao;
(function visitar(no) { if (ts.isFunctionDeclaration(no) && no.name?.text === 'toggleStatus') funcao = no; ts.forEachChild(no, visitar); })(fonte);
assert.ok(funcao, 'toggleStatus existe em contas.tsx');
const codigo = ts.transpileModule(funcao.getText(fonte), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function tela(contas) {
  const t = { bills: contas, toasts: [], alertas: [], rpcs: [], cargas: 0, pendentes: [] };
  const rpc = (nome) => (bill) => { const d = adiado(); t.rpcs.push(`${nome}:${bill.id}`); t.pendentes.push({ nome, id: bill.id, ...d }); return d.p; };
  const contexto = {
    Promise, Map, Date, console,
    isDemoMode: false, filaPorConta: { current: new Map() },
    setBills: (f) => { t.bills = typeof f === 'function' ? f(t.bills) : f; },
    triggerToast: (m) => t.toasts.push(m), hapticSuccess: () => {}, hapticTap: () => {},
    Alert: { alert: (titulo) => t.alertas.push(titulo) }, load: () => { t.cargas++; },
    payBill: rpc('pagar'), reopenBill: rpc('reabrir'),
    todayISO: () => '2026-11-20', formatDateLabel: (d) => d, addOneMonth: () => '2026-12-20',
  };
  vm.runInNewContext(codigo, contexto, { filename: arquivo });
  t.tocar = (id) => contexto.toggleStatus(t.bills.find((b) => b.id === id));
  t.status = (id) => t.bills.find((b) => b.id === id).status;
  t.rpc = (nome, id) => t.pendentes.find((p) => p.nome === nome && p.id === id);
  return t;
}
const conta = (id, status = 'due') => ({ id, status, recurring: false, due_date: '2026-11-20' });

(async () => {
  // 1. Pagar e reabrir com respostas invertidas: estado e recibo finais batem.
  let t = tela([conta('b')]);
  const toques = [t.tocar('b')];
  check(t.status('b') === 'paid', 'primeiro toque: otimista paga');
  toques.push(t.tocar('b'));
  check(t.status('b') === 'due', 'segundo toque: otimista em aberto');
  await tick(); // a fila chama a RPC num passo assíncrono depois do toque
  check(t.rpcs.join() === 'pagar:b', `reabrir só sai depois da resposta de pagar (em voo: ${t.rpcs.join()})`);
  t.rpc('reabrir', 'b')?.resolve({}); // se já estivesse em voo, chegaria antes
  await tick();
  t.rpc('pagar', 'b').resolve({}); await tick();
  t.rpc('reabrir', 'b')?.resolve({}); await Promise.all(toques);
  check(t.rpcs.join() === 'pagar:b,reabrir:b', 'RPCs na ordem dos toques, uma de cada');
  check(t.status('b') === 'due', 'estado final em aberto');
  check(t.toasts.at(-1) === 'Conta reaberta', `último recibo é o do estado final (${t.toasts.at(-1)})`);
  check(t.cargas === 1, `uma recarga só, no fim da fila (${t.cargas})`);

  // 2. Pagar falha com reabrir na fila: volta a em aberto, reabrir nunca é chamado.
  t = tela([conta('b')]);
  const f2 = [t.tocar('b'), t.tocar('b')]; await tick();
  t.rpc('pagar', 'b').reject(new Error('rede')); await Promise.all(f2);
  check(t.rpcs.join() === 'pagar:b', 'reabrir não roda depois de pagar falhar');
  check(t.status('b') === 'due' && t.alertas.length === 1, 'em aberto, com um alerta de erro');
  check(!t.toasts.some((m) => /Conta (paga|reaberta)/.test(m)), 'nenhum recibo de sucesso');

  // 3. Pagar dá certo e reabrir falha: fica paga, com alerta.
  t = tela([conta('b')]);
  const f3 = [t.tocar('b'), t.tocar('b')]; await tick();
  t.rpc('pagar', 'b').resolve({}); await tick();
  t.rpc('reabrir', 'b').reject(new Error('rede')); await Promise.all(f3);
  check(t.status('b') === 'paid' && t.alertas.length === 1, 'continua paga depois de reabrir falhar');

  // 4. Contas diferentes não esperam uma pela outra.
  t = tela([conta('a'), conta('c')]);
  const f4 = [t.tocar('a'), t.tocar('c')]; await tick();
  check(t.rpcs.join() === 'pagar:a,pagar:c', 'fila é por conta');
  t.pendentes.forEach((p) => p.resolve({})); await Promise.all(f4);
  check(t.status('a') === 'paid' && t.status('c') === 'paid', 'as duas pagas');

  console.log(`contas-pagar-reabrir-ordem: ${checks} verificações ok`);
})().catch((e) => { console.error(e); process.exit(1); });
