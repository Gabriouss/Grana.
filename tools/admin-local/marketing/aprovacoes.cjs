'use strict';
// Aceite do autor e pedido de ajuste pelo painel local (dono: Flare).
//
// Regra 25: aprovado exige evidência datada do aceite para AQUELA versão.
// O registro vai para docs/marketing/painel/aprovacoes.json e uma linha de
// evidência é acrescentada ao INDICE.md da semana da peça. Nenhum arquivo é
// movido por aprovar isoladamente: aprovarEFechar conclui a ação promovendo
// a versão aceita para aprovados, depois de fechar as correções entregues.
//
// Aceitar projeta a previsão do cronograma no calendário. Nunca publica na Meta.

const fs = require('fs');
const path = require('path');
const {
  ErroMarketing,
  agoraLocalIso,
  caminhoPainel,
  lerJson,
  gravarJsonAtomico,
  serializar,
  textoCurto,
  obterPeca,
  exigirVigente,
} = require('./catalogo.cjs');

const ARQUIVO = 'aprovacoes.json';
const EVIDENCIA = 'aceite pelo autor no painel local';
const TITULO_SECAO_INDICE = '## Aceites registrados no painel local';
// Mesmo conjunto que o catálogo mostra como "Ajuste pedido".
const AJUSTE_ABERTO = new Set(['novo', 'em-correcao', 'falha-de-envio', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao']);

function vazio() {
  return {
    formato: 1,
    descricao: 'Aceites do autor e pedidos de ajuste registrados pelo painel local. Cada aceite vale só para a versão (sha1 dos arquivos e da legenda) indicada.',
    aprovacoes: [],
    ajustes: [],
  };
}

function ler(raiz) {
  const dados = lerJson(caminhoPainel(raiz, ARQUIVO), vazio());
  if (!Array.isArray(dados.aprovacoes)) dados.aprovacoes = [];
  if (!Array.isArray(dados.ajustes)) dados.ajustes = [];
  return dados;
}

// GET (auxiliar): registros como estão no arquivo.
function listarAprovacoes(raiz) {
  return ler(raiz);
}

function conferirVersao(peca, versao) {
  if (typeof versao !== 'string' || !/^[0-9a-f]{40}$/.test(versao)) {
    throw new ErroMarketing('versao-invalida', 'Informe a versão da peça que está na tela.', 400);
  }
  if (versao !== peca.versao) {
    throw new ErroMarketing('versao-mudou', 'A peça mudou depois que a tela foi aberta. Recarregue e revise a versão atual antes de decidir.', 409);
  }
}

function pastaDaSemana(peca) {
  const partes = peca.caminho.split('/');
  // docs/marketing/AAAA-MM/semana-.../<estado>/...
  return partes.slice(0, 4).join('/');
}

function dataHoraLegivel(iso) {
  // 2026-10-07T10:15:00-03:00 -> 07/10/2026 10:15 (-03:00)
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}([+-]\d{2}:\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]} (${m[6]})` : iso;
}

// Acrescenta a linha de evidência no fim do INDICE.md, numa seção própria.
// Só acrescenta; nunca reescreve linha existente.
function anotarNoIndice(raiz, peca, registro) {
  const rel = `${pastaDaSemana(peca)}/INDICE.md`;
  const abs = require('./catalogo.cjs').pastaPainel.fisico(raiz, rel);
  const atual = fs.readFileSync(abs, 'utf8');
  const relNaSemana = peca.caminho.slice(pastaDaSemana(peca).length + 1);
  const linha = `- ${dataHoraLegivel(registro.aprovadoEm)}: ${EVIDENCIA}. Peça \`${relNaSemana}\`, versão \`${registro.versao.slice(0, 12)}\`. Registro em \`docs/marketing/painel/aprovacoes.json\`. Publicação pede passo próprio.`;
  let novo = atual.replace(/\s*$/, '\n');
  if (!novo.includes(TITULO_SECAO_INDICE)) {
    novo += `\n${TITULO_SECAO_INDICE}\n\nCada linha registra o aceite explícito do autor dado no painel local, para a versão indicada. Versão diferente precisa de novo aceite.\n\n`;
  }
  novo += linha + '\n';
  const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, novo, 'utf8');
  fs.renameSync(tmp, abs);
  return rel;
}

