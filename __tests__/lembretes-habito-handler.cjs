/* Lembrete de hábito pelo servidor: o dia da mensagem é o dia LOCAL de quem
 * recebe, e a entrega nunca sai em outro dia.
 *
 *   node __tests__/lembretes-habito-handler.cjs
 *
 * Relato de 11/09/2026, uma sexta: chegou "Domingo à noite é um ótimo
 * momento...". O catálogo ganhou o filtro por dia (`9ef9458`), mas o
 * `enviar-lembretes-habito` publicado só recebeu esse catálogo no deploy de
 * 23/09. Este teste roda o HANDLER REAL (`index.ts`, com `_shared/push-habit`
 * e `lib/notification-catalog` reais) sob um relógio fixo, com banco e Expo
 * simulados, nos instantes que mais enganam: à noite no Brasil, quando o UTC
 * já virou o dia seguinte.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };

function compilar(arquivo) {
  return ts.transpileModule(fs.readFileSync(path.join(root, arquivo), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function carregarModulo(arquivo, globais = {}) {
  const exports = {};
  vm.runInNewContext(compilar(arquivo), {
    exports, console, Math, Array, Object, Number, String, Date, Intl, Set, Map, Error, JSON, RegExp,
    TextEncoder, Uint8Array,
    require(id) { throw new Error(`Import não simulado em ${arquivo}: ${id}`); },
    ...globais,
  }, { filename: arquivo });
  return exports;
}

const catalogo = carregarModulo('lib/notification-catalog.ts');
const pushHabit = carregarModulo('supabase/functions/_shared/push-habit.ts');
const seguranca = carregarModulo('supabase/functions/_shared/seguranca.ts');

/* Palavras de dia no texto contra o dia em que a mensagem pode sair. */
const PALAVRAS = [
  [/\bdomingo\b/i, 0], [/\bsegunda\b/i, 1], [/\bter[çc]a\b/i, 2], [/\bquarta\b/i, 3],
  [/\bquinta\b/i, 4], [/\bsexta\b/i, 5], [/\bs[áa]bado\b/i, 6],
];
/* "Antes da segunda chegar" é dito no domingo: citar a segunda como o dia
   SEGUINTE não é prometer que hoje é segunda. Mesma coisa em finde-13 ("antes
   do domingo", dito no sábado), finde-16 e finde-22 ("antes da segunda",
   ditos no domingo), copy do Beacon de 24 e 25/09. */
const EXCECOES = { 'finde-6': [1], 'finde-13': [0], 'finde-16': [1], 'finde-22': [1] };
function diasCitados(m) {
  const texto = `${m.titulo} ${m.texto}`;
  return PALAVRAS.filter(([re]) => re.test(texto)).map(([, d]) => d)
    .filter((d) => !(EXCECOES[m.id] ?? []).includes(d));
}

