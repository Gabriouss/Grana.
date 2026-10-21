// Contrato e regras de domínio da E5 REAL. Não mistura a fila real com a simulação.
// A UI só chama mutações por ctx.acao, que usa CSRF e o step-up TOTP local do painel.

export const API_PUBLICACOES = '/api/marketing/publicacoes';
export const FUSO_PUBLICACAO = 'America/Sao_Paulo';
export const FORMATOS_PUBLICACAO = ['feed', 'carrossel', 'reels', 'stories'];

export const ROTULOS_ESTADO = {
  planejado: 'Planejado',
  'programado-no-painel': 'Agendado no painel',
  preparando: 'Preparando',
  'agendado-na-meta': 'Agendado na Meta',
  publicado: 'Publicado',
  'cancelamento-pendente': 'Cancelamento pendente',
  cancelado: 'Cancelado',
  falhou: 'Falhou',
  'precisa-conferir': 'Precisa conferir',
  'suspenso-para-revisao': 'Suspenso para revisão',
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HASH256 = /^[0-9a-f]{64}$/i;
export const SHA1 = /^[0-9a-f]{40}$/i;

const REDES = new Set(['instagram', 'facebook']);
const ESTADOS = new Set(Object.keys(ROTULOS_ESTADO));
const OPERACOES_RECIBO = new Set(['preparar', 'consultar-preparo', 'agendar', 'publicar', 'verificar-publicacao', 'cancelar', 'reconciliar']);
const ESTADOS_RECIBO = new Set(['iniciado', 'confirmado', 'falhou', 'incerto']);

export function erroContrato(codigo = 'contrato-invalido', mensagem = 'O servidor devolveu um contrato de publicação incompatível.') {
  return Object.assign(new Error(mensagem), { codigo, status: 0 });
}

export function dadosReais(resposta) {
  const d = resposta?.dados;
  if (resposta?.ok !== true || !d || d.contractVersion !== 'e5.real.v1' || d.modo !== 'real') {
    throw erroContrato('contrato-real-invalido', 'O servidor não confirmou o contrato de agendamento real. Nenhuma ação foi feita.');
  }
  return d;
}

export function dadosCatalogo(resposta) {
  const d = resposta?.dados;
  if (resposta?.ok !== true || !d || !Array.isArray(d.pecas)) throw erroContrato('catalogo-invalido', 'O catálogo não trouxe uma lista válida de peças aprovadas.');
  return d;
}

export function validarPeca(peca) {
  return !!peca
    && typeof peca.id === 'string' && /^[0-9a-f]{16}$/i.test(peca.id)
    && typeof peca.versao === 'string' && SHA1.test(peca.versao)
    && typeof peca.titulo === 'string' && peca.titulo.trim().length > 0
    && peca.aprovada === true
    && (!Array.isArray(peca.bloqueios) || peca.bloqueios.length === 0);
}

export function validarConta(conta) {
  if (!conta || typeof conta.contaId !== 'string' || !conta.contaId.trim()
    || !REDES.has(conta.rede) || typeof conta.rotulo !== 'string' || !conta.rotulo.trim()
    || !Number.isSafeInteger(conta.revisao) || conta.revisao < 1
    || !['verificada', 'revogada', 'expirada', 'nao-verificada', 'indisponivel'].includes(conta.conexao)
    || !Array.isArray(conta.capacidades)) return false;
  if (typeof conta.pausada !== 'boolean') return false;
  return conta.capacidades.every((c) => FORMATOS_PUBLICACAO.includes(c.formato)
    && ['disponivel', 'nao-suportado', 'nao-verificado', 'indisponivel'].includes(c.estado)
    && Number.isSafeInteger(c.revisao) && c.revisao > 0
    && Array.isArray(c.motivos));
}

export function capacidadeDaConta(conta, formato) {
  if (!validarConta(conta) || !FORMATOS_PUBLICACAO.includes(formato)) return { disponivel: false, motivos: ['capacidade-nao-comprovada'] };
  const capacidade = conta.capacidades.find((c) => c.formato === formato);
  if (conta.conexao !== 'verificada' || conta.pausada || !capacidade || capacidade.estado !== 'disponivel') {
    return {
      disponivel: false,
      motivos: [
        ...(conta.conexao !== 'verificada' ? [`conta-${conta.conexao}`] : []),
        ...(conta.pausada ? ['conta-pausada'] : []),
        ...(!capacidade ? ['formato-nao-verificado'] : capacidade.estado !== 'disponivel' ? capacidade.motivos.length ? capacidade.motivos : [capacidade.estado] : []),
      ],
    };
  }
  return { disponivel: true, capacidade, motivos: [] };
}

// O catálogo informa MIME de transporte: a captura converte PNG aprovado em JPEG.
// Capacidade da conta sozinha não comprova compatibilidade da peça selecionada.
export function capacidadeDaPeca(peca, rede, formato) {
  const midias = peca?.midias;
  if (!Array.isArray(midias) || !midias.length) return { disponivel: false, motivos: ['midia-nao-conferida'] };
  const imagem = m => m?.tipo === 'imagem' && ['image/jpeg', 'image/png'].includes(m.mime);
  const video = m => m?.tipo === 'video' && m.mime === 'video/mp4';
  const compativel = REDES.has(rede) && FORMATOS_PUBLICACAO.includes(formato)
    && midias.length <= 10 && midias.every(m => imagem(m) || video(m))
    && (formato === 'carrossel' ? midias.length >= 2 : midias.length === 1)
    && (formato !== 'feed' || imagem(midias[0]))
    && (formato !== 'reels' || video(midias[0]))
    && (rede !== 'facebook' || (formato !== 'stories' && (formato !== 'carrossel' || midias.every(imagem))))
    && (rede !== 'instagram' || (midias.every(m => !imagem(m) || m.mime === 'image/jpeg')
      && (formato !== 'reels' || !peca.capa || peca.capa.mime === 'image/jpeg')));
  return { disponivel: compativel, motivos: compativel ? [] : ['midia-incompativel'] };
}

function partesNoFuso(instantaneo, fuso = FUSO_PUBLICACAO) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instantaneo);
  return Object.fromEntries(partes.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

function chaveParede(partes) {
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

function offsetNoFuso(ms, fuso) {
  const p = partesNoFuso(new Date(ms), fuso);
  const parede = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return parede - Math.floor(ms / 60000) * 60000;
}

// datetime-local não carrega fuso. Converte apenas depois de provar que aquele instante
// existe uma única vez em America/Sao_Paulo; nunca usa o fuso do navegador.
export function horarioLocalParaUtc(valor, fuso = FUSO_PUBLICACAO) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(valor || ''));
  if (!m) throw erroContrato('horario-invalido', 'Informe data e hora no fuso America/Sao_Paulo.');
  const [, ys, ms, ds, hs, mins] = m;
  const [ano, mes, dia, hora, minuto] = [ys, ms, ds, hs, mins].map(Number);
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const normalizado = new Date(alvo);
  if (normalizado.getUTCFullYear() !== ano || normalizado.getUTCMonth() !== mes - 1
    || normalizado.getUTCDate() !== dia || normalizado.getUTCHours() !== hora || normalizado.getUTCMinutes() !== minuto) {
    throw erroContrato('horario-invalido', 'A data ou a hora informada não existe.');
  }
  const offsets = new Set([-36, -24, -12, 0, 12, 24, 36].map((h) => offsetNoFuso(alvo + h * 3600000, fuso)));
  const encontrados = [...offsets].map((offset) => alvo - offset)
    .filter((msUtc) => chaveParede(partesNoFuso(new Date(msUtc), fuso)) === valor);
  if (encontrados.length !== 1) {
    throw erroContrato('horario-invalido', encontrados.length
      ? 'A hora local é ambígua nesse fuso. Escolha outro horário.'
      : 'A hora local não existe nesse fuso. Escolha outro horário.');
  }
  return new Date(encontrados[0]).toISOString();
}

