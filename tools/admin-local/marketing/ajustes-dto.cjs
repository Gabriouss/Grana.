'use strict';
// Recibo para o navegador. Lease.id autoriza operacoes do agente: nunca sai aqui.
const ESTADOS = new Set(['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito', 'falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao']);
const MOTIVOS = new Set(['terminal-inacessivel', 'agente-fechado', 'caixa-ocupada', 'entrega-incerta', 'entrega-falhou']);
const AGENTES = new Set(['Beacon', 'Flare', 'Harbor', 'Forge']);
const formato = (v, re) => typeof v === 'string' && re.test(v) ? v : null;
const uuid = (v) => formato(v, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const hash = (v) => formato(v, /^[0-9a-f]{40}$/);
const data = (v) => formato(v, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/) && Number.isFinite(Date.parse(v)) ? v : null;
function pedidoPublico(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    id: uuid(p.id), pai: uuid(p.pai), pecaId: formato(p.pecaId, /^[0-9a-f]{16}$/),
    estado: ESTADOS.has(p.estado) ? p.estado : 'precisa-de-atencao',
    motivo: p.estado === 'falha-de-envio' && MOTIVOS.has(p.motivoFalha) ? p.motivoFalha : null,
    tentativas: Number.isInteger(p.tentativas) && p.tentativas >= 0 && p.tentativas <= 10 ? p.tentativas : null,
    criadoEm: data(p.criadoEm), atualizadoEm: data(p.atualizadoEm),
    versaoAlvo: hash(p.versaoAlvo), versaoCorrigida: hash(p.versaoCorrigida), commit: hash(p.commit),
    lease: p.lease ? { agente: AGENTES.has(p.lease.agente) ? p.lease.agente : 'outro', inicio: data(p.lease.inicio), expiraEm: data(p.lease.expiraEm) } : null,
    aceite: p.aceite ? { versao: hash(p.aceite.versao), em: data(p.aceite.em) } : null,
  };
}
module.exports = { pedidoPublico };
