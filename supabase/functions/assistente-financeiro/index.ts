// Grana. — Granabô, assistente financeiro com IA
//
// Edge Function que recebe a pergunta do usuário, chama o LLM com tool
// calling, executa as ferramentas determinísticas contra o Supabase, e
// devolve a resposta final.
//
// O LLM NUNCA vê o banco de dados nem gera valores em R$ por conta própria:
// ele escolhe qual ferramenta chamar, a ferramenta busca o número real, e o
// modelo só transforma esse número em frase natural. Isso garante que todo
// valor financeiro exibido ao usuário veio de uma consulta real, testada —
// nunca de geração livre.
//
// Configuração (supabase secrets set):
//   GEMINI_API_KEY    — modelo de chat
//   SUPABASE_URL      — já existe
//   SUPABASE_ANON_KEY — já existe
//
// Publicar COM verificação de JWT (o padrão):
//   supabase functions deploy assistente-financeiro

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.112.3/cors';
/* Mesmo dicionário sinônimo->categoria do whatsapp-webhook (mercado, ifood,
   uber, netflix... -> categoria real), compartilhado via _shared pra
   resolver sinônimo de forma DETERMINÍSTICA pra qualquer usuário, sem
   depender do modelo entender sozinho (achado testando em produção: "comida"
   às vezes resolve pra "Alimentação" sozinho, "mercado" não — inconsistente).
   Ver casarPorPalavraChave, mais abaixo. */
import { CATEGORY_KEYWORDS, normalizarParaBusca, contemPalavra } from '../_shared/category-keywords.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

/* Por que Gemini e não Groq, apesar de a Groq já estar configurada:
   a conta Groq deste projeto NÃO tem acesso a nenhum modelo Llama de chat.
   Verificado contra a própria API em 05/09/2026 — `llama-3.1-8b-instant` e
   `llama-3.3-70b-versatile` responderam 404 `model_not_found`, e a listagem
   de modelos da conta traz só Whisper (áudio), classificadores e os
   `openai/gpt-oss-*`, que são COBRADOS por token. Como custo zero é
   requisito, o chat migrou pro free tier do Gemini.

   A chave da Groq continua em uso e intocada: é ela que transcreve a voz em
   `processar-lancamento-voz`. São dois provedores para dois trabalhos.

   O endpoint do Gemini abaixo é o COMPATÍVEL com a API da OpenAI, e é isso
   que permite `tools`/`tool_choice` no mesmo formato — as ferramentas e o
   fluxo de duas passadas não mudaram uma linha ao trocar de provedor.

   Por que `gemini-3.5-flash-lite` e não `gemini-3.8-flash`: confirmado no
   painel de rate limits do AI Studio em 06/09/2026 — `gemini-3.8-flash`
   tem RPD (requisições por dia) = 20 no free tier deste projeto, o mesmo
   valor de TODA a linha "Flash" não-Lite (3.5, 3.6, 3.7, 3.8). Como cada
   pergunta do usuário gasta 2 chamadas (a de tool-calling e a de
   follow-up), 20/dia RPD sustenta ~10 perguntas por dia PRO APP INTEIRO,
   todos os usuários somados — foi o que estourou a cota no meio de uma
   bateria de teste. As variantes "Lite" (3.1 e 3.5) têm RPD = 500 e
   RPM = 15 (contra 5), 25x mais requisições diárias pelo mesmo custo
   zero. Escolhido 3.5 por ser a mais recente das duas com esse limite. */
const MODELO = 'gemini-3.5-flash-lite';
const CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/* ── Rate limit best-effort ──────────────────────────────────────────────── */

const JANELA_MS = 60_000;
const MAX_POR_JANELA = 10;
const usoRecente = new Map<string, number[]>();

function excedeuRateLimit(userId: string): boolean {
  const agora = Date.now();
  const anteriores = (usoRecente.get(userId) ?? []).filter((t) => agora - t < JANELA_MS);
  anteriores.push(agora);
  usoRecente.set(userId, anteriores);
  return anteriores.length > MAX_POR_JANELA;
}

/* ── Fetch com timeout ───────────────────────────────────────────────────── */

async function fetchComTimeout(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** '2026-09-06' -> '06/09/2026'. Só para o rótulo lido pelo usuário. */
function dataBR(isoStr: string): string {
  const [a, m, d] = isoStr.split('-');
  return `${d}/${m}/${a}`;
}

type ArgsPeriodo = {
  ultimos_dias?: number;
  desde?: string;
  ate?: string;
  mes?: number;
  ano?: number;
  ano_inteiro?: boolean;
};

type Periodo = { inicio: string; fim: string; rotulo: string };

/**
 * Resolve as QUATRO formas de dizer um período, em ordem de precedência:
 * janela móvel ("últimos 15 dias"), intervalo explícito, ano inteiro, e
 * mês fechado. Sem nenhum argumento devolve o mês corrente, que era o
 * único comportamento possível antes disto — então nenhuma pergunta que
 * já funcionava muda de resposta.
 *
 * O `rotulo` não é enfeite: ele volta junto com os números e o system
 * prompt obriga a citá-lo. Sem isso o modelo responde "você gastou
 * R$ 340,00" sem dizer de qual janela, e quem perguntou "últimos 15
 * dias" entende que é do mês. Vem sem preposição ("últimos 15 dias", não
 * "nos últimos 15 dias") pra caber em qualquer frase.
 */
function resolverPeriodo(args: ArgsPeriodo): Periodo | { erro: string } {
  const hoje = new Date();

  // 1. Janela móvel. Atravessa virada de mês e de ano sem tratamento
  //    especial: setDate() com valor negativo já rola pro mês anterior.
  if (typeof args.ultimos_dias === 'number' && Number.isFinite(args.ultimos_dias) && args.ultimos_dias > 0) {
    const n = Math.min(Math.round(args.ultimos_dias), 3650);
    const inicio = new Date(hoje);
    /* INCLUI hoje: "últimos 15 dias" = hoje + os 14 anteriores. É a
       leitura natural em português, e a alternativa erra por um dia
       todo dia. */
    inicio.setDate(inicio.getDate() - (n - 1));
    return { inicio: iso(inicio), fim: iso(hoje), rotulo: `últimos ${n} dias` };
  }

  /* 2. Intervalo explícito. O formato é validado porque uma string
        malformada iria direto pro .gte()/.lte(), voltaria vazia, e o
        modelo leria isso como "gastou zero" — a mentira exata que o
        desenho com ferramentas existe pra impedir. */
  if (args.desde || args.ate) {
    const inicio = args.desde && DATA_ISO.test(args.desde) ? args.desde : null;
    const fim = args.ate && DATA_ISO.test(args.ate) ? args.ate : iso(hoje);
    if (!inicio) return { erro: 'Data inicial ausente ou inválida. Use o formato AAAA-MM-DD.' };
    if (args.ate && !DATA_ISO.test(args.ate)) return { erro: 'Data final inválida. Use o formato AAAA-MM-DD.' };
    if (inicio > fim) return { erro: 'A data inicial é posterior à final.' };
    return { inicio, fim, rotulo: `${dataBR(inicio)} a ${dataBR(fim)}` };
  }

  // 3. Ano inteiro.
  const ano = args.ano ?? hoje.getFullYear();
  if (args.ano_inteiro && args.mes === undefined) {
    return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, rotulo: `${ano}` };
  }

  // 4. Mês fechado. Parâmetro público em 1-12, convertido pra 0-11 só aqui.
  const mesPedido = args.mes ?? hoje.getMonth() + 1;
  if (mesPedido < 1 || mesPedido > 12) return { erro: `Mês inválido: ${mesPedido}. Use de 1 a 12.` };
  const mes = mesPedido - 1;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const nomeMes = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return {
    inicio: `${ano}-${pad(mes + 1)}-01`,
    fim: `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}`,
    rotulo: `${nomeMes} de ${ano}`,
  };
}

/** Argumentos de período que toda ferramenta com data expõe ao modelo. */
const PROPS_PERIODO = {
  ultimos_dias: {
    type: 'number',
    description: 'Janela móvel terminando hoje. Ex.: 15 para "nos últimos 15 dias", 30 para "no último mês corrido". Inclui o dia de hoje.',
  },
  desde: { type: 'string', description: 'Início de um intervalo explícito, no formato AAAA-MM-DD.' },
  ate: { type: 'string', description: 'Fim de um intervalo explícito, no formato AAAA-MM-DD. Omita para usar hoje.' },
  mes: { type: 'number', description: 'Mês fechado, de 1 (janeiro) a 12 (dezembro). Use junto com "ano".' },
  ano: { type: 'number', description: 'Ano com quatro dígitos. Ex.: 2026.' },
  ano_inteiro: { type: 'boolean', description: 'true para somar o ano inteiro indicado em "ano", de 1º de janeiro a 31 de dezembro.' },
} as const;

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compara nomes ignorando acento e caixa. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Casa o nome que o modelo pediu contra os nomes REAIS do usuário
 * (categoria, cartão, carteira). Exato primeiro, parcial depois. Devolve
 * `null` quando não casa, pra quem chamou poder responder com a lista
 * real em vez de somar zero linha e afirmar R$ 0,00.
 */
function casarNome(nomes: string[], pedido: string): string | null {
  const alvo = normalizar(pedido);
  if (!alvo) return null;
  return (
    nomes.find((n) => normalizar(n) === alvo) ??
    nomes.find((n) => normalizar(n).includes(alvo) || alvo.includes(normalizar(n))) ??
    null
  );
}

