'use strict';
// Executa o módulo de domínio da UI real contra respostas de backend fabricadas.
// Nenhum servidor, sessão, storage remoto, Graph ou Meta é acessado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const fonte = fs.readFileSync(path.join(ROOT, 'tools/admin-local/web/telas/_publicacoes-reais.js'), 'utf8');
const sandbox = { Date, Intl, URLSearchParams, Set, Map, Object, Array, String, Number, RegExp, Error, Math };
vm.runInNewContext(`${fonte.replace(/^export /gm, '')}\nglobalThis.modulo = { API_PUBLICACOES, FUSO_PUBLICACAO, FORMATOS_PUBLICACAO, ROTULOS_ESTADO, UUID, erroContrato, dadosReais, dadosCatalogo, validarPeca, validarConta, capacidadeDaConta, horarioLocalParaUtc, horarioUtcParaLocal, rotuloDataHorario, validarDestino, validarJob, previaConfirmavel, resumirLote, caminhoMidia, criarClientePublicacoes };`, sandbox);
const m = sandbox.modulo;
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message); checks++; };

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const U4 = '44444444-4444-4444-8444-444444444444';
const ID = 'a'.repeat(16);
const VERSION = 'b'.repeat(40);
const BASE = { contractVersion: 'e5.real.v1', modo: 'real' };
const capacidades = ['feed', 'carrossel', 'reels', 'stories'].map((formato, i) => ({
  formato, estado: 'disponivel', revisao: i + 1, motivos: [],
  restricoes: { mime: ['image/jpeg', 'video/mp4'], minMidias: 1, maxMidias: formato === 'carrossel' ? 10 : 1, maxBytes: null, maxDuracaoSeg: null, proporcoes: [] },
}));
const conta = { contaId: 'conta-ig-grana', rede: 'instagram', rotulo: 'Grana.', revisao: 1, conexao: 'verificada', verificadaEm: '2026-10-17T20:00:00.000Z', pausada: false, capacidades };
const peca = { id: ID, titulo: 'Carrossel aprovado', versao: VERSION, tipo: 'carrossel', aprovada: true, miniaturaUrl: '/media/miniatura.jpg', bloqueios: [] };
const destino = { contaId: conta.contaId, rede: conta.rede, formato: 'carrossel' };
const agoraIso = new Date(Date.now() + 3600000).toISOString();
const job = {
  jobId: U1, loteId: U2, revisao: 1, snapshotId: U3,
  destino: { ...destino, publicarEm: '2026-10-18T18:30:00.000Z', fuso: m.FUSO_PUBLICACAO },
  estrategia: 'executor-remoto', estado: 'programado-no-painel', codigoErro: null,
  atualizadoEm: '2026-10-17T23:00:00.000Z', proximaVerificacaoEm: null,
  remotoId: null, permalink: null, confirmadoEm: '2026-10-17T23:00:00.000Z',
  concluidoEm: null, cancelamentoSolicitadoEm: null, recibosLimitados: false, recibos: [],
};
const previa = {
  ...BASE, previaId: U4, previaHash: 'c'.repeat(64), revisao: 2, expiraEm: agoraIso,
  snapshot: { snapshotId: U3, revisao: 1, estado: 'pronto', pecaId: ID, versao: VERSION,
    manifestoSha256: 'd'.repeat(64), aceiteId: U1, aceiteRevisao: 1, legenda: 'Legenda integral da peça.',
    legendaSha256: 'e'.repeat(64), midias: [{ ordem: 0, sha256: 'f'.repeat(64), tipo: 'imagem', mime: 'image/jpeg', bytes: 4000, largura: 1080, altura: 1350, duracaoSeg: null }],
    capa: { sha256: '1'.repeat(64), mime: 'image/jpeg', bytes: 900 }, motivos: [] },
  destinos: [{ ...destino, publicarEm: job.destino.publicarEm, fuso: m.FUSO_PUBLICACAO, contaRevisao: 1,
    capacidadeRevisao: 2, estado: 'pronto', motivos: [] }], podeConfirmar: true,
};

function envelope(dados) { return { ok: true, dados, atualizadoEm: '2026-10-17T23:00:00.000Z' }; }

