const assert = require('node:assert/strict');
const { ambiente, pendente, observar, flush } = require('./helpers/chat-cancelamento-p2.cjs');
const watchdog = setTimeout(() => { console.error('Harness não terminou; não classificar como RED causal'); process.exit(2); }, 15000);
const casos = [];
const caso = (nome, fn) => casos.push([nome, fn]);
const iniciar = (c, signal) => observar(c.api.enviarPergunta('pedido sintético', [], signal, 'A'));

caso('signal já cancelado não consulta sessão nem faz POST (RED causal na base)', async () => {
  const c = ambiente(), ctrl = new AbortController(); ctrl.abort();
  const p = iniciar(c, ctrl.signal); await flush();
  assert.equal(c.posts.length, 0, 'cancelamento anterior impede POST, mesmo se fetch ignorar signal');
  assert.equal(c.sessionCalls, 0); assert.equal(p.estado, 'rejeitado');
});
caso('cancelamento durante getSession encerra logo e sessão tardia nunca envia', async () => {
  const c = ambiente(), sessao = pendente(), ctrl = new AbortController(); c.getSession = () => sessao.promise;
  const p = iniciar(c, ctrl.signal); await flush(); ctrl.abort(); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(c.posts.length, 0); assert.equal(c.listenerCount(), 0);
  sessao.resolve({ data: { session: c.session('A') } }); await flush();
  assert.equal(c.posts.length, 0); assert.equal(c.timerCount(), 0);
});
caso('prazo absoluto inclui sessão pendurada e não ressuscita depois', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  const p = iniciar(c); await flush(); await c.advance(35000);
  assert.equal(p.estado, 'rejeitado'); assert.equal(p.erro.resultadoRemotoIncerto, false); assert.equal(c.posts.length, 0);
  sessao.resolve({ data: { session: c.session('A') } }); await flush(); assert.equal(c.posts.length, 0);
});
caso('cancelamento na resolução da sessão ainda impede envio', async () => {
  const c = ambiente(), ctrl = new AbortController();
  c.getSession = async () => { ctrl.abort(); return { data: { session: c.session('A') } }; };
  const p = iniciar(c, ctrl.signal); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(c.posts.length, 0);
});
caso('sessão B não recebe pergunta originada na tela A', async () => {
  const c = ambiente(); c.ownerSDK = 'B'; const p = iniciar(c); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(c.posts.length, 0);
});
caso('evento do SDK A→B→A invalida a operação mesmo antes de React renderizar', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  const p = iniciar(c); await flush(); c.emit('B'); c.emit('A');
  sessao.resolve({ data: { session: c.session('A') } }); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(c.posts.length, 0);
});
caso('refresh da mesma conta conserva o envio saudável', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  const p = iniciar(c); await flush(); c.emit('A', 'TOKEN_REFRESHED');
  sessao.resolve({ data: { session: c.session('A') } }); await flush();
  assert.equal(p.estado, 'resolvido'); assert.equal(c.posts.length, 1);
});
caso('35 segundos são compartilhados entre sessão, fetch e corpo', async () => {
  const c = ambiente(), sessao = pendente(), headers = pendente(), corpo = pendente();
  c.getSession = () => sessao.promise; c.fetch = () => headers.promise;
  const p = iniciar(c); await flush(); await c.advance(20000);
  sessao.resolve({ data: { session: c.session('A') } }); await flush(); await c.advance(10000);
  headers.resolve({ ok: true, status: 200, json: () => corpo.promise }); await flush();
  await c.advance(4999); assert.equal(p.estado, 'pendente');
  await c.advance(1); assert.equal(p.estado, 'rejeitado');
  assert.equal(p.erro.resultadoRemotoIncerto, true); assert.equal(c.posts.length, 1);
  assert.equal(c.posts[0].options.signal.aborted, true);
  corpo.resolve({ resposta: 'tardia' }); await flush(); assert.equal(p.estado, 'rejeitado');
});
caso('fetch que ignora aborto não prende nem é reenviado', async () => {
  const c = ambiente(), headers = pendente(), ctrl = new AbortController(); c.fetch = () => headers.promise;
  const p = iniciar(c, ctrl.signal); await flush(); ctrl.abort(); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(p.erro.resultadoRemotoIncerto, true);
  headers.resolve({ ok: true, json: async () => ({ resposta: 'tardia' }) }); await flush();
  assert.equal(c.posts.length, 1); assert.equal(c.timerCount(), 0);
});
caso('cancelamento protege json pendurado após os cabeçalhos', async () => {
  const c = ambiente(), corpo = pendente(), ctrl = new AbortController(); c.body = () => corpo.promise;
  const p = iniciar(c, ctrl.signal); await flush(); ctrl.abort(); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(p.erro.resultadoRemotoIncerto, true);
  corpo.resolve({ resposta: 'não publicar' }); await flush();
  assert.equal(c.posts.length, 1); assert.equal(p.estado, 'rejeitado'); assert.equal(c.listenerCount(), 0);
});
caso('troca de conta no corpo preserva Bearer A e não publica como B', async () => {
  const c = ambiente(), corpo = pendente(); c.body = () => corpo.promise;
  const p = iniciar(c); await flush(); c.emit('B'); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(c.posts.length, 1);
  assert.equal(c.posts[0].options.headers.Authorization, 'Bearer token-sintetico-A');
  corpo.resolve({ resposta: 'A tardio' }); await flush(); assert.equal(p.estado, 'rejeitado');
});
caso('erro de transporte pós-POST deixa resultado incerto, sem log privado/retry', async () => {
  const c = ambiente(); c.fetch = async () => { throw Error('DETALHE-PRIVADO-SINTETICO'); };
  const p = iniciar(c); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(p.erro.resultadoRemotoIncerto, true);
  assert.match(p.erro.message, /Confira seus lançamentos antes de enviar novamente/);
  assert.equal(c.posts.length, 1); assert.ok(!JSON.stringify(c.logs).includes('DETALHE-PRIVADO'));
});
caso('corpo ilegível após envio também é incerto e não causa reenvio financeiro', async () => {
  const c = ambiente(); c.body = async () => { throw new SyntaxError('fixture'); };
  const p = iniciar(c); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(p.erro.resultadoRemotoIncerto, true); assert.equal(c.posts.length, 1);
});
caso('recusa HTTP conhecida conserva mensagem e não agenda retry', async () => {
  const c = ambiente(); c.fetch = async () => ({ ok: false, status: 429, json: async () => ({ mensagem: 'Limite sintético.' }) });
  const p = iniciar(c); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(p.erro.message, 'Limite sintético.'); assert.equal(c.posts.length, 1);
});
caso('modo de teste também cancela seu atraso e não acessa sessão/rede', async () => {
  const c = ambiente({ modoTeste: true }), ctrl = new AbortController();
  const p = iniciar(c, ctrl.signal); await flush(); ctrl.abort(); await flush();
  assert.equal(p.estado, 'rejeitado'); assert.equal(c.posts.length, 0); assert.equal(c.sessionCalls, 0); assert.equal(c.timerCount(), 0);
});
caso('três argumentos antigos, payload, retorno e formatação são preservados', async () => {
  const c = ambiente(), historico = [{ papel: 'usuario', texto: 'fixture' }];
  const resultado = await c.api.enviarPergunta('pergunta', historico);
  assert.equal(resultado.resposta, 'resposta sintética'); assert.equal(resultado.ferramenta, 'fixture');
  assert.deepEqual(JSON.parse(c.posts[0].options.body), { mensagem: 'pergunta', historico });
  assert.equal(c.posts.length, 1); assert.equal(c.listenerCount(), 0); assert.equal(c.timerCount(), 0);
});
(async () => { for (const [nome, fn] of casos) { await fn(); console.log('OK ' + nome); } console.log(casos.length + ' grupos do assistente real'); })()
  .then(() => clearTimeout(watchdog), e => { clearTimeout(watchdog); console.error(e); process.exitCode = 1; });