/**
 * Resolve sinônimo de categoria contra CATEGORY_KEYWORDS (o mesmo dicionário
 * do whatsapp-webhook: "mercado"/"ifood"/"uber"/"netflix"... -> categoria
 * real), DETERMINÍSTICO pra qualquer usuário — ao contrário do modelo, que
 * às vezes entende o sinônimo sozinho e às vezes não (achado testando em
 * produção: "comida" resolveu pra "Alimentação" sozinho numa pergunta, mas
 * "mercado" não resolveu na outra, mesmo sendo o mesmo tipo de sinônimo).
 *
 * Só resolve pra uma categoria que o usuário TEM de verdade — as 9 chaves de
 * CATEGORY_KEYWORDS são as categorias PADRÃO, mas o usuário pode ter
 * renomeado ou excluído qualquer uma delas, então `nomes.includes(catName)`
 * é obrigatório antes de aceitar o casamento.
 */
function casarPorPalavraChave(nomes: string[], pedido: string): string | null {
  const alvo = normalizarParaBusca(pedido);
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!nomes.includes(catName)) continue;
    if (keywords.some((kw) => contemPalavra(alvo, kw))) return catName;
  }
  return null;
}

/**
 * Mesma resolução de `casarNome`, mas com memória: um apelido que este
 * usuário já usou antes pra este domínio ('categoria' | 'cartao' |
 * 'carteira') é lembrado e passa a resolver DIRETO, sem depender do
 * casamento difuso de novo. Quando o difuso resolve algo, o apelido é
 * gravado pra a próxima chamada já cair no atalho — é o mecanismo
 * "aprender vocabulário": um apelido não coberto por CATEGORY_KEYWORDS vira
 * conhecido uma vez, e da segunda pergunta em diante nem precisa mais da
 * heurística difusa.
 *
 * Ordem de resolução: exato -> memória pessoal (uma correção já ensinada
 * pelo usuário sempre vale mais que uma suposição genérica) -> dicionário de
 * sinônimo padrão (só pra domínio 'categoria', determinístico, sem custo de
 * rede) -> casamento difuso por trecho de texto (último recurso, e o único
 * que aprende).
 *
 * Falha de leitura/escrita na memória NUNCA impede a resposta: é reforço
 * de aprendizado, não parte crítica do caminho de resolver o nome.
 */
async function casarNomeComMemoria(
  supabase: SupabaseClient,
  userId: string,
  dominio: 'categoria' | 'cartao' | 'carteira',
  nomes: string[],
  pedido: string
): Promise<string | null> {
  const alvo = normalizar(pedido);
  if (!alvo) return null;

  const exato = nomes.find((n) => normalizar(n) === alvo);
  if (exato) return exato;

  try {
    const { data } = await supabase
      .from('assistant_memory')
      .select('valor')
      .eq('user_id', userId)
      .eq('tipo', 'vocabulario')
      .eq('chave', `${dominio}:${alvo}`)
      .maybeSingle();
    const lembrado = data?.valor as string | undefined;
    /* Só usa se o nome lembrado ainda existir de verdade — evita responder
       com uma categoria/cartão/carteira que foi renomeada ou excluída
       desde que o apelido foi aprendido. */
    if (lembrado && nomes.includes(lembrado)) return lembrado;
  } catch (e) {
    console.error('[assistente-financeiro] erro ao ler vocabulário:', e);
  }

  if (dominio === 'categoria') {
    const porPalavraChave = casarPorPalavraChave(nomes, pedido);
    if (porPalavraChave) return porPalavraChave;
  }

  const difuso = nomes.find((n) => normalizar(n).includes(alvo) || alvo.includes(normalizar(n))) ?? null;
  if (difuso) {
    try {
      await supabase.rpc('registrar_memoria_assistente', {
        p_user_id: userId, p_tipo: 'vocabulario', p_chave: `${dominio}:${alvo}`, p_valor: difuso,
      });
    } catch (e) {
      console.error('[assistente-financeiro] erro ao gravar vocabulário:', e);
    }
  }
  return difuso;
}

