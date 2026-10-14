'use strict';
// Validador único de aceite do autor: catálogo, calendário, cronograma, promoção e ensaio
// usam este mesmo predicado, para não haver dois contratos de evidência (W-C1, 14/10).
const { dataValida, versaoDeArquivos } = require('./catalogo.cjs');
// Lista fechada: parecer de agente/revisor não é aceite do autor (regra 25).
const EVIDENCIA_PAINEL = 'aceite pelo autor no painel local';
const EVIDENCIA_DERIVADA = 'composto derivado de aceites separados';
const EVIDENCIAS_AUTOR = Object.freeze([EVIDENCIA_PAINEL]);
// Derivação de aceite composto (vídeo + capa) a partir de aceites separados já datados.
// Lista fechada no código, não no JSON: só estas duas, autorizadas pelo Orquestrador Supremo em
// 14/10/2026 para os Reels que já estavam em aprovados. Reel novo exige aceite composto explícito.
// Editar aprovacoes.json não cria derivação nova; a cadeia ainda é conferida byte a byte.
const DERIVACOES_AUTORIZADAS = Object.freeze([
  Object.freeze({ id: 'a73f19a82efb0f87', versao: 'c3f392ddc38abb04b0dca30d95490338db99e80a' }), // motion base
  Object.freeze({ id: 'a4d997e49dfa98fa', versao: 'd2291cb48d01c6943cb7d758c70a661c0119149e' }), // notificacao-1
]);
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const dataPassada = (iso, agora) => typeof iso === 'string' && RE_ISO.test(iso) && dataValida(iso.slice(0, 10))
  && Number.isFinite(Date.parse(iso)) && Date.parse(iso) <= agora;

// A derivação só vale se: é uma das autorizadas; o Reel ainda é a mesma composição (vídeo,
// capa e peça da capa); a capa citada tem aceite de painel válido, dessa versão, com a
// mesma data; e a versão da capa citada é a dos bytes que estão selados no Reel.
function derivacaoValida(a, p, agora, aceites) {
  if (!DERIVACOES_AUTORIZADAS.some((d) => d.id === a.id && d.versao === a.versao)) return false;
  const c = p.composicao, d = a.derivadoDe;
  if (!c || !d || !d.video || !d.capa || !Array.isArray(aceites)) return false;
  if (JSON.stringify(a.composicao) !== JSON.stringify(c)) return false;
  if (d.video.caminho !== p.caminho || c.video.length !== 1 || d.video.sha1 !== c.video[0]) return false;
  if (d.capa.id !== c.capaPecaId || d.capa.versao !== versaoDeArquivos([c.capa], null)) return false;
  return aceites.some((x) => x && x.id === d.capa.id && x.versao === d.capa.versao && x.caminho === d.capa.caminho
    && x.evidencia === EVIDENCIA_PAINEL && x.aprovadoEm === d.capa.aprovadoEm && dataPassada(x.aprovadoEm, agora));
}

function aceiteValido(a, p, agora = Date.now(), aceites = null) {
  if (!a || !p || a.id !== p.id || a.versao !== p.versao || a.caminho !== p.caminho || !dataPassada(a.aprovadoEm, agora)) return false;
  if (EVIDENCIAS_AUTOR.includes(a.evidencia)) return true;
  return a.evidencia === EVIDENCIA_DERIVADA && derivacaoValida(a, p, agora, aceites);
}
module.exports = { EVIDENCIAS_AUTOR, EVIDENCIA_DERIVADA, DERIVACOES_AUTORIZADAS, aceiteValido };
