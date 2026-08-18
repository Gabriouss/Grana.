/**
 * Level Up Infinito — Épico 1 do PLANO_DE_EVOLUCAO.md.
 *
 * Sistema separado do Score Grana (lib/gamification.ts, 0-1000 pontos,
 * recalculado do zero a cada carregamento). Aqui o XP é vitalício: nunca
 * diminui, é acumulado no banco (tabela user_gamification, via a função
 * add_xp em supabase/schema.sql) e nunca reseta. O nível não tem teto.
 */

export type Elo = { key: string; title: string; minLevel: number; emoji: string };

export const ELOS: Elo[] = [
  { key: 'aprendiz', title: 'Aprendiz', minLevel: 1, emoji: '🌱' },
  { key: 'construtor', title: 'Construtor', minLevel: 5, emoji: '🧱' },
  { key: 'gestor', title: 'Gestor', minLevel: 10, emoji: '📊' },
  { key: 'estrategista', title: 'Estrategista', minLevel: 16, emoji: '♟️' },
  { key: 'mestre', title: 'Mestre', minLevel: 24, emoji: '🏆' },
  { key: 'grao_mestre', title: 'Grão-Mestre', minLevel: 34, emoji: '💠' },
  { key: 'lenda', title: 'Lenda Financeira', minLevel: 46, emoji: '👑' },
];

/** Level = ⌊(XP / 100) ^ (1/1.4)⌋ + 1 — curva de progressão do PLANO_DE_EVOLUCAO.md. */
export function calcularLevel(xp: number): number {
  const xpSeguro = Math.max(0, xp);
  return Math.floor(Math.pow(xpSeguro / 100, 1 / 1.4)) + 1;
}

/** Inversa de calcularLevel: quanto XP é necessário para alcançar um nível. */
export function xpParaLevel(level: number): number {
  return Math.round(100 * Math.pow(Math.max(0, level - 1), 1.4));
}

export function calcularElo(level: number): Elo {
  let atual = ELOS[0];
  for (const elo of ELOS) {
    if (level >= elo.minLevel) atual = elo;
  }
  return atual;
}

export function proximoElo(eloAtual: Elo): Elo | null {
  const idx = ELOS.findIndex((e) => e.key === eloAtual.key);
  return idx >= 0 && idx < ELOS.length - 1 ? ELOS[idx + 1] : null;
}

export type LevelState = {
  xp: number;
  level: number;
  elo: Elo;
  nextElo: Elo | null;
  xpAtualNoLevel: number;
  xpParaProximoLevel: number;
  progressoLevel: number; // 0 a 1
};

export function calcularLevelState(xp: number): LevelState {
  const level = calcularLevel(xp);
  const xpDesteLevel = xpParaLevel(level);
  const xpProximoLevel = xpParaLevel(level + 1);
  const faixa = xpProximoLevel - xpDesteLevel;
  const progresso = faixa > 0 ? Math.min(1, Math.max(0, (xp - xpDesteLevel) / faixa)) : 1;
  const elo = calcularElo(level);

  return {
    xp,
    level,
    elo,
    nextElo: proximoElo(elo),
    xpAtualNoLevel: Math.max(0, xp - xpDesteLevel),
    xpParaProximoLevel: faixa,
    progressoLevel: progresso,
  };
}
