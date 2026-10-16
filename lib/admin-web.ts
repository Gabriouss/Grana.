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

// Correções de criativos (Entrega 3): a MESMA fila de ajustes que o painel local entrega ao agente
// (tabela admin_ajuste_pedidos, função admin-ajustes). Aqui só se lê o andamento dos pedidos do
// próprio administrador e se cria pedido novo. Aceite NÃO existe pelo navegador: ele grava a
// evidência datada no acervo versionado, que só o painel local alcança. O texto do pedido nunca
// volta do servidor (decisão do desenho da função).
export type EstadoCorrecao =
  | 'novo' | 'em-correcao' | 'corrigido-aguardando-aceite' | 'aceito' | 'falha-de-envio' | 'desatualizado'
  | 'aguardando-aprovacao-de-custo' | 'precisa-de-atencao' | 'encerrado' | 'recusado-pelo-autor';
export type CorrecaoCriativo = {
  id: string; pecaId: string; caminho: string; versaoAlvo: string | null; estado: EstadoCorrecao; tentativas: number;
  versaoCorrigida: string | null; commit: string | null; aceiteEm: string | null; criadoEm: string | null;
  atualizadoEm: string | null; importadoEm: string | null;
};
const ESTADOS_CORRECAO = ['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito', 'falha-de-envio', 'desatualizado',
  'aguardando-aprovacao-de-custo', 'precisa-de-atencao', 'encerrado', 'recusado-pelo-autor'];
const CAMPOS_CORRECAO = ['id', 'pecaId', 'caminho', 'versaoAlvo', 'estado', 'tentativas', 'versaoCorrigida', 'commit', 'aceiteEm', 'criadoEm', 'atualizadoEm', 'importadoEm'];

function correcaoValida(c: any): boolean {
  const sha = (v: unknown) => v === null || (typeof v === 'string' && /^[0-9a-f]{40}$/.test(v));
  const data = (v: unknown) => v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));
  return Boolean(c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).every((k) => CAMPOS_CORRECAO.includes(k)) &&
    typeof c.id === 'string' && /^[0-9a-f-]{36}$/i.test(c.id) && typeof c.pecaId === 'string' && /^[0-9a-f]{16}$/.test(c.pecaId) &&
    typeof c.caminho === 'string' && c.caminho.length <= 400 && c.caminho.startsWith('docs/marketing/') &&
    ESTADOS_CORRECAO.includes(c.estado) && Number.isInteger(c.tentativas) && c.tentativas >= 0 &&
    sha(c.versaoAlvo) && sha(c.versaoCorrigida) && sha(c.commit) && data(c.aceiteEm) && data(c.criadoEm) && data(c.atualizadoEm) && data(c.importadoEm));
}

export async function listarCorrecoesCriativos(): Promise<RespostaAdmin<{ pedidos: CorrecaoCriativo[] }>> {
  return chamarAdmin<{ pedidos: CorrecaoCriativo[] }>('admin-ajustes', { recurso: 'ajustes-listar' }, (dados) =>
    Boolean(dados && typeof dados === 'object' && Object.keys(dados).every((k) => k === 'pedidos') &&
      Array.isArray(dados.pedidos) && dados.pedidos.length <= 50 && dados.pedidos.every(correcaoValida)));
}

// Novo ajuste sobre uma versão corrigida: o alvo é a versão que o administrador viu, e o banco
// encadeia o pedido ao anterior da mesma peça. Repetir o mesmo texto em 2 minutos devolve o
// pedido que já existe, então o duplo clique não duplica.
export async function pedirNovoAjusteCriativo(c: { pecaId: string; caminho: string; versaoAlvo: string; texto: string }): Promise<RespostaAdmin<{ pedido: { id: string; estado: EstadoCorrecao; criadoEm: string | null } }>> {
  return chamarAdmin<{ pedido: { id: string; estado: EstadoCorrecao; criadoEm: string | null } }>('admin-ajustes',
    { recurso: 'ajustes-criar', pecaId: c.pecaId, caminho: c.caminho, versaoAlvo: c.versaoAlvo, texto: c.texto },
    (dados) => Boolean(dados && typeof dados === 'object' && Object.keys(dados).every((k) => k === 'pedido') && dados.pedido &&
      typeof dados.pedido.id === 'string' && /^[0-9a-f-]{36}$/i.test(dados.pedido.id) && ESTADOS_CORRECAO.includes(dados.pedido.estado)));
}

