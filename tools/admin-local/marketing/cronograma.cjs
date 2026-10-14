'use strict';
// Fonte editorial; não importa ambiente, provedor ou cliente Meta.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const c = require('./catalogo.cjs');
const { aceiteValido } = require('./aceite-evidencia.cjs');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANAIS = ['instagram-feed', 'stories', 'reels', 'anuncio'];
const TOKEN = /^([a-z0-9]+(?:-[a-z0-9]+)*)#([a-z0-9]+(?:-[a-z0-9]+)*)@([1-9]\d*)$/;
function erro(codigo, mensagem) { throw new c.ErroMarketing(codigo, mensagem, 409); }
function validar(m) {
  if (!m || m.formato !== 1 || typeof m.manifestoId !== 'string' || !SLUG.test(m.manifestoId) || !Number.isSafeInteger(m.versao) || m.versao < 1 || m.fuso !== 'America/Sao_Paulo' || (m.diaD !== null && !c.dataValida(m.diaD)) || !Array.isArray(m.itens) || !Array.isArray(m.removidos)) erro('cronograma-invalido', 'Confira o formato do cronograma.');
  const ids = new Set();
  if (m.datasComAviso !== undefined && (!Array.isArray(m.datasComAviso) || m.datasComAviso.some((d) => !d || !c.dataValida(d.data) || typeof d.motivo !== 'string' || !d.motivo.trim() || d.motivo.length > 200))) erro('cronograma-invalido', 'Confira a lista de datas com aviso.');
  for (const id of m.removidos) { if (typeof id !== 'string' || !SLUG.test(id) || ids.has(id)) erro('cronograma-invalido', 'IDs removidos precisam ser únicos.'); ids.add(id); }
  for (const item of m.itens) {
    if (!item || typeof item.id !== 'string' || !SLUG.test(item.id) || ids.has(item.id)) erro('cronograma-invalido', 'IDs do cronograma precisam ser únicos e não aposentados.');
    ids.add(item.id);
    const d = item.dataPrevista;
    if (!d || (d.hora !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) || (d.canal !== undefined && !CANAIS.includes(d.canal))) erro('cronograma-invalido', 'Confira hora e canal da previsão.');
    const campos = d.modo === 'absoluta' ? ['modo', 'data', 'hora', 'canal'] : ['modo', 'diasUteis', 'hora', 'canal'];
    const obrigatorios = d.modo === 'absoluta' ? campos : ['modo', 'diasUteis'];
    if (Object.keys(d).some((k) => !campos.includes(k)) || obrigatorios.some((k) => !(k in d)) ||
      (d.modo === 'absoluta' ? !c.dataValida(d.data) : d.modo !== 'diaD' || !Number.isSafeInteger(d.diasUteis) || d.diasUteis < 0 || d.diasUteis > 3650)) erro('cronograma-invalido', 'Use uma previsão absoluta ou relativa válida.');
  }
  return m;
}
function ler(raiz) {
  const arq = c.caminhoSeguro(raiz, 'docs/marketing/painel/cronograma.json');
  return fs.existsSync(arq) ? validar(c.lerJson(arq, null)) : null;
}
function chave(r) { return JSON.stringify([r.manifestoId, r.itemId, r.versaoPeca]); }
function celulas(linha) { return linha.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((v) => v.trim()); }
const INICIO = '<!-- grana-cronograma-vinculos:v1:inicio -->';
const FIM = '<!-- grana-cronograma-vinculos:v1:fim -->';
function estruturaInvalida() { erro('linha-cronograma-ausente', 'O índice tem uma estrutura ambígua ou inválida. Confira a tabela e os marcadores antes de repetir.'); }
function destinoLocal(href) {
  // Decodificar uma vez, nunca interpretar separadores/traversal codificados como caminho.
  if (/%(?:2f|5c)/i.test(href)) estruturaInvalida();
  let alvo;
  try { alvo = decodeURIComponent(href).replace(/^\.\//, ''); } catch { estruturaInvalida(); }
  const partes = alvo.replace(/\/$/, '').split('/');
  if (partes.some((s) => !s || s === '.' || s === '..') || /[\\:\u0000-\u001f\u007f]/.test(alvo)) estruturaInvalida();
  return alvo;
}
function spans(linha) {
  const pipes = [...linha.matchAll(/(?<!\\)\|/g)].map((m) => m.index);
  if (pipes.length < 2 || pipes[0] !== 0 || linha.slice(pipes.at(-1) + 1).trim()) estruturaInvalida();
  return pipes.slice(0, -1).map((de, i) => ({ de: de + 1, ate: pipes[i + 1], valor: linha.slice(de + 1, pipes[i + 1]).trim() }));
}
// Caminho localiza a linha da peça; o token, nunca o caminho, resolve o item editorial.
function linhasDaPeca(raiz, p) {
  const base = p.caminho.split('/').slice(0, 4).join('/');
  for (const a of p.arquivos) c.caminhoSeguro(raiz, path.posix.dirname(p.caminho) + '/' + a.nome);
  const indice = c.caminhoSeguro(raiz, base + '/INDICE.md');
  const existe = fs.existsSync(indice);
  if (existe && !fs.lstatSync(indice).isFile()) estruturaInvalida();
  const bytes = existe ? fs.readFileSync(indice) : Buffer.alloc(0);
  const texto = bytes.toString('utf8');
  if (!Buffer.from(texto, 'utf8').equals(bytes)) estruturaInvalida();
  const linhas = [], achados = [], marcadores = [];
  let offset = 0, fence = null;
  for (const m of texto.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)) {
    if (!m[0]) continue;
    const l = { texto: m[1], eol: m[2], offset, exemplo: !!fence };
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l.texto);
    if (f) {
      l.exemplo = true;
      if (!fence) fence = { tipo: f[1][0], tamanho: f[1].length };
      else if (f[1][0] === fence.tipo && f[1].length >= fence.tamanho && !f[2].trim()) fence = null;
    }
    if (!l.exemplo && [INICIO, FIM].includes(l.texto)) marcadores.push({ i: linhas.length, tipo: l.texto });
    linhas.push(l); offset += m[0].length;
  }
  if (fence) estruturaInvalida();
  let bloco = null;
  if (marcadores.length) {
    if (marcadores.length !== 2 || marcadores[0].tipo !== INICIO || marcadores[1].tipo !== FIM) estruturaInvalida();
    const conteudo = [];
    for (let i = marcadores[0].i + 1; i < marcadores[1].i; i++) if (linhas[i].texto.trim()) conteudo.push(i);
    if (conteudo.length < 2 || linhas[conteudo[0]].texto !== '| Peça | Cronograma ID |' || linhas[conteudo[1]].texto !== '| --- | --- |') estruturaInvalida();
    for (const i of conteudo.slice(2)) {
      if (linhas[i].exemplo) estruturaInvalida();
      const cells = spans(linhas[i].texto);
      if (cells.length !== 2 || !/^\[[^\]]+\]\([^)]+\)$/.test(cells[0].valor) || (cells[1].valor && !TOKEN.test(cells[1].valor.replace(/^`|`$/g, '')))) estruturaInvalida();
      destinoLocal(/\]\(([^)]+)\)/.exec(cells[0].valor)[1]);
    }
    bloco = { fim: marcadores[1].i, header: conteudo[0] };
  }
  let coluna = -1, tamanho = 0, separador = false, identicaSemMarca = false;
  const alvoPeca = p.caminho.slice(base.length + 1);
  const alvoGrupo = p.tipo === 'carrossel' ? path.posix.dirname(alvoPeca) + '/' : null;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (bloco && i > bloco.header && i < bloco.fim && !l.texto.trim()) continue;
    if (l.exemplo || !l.texto.startsWith('|')) {
      if (coluna >= 0 && !separador) estruturaInvalida();
      coluna = -1; continue;
    }
    const cells = spans(l.texto).map((s) => s.valor);
    if (cells.includes('Cronograma ID')) {
      if (coluna >= 0) estruturaInvalida();
      if (cells.filter((s) => s === 'Cronograma ID').length !== 1) estruturaInvalida();
      coluna = cells.indexOf('Cronograma ID'); tamanho = cells.length; separador = false;
      if (cells.length === 2 && cells[0] === 'Peça' && coluna === 1 && bloco?.header !== i) identicaSemMarca = true;
      continue;
    }
    if (coluna < 0) continue;
    if (!separador) {
      if (cells.length !== tamanho || !cells.every((s) => /^:?-{3,}:?$/.test(s))) estruturaInvalida();
      separador = true; continue;
    }
    if (cells.length !== tamanho) estruturaInvalida();
    const alvos = [...l.texto.matchAll(/\]\(([^)]+)\)/g)].map((v) => destinoLocal(v[1]));
    if (alvos.some((a) => a === alvoPeca || (alvoGrupo && (a === alvoGrupo || a === alvoGrupo.slice(0, -1))))) achados.push({ i, cells, coluna });
  }
  if (coluna >= 0 && !separador) estruturaInvalida();
  return { indice, linhas, achados, texto, bytes, existe, bloco, identicaSemMarca, eol: linhas.find((l) => l.eol)?.eol || '\n' };
}
function vinculo(raiz, p) {
  const { achados } = linhasDaPeca(raiz, p);
  if (!achados.length) return null;
  if (achados.length !== 1) return { invalido: true };
  const valores = [...new Set(achados.map((a) => a.cells[a.coluna] || '').filter(Boolean))];
  if (!valores.length) return null;
  if (valores.length !== 1) return { invalido: true };
  const m = TOKEN.exec(valores[0].replace(/^`|`$/g, ''));
  return m ? { manifestoId: m[1], itemId: m[2], manifestoVersao: Number(m[3]) } : { invalido: true };
}
function gravarIndice(raiz, p, info, texto) {
  const tmp = info.indice + '.' + crypto.randomUUID() + '.tmp';
  let proprio = false;
  try {
    const fd = fs.openSync(tmp, 'wx', 0o600);
    proprio = true;
    try { fs.writeFileSync(fd, texto, 'utf8'); }
    finally { fs.closeSync(fd); }
    c.caminhoSeguro(raiz, p.caminho.split('/').slice(0, 4).join('/') + '/INDICE.md');
    if (!info.existe) fs.linkSync(tmp, info.indice); // EEXIST nunca sobrescreve o concorrente.
    else {
      if (!fs.readFileSync(info.indice).equals(info.bytes)) erro('cronograma-conflito', 'O índice mudou. Confira os vínculos antes de repetir.');
      fs.renameSync(tmp, info.indice);
    }
  } finally {
    try { if (proprio && fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    catch { console.error(JSON.stringify({ codigo: 'cronograma-indice-limpeza-pendente' })); }
  }
}
// Registro da peça recém-criada ou associação explícita de legado, nunca por código/nome.
function registrarVinculo(raiz, id, corpo = {}) {
  return c.serializar(raiz, () => {
    const m = ler(raiz), p = c.obterPeca(raiz, id);
    c.exigirVigente(p, 'O vínculo com o cronograma');
    if (!m || corpo.versaoEsperada !== m.versao) erro('cronograma-conflito', 'O cronograma mudou. Recarregue.');
    if (corpo.versao !== p.versao || corpo.manifestoId !== m.manifestoId || !m.itens.some((i) => i.id === corpo.itemId)) erro('vinculo-invalido', 'Confira a peça, a versão e o item do cronograma.');
    for (const outra of c.montarCatalogo(raiz)) {
      const v = vinculo(raiz, outra);
      if (outra.id !== p.id && outra.estado !== 'historico' && v?.manifestoId === m.manifestoId && v.itemId === corpo.itemId) erro('vinculo-duplicado', 'Outra peça ativa já usa este item do cronograma.');
    }
    const info = linhasDaPeca(raiz, p);
    if (info.achados.length > 1) estruturaInvalida();
    const a = info.achados[0], token = `${m.manifestoId}#${corpo.itemId}@${m.versao}`;
    let texto;
    if (a) {
      const existente = a.cells[a.coluna].replace(/^`|`$/g, '');
      if (existente && existente !== token) erro('vinculo-existente', 'O vínculo existente precisa ser conferido antes de mudar.');
      if (existente === token) return { cronograma: vinculo(raiz, p), avisos: ['Vínculo já registrado. Nada foi gravado, publicado ou agendado na Meta.'] };
      const l = info.linhas[a.i], s = spans(l.texto)[a.coluna];
      const original = l.texto.slice(s.de, s.ate);
      const celula = original + token;
      texto = info.texto.slice(0, l.offset + s.de) + celula + info.texto.slice(l.offset + s.ate);
    } else {
      const alvo = p.caminho.slice(p.caminho.split('/').slice(0, 4).join('/').length + 1);
      const link = c.linkDoIndice(p.tipo === 'carrossel' ? path.posix.dirname(alvo) + '/' : alvo);
      const linha = `| [Peça](${link}) | ${token} |${info.eol}`;
      if (info.bloco) {
        const pos = info.linhas[info.bloco.fim].offset;
        texto = info.texto.slice(0, pos) + linha + info.texto.slice(pos);
      } else {
        if (info.identicaSemMarca) estruturaInvalida();
        const prefixo = info.texto && !/[\r\n]$/.test(info.texto) ? info.eol : '';
        texto = info.texto + prefixo + info.eol + [INICIO, '| Peça | Cronograma ID |', '| --- | --- |'].join(info.eol) + info.eol + linha + FIM + info.eol;
      }
    }
    gravarIndice(raiz, p, info, texto);
    const avisos = ['Vínculo salvo localmente. Nada foi publicado ou agendado na Meta.'];
    sincronizarComAviso(raiz, avisos, 'Vínculo salvo');
    return { cronograma: vinculo(raiz, p), avisos };
  });
}
function salvarManifesto(raiz, corpo = {}) {
  return c.serializar(raiz, () => {
    const atual = ler(raiz), nova = validar(structuredClone(corpo.manifesto));
    if (corpo.versaoEsperada !== (atual?.versao || 0) || nova.versao !== (atual?.versao || 0) + 1 || (atual && nova.manifestoId !== atual.manifestoId)) erro('cronograma-conflito', 'O cronograma mudou. Recarregue antes de salvar.');
    if (atual) {
      for (const id of [...atual.removidos, ...atual.itens.filter((i) => !nova.itens.some((n) => n.id === i.id)).map((i) => i.id)]) {
        if (!nova.removidos.includes(id)) erro('id-aposentado', 'Preserve os IDs retirados na lista de removidos.');
      }
    }
    const antes = atual?.diaD || null;
    if (nova.diaD !== antes && corpo.confirmacao !== true) erro('confirmacao-dia-d', 'Declare ou altere o dia D somente por confirmação explícita do autor.');
    nova.recibos = [...(atual?.recibos || [])];
    if (nova.diaD !== antes) nova.recibos.push({ acao: 'dia-d', antes, depois: nova.diaD, em: c.agoraLocalIso() });
    c.gravarJsonAtomico(c.caminhoSeguro(raiz, 'docs/marketing/painel/cronograma.json'), nova);
    const avisos = ['Cronograma salvo localmente. A integração real da Meta continua desligada.'];
    sincronizarComAviso(raiz, avisos, 'Cronograma salvo');
    return { manifesto: nova, avisos };
  });
}
function projetar(raiz, operacional = {}, pecas = c.montarCatalogo(raiz)) {
  const m = ler(raiz);
  if (!m) return { ...operacional, planejados: operacional.planejados || [], avisosCronograma: [] };
  const aceites = c.lerJson(c.caminhoPainel(raiz, 'aprovacoes.json'), { aprovacoes: [] }).aprovacoes || [];
  // Revisão superada (e a capa de um Reel superado) não projeta plano, mesmo com aceite antigo.
  const superadas = new Set(pecas.filter((p) => p.revisao?.superada).map((p) => p.id));
  const ativos = pecas.filter((p) => (p.estado !== 'historico' || p.revisao?.vigente) && !superadas.has(p.id) && !superadas.has(p.capaDe) && !p.revisao?.pendencia);
  const ligadas = ativos.map((p) => ({ p, v: vinculo(raiz, p) }));
  const planos = [], avisos = [], antigos = operacional.planejados || [];
  for (const { p, v } of ligadas) {
    if (!aceites.some((a) => aceiteValido(a, p))) continue;
    if (!v) continue;
    let estado = null;
    const item = m.itens.find((i) => i.id === v.itemId);
    if (v.invalido || v.manifestoId !== m.manifestoId || !item) estado = m.removidos.includes(v.itemId) ? 'sem data no cronograma' : 'vínculo inválido';
    else if (ligadas.filter((a) => a.v?.manifestoId === v.manifestoId && a.v?.itemId === v.itemId).length !== 1) estado = 'vínculo duplicado';
    const origem = { ...v, manifestoVersao: m.versao };
    const base = { ...origem, versaoPeca: p.versao, id: p.id, caminho: p.caminho, versao: p.versao };
    const anterior = antigos.find((r) => r.manifestoId && chave(r) === chave(base));
    const legado = antigos.find((r) => !r.manifestoId && r.id === p.id && r.versao === p.versao);
    const substituicaoManual = anterior?.substituicaoManual || (legado ? { data: legado.data, hora: legado.hora, canal: legado.canal, observacao: legado.observacao || null } : null);
    const d = item?.dataPrevista;
    const data = estado ? null : d.modo === 'absoluta' ? d.data : m.diaD ? require('./calendario.cjs').somarDiasUteis(m.diaD, d.diasUteis) : null;
    if (!estado && !data) estado = 'aguardando dia D';
    const dataPrevista = d ? { ...d, dataResolvida: data } : null;
    const efetivo = estado && estado !== 'aguardando dia D' ? { data: null, hora: d?.hora || null, canal: d?.canal || null } : substituicaoManual || { data, hora: d?.hora || null, canal: d?.canal || null };
    if (efetivo.data && estado === 'aguardando dia D') estado = null;
    planos.push({ ...base, ...efetivo, dataPrevista, substituicaoManual, registroLegado: anterior?.registroLegado || legado || null, recibos: anterior?.recibos || legado?.recibos || [], estado: estado || 'planejado', origem });
    if (estado) avisos.push(`${p.id}: ${estado}.`);
    if (efetivo.data && efetivo.data < c.hojeLocal()) avisos.push(`${p.id}: data prevista no passado; nada será publicado automaticamente.`);
    for (const d of m.datasComAviso || []) if (efetivo.data === d.data) avisos.push(`${p.id}: ${d.motivo}. O cálculo não exclui feriados.`);
    if (d && (!efetivo.hora || !efetivo.canal)) avisos.push(`${p.id}: ${!efetivo.hora ? 'horário pendente' : ''}${!efetivo.hora && !efetivo.canal ? '; ' : ''}${!efetivo.canal ? 'canal pendente' : ''}; envio Meta bloqueado.`);
  }
  // Preserva registros sem vínculo e versões antigas para recibo/recuperação, sem reenviá-los.
  for (const antigo of antigos) {
    if (planos.some((r) => antigo.manifestoId ? chave(r) === chave(antigo) : r.id === antigo.id && r.versao === antigo.versao)) continue;
    planos.push({ ...antigo, ...(antigo.manifestoId ? { estado: 'desatualizado' } : { legado: true }) });
    if (!antigo.manifestoId) avisos.push(`${antigo.id}: vínculo de cronograma pendente; data manual preservada.`);
  }
  const referenciaFunilLegado = operacional.referenciaFunilLegado || operacional.referenciaFunil || [];
  if (referenciaFunilLegado.length) avisos.push('Referência do funil preservada como legado; IDs, horas e canais precisam de migração explícita.');
  if (m.diaD && m.diaD < c.hojeLocal()) avisos.push('Dia D anterior a hoje; nenhuma publicação será antecipada automaticamente.');
  return { ...operacional, diaD: m.diaD, planejados: planos, referenciaFunil: [], referenciaFunilLegado, manifestoVersao: m.versao, avisosCronograma: avisos };
}
// Folha síncrona: chamadores já detêm a fila; não serializar novamente.
function sincronizar(raiz) {
  if (!ler(raiz)) return null;
  const arq = c.caminhoPainel(raiz, 'calendario.json'), atual = c.lerJson(arq, { formato: 1, planejados: [] });
  const nova = projetar(raiz, atual);
  // Recibo é efeito de escrita durável, nunca inferido pelo GET ou pelo navegador.
  for (const plano of nova.planejados) {
    if (!plano.manifestoId || !['planejado', 'aguardando dia D'].includes(plano.estado)) continue;
    if (!plano.recibos.some((r) => r.tipo === 'entrada-automatica')) plano.recibos.push({
      id: crypto.randomUUID(), tipo: 'entrada-automatica', em: c.agoraLocalIso(), estado: plano.estado,
    });
    const anterior = atual.planejados?.find((r) => r.manifestoId && chave(r) === chave(plano));
    if (plano.estado === 'planejado' && plano.data && (!anterior || anterior.data !== plano.data || anterior.hora !== plano.hora || anterior.canal !== plano.canal)) plano.recibos.push({
      tipo: 'data-marcada', em: c.agoraLocalIso(), data: plano.data, hora: plano.hora, canal: plano.canal,
    });
  }
  const base = atual.versaoOperacional || 0;
  const relida = c.lerJson(arq, { versaoOperacional: 0 });
  if ((relida.versaoOperacional || 0) !== base) erro('calendario-conflito', 'O calendário mudou; tente novamente.');
  nova.versaoOperacional = base + 1; c.gravarJsonAtomico(arq, nova);
  return nova;
}
function projetarSeguro(raiz, operacional, pecas) {
  try { return projetar(raiz, operacional, pecas); }
  catch {
    console.error(JSON.stringify({ codigo: 'cronograma-previsoes-suspensas' }));
    return { ...operacional, diaD: null, previsoesSuspensas: true,
      planejados: (operacional.planejados || []).map((r) => ({ ...r, estado: 'cronograma inválido' })),
      avisosCronograma: ['Cronograma inválido ou indisponível; previsões suspensas. Datas manuais e recibos foram preservados; confira o manifesto.'] };
  }
}
function sincronizarComAviso(raiz, avisos, operacao) {
  try { return module.exports.sincronizar(raiz); }
  catch {
    console.error(JSON.stringify({ codigo: 'cronograma-calendario-pendente' }));
    avisos.push(`${operacao}; calendário pendente. Confira o cronograma e recarregue para reconciliar sem repetir a operação.`);
    return null;
  }
}
module.exports = { validar, ler, vinculo, registrarVinculo, salvarManifesto, projetar, projetarSeguro, sincronizar, sincronizarComAviso, chave };
