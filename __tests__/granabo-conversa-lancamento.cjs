/*
 * Conversa de lançamento no Granachat, pelo handler REAL da Edge Function.
 *
 * Em 16/09/2026, depois de publicar a v31, um teste na conta de teste mostrou
 * que a correção do nome só valia com a frase completa numa mensagem. Quando o
 * Granabô perguntava a categoria e a pessoa respondia "Alimentação", o servidor
 * colava a resposta na frase original, e o lançamento foi gravado como
 * "Energético no crédito Alimentação". O mesmo teste mostrou dois outros
 * defeitos, conferidos no ar:
 *
 * - textos escritos para o modelo ("Pergunte ao usuário…", "Confirme isso ao
 *   usuário…") apareciam na tela, porque `respostaFinalSegura` devolve o
 *   resultado da escrita como está;
 * - a data do lançamento vinha de `toISOString()`, em UTC: depois das 21h de
 *   Brasília, saía o dia seguinte.
 *
 * Este teste carrega `assistente-financeiro/index.ts` como em
 * `assistant-memory-integration.cjs`: banco e provedor simulados, e o modelo
 * roteirizado para chamar `criarLancamento` com um texto REESCRITO — o servidor
 * tem de ignorá-lo e usar o que a pessoa digitou.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

let passou = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); passou++; };
const igual = (a, b, nome) => { assert.deepEqual(a, b, nome); passou++; };

const USUARIO = 'usuario-teste';
const CARTEIRA = { id: 'w1', name: 'Principal', is_default: true, user_id: USUARIO };
const C6 = { id: 'c6', name: 'C6', bank: 'c6', wallet_id: null, user_id: USUARIO };
const NUBANK = { id: 'nu', name: 'Nubank', bank: 'nubank', wallet_id: 'w1', user_id: USUARIO };

let handler;
let completions = [];
let gravados = [];
let cartoes = [C6];

class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; } order() { return this; } limit() { return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  neq() { return this; } gte() { return this; } lte() { return this; } in() { return this; }
  delete() { return this; }
  maybeSingle() { this.single = true; return this; }
  insert() { return Promise.resolve({ error: null }); }
  then(resolve, reject) {
    let rows = this.table === 'wallets' ? [CARTEIRA] : this.table === 'credit_cards' ? cartoes : [];
    rows = rows.filter((r) => this.filters.every((f) => f(r)));
    return Promise.resolve({ data: this.single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
  }
}
const client = {
  auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) },
  from: (table) => new Query(table),
  rpc: async (name, args) => {
    if (name === 'consumir_cota_ia') return { data: [{ permitido: true, motivo: null, minuto_restante: 9, dia_restante: 119 }], error: null };
    if (name === 'buscar_exemplos_similares') return { data: [], error: null };
    if (name === 'registrar_operacao_voz') { gravados.push(args); return { data: { status: 'committed' }, error: null }; }
    return { data: null, error: null };
  },
};

const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const m = new Module(file, module);
  modules.set(file, m);
  m.require = (name) => {
    if (name.startsWith('npm:') && name.endsWith('/cors')) return { corsHeaders: {} };
    if (name.startsWith('npm:')) return { createClient: () => client };
    if (name.endsWith('/seguranca.ts')) return {
      criarRateLimiter: () => () => false,
      fetchComTimeout: async () => Response.json({ choices: [{ message: completions.shift() ?? { content: 'Pronto.' } }] }),
    };
    return load(path.resolve(path.dirname(file), name));
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}
global.Deno = { env: { get: () => 'test' }, serve: (fn) => { handler = fn; } };
load(path.resolve(__dirname, '../supabase/functions/assistente-financeiro/index.ts'));
const interp = load(path.resolve(__dirname, '../supabase/functions/_shared/interpretar-lancamento.ts'));

const chamarLancamento = () => ({
  role: 'assistant',
  content: null,
  // Texto reescrito de propósito, com número inventado: o servidor ignora.
  tool_calls: [{ id: '1', function: { name: 'criarLancamento', arguments: JSON.stringify({ texto: 'lançamento de 999 reais' }) } }],
});

/** Manda as falas em sequência, com o histórico real da conversa. */
async function conversa(falas) {
  const historico = [];
  const respostas = [];
  for (const fala of falas) {
    completions = [chamarLancamento(), { content: 'Prontinho!' }];
    const res = await handler(new Request('http://local', {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: fala, historico }),
    }));
    assert.equal(res.status, 200);
    const { resposta } = await res.json();
    respostas.push(resposta);
    historico.push({ papel: 'usuario', texto: fala }, { papel: 'assistente', texto: resposta });
  }
  return respostas;
}

/* Texto que chega à pessoa não fala com o modelo. */
const ESCRITO_PARA_O_MODELO = /usu[aá]rio|pergunte|confirme|pe[çc]a |NÃO registrei/;

/* Relógio parado num instante, como manda a regra 9 (o sandbox controla o tempo). */
const DataReal = Date;
async function comRelogio(instante, fn) {
  const fixo = DataReal.parse(instante);
  global.Date = class extends DataReal {
    constructor(...args) { super(...(args.length ? args : [fixo])); }
    static now() { return fixo; }
  };
  try { return await fn(); } finally { global.Date = DataReal; }
}

