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
    './cache-de-tela': { comCacheOffline: (_n, buscar) => buscar, invalidarRespostasAtrasadas() {} },
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
 * sendo possível excluir lançamentos da lista de débito/pix", e depois: "ambos
 * recorrentes".
 *
 * O `delete` saía e voltava 204. Quem desfazia a exclusão era a recarga logo
 * em seguida: `ocorrenciasFaltantes` via o mês da série sem lançamento e o
 * recriava.
 *
 * A primeira correção, do mesmo dia, pôs o APLICATIVO para marcar o mês
 * apagado, chamando uma RPC depois do delete. Não servia: a build instalada
 * não tem esse código, então o celular não marcava nada e ainda recriava o
 * que fosse apagado pela web. A regra foi para o BANCO, em dois gatilhos de
 * `transactions` (migration 20261001130000), e vale para qualquer versão.
 *
 * O comportamento dos gatilhos foi provado num Postgres de verdade (PGlite,
 * fora do repositório) e em produção com a conta de teste; os dois estão
 * descritos no context.md. Aqui ficam as guardas que rodam em toda suíte: o
 * app não volta a ser dono da regra, e o SQL não perde as três decisões que
 * o fazem funcionar. */
function supabaseDeExclusao() {
  const chamadas = [];
  const q = {};
  for (const m of ['delete', 'eq', 'select']) {
    q[m] = (...args) => { chamadas.push([m, ...args]); return q; };
  }
  q.then = (resolve) => resolve({ data: null, error: null });
  return {
    chamadas,
    supabase: {
      from: (tabela) => { chamadas.push(['from', tabela]); return q; },
      rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return { error: null }; },
    },
  };
}

