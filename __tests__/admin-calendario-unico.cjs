'use strict';
const assert = require('node:assert/strict');
const { criarCalendarioUnico } = require('../tools/admin-local/marketing/calendario-unico.cjs');
const cursor = Buffer.from(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', criadoEm: '2026-10-01T12:00:00Z' })).toString('base64url');
const peca = { pecaId: 'a'.repeat(16), versao: 'b'.repeat(40) };
const job = (n, publicarEm, extras = {}) => ({ jobId: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`, revisao: 1,
  loteId: '22222222-2222-4222-8222-222222222222', peca, estado: 'programado-no-painel',
  confirmadoEm: '2026-09-30T12:00:00Z', destino: { publicarEm, fuso: 'America/Sao_Paulo', rede: 'instagram' }, ...extras });
(async () => {
  const calls = [], logs = [], editorial = { mes: '2026-10', itens: [{ data: '2026-10-04', peca: { id: peca.pecaId, versao: peca.versao } }], avisos: ['editorial'] };
  const antes = JSON.stringify(editorial);
  let pagina = { jobs: [job(1, '2026-10-01T02:59:59Z'), job(2, '2026-11-01T02:59:59Z'), job(3, '2026-11-01T03:00:00Z'),
    job(4, '2026-10-03T12:00:00Z', { confirmadoEm: null }), job(2, '2026-11-01T02:59:59Z', { revisao: 2, estado: 'publicado', permalink: null })], limitado: true, proximoCursor: cursor };
  const calendario = criarCalendarioUnico({ editorial: () => editorial,
    catalogo: () => ({ pecas: [{ id: peca.pecaId, versao: peca.versao, aprovada: true, titulo: 'Antiga' }] }),
    listar: async p => { calls.push(p); if (pagina instanceof Error) throw pagina; return pagina; }, log: c => logs.push(c) });
  const r = await calendario('/inexistente', { mes: '2026-10' });
  assert.equal(r.camada, 'ambos'); assert.equal(r.reais.completo, false); assert.equal(r.reais.continuacao, false);
  assert.equal(r.reais.itens.length, 1); assert.equal(r.reais.itens[0].data, '2026-10-31');
  assert.equal(r.reais.itens[0].revisao, 2); assert.equal(r.reais.itens[0].permalink, null);
  assert.equal(r.vinculos.length, 1);
  assert.deepEqual(r.vinculos[0].jobIds, [job(1).jobId, job(2).jobId, job(3).jobId]);
  assert.equal(r.vinculos[0].destinos.find(d => d.jobId === job(3).jobId).data, '2026-11-01', 'vínculo fora do mês impede duplicação no mês antigo');
  assert.equal(r.pendenciasLegenda.length, 1); assert.ok(r.avisos.some(a => a.includes('Leitura parcial')));
  assert.ok(r.avisos.some(a => a.includes('link da publicação'))); assert.equal(JSON.stringify(editorial), antes);
  assert.deepEqual(calls, [{ limite: 50 }]);
  pagina = { jobs: [job(5, '2026-10-04T12:00:00Z', { estado: 'precisa-conferir' }), job(6, '2026-10-05T12:00:00Z', { estado: 'cancelado', peca: { ...peca, versao: 'c'.repeat(40) } })], limitado: false, proximoCursor: null };
  const fim = await calendario('.', { mes: '2026-10', cursorReal: cursor, camada: 'real' });
  assert.equal(fim.reais.continuacao, true); assert.equal(fim.reais.completo, true); assert.equal(fim.vinculos.length, 2);
  assert.equal(fim.itens, editorial.itens); assert.deepEqual(calls[1], { limite: 50, cursor });
  pagina = { jobs: [job(7, '2026-09-01T12:00:00Z')], limitado: true, proximoCursor: cursor };
  const parcialVazio = await calendario('.', { mes: '2026-10' });
  assert.equal(parcialVazio.reais.itens.length, 0); assert.equal(parcialVazio.reais.completo, false);
  pagina = new Error('CONTEUDO_PRIVADO');
  const erro = await calendario('.', { mes: '2026-10', cursorReal: cursor });
  assert.equal(erro.reais.status, 'indisponivel'); assert.equal(erro.reais.completo, false); assert.equal(erro.reais.continuacao, true);
  assert.equal(JSON.stringify(erro).includes('CONTEUDO_PRIVADO'), false); assert.equal(logs.length, 1);
  const n = calls.length; const planejado = await calendario('.', { mes: '2026-10', camada: 'planejado' });
  assert.equal(calls.length, n); assert.equal(planejado.reais.status, 'nao-consultado');
  for (const filtros of [{ mes: '2026-13' }, { mes: '' }, { camada: 'outro' }, { cursorReal: '' }, { cursorReal: 'xyz' }, { admin: 'proibido' }]) {
    await assert.rejects(calendario('.', filtros), e => e.status === 400);
  }
  pagina = { jobs: [], limitado: false, proximoCursor: null };
  const vazio = await calendario('.', { mes: '2026-10' }); assert.equal(vazio.reais.completo, true); assert.equal(vazio.reais.itens.length, 0);
  pagina = { jobs: [job(8, '2026-10-05T12:00:00Z', { estado: 'publicado', permalink: 'javascript:alert(1)' })], limitado: false };
  assert.equal((await calendario('.', { mes: '2026-10' })).reais.itens[0].permalink, null);
  pagina.jobs[0].permalink = 'https://www.instagram.com/p/origem-real/';
  assert.equal((await calendario('.', { mes: '2026-10' })).reais.itens[0].permalink, pagina.jobs[0].permalink);
  console.log('admin-calendario-unico: mês BRT, cursor, parcial/vazio/falha, confirmação, versões, recibos e zero escrita OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
