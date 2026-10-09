'use strict';
// Entrega dos pedidos de ajuste: o servidor do atalho só RECEBE; o vigia (processo à parte,
// terminal do Maestri) entrega. Módulos reais (fila, batimento, vigia, DTO) com fila em pasta
// temporária e processo falso: nada chama enviar.sh, agente, rede ou a fila real do autor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-vigia-'));
process.env.GRANA_ADMIN_PASTA_CONTA = pasta;
const batimento = require('../tools/admin-local/marketing/ajustes-vigia-estado.cjs');
const remotoMod = require('../tools/admin-local/marketing/ajustes-remoto.cjs');
const { pedidoPublico } = require('../tools/admin-local/marketing/ajustes-dto.cjs');
const fonte = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

function carregar(rel, requires = {}) {
  const m = { exports: {} };
  vm.runInNewContext(fonte(rel), {
    module: m, exports: m.exports, process, Date, structuredClone, setTimeout, setInterval, clearInterval, console, __dirname: path.dirname(path.join(raiz, rel)),
    require: (id) => id in requires ? requires[id]
      : id === '../config.cjs' ? { RAIZ: '/fixture', RAIZ_DADOS: '/fixture', tem: () => false, ler: () => undefined }
      : id === 'child_process' ? { execFile() { throw new Error('PROCESSO REAL PROIBIDO'); } }
      : id === './ajustes-remoto.cjs' ? remotoMod : require(id.startsWith('.') ? path.join(path.dirname(path.join(raiz, rel)), id) : id),
  });
  return m.exports;
}
const modFila = carregar('tools/admin-local/marketing/ajustes-fila.cjs');
const { classificarSaida, criarFila } = modFila;

function setup(entregar) {
  let now = Date.parse('2026-10-09T14:00:00Z'), n = 0;
  const db = { formato: 1, pedidos: [], eventos: [] }; const chamadas = [];
  const peca = { id: 'a'.repeat(16), caminho: 'docs/marketing/fixture/para-aprovacao/p', versao: 'a'.repeat(40), estado: 'para-aprovacao' };
  let serial = Promise.resolve();
  const deps = {
    agora: () => new Date(now).toISOString(), id: () => 'fixture-' + (++n), ler: () => structuredClone(db),
    transacao: (fn) => { const r = serial.then(() => { const s = structuredClone(db); const out = fn(s); Object.assign(db, s); return structuredClone(out); }); serial = r.catch(() => {}); return r; },
    obterPeca: () => ({ ...peca }), verificarCommit: async () => {},
    entregar: async (r) => { chamadas.push(['entregar', r.id]); return entregar?.(r); },
    log: (s) => chamadas.push(['log', s]), remoto: null, remotoAusente: 'fixture',
  };
  return { fila: criarFila(deps), db, peca, chamadas, deps, avancar: (ms) => { now += ms; } };
}
const erroCom = (codigo) => Object.assign(new Error(codigo), { codigo });
let total = 0;
async function teste(nome, fn) { await fn(); total++; console.log('OK ' + nome); }

