/*
 * Copy dos lembretes de hábito: fiel ao que o app sabe, curta e sem culpa
 * (rodada editorial de 24/09/2026, pelo briefing do Beacon).
 *
 *   node __tests__/catalogo-notificacoes-copy.cjs
 *
 * O seletor escolhe a mensagem por contexto (dias sem registrar, dia da
 * semana, sequência, janela), mas não sabe se houve café, delivery, Pix ou
 * almoço, nem se a pessoa abriu o app. Então nenhum texto pode afirmar isso.
 *
 * Roda o MÓDULO REAL (`lib/notification-catalog.ts`), transpilado em memória.
 *  1. Cada texto reescrito está no catálogo exatamente como aprovado.
 *  2. Nenhuma mensagem do catálogo afirma gasto ou estado sem sinal, cobra ou
 *     promete; título até 32 e corpo até 90 caracteres.
 *  3. Cada texto reescrito é alcançável no contexto da categoria dele, e só
 *     nos dias marcados.
 *  4. Com a categoria prioritária esgotada pelas recentes, o fallback cai no
 *     pool geral da janela e continua respeitando o dia.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib/notification-catalog.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: api, console, Math, Array, Object }
);
const { MENSAGENS, selecionarMensagem } = api;
const porId = new Map(MENSAGENS.map((m) => [m.id, m]));

let aprovadas = 0;
function ok(rotulo) { aprovadas++; console.log('  ok  ' + rotulo); }

/* ── 1. Textos aprovados ────────────────────────────────────────────────── */
const REESCRITAS = {
  'noturno-1': ['Fechando o dia?', 'Teve algum gasto hoje? Se teve, dá pra registrar agora 👀'],
  'noturno-2': ['Um minutinho só', 'Se quiser, registre o que rolou hoje. Leva pouco tempo 🚀'],
  'noturno-3': ['Antes de dormir', 'Com o celular na mão, que tal ver se falta algum lançamento de hoje? 😉'],
  'noturno-4': ['Resuminho do dia', 'Como foi o dia no bolso? Se tiver algo pra registrar, o Grana. está aqui 🌙'],
  'noturno-5': ['Antes de encerrar', 'Se ficou algum gasto de hoje de fora, dá pra lançar agora 📒'],
  'noturno-6': ['Enquanto está fresco', 'Gasto de hoje é mais fácil de lembrar hoje. Se teve algum, registre 🧠'],
  'noturno-7': ['Passadinha rápida', 'Se rolou algum gasto hoje, conta pro Grana. quando puder 🙂'],
  'streak-1': ['Sua sequência segue viva 🔥', 'São {streak} dias seguidos. Se tiver algo de hoje, dá pra continuar por aqui.'],
  'streak-2': ['Sua sequência te espera', '{streak} dias seguidos até aqui. Um lançamento de hoje soma mais um 🔥'],
  'streak-3': ['Bela sequência', 'Você chegou a {streak} dias seguidos. Quer somar o de hoje? 💪'],
  'streak-5': ['Vale continuar', '{streak} dias seguidos. Se tiver um gasto de hoje, é só registrar 🔥'],
  'streak-8': ['Constância em dia', '{streak} dias seguidos registrando. Hoje pode ser mais um, se fizer sentido 🔥'],
  'micro-1': ['Um café também conta', 'Se teve um café ou lanche hoje, ele também cabe no Grana. ☕'],
  'micro-2': ['Gastos do dia a dia', 'Comida, transporte, um lanche: se teve algo hoje, dá pra registrar 🛵'],
  'micro-3': ['Lanche também conta', 'Se teve um lanche rápido hoje, ele entra no controle do mesmo jeito 🥪'],
  'micro-6': ['Um agrado também conta', 'Se você se deu um agrado hoje (e tudo bem!), ele também cabe no Grana. 🍫'],
  'micro-7': ['Pequenos também somam', 'Estacionamento, aplicativo, assinatura: os pequenos também merecem um lugar no Grana. 🅿️'],
  'dica-1': ['Sabia que dá pra falar?', 'Dá pra lançar um gasto só falando com o Grana. Experimente a voz 🎙️'],
  'dica-8': ['Menos atrito, mais constância', 'Quanto mais fácil lançar, mais fácil manter o hábito. Já viu os atalhos do Grana.? ⚡'],
  'finde-2': ['Sábado sem pressa', 'Se rolou algum gasto hoje, registre quando fizer sentido 🎊'],
  'finde-4': ['Balanço do fim de semana', 'Se o fim de semana teve gastos, dá pra registrar com calma 😄'],
  'finde-5': ['Sexta chegou', 'Antes de virar a página da semana, quer conferir seus lançamentos? 📋'],
  'finde-8': ['Semana começando', 'Comece a semana sabendo como terminou a anterior. Quer dar uma olhada? ✅'],
  'saudade-1': ['Voltar é simples', 'Quer retomar pelo próximo lançamento? O resto pode esperar 👋'],
  'saudade-3': ['Bora recomeçar', 'Dá pra retomar de onde parou. Registre o que lembrar desses dias 🔄'],
  'saudade-4': ['Seu histórico está aqui', 'Quando quiser voltar a registrar, é só abrir o Grana. 📈'],
  'saudade-5': ['Sem julgamento', 'Pausa acontece. Quando quiser, dá uma olhada nos seus lançamentos 😌'],
  'dica-5': ['Compra no mercado?', 'Na próxima compra, escaneie o QR da nota e o Grana. preenche o lançamento 🛒'],
  'almoco-1': ['Pausa do meio-dia', 'Teve algo para registrar? Dá para fazer agora ou depois 🍴'],
  'almoco-2': ['Hora do almoço', 'Se o almoço teve gasto, ele cabe no Grana. 🥡'],
  'almoco-3': ['Hora do intervalo', 'Se teve algum gasto de manhã, a pausa é um bom momento pra registrar 🕐'],
  'almoco-4': ['Pequenos também contam', 'Suco, café ou sobremesa: se teve, dá pra registrar 🥤'],
  'almoco-5': ['Antes de voltar', 'Se ficou algum gasto de hoje pra trás, um lançamento rápido resolve 💼'],
  'almoco-6': ['Do jeito que for', 'Restaurante, marmita ou vale: se teve gasto, ele cabe no Grana. 🍱'],
  'almoco-7': ['Meio-dia bateu', 'Bom momento pra ver se falta algum lançamento de hoje 🍽️'],
  'almoco-8': ['Rapidinho', 'Se teve algum gasto até agora, dá pra registrar e seguir o dia 😉'],
  'almoco-9': ['Olhada rápida', 'Quer ver se os gastos da manhã já estão no Grana.? 🍔'],
};

