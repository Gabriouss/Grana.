'use strict';
// Agentes recebem o recibo antes de editar, inclusive fora da fila de ajustes.
const c = require('./catalogo.cjs');
const ids = require('./identidade-publicacao.cjs');
const USO = 'Uso: editorial-cli.cjs iniciar-revisao|registrar-versao|registrar-aceite|sincronizar pecaId versao';
async function main(args, deps = {}) {
  const [acao, id, versao] = args;
  const metodos = { 'iniciar-revisao': 'iniciarRevisao', 'registrar-versao': 'registrarVersao',
    'registrar-aceite': 'registrarAceite', sincronizar: 'sincronizar' };
  if (args.length !== 3 || !Object.hasOwn(metodos, acao) || !ids.ID.test(id) || !ids.VERSAO.test(versao)) throw new Error(USO);
  const raiz = deps.raiz || require('../config.cjs').RAIZ_DADOS;
  const editorial = deps.editorial || require('./editorial-publicacao.cjs');
  const p = (deps.obterPeca || c.obterPeca)(raiz, id);
  if (p.versao !== versao) throw new c.ErroMarketing('versao-mudou', 'A peca mudou; confira a versao antes de editar.', 409);
  if (!editorial.ativo(raiz, p)) throw new c.ErroMarketing('editorial-rollout-pendente', 'A revisao remota ainda nao foi ativada. Nenhuma permissao de edicao foi emitida.', 409);
  const r = await editorial[metodos[acao]](raiz, p);
  return r ? { conteudoId: r.conteudoId, geracaoEditorial: r.geracaoEditorial,
    estadoEditorial: r.estadoEditorial, remoto: r.remoto,
    idempotencia: r.recibos?.at(-1)?.idempotencia || null }
    : { estadoEditorial: 'rascunho', remoto: false, idempotencia: null };
}
if (require.main === module) main(process.argv.slice(2)).then(r => console.log(JSON.stringify(r))).catch(e => {
  console.error(e.message === USO ? USO : e.codigo || 'editorial-cli-falhou'); process.exitCode = 1;
});
module.exports = { main };
