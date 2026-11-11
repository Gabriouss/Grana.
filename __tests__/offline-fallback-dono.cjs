const assert = require('node:assert/strict');
const { montar, promessa, ate, input, FILA } = require('./helpers/offline-integridade.cjs');
(async () => {
  for (const [nome, tipo] of [['salvarOuGuardarNoAparelho', 'transacao'], ['salvarOuGuardarParceladaNoAparelho', 'parcela']]) {
    for (const sucesso of [false, true]) {
      const h = montar();
      const rede = promessa();
      h.estado.enviar = () => rede.promise;
      const offline = h.carregar('offline-cache');
      const operacao = offline[nome](input, 'origem-estavel');
      const recibo = assert.rejects(operacao, /conta mudou|conta original/i);
      await ate(() => h.estado.chamadas.length === 1);
      assert.equal(h.estado.chamadas[0].dono, 'A', 'primeiro envio fixa dono A');
      h.estado.usuario = 'B';
      if (sucesso) rede.resolve(tipo === 'parcela' ? [{ id: 'gravada', user_id: 'A' }] : { id: 'gravada', user_id: 'A' });
      else rede.reject(new Error('Network request failed'));
      await recibo;
      assert.ok([...h.estado.disco.values()].every(v => !v.includes('"userId":"B"')), 'nenhum dado de A carimbado como B');
      if (!sucesso) {
        assert.equal(h.ler(FILA).length, 1, 'intenção original preservada');
        assert.equal(h.ler(FILA)[0].userId, 'A');
        assert.equal(h.ler(FILA)[0].clientRequestId, 'origem-estavel');
        h.estado.enviar = undefined;
        await offline.flushPendingQueue();
        assert.equal(h.estado.chamadas.length, 1, 'B não envia o item de A');
        h.estado.usuario = 'A';
        await offline.flushPendingQueue();
        assert.equal(h.estado.chamadas.length, 2);
        assert.equal(h.estado.chamadas[1].dono, 'A');
        assert.equal(h.estado.chamadas[1].input.client_request_id, 'origem-estavel');
      }
      console.log('ok', tipo, sucesso ? 'sucesso tardio' : 'fallback preserva dono e chave');
    }
  }
  const h = montar();
  h.estado.usuario = null;
  await assert.rejects(h.carregar('offline-cache').salvarOuGuardarNoAparelho(input), /conta/i);
  assert.equal(h.estado.chamadas.length, 0, 'sem dono não inicia envio');
  console.log('5 cenários reais passaram');
})().catch(e => { console.error(e); process.exitCode = 1; });
