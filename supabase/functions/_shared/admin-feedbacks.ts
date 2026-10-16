import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

import { consultaComPrazo } from './admin-agregados.ts';
import type { OperacaoAdmin } from './admin-autorizacao.ts';

// Leitura dos feedbacks pelo painel admin (B3, 15/10/2026). Até aqui nenhum admin lia o
// que as pessoas mandam pelo app: a tabela só tem a policy de INSERT do dono.
//
// Por que aqui e não numa policy ou RPC: quem é admin vive em ADMIN_USER_IDS, segredo das
// Edge Functions. Uma policy no banco precisaria de uma segunda lista de admins numa
// tabela, e as duas divergiriam. Atrás do portão comum (allowlist, aal2 + TOTP, limites,
// prazo total) a leitura usa a service_role e devolve um DTO fechado.
//
// Entrega 3 (16/10/2026) acrescenta a GESTÃO: estado, prioridade, responsável, etiquetas e
// evidência de resolução, em tabela separada (`feedback_gestao`, ver a migration). O texto
// original do feedback nunca é alterado por aqui. A escrita é a RPC transacional
// `feedback_gestao_atualizar`, que só a service_role executa. O handler compartilhado só
// loga campos fixos, nunca o texto.
//
// Minimização (LGPD): o DTO não leva user_id, device_info nem screenshot_url. Diz só se o
// feedback tem conta vinculada. Identificar quem mandou é outra decisão, com outro recurso.

export type EstadoGestao = 'novo' | 'em_analise' | 'planejado' | 'em_execucao' | 'resolvido' | 'arquivado';
export type PrioridadeGestao = 'baixa' | 'media' | 'alta';

export type PedidoGestao = {
  recurso: 'feedbacks-gestao';
  id: string;
  estado?: EstadoGestao;
  prioridade?: PrioridadeGestao | null;
  responsavel?: string | null;
  etiquetas?: string[];
  evidencia?: string | null;
  versaoResolucao?: string | null;
};

export type PedidoListarFeedbacks = {
  recurso: 'feedbacks-listar';
  status?: 'pending' | 'reviewed' | 'resolved';
  tipo?: 'suggestion' | 'bug' | 'praise' | 'other';
  nota?: number;
  versao?: string;
  desde?: string;
  ate?: string;
  antesDe?: string;
};
export type PedidoFeedbacks = PedidoListarFeedbacks | PedidoGestao;

const ESTADOS_GESTAO = new Set(['novo', 'em_analise', 'planejado', 'em_execucao', 'resolvido', 'arquivado']);
const PRIORIDADES = new Set(['baixa', 'media', 'alta']);
// Etiqueta: palavra curta de triagem, sem pontuação livre, para não virar lugar de colar dado pessoal.
const ETIQUETA = /^[0-9A-Za-zÀ-ÿ][0-9A-Za-zÀ-ÿ -]{0,29}$/;
const CAMPOS_GESTAO = new Set(['recurso', 'id', 'estado', 'prioridade', 'responsavel', 'etiquetas', 'evidencia', 'versaoResolucao']);

