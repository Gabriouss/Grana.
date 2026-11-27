const assert = require('node:assert/strict');
const test = require('node:test');
const { montar } = require('./voz-paridade-nucleo-efeitos.cjs');
const { ambiente, pendente } = require('./helpers/providers-controlados.cjs');
const { authEnv, session } = require('./providers-isolamento.cjs');

const dono = 'u1';
const chaveDaCaixa = 'grana_avisos_voz:u1';
const chaveDaFila = 'grana:queue:widget-voz-pendente-v1';
const alvo = (requestId) => ({ dono, requestId });
const chaveDaOperacao = (requestId) => 'grana:voz:operacao:u1:' + requestId;
const valores = {
  modo: 'carteira', type: 'out', description: 'Papelaria', amount: 19,
  category: 'Outros', color: '#555', occurred_on: '2026-10-15',
  recurring: false, installments: 1, card_id: null, wallet_id: 'w',
};
const operacao = {
  kind: 'transaction', type: 'out', description: 'Papelaria', amount: 19,
  category: 'Outros', color: '#555', occurred_on: '2026-10-15', wallet_id: 'w',
};

function caixaDo(m) {
  return m.real('lib/avisos-banco/caixa-voz.ts');
}

async function publicar(m, requestId) {
  const caixa = caixaDo(m);
  await caixa.publicarRevisaoVoz({
    ...alvo(requestId), origem: 'voz', fonte: 'widget', quando: 1,
    titulo: 'Qual categoria?', transcricao: 'Papelaria 19 reais', rascunho: {},
  }, caixa.escopoDaRevisaoVoz(dono, caixa.geracaoDaCaixa(dono)));
}

test('P1.1 Worker reiniciado nunca envia intenção antiga depois de descartar ou desfazer', async () => {
  for (const desfazer of [false, true]) {
    const m = montar();
    const requestId = 'recusada';
    const chave = chaveDaOperacao(requestId);
    m.disco.set(chave, JSON.stringify({ requestId, source: 'widget', payload: operacao }));
    await publicar(m, requestId);
    const caixa = caixaDo(m);
    const descarte = await caixa.descartarRevisaoVoz(alvo(requestId));
    assert.ok(descarte);
    if (desfazer) assert.equal(await caixa.desfazerDescarteVoz(alvo(requestId), descarte.idDescarte), true);
    const reiniciada = montar(m.disco);
    await reiniciada.tarefa.executarRetomadaVoz({ userId: dono, requestId, execucaoId: 'execucao' });
    assert.equal(reiniciada.e.rpc.length, 0, 'revisão tem precedência sobre operação antiga');
    assert.equal(reiniciada.e.sucessos.length, 0);
    assert.deepEqual(reiniciada.e.acks, [['execucao', 'aguardar_usuario']]);
  }
});

test('P1.1 recusa em fila vira revisão após reinício mesmo quando a primeira publicação falha', async () => {
  const m = montar();
  const requestId = 'recusa-sem-caixa';
  const chave = chaveDaOperacao(requestId);
  m.disco.set(chave, JSON.stringify({ requestId, source: 'widget', payload: operacao }));
  m.e.rpcErro = { code: '23514', hint: 'cartao_obrigatorio' };
  m.e.antesDeEscrever = (k) => { if (k === chaveDaCaixa) throw Error('caixa indisponível'); };
  await m.tarefa.executarRetomadaVoz({ userId: dono, requestId, execucaoId: 'primeira' });
  assert.equal(m.e.rpc.length, 1);
  assert.deepEqual(m.e.acks, [['primeira', 'tentar_novamente']]);

  const reiniciada = montar(m.disco);
  await reiniciada.tarefa.executarRetomadaVoz({ userId: dono, requestId, execucaoId: 'segunda' });
  assert.equal(reiniciada.e.rpc.length, 0);
  assert.equal(reiniciada.disco.has(chave), false);
  assert.deepEqual(reiniciada.e.acks, [['segunda', 'aguardar_usuario']]);
  assert.equal((await caixaDo(reiniciada).listarRevisoesVoz(dono))[0].titulo, 'Qual cartão?');
});

for (const etapa of ['antesDeLer', 'antesDeEscrever']) {
  test('P1.2 falha antes da primeira RPC em ' + etapa + ' libera edição ou descarte', async () => {
    for (const descartar of [false, true]) {
      const m = montar();
      const requestId = 'corrigida';
      const caixa = caixaDo(m);
      await publicar(m, requestId);
      let falhou = false;
      m.e[etapa] = (chave) => {
        if (chave === chaveDaOperacao(requestId) && !falhou) {
          falhou = true;
          throw Error('disco indisponível antes de preparar a operação');
        }
      };
      await assert.rejects(caixa.confirmarRevisaoVoz(alvo(requestId), valores));
      assert.equal(m.e.rpc.length, 0);
      if (descartar) {
        assert.ok(await caixa.descartarRevisaoVoz(alvo(requestId)));
        assert.equal(m.e.rpc.length, 0);
      } else {
        const gravada = await caixa.confirmarRevisaoVoz(alvo(requestId), { ...valores, amount: 99 });
        assert.equal(gravada.desfecho, 'nova');
        assert.deepEqual(m.e.rpc.map(({ args }) => args.p_payload.amount), [99]);
      }
    }
  });
}