// POST /api/marketing/pecas/:id/aprovar  { versao, confirmacao: true }
async function aprovar(raiz, id, corpo = {}) {
  const resultado = await aprovarLocal(raiz, id, corpo);
  const editorial = require('./editorial-publicacao.cjs');
  if (editorial.ativo(raiz, { id })) await editorial.registrarAceite(raiz, obterPeca(raiz, id));
  return resultado;
}
function aprovarLocal(raiz, id, corpo = {}) {
  return serializar(raiz, () => {
    if (corpo.confirmacao !== true) {
      throw new ErroMarketing('confirmacao-invalida', 'Confirme o aceite desta versão.', 400);
    }
    const peca = obterPeca(raiz, id);
    conferirVersao(peca, corpo.versao);
    exigirVigente(peca, 'O aceite');
    require('./legenda-publicacao.cjs').exigirLegenda(peca);
    // Pedido de ajuste aberto sobre a peça, em QUALQUER versão: aprovar agora seria aceitar o que
    // o autor mandou corrigir. A versão não serve de filtro (legenda ou checkout mudam o hash sem
    // que ninguém tenha corrigido nada). Pedido já corrigido, aguardando aceite, não bloqueia.
    let pedidos;
    try {
      pedidos = require('./ajustes-fila.cjs').fila.listar();
      if (!Array.isArray(pedidos)) throw new Error('fila-invalida');
    } catch {
      throw new ErroMarketing('fila-indisponivel', 'Não foi possível conferir a fila de ajustes. Nada foi aprovado; tente de novo.', 503);
    }
    if (peca.ajuste || pedidos.some((r) => r?.pecaId === peca.id && AJUSTE_ABERTO.has(r.estado))) {
      throw new ErroMarketing('ajuste-aberto', 'Há pedido de ajuste aberto para esta peça. Aprove a versão corrigida quando ela chegar.', 409);
    }
    // A prova local precisa conferir ANTES de persistir qualquer aceite, mesmo
    // quando o cliente antigo nao envia pedidoId no POST de aprovacao.
    for (const r of pedidos.filter(r => r?.pecaId === peca.id && r.estado === 'corrigido-aguardando-aceite'
      && r.versaoCorrigida === peca.versao && (r.provaCorrecao || r.snapshotAnterior))) {
      require('./ajustes-fila.cjs').fila.conferirAceite(peca,r.id);
    }
    if (peca.estado === 'historico' && (!peca.revisao?.vigente || peca.recusada)) {
      throw new ErroMarketing('peca-no-historico', 'Peça do histórico foi substituída ou rejeitada e não recebe aceite.', 409);
    }
    // Reel em aprovados ainda sem aceite composto pode recebê-lo; o resto da pasta já está aceito.
    // Exceção: versão nova já em aprovados (a legenda mudou a pedido do autor, 18/10) não tem aceite
    // datado próprio e não publica; recebe aqui o aceite explícito do autor, nunca por herança.
    if (peca.estado === 'aprovados' && (peca.aprovada || !peca.composicao)
      && !require('./snapshot-local.cjs').motivoSemAceite(raiz, peca)) {
      throw new ErroMarketing('ja-aprovada', 'Esta peça já está na pasta de aprovados.', 409);
    }
    const dados = ler(raiz);
    const existente = dados.aprovacoes.find((a) => a.id === peca.id && a.versao === peca.versao);
    if (existente) {
      const avisos = [];
      const calendario = require('./cronograma.cjs').sincronizarComAviso(raiz, avisos, 'Aceite preservado');
      return { aprovacao: existente, jaExistia: true, calendario, avisos };
    }

    const registro = {
      id: peca.id,
      caminho: peca.caminho,
      versao: peca.versao,
      aprovadoEm: agoraLocalIso(),
      evidencia: EVIDENCIA,
      escopo: peca.composicao ? 'vídeo, capa e legenda desta versão (aceite composto)' : peca.legenda ? 'arquivos e legenda desta versão' : 'arquivos desta versão',
      manifesto: require('./identidade-publicacao.cjs').manifesto(peca),
      ...(peca.composicao ? { composicao: peca.composicao } : {}),
      indice: null,
    };
    dados.aprovacoes.push(registro);
    gravarJsonAtomico(caminhoPainel(raiz, ARQUIVO), dados);

    const avisos = ['Aceite registrado. A previsão do cronograma entra no calendário quando houver vínculo; nada foi publicado ou agendado na Meta.'];
    try {
      registro.indice = anotarNoIndice(raiz, peca, registro);
      gravarJsonAtomico(caminhoPainel(raiz, ARQUIVO), dados);
    } catch {
      avisos.push('O aceite foi gravado em aprovacoes.json, mas a linha de evidência no INDICE.md da semana não pôde ser escrita. Registre à mão.');
    }
    avisos.push('Alteração local ainda não publicada no GitHub.');
    const calendario = require('./cronograma.cjs').sincronizarComAviso(raiz, avisos, 'Aceite preservado');
    return { aprovacao: registro, jaExistia: false, calendario, avisos };
  });
}