async function ocorrenciaDeSerie() {
  console.log('\nApagar a ocorrencia de uma assinatura');

  // A. O aplicativo só apaga. Marcar o mês é do banco.
  {
    const { chamadas, supabase } = supabaseDeExclusao();
    await carregarData(supabase).deleteTransaction('filho-out');
    assert.equal(JSON.stringify(chamadas.map((c) => c[0])), JSON.stringify(['from', 'delete', 'eq', 'eq']),
      'deleteTransaction e um delete simples: sem rpc e sem leitura a mais');
    const data = fs.readFileSync(path.join(root, 'lib/data.ts'), 'utf8');
    assert.ok(!/rpc\(\s*'pular_mes_da_recorrencia'/.test(data), 'a chamada do app nao pode voltar');
    ok('o app so apaga: nao chama rpc nem tenta marcar o mes');
  }

  const ler = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
  const semComentario = (sql) => sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  const fontes = {
    migration: semComentario(ler('supabase/migrations/20261001130000_recorrencia_mes_pulado_no_servidor.sql')),
    schema: semComentario(ler('supabase/schema.sql')),
  };

  for (const [nome, sql] of Object.entries(fontes)) {
    // B. Apagar marca o mês, na mesma transação.
    assert.ok(
      /create trigger pular_mes_ao_apagar_ocorrencia\s+after delete on public\.transactions\s+for each row/.test(sql),
      nome + ': falta o gatilho AFTER DELETE por linha'
    );
    const apagar = sql.slice(sql.indexOf('function public.pular_mes_ao_apagar_ocorrencia()'), sql.indexOf('create trigger pular_mes_ao_apagar_ocorrencia'));
    assert.ok(/old\.parent_id is null or coalesce\(old\.installment_total, 1\) > 1/.test(apagar), nome + ': parcela nao pode marcar mes');
    assert.ok(/where id = old\.parent_id\s+and user_id = old\.user_id/.test(apagar), nome + ': a marca vai so para a cabeca, do mesmo dono');

    // C. Recriar mês pulado é DESCARTADO, não recusado.
    assert.ok(
      /create trigger ignorar_ocorrencia_de_mes_pulado\s+before insert on public\.transactions\s+for each row/.test(sql),
      nome + ': falta o gatilho BEFORE INSERT por linha'
    );
    const inserir = sql.slice(sql.indexOf('function public.ignorar_ocorrencia_de_mes_pulado()'), sql.indexOf('create trigger ignorar_ocorrencia_de_mes_pulado'));
    assert.ok(/coalesce\(new\.installment_total, 1\) <= 1/.test(inserir), nome + ': parcela nao pode ser barrada');
    assert.ok(/then\s+return null;/.test(inserir), nome + ': mes pulado e descartado com return null');
    /* Uma exceção aqui derrubaria o INSERT de várias linhas do app antigo, e
       as assinaturas que a pessoa NÃO apagou deixariam de ser geradas. */
    assert.ok(!/raise\s+exception/i.test(inserir), nome + ': o gatilho de insert nao pode lancar excecao');

    // D. As funções de gatilho não ficam chamáveis por fora.
    for (const fn of ['pular_mes_ao_apagar_ocorrencia', 'ignorar_ocorrencia_de_mes_pulado']) {
      assert.ok(new RegExp('revoke all on function public\\.' + fn + '\\(\\)\\s+from public, anon, authenticated').test(sql), nome + ': ' + fn + ' sem revoke');
    }
  }
  ok('migration e schema.sql: apagar marca o mes; parcela fica de fora; so a cabeca do mesmo dono');
  ok('migration e schema.sql: recriar mes pulado e descartado por linha, sem excecao');
  ok('migration e schema.sql: funcoes de gatilho com revoke');

  // E. A RPC da primeira tentativa sai do banco e do schema canônico.
  assert.ok(/drop function if exists public\.pular_mes_da_recorrencia\(uuid, text\)/.test(fontes.migration), 'a migration remove a RPC');
  assert.ok(!fontes.schema.includes('pular_mes_da_recorrencia'), 'o schema.sql nao recria a RPC');
  ok('a RPC da primeira tentativa foi removida');
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

/* Origem de série ENCERRADA. A 20261001140000 (aplicada em produção em
 * 01/10/2026) faz o banco soltar os meses antigos quando a origem é apagada,
 * então a pergunta é a de um lançamento avulso: dizer que "leva os meses" seria
 * mentira. Esta seção trava a mentira de volta. */
async function origemEncerrada() {
  console.log('\nOrigem de serie encerrada');
  const origem = { description: 'Netflix', installment_total: null, recurring: false, parent_id: null };
  {
    const { mod, alertas } = carregarPergunta();
    const feito = [];
    mod.confirmarExclusaoDeLancamento(origem, { apagarEste: () => feito.push('este') });
    assert.equal(alertas[0].titulo, 'Excluir lançamento');
    assert.ok(!/série|meses|todos eles/.test(alertas[0].msg), 'nao promete o que o banco nao faz');
    alertas[0].botoes[1].onPress();
    assert.deepEqual(feito, ['este']);
    ok('origem encerrada: pergunta simples, sem aviso de meses');
  }
  for (const arquivo of ['lib/data.ts', 'lib/excluir-lancamento.ts', 'app/(app)/lancamentos.tsx', 'app/(app)/credito.tsx', 'app/(app)/index.tsx']) {
    const fonte = fs.readFileSync(path.join(root, arquivo), 'utf8');
    assert.ok(!/contarMesesDaSerie|mesesDaSerie/.test(fonte), arquivo + ' nao conta mais os meses da serie');
  }
  ok('nenhuma tela nem modulo conta meses da serie');
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
    assert.ok(/só o lançamento deste mês/.test(alertas[0].msg), 'a ocorrencia avisa que so este mes sai');
    assert.ok(!/segue|continua repetindo/.test(alertas[0].msg), 'a pergunta nao afirma que a serie esta ativa: ela aparece tambem para serie ja encerrada');
    alertas[0].botoes[1].onPress();
    assert.deepEqual(feito, ['este']);

    mod.confirmarExclusaoDeLancamento({ description: 'Netflix', installment_total: null, recurring: true, parent_id: null }, {
      apagarEste: () => feito.push('serie'),
    });
    assert.equal(alertas[1].titulo, 'Excluir a série inteira');

    /* Ocorrência em que alguém desmarcou "repetir": continua sendo ocorrência.
       A série é da origem, e sem o aviso a pessoa não saberia que só este mês
       sai. É a mesma condição do gatilho do banco (parent_id, e não recurring). */
    mod.confirmarExclusaoDeLancamento({ description: 'Netflix', installment_total: null, recurring: false, parent_id: 'cabeca' }, {
      apagarEste: () => feito.push('desmarcada'),
    });
    assert.equal(alertas[2].titulo, 'Excluir só este mês', 'ocorrencia se reconhece pelo parent_id');
    assert.ok(/meses seguintes/.test(alertas[1].msg), 'a origem avisa que os meses seguintes vao junto');
    assert.ok(/desligue a repetição/.test(alertas[1].msg), 'e ensina a parar de repetir sem apagar nada');
    ok('assinatura: ocorrencia avisa "so este mes", origem avisa que leva a serie');
  }
}

/* ── Encerrar a série: este e os próximos saem, o passado fica ────────────
 *
 * Pedido do autor em 01/10/2026, sobre a assinatura e o investimento que ele
 * tentava apagar: "A intenção é encerrar de vez, os lançamentos passados
 * permanecem". Até aqui a única forma de encerrar era achar a ORIGEM da série,
 * no mês em que ela foi criada, e desligar "repetir". */
function supabaseDeEncerrar({ erroAoParar = null, apagadas = [] } = {}) {
  const chamadas = [];
  const montar = (resposta) => {
    const q = {};
    for (const m of ['update', 'delete', 'eq', 'gte', 'select']) {
      q[m] = (...args) => { chamadas.push([m, ...args]); return q; };
    }
    q.then = (resolve) => resolve(resposta());
    return q;
  };
  let pedidos = 0;
  return {
    chamadas,
    supabase: {
      from: (tabela) => {
        chamadas.push(['from', tabela]);
        pedidos += 1;
        /* O primeiro pedido é o que para a série; o segundo, o que apaga. */
        return pedidos === 1
          ? montar(() => ({ data: null, error: erroAoParar }))
          : montar(() => ({ data: apagadas, error: null }));
      },
    },
  };
}

async function encerrarSerie() {
  console.log('\nEncerrar a serie: este e os proximos');

  // A. Para de repetir ANTES de apagar, e apaga só deste mês em diante.
  {
    const { chamadas, supabase } = supabaseDeEncerrar({ apagadas: [{ id: 'out' }, { id: 'nov' }] });
    const n = await carregarData(supabase).encerrarSerieAPartirDe({ parent_id: 'cabeca', occurred_on: '2026-10-05', installment_total: null });
    assert.equal(n, 2);
    const nomes = chamadas.map((c) => c[0]);
    assert.ok(nomes.indexOf('update') >= 0 && nomes.indexOf('delete') > nomes.indexOf('update'),
      'a serie para de repetir antes de qualquer lancamento sair');
    assert.equal(JSON.stringify(chamadas.find((c) => c[0] === 'update')[1]), JSON.stringify({ recurring: false }));
    const depoisDoUpdate = chamadas.slice(nomes.indexOf('update'), nomes.indexOf('delete'));
    assert.ok(depoisDoUpdate.some((c) => c[0] === 'eq' && c[1] === 'id' && c[2] === 'cabeca'), 'quem para de repetir e a CABECA');
    const depoisDoDelete = chamadas.slice(nomes.indexOf('delete'));
    assert.ok(depoisDoDelete.some((c) => c[0] === 'eq' && c[1] === 'parent_id' && c[2] === 'cabeca'), 'apaga so ocorrencias desta serie');
    assert.ok(depoisDoDelete.some((c) => c[0] === 'gte' && c[1] === 'occurred_on' && c[2] === '2026-10-05'),
      'apaga deste mes em diante: os meses anteriores ficam');
    assert.ok(!depoisDoDelete.some((c) => c[0] === 'eq' && c[1] === 'id'), 'o delete nao pode mirar a cabeca: ela e um mes passado');
    for (const trecho of [depoisDoUpdate, depoisDoDelete]) {
      assert.ok(trecho.some((c) => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'u-1'), 'os dois passos sao restritos ao dono');
    }
    ok('para de repetir primeiro, depois apaga este mes e os seguintes, so desta serie');
  }

  // B. Se parar a série falhar, NADA é apagado.
  {
    const { chamadas, supabase } = supabaseDeEncerrar({ erroAoParar: { code: '42501', message: 'sem permissao' } });
    await assert.rejects(
      carregarData(supabase).encerrarSerieAPartirDe({ parent_id: 'cabeca', occurred_on: '2026-10-05', installment_total: null })
    );
    assert.ok(!chamadas.some((c) => c[0] === 'delete'), 'sem parar a serie, nenhum lancamento pode sair');
    ok('falha ao parar a serie: nada e apagado');
  }

  // C. Parcela e lançamento avulso não chegam ao banco.
  {
    const { chamadas, supabase } = supabaseDeEncerrar();
    const data = carregarData(supabase);
    await assert.rejects(data.encerrarSerieAPartirDe({ parent_id: 'compra', occurred_on: '2026-10-05', installment_total: 3 }), /não faz parte de uma série/);
    await assert.rejects(data.encerrarSerieAPartirDe({ parent_id: null, occurred_on: '2026-10-05', installment_total: null }), /não faz parte de uma série/);
    assert.equal(chamadas.length, 0, 'parcela e avulso nao podem tocar o banco');
    ok('parcela e lancamento avulso sao recusados sem tocar o banco');
  }

  // D. A pergunta oferece as duas saídas, e cada botão faz só a sua.
  {
    const { mod, alertas } = carregarPergunta();
    const feito = [];
    mod.confirmarExclusaoDeLancamento({ description: 'Netflix', installment_total: null, recurring: true, parent_id: 'cabeca' }, {
      apagarEste: () => feito.push('este'),
      encerrarSerie: () => feito.push('encerrar'),
    });
    assert.deepEqual([...alertas[0].botoes.map((b) => b.text)], ['Cancelar', 'Só este mês', 'Este e os próximos']);
    assert.ok(/meses anteriores ficam/.test(alertas[0].msg), 'a pergunta diz que o passado permanece');
    assert.equal(feito.length, 0, 'perguntar nao pode ja ter apagado');
    alertas[0].botoes[1].onPress();
    assert.deepEqual(feito, ['este']);
    alertas[0].botoes[2].onPress();
    assert.deepEqual(feito, ['este', 'encerrar']);
    assert.equal(alertas[0].botoes[2].style, 'destructive');
    ok('ocorrencia: "So este mes" e "Este e os proximos" disparam acoes separadas');
  }

  // E. A ORIGEM e a parcela não ganham a opção: para elas ela não existe.
  {
    const { mod, alertas } = carregarPergunta();
    mod.confirmarExclusaoDeLancamento({ description: 'Netflix', installment_total: null, recurring: true, parent_id: null }, {
      apagarEste: () => {}, encerrarSerie: () => {},
    });
    assert.deepEqual([...alertas[0].botoes.map((b) => b.text)], ['Cancelar', 'Excluir a série']);
    mod.confirmarExclusaoDeLancamento({ description: 'TV', installment_total: 3, parent_id: 'compra' }, {
      apagarEste: () => {}, apagarCompraInteira: () => {}, encerrarSerie: () => {},
    });
    assert.deepEqual([...alertas[1].botoes.map((b) => b.text)], ['Cancelar', 'Só esta parcela', 'A compra inteira']);
    ok('origem e parcela nao oferecem "Este e os proximos"');
  }

  // F. As três telas oferecem a saída.
  for (const arquivo of ['app/(app)/lancamentos.tsx', 'app/(app)/credito.tsx', 'app/(app)/index.tsx']) {
    const fonte = fs.readFileSync(path.join(root, arquivo), 'utf8');
    assert.ok(/encerrarSerie: async \(\) => \{/.test(fonte), arquivo + ' precisa oferecer encerrar a serie');
    assert.ok(/await encerrarSerieAPartirDe\(tx\)/.test(fonte), arquivo + ' precisa encerrar pela funcao compartilhada');
  }
  ok('as tres telas oferecem "Este e os proximos" pela mesma funcao');
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
  await encerrarSerie();
  await origemEncerrada();
  await alertaNaWeb();
  telas();
  console.log('\n' + aprovadas + '/' + aprovadas + ' guardas de exclusao passaram — 0 falhas\n');
})().catch((erro) => {
  console.error('\nFALHOU: ' + erro.message + '\n');
  process.exit(1);
});
