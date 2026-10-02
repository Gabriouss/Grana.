import { supabase } from './supabase';
import { comCacheOffline, invalidarRespostasAtrasadas } from './cache-de-tela';
import { idDoUsuarioLocal } from './sessao-offline';
import type { Goal } from './types';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';

// Pelo aparelho, não pela rede — mesmo motivo detalhado em `lib/data.ts`.
async function currentUserId(): Promise<string> {
  const id = await idDoUsuarioLocal();
  if (!id) throw new Error('Usuário não autenticado');
  return id;
}

async function buscar_fetchGoals(): Promise<Goal[]> {
  const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createGoal(input: {
  title: string;
  target_amount: number;
  color: string;
  icon: string;
  deadline?: string | null;
  wallet_id?: string | null;
}): Promise<Goal> {
  const { data, error } = await supabase.rpc('criar_meta', {
    p_title: input.title,
    p_target_amount: input.target_amount,
    p_color: input.color,
    p_icon: input.icon,
    p_deadline: input.deadline ?? null,
    p_wallet_id: input.wallet_id ?? null,
  });
  if (error) throw error;
  invalidarRespostasAtrasadas();
  notificarDadosDosWidgetsAlterados();
  return data as unknown as Goal;
}

/**
 * A meta guardada sem rede já foi gravada por uma tentativa anterior?
 *
 * `criar_meta` não tem chave de idempotência (isso pediria migration). Quando
 * a tentativa chegou ao banco e a resposta, ou a gravação local que tira o item
 * da fila, se perdeu, o reenvio criaria a meta de novo. Esta consulta procura
 * uma meta igual criada DEPOIS do carimbo da tentativa (`tentadoEm`), então não
 * confunde com uma meta antiga igual nem com a de outro item da fila.
 */
export async function metaJaGravada(input: {
  title: string;
  target_amount: number;
  color: string;
  icon: string;
  deadline?: string | null;
  wallet_id?: string | null;
}, desde: string): Promise<boolean> {
  let q = supabase
    .from('goals')
    .select('id')
    .eq('title', input.title)
    .eq('target_amount', input.target_amount)
    .eq('color', input.color)
    .eq('icon', input.icon)
    .gte('created_at', desde);
  q = input.deadline ? q.eq('deadline', input.deadline) : q.is('deadline', null);
  q = input.wallet_id ? q.eq('wallet_id', input.wallet_id) : q.is('wallet_id', null);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function deleteGoal(id: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
  invalidarRespostasAtrasadas();
  notificarDadosDosWidgetsAlterados();
}

export async function updateGoal(
  id: string,
  input: { title: string; target_amount: number; color: string; icon: string; deadline?: string | null }
): Promise<Goal> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('goals')
    .update({
      title: input.title,
      target_amount: input.target_amount,
      color: input.color,
      icon: input.icon,
      deadline: input.deadline ?? null,
    })
    .eq('id', id)
    .eq('user_id', user_id)
    .select('*')
    .single();
  if (error) throw error;
  invalidarRespostasAtrasadas();
  notificarDadosDosWidgetsAlterados();
  return data as Goal;
}

/**
 * Aporta ou resgata valor de um cofrinho. `delta` positivo guarda, negativo
 * resgata — o saldo nunca fica negativo (limite aplicado tanto aqui quanto
 * pelo CHECK da tabela). Concede XP proporcional ao valor guardado (nunca a
 * resgates) e um bônus único na primeira vez que a meta é batida.
 */
export async function depositToGoal(goal: Goal, delta: number): Promise<Goal> {
  const { data, error } = await supabase.rpc('deposit_to_goal', {
    p_goal_id: goal.id,
    p_delta: delta,
  });
  if (error) throw error;
  invalidarRespostasAtrasadas();
  notificarDadosDosWidgetsAlterados();
  return data as unknown as Goal;
}

async function buscar_fetchGamification(): Promise<{ lifetime_xp: number; streak_shields: number }> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('user_gamification')
    .select('lifetime_xp, streak_shields')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw error;
  return data ?? { lifetime_xp: 0, streak_shields: 2 };
}

/* ── Cache offline ─────────────────────────────────────────────────────────
   Os buscadores acima viraram privados e saem daqui envolvidos: gravam o que
   trouxeram e devolvem o guardado quando a REDE falha. A assinatura não muda,
   então nenhum dos 43 pontos de chamada precisou ser tocado.

   Erro que NÃO é de rede continua estourando — ver o comentário longo em
   `lib/cache-de-tela.ts` sobre a regra 9 do AGENTS.md. */
export const fetchGoals = comCacheOffline('metas', buscar_fetchGoals);
export const fetchGamification = comCacheOffline('gamificacao', buscar_fetchGamification);
