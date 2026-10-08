'use strict';
const { dataValida } = require('./catalogo.cjs');
// Lista fechada: parecer de agente/revisor não é aceite do autor (regra 25).
const EVIDENCIAS_AUTOR = Object.freeze(['aceite pelo autor no painel local']);
function aceiteValido(a, p, agora = Date.now()) {
  return !!a && a.id === p.id && a.versao === p.versao && a.caminho === p.caminho
    && EVIDENCIAS_AUTOR.includes(a.evidencia)
    && typeof a.aprovadoEm === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(a.aprovadoEm)
    && dataValida(a.aprovadoEm.slice(0, 10))
    && Number.isFinite(Date.parse(a.aprovadoEm)) && Date.parse(a.aprovadoEm) <= agora;
}
module.exports = { EVIDENCIAS_AUTOR, aceiteValido };
