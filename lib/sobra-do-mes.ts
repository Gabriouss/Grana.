import { supabase } from './supabase';
import { idDoUsuarioLocal } from './sessao-offline';
import type { Wallet } from './types';

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
export type EstadoSobra = { userId: string } & (
  | { estado: 'confirmada'; mes: string; valor: number }
  | { estado: 'pendente'; mes: string }
  | { estado: 'desligada'; mes: string });

export function mesLocalDaSobra(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

const TABELA_AUSENTE = new Set(['PGRST205', '42P01']);

export function tabelaDaSobraAusente(erro: { code?: string } | null | undefined): boolean {
  return !!erro?.code && TABELA_AUSENTE.has(erro.code);
}

export async function buscarSobraDoMes(mes: string, userId: string): Promise<EstadoSobra> {
  if (!userId || await idDoUsuarioLocal() !== userId) throw new Error('A conta mudou. Atualize a Início.');
  const { data, error } = await supabase.from('sobra_do_mes').select('valor').eq('mes', mes).eq('user_id', userId).maybeSingle();
  if (error) {
    if (tabelaDaSobraAusente(error)) {
      console.warn('[sobra-do-mes] tabela sobra_do_mes ainda não existe no servidor; sobra fica zero');
      return { estado: 'desligada', mes, userId };
    }
    throw error;
  }
  if (!data) return { estado: 'pendente', mes, userId };
  return { estado: 'confirmada', mes, userId, valor: Number(data.valor) };
}

/** Mesma identidade de preencher_wallet_padrao: default do próprio dono. */
export function carteiraPrincipalDaSobra(wallets: Wallet[], userId: string | null | undefined): string | null {
  if (!userId) return null;
  return wallets.filter((w) => w.user_id === userId && w.is_default)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]?.id ?? null;
}

export function carteiraRecebeSobra(carteiraId: string, principalId: string | null): boolean {
  return carteiraId === 'total' || (principalId !== null && carteiraId === principalId);
}

/** Sobra pertence à Principal; Total a inclui uma vez (também nos widgets). */
export function sobraParaOLivre(
  estado: EstadoSobra | null, userId: string | null | undefined, mes: string,
  carteiraId = 'total', principalId: string | null = null,
): number {
  return carteiraRecebeSobra(carteiraId, principalId) && userId && estado?.userId === userId && estado.mes === mes && estado.estado === 'confirmada'
    && Number.isFinite(estado.valor) && estado.valor >= 0 ? estado.valor : 0;
}

/**
 * Sobra no "Saldo do mês" de Lançamentos (pedido do autor, 20/11/2026: "precisa
 * entrar na conta do débito também"). É o MESMO valor de `sobraParaOLivre`, sem
 * segunda fonte: entra uma vez, só no mês dela, na Principal e no Total. Com
 * busca ou categoria o resumo soma só as linhas visíveis, e a sobra fica fora.
 * Sem valor conhecido (erro sem nada guardado no aparelho) o saldo segue com
 * entradas − saídas, nunca travessão, e a situação diz à tela qual linha
 * mostrar (Supremo, 20/11/2026).
 */
export type SobraNoSaldo = { valor: number; situacao: 'nenhuma' | 'inclui' | 'sem-conexao' | 'indisponivel' };

export function sobraNoSaldoDoMes(f: {
  estado: EstadoSobra | null; userId: string | null | undefined; mes: string; mesAtual: string;
  carteiraId: string; principalId: string | null; filtrado: boolean; carregando: boolean; erro: boolean; semConexao: boolean;
}): SobraNoSaldo {
  if (f.filtrado || f.mes !== f.mesAtual || !carteiraRecebeSobra(f.carteiraId, f.principalId) || f.carregando) return { valor: 0, situacao: 'nenhuma' };
  if (f.erro) return { valor: 0, situacao: f.semConexao ? 'sem-conexao' : 'indisponivel' };
  const valor = sobraParaOLivre(f.estado, f.userId, f.mes, f.carteiraId, f.principalId);
  return { valor, situacao: valor > 0 ? 'inclui' : 'nenhuma' };
}

export async function confirmarSobraDoMes(mes: string, valor: number, userId: string): Promise<void> {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor de sobra inválido');
  if (!userId || await idDoUsuarioLocal() !== userId) throw new Error('A conta mudou. Atualize a Início.');
  if (mes !== mesLocalDaSobra()) throw new Error('O mês mudou. Confira a sobra do mês atual.');
  const { error } = await supabase
    .from('sobra_do_mes')
    .upsert({ user_id: userId, mes, valor: Math.round(valor * 100) / 100 }, { onConflict: 'user_id,mes' });
  if (error) throw error;
}
