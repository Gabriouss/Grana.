'use strict';
// O ID fisico do catalogo e um alias. Mover a peca nao cria outro conteudo.
const crypto = require('node:crypto');
const c = require('./catalogo.cjs');
const ID = /^[a-f0-9]{16}$/;
const VERSAO = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const arquivo = raiz => c.caminhoPainel(raiz, 'identidades-publicacao.json');
const erro = codigo => new c.ErroMarketing(codigo, 'Confira os vinculos e a revisao editorial antes de continuar.', 409);
function ler(raiz) {
  const db = c.lerJson(arquivo(raiz), { formato: 1, conteudos: [] });
  if (db.formato !== 1 || !Array.isArray(db.conteudos)) throw erro('identidades-invalidas');
  const aliases = new Set(), ids = new Set();
  for (const r of db.conteudos) {
    if (!UUID.test(r.conteudoId) || ids.has(r.conteudoId) || !Array.isArray(r.aliases)
      || !Number.isSafeInteger(r.geracaoEditorial) || r.geracaoEditorial < 0) throw erro('identidades-invalidas');
    ids.add(r.conteudoId);
    for (const a of r.aliases) {
      if (!ID.test(a.pecaId) || !VERSAO.test(a.versao) || aliases.has(a.pecaId)) throw erro('identidade-ambigua');
      aliases.add(a.pecaId);
    }
  }
  return db;
}
function buscar(raiz, pecaId) { return ler(raiz).conteudos.find(r => r.aliases.some(a => a.pecaId === pecaId)) || null; }
function manifesto(p) {
  return { versao: p.versao, legenda: String(p.legenda || ''),
    midias: (p.arquivos || []).map((m, ordem) => ({ ordem, tipo: m.tipo, sha1: m.sha1 })),
    capa: p.capa ? { sha1: p.capa.sha1 } : null };
}
// Usado pelos movimentos que JA possuem a trava de escrita do catalogo.
function vincularNaTransacao(raiz, peca, aliases = [], remoto = null) {
  if (!ID.test(peca?.id) || !VERSAO.test(peca?.versao) || !Array.isArray(aliases)
    || aliases.some(a => !ID.test(a))) throw erro('identidade-invalida');
  if (peca.capaDe || peca.capaOrfa) throw erro('componente-nao-publicavel');
  const db = ler(raiz), todos = [...new Set([peca.id, ...aliases, ...(peca.capa?.pecaId ? [peca.capa.pecaId] : [])])];
  if (todos.some(id => !ID.test(id))) throw erro('identidade-invalida');
  const encontrados = db.conteudos.filter(r => r.aliases.some(a => todos.includes(a.pecaId)));
  if (encontrados.length > 1) throw erro('identidade-ambigua');
  let r = encontrados[0];
  if (remoto && (!UUID.test(remoto.conteudoId) || !Number.isSafeInteger(remoto.geracaoEditorial)
    || remoto.geracaoEditorial < 1)) throw erro('editorial-contrato-invalido');
  if (r && remoto && r.conteudoId !== remoto.conteudoId) throw erro('identidade-ambigua');
  if (!r) {
    const conteudoId = remoto?.conteudoId || crypto.randomUUID();
    if (db.conteudos.some(x => x.conteudoId === conteudoId)) throw erro('identidade-ambigua');
    r = { conteudoId, aliases: [], geracaoEditorial: 0, remoto: false,
      estadoEditorial: 'rascunho', pendentes: {}, recibos: [] };
    db.conteudos.push(r);
  }
  for (const id of todos) {
    const a = r.aliases.find(x => x.pecaId === id);
    if (!a) r.aliases.push({ pecaId: id, versao: peca.versao });
    else if (id === peca.id || id === peca.capa?.pecaId) a.versao = peca.versao;
  }
  if (r.aliases.length > 100) throw erro('identidades-invalidas');
  if (remoto) {
    if (remoto.geracaoEditorial < r.geracaoEditorial) throw erro('geracao-editorial-divergente');
    Object.assign(r, { remoto: true, geracaoEditorial: remoto.geracaoEditorial,
      estadoEditorial: remoto.estadoEditorial, versaoAtual: remoto.versaoAtual });
  }
  c.gravarJsonAtomico(arquivo(raiz), db);
  return structuredClone(r);
}
function garantir(raiz, peca, aliases = [], remoto = null) {
  return c.serializar(raiz, () => vincularNaTransacao(raiz, peca, aliases, remoto));
}
function alterar(raiz, conteudoId, fn) {
  return c.serializar(raiz, () => {
    const db = ler(raiz), r = db.conteudos.find(x => x.conteudoId === conteudoId);
    if (!r) throw erro('identidade-inexistente');
    fn(r); c.gravarJsonAtomico(arquivo(raiz), db); return structuredClone(r);
  });
}
// A chave e o corpo inteiros sobrevivem a resposta perdida, reinicio e retry.
async function reservar(raiz, r, operacao, peca, extra = {}) {
  const corpo = { operacao, conteudoId: r.conteudoId, geracaoEsperada: r.geracaoEditorial,
    pecaId: peca.id, versao: peca.versao, aliases: r.aliases.map(a => a.pecaId).sort(), ...extra };
  const chave = crypto.createHash('sha256').update(JSON.stringify(corpo)).digest('hex');
  const atual = await alterar(raiz, r.conteudoId, x => {
    if (x.geracaoEditorial !== r.geracaoEditorial) throw erro('geracao-editorial-divergente');
    x.pendentes ||= {};
    x.pendentes[chave] ||= { ...corpo, idempotencia: crypto.randomUUID() };
  });
  return { chave, pedido: atual.pendentes[chave] };
}
module.exports = { ler, buscar, manifesto, garantir, alterar, reservar, vincularNaTransacao, ID, VERSAO, UUID };
