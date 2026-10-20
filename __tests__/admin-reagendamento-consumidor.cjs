'use strict';
// Consumidor real, respostas sintéticas. Nenhuma rede/credencial/servidor remoto.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
  const m = await import(pathToFileURL(path.resolve('tools/admin-local/web/telas/_publicacoes-reais.js')).href);
  const id = (n) => `${n}`.repeat(8) + '-' + `${n}`.repeat(4) + '-4' + `${n}`.repeat(3) + '-8' + `${n}`.repeat(3) + '-' + `${n}`.repeat(12);
  const destino = { contaId: 'ig-1', rede: 'instagram', formato: 'feed' };
  const conta = { contaId: 'ig-1', rede: 'instagram', rotulo: 'Sintética', revisao: 1, conexao: 'verificada', pausada: false,
    capacidades: [{ formato: 'feed', revisao: 1, estado: 'disponivel', motivos: [] }] };
  const job = { jobId: id(1), loteId: id(2), snapshotId: id(3), revisao: 5, estado: 'programado-no-painel',
    destino, atualizadoEm: new Date().toISOString(), recibos: [], reagendamento: { permitido: true, motivos: [] } };
  const suspenso = { ...job, pausado: true, motivoSuspensao: 'revisao-editorial' };
  assert.equal(m.descreverJobReal(suspenso).atencao, true, 'A2: motivo editorial requer atenção mesmo com estado programado');
  assert.equal(m.descreverJobReal(suspenso).texto, 'Suspenso para revisão');
  assert.match(m.descreverJobReal(suspenso).acao, /Revise e aprove/);
  assert.equal(m.resumirLote([suspenso]).rotulo, 'Suspenso para revisão');
  assert.equal(m.reagendamentoPermitido(suspenso), false, 'suspensão não pode ser contornada por metadado contraditório');
  assert.equal(m.descreverJobReal({ ...suspenso, estado: 'publicado' }).texto, 'Publicado', 'publicado continua publicado');
  assert.equal(m.descreverJobReal({ ...suspenso, estado: 'falhou' }).texto, 'Não saiu', 'falha terminal continua falha');
  assert.equal(m.descreverJobReal({ ...suspenso, motivoSuspensao: null }).atencao, false, 'sem motivo, estado normal é preservado');
  assert.match(m.descreverJobReal({ ...suspenso, estado: 'precisa-conferir' }).acao, /publicação anterior/);
  assert.equal(m.reagendamentoPermitido(job), true);
  for (const alteracao of [{ reagendamento: undefined }, { reagendamento: { permitido: 'true' } },
    { reagendamento: { permitido: true, motivos: ['estado-incompativel'] } },
    { estado: 'publicado' }, { remotoId: 'efeito-publico' }, { permalink: 'https://example.org/publicado' }]) {
    assert.equal(m.reagendamentoPermitido({ ...job, ...alteracao }), false, 'dado ausente/contraditório bloqueia');
  }
  assert.match(m.descreverJobReal({ ...job, estado: 'precisa-conferir', codigoErro: 'lease-vencida' }).acao, /nova prévia/);
  const previa = { contractVersion: 'e5.real.v1', modo: 'real', previaId: id(4), previaHash: 'a'.repeat(64), revisao: 1,
    expiraEm: new Date(Date.now() + 600000).toISOString(), podeConfirmar: true,
    snapshot: { snapshotId: job.snapshotId, estado: 'pronto' },
    destinos: [{ ...destino, publicarEm: '2026-12-01T15:00:00.000Z', estado: 'pronto', motivos: [] }] };
  const posts = [];
  let resposta = previa;
  const cliente = m.criarClientePublicacoes({ acao: async (url, body) => {
    posts.push({ url, body }); return { ok: true, dados: resposta };
  } });
  const pedido = { job, destinos: [destino], horarioLocal: '2026-12-01T12:00', contas: [conta] };
  assert.equal(await cliente.prever(pedido), previa);
  assert.deepEqual(posts[0].body, { acao: 'prever', jobId: job.jobId, destinos: [destino], agendarPara: '2026-12-01T15:00:00.000Z', fuso: 'America/Sao_Paulo' });
  assert.equal(posts.length, 1, 'prévia não confirma nem reagenda');
  for (const estado of ['publicado', 'agendado-na-meta', 'preparando', 'cancelado']) {
    await assert.rejects(cliente.prever({ ...pedido, job: { ...job, estado } }), /./);
  }
  await assert.rejects(cliente.prever({ ...pedido, destinos: [destino, destino] }), /./);
  await assert.rejects(cliente.prever({ ...pedido, destinos: [{ ...destino, contaId: 'outra' }] }), /./);
  assert.equal(posts.length, 1, 'estado ou destino inválido não envia pedido');
  for (const divergente of [
    { ...previa, snapshot: { ...previa.snapshot, snapshotId: id(5) } },
    { ...previa, destinos: [{ ...previa.destinos[0], rede: 'facebook' }] },
    { ...previa, destinos: [{ ...previa.destinos[0], publicarEm: '2026-12-01T15:01:00.000Z' }] },
  ]) {
    resposta = divergente;
    await assert.rejects(cliente.prever(pedido), (e) => e.codigo === 'previa-invalida');
  }
  const antes = posts.length;
  for (const campos of [{}, { previaId: id(4), previaHash: 'a'.repeat(64), confirmacao: false }]) {
    await assert.rejects(cliente.comando('reagendar', campos), (e) => e.codigo === 'confirmacao-bloqueada');
  }
  assert.equal(posts.length, antes, 'comando sem prévia/confirmacão não envia pedido');
  resposta = { ...previa, jobs: [job] };
  const comando = { jobId: job.jobId, revisaoEsperada: job.revisao, previaId: previa.previaId, previaHash: previa.previaHash,
    agendarPara: previa.destinos[0].publicarEm, fuso: 'America/Sao_Paulo', idempotencia: id(6), confirmacao: true };
  await cliente.comando('reagendar', comando);
  assert.deepEqual(posts.at(-1).body, { acao: 'reagendar', ...comando });
  assert.equal(posts.filter((p) => p.body.acao === 'confirmar').length, 0, 'substituição não usa confirmação genérica');
  console.log('admin-reagendamento-consumidor: prévia ligada ao alvo, destinos/horário/snapshot conferidos; confirmação obrigatória; zero HTTP real');
})().catch((e) => { console.error(e); process.exit(1); });
