import { supabase } from './supabase';
import { idDoUsuarioLocal } from './sessao-offline';
import { marcarLancamentosAlterados } from './lancamentos-alterados';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';
import type { Transaction, Wallet } from './types';

/**
 * Sobra do mês anterior confirmada pela pessoa (Adendo 2 do autor, 07/11/2026,
 * regra 20). Tabela `sobra_do_mes`, migration 20261107120000 (NÃO aplicada até
 * o roteiro de implantação). Início e widgets leem daqui; o Granabô lê a mesma
 * tabela no servidor.
 *
 * Três estados, decididos de forma explícita (regra 9, sem `catch` que vira
 * estado benigno em silêncio):
 * - `confirmada`: há linha do mês.
 * - `pendente`: não há linha; sobra zero e a Início pergunta.
 * - `desligada`: a tabela ainda não existe em produção (PGRST205/42P01);
 *   sobra zero e NENHUMA pergunta, porque gravar falharia sempre. Fica no log.
 * Qualquer outro erro sobe para quem chamou, que mostra recibo.
 *
 * Desde 21/11/2026 (plano da sobra como lançamento, migration 20261121120000)
 * a sobra confirmada é gravada como UM lançamento de entrada no dia 1, e a
 * linha só diz "pergunta respondida": `convertida`, `valor` 0 e
 * `transactionId` apontando para o lançamento. `valor` passa a ser só a sobra
 * LEGADA (linha gravada por cliente antigo, ainda não convertida), o único
 * valor que ainda entra no Livre por fora. As duas fontes nunca se somam: o
 * servidor zera `valor` ao converter.
 */
export type EstadoSobra = { userId: string } & (
  | { estado: 'confirmada'; mes: string; valor: number; convertida?: boolean; transactionId?: string | null }
  | { estado: 'pendente'; mes: string }
  | { estado: 'desligada'; mes: string });

