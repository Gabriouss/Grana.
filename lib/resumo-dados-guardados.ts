import { supabase } from './supabase';

export type ResumoDadosGuardados = { lancamentos: number; contas: number; cartoes: number; metas: number };
const CAMPOS = ['lancamentos', 'contas', 'cartoes', 'metas'] as const;

/** Resumo opcional da própria conta; indisponibilidade nunca vira zero nem concessão de acesso. */
export async function obterResumoDadosGuardados(): Promise<ResumoDadosGuardados | null> {
  try {
    const { data, error } = await supabase.rpc('resumo_dados_guardados');
    if (error) {
      // PGRST202: o app novo também funciona antes da publicação desta RPC aditiva.
      console.warn('[assinatura] resumo de dados guardados indisponível', { codigo: error.code ?? 'rpc-falhou' });
      return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || Object.keys(data).length !== CAMPOS.length
      || !CAMPOS.every(campo => Number.isSafeInteger((data as Record<string, unknown>)[campo]) && Number((data as Record<string, unknown>)[campo]) >= 0)) {
      console.warn('[assinatura] resumo de dados guardados inválido');
      return null;
    }
    return data as unknown as ResumoDadosGuardados;
  } catch {
    console.warn('[assinatura] não foi possível consultar os dados guardados');
    return null;
  }
}
