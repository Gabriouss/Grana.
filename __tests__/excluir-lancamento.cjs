/*
 * Excluir lançamento: a mesma pergunta nas três telas, e a compra parcelada
 * inteira de uma vez.
 *
 *   node __tests__/excluir-lancamento.cjs
 *
 * Achados da varredura de 18 e 19/09/2026 (M1):
 *  - Lançamentos e Início apagavam no primeiro toque, sem confirmação; o
 *    Crédito perguntava. Mesmo objeto, duas regras.
 *  - Numa compra parcelada só existia apagar a parcela tocada: tirar a "(2/3)"
 *    deixava a 1/3 e a 3/3 cobrando nas outras faturas.
 *  - O fallback web de `lib/alert.ts` para 3 botões disparava o ÚLTIMO no OK:
 *    quem quisesse apagar só uma parcela apagaria a compra inteira.
 *
 * Os módulos são os de produção, transpilados em memória. Onde a ação escreve
 * no banco, o teste afirma QUAIS filtros foram aplicados, não só o retorno.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

function carregar(arquivo, deps, globais = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console, JSON, Date, String, Object, Array, Error, Promise, RegExp, Number, Math,
    ...globais,
    require: (id) => {
      if (id in deps) return deps[id];
      throw new Error('import nao simulado em ' + arquivo + ': ' + id);
    },
  }, { filename: arquivo });
  return exports;
}

/* Supabase de mentira que anota cada passo do construtor de consulta. */
function supabaseQueAnota(linhasApagadas) {
  const passos = [];
  const q = {};
  for (const m of ['delete', 'eq', 'gt', 'or', 'select']) {
    q[m] = (...args) => { passos.push([m, ...args]); return q; };
  }
  q.then = (resolve) => resolve({ data: linhasApagadas, error: null });
  return {
    passos,
    supabase: { from: (tabela) => { passos.push(['from', tabela]); return q; } },
  };
}

function carregarData(supabase) {
  return carregar('lib/data.ts', {
    './supabase': { supabase },
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar },
    './sessao-offline': { idDoUsuarioLocal: async () => 'u-1' },
    './widgets-home-events': { notificarDadosDosWidgetsAlterados() {} },
    './lancamentos-alterados': { marcarLancamentosAlterados() {} },
    './fila-pendente': { juntarPendentes: async (lista) => lista },
    './voz-pendente-na-lista': { juntarVozPendente: async (lista) => lista },
    './creditLimitAlert': { checarLimiteCartao: async () => {} },
    // Guarda real de crédito sem cartão (23/09/2026); só importa tipos.
    './transaction-rules': carregar('lib/transaction-rules.ts', {}),
    './paginacao': { buscarTodasAsPaginas: async () => [] },
    './types': { CATEGORIES: [] },
    './recorrencia': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
  });
}

