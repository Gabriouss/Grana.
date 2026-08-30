/* Sequência de dias e ritmo da semana — o número mais carregado do app.
 *
 * Este corpus nasceu de dois defeitos que a auditoria de comportamento
 * encontrou, e cada um tem caso próprio aqui:
 *
 * 1. O laço comparava datas em UTC com um "hoje" em horário local. No Brasil,
 *    das 21h à meia-noite, ele procurava o dia seguinte, não achava e saía na
 *    primeira volta: quem tinha 30 dias seguidos via ZERO. O Score caía 200
 *    pontos, o elo descia um degrau e as quatro medalhas de sequência
 *    travavam juntas, todas as noites, dentro da janela em que dois dos três
 *    horários de lembrete disparam.
 *
 * 2. A sequência contava o dia do GASTO e não o do REGISTRO. Quem passava o
 *    domingo sem gastar perdia a sequência mesmo tendo registrado, e importar
 *    um extrato com dois meses de compras inflava a sequência para sessenta
 *    dias sem hábito nenhum.
 *
 * O fuso é fixado em São Paulo porque o defeito só aparece em fuso negativo,
 * e é o fuso de quem usa o produto.
 */
process.env.TZ = 'America/Sao_Paulo';

import { calculateStreakAndWeek } from '../lib/gamification';
import { isoLocal } from '../lib/format';
import type { Transaction } from '../lib/types';

let total = 0;
let falhas = 0;

function checar(nome: string, recebido: unknown, esperado: unknown) {
  total += 1;
  if (JSON.stringify(recebido) !== JSON.stringify(esperado)) {
    falhas += 1;
    console.log(`  FALHA  ${nome}\n         esperado: ${JSON.stringify(esperado)}\n         recebido: ${JSON.stringify(recebido)}`);
  }
}

/** Lançamento registrado em `registradoEm` (hora local), referente a `gastoEm`. */
function tx(registradoEm: string, gastoEm?: string): Transaction {
  const quando = new Date(registradoEm);
  return {
    id: registradoEm, user_id: 'u', type: 'out', description: 'x', amount: 10,
    category: 'Outros', color: '#8b9198', occurred_on: gastoEm ?? isoLocal(quando),
    recurring: false, parent_id: null, created_at: quando.toISOString(),
  } as Transaction;
}

/** Um registro por dia, nos últimos `n` dias, sempre às 12h local. */
function registrouTodoDia(n: number, ate: string): Transaction[] {
  const fim = new Date(ate);
  const lista: Transaction[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(fim);
    d.setDate(d.getDate() - i);
    lista.push(tx(`${isoLocal(d)}T12:00:00-03:00`));
  }
  return lista;
}

// ── 1. O defeito das 21h ───────────────────────────────────────────────────
{
  const dez = registrouTodoDia(10, '2026-08-30T12:00:00-03:00');
  for (const hora of ['09:00', '18:00', '20:59', '21:00', '22:30', '23:59']) {
    const agora = new Date(`2026-08-30T${hora}:00-03:00`);
    checar(`sequência às ${hora} continua 10`, calculateStreakAndWeek(dez, agora).streak, 10);
  }
}

// ── 2. Conta o dia do REGISTRO, não o do gasto ─────────────────────────────
{
  // Registrou hoje e ontem, mas os gastos são de meses atrás.
  const retroativos = [
    tx('2026-08-30T20:00:00-03:00', '2026-06-01'),
    tx('2026-08-29T20:00:00-03:00', '2026-05-14'),
  ];
  checar(
    'registrar hoje conta hoje, mesmo que o gasto seja antigo',
    calculateStreakAndWeek(retroativos, new Date('2026-08-30T22:00:00-03:00')).streak,
    2
  );

  // Importação de extrato: 60 compras de datas variadas, todas registradas hoje.
  const importadas: Transaction[] = [];
  for (let i = 0; i < 60; i++) {
    const gasto = new Date('2026-08-29T12:00:00-03:00');
    gasto.setDate(gasto.getDate() - i);
    importadas.push(tx('2026-08-30T15:00:00-03:00', isoLocal(gasto)));
  }
  checar(
    'importar 60 compras de uma vez vale 1 dia de sequência, não 60',
    calculateStreakAndWeek(importadas, new Date('2026-08-30T16:00:00-03:00')).streak,
    1
  );
}

// ── 3. Regras que já valiam e não podem regredir ───────────────────────────
{
  const vazio = calculateStreakAndWeek([], new Date('2026-08-30T10:00:00-03:00'));
  checar('sem lançamento nenhum, sequência é zero', vazio.streak, 0);
  checar('a semana tem sempre sete dias', vazio.weekActivity.length, 7);
  checar('a semana começa na segunda', vazio.weekActivity[0].dayName, 'Seg');

  // Ainda não registrou hoje, mas registrou ontem e anteontem: a sequência viva
  // continua contando, para o dia não começar valendo zero.
  const ontemEAnteontem = [
    tx('2026-08-29T19:00:00-03:00'),
    tx('2026-08-28T19:00:00-03:00'),
  ];
  checar(
    'sem registro hoje, a sequência de ontem continua de pé',
    calculateStreakAndWeek(ontemEAnteontem, new Date('2026-08-30T10:00:00-03:00')).streak,
    2
  );

  // Um dia sem registrar quebra a corrente.
  const comBuraco = [
    tx('2026-08-30T19:00:00-03:00'),
    tx('2026-08-28T19:00:00-03:00'),
    tx('2026-08-27T19:00:00-03:00'),
  ];
  checar(
    'um dia sem registrar quebra a sequência',
    calculateStreakAndWeek(comBuraco, new Date('2026-08-30T20:00:00-03:00')).streak,
    1
  );

  // Vários registros no mesmo dia contam uma vez só.
  const tresNoMesmoDia = [
    tx('2026-08-30T08:00:00-03:00'),
    tx('2026-08-30T13:00:00-03:00'),
    tx('2026-08-30T21:40:00-03:00'),
  ];
  checar(
    'três registros no mesmo dia valem um dia',
    calculateStreakAndWeek(tresNoMesmoDia, new Date('2026-08-30T22:00:00-03:00')).streak,
    1
  );
}

// ── 4. O ritmo da semana marca o dia certo, inclusive à noite ──────────────
{
  const dez = registrouTodoDia(10, '2026-08-30T12:00:00-03:00');
  for (const hora of ['15:00', '22:30']) {
    const semana = calculateStreakAndWeek(dez, new Date(`2026-08-30T${hora}:00-03:00`)).weekActivity;
    const hoje = semana.filter((d) => d.isToday);
    checar(`às ${hora}, exatamente um dia marcado como hoje`, hoje.length, 1);
    checar(`às ${hora}, o dia de hoje aparece como registrado`, hoje[0]?.active, true);
    checar(`às ${hora}, hoje é ${isoLocal(new Date('2026-08-30T12:00:00-03:00'))}`, hoje[0]?.dateISO, '2026-08-30');
  }
}

console.log(`\n${total - falhas}/${total} checagens de sequência passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
