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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const trabalho = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw reciboLocal('nao-autenticado', 'Sua sessão terminou. Entre novamente.');
    if (controller.signal.aborted) throw reciboLocal('prazo', 'A consulta demorou demais. Tente de novo.');
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-consulta`, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurso }),
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) {
      const codigos = ['limite', 'nao-autenticado', 'nao-autorizado', 'mfa-necessario', 'nao-configurado', 'prazo', 'origem-recusada', 'metodo-invalido', 'corpo-grande', 'pedido-invalido'];
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
    if (body.contrato !== 1 || typeof body.geradoEm !== 'string' || !Number.isFinite(Date.parse(body.geradoEm)) || !validarDados(recurso, body.dados)) {
      throw reciboLocal('resposta-invalida', 'O servidor devolveu uma resposta incompatível. Tente de novo.');
    }
    if (recurso === 'visao-geral') {
      // Um bloco indisponível não transporta conteúdo residual do servidor.
      for (const nome of Object.keys(body.dados)) {
        if (body.dados[nome].indisponivel === true) body.dados[nome] = { indisponivel: true };
      }
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
