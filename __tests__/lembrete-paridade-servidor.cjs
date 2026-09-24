/* Paridade do estado do lembrete de hábito: app x servidor (24/09/2026).
 *
 *   node __tests__/lembrete-paridade-servidor.cjs
 *
 * Com o push remoto ativo, o app desliga o agendamento local e quem decide é
 * o `enviar-lembretes-habito`. Os dois têm de ver o MESMO estado: se a pessoa
 * já registrou hoje, a sequência e há quantos dias não registra. Critério
 * único (Forge, `22333aa`): dia de atividade = `created_at` no fuso local,
 * `occurred_on` só sem `created_at`, e data no futuro não conta.
 *
 * Roda os módulos REAIS dos dois lados: `lib/contexto-lembrete.ts` (com
 * `lib/gamification.ts` e `lib/format.ts`) e `_shared/push-habit.ts`, sobre
 * milhares de históricos gerados, com o processo em America/Sao_Paulo (o fuso
 * do aparelho, para o app, e o `timezone` do token, para o servidor).
 */
process.env.TZ = 'America/Sao_Paulo';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const cache = new Map();
function carregar(arquivo) {
  if (cache.has(arquivo)) return cache.get(arquivo).exports;
  const m = new Module(arquivo, module);
  cache.set(arquivo, m);
  m.require = (id) => {
    if (id.startsWith('.')) return carregar(path.resolve(path.dirname(arquivo), id.endsWith('.ts') ? id : `${id}.ts`));
    throw new Error(`Import não simulado em ${arquivo}: ${id}`);
  };
  m._compile(ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, arquivo);
  return m.exports;
}
const app = carregar(path.join(root, 'lib/contexto-lembrete.ts'));
const servidor = carregar(path.join(root, 'supabase/functions/_shared/push-habit.ts'));
const TZ = 'America/Sao_Paulo';

function doServidor(transacoes, agora) {
  const dias = servidor.diasDeAtividade(transacoes, TZ);
  const hoje = servidor.momentoNaZona(agora, TZ).data;
  const { streak, diasInativo } = servidor.contextoDasDatas(dias, hoje);
  return { jaLancouHoje: servidor.lancouNoDia(dias, hoje), streak, diasInativo };
}

let passou = 0;
function comparar(transacoes, agora, rotulo) {
  const a = app.contextoDoLembrete(transacoes, agora);
  const s = doServidor(transacoes, agora);
  assert.deepEqual(s, { jaLancouHoje: a.jaLancouHoje, streak: a.streak, diasInativo: a.diasInativo },
    `${rotulo}\n agora=${agora.toISOString()}\n tx=${JSON.stringify(transacoes)}`);
  passou++;
  return a;
}

/* ── Casos nomeados ────────────────────────────────────────────────────── */
const agora = new Date('2026-09-12T02:31:00Z'); // sexta 23:31 em São Paulo
const reg = (dia, criado) => ({ occurred_on: dia, created_at: criado });

let r = comparar([reg('2026-09-10', '2026-09-11T15:00:00Z')], agora, 'ontem registrado hoje');
assert.equal(r.jaLancouHoje, true); passou++;

r = comparar([reg('2026-09-11', '2026-08-22T15:00:00Z'), reg('2026-09-10', '2026-09-10T15:00:00Z')], agora, 'hoje criado antes');
assert.equal(r.jaLancouHoje, false); passou++;
assert.equal(r.diasInativo, 1); passou++;

r = comparar([reg('2026-12-11', '2026-09-08T15:00:00Z'), reg('2027-01-11', null), reg('2026-09-08', '2026-09-08T15:00:00Z')], agora, 'futuro');
assert.equal(r.diasInativo, 3, 'parcela futura não vira inatividade zero'); passou++;

r = comparar([reg('2026-09-11', '2026-09-12T01:30:00Z')], agora, 'registro às 22:30 BRT, UTC já no dia seguinte');
assert.equal(r.jaLancouHoje, true); passou++;

r = comparar([reg('2026-09-11', '2026-09-11T02:59:00Z')], agora, 'registro às 23:59 de ontem BRT, UTC já hoje');
assert.equal(r.jaLancouHoje, false); passou++;

r = comparar([], agora, 'sem histórico');
assert.equal(r.diasInativo, 99); passou++;

r = comparar([reg('2026-09-11', null)], agora, 'linha sem created_at usa occurred_on');
assert.equal(r.jaLancouHoje, true); passou++;

/* ── Históricos gerados ─────────────────────────────────────────────────
   Gerador determinístico: registros nos últimos 55 dias (dentro da janela
   de 60 do servidor) em qualquer hora, datas do lançamento retroativas e
   futuras, e algumas linhas sem created_at. */
let semente = 20260924;
const aleatorio = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const dia = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
for (let i = 0; i < 4000; i++) {
  const agoraMs = Date.parse('2026-09-01T00:00:00Z') + Math.floor(aleatorio() * 120) * 3_600_000 * 24 / 5 + Math.floor(aleatorio() * 86_400_000);
  const n = Math.floor(aleatorio() * 12);
  const tx = [];
  for (let k = 0; k < n; k++) {
    const criadoMs = agoraMs - Math.floor(aleatorio() * 55 * 86_400_000);
    const deslocamento = Math.floor(aleatorio() * 90) - 30; // -30..+59 dias
    const semCriado = aleatorio() < 0.1;
    tx.push({
      occurred_on: dia(criadoMs + deslocamento * 86_400_000),
      created_at: semCriado ? null : new Date(criadoMs).toISOString(),
    });
  }
  comparar(tx, new Date(agoraMs), `gerado #${i}`);
}

console.log(`lembrete-paridade-servidor: ${passou} checagens OK (app x servidor)`);