// POST /api/marketing/pecas/:id/ajuste  { versao, motivo }
async function pedirAjuste(raiz, id, corpo = {}) {
  const peca = obterPeca(raiz, id);
  conferirVersao(peca, corpo.versao);
  // Pedido de ajuste vale para a vigente e para família pendente; nunca para revisão superada.
  if (peca.estadoEfetivo === 'superada') exigirVigente(peca, 'O pedido de ajuste');
  const ajuste = await require('./ajustes-fila.cjs').fila.solicitar(peca, corpo);
  return { ajuste, avisos: ['Pedido recebido na fila privada. Ninguem pegou ainda; o vigia tenta entregar automaticamente. Nada foi aprovado, publicado ou agendado.'] };
}

// Aprovar é UMA ação (autor, 18/10): grava o aceite desta versão e fecha junto o pedido de ajuste
// entregue e promove para aprovados. Correção anterior é encerrada com recibo de
// substituição; só hash idêntico recebe aceite. Falhas preservam o aceite e deixam aviso e log.
async function aprovarEFechar(raiz, id, corpo = {}, deps = {}) {
  return require('./conclusao-aprovacao.cjs').executar(raiz, () => concluirAprovacao(raiz, id, corpo, deps));
}
async function concluirAprovacao(raiz, id, corpo = {}, deps = {}) {
  if (corpo.confirmacao !== true) throw new ErroMarketing('confirmacao-invalida', 'Confirme o aceite desta versão.', 400);
  const cat = require('./catalogo.cjs');
  const fluxo = require('./conclusao-aprovacao.cjs');
  let conclusao = fluxo.buscar(raiz, id, corpo.versao) || fluxo.nova(id, corpo.versao);
  const anterior = ler(raiz).aprovacoes.find(a => a.origem?.id === id && a.versao === corpo.versao);
  const peca = (deps.obterPeca || obterPeca)(raiz, anterior?.id || id);
  conferirVersao(peca, corpo.versao);
  exigirVigente(peca, 'O aceite');
  const avisos = [];
  let resultado = { aprovacao: null, jaExistia: true }, promocao = anterior || null, pedidosFechados = 0;
  const persistir = () => fluxo.salvar(raiz, conclusao);
  const falha = async (etapa, e) => {
    console.error(`[painel] aprovar-${etapa}: ${e.codigo || 'falhou'}`);
    conclusao.etapas[etapa] = { estado: 'pendente', codigo: e.codigo || 'falhou' };
    const prova = ler(raiz).aprovacoes.find(a => a.origem?.id === conclusao.id && a.versao === conclusao.versao);
    if (prova) conclusao.destinoId = prova.id; // Mesmo se a RPC posterior à cópia perdeu a resposta.
    await persistir();
    avisos.push('Aprovação incompleta. O aceite salvo foi preservado. Use Continuar para concluir a etapa pendente.');
    return { ...resultado, pedidosFechados, promocao, avisos, conclusao };
  };
  // Mesmo em uma retomada, conferir novamente o aceite da versão e o estado remoto.
  try {
    const db = ler(raiz);
    const existente = db.aprovacoes.find(a => require('./aceite-evidencia.cjs').aceiteValido(a, peca, Date.now(), db.aprovacoes));
    if (existente) {
      resultado = { aprovacao: existente, jaExistia: true };
      const editorial = require('./editorial-publicacao.cjs');
      if (editorial.ativo(raiz, peca)) await editorial.registrarAceite(raiz, peca);
    } else resultado = await (deps.aprovar || aprovar)(raiz, id, corpo);
    if (resultado.aprovacao?.versao !== peca.versao) throw new ErroMarketing('versao-mudou', 'A peça mudou depois do aceite.', 409);
    avisos.push(...(resultado.avisos || []));
    conclusao.etapas.aceite = { estado: 'concluido', aprovadoEm: resultado.aprovacao.aprovadoEm };
    await persistir();
  } catch (e) {
    // Falha antes de qualquer aceite continua sendo rejeição, não um recibo benigno.
    if (!ler(raiz).aprovacoes.some(a => a.versao === corpo.versao && (a.id === id || a.id === peca.id))) throw e;
    return falha('aceite', e);
  }
  try {
    const fila = deps.fila || require('./ajustes-fila.cjs').fila;
    const pedidos = fila.listar();
    if (!Array.isArray(pedidos)) throw new Error('fila-invalida');
    const ids = new Set([id, peca.id, conclusao.id]);
    for (const r of pedidos.filter(x => ids.has(x.pecaId) && x.estado === 'corrigido-aguardando-aceite')) {
      if (r.versaoCorrigida === peca.versao) await fila.aceitar(peca, r.id);
      else await fila.encerrarPorAceite(peca, r.id, resultado.aprovacao);
      pedidosFechados++;
    }
    if (fila.listar().some(r => ids.has(r.pecaId) && !require('./ajustes-fila.cjs').estadoTerminal(r.estado))) throw new ErroMarketing('ajuste-aberto', 'Confira o pedido antes de continuar.', 409);
    conclusao.etapas.ajuste = { estado: 'concluido' };
    await persistir();
  } catch (e) { return falha('ajuste', e); }
  try {
    if (peca.estado === 'para-aprovacao' || anterior) {
      const r = await (deps.promover || require('./promocao.cjs').promover)(raiz, id, corpo);
      promocao = r.promocao;
      if (!promocao || promocao.versao !== corpo.versao || !promocao.indice || (r.avisos || []).some(a => /origem a conferir|pendente/.test(a))) throw new ErroMarketing('promocao-pendente', 'Confira os arquivos e o recibo da promoção.', 409);
      conclusao.destinoId = promocao.id;
      // A substituição pode criar a identidade remota só durante a suspensão da revisão anterior.
      // Concluir inclui reconciliar o aceite já dado pelo autor, sem esperar um segundo clique.
      const editorial = require('./editorial-publicacao.cjs');
      if (editorial.ativo(raiz, { id: promocao.id })) await editorial.registrarAceite(raiz, cat.obterPeca(raiz, promocao.id));
      avisos.push(...(r.avisos || []));
    }
    conclusao.etapas.promocao = { estado: peca.estado === 'aprovados' && !anterior ? 'nao-necessario' : 'concluido' };
    await persistir();
  } catch (e) { return falha('promocao', e); }
  try {
    // Só a referência editorial é migrada; nenhuma confirmação/retomada remota é chamada.
    const planejados = deps.planejados ? deps.planejados() : lerJson(caminhoPainel(raiz, 'calendario.json'), { planejados: [] }).planejados || [];
    const aliases = new Set([id, peca.id, conclusao.destinoId, ...(promocao?.substituicoes || []).map(x => x.id)]);
    const antigo = planejados.find(r => aliases.has(r.id) && (r.id !== conclusao.destinoId || r.versao !== corpo.versao) && r.data >= cat.hojeLocal());
    if (antigo) {
      await (deps.planejar || require('./calendario.cjs').planejar)(raiz, { id: conclusao.destinoId, versao: corpo.versao, data: antigo.data, hora: antigo.hora, canal: antigo.canal, observacao: antigo.observacao });
      avisos.push(`A data marcada (${antigo.data.split('-').reverse().join('/')}${antigo.hora ? ` ${antigo.hora}` : ''}) passou para esta versão. Nada foi reautorizado na Meta.`);
    }
    const cr = require('./cronograma.cjs');
    await cat.serializar(raiz, () => cr.sincronizar(raiz));
    conclusao.etapas.plano = { estado: 'concluido' };
    await persistir();
  } catch (e) {
    avisos.push('O aceite foi gravado, mas a data marcada não passou para esta versão. Continue para reconciliar o Calendário.');
    return falha('plano', e);
  }
  return { ...resultado, pedidosFechados, promocao, avisos, conclusao };
}

module.exports = { listarAprovacoes, aprovar, pedirAjuste, aprovarEFechar };
