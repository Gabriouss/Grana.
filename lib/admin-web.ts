import { supabase } from './supabase';

export type AcessoAdmin = { admin: false } | { admin: true; aal: 'aal1' | 'aal2'; totp: 'ausente' | 'verificado' };
type Bloco<T> = (T & { indisponivel?: false }) | { indisponivel: true };
export type VisaoAdmin = {
  contas: Bloco<{ total: number; novas7d: number; novas30d: number }>;
  assinaturas: Bloco<{ ativas: number; porPlano: { mensal: number; anual: number }; porOrigem: { venda: number; cortesia: number } }>;
  receita: Bloco<{ disponivel: boolean; soma30d: number | null; moeda: string }>;
  app: Bloco<{ versaoAnunciada: string | null; anunciadaEm: string | null }>;
  uso: Bloco<{ voz7d: number; aparelhosComNotificacao: number }>;
};
export type RespostaAdmin<T> = { ok: true; contrato: number; geradoEm: string; dados: T };

export class ErroAdmin extends Error {
  constructor(public codigo: string, mensagem: string, public ocorrencia: string, public hora = new Date().toISOString()) {
    super(mensagem);
    this.name = 'ErroAdmin';
  }
}

export function reciboLocal(codigo: string, mensagem: string) {
  return new ErroAdmin(codigo, mensagem, `web-${globalThis.crypto.randomUUID()}`);
}

function validarDados(recurso: 'acesso' | 'visao-geral', dados: any): boolean {
  const so = (v: any, campos: string[]) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => campos.includes(k));
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const bloco = (v: any, campos: string[], validar: (v: any) => boolean) => so(v, [...campos, 'indisponivel']) && (v.indisponivel === true || validar(v));
  if (recurso === 'acesso') return (dados?.admin === false && so(dados, ['admin'])) || (so(dados, ['admin', 'aal', 'totp']) && dados?.admin === true &&
    ['aal1', 'aal2'].includes(dados.aal) && ['ausente', 'verificado'].includes(dados.totp));
  return Boolean(so(dados, ['contas', 'assinaturas', 'receita', 'app', 'uso']) &&
    bloco(dados.contas, ['total', 'novas7d', 'novas30d'], (v) => count(v.total) && count(v.novas7d) && count(v.novas30d)) &&
    bloco(dados.assinaturas, ['ativas', 'porPlano', 'porOrigem'], (v) => count(v.ativas) && so(v.porPlano, ['mensal', 'anual']) && so(v.porOrigem, ['venda', 'cortesia']) && count(v.porPlano?.mensal) && count(v.porPlano?.anual) && count(v.porOrigem?.venda) && count(v.porOrigem?.cortesia)) &&
    bloco(dados.receita, ['disponivel', 'soma30d', 'moeda'], (v) => typeof v.disponivel === 'boolean' && v.moeda === 'BRL' &&
      (v.disponivel ? typeof v.soma30d === 'number' && Number.isFinite(v.soma30d) && v.soma30d >= 0 : v.soma30d === null)) &&
    bloco(dados.app, ['versaoAnunciada', 'anunciadaEm'], (v) => (v.versaoAnunciada === null || /^\d+\.\d+\.\d+$/.test(v.versaoAnunciada)) &&
      (v.anunciadaEm === null || (typeof v.anunciadaEm === 'string' && Number.isFinite(Date.parse(v.anunciadaEm))))) &&
    bloco(dados.uso, ['voz7d', 'aparelhosComNotificacao'], (v) => count(v.voz7d) && count(v.aparelhosComNotificacao)));
}

// Um único prazo inclui sessão, cabeçalhos E corpo. Nenhum retry automático.
export async function consultarAdmin<T>(recurso: 'acesso' | 'visao-geral'): Promise<RespostaAdmin<T>> {
  return chamarAdmin<T>('admin-consulta', { recurso }, (dados) => {
    if (!validarDados(recurso, dados)) return false;
    if (recurso === 'visao-geral') {
      // Um bloco indisponível não transporta conteúdo residual do servidor.
      for (const nome of Object.keys(dados)) {
        if (dados[nome].indisponivel === true) dados[nome] = { indisponivel: true };
      }
    }
    return true;
  });
}

