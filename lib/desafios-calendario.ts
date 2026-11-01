/**
 * Calendário de constância dos Desafios (fase 2): só funções puras.
 *
 * Qual dia conta: o dia LOCAL de `created_at`, a mesma régua da sequência
 * (`diasComRegistro`, em gamification.ts). A conta de fuso mora em `isoLocal`;
 * aqui nunca se usa `toISOString().slice(0, 10)` para decidir um dia.
 *
 * Mês é sempre 0-indexado, como em `Date`.
 */
import { isoLocal } from './format';

/** Quantos meses para trás o calendário deixa navegar. */
export const MESES_PARA_TRAS = 12;
/** Meses (atual + anteriores) olhados pelo "Mês completo". */
export const MESES_DO_MES_COMPLETO = 3;

export type CelulaDoCalendario = {
  dia: number;
  iso: string;
  /** Houve registro neste dia. */
  registro: boolean;
  /** Dia depois de hoje (só existe no mês atual). */
  futuro: boolean;
  hoje: boolean;
};

export type CalendarioDoMes = {
  ano: number;
  mes: number;
  /** Semanas de segunda a domingo; `null` completa as pontas do mês. */
  semanas: (CelulaDoCalendario | null)[][];
  /** Dias do mês já vividos (mês atual: até hoje; mês passado: todos). */
  diasVividos: number;
  /** Dias já vividos com registro. */
  diasComRegistro: number;
  /** "N de M dias com registro". */
  resumo: string;
};

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate();
}

function isoDoDia(ano: number, mes: number, dia: number): string {
  return isoLocal(new Date(ano, mes, dia));
}

/** Início do mês local e início do seguinte, em ISO (UTC), para filtrar `created_at`. */
export function limitesDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  return {
    inicio: new Date(ano, mes, 1).toISOString(),
    fim: new Date(ano, mes + 1, 1).toISOString(),
  };
}

/** Mês anterior (`delta` -1) ou seguinte (+1), com a virada de ano. */
export function deslocarMes(ano: number, mes: number, delta: number): { ano: number; mes: number } {
  const d = new Date(ano, mes + delta, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

function indiceDoMes(ano: number, mes: number): number {
  return ano * 12 + mes;
}

/** Dentro do limite: do mês atual até 12 meses para trás, nunca além do atual. */
export function mesNavegavel(ano: number, mes: number, hoje: Date): boolean {
  const atual = indiceDoMes(hoje.getFullYear(), hoje.getMonth());
  const alvo = indiceDoMes(ano, mes);
  return alvo <= atual && alvo >= atual - MESES_PARA_TRAS;
}

export function podeIrParaMesAnterior(ano: number, mes: number, hoje: Date): boolean {
  const a = deslocarMes(ano, mes, -1);
  return mesNavegavel(a.ano, a.mes, hoje);
}

export function podeIrParaProximoMes(ano: number, mes: number, hoje: Date): boolean {
  const p = deslocarMes(ano, mes, 1);
  return mesNavegavel(p.ano, p.mes, hoje);
}

export function montarCalendario(
  dias: ReadonlySet<string>,
  ano: number,
  mes: number,
  hoje: Date = new Date()
): CalendarioDoMes {
  const total = diasNoMes(ano, mes);
  const hojeISO = isoLocal(hoje);
  const primeiro = new Date(ano, mes, 1).getDay(); // 0 = domingo
  const recuo = (primeiro + 6) % 7; // semana começa na segunda

  const celulas: (CelulaDoCalendario | null)[] = Array.from({ length: recuo }, () => null);
  let vividos = 0;
  let comRegistro = 0;
  for (let dia = 1; dia <= total; dia++) {
    const iso = isoDoDia(ano, mes, dia);
    const futuro = iso > hojeISO;
    const registro = !futuro && dias.has(iso);
    if (!futuro) vividos += 1;
    if (registro) comRegistro += 1;
    celulas.push({ dia, iso, registro, futuro, hoje: iso === hojeISO });
  }
  while (celulas.length % 7 !== 0) celulas.push(null);

  const semanas: (CelulaDoCalendario | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));

  return {
    ano,
    mes,
    semanas,
    diasVividos: vividos,
    diasComRegistro: comRegistro,
    resumo: `${comRegistro} de ${vividos} ${vividos === 1 ? 'dia' : 'dias'} com registro`,
  };
}

/**
 * O mês inteiro tem registro, do dia 1 ao último, e o último dia já chegou.
 * Mês futuro nunca está completo.
 */
export function mesCompleto(dias: ReadonlySet<string>, ano: number, mes: number, hoje: Date = new Date()): boolean {
  const total = diasNoMes(ano, mes);
  if (isoLocal(hoje) < isoDoDia(ano, mes, total)) return false;
  for (let dia = 1; dia <= total; dia++) {
    if (!dias.has(isoDoDia(ano, mes, dia))) return false;
  }
  return true;
}

/** Algum dos meses olhados (atual e 2 anteriores) está completo. */
export function algumMesCompleto(dias: ReadonlySet<string>, hoje: Date = new Date()): boolean {
  for (let i = 0; i < MESES_DO_MES_COMPLETO; i++) {
    const { ano, mes } = deslocarMes(hoje.getFullYear(), hoje.getMonth(), -i);
    if (mesCompleto(dias, ano, mes, hoje)) return true;
  }
  return false;
}