/* ── Ferramentas (tool definitions para o LLM) ───────────────────────────── */

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'consultarLancamentos',
      description:
        'Consulta LIVRE sobre os lançamentos do usuário. É a ferramenta mais poderosa e deve ser a ' +
        'primeira escolha para qualquer pergunta sobre gastos, receitas ou compras que as outras ' +
        'ferramentas não cubram exatamente. Combine filtros à vontade. ' +
        'Exemplos: "meu maior gasto do ano" (operacao=maior, ano_inteiro), ' +
        '"quantas vezes pedi iFood" (descricao_contem=iFood, operacao=contar), ' +
        '"quanto gastei parcelado no Nubank" (cartao=Nubank, apenas_parcelados=true, operacao=somar), ' +
        '"quanto gastei por categoria em agosto" (agrupar_por=categoria, mes=8), ' +
        '"gastos acima de 200 reais" (valor_minimo=200, operacao=listar).',
      parameters: {
        type: 'object',
        properties: {
          ...PROPS_PERIODO,
          tipo: { type: 'string', enum: ['in', 'out'], description: '"out" para gastos/saídas, "in" para receitas/entradas. Omita para incluir os dois.' },
          categoria: { type: 'string', description: 'Nome da categoria, do jeito que o usuário falou. Será casado com as categorias reais dele.' },
          descricao_contem: { type: 'string', description: 'Trecho do texto da descrição. Ex.: "iFood", "Uber", "farmácia".' },
          forma_pagamento: { type: 'string', description: 'Forma de pagamento. Ex.: "credit", "debit", "pix", "dinheiro".' },
          cartao: { type: 'string', description: 'Nome do cartão de crédito, do jeito que o usuário falou.' },
          carteira: { type: 'string', description: 'Nome da carteira/conta, do jeito que o usuário falou.' },
          banco: { type: 'string', description: 'Nome do banco.' },
          valor_minimo: { type: 'number', description: 'Considera apenas lançamentos de valor maior ou igual a este.' },
          valor_maximo: { type: 'number', description: 'Considera apenas lançamentos de valor menor ou igual a este.' },
          apenas_parcelados: { type: 'boolean', description: 'true para considerar apenas compras parceladas.' },
          apenas_recorrentes: { type: 'boolean', description: 'true para considerar apenas lançamentos recorrentes.' },
          operacao: {
            type: 'string',
            enum: ['somar', 'contar', 'media', 'listar', 'maior', 'menor'],
            description: 'O que fazer com os lançamentos filtrados. "somar" é o padrão para "quanto gastei".',
          },
          agrupar_por: {
            type: 'string',
            enum: ['categoria', 'mes', 'forma_pagamento', 'cartao', 'descricao'],
            description: 'Quebra o resultado em grupos. Use para perguntas do tipo "quanto gastei em cada X".',
          },
          limite: { type: 'number', description: 'Quantas linhas ou grupos devolver. Padrão 10, máximo 50.' },
        },
        required: ['operacao'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'gastoPorCategoria',
      description:
        'Retorna o total gasto em UMA categoria, em qualquer período. ' +
        'Use quando o usuário perguntar "quanto gastei em Alimentação", "gastos com Transporte nos últimos 15 dias", etc.',
      parameters: {
        type: 'object',
        properties: {
          ...PROPS_PERIODO,
          categoria: {
            type: 'string',
            /* NÃO listar categorias de exemplo aqui. A lista anterior trazia
               seis nomes ("Alimentação", "Transporte", ...) e o modelo passou
               a tratá-la como A lista de categorias existentes, recusando
               consultar qualquer outra — mesmo o código sabendo resolver
               qualquer nome contra as categorias reais do usuário. */
            description:
              'Nome da categoria exatamente como o usuário falou. Cada usuário cria as próprias ' +
              'categorias, então NUNCA presuma que uma categoria não existe: sempre tente consultar. ' +
              'Se o nome não casar, a ferramenta devolve a lista real das categorias dele.',
          },
        },
        required: ['categoria'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'boletosAVencer',
      description:
        'Retorna os boletos/contas a pagar pendentes num período. ' +
        'Use quando o usuário perguntar sobre boletos, contas a pagar, contas pendentes.',
      parameters: { type: 'object', properties: { ...PROPS_PERIODO }, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumoCredito',
      description:
        'Retorna o total gasto no cartão de crédito num período, com detalhamento por cartão. ' +
        'Use quando o usuário perguntar sobre fatura, cartão de crédito, gastos no crédito.',
      parameters: { type: 'object', properties: { ...PROPS_PERIODO }, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'livreParaGastar',
      description:
        'Retorna quanto o usuário ainda pode gastar no MÊS ATUAL sem comprometer as contas fixas. ' +
        'É o "livre para gastar": receitas menos gastos menos boletos pendentes. ' +
        'Use quando o usuário perguntar "quanto posso gastar", "quanto tenho livre", "quanto sobra". ' +
        'Só existe para o mês corrente, porque é uma projeção dos dias que ainda faltam. ' +
        'Para saber quanto sobrou num mês já fechado, use resumoMes.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumoMes',
      description:
        'Retorna uma visão geral de um período: total de receitas, total de gastos e saldo. ' +
        'Use quando o usuário perguntar "como está meu mês", "resumo do mês", "quanto sobrou em maio", ' +
        '"como estão minhas finanças".',
      parameters: { type: 'object', properties: { ...PROPS_PERIODO }, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumoMetas',
      description:
        'Retorna as metas/cofrinhos do usuário: quanto já foi guardado, quanto falta e o prazo. ' +
        'Use para "quanto já guardei", "quanto falta pra minha meta", "como estão meus cofrinhos".',
      parameters: {
        type: 'object',
        properties: {
          meta: { type: 'string', description: 'Nome da meta, se o usuário citou uma específica. Omita para listar todas.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'comprometimentoFuturo',
      description:
        'Projeta quanto já está comprometido nos próximos meses (contas recorrentes + parcelas de compras parceladas). ' +
        'Use para "quanto tenho comprometido", "o que já está comprometido pra frente", "quanto vou pagar nos próximos meses".',
      parameters: {
        type: 'object',
        properties: {
          meses: { type: 'number', description: 'Quantos meses projetar, incluindo o atual. Padrão 6, máximo 24.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'alertaDeLimiteCartao',
      description:
        'Mostra quanto de cada limite de cartão de crédito já foi usado no mês atual. ' +
        'Use para "estou perto do limite", "quanto sobrou do meu limite", "como está meu cartão".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'perfilFinanceiro',
      description:
        'Retorna o perfil/arquétipo financeiro que o usuário obteve no diagnóstico do app. ' +
        'Use para "qual é o meu perfil", "qual meu arquétipo financeiro".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumoScoreERitmo',
      description:
        'Retorna o Score Grana (0 a 1000) e a sequência de dias seguidos registrando (Ritmo da Semana). ' +
        'Use para "qual meu score", "quantos dias seguidos venho registrando", "como está meu ritmo".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'retrospectivaDoMes',
      description:
        'Resumo completo do MÊS ANTERIOR já fechado: entradas, saídas, maior despesa, categoria campeã, ' +
        'boletos pagos, comprometido fixo e comparação com o mês anterior a esse. ' +
        'Use para "como foi meu mês passado", "resumo do mês anterior", "retrospectiva". ' +
        'Sempre o mês anterior ao atual — não aceita outro período.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lembrarFato',
      description:
        'Guarda um fato que o USUÁRIO AFIRMOU sobre a própria vida financeira, pra lembrar nas próximas conversas ' +
        '(ex.: "meu salário cai todo dia 5", "considero Mercado uma categoria essencial", "moro sozinho"). ' +
        'Use SOMENTE quando o usuário disser algo factual sobre si mesmo, com as próprias palavras. ' +
        'NUNCA use para registrar uma dedução ou opinião sua sobre o comportamento do usuário.',
      parameters: {
        type: 'object',
        properties: {
          chave: { type: 'string', description: 'Rótulo curto do fato, em minúsculas com underscore. Ex.: "dia_do_salario".' },
          fato: { type: 'string', description: 'O fato em si, como uma frase curta e objetiva.' },
        },
        required: ['chave', 'fato'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'naoConsegui',
      description:
        'Chame esta ferramenta, em vez de só escrever uma desculpa, sempre que NENHUMA outra ferramenta ' +
        'conseguir responder à pergunta. Isso registra a lacuna para que o time do Grana. saiba o que o ' +
        'assistente ainda não sabe responder — não é uma falha em chamá-la, é a forma certa de admitir o limite.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Por que não deu pra responder — o que faltou ou que tipo de pergunta é essa.' },
        },
        required: ['motivo'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ensinarApelido',
      description:
        'Registra que um apelido/sinônimo que o usuário usa corresponde a uma categoria, cartão ou carteira ' +
        'real dele (ex.: "comida" para a categoria "Alimentação", "nu" para o cartão "Nubank"). ' +
        'Use isso quando o usuário usar um nome que NÃO bate exatamente com nada, e você já sabe — porque ele ' +
        'confirmou nesta conversa, ou porque é um sinônimo óbvio de uma categoria/cartão/carteira real dele — ' +
        'qual é o nome de verdade. O casamento automático só reconhece nomes parecidos por trecho de texto ' +
        '(ex.: "Aliment" bate com "Alimentação" sozinho); sinônimos de verdade como "comida" só resolvem se ' +
        'você chamar esta ferramenta. Depois de ensinado, o apelido passa a resolver direto, sem perguntar de novo.',
      parameters: {
        type: 'object',
        properties: {
          dominio: { type: 'string', enum: ['categoria', 'cartao', 'carteira'], description: 'A que tipo de coisa o apelido se refere.' },
          apelido: { type: 'string', description: 'O termo que o usuário usou. Ex.: "comida".' },
          nome_real: { type: 'string', description: 'O nome exato, como está cadastrado no app. Ex.: "Alimentação".' },
        },
        required: ['dominio', 'apelido', 'nome_real'],
      },
    },
  },
];

/* ── Execução das ferramentas ────────────────────────────────────────────── */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/* `usuario` vem inteiro, e não só o id, porque o diagnóstico financeiro do
   app NÃO fica em tabela: vive em `user_metadata`, que a chamada de
   autenticação já devolve no início do handler. Passar o objeto adiante
   evita uma segunda ida à Auth API só pra ler algo que já está em mãos. */
type UsuarioAutenticado = { id: string; user_metadata?: Record<string, unknown> | null };

async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  usuario: UsuarioAutenticado
): Promise<string> {
  const userId = usuario.id;
  /* `livreParaGastar` é a única que IGNORA o período pedido: ela projeta o
     que ainda dá pra gastar nos dias que faltam, e essa pergunta não existe
     pra um mês já fechado. "Quanto sobrou em maio" é `resumoMes`. */
  const periodo = resolverPeriodo(nome === 'livreParaGastar' ? {} : (args as ArgsPeriodo));
  if ('erro' in periodo) return `${periodo.erro} Peça ao usuário para reformular o período.`;
  const { inicio, fim, rotulo } = periodo;

  switch (nome) {
    /* A ferramenta genérica: o modelo monta a ESPECIFICAÇÃO (filtros,
       operação, agrupamento) e o servidor executa. O modelo nunca escreve
       SQL, nunca escolhe tabela e nunca escapa do próprio usuário — cada
       campo é whitelist fechada e `user_id` é imposto aqui, além do RLS
       que já protege a tabela.

       Existe porque, antes dela, cada formato de pergunta só funcionava se
       alguém tivesse escrito uma ferramenta à mão pra ele — o que obrigava
       o dono do produto a virar catálogo de perguntas. Uma especificação
       combinável cobre milhares de formatos sem prever nenhum. */
    case 'consultarLancamentos': {
      const OPERACOES = ['somar', 'contar', 'media', 'listar', 'maior', 'menor'];
      const operacao = String(args.operacao ?? 'somar');
      if (!OPERACOES.includes(operacao)) {
        return `Operação inválida: "${operacao}". Use uma de: ${OPERACOES.join(', ')}.`;
      }

      const AGRUPAMENTOS = ['categoria', 'mes', 'forma_pagamento', 'cartao', 'descricao'];
      const agruparPor = args.agrupar_por === undefined ? null : String(args.agrupar_por);
      if (agruparPor !== null && !AGRUPAMENTOS.includes(agruparPor)) {
        return `Agrupamento inválido: "${agruparPor}". Use um de: ${AGRUPAMENTOS.join(', ')}.`;
      }

      const limite = Math.min(Math.max(Math.round(Number(args.limite ?? 10)) || 10, 1), 50);

      let q = supabase
        .from('transactions')
        .select('description, amount, category, occurred_on, type, payment_method, bank, card_id, wallet_id, installment_total, recurring')
        .eq('user_id', userId)
        .gte('occurred_on', inicio)
        .lte('occurred_on', fim);

      /* Todo filtro aplicado entra em `aplicados` e volta na resposta. Sem
         esse eco o modelo diz "R$ 340,00" sem dizer de quê nem de quando, e
         quem perguntou não tem como saber se foi entendido. */
      const aplicados: string[] = [`período: ${rotulo}`];

      if (args.tipo === 'in' || args.tipo === 'out') {
        q = q.eq('type', args.tipo);
        aplicados.push(args.tipo === 'out' ? 'apenas saídas' : 'apenas entradas');
      }

      if (args.categoria !== undefined && String(args.categoria).trim()) {
        const { data: cats, error: e } = await supabase.from('categories').select('name').eq('user_id', userId);
        if (e) throw e;
        const nomes: string[] = (cats ?? []).map((c: { name: string }) => c.name);
        const casada = await casarNomeComMemoria(supabase, userId, 'categoria', nomes, String(args.categoria));
        if (!casada) {
          return nomes.length
            ? `Não existe categoria chamada "${args.categoria}". As categorias do usuário são: ${nomes.join(', ')}. ` +
                'Pergunte qual delas ele quis dizer. Não invente um valor.'
            : 'O usuário ainda não tem nenhuma categoria cadastrada.';
        }
        q = q.eq('category', casada);
        aplicados.push(`categoria: ${casada}`);
      }

      if (args.cartao !== undefined && String(args.cartao).trim()) {
        const { data: cards, error: e } = await supabase.from('credit_cards').select('id, name').eq('user_id', userId);
        if (e) throw e;
        const lista = (cards ?? []) as Array<{ id: string; name: string }>;
        const casado = await casarNomeComMemoria(supabase, userId, 'cartao', lista.map((c) => c.name), String(args.cartao));
        if (!casado) {
          return lista.length
            ? `Não existe cartão chamado "${args.cartao}". Os cartões do usuário são: ${lista.map((c) => c.name).join(', ')}.`
            : 'O usuário não tem nenhum cartão de crédito cadastrado.';
        }
        q = q.eq('card_id', lista.find((c) => c.name === casado)?.id);
        aplicados.push(`cartão: ${casado}`);
      }

      if (args.carteira !== undefined && String(args.carteira).trim()) {
        const { data: ws, error: e } = await supabase.from('wallets').select('id, name').eq('user_id', userId);
        if (e) throw e;
        const lista = (ws ?? []) as Array<{ id: string; name: string }>;
        const casada = await casarNomeComMemoria(supabase, userId, 'carteira', lista.map((w) => w.name), String(args.carteira));
        if (!casada) {
          return lista.length
            ? `Não existe carteira chamada "${args.carteira}". As carteiras do usuário são: ${lista.map((w) => w.name).join(', ')}.`
            : 'O usuário não tem nenhuma carteira cadastrada.';
        }
        q = q.eq('wallet_id', lista.find((w) => w.name === casada)?.id);
        aplicados.push(`carteira: ${casada}`);
      }

      if (args.descricao_contem !== undefined && String(args.descricao_contem).trim()) {
        const termo = String(args.descricao_contem).trim();
        q = q.ilike('description', `%${termo}%`);
        aplicados.push(`descrição contém "${termo}"`);
      }
      if (args.forma_pagamento !== undefined && String(args.forma_pagamento).trim()) {
        q = q.eq('payment_method', String(args.forma_pagamento).trim());
        aplicados.push(`forma de pagamento: ${String(args.forma_pagamento).trim()}`);
      }
      if (args.banco !== undefined && String(args.banco).trim()) {
        q = q.ilike('bank', `%${String(args.banco).trim()}%`);
        aplicados.push(`banco: ${String(args.banco).trim()}`);
      }
      if (typeof args.valor_minimo === 'number' && Number.isFinite(args.valor_minimo)) {
        q = q.gte('amount', args.valor_minimo);
        aplicados.push(`valor a partir de R$ ${formatarBRL(args.valor_minimo)}`);
      }
      if (typeof args.valor_maximo === 'number' && Number.isFinite(args.valor_maximo)) {
        q = q.lte('amount', args.valor_maximo);
        aplicados.push(`valor até R$ ${formatarBRL(args.valor_maximo)}`);
      }
      if (args.apenas_parcelados === true) {
        q = q.gt('installment_total', 1);
        aplicados.push('apenas compras parceladas');
      }
      if (args.apenas_recorrentes === true) {
        q = q.eq('recurring', true);
        aplicados.push('apenas lançamentos recorrentes');
      }

      /* Busca TETO+1 pra detectar estouro. Truncar em silêncio devolveria
         uma soma menor que a real apresentada como se fosse o total, que é
         pior do que não responder. */
      const TETO = 5000;
      const { data, error } = await q.limit(TETO + 1);
      if (error) throw error;
      type LinhaTx = {
        description: string; amount: number; category: string; occurred_on: string;
        type: string; payment_method: string | null; card_id: string | null;
      };
      const linhasTx = (data ?? []) as LinhaTx[];
      if (linhasTx.length > TETO) {
        return `O período pedido tem mais de ${TETO} lançamentos, demais para somar de uma vez. ` +
          'Peça ao usuário para escolher um período menor.';
      }

      const filtros = aplicados.join('; ');
      if (linhasTx.length === 0) {
        return `Nenhum lançamento encontrado com estes filtros (${filtros}). ` +
          'Diga que não houve movimentação com esses critérios e cite os filtros usados.';
      }

      const soma = (ls: LinhaTx[]) => ls.reduce((s, t) => s + Number(t.amount), 0);
      const cabecalho = `Filtros aplicados (cite-os na resposta): ${filtros}.`;

      if (agruparPor) {
        /* Agrupar por cartão precisa do NOME. Sem isto a resposta sairia com
           o UUID do cartão no lugar do nome, que não diz nada a quem
           perguntou. Só busca quando o agrupamento é esse. */
        const nomePorCartao = new Map<string, string>();
        if (agruparPor === 'cartao') {
          const { data: cards } = await supabase.from('credit_cards').select('id, name').eq('user_id', userId);
          for (const c of (cards ?? []) as Array<{ id: string; name: string }>) nomePorCartao.set(c.id, c.name);
        }

        const chaveDe = (t: LinhaTx): string => {
          if (agruparPor === 'categoria') return t.category;
          if (agruparPor === 'mes') return t.occurred_on.slice(0, 7);
          if (agruparPor === 'forma_pagamento') return t.payment_method ?? 'não informado';
          if (agruparPor === 'cartao') {
            return t.card_id ? nomePorCartao.get(t.card_id) ?? 'cartão removido' : 'sem cartão';
          }
          return t.description;
        };
        const grupos = new Map<string, { total: number; qtd: number }>();
        for (const t of linhasTx) {
          const k = chaveDe(t);
          const g = grupos.get(k) ?? { total: 0, qtd: 0 };
          g.total += Number(t.amount);
          g.qtd += 1;
          grupos.set(k, g);
        }
        const ordenados = [...grupos.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, limite);
        const detalhe = ordenados
          .map(([k, g]) => `- ${k}: R$ ${formatarBRL(g.total)} (${g.qtd} lançamento(s))`)
          .join('\n');
        return `${cabecalho}\nAgrupado por ${agruparPor}. ` +
          `Total geral: R$ ${formatarBRL(soma(linhasTx))} em ${linhasTx.length} lançamento(s).\n${detalhe}`;
      }

      switch (operacao) {
        case 'contar':
          return `${cabecalho}\nQuantidade: ${linhasTx.length} lançamento(s), somando R$ ${formatarBRL(soma(linhasTx))}.`;
        case 'media':
          return `${cabecalho}\nMédia por lançamento: R$ ${formatarBRL(soma(linhasTx) / linhasTx.length)} ` +
            `(${linhasTx.length} lançamentos, total de R$ ${formatarBRL(soma(linhasTx))}).`;
        case 'maior':
        case 'menor': {
          const ordenadas = [...linhasTx].sort((a, b) =>
            operacao === 'maior' ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount)
          );
          const t = ordenadas[0];
          return `${cabecalho}\n${operacao === 'maior' ? 'Maior' : 'Menor'} lançamento: ${t.description}, ` +
            `R$ ${formatarBRL(Number(t.amount))}, em ${dataBR(t.occurred_on)}, categoria ${t.category}.`;
        }
        case 'listar': {
          const ordenadas = [...linhasTx].sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1)).slice(0, limite);
          const detalhe = ordenadas
            .map((t) => `- ${dataBR(t.occurred_on)}: ${t.description}, R$ ${formatarBRL(Number(t.amount))} (${t.category})`)
            .join('\n');
          const sobra = linhasTx.length - ordenadas.length;
          return `${cabecalho}\nTotal: R$ ${formatarBRL(soma(linhasTx))} em ${linhasTx.length} lançamento(s).\n` +
            `${detalhe}${sobra > 0 ? `\n(e mais ${sobra} não listados)` : ''}`;
        }
        default:
          return `${cabecalho}\nTotal: R$ ${formatarBRL(soma(linhasTx))} em ${linhasTx.length} lançamento(s).`;
      }
    }

    case 'gastoPorCategoria': {
      const pedida = String(args.categoria ?? '').trim();
      if (!pedida) return 'Nenhuma categoria foi informada na pergunta.';

      /* Resolver o nome contra as categorias REAIS do usuário antes de somar.
         Sem isto, um nome que o modelo inventou ("Comida" quando a categoria
         se chama "Alimentação") não casa com linha nenhuma, a soma dá zero, e
         o assistente afirma "você gastou R$ 0,00" com toda a confiança — a
         mentira exata que o desenho com ferramentas existe pra impedir. Zero
         só pode ser dito quando a categoria existe E não teve gasto. */
      const { data: categorias, error: erroCategorias } = await supabase
        .from('categories')
        .select('name')
        .eq('user_id', userId);
      if (erroCategorias) throw erroCategorias;

      const nomes: string[] = (categorias ?? []).map((c: { name: string }) => c.name);
      const casada = await casarNomeComMemoria(supabase, userId, 'categoria', nomes, pedida);

      if (!casada) {
        return nomes.length
          ? `Não existe categoria chamada "${pedida}". As categorias do usuário são: ${nomes.join(', ')}. ` +
              'Diga isso ao usuário e pergunte qual delas ele quis dizer. Não invente um valor.'
          : 'O usuário ainda não tem nenhuma categoria cadastrada.';
      }

      const { data, error } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', userId)
        .eq('type', 'out')
        .eq('category', casada)
        .gte('occurred_on', inicio)
        .lte('occurred_on', fim);
      if (error) throw error;
      const total = (data ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
      return `O usuário gastou R$ ${formatarBRL(total)} em ${casada}. Período consultado: ${rotulo}. Cite esse período na resposta.`;
    }

    case 'boletosAVencer': {
      const { data, error } = await supabase
        .from('bills')
        .select('description, amount, due_date')
        .eq('user_id', userId)
        .eq('status', 'due')
        .gte('due_date', inicio)
        .lte('due_date', fim)
        .order('due_date', { ascending: true });
      if (error) throw error;
      const linhas = data ?? [];
      const total = linhas.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);
      if (linhas.length === 0) return `O usuário não tem boletos pendentes no período consultado: ${rotulo}.`;
      const detalhe = linhas
        .map((b: { description: string; amount: number; due_date: string }) => {
          const dia = b.due_date.split('-')[2];
          return `- ${b.description}: R$ ${formatarBRL(Number(b.amount))} (vence dia ${parseInt(dia)})`;
        })
        .join('\n');
      return `O usuário tem R$ ${formatarBRL(total)} em ${linhas.length} boleto(s) pendente(s). ` +
        `Período consultado: ${rotulo}. Cite esse período na resposta.\n${detalhe}`;
    }

    case 'resumoCredito': {
      const [cartoes, gastosResult] = await Promise.all([
        supabase
          .from('credit_cards')
          .select('id, name, limit_amount')
          .eq('user_id', userId),
        supabase
          .from('transactions')
          .select('amount, card_id')
          .eq('user_id', userId)
          .eq('payment_method', 'credit')
          .gte('occurred_on', inicio)
          .lte('occurred_on', fim),
      ]);
      if (gastosResult.error) throw gastosResult.error;
      const linhas = gastosResult.data ?? [];
      const total = linhas.reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
      const cards = cartoes.data ?? [];
      if (cards.length <= 1) {
        return `O usuário gastou R$ ${formatarBRL(total)} no crédito. Período consultado: ${rotulo}. Cite esse período na resposta.`;
      }
      const porCartao = cards
        .map((c: { id: string; name: string; limit_amount: number }) => {
          const gastoCartao = linhas
            .filter((t: { card_id: string }) => t.card_id === c.id)
            .reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
          return `- ${c.name}: R$ ${formatarBRL(gastoCartao)} (limite: R$ ${formatarBRL(Number(c.limit_amount))})`;
        })
        .join('\n');
      return `O usuário gastou R$ ${formatarBRL(total)} no crédito. ` +
        `Período consultado: ${rotulo}. Cite esse período na resposta.\n${porCartao}`;
    }

    case 'livreParaGastar': {
      const [txResult, billsResult, goalsResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('type, amount, occurred_on')
          .eq('user_id', userId)
          .gte('occurred_on', inicio)
          .lte('occurred_on', fim),
        supabase
          .from('bills')
          .select('amount, due_date, status')
          .eq('user_id', userId)
          .eq('status', 'due')
          .gte('due_date', inicio)
          .lte('due_date', fim),
        supabase.from('goals').select('current_amount').eq('user_id', userId),
      ]);
      if (txResult.error) throw txResult.error;
      if (billsResult.error) throw billsResult.error;

      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = hoje.getMonth();

      const saldo = (txResult.data ?? [])
        .filter((t: { occurred_on: string }) => {
          const d = new Date(t.occurred_on + 'T00:00:00');
          return d.getFullYear() === ano && d.getMonth() === mes;
        })
        .reduce(
          (s: number, t: { type: string; amount: number }) =>
            s + (t.type === 'in' ? Number(t.amount) : -Number(t.amount)),
          0
        );

      const contasPendentes = (billsResult.data ?? []).reduce(
        (s: number, b: { amount: number }) => s + Number(b.amount),
        0
      );

      const metas = (goalsResult.data ?? []).reduce(
        (s: number, g: { current_amount: number }) => s + Number(g.current_amount),
        0
      );

      const livre = Math.max(0, saldo - contasPendentes - metas);
      const ultimoDia = new Date(ano, mes + 1, 0).getDate();
      const diasRestantes = Math.max(1, ultimoDia - hoje.getDate() + 1);
      const porDia = livre / diasRestantes;

      return (
        `Livre para gastar em ${rotulo}: R$ ${formatarBRL(livre)}\n` +
        `Isso dá R$ ${formatarBRL(porDia)} por dia (${diasRestantes} dias restantes).\n` +
        `Detalhes: saldo R$ ${formatarBRL(saldo)}, contas pendentes R$ ${formatarBRL(contasPendentes)}, ` +
        `guardado em metas R$ ${formatarBRL(metas)}.`
      );
    }

    case 'resumoMes': {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', userId)
        .gte('occurred_on', inicio)
        .lte('occurred_on', fim);
      if (error) throw error;
      const linhas = data ?? [];
      const receitas = linhas
        .filter((t: { type: string }) => t.type === 'in')
        .reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
      const gastos = linhas
        .filter((t: { type: string }) => t.type === 'out')
        .reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
      const saldo = receitas - gastos;
      return (
        `Resumo do período consultado (${rotulo}), que deve ser citado na resposta:\n` +
        `- Receitas: R$ ${formatarBRL(receitas)}\n` +
        `- Gastos: R$ ${formatarBRL(gastos)}\n` +
        `- Saldo: R$ ${formatarBRL(saldo)} (${saldo >= 0 ? 'positivo' : 'negativo'})`
      );
    }

    /* SELECT direto — current_amount/target_amount já vêm prontos da tabela,
       sem cálculo nenhum a reproduzir. */
    case 'resumoMetas': {
      const { data, error } = await supabase
        .from('goals')
        .select('title, target_amount, current_amount, deadline')
        .eq('user_id', userId);
      if (error) throw error;
      const metas = (data ?? []) as Array<{ title: string; target_amount: number; current_amount: number; deadline: string | null }>;
      if (metas.length === 0) return 'O usuário ainda não tem nenhuma meta/cofrinho cadastrado.';

      const pedida = args.meta !== undefined && String(args.meta).trim() ? String(args.meta).trim() : null;
      const casada = pedida ? casarNome(metas.map((m) => m.title), pedida) : null;
      if (pedida && !casada) {
        return `Não existe meta chamada "${pedida}". As metas do usuário são: ${metas.map((m) => m.title).join(', ')}.`;
      }

      const linha = (m: (typeof metas)[number]) => {
        const falta = Math.max(0, Number(m.target_amount) - Number(m.current_amount));
        const prazo = m.deadline ? `, prazo ${dataBR(m.deadline)}` : '';
        return `- ${m.title}: guardado R$ ${formatarBRL(Number(m.current_amount))} de R$ ${formatarBRL(Number(m.target_amount))} ` +
          `(falta R$ ${formatarBRL(falta)}${prazo})`;
      };

      if (casada) {
        const m = metas.find((x) => x.title === casada)!;
        return linha(m);
      }
      return `Metas do usuário:\n${metas.map(linha).join('\n')}`;
    }

    /* Porta a MESMA fórmula de lib/projections.ts:projetarComprometimentoFuturo
       — contas recorrentes contam pelo valor atual em TODO mês futuro (só a
       próxima ocorrência existe como linha), parcelas futuras são somadas por
       mês de occurred_on. Nenhuma versão simplificada: mesmo cálculo. */
    case 'comprometimentoFuturo': {
      const meses = Math.min(Math.max(Math.round(Number(args.meses ?? 6)) || 6, 1), 24);
      const hoje = new Date();

      const [billsResult, txResult] = await Promise.all([
        supabase.from('bills').select('amount, recurring').eq('user_id', userId).eq('recurring', true),
        supabase.from('transactions').select('amount, occurred_on').eq('user_id', userId).eq('type', 'out').gt('installment_total', 1),
      ]);
      if (billsResult.error) throw billsResult.error;
      if (txResult.error) throw txResult.error;

      const totalRecorrentes = (billsResult.data ?? []).reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);
      const parcelas = (txResult.data ?? []) as Array<{ amount: number; occurred_on: string }>;

      const linhasMes: string[] = [];
      let totalGeral = 0;
      for (let i = 0; i < meses; i++) {
        const ref = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        const ano = ref.getFullYear();
        const mes = ref.getMonth();
        const totalParcelas = parcelas
          .filter((t) => {
            const d = new Date(t.occurred_on + 'T00:00:00');
            return d.getFullYear() === ano && d.getMonth() === mes;
          })
          .reduce((s, t) => s + Number(t.amount), 0);
        const totalMes = totalRecorrentes + totalParcelas;
        totalGeral += totalMes;
        const label = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        linhasMes.push(`- ${label}: R$ ${formatarBRL(totalMes)} (recorrentes R$ ${formatarBRL(totalRecorrentes)}, parcelas R$ ${formatarBRL(totalParcelas)})`);
      }

      return `Comprometimento projetado para os próximos ${meses} mês(es), somando R$ ${formatarBRL(totalGeral)}:\n${linhasMes.join('\n')}`;
    }

    /* Porta a MESMA fórmula e os MESMOS degraus de lib/creditLimitAlert.ts
       (calcularPctCartao, DEGRAUS=[100,90,70,50]) — só a leitura, sem o
       estado de "já notificado" (que é local ao aparelho, não do servidor). */
    case 'alertaDeLimiteCartao': {
      const DEGRAUS = [100, 90, 70, 50];
      const hojeD = new Date();
      const inicioMes = `${hojeD.getFullYear()}-${pad(hojeD.getMonth() + 1)}-01`;
      const ultimoDiaMes = new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0).getDate();
      const fimMes = `${hojeD.getFullYear()}-${pad(hojeD.getMonth() + 1)}-${pad(ultimoDiaMes)}`;

      const [cardsResult, txResult] = await Promise.all([
        supabase.from('credit_cards').select('id, name, limit_amount').eq('user_id', userId),
        supabase.from('transactions').select('amount, card_id').eq('user_id', userId).eq('payment_method', 'credit')
          .gte('occurred_on', inicioMes).lte('occurred_on', fimMes),
      ]);
      if (cardsResult.error) throw cardsResult.error;
      if (txResult.error) throw txResult.error;

      const cards = (cardsResult.data ?? []) as Array<{ id: string; name: string; limit_amount: number }>;
      if (cards.length === 0) return 'O usuário não tem nenhum cartão de crédito cadastrado.';
      const txs = (txResult.data ?? []) as Array<{ amount: number; card_id: string | null }>;

      const linhasCartao = cards.map((c) => {
        const gasto = txs.filter((t) => t.card_id === c.id).reduce((s, t) => s + Number(t.amount), 0);
        const pct = c.limit_amount > 0 ? gasto / c.limit_amount : 0;
        const degrau = DEGRAUS.find((d) => pct * 100 >= d) ?? null;
        const aviso = degrau ? ` — atenção: já passou de ${degrau}% do limite` : '';
        return `- ${c.name}: R$ ${formatarBRL(gasto)} de R$ ${formatarBRL(Number(c.limit_amount))} (${(pct * 100).toFixed(0)}% do limite)${aviso}`;
      });

      return `Uso do limite dos cartões no mês atual:\n${linhasCartao.join('\n')}`;
    }

    /* O diagnóstico NÃO fica em tabela: vive em user_metadata, que a chamada
       de autenticação já trouxe — zero query nova. Os nomes de exibição são
       os MESMOS de lib/diagnostico.ts (ARQUETIPOS) — arquetipoId sozinho
       ("resgate") não diz nada a quem lê a resposta. */
    case 'perfilFinanceiro': {
      const NOMES_ARQUETIPO: Record<string, string> = {
        resgate: 'Organizador & Resgate',
        construtor: 'Construtor de Reserva',
        otimizador: 'Otimizador & Investidor',
        estrategista: 'Estrategista de Renda Variável',
      };
      const diagnostico = usuario.user_metadata?.diagnostico as
        | { arquetipoId?: string; atualizadoEm?: string }
        | undefined;
      if (!diagnostico?.arquetipoId) {
        return 'O usuário ainda não fez o diagnóstico financeiro no app. Sugira que ele faça, na tela de Perfil. Não invente um arquétipo.';
      }
      const nome = NOMES_ARQUETIPO[diagnostico.arquetipoId] ?? diagnostico.arquetipoId;
      return `O perfil financeiro do usuário é "${nome}" (diagnóstico feito em ${diagnostico.atualizadoEm ?? 'data não registrada'}).`;
    }

    /* Porta a MESMA fórmula de lib/monthly-wrapped.ts:gerarMonthlyWrapped —
       SEMPRE o mês anterior ao atual, nunca o corrente (mês em andamento dá
       impressão errada de quanto se gastou). `ehDoMes` compara a data como
       STRING pura ('YYYY-MM'), igual ao original, pra não introduzir
       diferença de fuso horário que o original não tem.

       Omitido de propósito: o `level`/XP de gamificação do wrapped visual.
       Não é dado financeiro do mês, é derivado do XP acumulado da conta
       inteira — fora do que "como foi meu mês passado" pergunta, e coberto
       à parte por resumoScoreERitmo. */

    /* Porta calculateStreakAndWeek + calculateScoreBreakdown de
       lib/gamification.ts, mas replicando o RECORTE DE DADOS REAL que
       app/(app)/desafios.tsx usa hoje em produção (quando o RPC de resumo
       histórico existe, que já confirmamos publicado): transactions dos
       ÚLTIMOS 45 DIAS (fetchTransactions({ sinceDays: 45 })), e bills só
       com status='due' (fetchBills({ status: 'due' })) — NUNCA 'paid'.

       Isso significa, no cálculo REAL de hoje, que `contasResolvidas`
       (bills.filter(status==='paid')) é sempre 0 dentro desse recorte, e o
       fator "Contas acompanhadas" vale 200 só quando não há boleto due
       nenhum, e 0 caso contrário — não é aproximação minha, é o que a tela
       de Desafios já entrega hoje. Replicar qualquer outro recorte (todas
       as bills, todo o histórico) faria este número DIVERGIR do que a
       pessoa vê na aba Desafios, que é o padrão de fidelidade do projeto.

       Fuso: os "dias" da sequência e da constância são calculados no fuso
       de São Paulo (Intl.DateTimeFormat com timeZone fixo), não no fuso do
       servidor (Deno roda em UTC) — sem isso, a virada do dia aconteceria
       3h mais cedo aqui do que no aparelho do usuário. */
    case 'resumoScoreERitmo': {
      const FUSO = 'America/Sao_Paulo';
      const isoSaoPaulo = (d: Date): string =>
        new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

      const hojeAgora = new Date();
      const todayStr = isoSaoPaulo(hojeAgora);

      const cutoff = new Date(hojeAgora);
      cutoff.setDate(cutoff.getDate() - 45);
      const cutoffISO = cutoff.toISOString().slice(0, 10);

      const [txResult, billsResult] = await Promise.all([
        supabase.from('transactions').select('type, occurred_on, created_at, category')
          .eq('user_id', userId).gte('occurred_on', cutoffISO),
        supabase.from('bills').select('status').eq('user_id', userId).eq('status', 'due'),
      ]);
      if (txResult.error) throw txResult.error;
      if (billsResult.error) throw billsResult.error;

      type TxLeve = { type: string; occurred_on: string; created_at: string | null; category: string };
      const transacoes = (txResult.data ?? []) as TxLeve[];
      const bills = (billsResult.data ?? []) as Array<{ status: string }>;

      const dataDoRegistro = (t: TxLeve) => (t.created_at ? isoSaoPaulo(new Date(t.created_at)) : t.occurred_on);
      const datasComRegistro = new Set(transacoes.map(dataDoRegistro));

      // Sequência: mesmo algoritmo de calculateStreakAndWeek. Anda dia a dia
      // em UTC puro a partir do dia-calendário já resolvido em São Paulo —
      // um dia é um dia, não precisa reprojetar fuso a cada passo do laço.
      let streak = 0;
      const [anoHoje, mesHoje, diaHoje] = todayStr.split('-').map(Number);
      const cursor = new Date(Date.UTC(anoHoje, mesHoje - 1, diaHoje));
      if (!datasComRegistro.has(todayStr)) cursor.setUTCDate(cursor.getUTCDate() - 1);
      while (true) {
        const iso = `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`;
        if (!datasComRegistro.has(iso)) break;
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }

      // Score: mesmo algoritmo de calculateScoreBreakdown.
      const currentYear = anoHoje;
      const currentMonth = mesHoje - 1; // 0-11
      const diasNoMes = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
      const diasDecorridos = Math.max(1, Math.min(diasNoMes, diaHoje));

      const monthTx = transacoes.filter((t) => {
        const [y, m] = t.occurred_on.split('-').map(Number);
        return y === currentYear && m === currentMonth + 1;
      });
      const prefixoDoMes = `${currentYear}-${pad(currentMonth + 1)}`;
      const diasComRegistroNoMes = new Set(
        transacoes.map(dataDoRegistro).filter((d) => d.startsWith(prefixoDoMes))
      ).size;

      const consistencyPts = Math.min(300, streak * 20);
      const fatiaDeDias = Math.min(1, diasComRegistroNoMes / diasDecorridos);
      const constanciaPts = Math.round(fatiaDeDias * 300);

      const temEntrada = monthTx.some((t) => t.type === 'in');
      const temSaida = monthTx.some((t) => t.type === 'out');
      const comCategoria = monthTx.filter((t) => t.category && t.category !== 'Outros').length;
      const fatiaCategorizada = monthTx.length > 0 ? comCategoria / monthTx.length : 0;
      const retratoPts = Math.round((temEntrada ? 70 : 0) + (temSaida ? 70 : 0) + fatiaCategorizada * 60);

      // `contasResolvidas` é sempre 0 neste recorte (só bills 'due' chegam
      // aqui) — ver o comentário grande acima do case. Não é bug do port.
      const contasPts = bills.length === 0 ? 200 : 0;

      const score = Math.min(1000, Math.max(0, consistencyPts + constanciaPts + retratoPts + contasPts));

      return (
        `Score Grana do usuário: ${score} de 1000. ` +
        `Sequência de registros (Ritmo): ${streak} ${streak === 1 ? 'dia seguido' : 'dias seguidos'}.\n` +
        `Detalhamento dos fatores: sequência de registros ${consistencyPts}/300, constância no mês ${constanciaPts}/300, ` +
        `retrato completo ${retratoPts}/200, contas acompanhadas ${contasPts}/200.`
      );
    }

    case 'retrospectivaDoMes': {
      const hojeR = new Date();
      const refFechado = new Date(hojeR.getFullYear(), hojeR.getMonth() - 1, 1);
      const ano = refFechado.getFullYear();
      const mes = refFechado.getMonth(); // 0-11
      const refAnterior = new Date(ano, mes - 1, 1);
      const anoAnt = refAnterior.getFullYear();
      const mesAnt = refAnterior.getMonth();

      const chaveMes = (y: number, m: number) => `${y}-${pad(m + 1)}`;
      const ehDoMes = (dataISO: string, y: number, m: number) => dataISO.slice(0, 7) === chaveMes(y, m);

      const inicioJanela = `${anoAnt}-${pad(mesAnt + 1)}-01`;
      const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
      const fimJanela = `${ano}-${pad(mes + 1)}-${pad(ultimoDiaMes)}`;

      const [txResult, billsResult, budgetsResult] = await Promise.all([
        supabase.from('transactions').select('type, amount, category, color, recurring, occurred_on')
          .eq('user_id', userId).gte('occurred_on', inicioJanela).lte('occurred_on', fimJanela),
        supabase.from('bills').select('amount, due_date, status').eq('user_id', userId).eq('status', 'paid')
          .gte('due_date', `${ano}-${pad(mes + 1)}-01`).lte('due_date', fimJanela),
        supabase.from('budgets').select('category, amount').eq('user_id', userId),
      ]);
      if (txResult.error) throw txResult.error;
      if (billsResult.error) throw billsResult.error;
      if (budgetsResult.error) throw budgetsResult.error;

      type Tx = { type: string; amount: number; category: string; color: string; recurring: boolean; occurred_on: string };
      const todasTx = (txResult.data ?? []) as Tx[];
      const doMes = todasTx.filter((t) => ehDoMes(t.occurred_on, ano, mes));
      const saidasTx = doMes.filter((t) => t.type === 'out');
      const doMesAnterior = todasTx.filter((t) => ehDoMes(t.occurred_on, anoAnt, mesAnt));

      if (doMes.length === 0) {
        const label = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return `Não houve nenhum lançamento em ${label}. Diga ao usuário que não há retrospectiva pra mostrar nesse mês.`;
      }

      const entradas = doMes.filter((t) => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
      const saidas = saidasTx.reduce((s, t) => s + Number(t.amount), 0);

      const maiorDespesa = saidasTx.reduce<Tx | null>(
        (maior, t) => (!maior || Number(t.amount) > Number(maior.amount) ? t : maior), null
      );

      const porCategoria = new Map<string, number>();
      for (const t of saidasTx) porCategoria.set(t.category, (porCategoria.get(t.category) ?? 0) + Number(t.amount));
      let categoriaCampea: { nome: string; total: number } | null = null;
      for (const [nome, total] of porCategoria) {
        if (!categoriaCampea || total > categoriaCampea.total) categoriaCampea = { nome, total };
      }
      const orcamentoCampea = categoriaCampea
        ? ((budgetsResult.data ?? []) as Array<{ category: string; amount: number }>).find((b) => b.category === categoriaCampea!.nome)
        : null;

      const saidasMesAnterior = doMesAnterior.length
        ? doMesAnterior.filter((t) => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0)
        : null;

      const recorrentes = saidasTx.filter((t) => t.recurring).reduce((s, t) => s + Number(t.amount), 0);
      const boletosPagos = (billsResult.data ?? []) as Array<{ amount: number }>;
      const valorBoletos = boletosPagos.reduce((s, b) => s + Number(b.amount), 0);
      const comprometidoFixo = recorrentes + valorBoletos;
      const saldo = entradas - saidas;
      const taxaPoupanca = entradas > 0 ? (saldo / entradas) * 100 : null;
      const diasComRegistro = new Set(doMes.map((t) => t.occurred_on)).size;
      const label = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      const comparativo = saidasMesAnterior === null
        ? 'sem registro no mês anterior para comparar'
        : saidas > saidasMesAnterior
          ? `${formatarBRL(((saidas - saidasMesAnterior) / saidasMesAnterior) * 100)}% a mais que no mês anterior`
          : `${formatarBRL(((saidasMesAnterior - saidas) / saidasMesAnterior) * 100)}% a menos que no mês anterior`;

      return (
        `Retrospectiva de ${label} (mês fechado, cite o mês na resposta):\n` +
        `- Entradas: R$ ${formatarBRL(entradas)}\n` +
        `- Saídas: R$ ${formatarBRL(saidas)} (${comparativo})\n` +
        `- Saldo: R$ ${formatarBRL(saldo)}\n` +
        (taxaPoupanca !== null ? `- Taxa de poupança: ${formatarBRL(taxaPoupanca)}%\n` : '') +
        (maiorDespesa ? `- Maior despesa: ${maiorDespesa.category}, R$ ${formatarBRL(Number(maiorDespesa.amount))}\n` : '') +
        (categoriaCampea
          ? `- Categoria campeã: ${categoriaCampea.nome}, R$ ${formatarBRL(categoriaCampea.total)}` +
            (orcamentoCampea ? ` (${formatarBRL((categoriaCampea.total / Number(orcamentoCampea.amount)) * 100)}% do orçamento)` : '') + '\n'
          : '') +
        `- Boletos pagos: ${boletosPagos.length}, totalizando R$ ${formatarBRL(valorBoletos)}\n` +
        `- Comprometido fixo (recorrentes + boletos): R$ ${formatarBRL(comprometidoFixo)}\n` +
        `- Dias com pelo menos um lançamento: ${diasComRegistro} de ${ultimoDiaMes}`
      );
    }

    /* Só grava fato que o usuário AFIRMOU — nunca uma inferência do modelo
       sobre ele, que é como o assistente passaria a julgar (a regra de tom
       do projeto proíbe). Falha de gravação não derruba a resposta: o
       usuário só não terá isso lembrado da próxima vez. */
    case 'lembrarFato': {
      const chave = String(args.chave ?? '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100);
      const fato = String(args.fato ?? '').trim();
      if (!chave || !fato) return 'Não deu para guardar: faltou a chave ou o fato. Peça ao usuário para reformular.';
      try {
        await supabase.rpc('registrar_memoria_assistente', {
          p_user_id: userId, p_tipo: 'fato', p_chave: chave, p_valor: fato,
        });
      } catch (e) {
        console.error('[assistente-financeiro] erro ao guardar fato:', e);
        return 'Não consegui guardar esse fato agora, mas responda a mensagem do usuário normalmente.';
      }
      return `Guardado: "${fato}". Diga ao usuário que você vai lembrar disso.`;
    }

    /* O registro em si é automático: `ferramentaUsada = 'naoConsegui'` já é
       salvo em assistant_messages.ferramenta_usada pelo fluxo principal,
       sem precisar de tabela nova — é a lacuna aparecendo sozinha pelo uso
       real, sem o autor precisar perceber e avisar. */
    case 'naoConsegui': {
      const motivo = String(args.motivo ?? 'motivo não informado').trim();
      return `Diga ao usuário, com gentileza, que você ainda não consegue responder isso. ` +
        `Motivo interno, não repita ao usuário: ${motivo}`;
    }

    /* O casamento difuso de `casarNome`/`casarNomeComMemoria` só reconhece
       nome PARECIDO por trecho de texto ("Aliment" bate com "Alimentação"
       sozinho) — nunca um sinônimo de verdade ("comida" não é trecho de
       "Alimentação", string nenhuma resolve isso). Só o próprio modelo
       entende que são a mesma coisa, então esta ferramenta é o jeito dele
       ensinar essa correspondência pra memória, em vez de string nenhuma
       tentar adivinhar sinônimo. */
    case 'ensinarApelido': {
      const dominio = String(args.dominio ?? '');
      if (!['categoria', 'cartao', 'carteira'].includes(dominio)) {
        return 'Domínio inválido. Use categoria, cartao ou carteira.';
      }
      const apelido = String(args.apelido ?? '').trim();
      const nomeReal = String(args.nome_real ?? '').trim();
      if (!apelido || !nomeReal) return 'Faltou o apelido ou o nome real. Não gravei nada.';

      /* Confirma que o nome real EXISTE de verdade antes de gravar — sem
         isso, um apelido aprendido errado "resolveria" pra algo que o
         usuário não tem, e a próxima consulta com esse apelido falharia
         silenciosamente ou apontaria pro lugar errado. */
      const tabela = dominio === 'categoria' ? 'categories' : dominio === 'cartao' ? 'credit_cards' : 'wallets';
      const { data: existentes, error: erroExistentes } = await supabase.from(tabela).select('name').eq('user_id', userId);
      if (erroExistentes) throw erroExistentes;
      const nomes = (existentes ?? []).map((r: { name: string }) => r.name);
      const casado = casarNome(nomes, nomeReal);
      if (!casado) {
        return `"${nomeReal}" não bate com nenhum(a) ${dominio} real do usuário. Não gravei nenhum apelido — confirme o nome certo primeiro.`;
      }

      try {
        await supabase.rpc('registrar_memoria_assistente', {
          p_user_id: userId, p_tipo: 'vocabulario', p_chave: `${dominio}:${normalizar(apelido)}`, p_valor: casado,
        });
      } catch (e) {
        console.error('[assistente-financeiro] erro ao ensinar apelido:', e);
        return 'Não consegui gravar esse apelido agora, mas pode responder a pergunta do usuário normalmente.';
      }
      return `Apelido gravado: "${apelido}" = ${casado}. Da próxima vez que o usuário disser "${apelido}", já resolve direto, sem perguntar de novo.`;
    }

    default:
      return 'Ferramenta não reconhecida.';
  }
}

/* ── System prompt ───────────────────────────────────────────────────────── */

type MemoriaAssistente = {
  vocabulario: Array<{ chave: string; valor: string }>;
  fatos: Array<{ chave: string; valor: string }>;
  exemplos: Array<{ chave: string; valor: string; usos: number }>;
};

const MEMORIA_VAZIA: MemoriaAssistente = { vocabulario: [], fatos: [], exemplos: [] };

/**
 * Busca a memória aprendida deste usuário. Tetos rígidos (20 vocabulário,
 * 10 fatos, 5 exemplos) por dois motivos: sem eles o prompt incha sem
 * limite conforme o usuário usa mais o assistente — o oposto do que
 * "aprender com o uso" deveria entregar — e o free tier do Gemini já tem
 * pouca margem de tokens por chamada.
 *
 * Falha aqui NUNCA impede a resposta: memória é reforço, não parte crítica
 * do caminho de responder. Sem ela, o Granabô só volta a se comportar como
 * antes de aprender nada — nunca para de funcionar.
 */
async function carregarMemoria(supabase: SupabaseClient, userId: string, mensagem: string): Promise<MemoriaAssistente> {
  try {
    const [vocabResult, fatosResult, exemplosResult] = await Promise.all([
      supabase.from('assistant_memory').select('chave, valor')
        .eq('user_id', userId).eq('tipo', 'vocabulario')
        .order('usos', { ascending: false }).order('atualizado_em', { ascending: false })
        .limit(20),
      supabase.from('assistant_memory').select('chave, valor')
        .eq('user_id', userId).eq('tipo', 'fato')
        .order('atualizado_em', { ascending: false })
        .limit(10),
      supabase.rpc('buscar_exemplos_similares', { p_user_id: userId, p_pergunta: mensagem, p_limite: 5 }),
    ]);
    return {
      vocabulario: (vocabResult.data ?? []) as MemoriaAssistente['vocabulario'],
      fatos: (fatosResult.data ?? []) as MemoriaAssistente['fatos'],
      exemplos: (exemplosResult.data ?? []) as MemoriaAssistente['exemplos'],
    };
  } catch (e) {
    console.error('[assistente-financeiro] erro ao carregar memória:', e);
    return MEMORIA_VAZIA;
  }
}

/**
 * A data é computada NO SERVIDOR a cada chamada e injetada aqui. Sem ela o
 * modelo não tem como transformar "mês passado" ou "nos últimos 15 dias" em
 * argumentos concretos, e cai no único período que conhecia antes: o mês
 * corrente. Nunca deixar o modelo adivinhar a data.
 *
 * `memoria` é o que faz o Granabô "aprender sozinho" com o próprio uso, sem
 * fine-tuning nenhum (pago, fora do requisito de custo zero): vocabulário
 * que este usuário já ensinou, fatos que ele já contou, e exemplos de
 * perguntas parecidas que já foram respondidas com sucesso antes — nada
 * disso muda o modelo, só o que ele lê antes de responder.
 */
function montarSystemPrompt(memoria: MemoriaAssistente = MEMORIA_VAZIA): string {
  const hoje = new Date();
  const porExtenso = hoje.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const blocoVocabulario = memoria.vocabulario.length
    ? `\n\nApelidos que este usuário já usou antes (use direto, sem precisar confirmar de novo):\n` +
      memoria.vocabulario.map((v) => `- "${v.chave.split(':').slice(1).join(':')}" = ${v.valor}`).join('\n')
    : '';

  const blocoFatos = memoria.fatos.length
    ? `\n\nFatos que este usuário já contou sobre si (ele afirmou, não é suposição sua):\n` +
      memoria.fatos.map((f) => `- ${f.valor}`).join('\n')
    : '';

  const blocoExemplos = memoria.exemplos.length
    ? `\n\nPerguntas parecidas que este usuário já fez antes, e como foram resolvidas (para o mesmo padrão de pergunta, prefira a mesma ferramenta e os mesmos argumentos):\n` +
      memoria.exemplos.map((e) => `- Pergunta: "${e.chave}" → ${e.valor}`).join('\n')
    : '';

  return `Você é o Granabô, o assistente financeiro do app Grana.

Hoje é ${porExtenso} (${iso(hoje)}). Use esta data para resolver períodos relativos como "mês passado", "nos últimos 15 dias", "este ano".${blocoVocabulario}${blocoFatos}${blocoExemplos}

Regras invioláveis:
1. NUNCA invente um valor em reais. Todo número financeiro que você mencionar DEVE ter vindo do resultado de uma ferramenta.
2. Se a pergunta não puder ser respondida com nenhuma ferramenta disponível, chame a ferramenta naoConsegui em vez de só escrever uma desculpa — isso registra a lacuna pra melhorar o assistente.
3. Seja direto e amigável. Use frases curtas.
4. NUNCA julgue os gastos do usuário. Não diga "você gastou muito" nem "você deveria economizar" — só apresente os números quando pedidos.
5. Responda em português do Brasil.
6. Quando os valores vierem das ferramentas, apresente-os de forma clara e natural.
7. Se o usuário só mandar uma saudação ("oi", "olá"), apresente-se brevemente e diga o que você pode fazer.
8. Use emojis com moderação — no máximo um por mensagem.
9. SEMPRE cite o período consultado junto do valor ("nos últimos 15 dias", "em maio de 2026"). O resultado da ferramenta traz esse período; sem citá-lo, quem perguntou não tem como saber a que janela o número se refere.
10. Cada usuário cria as próprias categorias, cartões e carteiras. NUNCA presuma que algo não existe nem recuse consultar por achar que a categoria não é válida: chame a ferramenta e deixe ela responder. Se o nome não casar, ela devolve a lista real.
11. Para qualquer pergunta sobre gastos ou receitas que as ferramentas específicas não cubram exatamente, use consultarLancamentos combinando os filtros necessários, em vez de dizer que não consegue.
12. Se o usuário afirmar algo factual sobre a própria vida financeira (não uma pergunta), use lembrarFato pra guardar, além de responder normalmente.
13. O casamento automático de categoria/cartão/carteira só reconhece nomes parecidos por trecho de texto — nunca um sinônimo de verdade ("comida" não é trecho de "Alimentação"). Quando o usuário usar um termo assim e você já souber (nesta conversa, ou por ser um sinônimo óbvio) a qual categoria/cartão/carteira real ele se refere, use ensinarApelido pra guardar essa correspondência.`;
}

/* ── Handler principal ───────────────────────────────────────────────────── */

type CodigoErro =
  | 'nao_autenticado'
  | 'metodo_invalido'
  | 'corpo_invalido'
  | 'mensagem_vazia'
  | 'muitas_tentativas'
  | 'sem_provedor'
  | 'erro_ia'
  | 'erro_interno';

function erro(codigo: CodigoErro, status: number, mensagemAmigavel?: string) {
  return new Response(
    JSON.stringify({ status: 'error', code: codigo, mensagem: mensagemAmigavel }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return erro('metodo_invalido', 405);

  try {
    /* ── Auth ─────────────────────────────────────────────────────────── */
    const authorization = req.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return erro('nao_autenticado', 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (authError || !userId) return erro('nao_autenticado', 401);

    if (excedeuRateLimit(userId)) {
      return erro('muitas_tentativas', 429, 'Calma aí! Você fez muitas perguntas seguidas. Espera um minutinho e tenta de novo.');
    }

    /* ── Validação do corpo ───────────────────────────────────────────── */
    let body: { mensagem: string; historico?: { papel: string; texto: string }[] };
    try {
      body = await req.json();
    } catch {
      return erro('corpo_invalido', 400);
    }
    const mensagem = (body.mensagem ?? '').trim();
    if (!mensagem) return erro('mensagem_vazia', 400);

    if (!GEMINI_API_KEY) {
      console.error('[assistente-financeiro] GEMINI_API_KEY não configurada');
      return erro('sem_provedor', 503, 'Não consegui pensar nisso agora. Tenta de novo em instantes.');
    }

    /* ── Montar mensagens para o LLM ─────────────────────────────────── */
    const memoria = await carregarMemoria(supabase, userId, mensagem);
    const messages: { role: string; content: string }[] = [{ role: 'system', content: montarSystemPrompt(memoria) }];

    // Incluir histórico recente se fornecido (últimas mensagens para contexto)
    if (body.historico && Array.isArray(body.historico)) {
      for (const msg of body.historico.slice(-10)) {
        messages.push({
          role: msg.papel === 'usuario' ? 'user' : 'assistant',
          content: msg.texto,
        });
      }
    }

    messages.push({ role: 'user', content: mensagem });

    /* ── Primeira chamada: LLM decide se usa ferramenta ──────────────── */
    const chatPayload = {
      model: MODELO,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 1024,
    };

    const chatRes = await fetchComTimeout(CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatPayload),
    });

    if (!chatRes.ok) {
      const status = chatRes.status;
      console.error(`[assistente-financeiro] LLM respondeu ${status}:`, await chatRes.text());
      if (status === 429) {
        return erro('erro_ia', 429, 'Estou um pouco sobrecarregado agora. Tenta de novo em alguns instantes.');
      }
      return erro('erro_ia', 502, 'Não consegui pensar nisso agora. Tenta de novo em instantes.');
    }

    const chatJson = await chatRes.json();
    const choice = chatJson.choices?.[0]?.message;

    if (!choice) {
      return erro('erro_ia', 502, 'Não consegui pensar nisso agora. Tenta de novo em instantes.');
    }

    /* ── Se o LLM pediu tool calls, executar e enviar resultado de volta ── */
    let respostaFinal = choice.content ?? '';
    let ferramentaUsada: string | null = null;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      const toolMessages: { role: string; content: string; tool_call_id?: string }[] = [
        ...messages,
        choice, // a mensagem do assistente com os tool_calls
      ];

      /* "Aprender com os próprios acertos": guarda a ÚLTIMA ferramenta de
         consulta que rodou sem exceção nesta pergunta, pra virar few-shot
         em perguntas parecidas no futuro (ver carregarMemoria acima).
         naoConsegui/lembrarFato ficam de fora — são meta-ferramentas, não
         respondem pergunta financeira nenhuma, não fazem sentido como
         exemplo de "como resolver esta pergunta". */
      const METAFERRAMENTAS = new Set(['naoConsegui', 'lembrarFato', 'ensinarApelido']);
      let ultimaFerramentaBemSucedida: { nome: string; args: Record<string, unknown> } | null = null;

      for (const toolCall of choice.tool_calls) {
        const nome = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments ?? '{}');
        } catch { /* args vazio */ }

        ferramentaUsada = nome;
        console.log(`[assistente-financeiro] executando ferramenta: ${nome}`, Object.keys(args));

        let resultado: string;
        try {
          resultado = await executarFerramenta(nome, args, supabase, {
            id: userId,
            user_metadata: userData?.user?.user_metadata ?? null,
          });
          /* "Não existe categoria/cartão/carteira/meta chamada X" significa
             que o ARGUMENTO passado não resolveu — o modelo errou o nome,
             não é exemplo de sucesso. Achado testando em produção: sem este
             filtro, "quanto gastei com mercado" virava exemplo reforçando
             `categoria: "mercado"`, que SEMPRE falha (não existe categoria
             com esse nome) — o few-shot ensinaria o erro, não o acerto. */
          const falhouResolucaoDeNome = resultado.startsWith('Não existe ');
          if (!METAFERRAMENTAS.has(nome) && !falhouResolucaoDeNome) {
            ultimaFerramentaBemSucedida = { nome, args };
          }
        } catch (err) {
          console.error(`[assistente-financeiro] erro na ferramenta ${nome}:`, err);
          resultado = 'Erro ao consultar os dados. Tente novamente.';
        }

        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: resultado,
        });
      }

      if (ultimaFerramentaBemSucedida) {
        try {
          await supabase.rpc('registrar_memoria_assistente', {
            p_user_id: userId,
            p_tipo: 'exemplo',
            p_chave: mensagem,
            p_valor: `ferramenta: ${ultimaFerramentaBemSucedida.nome}, args: ${JSON.stringify(ultimaFerramentaBemSucedida.args)}`,
          });
        } catch (e) {
          console.error('[assistente-financeiro] erro ao gravar exemplo:', e);
        }
      }

      /* Segunda chamada: LLM formula a resposta com os dados reais */
      const followUpRes = await fetchComTimeout(CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELO,
          messages: toolMessages,
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      if (!followUpRes.ok) {
        console.error(`[assistente-financeiro] Groq follow-up respondeu ${followUpRes.status}`);
        return erro('erro_ia', 502, 'Não consegui pensar nisso agora. Tenta de novo em instantes.');
      }

      const followUpJson = await followUpRes.json();
      respostaFinal = followUpJson.choices?.[0]?.message?.content ?? 'Desculpa, não consegui formular uma resposta.';
    }

    /* ── Salvar pergunta e resposta no histórico ──────────────────────── */
    const inserts = [
      { user_id: userId, papel: 'usuario', texto: mensagem },
      { user_id: userId, papel: 'assistente', texto: respostaFinal, ferramenta_usada: ferramentaUsada },
    ];
    const { error: insertError } = await supabase.from('assistant_messages').insert(inserts);
    if (insertError) {
      // Não falha a resposta por causa de erro no histórico — o importante é
      // que a resposta já foi gerada. Loga e segue.
      console.error('[assistente-financeiro] erro ao salvar histórico:', insertError);
    }

    /* ── Resposta ─────────────────────────────────────────────────────── */
    console.log('[assistente-financeiro]', {
      ferramenta: ferramentaUsada,
      perguntaLen: mensagem.length,
      respostaLen: respostaFinal.length,
    });

    return new Response(
      JSON.stringify({ status: 'ok', resposta: respostaFinal, ferramenta: ferramentaUsada }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[assistente-financeiro] erro:', err);
    return erro('erro_interno', 500, 'Algo deu errado do meu lado. Tenta de novo.');
  }
});