export type TipoFeedback = 'suggestion' | 'bug' | 'praise' | 'other';
export type StatusFeedback = 'pending' | 'reviewed' | 'resolved';
export type EstadoGestao = 'novo' | 'em_analise' | 'planejado' | 'em_execucao' | 'resolvido' | 'arquivado';
export type PrioridadeGestao = 'baixa' | 'media' | 'alta';
// Triagem administrativa (Entrega 3): vive em tabela separada e nunca altera o texto do feedback.
export type GestaoFeedback = {
  estado: EstadoGestao; prioridade: PrioridadeGestao | null; responsavel: string | null; etiquetas: string[];
  evidencia: string | null; versaoResolucao: string | null; atualizadoEm: string | null;
};
export type MudancaGestao = {
  estado?: EstadoGestao; prioridade?: PrioridadeGestao | null; responsavel?: string | null; etiquetas?: string[];
  evidencia?: string | null; versaoResolucao?: string | null;
};
export type FeedbackAdmin = {
  id: string; tipo: TipoFeedback; nota: number | null; mensagem: string; status: StatusFeedback;
  versaoApp: string | null; plataforma: string | null; usoPublicoAutorizado: boolean; temConta: boolean; criadoEm: string;
  gestao: GestaoFeedback;
};
export type PaginaFeedbacks = { feedbacks: FeedbackAdmin[]; haMais: boolean };
export type FiltrosFeedbacks = { tipo?: TipoFeedback; nota?: number; versao?: string; desde?: string; ate?: string };

const TIPOS_FEEDBACK = ['suggestion', 'bug', 'praise', 'other'];
const STATUS_FEEDBACK = ['pending', 'reviewed', 'resolved'];
const CAMPOS_FEEDBACK = ['id', 'tipo', 'nota', 'mensagem', 'status', 'versaoApp', 'plataforma', 'usoPublicoAutorizado', 'temConta', 'criadoEm', 'gestao'];
const ESTADOS_GESTAO = ['novo', 'em_analise', 'planejado', 'em_execucao', 'resolvido', 'arquivado'];
const PRIORIDADES_GESTAO = ['baixa', 'media', 'alta'];
const CAMPOS_GESTAO = ['estado', 'prioridade', 'responsavel', 'etiquetas', 'evidencia', 'versaoResolucao', 'atualizadoEm'];

function gestaoValida(g: any): boolean {
  const texto = (v: unknown, max: number) => v === null || (typeof v === 'string' && v.length >= 1 && v.length <= max);
  return Boolean(g && typeof g === 'object' && !Array.isArray(g) && Object.keys(g).every((k) => CAMPOS_GESTAO.includes(k)) &&
    ESTADOS_GESTAO.includes(g.estado) && (g.prioridade === null || PRIORIDADES_GESTAO.includes(g.prioridade)) &&
    texto(g.responsavel, 80) && texto(g.evidencia, 500) && texto(g.versaoResolucao, 40) &&
    Array.isArray(g.etiquetas) && g.etiquetas.length <= 8 && g.etiquetas.every((e: unknown) => typeof e === 'string' && e.length >= 1 && e.length <= 30) &&
    (g.atualizadoEm === null || (typeof g.atualizadoEm === 'string' && Number.isFinite(Date.parse(g.atualizadoEm)))));
}

function feedbackValido(f: any): boolean {
  const textoCurto = (v: unknown) => v === null || (typeof v === 'string' && v.length <= 40);
  return Boolean(f && typeof f === 'object' && !Array.isArray(f) && Object.keys(f).every((k) => CAMPOS_FEEDBACK.includes(k)) &&
    typeof f.id === 'string' && /^[0-9a-f-]{36}$/i.test(f.id) && TIPOS_FEEDBACK.includes(f.tipo) && STATUS_FEEDBACK.includes(f.status) &&
    (f.nota === null || (Number.isInteger(f.nota) && f.nota >= 1 && f.nota <= 5)) &&
    typeof f.mensagem === 'string' && f.mensagem.length >= 1 && f.mensagem.length <= 2000 &&
    textoCurto(f.versaoApp) && textoCurto(f.plataforma) && typeof f.usoPublicoAutorizado === 'boolean' && typeof f.temConta === 'boolean' &&
    typeof f.criadoEm === 'string' && Number.isFinite(Date.parse(f.criadoEm)) && gestaoValida(f.gestao));
}