test('P1.2 envio ambíguo conserva o payload original após outra confirmação e retomada', async () => {
  const m = montar();
  const requestId = 'envio-ambiguo';
  const caixa = caixaDo(m);
  await publicar(m, requestId);
  m.e.rpcErro = new TypeError('Network request failed');
  const primeiro = await caixa.confirmarRevisaoVoz(alvo(requestId), valores);
  assert.equal(primeiro.desfecho, 'pendente');
  assert.equal((await caixa.confirmarRevisaoVoz(alvo(requestId), { ...valores, amount: 99 })).desfecho, 'pendente');
  assert.equal(await caixa.descartarRevisaoVoz(alvo(requestId)), null);
  assert.deepEqual(m.e.rpc.map(({ args }) => args.p_payload.amount), [19]);

  const reiniciada = montar(m.disco);
  await reiniciada.tarefa.executarRetomadaVoz({ userId: dono, requestId, execucaoId: 'retomada' });
  assert.deepEqual(reiniciada.e.rpc.map(({ args }) => args.p_payload.amount), [19]);
  assert.deepEqual(reiniciada.e.acks, [['retomada', 'concluida']]);
});

test('P2.3 logout real revoga e limpa a caixa mesmo com erro no leitor do banco', async () => {
  const m = montar();
  await publicar(m, 'revisao-antes-da-saida');
  const caixa = caixaDo(m);
  const escopo = caixa.escopoDaRevisaoVoz(dono, caixa.geracaoDaCaixa(dono));
  let tentouLimparLeitor = false;
  const ajuda = ambiente();
  const a = authEnv({ modulos: {
    './sair-da-conta': ajuda.load('lib/sair-da-conta.ts'),
    '@/modules/grana-avisos': { limparTudoAvisos: async () => {
      tentouLimparLeitor = true;
      throw Error('leitor do banco indisponível');
    } },
    './avisos-banco/caixa': m.real('lib/avisos-banco/caixa.ts'),
    './widget-voz-pendentes': { limparVozesDaConta: async () => {} },
    './cache-de-tela': { esquecerTelas: async () => {} },
    './offline-cache': { esquecerLancamentosLocais: async () => {} },
    './widgets-home-sync': { limparSnapshotWidgets() {} },
    './entitlement-cache': { esquecerAcesso: async () => {} },
    './push-notifications': { removerPushHabitoAntesDeSair: async () => {} },
  } });
  a.valor();
  await a.flush();
  a.emit('SIGNED_IN', session(dono));
  await a.flush();
  assert.equal(a.valor().session.user.id, dono);
  a.saida.resolve();
  await a.valor().signOut();
  assert.equal(tentouLimparLeitor, true);
  assert.equal(a.valor().session, null);
  assert.throws(() => escopo.conferir(), /sessão da revisão/);
  assert.equal((await caixa.listarRevisoesVoz(dono)).length, 0, 'item não reaparece na mesma conta');
  a.p.unmount();
});

function reciboDoApp(m, falhas) {
  return {
    podeNotificar: async () => true,
    notificarFalha: async (codigo) => falhas.push(m.real('lib/voz.ts').mensagemDeErroVoz(codigo)),
    notificarSucesso: async () => {},
    notificarSalvoLocal: async () => {},
    notificarPendenteOffline: async () => {},
  };
}

test('P2.4 recibo da caixa só aponta para fila quando a fala ficou guardada', async () => {
  for (const guardar of [false, true]) {
    const m = montar();
    const falhas = [];
    m.e.antesDeLer = (chave) => { if (chave === chaveDaCaixa) throw Error('caixa indisponível'); };
    if (!guardar) {
      m.e.antesDeEscrever = (chave) => { if (chave === chaveDaFila) throw Error('fila indisponível'); };
      m.e.antesDaPasta = () => { throw Error('cópia indisponível'); };
    }
    const resultado = await m.tarefa.executarTarefa({
      caminho: 'file:///cache/erro.m4a', requestId: 'caixa-indisponivel', source: 'app',
    }, reciboDoApp(m, falhas));
    assert.equal(resultado.guardada, guardar);
    assert.equal(m.e.rpc.length, 0);
    assert.equal(falhas.length, 1);
    if (guardar) assert.match(falhas[0].texto, /fila de voz/);
    else {
      assert.doesNotMatch(falhas[0].texto, /fila de voz/);
      assert.match(falhas[0].texto, /gravação não ficou guardada/);
    }
  }
});

test('P2.5 teto antes da transcrição entrega recibo ao botão com e sem áudio na fila', async () => {
  for (const guardar of [false, true]) {
    const m = montar();
    const bloqueio = pendente();
    const falhas = [];
    m.e.tetoCurto = true;
    if (guardar) m.e.antesDeLer = (chave) => { if (chave === chaveDaCaixa) return bloqueio.promise; };
    else m.e.antesDeEscrever = (chave) => { if (chave === chaveDaFila) return bloqueio.promise; };
    const resultado = await m.tarefa.executarTarefa({
      caminho: 'file:///cache/prazo.m4a', requestId: 'prazo', source: 'app',
    }, reciboDoApp(m, falhas));
    assert.equal(resultado.guardada, guardar);
    await new Promise((resolver) => setImmediate(resolver));
    assert.equal(falhas.length, 1);
    assert.equal(/fila de voz/.test(falhas[0].texto), guardar);
    bloqueio.resolve();
    await new Promise((resolver) => setImmediate(resolver));
    assert.equal(falhas.length, 1);
    assert.equal(m.e.rpc.length, 0);
  }
});
