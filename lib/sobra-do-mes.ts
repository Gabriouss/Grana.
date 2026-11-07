import { supabase } from './supabase';
import { idDoUsuarioLocal } from './sessao-offline';

/**
 * Sobra do mês anterior confirmada pela pessoa (Adendo 2 do autor, 07/11/2026,
 * regra 20). Tabela `sobra_do_mes`, migration 20261107120000 (NÃO aplicada até
 * o roteiro de implantação). Início e widgets leem daqui; o Granabô lê a mesma
 * tabela no servidor.
 *
 * Três estados, decididos de forma explícita (regra 9, sem `catch` que vira
 * estado benigno em silêncio):
 * - `confirmada`: há linha do mês; o valor entra no Livre.
 * - `pendente`: não há linha; sobra zero e a Início pergunta.
 * - `desligada`: a tabela ainda não existe em produção (PGRST205/42P01);
 *   sobra zero e NENHUMA pergunta, porque gravar falharia sempre. Fica no log.
 * Qualquer outro erro sobe para quem chamou, que mostra recibo.
 */
export type EstadoSobra =
  | { estado: 'confirmada'; mes: string; valor: number }
  | { estado: 'pendente'; mes: string }
  | { estado: 'desligada'; mes: string };

const TABELA_AUSENTE = new Set(['PGRST205', '42P01']);

export function tabelaDaSobraAusente(erro: { code?: string } | null | undefined): boolean {
  return !!erro?.code && TABELA_AUSENTE.has(erro.code);
}

export async function buscarSobraDoMes(mes: string): Promise<EstadoSobra> {
  const { data, error } = await supabase.from('sobra_do_mes').select('valor').eq('mes', mes).maybeSingle();
  if (error) {
    if (tabelaDaSobraAusente(error)) {
      console.warn('[sobra-do-mes] tabela sobra_do_mes ainda não existe no servidor; sobra fica zero');
      return { estado: 'desligada', mes };
    }
    throw error;
  }
  if (!data) return { estado: 'pendente', mes };
  return { estado: 'confirmada', mes, valor: Number(data.valor) };
}

/** Valor que entra no cálculo: só o confirmado. */
export function sobraParaOLivre(estado: EstadoSobra | null): number {
  return estado?.estado === 'confirmada' ? estado.valor : 0;
}

export async function confirmarSobraDoMes(mes: string, valor: number): Promise<void> {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor de sobra inválido');
  const userId = await idDoUsuarioLocal();
  if (!userId) throw new Error('Sessão indisponível para confirmar a sobra');
  const { error } = await supabase
    .from('sobra_do_mes')
    .upsert({ user_id: userId, mes, valor: Math.round(valor * 100) / 100 }, { onConflict: 'user_id,mes' });
  if (error) throw error;
}
