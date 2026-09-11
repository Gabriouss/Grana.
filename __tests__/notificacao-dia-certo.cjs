/* Notificação não pode prometer um dia que não é hoje.
 *
 * Relatado do aparelho em 11/09/2026, uma SEXTA: chegou "Fechando a semana —
 * Domingo à noite é um ótimo momento pra revisar como foi a semana no bolso".
 *
 * A causa: a CATEGORIA era sensível ao dia, a mensagem não. `fim_de_semana`
 * cobre sexta, sábado e domingo, e o sorteio dentro dela podia entregar
 * qualquer uma das oito — cinco delas citando um dia específico.
 *
 * Roda o MÓDULO REAL, transpilado em memória.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('lib/notification-catalog.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: api, console, Math, Array, Object }
);

let total = 0, falhas = 0;
function checar(rotulo, ok, detalhe) {
  total++;
  if (!ok) { falhas++; console.log(`FALHA [${rotulo}] ${detalhe ?? ''}`); }
}

/* Palavra de dia citada no texto contra o dia em que a mensagem pode sair.
   Só olha o que a copy PROMETE — mensagem sem dia citado serve sempre. */
const DIA_CITADO = [
  [/\bsexta\b/i, 5],
  [/\bs[áa]bado\b/i, 6],
  [/\bdomingo|doming[ãa]o\b/i, 0],
];

for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
  const vistas = new Map();
  // Sorteio farto: qualquer mensagem alcançável neste dia aparece.
  for (let i = 0; i < 600; i++) {
    const m = api.selecionarMensagem({ streak: 3, diasInativo: 0, diaSemana: dia }, []);
    vistas.set(m.id, m);
  }
  for (const m of vistas.values()) {
    for (const [re, diaDaCopy] of DIA_CITADO) {
      if (re.test(m.texto) && diaDaCopy !== dia) {
        checar(`dia ${dia} não recebe mensagem de outro dia`, false,
          `${m.id} diz "${m.texto.slice(0, 40)}..." mas saiu no dia ${dia}`);
      }
    }
  }
  checar(`dia ${dia} tem alguma mensagem`, vistas.size > 0, 'nenhuma candidata');
}

/* Domingo é o dia com mais copy dedicada; sexta e sábado precisam ter as
   suas, senão a peneira do dia deixaria a categoria vazia e cairia no pool
   geral sem ninguém notar. */
const porDia = (dia) => {
  const s = new Set();
  for (let i = 0; i < 600; i++) s.add(api.selecionarMensagem({ streak: 3, diasInativo: 0, diaSemana: dia }, []).id);
  return [...s].filter((id) => id.startsWith('finde-'));
};
checar('sexta tem mensagem de fim de semana própria', porDia(5).length > 0, 'nenhuma finde na sexta');
checar('sábado tem a sua', porDia(6).length > 0, 'nenhuma finde no sábado');
checar('domingo tem as suas', porDia(0).length > 0, 'nenhuma finde no domingo');

/* Com todas as do dia já usadas recentemente, repetir é aceitável — mentir
   sobre o dia não é. */
const todasFinde = ['finde-1', 'finde-2', 'finde-3', 'finde-4', 'finde-5', 'finde-6', 'finde-7', 'finde-8'];
for (let i = 0; i < 200; i++) {
  const m = api.selecionarMensagem({ streak: 3, diasInativo: 0, diaSemana: 5 }, todasFinde);
  for (const [re, diaDaCopy] of DIA_CITADO) {
    if (re.test(m.texto) && diaDaCopy !== 5) {
      checar('esgotado o repertório, ainda não mente o dia', false, `${m.id} numa sexta`);
    }
  }
}
checar('esgotado o repertório, ainda não mente o dia', true);

console.log(`\n${total - falhas}/${total} checagens de dia da notificação passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