// Notificações do sino (fundação de marketing, função admin-marketing). Só o que o contrato do
// servidor entrega: código, importância, vínculo, datas. Título e texto são do cliente
// (lib/admin-notificacoes.ts), porque o servidor nunca guarda texto livre nem conteúdo de feedback.
export type NotificacaoServidor = {
  id: string; codigo: string; importancia: 'informacao' | 'atencao' | 'critica'; agendamentoId: string | null;
  criadoEm: string; lidaEm: string | null; resolvidaEm: string | null;
};
export type PaginaNotificacoes = {
  notificacoes: NotificacaoServidor[]; naoLidas: number; proximaPagina: { criadoEm: string; id: string } | null;
};
const UUID_ADMIN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notificacaoValida(n: any): boolean {
  const data = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
  return Boolean(n && typeof n === 'object' && !Array.isArray(n) &&
    Object.keys(n).every((k) => ['id', 'codigo', 'importancia', 'agendamentoId', 'criadoEm', 'lidaEm', 'resolvidaEm'].includes(k)) &&
    typeof n.id === 'string' && UUID_ADMIN.test(n.id) && typeof n.codigo === 'string' && /^[a-z0-9-]{1,80}$/.test(n.codigo) &&
    ['informacao', 'atencao', 'critica'].includes(n.importancia) &&
    (n.agendamentoId === null || (typeof n.agendamentoId === 'string' && UUID_ADMIN.test(n.agendamentoId))) &&
    data(n.criadoEm) && (n.lidaEm === null || data(n.lidaEm)) && (n.resolvidaEm === null || data(n.resolvidaEm)));
}

export async function listarNotificacoesMarketing(antesDe?: { criadoEm: string; id: string }): Promise<RespostaAdmin<PaginaNotificacoes>> {
  const corpo: Record<string, unknown> = { recurso: 'marketing-notificacoes', filtro: 'todas' };
  if (antesDe) corpo.antesDe = antesDe;
  return chamarAdmin<PaginaNotificacoes>('admin-marketing', corpo, (dados) =>
    Boolean(dados && typeof dados === 'object' && Object.keys(dados).every((k) => ['notificacoes', 'naoLidas', 'proximaPagina'].includes(k)) &&
      Array.isArray(dados.notificacoes) && dados.notificacoes.length <= 50 && dados.notificacoes.every(notificacaoValida) &&
      Number.isSafeInteger(dados.naoLidas) && dados.naoLidas >= 0 &&
      (dados.proximaPagina === null || (dados.proximaPagina && typeof dados.proximaPagina.id === 'string' && UUID_ADMIN.test(dados.proximaPagina.id) &&
        typeof dados.proximaPagina.criadoEm === 'string' && Number.isFinite(Date.parse(dados.proximaPagina.criadoEm))))));
}

// Marcar como lida é independente de resolver. O servidor aceita de 1 a 50 ids por pedido e só
// grava o que ainda não estava lido; repetir é inofensivo.
export async function marcarNotificacoesLidas(ids: string[]): Promise<RespostaAdmin<{ atualizados: number }>> {
  return chamarAdmin<{ atualizados: number }>('admin-marketing', { recurso: 'marketing-ler', ids }, (dados) =>
    Boolean(dados && typeof dados === 'object' && Object.keys(dados).every((k) => k === 'atualizados') &&
      Number.isSafeInteger(dados.atualizados) && dados.atualizados >= 0 && dados.atualizados <= ids.length));
}

async function chamarAdmin<T>(funcao: 'admin-consulta' | 'admin-feedbacks' | 'admin-ajustes' | 'admin-marketing', corpo: Record<string, unknown>, validar: (dados: any) => boolean): Promise<RespostaAdmin<T>> {
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