export function horarioUtcParaLocal(iso, fuso = FUSO_PUBLICACAO) {
  const data = new Date(iso);
  if (!Number.isFinite(data.getTime())) throw erroContrato('horario-invalido');
  return chaveParede(partesNoFuso(data, fuso));
}

export function rotuloDataHorario(iso, fuso = FUSO_PUBLICACAO) {
  const data = new Date(iso);
  if (!Number.isFinite(data.getTime())) return 'Horário indisponível';
  const local = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short', hourCycle: 'h23',
  }).format(data);
  return local;
}

export function validarDestino(destino, contas) {
  if (!destino || !REDES.has(destino.rede) || !FORMATOS_PUBLICACAO.includes(destino.formato)
    || typeof destino.contaId !== 'string' || !destino.contaId) return false;
  const conta = contas.find((c) => c.contaId === destino.contaId && c.rede === destino.rede);
  return !!conta && capacidadeDaConta(conta, destino.formato).disponivel;
}

export function previaConfirmavel(previa) {
  const expira = Date.parse(previa?.expiraEm || '');
  return !!previa && previa.contractVersion === 'e5.real.v1' && previa.modo === 'real'
    && previa.podeConfirmar === true && Number.isFinite(expira) && expira > Date.now()
    && previa.snapshot?.estado === 'pronto'
    && Array.isArray(previa.destinos) && previa.destinos.length > 0
    && previa.destinos.every((d) => d.estado === 'pronto' && Array.isArray(d.motivos) && d.motivos.length === 0);
}

export function validarJob(job) {
  return !!job && UUID.test(job.jobId || '') && UUID.test(job.loteId || '')
    && UUID.test(job.snapshotId || '') && Number.isSafeInteger(job.revisao) && job.revisao > 0
    && job.destino && typeof job.destino.contaId === 'string' && REDES.has(job.destino.rede)
    && FORMATOS_PUBLICACAO.includes(job.destino.formato) && ESTADOS.has(job.estado)
    && typeof job.atualizadoEm === 'string' && Number.isFinite(Date.parse(job.atualizadoEm))
    && Array.isArray(job.recibos) && job.recibos.every((r) => UUID.test(r.reciboId || '')
      && OPERACOES_RECIBO.has(r.operacao) && ESTADOS_RECIBO.has(r.estado));
}

