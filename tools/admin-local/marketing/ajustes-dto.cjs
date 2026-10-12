'use strict';
// Recibo para o navegador. Lease.id autoriza operacoes do agente: nunca sai aqui.
const ESTADOS = new Set(['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito', 'falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao', 'encerrado', 'recusado-pelo-autor']);
const MOTIVOS = new Set(['terminal-inacessivel', 'agente-fechado', 'caixa-ocupada', 'entrega-incerta', 'entrega-falhou']);
const AGENTES = new Set(['Beacon', 'Flare', 'Harbor', 'Forge']);
const formato = (v, re) => typeof v === 'string' && re.test(v) ? v : null;
const uuid = (v) => formato(v, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const hash = (v) => formato(v, /^[0-9a-f]{40}$/);
const data = (v) => formato(v, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/) && Number.isFinite(Date.parse(v)) ? v : null;
const texto = (v) => typeof v === 'string' && v.trim() && [...v.trim()].length <= 500 ? v.trim() : null;
const numero = (v, positivo = false) => Number.isFinite(v) && (positivo ? v > 0 : v >= 0) ? v : null;
function custoPublico(c) {
  if (!c || typeof c !== 'object') return null;
  return { ferramenta: texto(c.ferramenta), creditos: numero(c.creditos), valorReais: numero(c.valorReais), cotacao: numero(c.cotacao, true), motivoNaoLocal: texto(c.motivoNaoLocal) };
}
const TIPOS_EVENTO = Object.freeze({ 'pedido-recebido': 'pedido', 'importado-do-painel-web': 'pedido',
  entregue: 'entrega', 'corrigido-aguardando-aceite': 'correcao', 'aguardando-aprovacao-de-custo': 'custo',
  'custo-autorizado': 'custo-autorizado', 'custo-recusado': 'custo-recusado', 'custo-consumido': 'custo', 'autor-aceitou': 'aceite' });
function eventosPublicos(eventos, ids) {
  const permitidos = new Set(Array.isArray(ids) ? ids : [ids]);
  return (Array.isArray(eventos) ? eventos : []).filter((e) => e && permitidos.has(e.pedidoId) && Object.hasOwn(TIPOS_EVENTO, e.codigo) && data(e.em)).map((e) => {
    const r = { tipo: TIPOS_EVENTO[e.codigo], em: data(e.em), estado: ESTADOS.has(e.estado) ? e.estado : null };
    if (r.tipo === 'custo') {
      const c = custoPublico(e.estimativa);
      if (c) r.custo = { ferramenta: c.ferramenta, creditos: c.creditos, valorReais: c.valorReais, cotacao: c.cotacao };
    }
    return r;
  }).sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
}
function alertasPublicos(p, vigia, agora = Date.now()) {
  const alertas = [];
  const idade = agora - Date.parse(data(p?.criadoEm));
  if (p?.estado === 'novo' && idade > 10 * 60_000 && vigia?.ativo === false) alertas.push({
    codigo: 'entrega-parada', idadeMs: idade, motivo: 'Pedido aguardando com o vigia inativo.', proximoPasso: 'Verifique o vigia para retomar a entrega do pedido.' });
  const restante = Date.parse(data(p?.lease?.expiraEm)) - agora;
  if (p?.estado === 'em-correcao' && Number.isFinite(restante) && restante <= 5 * 60_000) alertas.push({
    codigo: restante <= 0 ? 'lease-vencido' : 'lease-vencendo', restanteMs: Math.max(0, restante),
    motivo: restante <= 0 ? 'A reserva da correção venceu.' : 'A reserva da correção está perto de vencer.',
    proximoPasso: 'Confira o vigia para manter o pedido em andamento.' });
  return alertas;
}
function trilhaPublica(p, pedidos, eventos, aprovacoes, planejados) {
  const origens = new Set([p.id]);
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const a of aprovacoes) if (origens.has(a.id) && a.origem?.id && !origens.has(a.origem.id)) { origens.add(a.origem.id); mudou = true; }
  }
  const pedidosDaPeca = pedidos.filter((r) => origens.has(r.pecaId));
  const lista = eventosPublicos(eventos, pedidosDaPeca.map((r) => r.id));
  // Filas antigas podem ter pedido sem evento; só reconstruir a data do recibo existente.
  for (const r of pedidosDaPeca) if (data(r.criadoEm) && !lista.some((e) => e.tipo === 'pedido' && e.em === r.criadoEm)) lista.push({ tipo: 'pedido', em: data(r.criadoEm) });
  for (const a of aprovacoes.filter((a) => origens.has(a.id))) {
    if (a.evidencia === 'aceite pelo autor no painel local' && data(a.aprovadoEm)) lista.push({ tipo: 'aceite', em: data(a.aprovadoEm) });
    if (data(a.promovidoEm)) lista.push({ tipo: 'promocao', em: data(a.promovidoEm) });
  }
  for (const r of planejados.filter((r) => origens.has(r.id))) {
    const datas = [r.planejadoEm, ...(r.recibos || []).filter((v) => v.tipo === 'entrada-automatica' || v.acao === 'substituicao-manual').map((v) => v.em)];
    for (const em of datas) if (data(em)) lista.push({ tipo: 'data', em: data(em), data: formato(r.data, /^\d{4}-\d{2}-\d{2}$/), hora: formato(r.hora, /^([01]\d|2[0-3]):[0-5]\d$/), canal: ['instagram-feed', 'stories', 'reels', 'anuncio'].includes(r.canal) ? r.canal : null });
  }
  const vistos = new Set();
  return lista.sort((a, b) => Date.parse(a.em) - Date.parse(b.em)).filter((e) => { const k = JSON.stringify([e.tipo, e.em, e.custo || null, e.data || null]); if (vistos.has(k)) return false; vistos.add(k); return true; });
}
function pedidoPublico(p, pecaAtual, contexto = {}) {
  if (!p || typeof p !== 'object') return null;
  return {
    id: uuid(p.id), pai: uuid(p.pai), pecaId: formato(p.pecaId, /^[0-9a-f]{16}$/),
    estado: ESTADOS.has(p.estado) ? p.estado : 'precisa-de-atencao',
    motivo: p.estado === 'falha-de-envio' && MOTIVOS.has(p.motivoFalha) ? p.motivoFalha : null,
    tentativas: Number.isInteger(p.tentativas) && p.tentativas >= 0 && p.tentativas <= 10 ? p.tentativas : null,
    criadoEm: data(p.criadoEm), atualizadoEm: data(p.atualizadoEm),
    versaoAlvo: hash(p.versaoAlvo), versaoCorrigida: hash(p.versaoCorrigida), commit: hash(p.commit),
    versaoAtual: pecaAtual?.id === p.pecaId ? hash(pecaAtual.versao) : null,
    custo: custoPublico(p.custo),
    lease: p.lease ? { agente: AGENTES.has(p.lease.agente) ? p.lease.agente : 'outro', inicio: data(p.lease.inicio), expiraEm: data(p.lease.expiraEm) } : null,
    aceite: p.aceite ? { versao: hash(p.aceite.versao), em: data(p.aceite.em) } : null,
    eventos: eventosPublicos(contexto.eventos, p.id),
    alertas: alertasPublicos(p, contexto.vigia, contexto.agora),
  };
}
module.exports = { pedidoPublico, eventosPublicos, alertasPublicos, trilhaPublica };