(async () => {
  equal(m.API_PUBLICACOES, '/api/marketing/publicacoes', 'usa a rota canônica Node');
  equal(m.FUSO_PUBLICACAO, 'America/Sao_Paulo', 'fuso fixo da operação');
  equal(m.horarioLocalParaUtc('2026-10-18T15:30'), '2026-10-18T18:30:00.000Z', 'converte São Paulo para UTC sem fuso do navegador');
  equal(m.horarioUtcParaLocal('2026-10-18T18:30:00.000Z'), '2026-10-18T15:30', 'converte UTC para o campo de entrada São Paulo');
  ok(m.rotuloDataHorario('2026-10-18T18:30:00.000Z').includes('UTC'), 'resumo exibe UTC junto do horário do destino');
  assert.throws(() => m.horarioLocalParaUtc('2026-02-30T12:00'), /data ou a hora/);
  checks++;
  assert.throws(() => m.horarioLocalParaUtc('18/10/2026 15:30'), /data e hora/);
  checks++;

  ok(m.validarPeca(peca), 'peça aprovada vigente passa');
  ok(!m.validarPeca({ ...peca, aprovada: false }), 'peça pendente não passa');
  ok(!m.validarPeca({ ...peca, bloqueios: [{ codigo: 'versao-divergente' }] }), 'peça bloqueada não passa');
  ok(m.validarConta(conta), 'conta descoberta e verificável passa');
  ok(m.capacidadeDaConta(conta, 'carrossel').disponivel, 'carrossel é capacidade explícita');
  ok(!m.capacidadeDaConta({ ...conta, pausada: true }, 'feed').disponivel, 'conta pausada não fica selecionável');
  ok(!m.capacidadeDaConta({ ...conta, conexao: 'nao-verificada' }, 'feed').disponivel, 'conta não verificada não fica selecionável');
  ok(!m.capacidadeDaConta({ ...conta, capacidades: capacidades.map((c) => c.formato === 'stories' ? { ...c, estado: 'nao-verificado' } : c) }, 'stories').disponivel, 'formato sem validação fica bloqueado');
  ok(m.validarDestino(destino, [conta]), 'destino vem de conta/capacidade servidas');
  ok(!m.validarDestino({ ...destino, contaId: 'inventado' }, [conta]), 'conta digitada manualmente não passa');

  const parcial = m.resumirLote([
    job,
    { ...job, jobId: U4, estado: 'precisa-conferir' },
  ]);
  ok(parcial.parcial && parcial.rotulo.includes('Parcial') && parcial.rotulo.toLowerCase().includes('precisa conferir'), 'lote mantém estados independentes no agregado');
  ok(!m.resumirLote([job]).parcial, 'lote homogêneo conserva seu estado');
  equal(m.caminhoMidia(U4, 'capa'), `${m.API_PUBLICACOES}/midia?previaId=${U4}&indice=capa`, 'mídia usa referência autorizada e capa explícita');
  assert.throws(() => m.caminhoMidia('../../local.env', 0));
  checks++;
  ok(m.previaConfirmavel(previa), 'prévia real pronta e não expirada pode ser confirmada');
  ok(!m.previaConfirmavel({ ...previa, modo: 'simulacao' }), 'prévia simulada nunca libera confirmação real');
  ok(!m.previaConfirmavel({ ...previa, expiraEm: '2020-01-01T00:00:00.000Z' }), 'prévia expirada não libera confirmação');
  ok(!m.previaConfirmavel({ ...previa, destinos: [{ ...previa.destinos[0], estado: 'bloqueado', motivos: ['conta-pausada'] }] }), 'destino bloqueado impede confirmação do lote');

  const calls = [];
  const ctx = {
    api: async (url) => {
      calls.push(['GET', url]);
      if (url === `${m.API_PUBLICACOES}/capacidades`) return envelope({ ...BASE, estado: 'disponivel', contas: [conta], controles: { revisao: 1, habilitado: true, pausaGlobal: false, pausaFacebook: false, pausaInstagram: false, recuperacaoPendente: false, margemValidaAte: agoraIso } });
      if (url === `${m.API_PUBLICACOES}/catalogo`) return envelope({ pecas: [peca, { ...peca, id: 'e'.repeat(16), aprovada: false }] });
      if (url.startsWith(`${m.API_PUBLICACOES}?`)) return envelope({ ...BASE, jobs: [job], proximoCursor: null, limitado: false });
      if (url.startsWith(`${m.API_PUBLICACOES}/detalhe?`)) return envelope({ ...BASE, loteId: U2, jobs: [job] });
      return envelope({ ...BASE });
    },
    acao: async (url, body) => {
      calls.push(['POST', url, body]);
      if (body.acao === 'prever') return envelope(previa);
      if (body.acao === 'confirmar') return envelope({ ...BASE, loteId: U2, idempotencia: body.idempotencia, replay: false, jobs: [job] });
      return envelope({ ...BASE, estado: 'disponivel' });
    },
  };
  const api = m.criarClientePublicacoes(ctx);
  equal((await api.capacidades()).contas[0].rotulo, 'Grana.', 'carrega nome descoberto da conta');
  equal((await api.catalogo()).pecas.length, 1, 'catálogo exclui peça ainda não aprovada');
  const v = await api.prever({ peca, destinos: [destino], horarioLocal: '2026-10-18T15:30', contas: [conta] });
  ok(m.previaConfirmavel(v), 'resposta real da prévia fica conferível');
  const postPrever = calls.find((x) => x[0] === 'POST' && x[2].acao === 'prever');
  equal(Object.keys(postPrever[2]).sort(), ['acao', 'agendarPara', 'destinos', 'fuso', 'pecaId', 'versao'].sort(), 'prévia envia somente versão, destino, horário e fuso');
  equal(postPrever[2].agendarPara, '2026-10-18T18:30:00.000Z', 'destino vai ao servidor em UTC');
  await assert.rejects(() => api.prever({ peca, destinos: [{ ...destino, contaId: 'inventado' }], horarioLocal: '2026-10-18T15:30', contas: [conta] }), /deixou de estar verificada/);
  checks++;

  const idempotencia = '55555555-5555-4555-8555-555555555555';
  const lote = await api.confirmar(v, idempotencia);
  equal(lote.jobs.length, 1, 'confirmação devolve recibos por destino');
  const postConfirmar = calls.find((x) => x[0] === 'POST' && x[2].acao === 'confirmar');
  equal(postConfirmar[2], { acao: 'confirmar', previaId: U4, previaHash: 'c'.repeat(64), revisaoEsperada: 2, idempotencia, confirmacao: true }, 'confirmação envia hash/revisão/idempotência e confirmacao=true');
  await api.listar({ limite: 20, estado: 'precisa-conferir', rede: 'instagram', de: '2026-10-18T00:00:00.000Z' });
  ok(calls.some((x) => x[0] === 'GET' && x[1].includes('estado=precisa-conferir') && x[1].includes('rede=instagram')), 'lista paginada transmite filtros sem retirar cursor');
  await api.consultar({ jobId: U1 });
  ok(calls.some((x) => x[0] === 'GET' && x[1] === `${m.API_PUBLICACOES}/detalhe?jobId=${U1}`), 'consulta de detalhe usa jobId do servidor');
  await api.comando('pausar', { escopo: 'conta', contaId: conta.contaId, revisaoEsperada: 1, idempotencia, confirmacao: true });
  const postPausa = calls.find((x) => x[0] === 'POST' && x[2].acao === 'pausar');
  equal(postPausa[2], { acao: 'pausar', escopo: 'conta', contaId: conta.contaId, revisaoEsperada: 1, idempotencia, confirmacao: true }, 'pausa usa escopo por conta sem ID digitado');

  assert.throws(() => m.dadosReais(envelope({ ...BASE, modo: 'simulacao' })), /contrato de agendamento real/);
  checks++;
  assert.throws(() => m.dadosReais({ ok: false, dados: { ...BASE } }), /contrato de agendamento real/);
  checks++;
  equal(m.resumirLote([{ ...job, estado: 'desconhecido' }]).rotulo, 'Estado do lote indisponível', 'estado desconhecido nunca vira sucesso');

  console.log(`admin-publicacoes-reais-modelo: ${checks} verificações; dublê local explícito; zero HTTP externo/Meta.`);
})().catch((err) => { console.error(err); process.exit(1); });
