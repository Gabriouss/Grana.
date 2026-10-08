/*
 * L1 (08/10/2026): apagar a saída que pagou uma conta reabre a conta, e a
 * pergunta antes de apagar não dizia isso.
 *
 *   node __tests__/excluir-pagamento-de-conta.cjs
 *
 * Quem reabre é o servidor: o gatilho `A0_reabrir_conta_da_saida_apagada`
 * (20261002160000) põe a conta de volta em aberto quando a saída de
 * `bills.paid_transaction_id` é apagada. Conferido em produção em 08/10/2026.
 * O cliente só passa a AVISAR; escrita e gatilho ficam como estão.
 *
 * Módulo real (lib/excluir-lancamento.ts) transpilado em memória, com a
 * janela de alerta e o relógio de mentira. Casos pedidos no julgamento do
 * Anvil: pagamento simples, pagamento que também é ocorrência de série,
 * lançamento comum (texto de hoje), e conferência que falha ou não responde.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

function carregar() {
  const alertas = [];
  const erros = [];
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/excluir-lancamento.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math,
    console: { ...console, error: (...a) => erros.push(a) },
    // Relógio encurtado: o prazo de produção vira 1/1000, sem mexer na constante.
    setTimeout: (fn, ms) => setTimeout(fn, ms / 1000),
    clearTimeout,
    require: (id) => {
      if (id === './alerta') return { Alert: { alert: (titulo, msg, botoes) => alertas.push({ titulo, msg, botoes }) } };
      throw new Error('import nao simulado: ' + id);
    },
  }, { filename: 'lib/excluir-lancamento.ts' });
  return { mod: exports, alertas, erros };
}

const saida = { id: 'tx-1', type: 'out', description: 'Luz', installment_total: 1, recurring: false, parent_id: null, card_id: null };
const contas = [
  { description: 'Outra conta', paid_transaction_id: 'tx-9' },
  { description: 'Conta de luz', paid_transaction_id: 'tx-1' },
];

(async () => {
  console.log('\nConferir se o lancamento paga uma conta');

  // 1. Pagamento simples: acha a conta pelo paid_transaction_id, não pela descrição.
  {
    const { mod } = carregar();
    let chamadas = 0;
    const r = await mod.conferirContaPaga(saida, async () => { chamadas++; return contas; });
    assert.deepEqual({ ...r }, { estado: 'conta', descricao: 'Conta de luz' });
    assert.equal(chamadas, 1);
    ok('acha a conta pelo paid_transaction_id');
  }

  // 2. Entrada e compra no cartão não pagam conta: nem consulta.
  {
    const { mod } = carregar();
    let chamadas = 0;
    const buscar = async () => { chamadas++; return contas; };
    assert.equal((await mod.conferirContaPaga({ ...saida, type: 'in' }, buscar)).estado, 'nenhuma');
    assert.equal((await mod.conferirContaPaga({ ...saida, card_id: 'c1' }, buscar)).estado, 'nenhuma');
    assert.equal(chamadas, 0, 'nao consulta contas para o que nao pode ser pagamento');
    ok('entrada e compra no cartao nao consultam contas');
  }

  // 3. Mesma descrição, outro id: não é o pagamento.
  {
    const { mod } = carregar();
    const r = await mod.conferirContaPaga({ ...saida, id: 'tx-2', description: 'Conta de luz' }, async () => contas);
    assert.equal(r.estado, 'nenhuma');
    ok('descricao igual sem o id vinculado nao conta como pagamento');
  }

  // 4. A consulta falha: não vira "nenhuma" em silêncio (condição 1 do Anvil).
  {
    const { mod, erros } = carregar();
    const r = await mod.conferirContaPaga(saida, async () => { throw new Error('sem rede'); });
    assert.equal(r.estado, 'nao_conferido');
    assert.ok(erros.length > 0, 'a falha deixa log');
    ok('consulta que falha vira "nao conferido", com log');
  }

  // 5. A consulta não responde: a pergunta sai mesmo assim, dentro do prazo.
  {
    const { mod } = carregar();
    assert.ok(mod.PRAZO_CONFERIR_CONTA_MS > 0 && mod.PRAZO_CONFERIR_CONTA_MS <= 6_000, 'prazo curto: e o toque em Excluir que espera');
    const r = await Promise.race([
      mod.conferirContaPaga(saida, () => new Promise(() => {})),
      new Promise((_, rej) => setTimeout(() => rej(new Error('conferencia sem prazo')), 2000)),
    ]);
    assert.equal(r.estado, 'nao_conferido');
    ok('consulta pendurada termina no prazo como "nao conferido"');
  }

  console.log('\nA pergunta antes de apagar');

  // 6. Pagamento simples: título e texto dizem que a conta reabre, citando o nome.
  {
    const { mod, alertas } = carregar();
    const feito = [];
    mod.confirmarExclusaoDeLancamento(saida, { apagarEste: () => feito.push('este') }, { estado: 'conta', descricao: 'Conta de luz' });
    const a = alertas[0];
    assert.equal(a.titulo, 'Excluir pagamento de conta');
    assert.ok(a.msg.includes('"Conta de luz"'), 'cita o nome da conta');
    assert.ok(/voltar a ficar em aberto/.test(a.msg), 'diz que a conta reabre');
    assert.deepEqual([...a.botoes.map((b) => b.text)], ['Cancelar', 'Excluir']);
    assert.equal(feito.length, 0);
    a.botoes[1].onPress();
    assert.deepEqual(feito, ['este']);
    ok('pagamento simples: avisa que a conta reabre, com o nome dela');
  }

  // 7. Pagamento que também é ocorrência de série: a pergunta da série continua,
  //    e o aviso da conta vai junto (condição 2 do Anvil).
  {
    const { mod, alertas } = carregar();
    const feito = [];
    const ocorrencia = { ...saida, parent_id: 'origem', recurring: true };
    mod.confirmarExclusaoDeLancamento(ocorrencia, {
      apagarEste: () => feito.push('este'),
      encerrarSerie: () => feito.push('serie'),
    }, { estado: 'conta', descricao: 'Conta de luz' });
    const a = alertas[0];
    assert.equal(a.titulo, 'Excluir lançamento que se repete');
    assert.deepEqual([...a.botoes.map((b) => b.text)], ['Cancelar', 'Só este mês', 'Este e os próximos']);
    assert.ok(a.msg.includes('"Conta de luz"') && /voltar a ficar em aberto/.test(a.msg), 'o aviso da conta nao se perde no ramo da serie');
    ok('pagamento + ocorrencia: pergunta da serie com o aviso da conta');

    // E sem a ação de encerrar, a ocorrência simples também leva o aviso.
    const b = carregar();
    b.mod.confirmarExclusaoDeLancamento(ocorrencia, { apagarEste: () => {} }, { estado: 'conta', descricao: 'Conta de luz' });
    assert.equal(b.alertas[0].titulo, 'Excluir só este mês');
    assert.ok(/voltar a ficar em aberto/.test(b.alertas[0].msg));
    ok('ocorrencia sem encerrar serie tambem leva o aviso');
  }

  // 8. Lançamento comum: o texto de hoje, sem mudança nenhuma.
  {
    for (const conta of [undefined, { estado: 'nenhuma' }]) {
      const { mod, alertas } = carregar();
      mod.confirmarExclusaoDeLancamento(saida, { apagarEste: () => {} }, conta);
      assert.equal(alertas[0].titulo, 'Excluir lançamento');
      assert.equal(alertas[0].msg, 'Remover "Luz"?');
    }
    ok('lancamento comum: titulo e texto de hoje');
  }

  // 9. Não conferido: a pessoa é avisada e escolhe.
  {
    const { mod, alertas } = carregar();
    mod.confirmarExclusaoDeLancamento(saida, { apagarEste: () => {} }, { estado: 'nao_conferido' });
    const a = alertas[0];
    assert.equal(a.titulo, 'Excluir lançamento');
    assert.ok(/Não deu para conferir/.test(a.msg) && /voltar a ficar em aberto/.test(a.msg));
    assert.equal(a.botoes.length, 2);
    ok('nao conferido: pergunta avisa da duvida e deixa escolher');
  }

  // 10. Copy: sem travessão e sem "não é X, é Y" em nenhum dos textos novos.
  {
    const textos = [];
    for (const conta of [{ estado: 'conta', descricao: 'Conta de luz' }, { estado: 'nao_conferido' }]) {
      const { mod, alertas } = carregar();
      mod.confirmarExclusaoDeLancamento(saida, { apagarEste: () => {} }, conta);
      textos.push(alertas[0].titulo, alertas[0].msg);
    }
    for (const t of textos) {
      assert.ok(!/[—–]/.test(t), 'sem travessao: ' + t);
      assert.ok(!/não é .*, é /i.test(t), 'sem "nao e X, e Y": ' + t);
    }
    ok('textos novos sem travessao e sem contraste');
  }

  // 11. As duas telas que listam saída de caixa conferem antes de perguntar.
  //     Crédito só lista compra no cartão, que não paga conta (pagar_conta grava saída sem cartão).
  {
    for (const tela of ['app/(app)/lancamentos.tsx', 'app/(app)/index.tsx']) {
      const fonte = fs.readFileSync(path.join(root, tela), 'utf8');
      assert.ok(/conferirContaPaga\(tx, \(\) => fetchBills\(\{ status: 'paid' \}\)\)/.test(fonte), tela + ' confere a conta paga');
      assert.ok(/confirmarExclusaoDeLancamento\(tx, \{[\s\S]*?\}, conta\);/.test(fonte), tela + ' passa o resultado para a pergunta');
    }
    const data = fs.readFileSync(path.join(root, 'lib/data.ts'), 'utf8');
    assert.ok(/\.or\('payment_method\.eq\.credit,card_id\.not\.is\.null'\)/.test(data), 'Credito so lista compra no cartao');
    ok('Lancamentos e Inicio conferem; Credito nao lista pagamento de conta');
  }

  console.log(`\nexcluir-pagamento-de-conta: ${aprovadas} checagens OK`);
})().catch((e) => { console.error(e); process.exit(1); });
