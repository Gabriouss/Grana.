/*
 * Desafios fase 2: "Mês completo", permanência do "Mês Verde" e títulos novos.
 *
 *   node __tests__/desafios-mes-completo.cjs
 *
 * Módulo real: lib/gamification.ts (e lib/desafios-calendario.ts).
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const { carregar } = require('./_carregar-ts.cjs');
const g = carregar('lib/gamification.ts');
const cal = carregar('lib/desafios-calendario.ts');

let n = 0;
const ok = (c, nome) => { assert.ok(c, nome); n++; console.log('  ok  ' + nome); };
const iso = (ano, mes, dia) => `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const mesInteiro = (ano, mes, ate) => {
  const dias = new Set();
  const total = ate ?? new Date(ano, mes + 1, 0).getDate();
  for (let d = 1; d <= total; d++) dias.add(iso(ano, mes, d));
  return dias;
};
const juntar = (...conjuntos) => new Set(conjuntos.flatMap((c) => [...c]));
const badges = (dias, ja = [], agora = new Date(2026, 9, 31, 22, 0)) =>
  g.evaluateBadges([], [], [], 0, undefined, ja, dias, agora);
const achar = (lista, id) => lista.find((b) => b.id === id);

// Mês completo: só com todos os dias
{
  const hoje = new Date(2026, 9, 31, 22, 0); // último dia de outubro
  ok(cal.mesCompleto(mesInteiro(2026, 9), 2026, 9, hoje), 'outubro inteiro, no dia 31: completo');
  const furado = mesInteiro(2026, 9); furado.delete('2026-10-17');
  ok(!cal.mesCompleto(furado, 2026, 9, hoje), 'falta o dia 17: não completo');
  ok(!cal.mesCompleto(mesInteiro(2026, 9, 30), 2026, 9, hoje), 'falta só o dia 31: não completo');
  ok(!cal.mesCompleto(mesInteiro(2026, 9), 2026, 9, new Date(2026, 9, 30, 23)), 'tudo registrado mas o mês ainda não acabou (dia 30): não desbloqueia');
  ok(achar(badges(mesInteiro(2026, 9)), 'full_month').unlocked === true, 'medalha "Mês completo" desbloqueada');
  ok(achar(badges(furado), 'full_month').unlocked === false, 'com furo, a medalha segue trancada');
  ok(achar(badges(new Set()), 'full_month').title === 'Mês completo', 'título "Mês completo"');
}
// Meses carregados: atual e 2 anteriores
{
  const hoje = new Date(2026, 9, 12);
  ok(cal.algumMesCompleto(mesInteiro(2026, 8), hoje), 'setembro completo (1 antes) vale');
  ok(cal.algumMesCompleto(mesInteiro(2026, 7), hoje), 'agosto completo (2 antes) vale');
  ok(!cal.algumMesCompleto(mesInteiro(2026, 6), hoje), 'julho (3 antes) não é olhado');
  ok(!cal.algumMesCompleto(juntar(mesInteiro(2026, 8, 29), mesInteiro(2026, 7, 30)), hoje), 'meses furados não valem');
}
// Fevereiro e virada de ano
ok(cal.mesCompleto(mesInteiro(2026, 1), 2026, 1, new Date(2026, 2, 1)), 'fevereiro de 28 dias completo');
ok(cal.mesCompleto(mesInteiro(2025, 11), 2025, 11, new Date(2026, 0, 2)), 'dezembro completo visto em janeiro');

// Permanência
{
  const comAntigo = badges(new Set(), ['superavit_month']);
  const mv = achar(comAntigo, 'superavit_month');
  ok(mv && mv.unlocked && mv.title === 'Mês Verde' && mv.description === 'Conquista de uma versão anterior.', 'quem já tem o Mês Verde continua vendo, com o texto de versão anterior');
  const semAntigo = badges(new Set());
  ok(achar(semAntigo, 'superavit_month') === undefined, 'quem não tem nunca vê o Mês Verde');
  ok(semAntigo.length + 1 === comAntigo.length, 'ela entra nos dois números "N de M" só para quem a tem');
  // pelo estado inteiro
  const comEstado = g.getGamificationState([], [], [], undefined, ['superavit_month'], { agora: new Date(2026, 9, 12) });
  const semEstado = g.getGamificationState([], [], [], undefined, [], { agora: new Date(2026, 9, 12) });
  ok(comEstado.totalBadgesCount === semEstado.totalBadgesCount + 1 && comEstado.unlockedBadgesCount === semEstado.unlockedBadgesCount + 1, 'getGamificationState: M e N consideram a medalha só para quem a tem');
  // superávit no mês não desbloqueia mais nada novo
  const rico = [{ id: 'a', type: 'in', amount: 9000, category: 'Salário', occurred_on: '2026-10-05', created_at: '2026-10-05T15:00:00Z' }];
  const novas = g.conquistasNovas(g.evaluateBadges(rico, [], [], 0, undefined, [], undefined, new Date(2026, 9, 12)), []);
  ok(!novas.some((b) => b.id === 'superavit_month'), 'superávit no mês não gera mais o Mês Verde para ninguém novo');
  // Mês completo uma vez conquistado não volta a trancar
  const perm = g.getGamificationState([], [], [], undefined, ['full_month'], { agora: new Date(2026, 9, 12), dias: new Set() });
  ok(achar(perm.badges, 'full_month').unlocked, 'Mês completo conquistado permanece');
}
// Ids não mudam e títulos novos
{
  const lista = badges(new Set());
  const titulos = { streak_7: 'Sete dias seguidos', streak_30: 'Trinta dias seguidos', centurion: 'Cem lançamentos', budget_planner: 'Três limites definidos',
    bill_payer: 'Cinco contas pagas', master_bills: 'Vinte contas pagas', savings_5k: 'Cinco mil em receitas', category_explorer: 'Cinco categorias' };
  for (const [id, t] of Object.entries(titulos)) ok(achar(lista, id)?.title === t, `${id}: "${t}"`);
  for (const id of ['first_step', 'streak_3', 'income_and_expense']) ok(achar(lista, id), `id ${id} permanece`);
  const antigos = ['Semana Blindada', 'Hábito Inquebrável', 'Centurião Financeiro', 'Arquiteto de Gastos', 'Pontualidade Britânica', 'Guardião dos Vencimentos', 'Primeira Fortaleza', 'Mapeador 360°'];
  ok(!lista.some((b) => antigos.includes(b.title)), 'nenhum título antigo no catálogo');
  ok(!lista.some((b) => /[—–]/.test(b.title + b.description)), 'sem travessão em título nem descrição');
  ok(!lista.some((b) => /\bnão é\b.*\bé\b/i.test(b.description)), 'sem "não é X, é Y" nas descrições');
}
console.log(`\n${n} verificações passaram.`);
