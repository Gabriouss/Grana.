import { supabase } from './supabase';
import type { Goal } from './types';

/* XP concedido por ações em cofrinhos — única fonte de XP vitalício
   implementada neste épico. Épicos futuros (streaks, projeções) devem somar
   novas fontes aqui, não substituir esta. */
const XP_NOVA_META = 25;
const XP_META_BATIDA = 150;
/** 1 XP a cada R$10 guardados, entre um piso e um teto por depósito. */
const XP_POR_DEPOSITO_MIN = 5;
const XP_POR_DEPOSITO_MAX = 200;

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
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from('goals')
    .insert({ ...input, user_id, deadline: input.deadline ?? null })
    .select()
    .single();
  if (error) throw error;
  await awardXp(XP_NOVA_META).catch(() => {});
  return data;
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
  const valorAtual = Number(goal.current_amount);
  const alvo = Number(goal.target_amount);
  const jaTinhaBatido = valorAtual >= alvo;

  const { data, error } = await supabase.rpc('deposit_to_goal', {
    p_goal_id: goal.id,
    p_delta: delta,
  });
  if (error) throw error;

  const novoValor = Number((data as Goal).current_amount);
  const bateAgora = novoValor >= alvo;

  if (delta > 0) {
    const xp = Math.min(XP_POR_DEPOSITO_MAX, Math.max(XP_POR_DEPOSITO_MIN, Math.round(delta / 10)));
    await awardXp(xp).catch(() => {});
  }
  if (bateAgora && !jaTinhaBatido) {
    await awardXp(XP_META_BATIDA).catch(() => {});
  }

  return data;
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

/** Concede XP de forma atômica via RPC (evita corrida entre depósitos quase simultâneos). Retorna o novo total. */
export async function awardXp(delta: number): Promise<number> {
  const { data, error } = await supabase.rpc('add_xp', { delta });
  if (error) throw error;
  return data as number;
}
