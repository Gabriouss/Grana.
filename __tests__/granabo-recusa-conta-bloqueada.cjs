/*
 * O Granabô recusa conta bloqueada, e recusa ANTES de gastar qualquer coisa.
 *
 * Decisão do autor em 23/09/2026, respondendo à auditoria de backend: o
 * Granabô faz parte do que a assinatura libera, então conta sem direito de
 * acesso não deve ser atendida. Até então a Edge Function só conferia o token
 * — a conta bloqueada recebia "você não tem carteira cadastrada", porque a
 * RLS das tabelas de dinheiro devolve vazio, depois de já ter debitado cota
 * de IA. Gasta, não entrega e não explica.
 *
 * O teste roda o HANDLER REAL de `supabase/functions/assistente-financeiro`,
 * transpilado em memória e executado em `vm` com dublês para cada import e
 * para o `Deno` (o módulo é Deno e não carrega no Node). Testar uma
 * reimplementação não valeria: é o arquivo publicado que decide quem entra.
 *
 * O que fica preso aqui:
 *
 * 1. sem direito de acesso -> 403 com recado que explica o motivo;
 * 2. a cota de IA NÃO é consumida nesse caso, e o modelo não é chamado —
 *    asserção em QUAIS chamadas aconteceram, porque o custo é o ponto;
 * 3. falha ao CONSULTAR o direito de acesso recusa, não libera: portão que
 *    abre quando o banco tosse não é portão;
 * 4. com direito de acesso, o pedido passa do portão normalmente, carrega a
 *    memória do usuário de verdade (as três leituras de `carregarMemoria`) e
 *    ela chega ao prompt; a conta bloqueada, ao contrário, nem lê a memória;
 * 5. a porta de trás do banco continua fechada, com a leitura livre.
 *
 * O dublê do cliente grava cada consulta encadeada. Até 29/09/2026 ele não
 * tinha `.neq`: `carregarMemoria` caía no `catch`, voltava vazia, e o caso 4
 * passava com 500 porque só conferia "não é 403".
 */
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

let total = 0;
let falhas = 0;
function conferir(nome, ok, visto) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`x ${nome}${visto === undefined ? '' : ` — visto: ${JSON.stringify(visto)}`}`);
}

