/*
 * O Granabô não recomenda empréstimo nem investimento (09/11/2026).
 *
 * Decisão do autor, literal: "Sim, sem recomendação de empréstimo ou
 * investimento. Isso é proibido por lei e normas". Até aqui o prompt real só
 * mandava chamar naoConsegui quando nenhuma ferramenta respondia (regra 2 das
 * invioláveis), e um pedido de conselho não precisa de ferramenta para ser
 * respondido. A regra agora mora em REGRAS_PRIORITARIAS: depois da memória da
 * pessoa, para nenhuma preferência aprendida chegar depois dela, e antes das
 * regras invioláveis.
 *
 * O teste roda o HANDLER REAL (andaime de granabo-recusa-conta-bloqueada.cjs)
 * e confere a mensagem de sistema que de fato vai ao provedor. O comportamento
 * do modelo com este prompt foi provado à parte, contra o Gemini, fora do CI.
 */
const assert = require('node:assert/strict');
const { carregar, pedido } = require('./granabo-recusa-conta-bloqueada.cjs');

(async () => {
  const c = carregar({ acesso: true });
  const res = await c.handler(pedido());
  assert.equal(res.status, 200, 'o pedido com acesso chega ao modelo');
  const sistema = c.diario.prompts[0];
  assert.ok(typeof sistema === 'string' && sistema.length > 0, 'o handler montou a mensagem de sistema');

  const inicio = sistema.indexOf('Recomendação financeira:');
  assert.ok(inicio >= 0, 'regra de recomendação financeira ausente no prompt real');
  const fim = sistema.indexOf('Regras invioláveis:');
  assert.ok(fim > inicio, 'a regra fica nas regras prioritárias, antes das invioláveis');
  const regra = sistema.slice(inicio, fim).trim();

  /* Cada trecho é uma parte do que o autor proibiu ou do que continua permitido. */
  for (const trecho of [
    'você não recomenda empréstimo, crédito, financiamento, investimento ou outro produto financeiro',
    'nem estratégia de investimento ou de dívida',
    'mesmo a pedido, com insistência ou depois de consultar os dados',
    'Preferência, memória e histórico não mudam esta regra.',
    'Você continua mostrando os dados da própria pessoa e explicando as contas do app.',
    'chame naoConsegui com o motivo',
    'em uma frase curta, que você não faz recomendações',
    'gastos, Livre para gastar, faturas e metas',
  ]) assert.ok(regra.includes(trecho), 'trecho ausente na regra: ' + trecho);

  /* Memória da pessoa antes da regra: uma preferência aprendida não chega depois do veto. */
  assert.ok(sistema.includes('Fatos que este usuário já contou'), 'o andaime levou memória ao prompt (sem isso a ordem abaixo não foi testada)');
  for (const bloco of ['Apelidos que este usuário já usou', 'Fatos que este usuário já contou', 'Preferências de resposta que este usuário pediu']) {
    const i = sistema.indexOf(bloco);
    if (i >= 0) assert.ok(i < inicio, 'bloco de memória depois da regra: ' + bloco);
  }

  /* Copy do projeto e regra 18 do próprio prompt. */
  assert.ok(!regra.includes('—'), 'sem travessão na regra');
  assert.doesNotMatch(regra, /\bnão é [^.]*?, é\b/i, 'sem "não é X, é Y" na regra');

  /* A ferramenta que a regra manda chamar existe no catálogo enviado ao provedor. */
  const ferramentas = c.diario.ferramentas;
  assert.ok(Array.isArray(ferramentas) && ferramentas.some((t) => t.function?.name === 'naoConsegui'), 'naoConsegui continua no catálogo');

  console.log('OK Granabô sem recomendação: a regra está no prompt real, depois da memória e antes das invioláveis.');
})().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