console.log('\nTextos aprovados');
for (const [id, [titulo, texto]] of Object.entries(REESCRITAS)) {
  const m = porId.get(id);
  assert.ok(m, `${id} sumiu do catálogo`);
  assert.equal(m.titulo, titulo, id);
  assert.equal(m.texto, texto, id);
}
ok(`${Object.keys(REESCRITAS).length} textos reescritos no catálogo como aprovados`);

/* ── 2. Régua do catálogo inteiro ───────────────────────────────────────── */
console.log('\nRégua do catálogo');
const PROIBIDO = [
  [/R\$\s?\d/, 'valor em reais'],
  [/\bPix\b/i, 'Pix que o app não viu'],
  [/delivery/i, 'delivery que o app não viu'],
  [/cafezinho da tarde|aquele (cafezinho|lanchinho|suco|agrado)/i, 'gasto específico afirmado'],
  [/já almoçou|gasto do almoço|gastou no almoço|lançamento do almoço/i, 'almoço afirmado'],
  [/a gente não se vê|sentimos sua falta|sem abrir/i, 'abertura do app afirmada'],
  [/falta(m)? só (os lançamentos|o de hoje)/i, 'pendência afirmada'],
  [/\b\d+ segundos\b/i, 'tempo prometido'],
  [/milionári|durma tranquilo|exatamente|intacto/i, 'resultado prometido'],
  [/cadê|não jogue fora|não deixa (o fogo )?apagar|disciplina|ninguém é perfeito|só falta você|depende de você|quebrar a corrente/i, 'cobrança ou culpa'],
  [/—|–/, 'travessão'],
];
for (const m of MENSAGENS) {
  for (const [re, motivo] of PROIBIDO) {
    assert.ok(!re.test(m.titulo + ' ' + m.texto), `${m.id}: ${motivo} ("${m.titulo}: ${m.texto}")`);
  }
  assert.ok([...m.titulo].length <= 32, `${m.id}: título com ${[...m.titulo].length}`);
  assert.ok([...m.texto].length <= 90, `${m.id}: corpo com ${[...m.texto].length}`);
  assert.ok(!/\{streak\}/.test(m.texto) || m.categoria === 'streak_protecao', `${m.id}: {streak} fora da sequência`);
}
ok(`${MENSAGENS.length} mensagens sem gasto ou abertura afirmados, sem cobrança, sem promessa, curtas`);

