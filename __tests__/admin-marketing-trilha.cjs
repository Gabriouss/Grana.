'use strict';
// F4: módulos reais em VM, fila/tempo/dados fictícios; sem env, rede ou entrega real.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const base = path.resolve(__dirname, '../tools/admin-local/marketing');
let agora = Date.parse('2026-10-12T13:00:00Z');
class Relogio extends Date { static now() { return agora; } }
const negar = () => { throw new Error('efeito externo proibido'); };
function modulo(nome, imports = {}) {
  const m = { exports: {} };
  const permitidos = { fs: new Proxy({}, { get: () => negar }), path,
    os: { homedir: () => '/fixture' }, 'node:os': { hostname: () => 'fixture' },
    crypto: { randomUUID: negar }, child_process: { execFile: negar },
    './legenda-publicacao.cjs': require('../tools/admin-local/marketing/legenda-publicacao.cjs'),
    '../config.cjs': { RAIZ: '/fixture', RAIZ_DADOS: '/fixture' },
    './ajustes-remoto.cjs': { remotoDoEnv: () => ({ remoto: null }) }, ...imports };
  vm.runInNewContext(fs.readFileSync(path.join(base, nome), 'utf8'), {
    module: m, exports: m.exports, Buffer, Date: Relogio, structuredClone, console,
    process: { pid: 123, env: Object.freeze({}) }, setTimeout: negar, setInterval: negar,
    require: (id) => { assert(Object.hasOwn(permitidos, id), 'import não permitido: ' + id); return permitidos[id]; },
  }, { filename: nome });
  return m.exports;
}
const dto = modulo('ajustes-dto.cjs'), real = modulo('ajustes-fila.cjs');
const db = { formato: 1, pedidos: [], eventos: [] }, calls = [], logs = [];
let contador = 0;
const p = { id: 'a'.repeat(16), legenda: 'Legenda valida da fixture.', caminho: 'docs/marketing/fixture/para-aprovacao/peca.jpg', versao: 'b'.repeat(40), estado: 'para-aprovacao' };
const fila = real.criarFila({ agora: () => new Date(agora).toISOString(), id: () => '11111111-1111-4111-8111-' + String(++contador).padStart(12, '0'),
  ler: () => structuredClone(db), transacao: async (fn) => { const copia = structuredClone(db), r = fn(copia); Object.assign(db, copia); return structuredClone(r); },
  obterPeca: () => ({ ...p }), verificarCommit: async () => calls.push('commit'), entregar: async () => calls.push('entrega'), log: (v) => logs.push(v) });
