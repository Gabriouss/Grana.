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
 * 4. com direito de acesso, o pedido passa do portão normalmente;
 * 5. a porta de trás do banco continua fechada, com a leitura livre.
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
function carregar({ acesso, acessoError = null }) {
  const diario = { cota: 0, modelo: 0, rpcs: [] };
  let handler = null;

  const clienteFake = {
    auth: { getUser: async () => ({ data: { user: { id: 'usuario-1' } }, error: null }) },
    rpc: async (nome) => {
      diario.rpcs.push(nome);
      if (nome === 'tem_direito_acesso') return { data: acesso, error: acessoError };
      return { data: null, error: null };
    },
    from: () => {
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q, gte: () => q,
        lte: () => q, not: () => q, insert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolver) => resolver({ data: [], error: null }),
      };
      return q;
    },
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
    console,
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
  }

  /* -- 3. Nao deu para confirmar -> recusa ------------------------------ */
  {
    const { handler, diario } = carregar({ acesso: null, acessoError: { code: '57014', message: 'timeout' } });
    const res = await handler(pedido());
    conferir('falha ao consultar o acesso recusa, e nao libera', res.status === 503, res.status);
    conferir('e tambem nao gasta cota', diario.cota === 0, diario.cota);
  }

  /* -- 4. Conta com acesso passa do portao ------------------------------ */
  {
    const { handler, diario } = carregar({ acesso: true });
    const res = await handler(pedido());
    conferir('conta com acesso nao e barrada pelo portao', res.status !== 403, res.status);
    conferir('e o fluxo segue ate consumir a cota', diario.cota === 1, diario.cota);
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
