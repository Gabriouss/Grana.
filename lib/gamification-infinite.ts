/**
 * Level Up Infinito — Épico 1 do PLANO_DE_EVOLUCAO.md.
 *
 * Sistema separado do Score Grana (lib/gamification.ts, 0-1000 pontos,
 * recalculado do zero a cada carregamento). Aqui o XP é vitalício: nunca
 * diminui, é acumulado no banco (tabela user_gamification, via a função
 * add_xp em supabase/schema.sql) e nunca reseta. O nível não tem teto.
 */

/**
 * `icone` é um nome do Ionicons, não emoji.
 *
 * Emoji fazendo papel de sistema de ícones é justamente o que o DESIGN.md pede
 * para evitar, e o desenho de cada um muda conforme o sistema operacional de
 * quem olha: a mesma tela vira outra coisa entre um iPhone e um Android. Com
 * ícone desenhado, o traço é o mesmo do resto do app e a cor é do tema.
 */
export type Elo = { key: string; title: string; minLevel: number; icone: string };

export const ELOS: Elo[] = [
  { key: 'aprendiz', title: 'Aprendiz', minLevel: 1, icone: 'leaf-outline' },
  { key: 'construtor', title: 'Construtor', minLevel: 5, icone: 'construct-outline' },
  { key: 'gestor', title: 'Gestor', minLevel: 10, icone: 'bar-chart-outline' },
  { key: 'estrategista', title: 'Estrategista', minLevel: 16, icone: 'compass-outline' },
  { key: 'mestre', title: 'Mestre', minLevel: 24, icone: 'ribbon-outline' },
  { key: 'grao_mestre', title: 'Grão-Mestre', minLevel: 34, icone: 'diamond-outline' },
  { key: 'lenda', title: 'Lenda Financeira', minLevel: 46, icone: 'sparkles-outline' },
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