export function resumirLote(jobs) {
  if (!Array.isArray(jobs) || !jobs.length || jobs.some((j) => !validarJob(j))) return { rotulo: 'Estado do lote indisponível', total: 0, parcial: false };
  const contagem = new Map();
  for (const j of jobs) { const estado = estadoApresentacaoJob(j); contagem.set(estado, (contagem.get(estado) || 0) + 1); }
  if (contagem.size === 1) return { rotulo: ROTULOS_ESTADO[estadoApresentacaoJob(jobs[0])], total: jobs.length, parcial: false, contagem };
  const resumo = [...contagem].map(([estado, n]) => `${n} ${ROTULOS_ESTADO[estado].toLowerCase()}`).join(' · ');
  return { rotulo: `Parcial · ${resumo}`, total: jobs.length, parcial: true, contagem };
}

function queryString(obj) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function caminhoMidia(previaId, indice) {
  if (!UUID.test(previaId || '') || !(indice === 'capa' || (Number.isInteger(indice) && indice >= 0 && indice < 50))) {
    throw erroContrato('referencia-midia-invalida');
  }
  return `${API_PUBLICACOES}/midia${queryString({ previaId, indice })}`;
}

export function criarClientePublicacoes(ctx) {
  async function get(path) {
    return ctx.api(path);
  }
  async function post(acao, campos = {}) {
    const resposta = await ctx.acao(API_PUBLICACOES, { acao, ...campos });
    return dadosReais(resposta);
  }
  return {
    async capacidades() {
      const d = dadosReais(await get(`${API_PUBLICACOES}/capacidades`));
      if (!Array.isArray(d.contas) || d.contas.some((c) => !validarConta(c)) || !d.controles
        || !Number.isSafeInteger(d.controles.revisao) || typeof d.controles.pausaGlobal !== 'boolean'
        || typeof d.controles.pausaFacebook !== 'boolean' || typeof d.controles.pausaInstagram !== 'boolean') {
        throw erroContrato('capacidades-invalidas');
      }
      return d;
    },
    async catalogo() {
      const d = dadosCatalogo(await get(`${API_PUBLICACOES}/catalogo`));
      return { ...d, pecas: d.pecas.filter(validarPeca) };
    },
    async prever({ peca, job, destinos, horarioLocal, contas }) {
      if (!(job ? validarJob(job) : validarPeca(peca)) || !Array.isArray(destinos) || destinos.length < 1 || destinos.length > 8) {
        throw erroContrato('pedido-invalido', 'Escolha uma peça aprovada e ao menos um destino válido.');
      }
      if (!Array.isArray(contas) || destinos.some((d) => !validarDestino(d, contas))) {
        throw erroContrato('destino-invalido', 'Uma conta ou capacidade deixou de estar verificada. Atualize os destinos antes de continuar.');
      }
      if (!job && peca.midias && destinos.some(d => !capacidadeDaPeca(peca, d.rede, d.formato).disponivel)) {
        throw erroContrato('midia-incompativel', 'A mídia desta peça não é compatível com um dos destinos selecionados. Escolha os destinos novamente.');
      }
      const chaves = destinos.map((d) => `${d?.contaId}|${d?.formato}`);
      if (new Set(chaves).size !== destinos.length || destinos.some((d) => !d
        || typeof d.contaId !== 'string' || !d.contaId || !REDES.has(d.rede)
        || !FORMATOS_PUBLICACAO.includes(d.formato))) {
        throw erroContrato('destino-invalido', 'Confira as contas e os formatos selecionados.');
      }
      if (job && (destinos.length !== 1 || !reagendamentoPermitido(job)
        || destinos.some((d) => ['contaId', 'rede', 'formato'].some((k) => d[k] !== job.destino[k])))) {
        throw erroContrato('estado-incompativel');
      }
      const publicarEm = horarioLocalParaUtc(horarioLocal);
      const pedido = {
        acao: 'prever', ...(job ? { jobId: job.jobId } : { pecaId: peca.id, versao: peca.versao }),
        destinos: destinos.map(({ contaId, rede, formato }) => ({ contaId, rede, formato })),
        agendarPara: publicarEm, fuso: FUSO_PUBLICACAO,
      };
      const { acao: _acao, ...campos } = pedido;
      const d = await post('prever', campos);
      if (!UUID.test(d.previaId || '') || !HASH256.test(d.previaHash || '')
        || !Number.isSafeInteger(d.revisao) || d.revisao < 1 || !Array.isArray(d.destinos)
        || !d.snapshot || !UUID.test(d.snapshot.snapshotId || '')
        || !['recebendo', 'verificando', 'pronto', 'recusado', 'revogado'].includes(d.snapshot.estado)
        || typeof d.podeConfirmar !== 'boolean' || d.destinos.length !== destinos.length
        || d.destinos.some((alvo) => !REDES.has(alvo.rede) || !FORMATOS_PUBLICACAO.includes(alvo.formato)
          || !['pronto', 'bloqueado'].includes(alvo.estado) || !Array.isArray(alvo.motivos))) throw erroContrato('previa-invalida');
      if (job && (d.snapshot.snapshotId !== job.snapshotId || d.destinos.some((d, i) =>
        ['contaId', 'rede', 'formato'].some((k) => d[k] !== destinos[i][k]) || d.publicarEm !== publicarEm))) throw erroContrato('previa-invalida');
      return d;
    },
    async confirmar(previa, idempotencia) {
      if (!previa || !UUID.test(previa.previaId || '') || !HASH256.test(previa.previaHash || '')
        || !Number.isSafeInteger(previa.revisao) || !UUID.test(idempotencia || '') || !previaConfirmavel(previa)) {
        throw erroContrato('confirmacao-bloqueada', 'A prévia não está pronta para confirmação.');
      }
      const d = await post('confirmar', { previaId: previa.previaId, previaHash: previa.previaHash,
        revisaoEsperada: previa.revisao, idempotencia, confirmacao: true });
      if (!UUID.test(d.loteId || '') || d.idempotencia !== idempotencia || typeof d.replay !== 'boolean'
        || !Array.isArray(d.jobs) || d.jobs.some((j) => !validarJob(j))) throw erroContrato('lote-invalido');
      return d;
    },
    async listar({ limite = 20, cursor, estado, rede, de, ate } = {}) {
      if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw erroContrato('pedido-invalido');
      const url = `${API_PUBLICACOES}${queryString({ limite, cursor, estado, rede, de, ate })}`;
      const d = dadosReais(await get(url));
      if (!Array.isArray(d.jobs) || d.jobs.some((j) => !validarJob(j))
        || (d.proximoCursor !== null && typeof d.proximoCursor !== 'string') || typeof d.limitado !== 'boolean') {
        throw erroContrato('lista-invalida');
      }
      return d;
    },
    async consultar({ jobId, loteId, idempotencia }) {
      const pares = [jobId, loteId, idempotencia].filter((x) => x !== undefined && x !== null && x !== '');
      if (pares.length !== 1 || pares.some((x) => !UUID.test(x))) throw erroContrato('pedido-invalido');
      const d = dadosReais(await get(`${API_PUBLICACOES}/detalhe${queryString({ jobId, loteId, idempotencia })}`));
      if (!Array.isArray(d.jobs) || d.jobs.some((j) => !validarJob(j))) throw erroContrato('detalhe-invalido');
      return d;
    },
    async comando(acao, campos) {
      const permitidas = new Set(['cancelar', 'reconciliar', 'pausar', 'retomar', 'reagendar']);
      if (!permitidas.has(acao)) throw erroContrato('acao-invalida');
      if (acao === 'reagendar' && (!UUID.test(campos?.previaId || '') || !HASH256.test(campos?.previaHash || '')
        || campos.confirmacao !== true || !UUID.test(campos.jobId || '') || !UUID.test(campos.idempotencia || '')
        || !Number.isSafeInteger(campos.revisaoEsperada) || campos.revisaoEsperada < 1)) throw erroContrato('confirmacao-bloqueada');
      const d = await post(acao, campos);
      if (acao === 'reagendar' && (!Array.isArray(d.jobs) || !d.jobs.length || d.jobs.some((j) => !validarJob(j)))) throw erroContrato('lote-invalido');
      return d;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// O que o autor lê (19/10): toda tela do fluxo diz o que acontece, por que não dá e o que fazer.

// Antecedência mínima para o executor preparar antes da hora. O executor dá um passo por job por
// minuto: um carrossel de 5 imagens no Instagram leva ~14 passos (plano 18/10, seção 2).
export const ANTECEDENCIA_MIN = { carrossel: 30, reels: 30, stories: 15, feed: 15 };
export function antecedenciaMinima(destinos = [], peca = null) {
  const porFormato = destinos.map((d) => ANTECEDENCIA_MIN[d?.formato] || 15);
  const porPeca = /carrossel|reel|video/i.test(String(peca?.tipo || '')) ? 30 : 15;
  return Math.max(porPeca, ...porFormato);
}

const DIA_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_PUBLICACAO, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const SO_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_PUBLICACAO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const SO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_PUBLICACAO, year: 'numeric', month: '2-digit', day: '2-digit' });
// "às 21:30" no mesmo dia; "em dom., 19/10, 21:30" em outro dia. desde: "a partir das 21:30".
export function quandoCurto(ms, agora = Date.now(), desde = false) {
  const d = new Date(ms);
  if (SO_DIA.format(d) === SO_DIA.format(new Date(agora))) return `${desde ? 'a partir das' : 'às'} ${SO_HORA.format(d)}`;
  return `${desde ? 'a partir de' : 'em'} ${DIA_HORA.format(d)}`;
}
const CINCO_MIN = 5 * 60000;
const arredondar = (ms) => Math.ceil(ms / CINCO_MIN) * CINCO_MIN;
export function sugestaoHorario(minutos, agora = Date.now()) {
  return horarioUtcParaLocal(new Date(arredondar(agora + minutos * 60000)).toISOString());
}
export function conferirHorario(utcIso, minutos, agora = Date.now()) {
  const ms = Date.parse(utcIso);
  const minimo = arredondar(agora + minutos * 60000);
  if (!Number.isFinite(ms)) return { ok: false, texto: 'Informe data e hora.' };
  if (ms <= agora) return { ok: false, texto: `Esse horário já passou. Marque ${quandoCurto(minimo, agora, true)}.` };
  if (ms < agora + minutos * 60000) {
    return { ok: false, texto: `Muito em cima da hora: o Grana. precisa de ${minutos} min para preparar a publicação. Para sair na hora, marque ${quandoCurto(minimo, agora, true)}.` };
  }
  return { ok: true, texto: `O Grana. começa a preparar ${quandoCurto(ms - minutos * 60000, agora)} e publica ${quandoCurto(ms, agora)}.` };
}

const FORMATO_ESTRANHO = 'O servidor respondeu num formato que o painel não reconhece. Nada foi confirmado. Recarregue a página (F5); se continuar, avise o suporte com o código abaixo.';
const SEM_RESPOSTA = 'A resposta não chegou. Não repita: use "Consultar resultado pendente" para saber se foi feito.';
const PREVIA_DE_NOVO = 'As imagens ou a legenda recebidas para conferência não batem com a peça aprovada. Nada foi confirmado. Gere outra prévia.';
const MENSAGENS = {
  'revisao-editorial': 'O conteúdo entrou em revisão e o aceite anterior foi suspenso. Revise e aprove a nova versão antes de agendar.',
  'identidade-editorial-pendente': 'O vínculo desta peça com a versão aprovada precisa ser conferido. Peça a revisão do vínculo antes de agendar.',
  'lease-vencida': 'O processamento perdeu o prazo de resposta. Atualize os recibos; só reagende se a conferência do servidor liberar.',
  'publicacao-sem-id-recuperavel': 'A rede não devolveu uma referência que permita conferir a publicação. Confira na rede e peça a revisão do recibo; não publique outra vez.',
  'executor-indisponivel': 'O serviço de publicação não respondeu. Atualize o estado e confira os recibos antes de escolher o próximo passo.',
  'atualizar-cliente': 'O servidor usa uma versão mais recente. Recarregue o painel antes de agendar.',
  'geracao-divergente': 'O conteúdo mudou em outra sessão. Atualize e revise a versão atual antes de agendar.',
  'revisao-editorial-pendente': 'Esta peça está em revisão. Aprove a nova versão antes de agendar.',
  'revisao-nao-iniciada': 'A revisão desta peça ainda não começou. Atualize e solicite a revisão antes de alterar.',
  'versao-divergente': 'A versão da peça mudou. Atualize a lista e gere outra prévia da versão aprovada.',
  'identidade-ambigua': 'Não foi possível vincular esta peça ao agendamento com segurança. Peça a conferência do vínculo antes de continuar.',
  'antecedencia-insuficiente': 'Não há tempo para preparar a publicação neste horário. Escolha um horário mais distante e gere outra prévia.',
  'suspenso-para-revisao': 'O conteúdo mudou e o agendamento foi suspenso. Revise e aprove a nova versão antes de agendar.',
  'operacao-pausada': 'A pausa está ligada. Clique em Retomar no topo desta janela e gere a prévia de novo.',
  'conta-pausada': 'Esta conta está pausada. Clique em Retomar no topo desta janela.',
  'previa-expirada': 'A prévia venceu (ela vale 10 minutos). Clique em "Gerar outra prévia".',
  'previa-inexistente': 'Essa prévia não existe mais no servidor. Clique em "Gerar outra prévia".',
  'revisao-divergente': 'Algo mudou desde que a janela abriu (conta, pausa ou prévia). Gere outra prévia.',
  'idempotencia-divergente': 'Este pedido já foi usado com outros dados. Recarregue a página antes de tentar de novo.',
  'snapshot-inexistente': 'As imagens preparadas para conferência não estão mais disponíveis. Gere outra prévia.',
  'snapshot-indisponivel': 'As imagens ainda estão sendo preparadas. Espere alguns segundos e gere outra prévia.',
  'snapshot-invalido': 'As imagens preparadas para conferência vieram incompletas. Gere outra prévia.',
  'midia-divergente': 'As imagens mudaram depois da conferência. Gere outra prévia.',
  'midia-invalida': 'Uma imagem ou vídeo não está num formato aceito. Peça o arquivo no formato certo e gere outra prévia.',
  'midia-incompativel': 'Uma imagem ou vídeo não está num formato aceito por esta rede. Peça o arquivo no formato certo e gere outra prévia.',
  'midia-grande': 'Uma imagem ou vídeo passou do tamanho aceito pela rede. Peça um arquivo menor.',
  'midia-inexistente': 'Uma imagem da peça não foi encontrada. Confira a peça na Aprovação.',
  'midia-indisponivel': 'O painel não conseguiu baixar as imagens para conferir. Gere outra prévia.',
  'conta-indisponivel': 'A conexão desta conta venceu ou foi revogada. Peça a revalidação da conta antes de agendar.',
  'conta-expirada': 'A conexão desta conta venceu. Peça a revalidação da conta antes de agendar.',
  'conta-revogada': 'A conexão desta conta foi revogada. Peça a revalidação da conta antes de agendar.',
  'conta-nao-verificada': 'A conexão desta conta ainda não foi verificada.',
  'capacidade-nao-comprovada': 'Este formato ainda não foi verificado para esta conta. Escolha outro formato.',
  'formato-nao-verificado': 'Este formato ainda não foi verificado para esta conta. Escolha outro formato.',
  'formato-nao-suportado': 'Este formato não está disponível nesta rede.',
  'sem-leitura-de-volta': 'A rede não deixa conferir o resultado deste formato automaticamente.',
  'horario-invalido': 'O horário não é válido. Escolha um horário no futuro.',
  'destino-duplicado': 'O mesmo destino foi marcado duas vezes. Desmarque um e gere outra prévia.',
  'destino-invalido': 'Uma conta ou formato deixou de estar disponível. Clique em "Atualizar estado real" e escolha de novo.',
  'operacao-bloqueada': 'A publicação real está desligada no servidor. Nada foi enviado; avise quem cuida do servidor.',
  'agendamento-ja-existe': 'Esta peça já tem agendamento neste destino. Confira no Calendário antes de criar outro.',
  'agendamento-inexistente': 'Esse agendamento não existe mais. Atualize o Calendário.',
  'lote-inexistente': 'Ainda não há registro desse pedido no servidor. Não repita: atualize em instantes.',
  'estado-incompativel': 'O agendamento mudou de estado e esta ação não vale mais. Atualize e confira.',
  'ja-publicado': 'Já foi publicado. Abra a publicação em vez de repetir.',
  'operacao-em-andamento': 'Outra ação está em andamento neste agendamento. Espere um minuto e atualize.',
  'pedido-invalido': 'O pedido saiu incompleto. Recarregue a página e tente de novo.',
  'confirmacao-invalida': 'Confirme a ação para continuar.',
  'confirmacao-bloqueada': 'A prévia não está pronta para confirmar. Gere outra prévia.',
  'nao-autorizado': 'O servidor não reconheceu este painel. Entre de novo.',
  'fonte-indisponivel': 'O servidor de publicação não respondeu. Tente de novo em instantes; nada foi confirmado.',
  'nao-configurado': 'A publicação real não está configurada no servidor. Nada foi enviado.',
  'modulo-remoto-pendente': 'A publicação real não está configurada neste painel. Nada foi enviado.',
  'sem-aceite': 'A peça precisa do seu aceite nesta versão. Aprove antes de agendar.',
  'aceite-nao-sincronizado': 'A peça precisa do seu aceite nesta versão. Clique em "Aprovar esta versão" no Calendário.',
  'nao-pareado': 'Este navegador não está pareado com o painel. Abra pelo atalho "Grana. Admin".',
  'cabecalho-ausente': 'O pedido saiu sem a identificação do painel. Recarregue a página (F5).',
  reautenticar: 'Confirme o código do autenticador para continuar.',
  cancelado: 'Ação cancelada: o código do autenticador não foi confirmado. Nada foi feito.',
  'nao-autenticado': 'Sua sessão acabou. Entre de novo.',
  'sessao-expirada': 'Sua sessão acabou. Entre de novo.',
  limite: 'Muitas ações seguidas. Espere um minuto e tente de novo.',
  'credencial-ausente': 'A chave de acesso desta conta não está no servidor. Nada foi publicado; avise quem cuida do servidor.',
  'meta-recusou': 'A Meta recusou o envio. Nada foi publicado neste destino; confira a conta e o formato antes de agendar de novo.',
  rede: SEM_RESPOSTA, prazo: SEM_RESPOSTA, 'prazo-esgotado': SEM_RESPOSTA, 'resultado-desconhecido': SEM_RESPOSTA,
};
for (const c of ['previa-invalida', 'contrato-invalido', 'contrato-real-invalido', 'contrato-incompativel', 'lote-invalido', 'lista-invalida',
  'detalhe-invalido', 'capacidades-invalidas', 'catalogo-invalido', 'resposta-invalida', 'referencia-midia-invalida', 'acao-invalida']) MENSAGENS[c] = FORMATO_ESTRANHO;
for (const c of ['legenda-divergente', 'hash-de-midia-divergente', 'hash-de-capa-divergente', 'mime-de-midia-divergente', 'mime-de-midia-invalido',
  'mime-de-capa-invalido', 'ordem-de-midia-invalida', 'snapshot-incompleto', 'verificacao-de-midia-indisponivel']) MENSAGENS[c] = PREVIA_DE_NOVO;

const CODIGO = /^[a-z0-9-]{1,64}$/;
// Frase com causa e ação; o código vai à parte, pequeno, para o suporte. Nunca devolve frase vazia.
export function mensagemHumana(err) {
  const codigo = CODIGO.test(err?.codigo || '') ? err.codigo : CODIGO.test(err?.message || '') ? err.message : '';
  const frase = MENSAGENS[codigo]
    || (typeof err?.message === 'string' && /\s/.test(err.message) && err.message.trim())
    || 'Não foi possível concluir. Nada foi confirmado; atualize e tente de novo.';
  return { frase, codigo: codigo || (err?.status ? `http-${err.status}` : 'sem-codigo') };
}
export function fraseDoMotivo(codigo) { return MENSAGENS[codigo] || null; }

const NOME_REDE = { instagram: 'Instagram', facebook: 'Facebook' };
const ATIVOS_REAIS = new Set(['planejado', 'programado-no-painel', 'preparando', 'agendado-na-meta', 'cancelamento-pendente']);
export function estadoApresentacaoJob(job) {
  return typeof job?.motivoSuspensao === 'string' && job.motivoSuspensao.trim()
    && !['publicado', 'cancelado', 'falhou'].includes(job.estado) ? 'suspenso-para-revisao' : job?.estado;
}
export const jobAtivo = (job) => ATIVOS_REAIS.has(estadoApresentacaoJob(job));
// A lista pode trazer somente os últimos recibos. Só o servidor pode autorizar a troca.
export function reagendamentoPermitido(job) {
  return job?.reagendamento?.permitido === true
    && Array.isArray(job.reagendamento.motivos) && job.reagendamento.motivos.length === 0
    && !job.motivoSuspensao
    && ['programado-no-painel', 'precisa-conferir', 'falhou'].includes(estadoApresentacaoJob(job))
    && !job.remotoId && !job.permalink;
}
// Num cancelado, sinais de que um envio anterior pode ter tido efeito na rede (AUD-09). Cancelar só
// encerra a execução no Grana; não prova que nada saiu. Sem esses sinais, o cancelamento é comum.
const EFEITO_INCERTO = new Set(['resultado-desconhecido', 'rede', 'prazo', 'prazo-esgotado', 'resultado-nao-confirmado',
  'publicacao-sem-id-recuperavel', 'publicacao-ja-iniciada', 'lease-vencida']);
export function efeitoAnteriorIncerto(job) {
  return EFEITO_INCERTO.has(job?.codigoErro) || !!job?.remotoId || /^https:\/\//.test(job?.permalink || '')
    || (Array.isArray(job?.recibos) && job.recibos.some((r) => r?.estado === 'incerto'
      || (r?.operacao === 'publicar' && r?.estado !== 'falhou')));
}
// Pausa descrita pelo escopo (AUD-14): nomeia o que parou e o que segue. No servidor, a pausa recusa
// prévia, confirmação, preparo e publicação só no escopo pausado; consultas de envios já iniciados e
// cancelamentos continuam, e nada que a rede já recebeu é desfeito.
const LISTA = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' });
export function descreverPausas(controles, contas = []) {
  const ligadas = [
    controles?.pausaGlobal ? { escopo: 'global', contaId: null, rotulo: 'Pausa geral', alvo: null, revisao: controles.revisao } : null,
    controles?.pausaInstagram ? { escopo: 'instagram', contaId: null, rotulo: 'Pausa do Instagram', alvo: 'os destinos do Instagram', revisao: controles.revisao } : null,
    controles?.pausaFacebook ? { escopo: 'facebook', contaId: null, rotulo: 'Pausa do Facebook', alvo: 'os destinos do Facebook', revisao: controles.revisao } : null,
    ...(contas || []).filter((a) => a?.pausada).map((a) => ({ escopo: 'conta', contaId: a.contaId, rotulo: `Pausa da conta ${a.rotulo}`,
      alvo: `os destinos da conta ${a.rotulo}`, revisao: a.revisao })),
  ].filter(Boolean);
  if (!ligadas.length) return { ligadas, resumo: 'Publicação ativa: nenhuma pausa ligada.', limite: null };
  const alvos = LISTA.format(ligadas.map((l) => l.alvo).filter(Boolean));
  const efeito = ligadas.some((l) => l.escopo === 'global') ? 'Nenhum destino é agendado, preparado nem publicado.'
    : `${alvos[0].toUpperCase()}${alvos.slice(1)} não são agendados, preparados nem publicados. Os demais destinos seguem normalmente.`;
  return { ligadas,
    resumo: `${LISTA.format(ligadas.map((l) => l.rotulo))} ${ligadas.length === 1 ? 'está ligada' : 'estão ligadas'}. ${efeito}`,
    limite: 'A pausa não desfaz o que a rede já recebeu: consultas de envios já iniciados e cancelamentos continuam. Retome para voltar a agendar.' };
}

// Até cinco minutos depois do horário, a confirmação da rede ainda pode estar chegando (o executor roda a
// cada minuto); depois disso, o horário vencido aparece como atraso.
const TOLERANCIA_ATRASO_MS = 5 * 60000;
// Estado real de UM destino, em palavras do autor. Nunca usa "Planejado" (essa palavra é do editorial).
export function descreverJobReal(job, agora = Date.now()) {
  const rede = NOME_REDE[job?.destino?.rede] || 'rede';
  const quando = Date.parse(job?.destino?.publicarEm || '');
  const sai = Number.isFinite(quando) ? quandoCurto(quando, agora) : 'no horário marcado';
  const link = /^https:\/\//.test(job?.permalink || '') ? job.permalink : null;
  const motivo = job?.codigoErro ? (fraseDoMotivo(job.codigoErro) || `Motivo informado pela rede: ${job.codigoErro}.`) : null;
  // Destino ainda ativo (AUD-13): antes do horário, "sai às"; na hora, espera a confirmação; passada a
  // tolerância, atraso com atenção. Atraso não vira falha nem convite a repetir: o servidor ainda pode
  // publicar dentro da janela dele, e depois marca o destino para conferir.
  const passou = Number.isFinite(quando) && agora >= quando;
  const atrasado = Number.isFinite(quando) && agora - quando > TOLERANCIA_ATRASO_MS;
  const ativo = (inicio) => !passou ? { rede, texto: `${inicio}, sai ${sai}`, atencao: false }
    : !atrasado ? { rede, texto: `${inicio}: marcado ${sai}, aguardando a confirmação da rede`, atencao: false }
      : { rede, texto: `${inicio}: marcado ${sai}, atrasado`, atencao: true,
        motivo: 'O horário marcado passou e a rede ainda não confirmou a publicação.',
        acao: `Confira no ${rede} se a publicação saiu. Não agende de novo sem conferir.` };
  if (estadoApresentacaoJob(job) === 'suspenso-para-revisao') {
    return { rede, texto: 'Suspenso para revisão', atencao: true,
      motivo: fraseDoMotivo(job.motivoSuspensao) || motivo || 'O agendamento está suspenso até a revisão do conteúdo.',
      acao: `${job.estado === 'precisa-conferir' ? `Confira também no ${rede} se a publicação anterior saiu. ` : ''}Revise e aprove a nova versão. Depois, gere outra prévia para agendar.` };
  }
  if (reagendamentoPermitido(job) && (['precisa-conferir', 'falhou'].includes(job.estado) || job.codigoErro === 'lease-vencida')) {
    return { rede, texto: 'Preparo interrompido antes da publicação', atencao: true, motivo,
      acao: `Escolha Reagendar ${rede}, confira a nova prévia e confirme o novo horário somente deste destino.` };
  }
  switch (job?.estado) {
    case 'planejado':
    case 'programado-no-painel': return ativo('Agendado no painel');
    case 'preparando': {
      // preparo {itens, total} vem do consultar desde 2fb8582; servidor antigo não manda, e aí fica sem contagem.
      const pr = job?.preparo, conta = Number.isInteger(pr?.itens) && Number.isInteger(pr?.total) && pr.total > 1 && pr.itens >= 0 && pr.itens <= pr.total;
      return ativo(`Preparando${conta ? ` ${pr.itens}/${pr.total}` : ''} na rede`);
    }
    case 'agendado-na-meta': return ativo('Agendado na Meta');
    case 'publicado': return { rede, texto: 'Publicado', atencao: false, link, linkRotulo: `Abrir no ${rede}`,
      acao: link ? null : `Confira no ${rede}: o link ainda não veio da rede.` };
    case 'cancelamento-pendente': return { rede, texto: 'Cancelamento pedido', atencao: true, acao: 'Aguarde a confirmação do cancelamento antes de agendar de novo.' };
    // Incerto: só conferir, sem convite a repetir. Comum: neutro, e reagendar é o caminho.
    case 'cancelado': return efeitoAnteriorIncerto(job)
      ? { rede, texto: 'Cancelado, com envio anterior sem confirmação', atencao: true,
        motivo: 'O último envio deste destino ficou sem resultado confirmado.',
        acao: `O cancelamento só encerrou a execução no Grana. Confira no ${rede} e nos recibos se a publicação saiu.` }
      : { rede, texto: 'Cancelado', atencao: false, motivo, acao: 'Nada sai neste destino. Para publicar, agende de novo.' };
    case 'falhou': return { rede, texto: 'Não saiu', atencao: true, motivo, acao: 'Nada foi publicado neste destino. Resolva o motivo e agende de novo.' };
    case 'suspenso-para-revisao': return { rede, texto: 'Suspenso para revisão', atencao: true, motivo, acao: 'Revise e aprove a nova versão. Depois, gere outra prévia para agendar.' };
    case 'precisa-conferir': return { rede, texto: 'Precisa conferir: não confirmamos se saiu', atencao: true, motivo,
      acao: `Abra o ${rede} antes de tentar de novo. Não agende outra vez sem conferir.` };
    default: return { rede, texto: 'Estado não reconhecido', atencao: true, acao: 'Atualize o Calendário e confira os recibos.' };
  }
}
