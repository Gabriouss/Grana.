import { supabase } from './supabase';
import type { Goal } from './types';

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Usuário não autenticado');
  return data.user.id;
}

export async function fetchGoals(): Promise<Goal[]> {
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
  return data as unknown as Goal;
}

export async function deleteGoal(id: string): Promise<void> {
  const user_id = await currentUserId();
  const { error } = await supabase.from('goals').delete().eq('id', id).eq('user_id', user_id);
  if (error) throw error;
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
  return data as unknown as Goal;
}

export async function fetchGamification(): Promise<{ lifetime_xp: number; streak_shields: number }> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('user_gamification')
    .select('lifetime_xp, streak_shields')
    .eq('user_id', user_id)
    .maybeSingle();
  if (error) throw error;
  return data ?? { lifetime_xp: 0, streak_shields: 2 };
}

