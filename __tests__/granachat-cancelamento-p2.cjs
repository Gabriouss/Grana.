const assert = require('node:assert/strict');
const { ambiente, pendente, observar, flush, nodes, find, linhas, digitar } = require('./helpers/chat-cancelamento-p2.cjs');
const watchdog = setTimeout(() => { console.error('Harness não terminou; não classificar como RED causal'); process.exit(2); }, 15000);
const casos = [], caso = (nome, fn) => casos.push([nome, fn]);
async function montar(c) { c.mount(); await flush(); c.render(); }
function enviar(c, texto = 'pergunta sintética') { digitar(c, texto); const handler = find(c, 'Enviar mensagem').props.onPress; const p = observar(handler()); c.render(); return p; }

caso('fechar enquanto sessão espera impede POST tardio (RED causal na base)', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  await montar(c); enviar(c); await flush();
  find(c, 'Fechar conversa').props.onPress(); c.render(); await flush();
  const escritas = c.writes;
  sessao.resolve({ data: { session: c.session('A') } }); await flush();
  assert.equal(c.posts.length, 0, 'fechar antes da sessão impede POST');
  assert.equal(c.writes, escritas, 'resolução tardia não publica nem finaliza janela fechada');
  c.unmount();
});
caso('cancelar deixa recibo e libera input sem aguardar SDK pendurado', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  await montar(c); enviar(c); await flush(); find(c, 'Cancelar consulta').props.onPress(); await flush(); c.render();
  assert.ok(find(c, 'Enviar mensagem')); assert.ok(linhas(c).some(m => m.erro && !m.carregando));
  assert.ok(linhas(c).some(m => /Confira seus lançamentos antes de enviar novamente/.test(m.texto)));
  sessao.resolve({ data: { session: c.session('A') } }); await flush(); assert.equal(c.posts.length, 0); c.unmount();
});
caso('fechar por prop protege corpo que não atende signal', async () => {
  const c = ambiente(), corpo = pendente(); c.body = () => corpo.promise;
  await montar(c); enviar(c); await flush(); c.visible = false; c.render(); await flush();
  const escritas = c.writes, focos = c.focuses;
  corpo.resolve({ resposta: 'RESPOSTA-A-TARDIA' }); await flush();
  assert.equal(c.writes, escritas); assert.equal(c.focuses, focos); assert.equal(c.posts.length, 1); c.unmount();
});
caso('finally antigo não limpa o novo pedido após cancelar e enviar novamente', async () => {
  const c = ambiente(), sessaoAntiga = pendente(), corpoNovo = pendente(); let consultas = 0;
  c.getSession = () => ++consultas === 1 ? sessaoAntiga.promise : Promise.resolve({ data: { session: c.session('A') } });
  c.body = () => corpoNovo.promise;
  await montar(c); enviar(c, 'antiga'); await flush(); find(c, 'Cancelar consulta').props.onPress(); await flush(); c.render();
  enviar(c, 'nova'); await flush(); c.render();
  sessaoAntiga.resolve({ data: { session: c.session('A') } }); await flush(); c.render();
  assert.ok(find(c, 'Cancelar consulta'), 'pedido novo continua em andamento'); assert.equal(c.posts.length, 1);
  corpoNovo.resolve({ resposta: 'RESPOSTA-NOVA', ferramenta: null }); await flush(); c.render();
  assert.ok(linhas(c).some(m => m.texto === 'RESPOSTA-NOVA')); c.unmount();
});
caso('troca de dono antes da sessão remove pergunta A e nunca envia como B', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  await montar(c); enviar(c, 'DRAFT-A'); await flush(); c.emit('B'); c.ownerUI = 'B'; c.render(); await flush(); c.render();
  sessao.resolve({ data: { session: c.session('A') } }); await flush(); c.render();
  assert.equal(c.posts.length, 0); assert.equal(linhas(c).length, 0);
  assert.equal(nodes(c.tree).find(n => n.type === 'TextInput').props.value, ''); c.unmount();
});
caso('primeira pintura da troca mascara mensagens sem esperar efeitos', async () => {
  const c = ambiente(); await montar(c); enviar(c, 'SEGREDO-SINTETICO-A'); await flush(); c.render();
  assert.ok(linhas(c).length > 0); c.ownerUI = 'B'; c.render(false);
  assert.equal(linhas(c).length, 0, 'não desenha mensagens A sob dono B');
  assert.equal(nodes(c.tree).find(n => n.type === 'TextInput').props.value, ''); c.unmount();
});
caso('SDK troca no corpo antes de React e A→B→A não aceita resposta velha', async () => {
  const c = ambiente(), corpo = pendente(); c.body = () => corpo.promise;
  await montar(c); enviar(c); await flush(); c.emit('B'); c.ownerUI = 'B'; c.render(); await flush();
  c.emit('A'); c.ownerUI = 'A'; c.render(); await flush(); c.render();
  corpo.resolve({ resposta: 'VELHA-A' }); await flush(); c.render();
  assert.ok(!linhas(c).some(m => m.texto === 'VELHA-A')); assert.equal(c.posts.length, 1); c.unmount();
});
caso('desmontagem cancela sessão e impede setters/foco tardios', async () => {
  const c = ambiente(), sessao = pendente(); c.getSession = () => sessao.promise;
  await montar(c); enviar(c); await flush(); c.unmount(); const focos = c.focuses;
  sessao.resolve({ data: { session: c.session('A') } }); await flush(); await c.advance(35000);
  assert.equal(c.posts.length, 0); assert.equal(c.writesAfterUnmount, 0); assert.equal(c.focuses, focos);
});
caso('corpo pendurado vence prazo com recibo incerto e zero reenvio', async () => {
  const c = ambiente(), corpo = pendente(); c.body = () => corpo.promise;
  await montar(c); enviar(c); await flush(); await c.advance(35000); c.render();
  assert.ok(find(c, 'Enviar mensagem')); assert.equal(c.posts.length, 1);
  assert.ok(linhas(c).some(m => m.erro && /pode ter sido recebido/.test(m.texto)));
  await c.advance(70000); assert.equal(c.posts.length, 1); c.unmount();
});
caso('histórico A atrasado não substitui pergunta/resposta da conta B', async () => {
  const c = ambiente(), antigo = pendente(); let leituras = 0;
  c.history = () => ++leituras === 1 ? antigo.promise : Promise.resolve({ data: [], error: null });
  await montar(c); c.emit('B'); c.ownerUI = 'B'; c.render(); await flush(); c.render();
  enviar(c, 'PERGUNTA-B'); await flush(); c.render();
  antigo.resolve({ data: [{ id: 'A', papel: 'usuario', texto: 'HISTORICO-A', criado_em: '2026-11-11T12:00:00.000Z', ferramenta_usada: null }], error: null });
  await flush(); c.render(); assert.ok(linhas(c).some(m => m.texto === 'PERGUNTA-B'));
  assert.ok(!linhas(c).some(m => m.texto === 'HISTORICO-A')); assert.equal(c.posts.length, 1); c.unmount();
});
caso('duplo toque antes da renderização faz um único POST', async () => {
  const c = ambiente(), corpo = pendente(); c.body = () => corpo.promise;
  await montar(c); digitar(c, 'fixture'); const handler = find(c, 'Enviar mensagem').props.onPress;
  handler(); handler(); await flush(); assert.equal(c.posts.length, 1);
  corpo.resolve({ resposta: 'ok', ferramenta: null }); await flush(); c.unmount();
});
caso('envio saudável preserva pergunta, resposta e ferramenta', async () => {
  const c = ambiente(); await montar(c); const p = enviar(c); await flush(); c.render();
  assert.equal(p.estado, 'resolvido'); assert.equal(c.posts.length, 1);
  assert.ok(linhas(c).some(m => m.papel === 'usuario' && m.texto === 'pergunta sintética'));
  assert.ok(linhas(c).some(m => m.papel === 'assistente' && m.texto === 'resposta sintética' && m.ferramenta_usada === 'fixture' && !m.carregando)); c.unmount();
});
(async () => { for (const [nome, fn] of casos) { await fn(); console.log('OK ' + nome); } console.log(casos.length + ' grupos do Granachat real'); })()
  .then(() => clearTimeout(watchdog), e => { clearTimeout(watchdog); console.error(e); process.exitCode = 1; });