/* ── 3. Contexto ────────────────────────────────────────────────────────── */
console.log('\nContexto');
/* Enumerar o sorteio: aleatorio = k/N percorre todas as posições. */
function alcancaveis(contexto, recentes, janela) {
  const vistas = new Set();
  for (let k = 0; k < 400; k++) vistas.add(selecionarMensagem(contexto, recentes, () => k / 400, janela).id);
  return vistas;
}
const QUARTA = 3;
function contextoDe(m) {
  const dia = m.dias ? m.dias[0] : QUARTA;
  switch (m.categoria) {
    case 'saudade': return { ctx: { streak: 0, diasInativo: 3, diaSemana: dia }, janela: 'noite' };
    case 'streak_protecao': return { ctx: { streak: 5, diasInativo: 0, diaSemana: dia }, janela: 'noite' };
    case 'fim_de_semana': return { ctx: { streak: 0, diasInativo: 0, diaSemana: dia }, janela: 'noite' };
    case 'almoco': return { ctx: { streak: 0, diasInativo: 0, diaSemana: dia }, janela: 'almoco' };
    default: return { ctx: { streak: 0, diasInativo: 0, diaSemana: dia }, janela: 'noite' };
  }
}
for (const id of Object.keys(REESCRITAS)) {
  const m = porId.get(id);
  const { ctx, janela } = contextoDe(m);
  assert.ok(alcancaveis(ctx, [], janela).has(id), `${id} não sai no contexto de ${m.categoria}`);
  if (m.dias) {
    for (const dia of [0, 1, 2, 3, 4, 5, 6].filter((d) => !m.dias.includes(d))) {
      assert.ok(!alcancaveis({ ...ctx, diaSemana: dia }, [], janela).has(id), `${id} saiu no dia ${dia}`);
    }
  }
  if (m.categoria === 'almoco') assert.ok(!alcancaveis(ctx, [], 'noite').has(id), `${id} saiu à noite`);
}
ok('cada texto reescrito sai no contexto da própria categoria, e só nos seus dias e janela');

/* ── 4. Fallback ────────────────────────────────────────────────────────── */
console.log('\nFallback');
const GERAL = { noite: ['noturno_humor', 'micro_gastos', 'dicas_atalhos'], almoco: ['almoco', 'micro_gastos', 'dicas_atalhos'] };
const casos = [
  ['saudade', { streak: 0, diasInativo: 4, diaSemana: QUARTA }, 'noite'],
  ['streak_protecao', { streak: 6, diasInativo: 0, diaSemana: QUARTA }, 'noite'],
  ['fim_de_semana', { streak: 0, diasInativo: 0, diaSemana: 5 }, 'almoco'],
  ['fim_de_semana', { streak: 0, diasInativo: 0, diaSemana: 6 }, 'noite'],
  ['fim_de_semana', { streak: 0, diasInativo: 0, diaSemana: 0 }, 'noite'],
];
for (const [categoria, ctx, janela] of casos) {
  const esgotadas = MENSAGENS.filter((m) => m.categoria === categoria).map((m) => m.id);
  for (const id of alcancaveis(ctx, esgotadas, janela)) {
    const m = porId.get(id);
    assert.ok(GERAL[janela].includes(m.categoria), `${categoria} esgotada, dia ${ctx.diaSemana}/${janela}: saiu ${id}`);
    assert.ok(!m.dias || m.dias.includes(ctx.diaSemana), `${id} fora do dia`);
  }
}
ok('categoria prioritária esgotada cai no pool geral da janela, sem sair do dia');

console.log(`\n${aprovadas} checagens de copy do catálogo passaram — 0 falhas`);