/* ── Banco simulado ────────────────────────────────────────────────────── */
function criarBanco(estado) {
  const operacoes = [];
  function construtor(tabela) {
    const q = { tabela, filtros: [], acao: 'select', dados: null, opcoes: null };
    const api = {
      select() { return api; },
      eq(c, v) { q.filtros.push(['eq', c, v]); return api; },
      is(c, v) { q.filtros.push(['is', c, v]); return api; },
      lte(c, v) { q.filtros.push(['lte', c, v]); return api; },
      gte(c, v) { q.filtros.push(['gte', c, v]); return api; },
      in(c, v) { q.filtros.push(['in', c, v]); return api; },
      order() { return api; },
      range() { return api; },
      limit() { return api; },
      upsert(linhas, opcoes) { q.acao = 'upsert'; q.dados = linhas; q.opcoes = opcoes; return api; },
      update(dados) { q.acao = 'update'; q.dados = dados; return api; },
      delete() { q.acao = 'delete'; return api; },
      then(res, rej) { return Promise.resolve(executar(q)).then(res, rej); },
    };
    return api;
  }
  function executar(q) {
    operacoes.push(q);
    const id = q.filtros.find(([, c]) => c === 'id')?.[2];
    if (q.tabela === 'push_tokens' && q.acao === 'select') return { data: estado.tokens, error: null };
    if (q.tabela === 'transactions' && q.acao === 'select') {
      const ids = q.filtros.find(([op, c]) => op === 'in' && c === 'user_id')?.[2] ?? [];
      const desde = q.filtros.find(([op, c]) => op === 'gte' && c === 'created_at')?.[2];
      ok(desde, 'a atividade é lida pela data de registro (created_at)');
      return { data: (estado.transacoes ?? []).filter((t) => ids.includes(t.user_id) && t.created_at >= desde), error: null };
    }
    if (q.tabela === 'push_habit_deliveries' && q.acao === 'select') return { data: [], error: null };
    if (q.tabela === 'push_habit_deliveries' && q.acao === 'upsert') {
      for (const linha of q.dados) {
        const chave = `${linha.expo_push_token}|${linha.data_local}|${linha.janela}`;
        if (estado.entregas.has(chave)) continue; // ignoreDuplicates
        estado.entregas.set(chave, { id: `e${estado.entregas.size + 1}`, status: 'pending', tentativas: 0,
          expo_ticket_id: null, enviado_em: null, ...linha });
      }
      return { data: null, error: null };
    }
    if (q.tabela === 'push_habit_deliveries' && q.acao === 'update') {
      for (const e of estado.entregas.values()) if (e.id === id) Object.assign(e, q.dados);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }
  return {
    operacoes,
    cliente: {
      from: construtor,
      rpc: async (nome) => {
        operacoes.push({ rpc: nome });
        if (nome === 'contextos_push_habito') throw new Error('o handler não usa mais o RPC por occurred_on');
        if (nome === 'reivindicar_entregas_push_habito') {
          const pendentes = [...estado.entregas.values()].filter((e) => e.status === 'pending');
          for (const e of pendentes) { e.status = 'sending'; e.tentativas += 1; }
          return { data: pendentes.map((e) => ({ ...e })), error: null };
        }
        return { data: null, error: { message: `rpc não simulada: ${nome}` } };
      },
    },
  };
}

/* ── Handler real sob relógio fixo ──────────────────────────────────────── */
function montarHandler(estado, agoraIso, sorteio = Math.random) {
  const banco = criarBanco(estado);
  const envios = [];
  const fixo = new Date(agoraIso).getTime();
  class DataFixa extends Date {
    constructor(...a) { super(...(a.length ? a : [fixo])); }
    static now() { return fixo; }
  }
  const mathSorteio = Object.create(Math);
  mathSorteio.random = sorteio;
  let handler = null;
  const exports = {};
  vm.runInNewContext(compilar('supabase/functions/enviar-lembretes-habito/index.ts'), {
    exports, console, Promise, JSON, Array, Object, Number, String, Map, Set, Error, Response,
    Math: mathSorteio, Date: DataFixa, setTimeout,
    Deno: {
      env: { get: (k) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sr', CRON_PUSH_SECRET: 'cron', EXPO_ACCESS_TOKEN: '' })[k] },
      serve: (fn) => { handler = fn; },
    },
    fetch: async (url, init) => {
      const corpo = JSON.parse(init.body);
      envios.push({ url, corpo });
      const data = Array.isArray(corpo) ? corpo.map((_, i) => ({ status: 'ok', id: `t${envios.length}-${i}` })) : {};
      return new Response(JSON.stringify({ data }), { status: 200 });
    },
    require(id) {
      if (id === 'npm:@supabase/supabase-js@2.112.3') return { createClient: () => banco.cliente };
      if (id === '../../../lib/notification-catalog.ts') return catalogo;
      if (id === '../_shared/push-habit.ts') return pushHabit;
      if (id === '../_shared/seguranca.ts') return seguranca;
      throw new Error(`Import não simulado no handler: ${id}`);
    },
  }, { filename: 'enviar-lembretes-habito/index.ts' });
  const chamar = (segredo = 'cron') => handler(new Request('https://x/functions/v1/enviar-lembretes-habito', {
    method: 'POST', headers: { 'x-cron-secret': segredo },
  }));
  return { chamar, envios, banco };
}

const ontem = (d) => new Date(Date.parse(d + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
/* Lançamento com `occurred_on` = dia e registrado (`created_at`) ao meio-dia
   de São Paulo do dia `registradoEm` (padrão: o mesmo dia). */
const reg = (dia, registradoEm = dia) => ({ user_id: 'u1', occurred_on: dia, created_at: `${registradoEm}T15:00:00.000Z` });

const token = (extra = {}) => ({
  expo_push_token: 'ExponentPushToken[a]', user_id: 'u1', plataforma: 'android',
  timezone: 'America/Sao_Paulo', horario_hora: 20, horario_minuto: 30, almoco_ativo: true, ativo: true,
  mensagens_recentes: [], ...extra,
});

async function principal() {
  /* Sem o segredo do cron, nada roda. */
  {
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [] };
    const m = montarHandler(estado, '2026-09-12T02:31:00Z');
    const r = await m.chamar('errado');
    igual(r.status, 401, 'segredo errado: 401');
    igual(m.banco.operacoes.length, 0, 'segredo errado não toca o banco');
    igual(m.envios.length, 0, 'nem o Expo');
  }

  /* Sexta, 11/09/2026, 23:31 em São Paulo = sábado 02:31 em UTC. Com o
     streak alto e sem atividade recente, o sorteio cai em `fim_de_semana`,
     a categoria onde mora o "Domingo à noite". Varre todos os sorteios. */
  const CASOS = [
    { rotulo: 'sexta 23:31 BRT (UTC já é sábado)', agora: '2026-09-12T02:31:00Z', data: '2026-09-11', dia: 5 },
    { rotulo: 'sábado 23:59 BRT (UTC já é domingo)', agora: '2026-09-13T02:59:00Z', data: '2026-09-12', dia: 6 },
    { rotulo: 'domingo 21:00 BRT (UTC já é segunda)', agora: '2026-09-14T00:00:00Z', data: '2026-09-13', dia: 0 },
    { rotulo: 'quinta 22:00 em Manaus (UTC já é sexta)', agora: '2026-09-11T02:00:00Z', data: '2026-09-10', dia: 4, tz: 'America/Manaus' },
  ];
  for (const caso of CASOS) {
    const vistos = new Set();
    for (let i = 0; i < 40; i++) {
      const estado = {
        tokens: [token(caso.tz ? { timezone: caso.tz } : {})],
        entregas: new Map(),
        transacoes: [reg(ontem(caso.data))],
      };
      const { chamar, envios } = montarHandler(estado, caso.agora, () => (i + 0.5) / 40);
      const resposta = await chamar();
      igual(resposta.status, 200, `${caso.rotulo}: handler responde 200`);
      const entregas = [...estado.entregas.values()];
      ok(entregas.every((e) => e.data_local === caso.data), `${caso.rotulo}: data_local é o dia LOCAL (${caso.data})`);
      const noite = entregas.find((e) => e.janela === 'noite');
      ok(noite, `${caso.rotulo}: a janela da noite venceu e foi criada`);
      const msg = catalogo.MENSAGENS.find((m) => m.id === noite.mensagem_id);
      vistos.add(msg.id);
      ok(!msg.dias || msg.dias.includes(caso.dia), `${caso.rotulo}: ${msg.id} só sai nos dias dela`);
      const citados = diasCitados(msg);
      ok(citados.every((d) => d === caso.dia), `${caso.rotulo}: ${msg.id} não cita outro dia (${citados})`);
      const enviados = envios.filter((e) => e.url.endsWith('/push/send')).flatMap((e) => e.corpo);
      ok(enviados.length === entregas.length && enviados.every((p) => p.collapseId === `grana-habito-${caso.data}-${entregas.find((e) => e.expo_push_token === p.to && p.collapseId.endsWith(e.janela)).janela}`),
        `${caso.rotulo}: todo envio carrega a chave de colapso do dia local`);
      /* Almoço: só em dia útil local. */
      const temAlmoco = entregas.some((e) => e.janela === 'almoco');
      igual(temAlmoco, caso.dia >= 1 && caso.dia <= 5, `${caso.rotulo}: almoço só em dia útil local`);
    }
    ok(vistos.size >= 2, `${caso.rotulo}: o sorteio foi exercitado (${vistos.size} mensagens distintas)`);
  }

  /* Domingo à noite, a mensagem de domingo PODE sair; na sexta, nunca. */
  const domingo = new Set();
  for (let i = 0; i < 40; i++) {
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [reg('2026-09-12')] };
    await montarHandler(estado, '2026-09-14T00:00:00Z', () => (i + 0.5) / 40).chamar();
    domingo.add([...estado.entregas.values()][0].mensagem_id);
  }
  ok([...domingo].some((id) => diasCitados(catalogo.MENSAGENS.find((m) => m.id === id)).includes(0)),
    'domingo ainda recebe copy de domingo (o filtro não apagou a categoria)');

  /* Quem já lançou hoje não recebe o lembrete de hoje (achado do
     Watchtower, 24/09): o app desliga o agendamento local quando o push
     remoto está ativo, e o local respeitava `jaLancouHoje`. Antes desta
     correção o servidor criava e enviava do mesmo jeito. */
  {
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [reg('2026-09-11'), reg('2026-09-10')] };
    const m = montarHandler(estado, '2026-09-12T02:31:00Z'); // sexta 23:31 BRT
    const r = await (await m.chamar()).json();
    igual(estado.entregas.size, 0, 'já lançou hoje: nenhuma entrega criada');
    igual(r.criadas, 0, 'e o handler relata zero criadas');
    igual(m.envios.filter((e) => e.url.endsWith('/push/send')).length, 0, 'e nada vai ao Expo');
  }
  {
    /* Lançamento com data de ONTEM não conta como hoje. */
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [reg('2026-09-10')] };
    await montarHandler(estado, '2026-09-12T02:31:00Z').chamar();
    ok(estado.entregas.size > 0, 'lançou só ontem: o lembrete de hoje é criado');
  }
  {
    /* Retentativa: criada ao meio-dia, a pessoa lança às 12:10, a próxima
       tentativa não sai. */
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [reg('2026-09-11')] };
    estado.entregas.set('x', {
      id: 'retry', expo_push_token: 'ExponentPushToken[a]', data_local: '2026-09-11', janela: 'almoco',
      mensagem_id: 'almoco-1', titulo: 'Almoço', corpo: '...', status: 'pending', tentativas: 1,
      expo_ticket_id: null, enviado_em: null,
    });
    const m = montarHandler(estado, '2026-09-11T15:15:00Z'); // 12:15 BRT
    await m.chamar();
    const retry = [...estado.entregas.values()].find((e) => e.id === 'retry');
    igual(retry.status, 'failed', 'retentativa depois do lançamento não é enviada');
    igual(retry.ultimo_erro, 'already_logged_today', 'e registra o motivo');
    igual(m.envios.filter((e) => e.url.endsWith('/push/send')).length, 0, 'nenhum envio ao Expo');
  }

  /* Dia de atividade é o dia do REGISTRO (created_at no fuso do token), o
     critério do app desde 22333aa. */
  {
    /* Gasto de ontem registrado hoje: hoje houve atividade, nada é enviado. */
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [reg('2026-09-10', '2026-09-11')] };
    await montarHandler(estado, '2026-09-12T02:31:00Z').chamar(); // sexta 23:31 BRT
    igual(estado.entregas.size, 0, 'gasto de ontem registrado hoje silencia o lembrete de hoje');
  }
  {
    /* Parcela que cai hoje, criada 20 dias atrás: não é atividade de hoje. */
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [reg('2026-09-11', '2026-08-22'), reg('2026-09-10')] };
    await montarHandler(estado, '2026-09-12T02:31:00Z').chamar();
    ok(estado.entregas.size > 0, 'parcela de hoje criada antes não silencia o lembrete');
  }
  {
    /* Registro às 22:30 de São Paulo já é o dia seguinte em UTC: conta no
       dia local. */
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [{ user_id: 'u1', occurred_on: '2026-09-11', created_at: '2026-09-12T01:30:00.000Z' }] };
    await montarHandler(estado, '2026-09-12T02:31:00Z').chamar();
    igual(estado.entregas.size, 0, 'registro às 22:30 BRT (UTC já no dia seguinte) conta como hoje');
  }
  {
    /* Última atividade há 3 dias e uma parcela com data futura: a retomada
       (saudade) tem de sair; com Math.max sobre datas futuras, não saía. */
    const estado = { tokens: [token({ almoco_ativo: false })], entregas: new Map(), transacoes: [reg('2026-12-11', '2026-09-08'), reg('2026-09-08')] };
    await montarHandler(estado, '2026-09-12T02:31:00Z', () => 0).chamar();
    const msg = catalogo.MENSAGENS.find((m) => m.id === [...estado.entregas.values()][0]?.mensagem_id);
    igual(msg?.categoria, 'saudade', 'data futura não esconde a inatividade: sai a retomada');
  }

  /* Idempotência: a mesma passada repetida não cria nem envia de novo. */
  {
    const estado = { tokens: [token()], entregas: new Map(), transacoes: [] };
    const a = montarHandler(estado, '2026-09-12T02:31:00Z');
    await a.chamar();
    const primeira = [...estado.entregas.values()].map((e) => ({ ...e }));
    const b = montarHandler(estado, '2026-09-12T02:36:00Z');
    const r = await (await b.chamar()).json();
    igual(estado.entregas.size, primeira.length, 'segunda passada do cron não cria entrega nova (unique token+dia+janela)');
    igual(r.enviadas, 0, 'e não reenvia o que já saiu');
    igual(b.envios.filter((e) => e.url.endsWith('/push/send')).length, 0, 'nenhuma chamada ao Expo na segunda passada');
  }

  /* Entrega que ficou para trás não sai no dia seguinte: criada na sexta,
     reivindicada no sábado, vira `expired_local_date` sem envio. */
  {
    const estado = { tokens: [token({ almoco_ativo: false })], entregas: new Map(), transacoes: [] };
    estado.entregas.set('x', {
      id: 'velha', expo_push_token: 'ExponentPushToken[a]', data_local: '2026-09-11', janela: 'noite',
      mensagem_id: 'finde-1', titulo: 'Sexta', corpo: '...', status: 'pending', tentativas: 1,
      expo_ticket_id: null, enviado_em: null,
    });
    const m = montarHandler(estado, '2026-09-12T13:00:00Z'); // sábado 10:00 BRT, antes da noite
    await m.chamar();
    const velha = [...estado.entregas.values()].find((e) => e.id === 'velha');
    igual(velha.status, 'failed', 'entrega de ontem não é enviada hoje');
    igual(velha.ultimo_erro, 'expired_local_date', 'e deixa o motivo registrado');
    igual(m.envios.filter((e) => e.url.endsWith('/push/send')).length, 0, 'nenhum envio ao Expo');
  }

  /* Antes do horário escolhido, nada nasce. */
  {
    const estado = { tokens: [token({ almoco_ativo: false })], entregas: new Map(), transacoes: [] };
    await montarHandler(estado, '2026-09-11T23:29:00Z').chamar(); // 20:29 BRT
    igual(estado.entregas.size, 0, 'às 20:29 com lembrete às 20:30, nenhuma entrega');
  }

  /* Fuso inválido não derruba o lote dos outros. */
  {
    const estado = {
      tokens: [token({ expo_push_token: 'ExponentPushToken[ruim]', timezone: 'Nada/Inexistente' }), token()],
      entregas: new Map(), transacoes: [],
    };
    const r = await (await montarHandler(estado, '2026-09-12T02:31:00Z').chamar()).json();
    ok(r.ok && [...estado.entregas.values()].every((e) => e.expo_push_token === 'ExponentPushToken[a]'),
      'fuso inválido é pulado e o outro token recebe normalmente');
  }

  console.log(`lembretes-habito-handler: ${passou} checagens OK`);
}

principal().catch((e) => { console.error(e); process.exit(1); });