(async () => {
  /* ── 1. O caso da conta de teste: a categoria vem numa segunda mensagem ── */
  {
    cartoes = [C6, NUBANK];
    gravados = [];
    const [pergunta, confirmacao] = await conversa(['lança energético 10,99 no crédito C6', 'Alimentação']);
    igual(
      pergunta,
      'Não identifiquei a categoria de "Energético" (R$ 10,99). Qual destas é a certa: ' +
        interp.CATEGORIES.map((c) => c.name).join(', ') + '? Ainda não registrei nada.',
      'a pergunta cita o nome sem "no crédito C6" e fala com a pessoa'
    );
    igual(gravados.length, 1, 'só a segunda mensagem grava');
    const { p_payload: p, p_source } = gravados[0];
    igual(p.description, 'Energético', 'a resposta "Alimentação" não entra no nome');
    igual([p.category, p.card_id, p.payment_method, p.amount], ['Alimentação', 'c6', 'credit', 10.99],
      'categoria, cartão, forma e valor saem da conversa, e o número inventado pelo modelo não entra');
    igual(p_source, 'assistente', 'a gravação continua com a origem do assistente');
    igual(
      confirmacao,
      'Lançamento registrado: R$ 10,99 em Alimentação (Energético) no cartão C6, na carteira Principal. ' +
        'Se quiser desfazer, é só dizer "desfaz".',
      'a confirmação fala com a pessoa'
    );
  }

  /* ── 1b. A resposta corrige o valor: o novo vence, o nome continua ─────── */
  {
    cartoes = [C6];
    gravados = [];
    await conversa(['lança energético 10,99 reais no crédito C6', 'Alimentação, foi 12,50 reais']);
    igual(gravados.map((g) => [g.p_payload.amount, g.p_payload.description, g.p_payload.category]),
      [[12.5, 'Energético', 'Alimentação']],
      'o valor corrigido na resposta vence o da frase original, e não vira nome');
  }

  /* ── 2. A frase original não tinha nome: a resposta batiza ─────────────── */
  {
    cartoes = [C6];
    gravados = [];
    const respostas = await conversa(['lança 20 reais no crédito C6', 'almoço']);
    igual(gravados.length, 1, 'grava depois da resposta');
    igual(gravados[0].p_payload.description, 'Almoço', 'sem nome na frase original, o nome vem da resposta');
    igual(gravados[0].p_payload.category, 'Alimentação', 'e a categoria também');
    ok(respostas.every((r) => !ESCRITO_PARA_O_MODELO.test(r)), 'nenhuma resposta fala com o modelo');
  }

  /* ── 3. O cartão vem na segunda mensagem ─────────────────────────────── */
  {
    cartoes = [C6, NUBANK];
    gravados = [];
    const [pergunta] = await conversa(['lança almoço 20 reais no crédito', 'C6']);
    igual(pergunta, 'Em qual cartão foi: C6, Nubank? Ainda não registrei nada.', 'a pergunta do cartão fala com a pessoa');
    igual(gravados.map((g) => [g.p_payload.description, g.p_payload.card_id]), [['Almoço', 'c6']],
      'o cartão respondido não entra no nome');
  }

  /* ── 4. Uma mensagem só continua como antes ───────────────────────────── */
  {
    cartoes = [C6];
    for (const frase of ['lança almoço 20 reais no crédito C6', 'lança 30 reais em outros']) {
      gravados = [];
      await conversa([frase]);
      const esperado = interp.descricaoDoLancamento(frase, 'out', /cr[ée]dito/i.test(frase) ? C6 : null);
      igual(gravados.map((g) => g.p_payload.description), [esperado], `"${frase}" mantém o nome de uma mensagem só`);
    }
  }

  /* ── 5. A data é a de São Paulo, não a de UTC ─────────────────────────── */
  {
    cartoes = [C6];
    for (const [instante, dia] of [
      ['2026-09-16T23:30:00-03:00', '2026-09-16'], // 02:30 do dia 17 em UTC
      ['2026-09-17T00:30:00-03:00', '2026-09-17'],
      ['2026-12-31T22:00:00-03:00', '2026-12-31'], // virada do ano em UTC
    ]) {
      gravados = [];
      await comRelogio(instante, () => conversa(['lança almoço 20 reais no crédito C6']));
      igual(gravados.map((g) => g.p_payload.occurred_on), [dia], `lançamento às ${instante} fica no dia ${dia}`);
    }
  }

  /* ── 6. Os outros "ainda não registrei" também falam com a pessoa ──────── */
  {
    cartoes = [C6];
    for (const [frase, esperado] of [
      ['lança almoço no crédito C6', 'Não identifiquei o valor nessa frase. Me diz quanto foi, em reais (ex.: "almoço 38,50"). Ainda não registrei nada.'],
      // Sem data nenhuma o interpretador presume 5 dias; só a data citada e ilegível pergunta.
      ['lança boleto de luz 150 reais com vencimento semana que vem', 'Entendi que é uma conta a pagar, mas não achei o vencimento. Qual é o dia? Ainda não registrei nada.'],
      // Só "débito" dito com todas as letras tira parcela do crédito (`ehIntencaoCredito`).
      ['lança mercado 300 em 3x no débito', 'Parcelamento só existe em compra no crédito. Foi no cartão? Se foi, me diz qual. Ainda não registrei nada.'],
    ]) {
      gravados = [];
      const [resposta] = await conversa([frase]);
      igual(resposta, esperado, `"${frase}" responde para a pessoa`);
      igual(gravados.length, 0, `"${frase}" não grava`);
    }
  }

  /* ── 7. O código não volta aos textos antigos ─────────────────────────── */
  {
    const fonte = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/assistente-financeiro/index.ts'), 'utf8');
    ok(!/Confirme isso ao usuário/.test(fonte), 'a confirmação não manda o modelo confirmar');
    ok(!/toISOString\(\)\.slice\(0, 10\),\s*\n\s*recurring/.test(fonte), 'a data do lançamento não vem de UTC');
  }

  console.log(`granabo-conversa-lancamento: ${passou} verificacoes OK`);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
