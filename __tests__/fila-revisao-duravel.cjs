const assert = require('node:assert/strict');
const { montar, promessa, ate, item, revisao, FILA, REVISAO, JOURNAL } = require('./helpers/offline-integridade.cjs');
let total = 0;
async function unica(h, original) {
  const fila = h.carregar('fila-pendente');
  const pendentes = await fila.getQueue();
  const revisar = await fila.listarEmRevisao();
  const encontrados = [...pendentes, ...revisar].filter(i => i.localId === original.localId);
  assert.equal(encontrados.length, 1, 'após reiniciar há exatamente uma cópia lógica');
  for (const campo of ['userId', 'clientRequestId', 'tentadoEm']) assert.equal(encontrados[0][campo], original[campo]);
  return { pendentes, revisar };
}
(async () => {
  for (const tipo of ['transacao', 'meta']) {
    for (const destino of ['fila', 'revisao']) {
      for (let corte = 1; corte <= 4; corte++) {
        const original = item('x', tipo);
        if (tipo === 'meta') delete original.clientRequestId;
        const h = montar(new Map([[FILA, JSON.stringify(destino === 'fila' ? [] : [original])], [REVISAO, JSON.stringify(destino === 'fila' ? [revisao(original)] : [])]]));
        h.estado.corte = corte;
        h.estado.enviar = async () => { throw new Error('Network request failed'); };
        const operacao = destino === 'fila'
          ? h.carregar('offline-cache').devolverDaRevisaoParaFila('x')
          : h.carregar('fila-pendente').guardarEmRevisao(original, { code: '23514' });
        await assert.rejects(operacao, /interrompido/);
        assert.equal(h.estado.chamadas.length, 0, 'não envia antes de concluir journal');
        const volta = montar(h.estado.disco);
        const { pendentes, revisar } = await unica(volta, original);
        assert.equal(h.estado.escritas[0], JOURNAL, 'journal precede alteração das coleções');
        if (corte >= 2) assert.equal(h.estado.escritas[1], destino === 'fila' ? FILA : REVISAO, 'destino durável precede remoção da origem');
        assert.equal(pendentes.length, destino === 'fila' ? 1 : 0);
        assert.equal(revisar.length, destino === 'fila' ? 0 : 1);
        volta.estado.metaNoBanco = true;
        await volta.carregar('offline-cache').flushPendingQueue();
        const envios = volta.estado.chamadas;
        assert.equal(envios.length, destino === 'fila' && tipo === 'transacao' ? 1 : 0, 'sem reenvio duplicado, inclusive meta já gravada');
        if (envios.length) assert.equal(envios[0].input.client_request_id, original.clientRequestId);
        total++;
      }
    }
  }
  {
    const h = montar(new Map([[REVISAO, JSON.stringify([revisao(item('x'))])]]));
    const fila = h.carregar('fila-pendente');
    const leitura = promessa();
    let bloqueou = false;
    h.estado.antesDeLer = async k => {
      if (k === REVISAO && !bloqueou) { bloqueou = true; await leitura.promise; }
    };
    const remover = fila.tirarDaRevisao('x');
    await ate(() => bloqueou);
    const guardar = fila.guardarEmRevisao(item('y'), { code: '23503' });
    leitura.resolve();
    await Promise.all([remover, guardar]);
    assert.deepEqual(Array.from(await fila.listarEmRevisao(), i => i.localId), ['y'], 'descarte não sobrescreve inclusão concorrente');
    await Promise.all([fila.guardarEmRevisao(item('y'), {}), fila.guardarEmRevisao(item('z'), {})]);
    assert.deepEqual(Array.from(await fila.listarEmRevisao(), i => i.localId).sort(), ['y', 'z'], 'inclusões em série sem duplicar y');
    total++;
  }
  {
    const h = montar(new Map([[REVISAO, JSON.stringify([revisao(item())])]]));
    h.estado.antesDeGravar = async k => { if (k === FILA) throw new Error('sem espaço no destino'); };
    await assert.rejects(h.carregar('offline-cache').devolverDaRevisaoParaFila('x'), /sem espaço/);
    assert.equal(h.ler(REVISAO).length, 1, 'origem continua durável quando destino falha');
    const volta = montar(h.estado.disco);
    await unica(volta, item());
    total++;
  }
  {
    const h = montar(new Map([[REVISAO, '{ilegível']]));
    await assert.rejects(h.carregar('fila-pendente').guardarEmRevisao(item(), {}));
    assert.equal(h.estado.disco.get(REVISAO), '{ilegível', 'leitura falha não vira lista vazia gravável');
    assert.equal(h.estado.escritas.length, 0);
    total++;
  }
  {
    const h = montar(new Map([[REVISAO, JSON.stringify([revisao(item())])]]));
    const fila = h.carregar('offline-cache');
    await Promise.all([fila.devolverDaRevisaoParaFila('x'), fila.devolverDaRevisaoParaFila('x')]);
    assert.equal(h.estado.chamadas.length, 1, 'dois toques fazem um único envio');
    assert.equal(h.ler(FILA).length + h.ler(REVISAO).length, 0);
    total++;
  }
  console.log(total + ' cenários reais passaram; 16 interrupções, concorrência, falha de disco e chave preservada');
})().catch(e => { console.error(e); process.exitCode = 1; });