const STATUS = new Set(['pending', 'reviewed', 'resolved']);
const TIPOS = new Set(['suggestion', 'bug', 'praise', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
// Versão do app como o aparelho manda (1.10.5, 1.10.5-preview). Nada de curinga: o filtro é igualdade.
const VERSAO = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;
const CAMPOS = new Set(['recurso', 'status', 'tipo', 'nota', 'versao', 'desde', 'ate', 'antesDe']);
export const POR_PAGINA = 50;

function data(v: unknown): string {
  if (typeof v !== 'string' || !ISO.test(v) || !Number.isFinite(Date.parse(v))) throw new Error('pedido-invalido');
  return new Date(v).toISOString();
}

function textoLivre(v: unknown, max: number): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error('pedido-invalido');
  const t = v.trim();
  if (t.length < 1 || t.length > max || /[\u0000-\u001f\u007f]/.test(t)) throw new Error('pedido-invalido');
  return t;
}

export function validarPedidoGestao(p: Record<string, unknown>): PedidoGestao {
  if (Object.keys(p).some((k) => !CAMPOS_GESTAO.has(k))) throw new Error('pedido-invalido');
  if (typeof p.id !== 'string' || !UUID.test(p.id)) throw new Error('pedido-invalido');
  const saida: PedidoGestao = { recurso: 'feedbacks-gestao', id: p.id };
  if (p.estado !== undefined) {
    if (typeof p.estado !== 'string' || !ESTADOS_GESTAO.has(p.estado)) throw new Error('pedido-invalido');
    saida.estado = p.estado as EstadoGestao;
  }
  if (p.prioridade !== undefined) {
    if (p.prioridade !== null && (typeof p.prioridade !== 'string' || !PRIORIDADES.has(p.prioridade))) throw new Error('pedido-invalido');
    saida.prioridade = p.prioridade as PrioridadeGestao | null;
  }
  if (p.responsavel !== undefined) saida.responsavel = textoLivre(p.responsavel, 80);
  if (p.evidencia !== undefined) saida.evidencia = textoLivre(p.evidencia, 500);
  if (p.versaoResolucao !== undefined) {
    const v = textoLivre(p.versaoResolucao, 40);
    if (v !== null && !VERSAO.test(v)) throw new Error('pedido-invalido');
    saida.versaoResolucao = v;
  }
  if (p.etiquetas !== undefined) {
    if (!Array.isArray(p.etiquetas) || p.etiquetas.length > 8) throw new Error('pedido-invalido');
    const vistas = new Set<string>();
    for (const e of p.etiquetas) {
      if (typeof e !== 'string') throw new Error('pedido-invalido');
      const t = e.trim().replace(/\s+/g, ' ');
      if (!ETIQUETA.test(t)) throw new Error('pedido-invalido');
      vistas.add(t.toLowerCase());
    }
    saida.etiquetas = [...vistas];
  }
  if (Object.keys(saida).length === 2) throw new Error('pedido-invalido'); // nada a mudar
  // Resolvido exige evidência, no pedido ou já gravada; o banco confere a segunda metade.
  if (saida.estado === 'resolvido' && saida.evidencia === null) throw new Error('pedido-invalido');
  return saida;
}

export function validarPedidoFeedbacks(pedido: unknown): PedidoFeedbacks {
  const p = pedido as Record<string, unknown> | null;
  if (!p || Array.isArray(p) || typeof p !== 'object') throw new Error('pedido-invalido');
  if (p.recurso === 'feedbacks-gestao') return validarPedidoGestao(p);
  if (p.recurso !== 'feedbacks-listar') throw new Error('pedido-invalido');
  if (Object.keys(p).some((k) => !CAMPOS.has(k))) throw new Error('pedido-invalido');
  const saida: PedidoListarFeedbacks = { recurso: 'feedbacks-listar' };
  if (p.status !== undefined) {
    if (typeof p.status !== 'string' || !STATUS.has(p.status)) throw new Error('pedido-invalido');
    saida.status = p.status as PedidoListarFeedbacks['status'];
  }
  if (p.tipo !== undefined) {
    if (typeof p.tipo !== 'string' || !TIPOS.has(p.tipo)) throw new Error('pedido-invalido');
    saida.tipo = p.tipo as PedidoListarFeedbacks['tipo'];
  }
  if (p.nota !== undefined) {
    if (typeof p.nota !== 'number' || !Number.isInteger(p.nota) || p.nota < 1 || p.nota > 5) throw new Error('pedido-invalido');
    saida.nota = p.nota;
  }
  if (p.versao !== undefined) {
    if (typeof p.versao !== 'string' || !VERSAO.test(p.versao)) throw new Error('pedido-invalido');
    saida.versao = p.versao;
  }
  if (p.desde !== undefined) saida.desde = data(p.desde);
  if (p.ate !== undefined) saida.ate = data(p.ate);
  if (saida.desde && saida.ate && saida.desde > saida.ate) throw new Error('pedido-invalido');
  if (p.antesDe !== undefined) saida.antesDe = data(p.antesDe);
  return saida;
}

function textoOuNulo(v: unknown, max: number): string | null {
  if (v == null) return null;
  if (typeof v !== 'string' || v.length > max) throw new Error('consulta');
  return v;
}

// DTO fechado: campo fora do formato derruba a resposta, em vez de passar adiante algo
// que o banco devolveu e ninguém previu.
export type GestaoDto = {
  estado: EstadoGestao; prioridade: PrioridadeGestao | null; responsavel: string | null;
  etiquetas: string[]; evidencia: string | null; versaoResolucao: string | null; atualizadoEm: string | null;
};
const gestaoPadrao = (): GestaoDto => ({ estado: 'novo', prioridade: null, responsavel: null, etiquetas: [], evidencia: null, versaoResolucao: null, atualizadoEm: null });

// Linha de feedback_gestao -> DTO fechado. Sem `atualizado_por`: id de admin não sai.
export function gestaoDto(g: Record<string, unknown> | undefined): GestaoDto {
  if (!g) return gestaoPadrao();
  if (typeof g.estado !== 'string' || !ESTADOS_GESTAO.has(g.estado)
    || (g.prioridade != null && (typeof g.prioridade !== 'string' || !PRIORIDADES.has(g.prioridade)))
    || !Array.isArray(g.etiquetas) || g.etiquetas.length > 8 || g.etiquetas.some((e) => typeof e !== 'string' || e.length > 30)) {
    throw new Error('consulta');
  }
  return {
    estado: g.estado as EstadoGestao, prioridade: (g.prioridade ?? null) as PrioridadeGestao | null,
    responsavel: textoOuNulo(g.responsavel, 80), etiquetas: g.etiquetas as string[],
    evidencia: textoOuNulo(g.evidencia, 500), versaoResolucao: textoOuNulo(g.versao_resolucao, 40),
    atualizadoEm: typeof g.atualizado_em === 'string' && Number.isFinite(Date.parse(g.atualizado_em)) ? new Date(g.atualizado_em).toISOString() : null,
  };
}

export function feedbackDto(r: Record<string, unknown>) {
  if (typeof r.id !== 'string' || !UUID.test(r.id) || typeof r.type !== 'string' || !TIPOS.has(r.type)
    || typeof r.status !== 'string' || !STATUS.has(r.status) || typeof r.message !== 'string'
    || r.message.length < 1 || r.message.length > 2000 || typeof r.public_use_consent !== 'boolean'
    || typeof r.created_at !== 'string' || !Number.isFinite(Date.parse(r.created_at))
    || (r.rating != null && (typeof r.rating !== 'number' || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5))) {
    throw new Error('consulta');
  }
  return {
    id: r.id, tipo: r.type, nota: r.rating ?? null, mensagem: r.message, status: r.status,
    versaoApp: textoOuNulo(r.app_version, 40), plataforma: textoOuNulo(r.platform, 40),
    usoPublicoAutorizado: r.public_use_consent, temConta: r.user_id != null,
    criadoEm: new Date(r.created_at).toISOString(),
    gestao: gestaoPadrao(),
  };
}

export const operacaoFeedbacks: OperacaoAdmin<PedidoFeedbacks> = {
  limiteCorpo: 1024,
  validar: validarPedidoFeedbacks,
  executar: async (cliente: SupabaseClient, pedido, { signal, userId }) => {
    if (pedido.recurso === 'feedbacks-gestao') return atualizarGestao(cliente, pedido, userId, signal);
    const r = await consultaComPrazo((s) => {
      // user_id só entra para calcular temConta; não sai no DTO.
      let q = cliente.from('feedbacks')
        .select('id,type,rating,message,status,app_version,platform,public_use_consent,user_id,created_at');
      if (pedido.status) q = q.eq('status', pedido.status);
      if (pedido.tipo) q = q.eq('type', pedido.tipo);
      if (pedido.nota) q = q.eq('rating', pedido.nota);
      if (pedido.versao) q = q.eq('app_version', pedido.versao);
      if (pedido.desde) q = q.gte('created_at', pedido.desde);
      if (pedido.ate) q = q.lte('created_at', pedido.ate);
      if (pedido.antesDe) q = q.lt('created_at', pedido.antesDe);
      // Uma linha a mais só para saber se há próxima página.
      return q.order('created_at', { ascending: false }).limit(POR_PAGINA + 1).abortSignal(s);
    }, signal);
    if (r.error || !Array.isArray(r.data)) throw new Error('consulta');
    const linhas = r.data as Record<string, unknown>[];
    const pagina = linhas.slice(0, POR_PAGINA).map(feedbackDto);
    if (pagina.length > 0) {
      const ids = pagina.map((f) => f.id);
      const g = await consultaComPrazo((s) => cliente.from('feedback_gestao')
        .select('feedback_id,estado,prioridade,responsavel,etiquetas,evidencia,versao_resolucao,atualizado_em')
        .in('feedback_id', ids).abortSignal(s), signal);
      if (g.error || !Array.isArray(g.data)) throw new Error('consulta');
      const porId = new Map((g.data as Record<string, unknown>[]).map((x) => [x.feedback_id as string, x]));
      for (const f of pagina) f.gestao = gestaoDto(porId.get(f.id));
    }
    return { dados: { feedbacks: pagina, haMais: linhas.length > POR_PAGINA } };
  },
};

async function atualizarGestao(cliente: SupabaseClient, pedido: PedidoGestao, userId: string, signal: AbortSignal) {
  const patch: Record<string, unknown> = {};
  if (pedido.estado !== undefined) patch.estado = pedido.estado;
  if (pedido.prioridade !== undefined) patch.prioridade = pedido.prioridade;
  if (pedido.responsavel !== undefined) patch.responsavel = pedido.responsavel;
  if (pedido.etiquetas !== undefined) patch.etiquetas = pedido.etiquetas;
  if (pedido.evidencia !== undefined) patch.evidencia = pedido.evidencia;
  if (pedido.versaoResolucao !== undefined) patch.versao_resolucao = pedido.versaoResolucao;
  const r = await consultaComPrazo((s) => cliente.rpc('feedback_gestao_atualizar', { p_id: pedido.id, p_por: userId, p_patch: patch }).abortSignal(s), signal);
  // Só o fato da falha: a mensagem do banco pode citar o valor digitado.
  if (r.error) throw new Error('consulta');
  const linha = (Array.isArray(r.data) ? r.data[0] : r.data) as Record<string, unknown> | null;
  if (!linha) throw new Error('consulta');
  return { dados: { id: pedido.id, gestao: gestaoDto(linha) } };
}