// Leitura dos feedbacks (B3/B3b). Mesmo prazo, mesmos recibos e nenhum retry de consultarAdmin.
// `antesDe` é o cursor: o criadoEm do último item já mostrado.
export async function listarFeedbacksAdmin(filtros: FiltrosFeedbacks, antesDe?: string): Promise<RespostaAdmin<PaginaFeedbacks>> {
  const corpo: Record<string, unknown> = { recurso: 'feedbacks-listar' };
  for (const [k, v] of Object.entries(filtros)) if (v !== undefined && v !== '') corpo[k] = v;
  if (antesDe) corpo.antesDe = antesDe;
  return chamarAdmin<PaginaFeedbacks>('admin-feedbacks', corpo, (dados) =>
    Boolean(dados && typeof dados === 'object' && Object.keys(dados).every((k) => k === 'feedbacks' || k === 'haMais') &&
      Array.isArray(dados.feedbacks) && dados.feedbacks.length <= 50 && dados.feedbacks.every(feedbackValido) && typeof dados.haMais === 'boolean'));
}

// Escrita da gestão (Entrega 3). Mesmo prazo, mesmos recibos, nenhum retry: gravar de novo sem
// o administrador saber é pior do que mostrar o erro. A resposta traz a gestão já gravada.
export async function atualizarGestaoFeedback(id: string, mudanca: MudancaGestao): Promise<RespostaAdmin<{ id: string; gestao: GestaoFeedback }>> {
  const corpo: Record<string, unknown> = { recurso: 'feedbacks-gestao', id };
  for (const [k, v] of Object.entries(mudanca)) if (v !== undefined) corpo[k] = v;
  return chamarAdmin<{ id: string; gestao: GestaoFeedback }>('admin-feedbacks', corpo, (dados) =>
    Boolean(dados && typeof dados === 'object' && Object.keys(dados).every((k) => k === 'id' || k === 'gestao') &&
      dados.id === id && gestaoValida(dados.gestao)));
}

async function chamarAdmin<T>(funcao: 'admin-consulta' | 'admin-feedbacks', corpo: Record<string, unknown>, validar: (dados: any) => boolean): Promise<RespostaAdmin<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const trabalho = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw reciboLocal('nao-autenticado', 'Sua sessão terminou. Entre novamente.');
    if (controller.signal.aborted) throw reciboLocal('prazo', 'A consulta demorou demais. Tente de novo.');
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/${funcao}`, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      const codigos = ['limite', 'nao-autenticado', 'nao-autorizado', 'mfa-necessario', 'nao-configurado', 'prazo', 'origem-recusada', 'metodo-invalido', 'corpo-grande', 'pedido-invalido', 'indisponivel'];
      const codigo = response.status === 429 ? 'limite' : codigos.includes(body?.erro?.codigo) ? body.erro.codigo : `http-${response.status}`;
      const mensagens: Record<string, string> = {
        limite: 'Muitas consultas. Tente de novo em um minuto.',
        'nao-autenticado': 'Sua sessão terminou. Entre novamente.',
        'nao-autorizado': 'Esta conta não tem acesso ao painel.',
        'mfa-necessario': 'Confirme seu código de autenticação novamente.',
        'nao-configurado': 'O acesso ao painel ainda não foi configurado no servidor.',
      };
      throw new ErroAdmin(codigo, mensagens[codigo] ?? 'O servidor não concluiu a consulta. Tente de novo.',
        typeof body?.ocorrencia === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(body.ocorrencia) ? body.ocorrencia : `web-${globalThis.crypto.randomUUID()}`);
    }
    if (body.contrato !== 1 || typeof body.geradoEm !== 'string' || !Number.isFinite(Date.parse(body.geradoEm)) || !validar(body.dados)) {
      throw reciboLocal('resposta-invalida', 'O servidor devolveu uma resposta incompatível. Tente de novo.');
    }
    return { ok: true, contrato: body.contrato, geradoEm: body.geradoEm, dados: body.dados } as RespostaAdmin<T>;
  };
  try {
    return await Promise.race([trabalho(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(reciboLocal('prazo', 'A consulta demorou demais. Tente de novo.')); }, 15_000);
    })]);
  } catch (error) {
    if (error instanceof ErroAdmin) throw error;
    throw reciboLocal('rede', 'Não foi possível conectar ao painel. Confira sua conexão e tente de novo.');
  } finally {
    clearTimeout(timer);
  }
}