(async () => {
  await teste('classificarSaida: so o motivo fixo sai; PARADO, exit 3 e timeout sao incertos', () => {
    const e1 = (extra = {}) => Object.assign(new Error('x'), { code: 1, ...extra });
    assert.equal(classificarSaida(e1(), 'NAO ENVIADO para Beacon: terminal inacessivel (maestri list / maestri debug)'), 'terminal-inacessivel');
    assert.equal(classificarSaida(e1(), 'NAO ENVIADO para Beacon: o Codex nao esta aberto neste terminal'), 'agente-fechado');
    assert.equal(classificarSaida(e1(), 'NAO ENVIADO para Beacon: a caixa nao esta vazia ("TEXTO DO AUTOR"); nada foi digitado'), 'caixa-ocupada');
    assert.equal(classificarSaida(e1(), 'NAO ENVIADO para Beacon: o texto continua PARADO na caixa. Nao reenvie'), 'entrega-incerta');
    assert.equal(classificarSaida(e1({ code: 3 }), 'ESTADO INCERTO para Beacon'), 'entrega-incerta');
    assert.equal(classificarSaida(e1({ code: null, killed: true }), ''), 'entrega-incerta');
    assert.equal(classificarSaida(e1(), 'mensagem nova que ninguem classificou'), 'entrega-falhou');
    assert.equal(classificarSaida(Object.assign(new Error('x'), { code: 'ENOENT' }), ''), 'entrega-falhou');
    assert.ok(!['terminal-inacessivel', 'agente-fechado', 'caixa-ocupada', 'entrega-incerta', 'entrega-falhou'].includes('TEXTO DO AUTOR'));
  });

  for (const [codigo, gasta] of [['terminal-inacessivel', false], ['agente-fechado', false], ['caixa-ocupada', false], ['entrega-incerta', true], ['entrega-falhou', true]]) {
    await teste(`falha ${codigo}: motivo gravado, tentativa ${gasta ? 'gasta' : 'devolvida'}, retry permitido`, async () => {
      const h = setup(() => { throw erroCom(codigo); });
      await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste ficticio' });
      await h.fila.tick({ receber: false });
      const p = h.db.pedidos[0];
      assert.equal(p.estado, 'falha-de-envio'); assert.equal(p.motivoFalha, codigo);
      assert.equal(p.tentativas, gasta ? 1 : 0); assert.equal(p.lease, null);
      const ev = h.db.eventos.at(-1); assert.equal(ev.estado, 'falha-de-envio'); assert.equal(ev.codigo, codigo); assert.equal(ev.motivo, codigo);
      const pub = pedidoPublico(p); assert.equal(pub.motivo, codigo);
      assert.ok(!JSON.stringify(pub).includes('ajuste ficticio') && !('textoOriginal' in pub) && pub.lease === null, 'DTO sem texto do autor nem lease');
      await h.fila.retry(p.id); assert.equal(h.db.pedidos[0].estado, 'novo'); assert.equal(h.db.pedidos[0].motivoFalha, null);
    });
  }

  await teste('erro sem codigo conhecido cai em entrega-falhou e gasta a tentativa (comportamento antigo)', async () => {
    const h = setup(() => { throw new Error('offline'); });
    await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' }); await h.fila.tick({ receber: false });
    assert.equal(h.db.pedidos[0].motivoFalha, 'entrega-falhou'); assert.equal(h.db.pedidos[0].tentativas, 1);
  });

  await teste('falha de ambiente repetida nao esgota o limite de 3 tentativas', async () => {
    const h = setup(() => { throw erroCom('terminal-inacessivel'); });
    await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' });
    for (let i = 0; i < 6; i++) { await h.fila.tick({ receber: false }); await h.fila.retry(h.db.pedidos[0].id); }
    assert.equal(h.db.pedidos[0].tentativas, 0); assert.equal(h.chamadas.filter((c) => c[0] === 'entregar').length, 6);
  });

  await teste('pedidos antigos (entrega-falhou em <2 s, sem motivo) recuperam a tentativa no retry', async () => {
    const h = setup();
    h.db.pedidos.push({ id: 'velho', pecaId: h.peca.id, estado: 'falha-de-envio', tentativas: 1, lease: null, textoOriginal: 'x' });
    h.db.eventos.push({ pedidoId: 'velho', estado: 'em-correcao', codigo: 'claim', em: '2026-10-09T03:09:45.886Z' }, { pedidoId: 'velho', estado: 'falha-de-envio', codigo: 'entrega-falhou', em: '2026-10-09T03:09:45.905Z' });
    await h.fila.retry('velho'); assert.equal(h.db.pedidos[0].tentativas, 0); assert.equal(h.db.pedidos[0].estado, 'novo');
    h.db.pedidos.push({ id: 'lento', pecaId: h.peca.id, estado: 'falha-de-envio', tentativas: 1, lease: null, textoOriginal: 'x' });
    h.db.eventos.push({ pedidoId: 'lento', estado: 'em-correcao', codigo: 'claim', em: '2026-10-09T03:00:00.000Z' }, { pedidoId: 'lento', estado: 'falha-de-envio', codigo: 'entrega-falhou', em: '2026-10-09T03:00:09.000Z' });
    await h.fila.retry('lento'); assert.equal(h.db.pedidos[1].tentativas, 1, 'falha demorada nao e sinal de ambiente');
  });

  await teste('o servidor sozinho nao entrega nem marca falha: so o vigia (tick sem receber) entrega', async () => {
    const h = setup();
    await h.fila.solicitar(h.peca, { versao: h.peca.versao, motivo: 'ajuste' });
    await h.fila.sincronizarRemoto(); // o que o servidor do atalho executa a cada 5 s
    assert.equal(h.chamadas.filter((c) => c[0] === 'entregar').length, 0);
    assert.equal(h.db.pedidos[0].estado, 'novo'); assert.equal(h.db.pedidos[0].tentativas, 0);
    const trecho = fonte('tools/admin-local/marketing/ajustes-fila.cjs').replace(/\r\n/g, '\n');
    const corpo = trecho.slice(trecho.indexOf('function iniciarRecepcao'), trecho.indexOf('const vigiaEstado'));
    assert.ok(corpo.includes('sincronizarRemoto') && !/\btick\s*\(/.test(corpo) && !corpo.includes('entregar'), 'recepcao nao chama tick nem entregar');
    const servidor = fonte('tools/admin-local/server.cjs');
    assert.ok(servidor.includes('iniciarRecepcao()') && !servidor.includes('iniciarVigia'), 'server.cjs usa so a recepcao');
    await h.fila.tick({ receber: false }); assert.equal(h.chamadas.filter((c) => c[0] === 'entregar').length, 1);
  });

  await teste('dois vigias concorrentes na mesma fila em disco entregam o pedido uma vez so', async () => {
    const compartilhada = modFila.repositorioPrivado();
    const chamadas = []; let n = 0;
    const peca = { id: 'b'.repeat(16), caminho: 'docs/marketing/fixture/para-aprovacao/q', versao: 'b'.repeat(40), estado: 'para-aprovacao' };
    const mk = () => criarFila({ ...compartilhada, agora: () => new Date().toISOString(), id: () => 'c-' + (++n), obterPeca: () => ({ ...peca }), verificarCommit: async () => {},
      entregar: async (r) => { chamadas.push(r.id); await new Promise((ok) => setTimeout(ok, 30)); }, log: () => {}, remoto: null, remotoAusente: 'fixture' });
    const v1 = mk(), v2 = mk();
    await v1.solicitar(peca, { versao: peca.versao, motivo: 'ajuste ficticio' });
    await Promise.all([v1.tick({ receber: false }), v2.tick({ receber: false }), v1.tick({ receber: false }), v2.tick({ receber: false })]);
    assert.equal(chamadas.length, 1); assert.equal(compartilhada.ler().pedidos[0].estado, 'em-correcao'); assert.equal(compartilhada.ler().pedidos[0].tentativas, 1);
    assert.equal(path.dirname(compartilhada.arquivo), pasta, 'fila em pasta temporaria, nunca a do autor');
  });

  await teste('batimento: sem arquivo, recente, vencido e pid morto', () => {
    const t0 = Date.parse('2026-10-09T14:00:00Z');
    assert.equal(batimento.ler(pasta, t0).ativo, false); assert.equal(batimento.ler(pasta, t0).ultimoBatimento, null);
    batimento.escrever(pasta, t0, 4242);
    assert.equal(batimento.ler(pasta, t0 + 5000, () => true).ativo, true);
    assert.equal(batimento.ler(pasta, t0 + batimento.VALIDADE_MS + 1, () => true).ativo, false);
    assert.equal(batimento.ler(pasta, t0 + 5000, () => false).ativo, false);
    assert.equal(batimento.ler(pasta, t0 - 5000, () => true).ativo, false, 'relogio para tras nao conta como ativo');
    fs.writeFileSync(path.join(pasta, 'ajustes-vigia.json'), '{lixo'); assert.equal(batimento.ler(pasta, t0).ativo, false);
    fs.rmSync(path.join(pasta, 'ajustes-vigia.json'));
  });

  await teste('vigia real: bate o coracao enquanto a fila esta vazia e para ao ser encerrado', async () => {
    const vigia = carregar('tools/admin-local/vigia-ajustes.cjs', { './marketing/ajustes-fila.cjs': modFila, './marketing/ajustes-vigia-estado.cjs': batimento });
    const parar = vigia.iniciar({ intervalo: 20, pasta, log: () => {} });
    await new Promise((ok) => setTimeout(ok, 90));
    assert.equal(batimento.ler(pasta).ativo, true);
    parar(); const visto = fs.statSync(path.join(pasta, 'ajustes-vigia.json')).mtimeMs;
    await new Promise((ok) => setTimeout(ok, 90)); assert.equal(fs.statSync(path.join(pasta, 'ajustes-vigia.json')).mtimeMs, visto, 'sem batimento depois de encerrado');
  });

  fs.rmSync(pasta, { recursive: true, force: true });
  console.log(`admin-ajustes-vigia: ${total} verificacoes OK (nenhum processo real, nenhuma fila real)`);
})().catch((e) => { console.error(e); process.exitCode = 1; fs.rmSync(pasta, { recursive: true, force: true }); });