const estimativa = { ferramenta: 'Ferramenta fictícia', gerado: 'CANARIO_GERADO_PRIVADO', creditos: 2, valorReais: 3.5, cotacao: 5, motivoNaoLocal: 'Sem alternativa local nesta estimativa fictícia' };
(async () => {
  const pedido = await fila.solicitar(p, { versao: p.versao, motivo: 'CANARIO_TEXTO_PRIVADO' });
  agora += 1000; await fila.tick({ receber: false }); const ativo = fila.listar()[0];
  assert.deepEqual(calls, ['entrega']); assert.equal(fila.eventos().filter((e) => e.codigo === 'entregue').length, 1);
  agora += 1000; await fila.marcar(pedido.id, ativo.lease.id, 'aguardando-aprovacao-de-custo', { pecaId: p.id, estimativa });
  agora += 1000; await fila.autorizarCusto(pedido.id, ativo.lease.id, 'CANARIO_EVIDENCIA_PRIVADA');
  agora += 1000; await fila.consumirAutorizacaoCusto(pedido.id, ativo.lease.id);
  agora += 1000; p.versao = 'c'.repeat(40); await fila.marcar(pedido.id, ativo.lease.id, 'corrigido-aguardando-aceite', { pecaId: p.id, versao: p.versao, commit: 'd'.repeat(40) });
  agora += 1000; await fila.aceitar(p, pedido.id);
  db.eventos.push({ pedidoId: pedido.id, codigo: 'CANARIO_CODIGO_PRIVADO', em: new Date(agora).toISOString(), estado: 'CANARIO_ESTADO_PRIVADO' });
  db.eventos.push({ pedidoId: 'outro', codigo: 'pedido-recebido', em: new Date(agora).toISOString() });
  const publico = dto.pedidoPublico(fila.listar()[0], p, { eventos: fila.eventos().reverse(), vigia: { ativo: true }, agora });
  assert.deepEqual(Array.from(publico.eventos, (e) => e.tipo), ['pedido', 'entrega', 'custo', 'custo-autorizado', 'custo', 'correcao', 'aceite']);
  assert.equal(publico.eventos.find((e) => e.tipo === 'custo').custo.valorReais, 3.5);
  assert(!JSON.stringify(publico).includes('CANARIO_')); assert(!JSON.stringify(publico.eventos).includes(pedido.id));
  assert(!JSON.stringify(publico.eventos).includes(ativo.lease.id)); assert.equal(publico.lease, null);
  console.log('OK eventos reais de pedido/entrega/custo/correção/aceite cronológicos, valor e DTO fechado');

  const inicio = Date.parse('2026-10-12T12:00:00Z');
  const novo = { estado: 'novo', criadoEm: new Date(inicio).toISOString() };
  assert.equal(dto.alertasPublicos(novo, { ativo: false }, inicio + 600000).length, 0);
  assert.equal(dto.alertasPublicos(novo, { ativo: false }, inicio + 600001)[0].codigo, 'entrega-parada');
  assert.equal(dto.alertasPublicos(novo, { ativo: true }, inicio + 600001).length, 0);
  assert.equal(dto.alertasPublicos({ ...novo, criadoEm: 'inválido' }, { ativo: false }, agora).length, 0);
  const corrigindo = { estado: 'em-correcao', lease: { id: 'CANARIO_LEASE', expiraEm: new Date(inicio + 300000).toISOString() } };
  assert.equal(dto.alertasPublicos(corrigindo, null, inicio)[0].codigo, 'lease-vencendo');
  assert.equal(dto.alertasPublicos(corrigindo, null, inicio - 1).length, 0);
  assert.equal(dto.alertasPublicos(corrigindo, null, inicio + 300000)[0].codigo, 'lease-vencido');
  assert.equal(dto.alertasPublicos({ ...corrigindo, estado: 'aceito' }, null, inicio + 300000).length, 0);
  let beat = { pid: 123, em: new Date(inicio).toISOString() };
  const vigia = modulo('ajustes-vigia-estado.cjs', { fs: { readFileSync: () => JSON.stringify(beat) } });
  assert.equal(vigia.ler('/fixture', inicio + 20000, () => true).ativo, true);
  assert.equal(vigia.ler('/fixture', inicio + 20001, () => true).ativo, false);
  assert.equal(vigia.ler('/fixture', inicio + 1, () => false).ativo, false);
  console.log('OK alertas 10min/5min, estado preservado, vigia real com batimento 20s');

  const promovida = { id: 'e'.repeat(16), caminho: p.caminho.replace('para-aprovacao', 'aprovados'), versao: p.versao, estado: 'aprovados' };
  const aceite = { id: p.id, caminho: p.caminho, versao: p.versao, aprovadoEm: new Date(agora).toISOString(), evidencia: 'aceite pelo autor no painel local' };
  const promocao = { ...aceite, id: promovida.id, caminho: promovida.caminho, origem: { id: p.id }, promovidoEm: new Date(agora + 1000).toISOString() };
  const plano = { id: promovida.id, versao: p.versao, planejadoEm: new Date(agora + 2000).toISOString(), data: '2026-10-20', hora: '19:00', canal: 'reels', observacao: 'CANARIO_OBSERVACAO' };
  const catalogo = modulo('catalogo.cjs', { './ajustes-dto.cjs': dto, './ajustes-fila.cjs': { fila, vigiaEstado: () => ({ ativo: false }) },
    fs: { readFileSync: (f) => JSON.stringify(f.endsWith('aprovacoes.json') ? { aprovacoes: [aceite, promocao] } : f.endsWith('calendario.json') ? { planejados: [plano] } : { recusas: [] }) } });
  const pecas = catalogo.enriquecer('/fixture', [promovida]);
  const eventos = pecas[0].trilha.eventos;
  assert(eventos.some((e) => e.tipo === 'pedido')); assert(eventos.some((e) => e.tipo === 'promocao'));
  assert.equal(eventos.at(-1).tipo, 'data'); assert.equal(eventos.at(-1).data, '2026-10-20');
  assert(!JSON.stringify(eventos).includes('CANARIO_')); assert(!JSON.stringify(eventos).includes(pedido.id));
  for (let i = 1; i < eventos.length; i++) assert(Date.parse(eventos[i - 1].em) <= Date.parse(eventos[i].em));
  const semD = dto.trilhaPublica(promovida, [], [], [], [{ ...plano, data: null, planejadoEm: null, recibos: [{ tipo: 'entrada-automatica', em: plano.planejadoEm }] }]);
  assert.equal(semD.length, 0, 'entrada aguardando D não é data marcada');
  const historicoDatas = dto.trilhaPublica(promovida, [], [], [], [{ ...plano, planejadoEm: null, recibos: [
    { tipo: 'data-marcada', em: new Date(agora + 2000).toISOString(), data: '2026-10-20', hora: '19:00', canal: 'reels' },
    { acao: 'substituicao-manual', em: new Date(agora + 3000).toISOString(), data: '2026-10-21', hora: '20:00', canal: 'stories' }] }]);
  assert.deepEqual(Array.from(historicoDatas, (v) => v.data), ['2026-10-20', '2026-10-21']);
  const recusada = { ...promovida, id: 'f'.repeat(16), caminho: promovida.caminho.replace('aprovados', 'historico'), estado: 'historico' };
  const recusa = { id: recusada.id, caminho: recusada.caminho, versao: recusada.versao,
    origem: { id: promovida.id, caminho: promovida.caminho }, motivo: 'CANARIO_RECUSA_PRIVADA' };
  const catalogoHistorico = modulo('catalogo.cjs', { './ajustes-dto.cjs': dto, './ajustes-fila.cjs': { fila, vigiaEstado: () => ({ ativo: false }) },
    fs: { readFileSync: (f) => JSON.stringify(f.endsWith('aprovacoes.json') ? { aprovacoes: [aceite, promocao] } : f.endsWith('calendario.json') ? { planejados: [plano] } : { recusas: [recusa] }) } });
  const anteriores = catalogoHistorico.enriquecer('/fixture', [recusada])[0].trilha.eventos;
  assert.deepEqual(JSON.parse(JSON.stringify(anteriores)), JSON.parse(JSON.stringify(eventos)), 'recusa depois da promoção conserva toda a trilha anterior');
  assert.equal(anteriores.find((e) => e.tipo === 'custo').custo.valorReais, 3.5);
  assert(!JSON.stringify(anteriores).includes('CANARIO_'));
  for (const e of anteriores) {
    assert(Object.keys(e).every((k) => ['tipo', 'em', 'estado', 'custo', 'data', 'hora', 'canal'].includes(k)));
    if (e.custo) assert(Object.keys(e.custo).every((k) => ['ferramenta', 'creditos', 'valorReais', 'cotacao'].includes(k)));
  }
  console.log('OK recusa após promoção preserva eventos/custo/data pela prova de origem, whitelist fechada');
  console.log('OK catálogo real reúne fila de origem, aceite, promoção e data sem IDs/texto privado');
  console.log('admin-marketing-trilha: módulos reais, zero rede/env/entrega real');
})().catch((e) => { console.error(e); process.exitCode = 1; });
