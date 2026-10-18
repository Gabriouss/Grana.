// Contrato e regras de domínio da E5 REAL. Não mistura a fila real com a simulação.
// A UI só chama mutações por ctx.acao, que usa CSRF e o step-up TOTP local do painel.

export const API_PUBLICACOES = '/api/marketing/publicacoes';
export const FUSO_PUBLICACAO = 'America/Sao_Paulo';
export const FORMATOS_PUBLICACAO = ['feed', 'carrossel', 'reels', 'stories'];

export const ROTULOS_ESTADO = {
  planejado: 'Planejado',
  'programado-no-painel': 'Programado',
  preparando: 'Preparando',
  'agendado-na-meta': 'Agendado na Meta',
  publicado: 'Publicado',
  'cancelamento-pendente': 'Cancelamento pendente',
  cancelado: 'Cancelado',
  falhou: 'Falhou',
  'precisa-conferir': 'Precisa conferir',
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HASH256 = /^[0-9a-f]{64}$/i;
export const SHA1 = /^[0-9a-f]{40}$/i;

const REDES = new Set(['instagram', 'facebook']);
const ESTADOS = new Set(Object.keys(ROTULOS_ESTADO));
const OPERACOES_RECIBO = new Set(['preparar', 'agendar', 'publicar', 'cancelar', 'reconciliar']);
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
  return `${local} · ${data.toISOString()} UTC`;
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
  for (const j of jobs) contagem.set(j.estado, (contagem.get(j.estado) || 0) + 1);
  if (contagem.size === 1) return { rotulo: ROTULOS_ESTADO[jobs[0].estado], total: jobs.length, parcial: false, contagem };
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
    async prever({ peca, destinos, horarioLocal, contas }) {
      if (!validarPeca(peca) || !Array.isArray(destinos) || destinos.length < 1 || destinos.length > 8) {
        throw erroContrato('pedido-invalido', 'Escolha uma peça aprovada e ao menos um destino válido.');
      }
      if (!Array.isArray(contas) || destinos.some((d) => !validarDestino(d, contas))) {
        throw erroContrato('destino-invalido', 'Uma conta ou capacidade deixou de estar verificada. Atualize os destinos antes de continuar.');
      }
      const chaves = destinos.map((d) => `${d?.contaId}|${d?.formato}`);
      if (new Set(chaves).size !== destinos.length || destinos.some((d) => !d
        || typeof d.contaId !== 'string' || !d.contaId || !REDES.has(d.rede)
        || !FORMATOS_PUBLICACAO.includes(d.formato))) {
        throw erroContrato('destino-invalido', 'Confira as contas e os formatos selecionados.');
      }
      const publicarEm = horarioLocalParaUtc(horarioLocal);
      const pedido = {
        acao: 'prever', pecaId: peca.id, versao: peca.versao,
        destinos: destinos.map(({ contaId, rede, formato }) => ({ contaId, rede, formato })),
        agendarPara: publicarEm, fuso: FUSO_PUBLICACAO,
      };
      const d = await post('prever', { pecaId: pedido.pecaId, versao: pedido.versao,
        destinos: pedido.destinos, agendarPara: pedido.agendarPara, fuso: pedido.fuso });
      if (!UUID.test(d.previaId || '') || !HASH256.test(d.previaHash || '')
        || !Number.isSafeInteger(d.revisao) || d.revisao < 1 || !Array.isArray(d.destinos)
        || !d.snapshot || !UUID.test(d.snapshot.snapshotId || '')
        || !['recebendo', 'verificando', 'pronto', 'recusado', 'revogado'].includes(d.snapshot.estado)
        || typeof d.podeConfirmar !== 'boolean' || d.destinos.length !== destinos.length
        || d.destinos.some((alvo) => !REDES.has(alvo.rede) || !FORMATOS_PUBLICACAO.includes(alvo.formato)
          || !['pronto', 'bloqueado'].includes(alvo.estado) || !Array.isArray(alvo.motivos))) throw erroContrato('previa-invalida');
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
      return post(acao, campos);
    },
  };
}
