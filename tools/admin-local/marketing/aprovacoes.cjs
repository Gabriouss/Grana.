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
  const abs = path.join(raiz, rel);
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
  // Uma resposta perdida pode chegar depois da mudança de ID/pasta. Retome pela
  // prova da promoção; o módulo confere arquivos, aceite e versão novamente.
  const anterior = !deps.aprovar && ler(raiz).aprovacoes.find((a) => a.origem?.id === id && a.versao === corpo.versao);
  if (anterior) {
    const promovida = await (deps.promover || require('./promocao.cjs').promover)(raiz, id, corpo);
    return { aprovacao: anterior, jaExistia: true, pedidosFechados: 0, ...promovida };
  }
  const resultado = await (deps.aprovar || aprovar)(raiz, id, corpo);
  const avisos = [...(resultado.avisos || [])];
  let pedidosFechados = 0;
  const fila = deps.fila || require('./ajustes-fila.cjs').fila;
  const peca = (deps.obterPeca || obterPeca)(raiz, id);
  try {
    if (resultado.aprovacao?.id !== peca.id || resultado.aprovacao?.versao !== peca.versao) {
      throw new ErroMarketing('versao-mudou', 'A peça mudou depois do aceite.', 409);
    }
    for (const r of fila.listar().filter((x) => x.pecaId === id && x.estado === 'corrigido-aguardando-aceite')) {
      try {
        if (r.versaoCorrigida === peca.versao) await fila.aceitar(peca, r.id);
        else await fila.encerrarPorAceite(peca, r.id, resultado.aprovacao);
        pedidosFechados++;
      } catch (e) {
        console.error(`[painel] aprovar-fechar-pedido: ${e.codigo || 'falhou'}`);
        avisos.push('O aceite foi gravado, mas o pedido de ajuste desta peça não fechou. Atualize a tela.');
      }
    }
  } catch (e) {
    console.error(`[painel] aprovar-conferir-pedidos: ${e.codigo || 'falhou'}`);
    avisos.push('O aceite foi gravado, mas a fila de ajustes não pôde ser conferida. Atualize antes de tentar novamente.');
  }
  let promocao = null;
  // Reaceite em aprovados: a data marcada para a versão anterior passa para a versão aceita agora,
  // se ainda não passou. Falha não desfaz o aceite: vira aviso e log.
  if (peca.estado === 'aprovados' && !resultado.jaExistia) {
    try {
      const planejados = deps.planejados ? deps.planejados() : lerJson(caminhoPainel(raiz, 'calendario.json'), { planejados: [] }).planejados || [];
      const antigo = planejados.find((r) => r.id === peca.id && r.versao !== peca.versao && r.data >= require('./catalogo.cjs').hojeLocal());
      if (antigo) {
        await (deps.planejar || require('./calendario.cjs').planejar)(raiz, { id: peca.id, versao: peca.versao, data: antigo.data, hora: antigo.hora, canal: antigo.canal, observacao: antigo.observacao });
        avisos.push(`A data marcada (${antigo.data.split('-').reverse().join('/')}${antigo.hora ? ` ${antigo.hora}` : ''}) passou para esta versão.`);
      }
    } catch (e) {
      console.error(`[painel] aprovar-levar-plano: ${e.codigo || 'falhou'}`);
      avisos.push('O aceite foi gravado, mas a data marcada não passou para esta versão. Marque a data de novo no Calendário.');
    }
  }
  if (peca.estado === 'para-aprovacao') {
    try {
      const promovida = await (deps.promover || require('./promocao.cjs').promover)(raiz, id, { versao: corpo.versao, confirmacao: true });
      promocao = promovida.promocao;
      avisos.push(...(promovida.avisos || []));
    } catch (e) {
      console.error(`[painel] aprovar-promover: ${e.codigo || 'falhou'}`);
      const motivo = require('../config.cjs').ocultar(String(e.message || 'Falha ao mover a peça')).replace(/[.\s]+$/u, '');
      avisos.push(`O aceite foi gravado, mas a promoção não foi concluída: ${motivo}. Atualize e tente Aprovar novamente.`);
    }
  }
  return { ...resultado, pedidosFechados, promocao, avisos };
}

module.exports = { listarAprovacoes, aprovar, pedirAjuste, aprovarEFechar };
