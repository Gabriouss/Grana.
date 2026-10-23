'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { criarPublicacoes, validarPedido } = require('../tools/admin-local/marketing/publicacoes.cjs');
const { criarEstado } = require('../tools/admin-local/marketing/publicacoes-reais-estado.cjs');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-intencao-'));
const U = '11111111-1111-4111-8111-111111111111', V = '22222222-2222-4222-8222-222222222222';
const calls = [];
let perder = true;
const remoto = { executar: async p => {
  calls.push(structuredClone(p));
  if (p.acao === 'consultar') return { jobs: [{ jobId: V }] };
  if (perder) { perder = false; throw Object.assign(Error('Resposta perdida'), { codigo: 'resultado-desconhecido' }); }
  return { loteId: V, idempotencia: p.idempotencia, jobs: [{ jobId: V }] };
} };
const montar = () => criarPublicacoes({ remoto, estado: criarEstado({ pasta }) });
const pedido = { acao: 'confirmar', previaId: U, previaHash: 'a'.repeat(64), revisaoEsperada: 1, idempotencia: U, confirmacao: true, capacidadesCliente: ['execucao-2h-v1'] };
(async () => {
  try {
    await assert.rejects(montar().executar('.', pedido), /Resposta perdida/);
    const { capacidadesCliente: _caps, ...pedidoAntigo } = pedido;
    const d = await montar().executar('.', { ...pedidoAntigo, idempotencia: V });
    assert.deepEqual(calls[0], calls[1], 'reinício/segunda aba repetem o corpo inteiro e a chave original');
    assert.equal(d.idempotenciaSolicitada, V);
    await montar().detalhe({ idempotencia: V });
    assert.equal(calls.at(-1).idempotencia, U, 'consulta pelo alias do browser encontra o pedido canônico');
    const previa = { acao: 'prever', pecaId: 'a'.repeat(16), versao: 'b'.repeat(40), destinos: [{ contaId: 'ig', rede: 'instagram', formato: 'feed' }], agendarPara: '2099-01-01T15:00:00Z', fuso: 'America/Sao_Paulo' };
    assert.equal(validarPedido(previa).politicaExecucao, undefined, 'cliente antigo não ganha 2h');
    assert.equal(validarPedido({ ...previa, politicaExecucao: 'recuperacao-2h-v1', capacidadesCliente: ['execucao-2h-v1'], consentimentoExecucao: true }).politicaExecucao, 'recuperacao-2h-v1');
    assert.throws(() => validarPedido({ ...previa, politicaExecucao: 'recuperacao-2h-v1' }), { codigo: 'pedido-invalido' });
    // Cláusula "Stories fora dos pedidos novos" revogada pelo autor em 23/10: só o Facebook continua recusado.
    assert.equal(validarPedido({ ...previa, destinos: [{ ...previa.destinos[0], formato: 'stories' }] }).destinos[0].formato, 'stories');
    assert.throws(() => validarPedido({ ...previa, destinos: [{ ...previa.destinos[0], rede: 'facebook', formato: 'stories' }] }), { codigo: 'pedido-invalido' });
    const estado = criarEstado({ pasta: path.join(pasta, 'incompleto') });
    const api = criarPublicacoes({ estado, remoto: { executar: async () => ({ loteId: V, jobs: [] }) } });
    await assert.rejects(api.executar('.', pedido), { codigo: 'resultado-desconhecido' });
    const db = JSON.parse(fs.readFileSync(estado.arquivo, 'utf8'));
    assert.equal(Object.values(db.intencoes)[0].estado, 'enviada', 'recibo inválido não encerra intenção');
    console.log('admin-publicacoes-recuperacao-duravel: corpo/chave persistidos, alias consultável, legado sem 2h e resultado incompleto pendente OK');
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