async function compraInteira() {
  console.log('\nApagar a compra parcelada inteira');

  // 1. A partir de uma parcela do meio, a cabeça é o parent_id.
  {
    const { passos, supabase } = supabaseQueAnota([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const data = carregarData(supabase);
    const n = await data.deleteInstallmentPurchase({ id: 'parcela-2', parent_id: 'cabeca', installment_total: 3 });
    assert.equal(n, 3);
    assert.deepEqual(passos, [
      ['from', 'transactions'],
      ['delete'],
      ['eq', 'user_id', 'u-1'],
      ['gt', 'installment_total', 1],
      ['or', 'id.eq.cabeca,parent_id.eq.cabeca'],
      ['select', 'id'],
    ]);
    ok('da parcela 2/3, apaga a cabeca e as irmas, so da propria conta');
  }

  // 2. A partir da primeira parcela, a cabeça é ela mesma.
  {
    const { passos, supabase } = supabaseQueAnota([{ id: 'x' }]);
    const data = carregarData(supabase);
    await data.deleteInstallmentPurchase({ id: 'primeira', parent_id: null, installment_total: 12 });
    assert.deepEqual(passos.find((p) => p[0] === 'or'), ['or', 'id.eq.primeira,parent_id.eq.primeira']);
    ok('da parcela 1/12, a cabeca e ela mesma');
  }

  // 3. O filtro de parcelamento é o que impede apagar uma assinatura, que
  //    também liga as ocorrências por parent_id.
  {
    const { passos, supabase } = supabaseQueAnota([]);
    const data = carregarData(supabase);
    await data.deleteInstallmentPurchase({ id: 'p', parent_id: 'c', installment_total: 2 });
    assert.ok(passos.some((p) => p[0] === 'gt' && p[1] === 'installment_total' && p[2] === 1),
      'sem installment_total > 1, os meses de uma assinatura poderiam ir junto');
    ok('o filtro de parcelamento protege as series de assinatura');
  }

  // 4. Lançamento que não é parcela não chega ao banco.
  {
    const { passos, supabase } = supabaseQueAnota([]);
    const data = carregarData(supabase);
    await assert.rejects(data.deleteInstallmentPurchase({ id: 'avulso', parent_id: null, installment_total: 1 }), /não é uma compra parcelada/);
    assert.equal(passos.length, 0, 'nenhuma escrita pode acontecer');
    ok('lancamento avulso e recusado antes de qualquer escrita');
  }
}

/* ── Apagar a ocorrência de uma assinatura ────────────────────────────────
 *
 * Relato do autor em 01/10/2026, dia em que a build 1.10.5 saiu: "não está
 * sendo possível excluir lançamentos da lista de débito/pix".
 *
 * O `delete` saía e voltava 204. Quem desfazia a exclusão era a recarga logo
 * em seguida: `ocorrenciasFaltantes` via o mês da série sem lançamento e o
 * recriava. Na rede: DELETE 204 e, na mesma carga, as duas buscas do contexto
 * de recorrência. A correção é marcar o mês na cabeça da série, e ela mora em
 * `deleteTransaction`, que é por onde as quatro telas passam.
 *
 * Aqui se afirma QUAIS chamadas saem, não só que a função terminou: o efeito
 * que importa é uma escrita no banco. */
function supabaseDeExclusao(linhaApagada, erroDoPulo = null) {
  const chamadas = [];
  const q = {};
  for (const m of ['delete', 'eq', 'select']) {
    q[m] = (...args) => { chamadas.push([m, ...args]); return q; };
  }
  q.then = (resolve) => resolve({ data: linhaApagada ? [linhaApagada] : [], error: null });
  return {
    chamadas,
    supabase: {
      from: (tabela) => { chamadas.push(['from', tabela]); return q; },
      rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return { error: erroDoPulo }; },
    },
  };
}
const rpcs = (chamadas) => chamadas.filter((c) => c[0] === 'rpc');

async function ocorrenciaDeSerie() {
  console.log('\nApagar a ocorrencia de uma assinatura');

  // A. Ocorrência de série: apaga E marca o mês na cabeça.
  {
    const { chamadas, supabase } = supabaseDeExclusao({ parent_id: 'cabeca-1', occurred_on: '2026-10-05', recurring: true, installment_total: null });
    await carregarData(supabase).deleteTransaction('filho-out');
    assert.ok(chamadas.some((c) => c[0] === 'delete'), 'o delete precisa sair');
    /* Por JSON: o objeto de argumentos nasce dentro do `vm`, em outro
       contexto, e o `deepEqual` estrito o trata como de outra "classe". */
    assert.equal(
      JSON.stringify(rpcs(chamadas)),
      JSON.stringify([['rpc', 'pular_mes_da_recorrencia', { p_cabeca: 'cabeca-1', p_mes: '2026-10' }]])
    );
    assert.ok(
      chamadas.findIndex((c) => c[0] === 'delete') < chamadas.findIndex((c) => c[0] === 'rpc'),
      'marca o mes depois de apagar de verdade, nunca antes'
    );
    ok('ocorrencia de assinatura: apaga e marca o mes 2026-10 na cabeca');
  }

  // B. Lançamento avulso: nenhuma marca.
  {
    const { chamadas, supabase } = supabaseDeExclusao({ parent_id: null, occurred_on: '2026-10-05', recurring: false, installment_total: null });
    await carregarData(supabase).deleteTransaction('avulso');
    assert.equal(rpcs(chamadas).length, 0);
    ok('avulso: nao marca mes nenhum');
  }

  // C. Parcela também tem parent_id, e NÃO é assinatura.
  {
    const { chamadas, supabase } = supabaseDeExclusao({ parent_id: 'compra', occurred_on: '2026-10-05', recurring: false, installment_total: 3 });
    await carregarData(supabase).deleteTransaction('parcela-2');
    assert.equal(rpcs(chamadas).length, 0, 'parcela nao pode marcar mes de recorrencia');
    const { chamadas: c2, supabase: s2 } = supabaseDeExclusao({ parent_id: 'compra', occurred_on: '2026-10-05', recurring: true, installment_total: 3 });
    await carregarData(s2).deleteTransaction('parcela-marcada-por-engano');
    assert.equal(rpcs(c2).length, 0, 'installment_total > 1 separa parcela de assinatura mesmo com recurring ligado');
    ok('parcela: nao marca mes, mesmo com recurring ligado por engano');
  }

  // D. A cabeça da série: a cascata leva os filhos, não há mês para marcar.
  {
    const { chamadas, supabase } = supabaseDeExclusao({ parent_id: null, occurred_on: '2026-08-05', recurring: true, installment_total: null });
    await carregarData(supabase).deleteTransaction('cabeca-1');
    assert.equal(rpcs(chamadas).length, 0);
    ok('cabeca da serie: nada a marcar');
  }

  // E. Nada foi apagado (id de outra conta, ou já apagado): nenhuma marca.
  {
    const { chamadas, supabase } = supabaseDeExclusao(null);
    await carregarData(supabase).deleteTransaction('inexistente');
    assert.equal(rpcs(chamadas).length, 0);
    ok('delete que nao apagou linha nenhuma nao marca mes');
  }

  // F. A marca falhou (migration não aplicada): a exclusão JÁ aconteceu, então
  //    não vira "erro ao excluir" — mas vai para o log, que é a única pista.
  {
    const { supabase } = supabaseDeExclusao(
      { parent_id: 'cabeca-1', occurred_on: '2026-10-05', recurring: true, installment_total: null },
      { code: 'PGRST202', message: 'Could not find the function' }
    );
    const erros = [];
    const original = console.error;
    console.error = (...args) => erros.push(args);
    try {
      await carregarData(supabase).deleteTransaction('filho-out');
    } finally {
      console.error = original;
    }
    assert.equal(erros.length, 1, 'a falha da marca precisa ir para o log');
    assert.ok(JSON.stringify(erros[0]).includes('PGRST202'), 'e o log precisa dizer o codigo');
    ok('marca que falha nao vira erro de exclusao, e deixa recibo no log');
  }
}

function carregarPergunta() {
  const alertas = [];
  const mod = carregar('lib/excluir-lancamento.ts', {
    './alerta': { Alert: { alert: (titulo, msg, botoes) => alertas.push({ titulo, msg, botoes }) } },
  });
  return { mod, alertas };
}

async function pergunta() {
  console.log('\nA pergunta antes de apagar');

  // 5. Lançamento avulso: dois botões, e só "Excluir" apaga.
  {
    const { mod, alertas } = carregarPergunta();
    const feito = [];
    mod.confirmarExclusaoDeLancamento({ description: 'Mercado', installment_total: 1 }, {
      apagarEste: () => feito.push('este'),
      apagarCompraInteira: () => feito.push('inteira'),
    });
    assert.equal(alertas.length, 1, 'tem de perguntar antes de apagar');
    assert.deepEqual([...alertas[0].botoes.map((b) => b.text)], ['Cancelar', 'Excluir']);
    assert.equal(feito.length, 0, 'perguntar nao pode ja ter apagado');
    alertas[0].botoes[1].onPress();
    assert.deepEqual(feito, ['este']);
    ok('avulso: pergunta, e so o "Excluir" apaga');
  }

  // 6. Parcela: três botões, cada um dispara só a sua ação.
  {
    const { mod, alertas } = carregarPergunta();
    const feito = [];
    const acoes = { apagarEste: () => feito.push('este'), apagarCompraInteira: () => feito.push('inteira') };
    mod.confirmarExclusaoDeLancamento({ description: 'TV (2/3)', installment_total: 3 }, acoes);
    const [cancelar, esta, inteira] = alertas[0].botoes;
    assert.deepEqual([cancelar.text, esta.text, inteira.text], ['Cancelar', 'Só esta parcela', 'A compra inteira']);
    assert.equal(cancelar.style, 'cancel');
    assert.ok(/3x/.test(alertas[0].msg), 'a mensagem diz de quantas parcelas e a compra');
    esta.onPress();
    assert.deepEqual(feito, ['este']);
    inteira.onPress();
    assert.deepEqual(feito, ['este', 'inteira']);
    ok('parcela: "So esta parcela" e "A compra inteira" disparam acoes separadas');
  }

  // 7. Sem a ação de compra inteira, uma parcela cai na pergunta simples.
  {
    const { mod, alertas } = carregarPergunta();
    mod.confirmarExclusaoDeLancamento({ description: 'TV (2/3)', installment_total: 3 }, { apagarEste: () => {} });
    assert.equal(alertas[0].botoes.length, 2);
    ok('sem acao de compra inteira, nao oferece o que nao sabe fazer');
  }
}

async function alertaNaWeb() {
  console.log('\nTres botoes na janela visual');

  function carregarAlerta() {
    const api = carregar('lib/alerta.ts', {});
    const mod = carregar('lib/alert.ts', { './alerta': api });
    return { mod };
  }
  const botoes = (feito) => [
    { text: 'Cancelar', style: 'cancel', onPress: () => feito.push('cancelar') },
    { text: 'Só esta parcela', onPress: () => feito.push('esta') },
    { text: 'A compra inteira', style: 'destructive', onPress: () => feito.push('inteira') },
  ];

  // 8. A janela conserva a ordem e a ação só acontece ao pressionar o botão.
  {
    const feito = [];
    const { mod } = carregarAlerta();
    mod.Alert.alert('Excluir compra parcelada', 'TV (2/3)', botoes(feito));
    const pedido = mod.obterAlertaAtual();
    assert.equal(feito.length, 0, 'enfileirar não executa uma ação sozinho');
    mod.pressionarAlerta(pedido.id, 1);
    assert.deepEqual(feito, ['esta']);
    ok('botão "Só esta parcela" apaga só a parcela');
  }

  // 9. A ação destrutiva mantém seu estilo e seu callback.
  {
    const feito = [];
    const { mod } = carregarAlerta();
    mod.Alert.alert('t', 'm', botoes(feito));
    const pedido = mod.obterAlertaAtual();
    assert.equal(pedido.buttons[2].style, 'destructive');
    mod.pressionarAlerta(pedido.id, 2);
    assert.deepEqual(feito, ['inteira']);
    ok('botão destrutivo apaga a compra inteira');
  }

  // 10. Cancelar fecha sem apagar.
  {
    const feito = [];
    const { mod } = carregarAlerta();
    mod.Alert.alert('t', 'm', botoes(feito));
    const pedido = mod.obterAlertaAtual();
    mod.pressionarAlerta(pedido.id, 0);
    assert.deepEqual(feito, ['cancelar']);
    ok('botão Cancelar não apaga nada');
  }

  // 11. Assinatura: a pergunta diz o que "excluir" faz com ESTA linha da série.
  {
    const { mod, alertas } = carregarPergunta();
    const feito = [];
    mod.confirmarExclusaoDeLancamento({ description: 'Netflix', installment_total: null, recurring: true, parent_id: 'cabeca' }, {
      apagarEste: () => feito.push('este'),
    });
    assert.equal(alertas[0].titulo, 'Excluir só este mês');
    assert.ok(/só o deste mês/.test(alertas[0].msg), 'a ocorrencia avisa que so este mes sai');
    alertas[0].botoes[1].onPress();
    assert.deepEqual(feito, ['este']);

    mod.confirmarExclusaoDeLancamento({ description: 'Netflix', installment_total: null, recurring: true, parent_id: null }, {
      apagarEste: () => feito.push('serie'),
    });
    assert.equal(alertas[1].titulo, 'Excluir a série inteira');
    assert.ok(/outros meses/.test(alertas[1].msg), 'a origem avisa que os outros meses vao junto');
    ok('assinatura: ocorrencia avisa "so este mes", origem avisa que leva a serie');
  }
}

function telas() {
  console.log('\nAs tres telas usam a mesma pergunta');
  for (const arquivo of ['app/(app)/lancamentos.tsx', 'app/(app)/credito.tsx', 'app/(app)/index.tsx']) {
    const fonte = fs.readFileSync(path.join(root, arquivo), 'utf8');
    assert.ok(/confirmarExclusaoDeLancamento\(tx, \{/.test(fonte), arquivo + ' precisa perguntar antes de apagar');
    assert.ok(/deleteInstallmentPurchase\(tx\)/.test(fonte), arquivo + ' precisa saber apagar a compra inteira');
    ok(arquivo + ' pergunta antes de apagar');
  }
}

/* Mora aqui porque é o arquivo que já carrega lib/data.ts com dublês.
   42501 em saldos_por_carteira (19/09/2026): o recibo de diagnóstico precisa
   dizer o estado da sessão e NUNCA carregar o token. */
async function diagnostico42501() {
  console.log('\nDiagnostico do 42501 em saldos');
  const erros = [];
  const original = console.error;
  console.error = (...args) => erros.push(args);
  try {
    const recusa = { code: '42501', message: 'permission denied for function saldos_por_carteira' };
    const data = carregarData({
      rpc: async () => ({ data: null, error: recusa }),
      auth: { getSession: async () => ({ data: { session: {
        access_token: 'TOKEN-SECRETO', expires_at: Math.floor(Date.now() / 1000) - 60,
      } } }) },
    });
    await assert.rejects(data.fetchSaldosPorCarteira(), (e) => e.code === '42501');
    assert.equal(erros.length, 1, 'uma recusa, um recibo');
    const [, detalhe] = erros[0];
    assert.equal(detalhe.funcao, 'saldos_por_carteira');
    assert.equal(detalhe.temSessaoNoCliente, true);
    assert.equal(detalhe.tokenVencido, true, 'o token vencido e a pista que falta');
    assert.ok(!JSON.stringify(erros).includes('TOKEN-SECRETO'), 'o token nunca vai para o log');
  } finally {
    console.error = original;
  }
  ok('42501 deixa recibo do estado da sessao, sem o token');
}

(async () => {
  await diagnostico42501();
  await compraInteira();
  await ocorrenciaDeSerie();
  await pergunta();
  await alertaNaWeb();
  telas();
  console.log('\n' + aprovadas + '/' + aprovadas + ' guardas de exclusao passaram — 0 falhas\n');
})().catch((erro) => {
  console.error('\nFALHOU: ' + erro.message + '\n');
  process.exit(1);
});