const FONTE = 'supabase/functions/assistente-financeiro/index.ts';
const codigo = ts.transpileModule(fs.readFileSync(FONTE, 'utf8'), {
  fileName: FONTE,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

/* Carrega o módulo e devolve o handler que ele registrou em `Deno.serve`,
   junto com o diário do que foi chamado. */
/* Memória que o banco "devolve" para o usuário do teste. Cada item tem um
   marcador próprio para conferir, no prompt, que ele chegou lá. */
const MEMORIA = {
  vocabulario: [{ chave: 'categoria:rango', valor: 'Alimentacao' }],
  fatos: [
    { chave: 'salario', valor: 'recebe no dia 5' },
    { chave: 'preferencia:formato', valor: 'respostas curtas' },
  ],
  exemplos: [{ chave: 'quanto gastei com rango?', valor: JSON.stringify({ versao: 2, validacao: 'execucao_verificada', plano: [] }) }],
};

/* O que a leitura encadeada devolve, decidido pelos filtros que ela recebeu. */
function dadosDaConsulta(consulta) {
  if (consulta.tabela !== 'assistant_memory') return [];
  const tipo = consulta.ops.find(([op, args]) => op === 'eq' && args[0] === 'tipo')?.[1][1];
  if (tipo === 'vocabulario') return MEMORIA.vocabulario;
  if (tipo === 'fato') return MEMORIA.fatos;
  return [];
}

function carregar({ acesso, acessoError = null }) {
  const diario = { cota: 0, modelo: 0, rpcs: [], consultas: [], erros: [], prompts: [] };
  let handler = null;

  const clienteFake = {
    auth: { getUser: async () => ({ data: { user: { id: 'usuario-1' } }, error: null }) },
    rpc: async (nome, args) => {
      diario.rpcs.push(nome);
      if (nome === 'tem_direito_acesso') return { data: acesso, error: acessoError };
      if (nome === 'buscar_exemplos_similares') return { data: MEMORIA.exemplos, error: null };
      return { data: null, error: null };
    },
    from: (tabela) => {
      const consulta = { tabela, ops: [] };
      diario.consultas.push(consulta);
      const q = {};
      for (const op of ['select', 'eq', 'neq', 'order', 'limit', 'gte', 'lte', 'not', 'delete']) {
        q[op] = (...args) => { consulta.ops.push([op, args]); return q; };
      }
      q.insert = async (...args) => { consulta.ops.push(['insert', args]); return { error: null }; };
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => ({ data: null, error: null });
      q.then = (resolver, rejeitar) => Promise.resolve({ data: dadosDaConsulta(consulta), error: null }).then(resolver, rejeitar);
      return q;
    },
  };

  /* O console do módulo é gravado, para o teste afirmar que NENHUM erro foi
     logado no caminho feliz (o `catch` de `carregarMemoria` só loga). */
  const consoleFake = {
    ...console,
    error: (...args) => { diario.erros.push(args.map(String).join(' ')); },
    log: () => {},
  };

  const requireStub = (nome) => {
    if (nome.includes('supabase-js/cors')) return { corsHeaders: {} };
    if (nome.includes('supabase-js')) return { createClient: () => clienteFake };
    if (nome.includes('ai-quota')) {
      return {
        consumirCotaIA: async () => { diario.cota++; return { permitido: true }; },
        mensagemCotaEsgotada: () => 'cota esgotada',
      };
    }
    if (nome.includes('assistant-learning')) {
      /* A conversa com o modelo tem suíte própria (test:assistente-*). Aqui
         ela só grava o prompt que recebeu, que é onde a memória tem de chegar. */
      return {
        conduzirConversa: async ({ messages }) => {
          diario.prompts.push(messages[0].content);
          return { resposta: 'resposta do teste', registros: [], recuperado: false };
        },
        respostaFinalSegura: (resposta) => resposta,
        exemploElegivel: () => false,
        feedbackExplicito: () => null,
      };
    }
    if (nome.includes('seguranca')) {
      return {
        fetchComTimeout: async () => { diario.modelo++; throw new Error('o teste nao deveria chegar no modelo'); },
        criarRateLimiter: () => () => false,
      };
    }
    /* Os demais compartilhados não participam da decisão de portão; um Proxy
       devolve algo inofensivo para qualquer nome que o módulo importe. */
    return new Proxy({}, {
      get: (_alvo, prop) => {
        if (prop === '__esModule') return false;
        if (typeof prop !== 'string') return undefined;
        if (prop === 'CATEGORIES' || prop === 'CATEGORY_KEYWORDS') return [];
        return () => undefined;
      },
    });
  };

  const module = { exports: {} };
  vm.runInNewContext(codigo, {
    module,
    exports: module.exports,
    require: requireStub,
    console: consoleFake,
    Date, JSON, Math, String, Number, Object, Array, Set, Map, RegExp, Error, Promise,
    Response, Request, Headers, URL, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, AbortController,
    fetch: async () => { diario.modelo++; throw new Error('o teste nao deveria chegar no modelo'); },
    Deno: {
      env: {
        get: (chave) => ({
          GEMINI_API_KEY: 'chave-de-teste',
          SUPABASE_URL: 'https://exemplo.supabase.co',
          SUPABASE_ANON_KEY: 'anon',
        })[chave] ?? '',
      },
      serve: (fn) => { handler = fn; },
    },
  });

  if (!handler) throw new Error('o modulo nao registrou nenhum handler em Deno.serve');
  return { handler, diario };
}

function pedido() {
  return new Request('https://exemplo.supabase.co/functions/v1/assistente-financeiro', {
    method: 'POST',
    headers: { Authorization: 'Bearer token-de-teste', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensagem: 'quanto gastei esse mes?' }),
  });
}

(async () => {
  /* -- 1 e 2. Conta bloqueada ------------------------------------------ */
  {
    const { handler, diario } = carregar({ acesso: false });
    const res = await handler(pedido());
    const corpo = await res.json();
    conferir('conta bloqueada recebe 403', res.status === 403, res.status);
    conferir('com o codigo que diz o motivo', corpo.code === 'sem_assinatura', corpo.code);
    conferir('e um recado que explica, nao um erro generico', /assinatura/i.test(corpo.mensagem ?? ''), corpo.mensagem);
    conferir('a cota de IA NAO e consumida', diario.cota === 0, diario.cota);
    conferir('o modelo nao chega a ser chamado', diario.modelo === 0, diario.modelo);
    conferir('o direito de acesso foi de fato consultado', diario.rpcs.includes('tem_direito_acesso'), diario.rpcs);
    conferir('conta bloqueada nem le a memoria do assistente',
      !diario.consultas.some((c) => c.tabela === 'assistant_memory') && !diario.rpcs.includes('buscar_exemplos_similares'),
      diario.consultas.map((c) => c.tabela));
    conferir('e a recusa nao loga erro', diario.erros.length === 0, diario.erros);
  }

  /* -- 3. Nao deu para confirmar -> recusa ------------------------------ */
  {
    const { handler, diario } = carregar({ acesso: null, acessoError: { code: '57014', message: 'timeout' } });
    const res = await handler(pedido());
    conferir('falha ao consultar o acesso recusa, e nao libera', res.status === 503, res.status);
    conferir('e tambem nao gasta cota', diario.cota === 0, diario.cota);
    conferir('e deixa recibo no log', diario.erros.some((e) => e.includes('direito de acesso')), diario.erros);
  }

  /* -- 4. Conta com acesso passa do portao ------------------------------ */
  {
    const { handler, diario } = carregar({ acesso: true });
    const res = await handler(pedido());
    const corpo = await res.json();
    conferir('conta com acesso nao e barrada pelo portao', res.status !== 403, res.status);
    conferir('e o fluxo segue ate consumir a cota', diario.cota === 1, diario.cota);
    conferir('e termina em 200 com a resposta da conversa', res.status === 200 && corpo.resposta === 'resposta do teste', { status: res.status, corpo });
    conferir('sem nenhum erro no log (memoria e resposta)', diario.erros.length === 0, diario.erros);

    const memoria = diario.consultas.filter((c) => c.tabela === 'assistant_memory');
    const temOp = (c, op, a, b) => c.ops.some(([o, args]) => o === op && args[0] === a && (b === undefined || args[1] === b));
    conferir('le o vocabulario do proprio usuario',
      memoria.some((c) => temOp(c, 'eq', 'user_id', 'usuario-1') && temOp(c, 'eq', 'tipo', 'vocabulario') && temOp(c, 'limit', 20)),
      memoria.map((c) => c.ops));
    conferir('le os fatos sem o estado da conversa (.neq chave __conversa)',
      memoria.some((c) => temOp(c, 'eq', 'user_id', 'usuario-1') && temOp(c, 'eq', 'tipo', 'fato') && temOp(c, 'neq', 'chave', '__conversa') && temOp(c, 'limit', 10)),
      memoria.map((c) => c.ops));
    conferir('busca os exemplos parecidos', diario.rpcs.includes('buscar_exemplos_similares'), diario.rpcs);

    const prompt = diario.prompts[0] ?? '';
    conferir('a conversa recebe um prompt so', diario.prompts.length === 1, diario.prompts.length);
    conferir('o vocabulario carregado chega ao prompt', prompt.includes('"rango" = Alimentacao'), prompt.slice(0, 400));
    conferir('o fato carregado chega ao prompt', prompt.includes('chave=salario: recebe no dia 5'));
    conferir('a preferencia carregada chega ao prompt', prompt.includes('chave=formato: respostas curtas'));
    conferir('o exemplo verificado chega ao prompt', prompt.includes('quanto gastei com rango?'));
    conferir('o modelo real continua sem ser chamado', diario.modelo === 0, diario.modelo);
  }

  /* -- 5. A porta de tras do banco -------------------------------------- */
  {
    const schema = fs.readFileSync('supabase/schema.sql', 'utf8');
    for (const tabela of ['assistant_messages', 'assistant_memory']) {
      conferir(
        `${tabela}: escrita exige direito de acesso`,
        schema.includes(`create policy "${tabela}: dono com acesso escreve"`)
      );
      conferir(
        `${tabela}: leitura continua livre para o dono (export da LGPD)`,
        schema.includes(`create policy "${tabela}: dono le sempre"`)
      );
    }
    const depoisDaTroca = schema.slice(schema.indexOf('create policy "assistant_messages: dono le sempre"'));
    conferir(
      'a politica antiga, sem checagem de assinatura, nao volta depois',
      !/create policy "usuario acessa propri[ao] (historico|memoria)"/.test(depoisDaTroca)
    );
  }

  console.log(`\n${total - falhas}/${total} checagens da recusa do Granabo passaram — ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
})().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
