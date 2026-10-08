import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

import { consultaComPrazo } from './admin-agregados.ts';
import type { OperacaoAdmin } from './admin-autorizacao.ts';

// Escrita remota da fila de ajustes (frente C). So duas coisas: criar um pedido e
// listar os pedidos do proprio admin. Sem update, sem delete, sem texto de volta e
// nunca o texto em log (o handler compartilhado so loga campos fixos).

export type PedidoAjustes =
  | { recurso: 'ajustes-listar' }
  | { recurso: 'ajustes-criar'; pecaId: string; caminho: string; versaoAlvo: string; texto: string };

const SHA1 = /^[0-9a-f]{40}$/;
const PECA = /^[0-9a-f]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS = new Set(['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito',
  'falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo', 'precisa-de-atencao']);
const CAMPOS_CRIAR = ['caminho', 'pecaId', 'recurso', 'texto', 'versaoAlvo'];

// Caminho so como referencia ao acervo versionado: nunca absoluto, nunca subindo pasta.
// O catalogo nomeia carrossel como "<pasta>/carrossel-*": o '*' so vale no fim do ultimo
// segmento (achado do Harbor, 08/10: o formato antigo recusava todo carrossel real).
function caminhoValido(c: unknown): c is string {
  if (typeof c !== 'string' || c.length > 400 || !c.startsWith('docs/marketing/')) return false;
  const partes = c.split('/');
  return partes.every((p, i) => p !== '.' && p !== '..'
    && (i === partes.length - 1 ? /^[A-Za-z0-9._-]+\*?$/ : /^[A-Za-z0-9._-]+$/).test(p));
}

export function validarPedidoAjustes(pedido: unknown): PedidoAjustes {
  const p = pedido as Record<string, unknown> | null;
  if (!p || Array.isArray(p) || typeof p !== 'object') throw new Error('pedido-invalido');
  const chaves = Object.keys(p).sort();
  if (p.recurso === 'ajustes-listar' && chaves.length === 1) return { recurso: 'ajustes-listar' };
  if (p.recurso !== 'ajustes-criar' || chaves.join() !== CAMPOS_CRIAR.join()) throw new Error('pedido-invalido');
  const texto = typeof p.texto === 'string' ? p.texto.trim() : '';
  if (typeof p.pecaId !== 'string' || !PECA.test(p.pecaId) || typeof p.versaoAlvo !== 'string'
    || !SHA1.test(p.versaoAlvo) || !caminhoValido(p.caminho) || !texto || [...texto].length > 2000) {
    throw new Error('pedido-invalido');
  }
  return { recurso: 'ajustes-criar', pecaId: p.pecaId, caminho: p.caminho, versaoAlvo: p.versaoAlvo, texto };
}

function data(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error('consulta');
  return new Date(v).toISOString();
}
function sha(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string' || !SHA1.test(v)) throw new Error('consulta');
  return v;
}

// DTO fechado: campo fora da lista ou fora do formato derruba a resposta inteira, em vez
// de passar adiante algo que o banco devolveu e ninguem previu.
function pedidoDto(r: Record<string, unknown>) {
  if (typeof r.id !== 'string' || !UUID.test(r.id) || typeof r.peca_id !== 'string' || !PECA.test(r.peca_id)
    || typeof r.estado !== 'string' || !ESTADOS.has(r.estado) || !caminhoValido(r.caminho)
    || typeof r.tentativas !== 'number' || !Number.isSafeInteger(r.tentativas) || r.tentativas < 0) {
    throw new Error('consulta');
  }
  return {
    id: r.id, pecaId: r.peca_id, caminho: r.caminho, versaoAlvo: sha(r.versao_alvo), estado: r.estado,
    tentativas: r.tentativas, versaoCorrigida: sha(r.versao_corrigida), aceiteEm: data(r.aceite_em),
    criadoEm: data(r.criado_em), atualizadoEm: data(r.atualizado_em), importadoEm: data(r.importado_em),
  };
}

export const operacaoAjustes: OperacaoAdmin<PedidoAjustes> = {
  // 2000 caracteres de texto podem ocupar ate 8000 bytes em UTF-8, mais os outros campos.
  limiteCorpo: 10 * 1024,
  validar: validarPedidoAjustes,
  executar: async (cliente: SupabaseClient, pedido, { userId, signal }) => {
    if (pedido.recurso === 'ajustes-listar') {
      const r = await consultaComPrazo((s) => cliente.from('admin_ajuste_pedidos')
        .select('id,peca_id,caminho,versao_alvo,estado,tentativas,versao_corrigida,aceite_em,criado_em,atualizado_em,importado_em')
        .eq('criado_por', userId).order('criado_em', { ascending: false }).limit(50).abortSignal(s), signal);
      if (r.error || !Array.isArray(r.data)) throw new Error('consulta');
      return { dados: { pedidos: r.data.map((x) => pedidoDto(x as Record<string, unknown>)) } };
    }
    // Sem nova tentativa: inserir nao e idempotente do lado de ca. A repeticao pelo
    // autor e absorvida pelo banco (mesmo texto em 2 min devolve o pedido existente).
    const r = await consultaComPrazo((s) => cliente.rpc('admin_ajuste_criar', {
      p_autor: userId, p_peca: pedido.pecaId, p_caminho: pedido.caminho, p_versao: pedido.versaoAlvo, p_texto: pedido.texto,
    }).abortSignal(s), signal);
    const linha = Array.isArray(r.data) ? r.data[0] : null;
    if (r.error || !linha || typeof linha.id !== 'string' || !UUID.test(linha.id) || !ESTADOS.has(linha.estado)) {
      throw new Error('consulta');
    }
    return { dados: { pedido: { id: linha.id, estado: linha.estado, criadoEm: data(linha.criado_em) } } };
  },
};
