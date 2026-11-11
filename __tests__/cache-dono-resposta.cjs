const assert = require('node:assert/strict');
const { montar, promessa, ate, turno, TELA } = require('./helpers/offline-integridade.cjs');
(async () => {
  for (const tardio of [false, true]) {
    const h = montar();
    const cache = h.carregar('cache-de-tela');
    await cache.guardarTela('teste', ['A-antigo'], 'A');
    const rede = promessa();
    let iniciou = false;
    const buscar = cache.comCacheOffline('teste', () => { iniciou = true; return rede.promise; });
    const carga = buscar();
    await ate(() => iniciou);
    if (tardio) {
      h.disparar(4000);
      assert.deepEqual(Array.from(await carga), ['A-antigo']);
    }
    const recibo = tardio ? null : assert.rejects(carga, /conta mudou/i);
    h.estado.usuario = 'B';
    rede.resolve(['A-resposta']);
    if (recibo) await recibo;
    await turno(); await turno();
    assert.equal(h.ler(TELA).userId, 'A', 'resposta de A nunca carimbada com B');
    assert.equal(await cache.lerTela('teste'), null, 'B não lê dados de A do disco');
    let chamadas = 0;
    const buscarB = cache.comCacheOffline('teste', async () => { chamadas++; return ['B-atual']; });
    assert.deepEqual(Array.from(await buscarB()), ['B-atual']);
    assert.equal(chamadas, 1, 'B não recebe resposta atrasada de A da memória');
    console.log('ok resposta', tardio ? 'tardia' : 'rápida', 'com troca direta de sessão');
  }
  {
    const h = montar();
    const cache = h.carregar('cache-de-tela');
    h.estado.lerDono = () => { cache.invalidarRespostasAtrasadas(); return 'A'; };
    await cache.guardarTela('teste', ['antes-da-escrita'], 'A');
    assert.ok(!h.estado.disco.has(TELA), 'geração é conferida após aguardar dono');
    console.log('ok geração durante guardarTela');
  }
  {
    const h = montar();
    const cache = h.carregar('cache-de-tela');
    await cache.guardarTela('teste', ['A-antigo']);
    await cache.atualizarTelaGuardada('teste', dados => { h.estado.usuario = 'B'; return [...dados, 'A-escrita']; });
    assert.equal(h.ler(TELA).userId, 'A', 'atualização conserva dono da leitura');
    assert.equal(await cache.lerTela('teste'), null);
    console.log('ok atualização do cache conserva dono');
  }
  {
    const h = montar();
    const cache = h.carregar('cache-de-tela');
    cache.assinarLeituraEsvaziou(() => cache.invalidarRespostasAtrasadas());
    await cache.guardarTela('teste', ['A-antigo']);
    await cache.comCacheOffline('teste', async () => [])();
    assert.deepEqual(h.ler(TELA).dados, ['A-antigo'], 'invalidação durante aviso impede publicação');
    console.log('ok geração durante aviso de lista vazia');
  }
  console.log('5 cenários reais passaram');
})().catch(e => { console.error(e); process.exitCode = 1; });
