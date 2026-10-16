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
// Só leitura. Sem update de status (isso é a etapa 3, com estados próprios) e sem o texto
// em log (o handler compartilhado só loga campos fixos).
//
// Minimização (LGPD): o DTO não leva user_id, device_info nem screenshot_url. Diz só se o
// feedback tem conta vinculada. Identificar quem mandou é outra decisão, com outro recurso.

export type PedidoFeedbacks = {
  recurso: 'feedbacks-listar';
  status?: 'pending' | 'reviewed' | 'resolved';
  tipo?: 'suggestion' | 'bug' | 'praise' | 'other';
  nota?: number;
  versao?: string;
  desde?: string;
  ate?: string;
  antesDe?: string;
};

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

export function validarPedidoFeedbacks(pedido: unknown): PedidoFeedbacks {
  const p = pedido as Record<string, unknown> | null;
  if (!p || Array.isArray(p) || typeof p !== 'object' || p.recurso !== 'feedbacks-listar') throw new Error('pedido-invalido');
  if (Object.keys(p).some((k) => !CAMPOS.has(k))) throw new Error('pedido-invalido');
  const saida: PedidoFeedbacks = { recurso: 'feedbacks-listar' };
  if (p.status !== undefined) {
    if (typeof p.status !== 'string' || !STATUS.has(p.status)) throw new Error('pedido-invalido');
    saida.status = p.status as PedidoFeedbacks['status'];
  }
  if (p.tipo !== undefined) {
    if (typeof p.tipo !== 'string' || !TIPOS.has(p.tipo)) throw new Error('pedido-invalido');
    saida.tipo = p.tipo as PedidoFeedbacks['tipo'];
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
  };
}

export const operacaoFeedbacks: OperacaoAdmin<PedidoFeedbacks> = {
  limiteCorpo: 1024,
  validar: validarPedidoFeedbacks,
  executar: async (cliente: SupabaseClient, pedido, { signal }) => {
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
    return { dados: { feedbacks: pagina, haMais: linhas.length > POR_PAGINA } };
  },
};