export function mesLocalDaSobra(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

const TABELA_AUSENTE = new Set(['PGRST205', '42P01']);
/* Coluna nova ausente: servidor ainda sem a migration 20261121120000. */
const COLUNA_AUSENTE = new Set(['42703', 'PGRST204']);
/* RPC ausente: mesma situação, do lado da função. */
const FUNCAO_AUSENTE = 'PGRST202';

export function tabelaDaSobraAusente(erro: { code?: string } | null | undefined): boolean {
  return !!erro?.code && TABELA_AUSENTE.has(erro.code);
}

type LinhaSobra = { valor: number | string; transaction_id?: string | null; convertida?: boolean | null };

async function lerLinha(mes: string, userId: string) {
  const r = await supabase.from('sobra_do_mes').select('valor, transaction_id, convertida').eq('mes', mes).eq('user_id', userId).maybeSingle();
  if (!r.error || !COLUNA_AUSENTE.has(r.error.code ?? '')) return r;
  /* Antes da migration o modelo antigo continua valendo inteiro: lê só o valor. */
  console.warn('[sobra-do-mes] servidor sem as colunas da sobra como lançamento; lendo o modelo antigo');
  return supabase.from('sobra_do_mes').select('valor').eq('mes', mes).eq('user_id', userId).maybeSingle();
}

export async function buscarSobraDoMes(mes: string, userId: string): Promise<EstadoSobra> {
  if (!userId || await idDoUsuarioLocal() !== userId) throw new Error('A conta mudou. Atualize a Início.');
  const { data, error } = await lerLinha(mes, userId);
  if (error) {
    if (tabelaDaSobraAusente(error)) {
      console.warn('[sobra-do-mes] tabela sobra_do_mes ainda não existe no servidor; sobra fica zero');
      return { estado: 'desligada', mes, userId };
    }
    throw error;
  }
  if (!data) return { estado: 'pendente', mes, userId };
  const linha = data as LinhaSobra;
  /* Sem a coluna (servidor antigo) fica indefinida: não é legada a converter. */
  const convertida = linha.convertida == null ? undefined : linha.convertida === true;
  return {
    estado: 'confirmada', mes, userId,
    valor: convertida ? 0 : Number(linha.valor),
    convertida, transactionId: linha.transaction_id ?? null,
  };
}

/** Linha gravada por cliente antigo, com valor e sem lançamento: o app novo a converte. */
export function sobraPrecisaConverter(estado: EstadoSobra | null): boolean {
  return estado?.estado === 'confirmada' && estado.convertida === false && Number.isFinite(estado.valor) && estado.valor > 0;
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

/** Sobra LEGADA que ainda entra por fora: Principal e Total (também nos widgets). */
export function sobraParaOLivre(
  estado: EstadoSobra | null, userId: string | null | undefined, mes: string,
  carteiraId = 'total', principalId: string | null = null,
): number {
  return carteiraRecebeSobra(carteiraId, principalId) && userId && estado?.userId === userId && estado.mes === mes && estado.estado === 'confirmada'
    && estado.convertida !== true && Number.isFinite(estado.valor) && estado.valor >= 0 ? estado.valor : 0;
}

/**
 * Sobra que já virou lançamento, para a linha "Inclui sobra" do Livre. Só o
 * lançamento LIGADO, de entrada, do mês corrente e presente nos lançamentos
 * da visão (a Início já filtra a carteira). Apagado some; editado mostra o
 * valor novo; movido para outro mês sai da linha.
 */
export function sobraLancadaNoMes(
  estado: EstadoSobra | null, lancamentosDaVisao: Pick<Transaction, 'id' | 'type' | 'amount' | 'occurred_on'>[],
  userId: string | null | undefined, mes: string,
): number {
  if (!userId || estado?.userId !== userId || estado.mes !== mes || estado.estado !== 'confirmada' || !estado.transactionId) return 0;
  const tx = lancamentosDaVisao.find((t) => t.id === estado.transactionId);
  if (!tx || tx.type !== 'in' || !String(tx.occurred_on).startsWith(mes + '-')) return 0;
  const valor = Number(tx.amount);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/**
 * Sobra no "Saldo do mês" de Lançamentos (pedido do autor, 20/11/2026: "precisa
 * entrar na conta do débito também"). É o MESMO valor de `sobraParaOLivre`, sem
 * segunda fonte: entra uma vez, só no mês dela, na Principal e no Total. Com
 * busca ou categoria o resumo soma só as linhas visíveis, e a sobra fica fora.
 * Sem valor conhecido (erro sem nada guardado no aparelho) o saldo segue com
 * entradas − saídas, nunca travessão, e a situação diz à tela qual linha
 * mostrar (Supremo, 20/11/2026). Desde 21/11 só a sobra legada passa por aqui:
 * a lançada já está nas entradas do mês.
 */
export type SobraNoSaldo = { valor: number; situacao: 'nenhuma' | 'inclui' | 'sem-conexao' | 'indisponivel' | 'atualizando' };

/** O lançamento ligado não está na lista da tela (use-sobra-do-mes, 22/11/2026). */
export type SobraForaDaLista = 'conferindo' | 'ausente' | null;

export function sobraNoSaldoDoMes(f: {
  estado: EstadoSobra | null; userId: string | null | undefined; mes: string; mesAtual: string;
  carteiraId: string; principalId: string | null; filtrado: boolean; carregando: boolean; erro: boolean; semConexao: boolean;
  foraDaLista?: SobraForaDaLista; listaOffline?: boolean;
}): SobraNoSaldo {
  if (f.filtrado || f.mes !== f.mesAtual || !carteiraRecebeSobra(f.carteiraId, f.principalId)) return { valor: 0, situacao: 'nenhuma' };
  /* A5: sem o ligado na lista o Saldo omite X, e diz isso. Com a lista atual, ele
     só mudou de mês: nada a avisar. */
  if (f.foraDaLista === 'conferindo') return { valor: 0, situacao: f.listaOffline ? 'sem-conexao' : 'atualizando' };
  if (f.foraDaLista === 'ausente' && f.listaOffline) return { valor: 0, situacao: 'sem-conexao' };
  if (f.erro) return { valor: 0, situacao: f.semConexao ? 'sem-conexao' : 'indisponivel' };
  const valor = sobraParaOLivre(f.estado, f.userId, f.mes, f.carteiraId, f.principalId);
  return { valor, situacao: valor > 0 ? 'inclui' : 'nenhuma' };
}

/**
 * Servidor ainda sem a RPC (PGRST202): a confirmação NÃO cai no upsert
 * antigo, que gravaria a sobra fora dos lançamentos. Vira recibo na tela.
 */
export class SobraServidorDesatualizado extends Error {
  constructor() {
    super('O servidor ainda não está pronto para guardar a sobra. Tente de novo mais tarde.');
    this.name = 'SobraServidorDesatualizado';
  }
}

type RespostaSobra = { estado: 'convertida' | 'pendente'; mes: string; transaction_id?: string | null };

async function chamarRpc(mes: string, valor: number | null): Promise<RespostaSobra> {
  const { data, error } = await supabase.rpc('confirmar_sobra_do_mes', { p_mes: mes, p_valor: valor });
  if (error) {
    if (error.code === FUNCAO_AUSENTE) throw new SobraServidorDesatualizado();
    throw error;
  }
  const r = data as RespostaSobra;
  /* Mesmo aviso de toda gravação em `transactions` (lib/data.ts); o cache de
     tela é invalidado por quem chama (use-sobra-do-mes), que já o importa. */
  if (r?.transaction_id) marcarLancamentosAlterados();
  notificarDadosDosWidgetsAlterados();
  return r;
}

/** Confirma a sobra: o servidor grava o lançamento e responde a pergunta numa transação só. */
export async function confirmarSobraDoMes(mes: string, valor: number, userId: string): Promise<{ transactionId: string | null }> {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('Valor de sobra inválido');
  if (!userId || await idDoUsuarioLocal() !== userId) throw new Error('A conta mudou. Atualize a Início.');
  if (mes !== mesLocalDaSobra()) throw new Error('O mês mudou. Confira a sobra do mês atual.');
  const r = await chamarRpc(mes, Math.round(valor * 100) / 100);
  return { transactionId: r?.transaction_id ?? null };
}

/**
 * Converte a linha legada (cliente antigo confirmou depois da migration).
 * `indisponivel`: servidor ainda sem a RPC; a legada continua contando uma vez
 * pela via antiga, e fica no log. Outros erros sobem.
 */
export async function converterSobraLegada(mes: string, userId: string): Promise<'convertida' | 'pendente' | 'indisponivel'> {
  if (!userId || await idDoUsuarioLocal() !== userId) throw new Error('A conta mudou. Atualize a Início.');
  try {
    return (await chamarRpc(mes, null)).estado;
  } catch (erro) {
    if (erro instanceof SobraServidorDesatualizado) {
      console.warn('[sobra-do-mes] servidor sem confirmar_sobra_do_mes; a sobra legada segue contando pelo modelo antigo');
      return 'indisponivel';
    }
    throw erro;
  }
}
