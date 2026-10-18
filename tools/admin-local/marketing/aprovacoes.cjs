'use strict';
// Aceite do autor e pedido de ajuste pelo painel local (dono: Flare).
//
// Regra 25: aprovado exige evidência datada do aceite para AQUELA versão.
// O registro vai para docs/marketing/painel/aprovacoes.json e uma linha de
// evidência é acrescentada ao INDICE.md da semana da peça. Nenhum arquivo é
// movido de pasta: a peça continua em para-aprovacao e passa a contar como
// aprovada porque a versão dela tem aceite registrado.
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
function aprovar(raiz, id, corpo = {}) {
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
    if (peca.estado === 'aprovados' && (peca.aprovada || !peca.composicao)) {
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

module.exports = { listarAprovacoes, aprovar, pedirAjuste };
