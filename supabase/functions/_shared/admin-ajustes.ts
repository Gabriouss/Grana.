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
  if (typeof c !== 'string' || [...c].length > 400 || !c.startsWith('docs/marketing/') || c !== c.normalize('NFKC')
    || /[\u0000-\u001f\u007f-\u009f\\:<>"|?]/u.test(c) || /[\ud800-\udfff]/u.test(c)) return false;
  const partes = c.split('/');
  return partes.every((p, i) => {
    if (!p || p.startsWith('.') || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p) || /~\d/.test(p)) return false;
    const estrela = p.indexOf('*');
    return estrela < 0 || (i === partes.length - 1 && estrela > 0 && estrela === p.length - 1 && p.lastIndexOf('*') === estrela);
  });
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
async function pedidoDto(r: Record<string, unknown>) {
  if (typeof r.id !== 'string' || !UUID.test(r.id) || typeof r.peca_id !== 'string' || !PECA.test(r.peca_id)
    || typeof r.estado !== 'string' || !ESTADOS.has(r.estado) || !caminhoValido(r.caminho)
    || typeof r.tentativas !== 'number' || !Number.isSafeInteger(r.tentativas) || r.tentativas < 0) {
    throw new Error('consulta');
  }
  return {
    ...(r.prova_correcao == null ? {} : { provaCorrecao: await provaDto(r) }),
    id: r.id, pecaId: r.peca_id, caminho: r.caminho, versaoAlvo: sha(r.versao_alvo), estado: r.estado,
    tentativas: r.tentativas, versaoCorrigida: sha(r.versao_corrigida), commit: sha(r.commit_correcao), aceiteEm: data(r.aceite_em),
    criadoEm: data(r.criado_em), atualizadoEm: data(r.atualizado_em), importadoEm: data(r.importado_em),
  };
}

async function provaDto(r: Record<string, unknown>) {
  const p = r.prova_correcao as Record<string, unknown>;
  const campos = ['tipo','pedidoId','pecaId','caminho','versaoAnterior','versaoCorrigida','anteriorSha256','atualSha256','reciboSha256'];
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).sort().join() !== campos.sort().join()
    || campos.some(k => typeof p[k] !== 'string') || p.tipo !== 'historico-local-v1'
    || p.pedidoId !== r.id || p.pecaId !== r.peca_id || p.caminho !== r.caminho
    || p.versaoAnterior !== r.versao_alvo || p.versaoCorrigida !== r.versao_corrigida
    || p.versaoAnterior === p.versaoCorrigida
    || ['anteriorSha256','atualSha256','reciboSha256'].some(k => !/^[a-f0-9]{64}$/.test(p[k] as string))) throw new Error('consulta');
  const chave = ['grana-ajuste-local-v1',p.pedidoId,p.pecaId,p.caminho,p.versaoAnterior,p.versaoCorrigida,p.anteriorSha256,p.atualSha256].join('\n');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(chave)))].map(b => b.toString(16).padStart(2,'0')).join('');
  if (hash !== p.reciboSha256) throw new Error('consulta');
  return Object.fromEntries(campos.map(k => [k,p[k]]));
}

export const operacaoAjustes: OperacaoAdmin<PedidoAjustes> = {
  // 2000 caracteres de texto podem ocupar ate 8000 bytes em UTF-8, mais os outros campos.
  limiteCorpo: 10 * 1024,
  validar: validarPedidoAjustes,
  executar: async (cliente: SupabaseClient, pedido, { userId, signal }) => {
    if (pedido.recurso === 'ajustes-listar') {
      const r = await consultaComPrazo((s) => cliente.from('admin_ajuste_pedidos')
        .select('id,peca_id,caminho,versao_alvo,estado,tentativas,versao_corrigida,commit_correcao,prova_correcao,aceite_em,criado_em,atualizado_em,importado_em')
        .eq('criado_por', userId).order('criado_em', { ascending: false }).limit(50).abortSignal(s), signal);
      if (r.error || !Array.isArray(r.data)) throw new Error('consulta');
      return { dados: { pedidos: await Promise.all(r.data.map((x) => pedidoDto(x as Record<string, unknown>))) } };
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
