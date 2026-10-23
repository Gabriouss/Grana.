'use strict';
// Preservação de revisão aprovada. Chamado sob a mesma trava da promoção.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const c = require('./catalogo.cjs');
const chave = p => p.replace(/\/(para-aprovacao|aprovados|historico)\//, '/*/');
const hash = (io, p) => crypto.createHash('sha1').update(io.readFileSync(p)).digest('hex');
const erro = codigo => new c.ErroMarketing(codigo, 'Confira a revisão aprovada antes de substituí-la. Os originais foram preservados.', 409);
function alvo(raiz, p) {
  const destino = p.caminho.replace('/para-aprovacao/', '/aprovados/');
  return c.montarCatalogo(raiz).find(x => x.caminho === destino && x.estado === 'aprovados') || null;
}
function revisaoAceita(antiga, aceites) {
  const valido = aceites.find(a => require('./aceite-evidencia.cjs').aceiteValido(a, antiga, Date.now(), aceites));
  if (valido) return antiga;
  // A legenda da semana pode já descrever a revisão nova. Reconstruir somente do
  // manifesto aceito e dos mesmos bytes ainda presentes, nunca por nome de arquivo.
  for (const a of aceites.filter(a => a.id === antiga.id && a.manifesto).reverse()) {
    const m = a.manifesto;
    if (m.midias?.length !== antiga.arquivos.length || !m.midias.every((v, i) => v.ordem === i && v.sha1 === antiga.arquivos[i].sha1)
      || (m.capa?.sha1 || null) !== (antiga.capa?.sha1 || null)) continue;
    const p = { ...antiga, legenda: m.legenda, versao: m.versao };
    const calculada = p.capa ? c.versaoComposta(p.arquivos.map(v => v.sha1), p.capa.sha1, p.legenda) : c.versaoDeArquivos(p.arquivos.map(v => v.sha1), p.legenda);
    if (calculada === m.versao && require('./aceite-evidencia.cjs').aceiteValido(a, p, Date.now(), aceites)) return p;
  }
  return null;
}
async function suspender(raiz, p) {
  if (c.lerJson(c.caminhoPainel(raiz, 'substituicoes-promocao.json'), {}).substituicoes?.some(r => r.origemId === p.id && r.versaoNova === p.versao)) return;
  let antiga = alvo(raiz, p);
  if (!antiga) return;
  const aceites = c.lerJson(c.caminhoPainel(raiz, 'aprovacoes.json'), {}).aprovacoes || [];
  if (aceites.some(a => a.origem?.id === p.id && a.versao === p.versao)) return; // Retomada da própria cópia, não revisão do destino.
  if (!aceites.some(a => require('./aceite-evidencia.cjs').aceiteValido(a, p, Date.now(), aceites))) return;
  antiga = revisaoAceita(antiga, aceites);
  if (!antiga) return;
  const ed = require('./editorial-publicacao.cjs');
  // A revisão anterior pode ter jobs remotos. Sem recibo, nada é arquivado.
  await ed.iniciarRevisao(raiz, antiga);
}
function substituir(raiz, p, io = fs) {
  const arq = c.caminhoPainel(raiz, 'substituicoes-promocao.json');
  const db = c.lerJson(arq, { formato: 1, substituicoes: [] });
  let r = db.substituicoes.find(x => x.origemId === p.id && x.versaoNova === p.versao);
  if (!r) {
    let antiga = alvo(raiz, p);
    if (!antiga) return [];
    const aceites = c.lerJson(c.caminhoPainel(raiz, 'aprovacoes.json'), {}).aprovacoes || [];
    antiga = revisaoAceita(antiga, aceites);
    if (!antiga) throw erro('destino-existente');
    const base = antiga.caminho.split('/').slice(0, 4).join('/');
    const pasta = `${base}/historico/pecas/revisoes/${antiga.id}-${antiga.versao}`;
    const caminhoHistorico = `${pasta}/${path.posix.basename(antiga.caminho)}`;
    const arquivos = antiga.arquivos.map(a => ({ origem: path.posix.join(path.posix.dirname(antiga.caminho), a.nome), destino: `${pasta}/${a.nome}`, sha1: a.sha1 }));
    if (antiga.capa) {
      const capa = c.montarCatalogo(raiz).find(x => x.id === antiga.capa.pecaId);
      if (!capa || capa.arquivos[0].sha1 !== antiga.capa.sha1) throw erro('capa-divergente');
      arquivos.push({ origem: capa.caminho, destino: `${pasta}/${capa.arquivos[0].nome}`, sha1: antiga.capa.sha1, componente: true });
    }
    r = { origemId: p.id, versaoNova: p.versao, id: antiga.id, versao: antiga.versao,
      caminhoAnterior: antiga.caminho, caminhoHistorico, arquivos, legenda: antiga.legenda,
      estado: 'preservando', em: c.agoraLocalIso() };
    db.substituicoes.push(r); c.gravarJsonAtomico(arq, db);
  }
  for (const a of r.arquivos) {
    const de = c.caminhoSeguro(raiz, a.origem, io), para = c.caminhoSeguro(raiz, a.destino, io);
    if (!io.existsSync(para)) {
      if (!io.existsSync(de) || hash(io, de) !== a.sha1) throw erro('substituicao-origem-divergente');
      io.mkdirSync(path.dirname(para), { recursive: true });
      // Cópia exclusiva, verificada antes de liberar o nome aprovado.
      const tmp = para + '.' + crypto.randomUUID() + '.tmp';
      try {
        io.copyFileSync(de, tmp, fs.constants.COPYFILE_EXCL);
        if (hash(io, tmp) !== a.sha1) throw erro('substituicao-copia-divergente');
        io.linkSync(tmp, para);
      } finally { if (io.existsSync(tmp)) io.unlinkSync(tmp); }
    }
    if (hash(io, para) !== a.sha1) throw erro('substituicao-historico-divergente');
  }
  // O manifesto conserva legenda e ordem mesmo quando a copy da semana mudar.
  c.gravarJsonAtomico(path.join(raiz, path.posix.dirname(r.caminhoHistorico), '.revisao.json'), r);
  const familiasArq = c.caminhoPainel(raiz, 'familias.json');
  const familias = c.lerJson(familiasArq, { formato: 1, familias: [], capas: [] });
  let familia = familias.familias.find(f => f.revisoes.some(x => chave(x.caminho) === chave(r.caminhoAnterior)));
  if (!familia) { familia = { id: 'revisao-' + r.id, nome: 'Revisões da peça', revisoes: [], vigente: p.caminho }; familias.familias.push(familia); }
  familia.revisoes = familia.revisoes.filter(x => chave(x.caminho) !== chave(r.caminhoAnterior) && x.caminho !== r.caminhoHistorico);
  familia.revisoes.push({ caminho: r.caminhoHistorico }, { caminho: p.caminho });
  familia.vigente = p.caminho; familia.pendencia = null;
  const capaPreservada = r.arquivos.find(a => a.componente);
  if (capaPreservada && !familias.capas.some(v => v.capa === capaPreservada.destino)) familias.capas.push({ capa: capaPreservada.destino, reel: r.caminhoHistorico });
  c.gravarJsonAtomico(familiasArq, familias);
  const publicadosArq = c.caminhoPainel(raiz, 'publicados.json');
  const publicados = c.lerJson(publicadosArq, null);
  if (publicados) {
    for (const v of publicados.vinculos || []) if (v.peca === r.caminhoAnterior) v.peca = r.caminhoHistorico;
    c.gravarJsonAtomico(publicadosArq, publicados);
  }
  const ids = require('./identidade-publicacao.cjs');
  const antiga = { id: r.id, caminho: r.caminhoAnterior, versao: r.versao, legenda: r.legenda,
    capa: capaPreservada ? { pecaId: c.idDe(capaPreservada.origem), sha1: capaPreservada.sha1 } : null };
  ids.vincularNaTransacao(raiz, antiga, [p.id]);
  ids.vincularNaTransacao(raiz, { ...antiga, id: c.idDe(r.caminhoHistorico), caminho: r.caminhoHistorico,
    capa: capaPreservada ? { pecaId: c.idDe(capaPreservada.destino), sha1: capaPreservada.sha1 } : null }, [r.id, p.id]);
  // Arquivo principal antigo só sai após bytes e vínculos duráveis. Capa compartilhada fica no lugar;
  // capa exclusiva que ocupa o destino da nova composição também precisa liberar o nome com prova.
  if (r.estado !== 'preservada') {
    const pecas = c.montarCatalogo(raiz), capaNova = p.capa && pecas.find(x => x.id === p.capa.pecaId);
    const removerCapa = capaPreservada && capaNova && capaPreservada.origem === capaNova.caminho.replace('/para-aprovacao/', '/aprovados/');
    if (removerCapa && pecas.some(x => x.id !== r.id && x.id !== p.id && x.capa?.pecaId === c.idDe(capaPreservada.origem))) throw erro('capa-compartilhada');
    for (const a of r.arquivos.filter(x => !x.componente || removerCapa)) {
      const de = c.caminhoSeguro(raiz, a.origem, io);
      if (io.existsSync(de)) { if (hash(io, de) !== a.sha1) throw erro('substituicao-origem-divergente'); io.unlinkSync(de); }
    }
    r.estado = 'preservada'; c.gravarJsonAtomico(arq, db);
  }
  return [r];
}
module.exports = { suspender, substituir };
