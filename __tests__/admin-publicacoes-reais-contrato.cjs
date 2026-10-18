'use strict';
const assert = require('node:assert/strict');
const { criarPublicacoes } = require('../tools/admin-local/marketing/publicacoes.cjs');
const U = '11111111-1111-4111-8111-111111111111';
const destino = { contaId: 'conta-devolvida-pelo-servidor', rede: 'instagram', formato: 'carrossel' };
const efeitos = [];
const remoto = { prever: async (r, p) => { efeitos.push(['snapshot-antes-previa', r, p]); return { previaId: U }; },
  executar: async p => { efeitos.push(['operacao', p]); return { modo: 'real' }; } };
const api = criarPublicacoes({ remoto });
const base = { revisaoEsperada: 2, idempotencia: U, confirmacao: true };
const previa = { acao: 'prever', pecaId: 'a'.repeat(16), versao: 'b'.repeat(40), destinos: [destino], agendarPara: '2027-01-01T15:30:00Z', fuso: 'America/Sao_Paulo' };
(async () => {
  await api.executar('acervo-fixture', previa);
  assert.equal(efeitos[0][0], 'snapshot-antes-previa');
  assert.equal(efeitos[0][2].destinos[0].publicarEm, '2027-01-01T15:30:00.000Z');
  assert.equal(efeitos[0][2].destinos[0].formato, 'carrossel');
  for (const ruim of [{ ...previa, destinos: [destino, destino] }, { ...previa, url: 'https://arbitrario.invalid' },
    { ...previa, agendarPara: '2027-02-30T15:30:00Z' }, { ...previa, fuso: 'UTC' },
    { ...previa, destinos: [{ ...destino, token: 'qualquer' }] }]) {
    assert.throws(() => api.executar('.', ruim), { codigo: 'pedido-invalido' });
  }
  assert.equal(efeitos.length, 1);
  for (const acao of ['cancelar', 'reconciliar', 'reagendar']) {
    const p = { ...base, acao, jobId: U, ...(acao === 'reagendar' ? { agendarPara: previa.agendarPara, fuso: previa.fuso } : {}) };
    await api.executar('.', p);
    assert.equal(efeitos.at(-1)[1].acao, acao);
    assert.equal(efeitos.at(-1)[1].revisaoEsperada, 2);
    assert.equal(efeitos.at(-1)[1].idempotencia, U);
    assert.throws(() => api.executar('.', { ...p, versao: previa.versao }), { codigo: 'pedido-invalido' });
  }
  for (const acao of ['pausar', 'retomar']) {
    for (const escopo of ['global', 'facebook', 'instagram', 'conta']) {
      const p = { ...base, acao, escopo, ...(escopo === 'conta' ? { contaId: destino.contaId } : {}) };
      await api.executar('.', p);
      assert.equal(efeitos.at(-1)[1].escopo, escopo);
    }
    assert.throws(() => api.executar('.', { ...base, acao, escopo: 'conta' }), { codigo: 'pedido-invalido' });
    assert.throws(() => api.executar('.', { ...base, acao, escopo: 'global', contaId: U }), { codigo: 'pedido-invalido' });
  }
  const n = efeitos.length;
  assert.throws(() => api.executar('.', { ...base, acao: 'confirmar', previaId: U, previaHash: 'a'.repeat(64), cenario: 'sucesso' }), { codigo: 'pedido-invalido' });
  assert.equal(efeitos.length, n, 'nenhuma simulação ou campo livre alcança operação real');
  console.log('admin-publicacoes-reais-contrato: destinos/carrossel/fuso/controles/revisão/idempotência/negações OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
