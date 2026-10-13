'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const mods = new Map();
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas', nome), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { module: m, exports: m.exports, require: (id) => load(id.replace('./', '')), console, Date, setTimeout: () => 0, clearTimeout() {} });
  return m.exports;
}
const pecas = load('_pecas.js'), ajustes = load('ajustes.js');
const p = (id, extra = {}) => ({ id, familia: id, estado: 'para-aprovacao', ...extra });
const pedido = (pecaId, estado, extra = {}) => ({ pecaId, estado, criadoEm: '2026-10-12T10:00:00Z', ...extra });
const acervo = [p('a'), p('b', { familia: 'a' }), p('c'), p('d', { aprovada: true }), p('e', { aprovada: true, estado: 'aprovados' })];
const familias = pecas.agruparFamilias(acervo);
const fila = [pedido('c', 'novo')];
assert.equal(ajustes.contarPrecisaDeVoce(familias, fila), 2, 'uma familia sem aceite e uma aceita aguardando mover');
for (const codigo of ['entrega-parada', 'lease-vencendo', 'lease-vencido']) {
  const alertas = [{ codigo, motivo: 'Aviso do servidor', proximoPasso: 'Confira o vigia.' }];
  const f = [pedido('c', codigo === 'entrega-parada' ? 'novo' : 'em-correcao', { alertas })];
  const s = ajustes.situacaoDaFamilia(familias.find((g) => g.principal.id === 'c'), f);
  assert.equal(s.secao, 'voce'); assert.equal(s.proximo, 'Confira o vigia.'); assert.equal(s.alertas[0].motivo, 'Aviso do servidor');
  assert.equal(ajustes.contarPrecisaDeVoce(familias, f), 3);
  assert.equal(f[0].estado, codigo === 'entrega-parada' ? 'novo' : 'em-correcao', 'UI nao altera estado da fila');
}
assert.equal(ajustes.situacaoDaDemanda(p('c', { ajuste: { alertas: [{ codigo: 'entrega-parada', proximoPasso: 'Retome a entrega.' }] } }), []).secao, 'voce');
assert.equal(ajustes.situacaoDaDemanda(p('c'), [pedido('c', 'novo', { alertas: [{ codigo: 'desconhecido' }] })]).secao, 'agentes');
assert.equal(ajustes.textoAlertaDemanda({codigo:'entrega-parada',idadeMs:11*60000}),'Pedido aguardando há 11 min. O vigia está inativo.');
assert.equal(ajustes.textoAlertaDemanda({codigo:'lease-vencendo',restanteMs:4*60000}),'A reserva da correção vence em 4 min.');
assert.equal(ajustes.textoAlertaDemanda({codigo:'lease-vencido'}),'A reserva da correção venceu.');
const src = fs.readFileSync('tools/admin-local/web/app.js', 'utf8');
const trecho = src.slice(src.indexOf('function contadorAprovacao(n)'), src.indexOf('async function renderizar()'));
const link = {}, calls = [], logs = [];
let falha = false, obsoleta = false;
const timers = new Map(); let timerId = 0;
const s = { epoca: 0, geracao: 1, bloqueado: null, acesso: null,
  document: { querySelector: (q) => q === '[data-contador-aprovacao]' ? link : null, querySelectorAll: () => [], getElementById: () => null, body: { appendChild() {} } }, console: { warn: (...a) => logs.push(a) },
  h: () => ({ querySelector: () => ({ focus() {} }) }), faixa: () => null, limpar() {}, limpezaAtual: null,
  MOTIVOS_COM_CAUSA: ['saiu'], TEXTO_BLOQUEIO: { 'servidor-fora': { titulo: 'Servidor fora', texto: 'Fixture' }, saiu: { titulo: 'Saiu', texto: 'Fixture' } },
  setTimeout: (f, ms) => { assert.equal(ms,15000); timers.set(++timerId,f); return timerId; }, clearTimeout: (id) => timers.delete(id),
  agruparFamilias: pecas.agruparFamilias, juntarCapasAoReel: pecas.juntarCapasAoReel, contarPrecisaDeVoce: ajustes.contarPrecisaDeVoce,
  api: async (url) => { calls.push(url); if (falha) throw Error('fixture'); return { dados: url.endsWith('/pecas') ? { pecas: acervo } : { pedidos: fila } }; },
};
vm.runInNewContext(trecho, s);
const bloqueioReal = src.slice(src.indexOf('export function bloquearPainel('), src.indexOf('// Só pedido nascido de gesto')).replace('export function', 'function');
const esconderReal = src.slice(src.indexOf('function esconderPainel()'), src.indexOf('function mostrarPainel()'));
const inicioSessao = src.indexOf('const podeDesenhar =');
vm.runInNewContext(bloqueioReal + esconderReal + src.slice(inicioSessao, src.indexOf(';', inicioSessao) + 1), s);
(async () => {
  await s.atualizarContadorAprovacao(() => obsoleta);
  assert.equal(link.textContent, 'Aprovação (2)');
  assert.deepEqual(calls, ['/api/marketing/pecas', '/api/marketing/ajustes'], 'contador somente GET, sem efeitos');
  falha = true; await s.atualizarContadorAprovacao(() => obsoleta);
  assert.equal(link.textContent, 'Aprovação'); assert(link.title.includes('conferir')); assert.equal(logs.length, 1);
  obsoleta = true; link.textContent = 'Aprovação (8)'; falha = false;
  await s.atualizarContadorAprovacao(() => obsoleta); assert.equal(link.textContent, 'Aprovação (8)', 'resposta antiga nao sobrescreve contador');
  obsoleta=false;falha=false;calls.length=0;
  s.acompanharContadorAprovacao(()=>obsoleta,false);await new Promise(r=>setImmediate(r));
  assert.equal(link.textContent,'Aprovação (2)');assert.equal(timers.size,1);
  fila.push(pedido('c','em-correcao',{alertas:[{codigo:'lease-vencendo',proximoPasso:'Confira a reserva.'}]}));
  // Troca pelo recibo recente real: a fila é ordenada pelo helper.
  fila[0]=fila.pop();
  let [id,tick]=timers.entries().next().value;timers.delete(id);await tick();
  assert.equal(link.textContent,'Aprovação (3)','alerta novo chega ao menu sem navegar');
  assert.equal(calls.length,4);assert.equal(timers.size,1,'uma tentativa de cada vez');
  falha=true;[id,tick]=timers.entries().next().value;timers.delete(id);await tick();
  assert.equal(link.textContent,'Aprovação');assert.equal(timers.size,1,'erro tenta novamente e nao conserva contagem como atual');
  falha=false;[id,tick]=timers.entries().next().value;timers.delete(id);const chamadasAntes=calls.length;obsoleta=true;await tick();
  assert.equal(calls.length,chamadasAntes);assert.equal(timers.size,0,'tela antiga para polling');
  obsoleta=false;s.acompanharContadorAprovacao(()=>obsoleta,false);await new Promise(r=>setImmediate(r));assert.equal(timers.size,1);
  s.acompanharContadorAprovacao(()=>obsoleta,true);assert.equal(timers.size,0,'Aprovacao usa somente seu polling compartilhado');
  for (const motivo of ['servidor-fora','saiu']) {
    s.bloqueado=null;s.acesso={entrou:true,parar(){}};
    s.acompanharContadorAprovacao(()=>false,false);await new Promise(r=>setImmediate(r));
    assert.equal(timers.size,1);const callback=timers.values().next().value, antesCalls=calls.length;
    s.bloquearPainel(motivo);assert.equal(timers.size,0,'bloqueio/logout cancela timer real');
    await callback();assert.equal(calls.length,antesCalls,'callback ja despachado nao faz GET apos bloqueio/logout');
    assert.equal(timers.size,0,'bloqueio/logout nao reagenda');
  }
  s.bloqueado=null;s.acesso={entrou:true};
  s.acompanharContadorAprovacao(()=>false,false);await new Promise(r=>setImmediate(r));
  const callbackSaida=timers.values().next().value, callsSaida=calls.length;
  s.esconderPainel();assert.equal(timers.size,0);await callbackSaida();
  assert.equal(calls.length,callsSaida,'epoca de sessao invalida callback mesmo sem bloqueado');assert.equal(timers.size,0);
  s.acesso={entrou:false,legado:false};s.acompanharContadorAprovacao(()=>false,false);
  await new Promise(r=>setImmediate(r));assert.equal(calls.length,callsSaida,'sem sessao nao inicia GET');assert.equal(timers.size,0);
  s.acesso={entrou:true,parar(){}};const apiOriginal=s.api,resolvers=[];
  s.api=(url)=>{calls.push(url);return new Promise(r=>resolvers.push(()=>r({dados:url.endsWith('/pecas')?{pecas:acervo}:{pedidos:fila}})));};
  s.acompanharContadorAprovacao(()=>false,false);assert.equal(resolvers.length,2);
  const callsPendente=calls.length;s.bloquearPainel('saiu');link.textContent='SENTINELA';
  resolvers.forEach(r=>r());await new Promise(r=>setImmediate(r));
  assert.equal(link.textContent,'SENTINELA','resposta de antes do logout nao escreve menu');
  assert.equal(calls.length,callsPendente);assert.equal(timers.size,0,'resposta pendente nao reabre timer');s.api=apiOriginal;
  assert(fs.readFileSync('tools/admin-local/web/index.html', 'utf8').includes('data-contador-aprovacao'));
  console.log('admin-demandas-contador: familias, promocao pendente, alertas DTO, menu real, falha e resposta antiga OK; zero POST/rede');
})().catch((e) => { console.error(e); process.exitCode = 1; });
