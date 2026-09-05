// Grana. — Granabô, assistente financeiro com IA
//
// Edge Function que recebe a pergunta do usuário, chama o LLM (Groq,
// llama-3.1-8b-instant) com tool calling, executa as ferramentas
// determinísticas contra o Supabase, e devolve a resposta final.
//
// O LLM NUNCA vê o banco de dados nem gera valores em R$ por conta própria:
// ele escolhe qual ferramenta chamar, a ferramenta busca o número real, e o
// modelo só transforma esse número em frase natural. Isso garante que todo
// valor financeiro exibido ao usuário veio de uma consulta real, testada —
// nunca de geração livre.
//
// Configuração (supabase secrets set):
//   GROQ_API_KEY     — modelo de chat (llama-3.1-8b-instant)
//   SUPABASE_URL     — já existe
//   SUPABASE_ANON_KEY — já existe
//
// Publicar COM verificação de JWT (o padrão):
//   supabase functions deploy assistente-financeiro

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.112.3/cors';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODELO = 'llama-3.1-8b-instant';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

function janelaDoMesCorrente(): { inicio: string; fim: string; nomeMes: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return {
    inicio: `${ano}-${pad(mes + 1)}-01`,
    fim: `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}`,
    nomeMes: hoje.toLocaleDateString('pt-BR', { month: 'long' }),
  };
}

function formatarBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Ferramentas (tool definitions para o LLM) ───────────────────────────── */

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'gastoPorCategoria',
      description:
        'Retorna o total gasto em uma categoria específica no mês atual. ' +
        'Use quando o usuário perguntar "quanto gastei em Alimentação", "gastos com Transporte", etc.',
      parameters: {
        type: 'object',
        properties: {
          categoria: {
            type: 'string',
            description: 'Nome da categoria. Ex: "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Assinaturas"',
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
        'Retorna o total de boletos/contas a pagar pendentes no mês atual. ' +
        'Use quando o usuário perguntar sobre boletos, contas a pagar, contas pendentes.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumoCredito',
      description:
        'Retorna o total gasto no cartão de crédito no mês atual, com detalhamento por cartão. ' +
        'Use quando o usuário perguntar sobre fatura, cartão de crédito, gastos no crédito.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'livreParaGastar',
      description:
        'Retorna quanto o usuário ainda pode gastar no mês sem comprometer as contas fixas. ' +
        'É o "livre para gastar": receitas menos gastos menos boletos pendentes. ' +
        'Use quando o usuário perguntar "quanto posso gastar", "quanto tenho livre", "quanto sobra".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'resumoMes',
      description:
        'Retorna uma visão geral do mês: total de receitas, total de gastos e saldo. ' +
        'Use quando o usuário perguntar "como está meu mês", "resumo do mês", "como estão minhas finanças".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

/* ── Execução das ferramentas ────────────────────────────────────────────── */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { inicio, fim, nomeMes } = janelaDoMesCorrente();

  switch (nome) {
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
      const normalizar = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const alvo = normalizar(pedida);
      const casada =
        nomes.find((n: string) => normalizar(n) === alvo) ??
        nomes.find((n: string) => normalizar(n).includes(alvo) || alvo.includes(normalizar(n)));

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
      return `O usuário gastou R$ ${formatarBRL(total)} em ${casada} em ${nomeMes}.`;
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
      if (linhas.length === 0) return `O usuário não tem boletos pendentes em ${nomeMes}.`;
      const detalhe = linhas
        .map((b: { description: string; amount: number; due_date: string }) => {
          const dia = b.due_date.split('-')[2];
          return `- ${b.description}: R$ ${formatarBRL(Number(b.amount))} (vence dia ${parseInt(dia)})`;
        })
        .join('\n');
      return `O usuário tem R$ ${formatarBRL(total)} em ${linhas.length} boleto(s) pendente(s) em ${nomeMes}:\n${detalhe}`;
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
        return `O usuário gastou R$ ${formatarBRL(total)} no crédito em ${nomeMes}.`;
      }
      const porCartao = cards
        .map((c: { id: string; name: string; limit_amount: number }) => {
          const gastoCartao = linhas
            .filter((t: { card_id: string }) => t.card_id === c.id)
            .reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
          return `- ${c.name}: R$ ${formatarBRL(gastoCartao)} (limite: R$ ${formatarBRL(Number(c.limit_amount))})`;
        })
        .join('\n');
      return `O usuário gastou R$ ${formatarBRL(total)} no crédito em ${nomeMes}:\n${porCartao}`;
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
        `Livre para gastar em ${nomeMes}: R$ ${formatarBRL(livre)}\n` +
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
        `Resumo de ${nomeMes}:\n` +
        `- Receitas: R$ ${formatarBRL(receitas)}\n` +
        `- Gastos: R$ ${formatarBRL(gastos)}\n` +
        `- Saldo: R$ ${formatarBRL(saldo)} (${saldo >= 0 ? 'positivo' : 'negativo'})`
      );
    }

    default:
      return 'Ferramenta não reconhecida.';
  }
}

/* ── System prompt ───────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `Você é o Granabô, o assistente financeiro do app Grana.

Regras invioláveis:
1. NUNCA invente um valor em reais. Todo número financeiro que você mencionar DEVE ter vindo do resultado de uma ferramenta.
2. Se a pergunta não puder ser respondida com as ferramentas disponíveis, diga isso com gentileza.
3. Seja direto e amigável. Use frases curtas.
4. NUNCA julgue os gastos do usuário. Não diga "você gastou muito" nem "você deveria economizar" — só apresente os números quando pedidos.
5. Responda em português do Brasil.
6. Quando os valores vierem das ferramentas, apresente-os de forma clara e natural.
7. Se o usuário só mandar uma saudação ("oi", "olá"), apresente-se brevemente e diga o que você pode fazer.
8. Use emojis com moderação — no máximo um por mensagem.`;

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

    if (!GROQ_API_KEY) {
      console.error('[assistente-financeiro] GROQ_API_KEY não configurada');
      return erro('sem_provedor', 503, 'Não consegui pensar nisso agora. Tenta de novo em instantes.');
    }

    /* ── Montar mensagens para o LLM ─────────────────────────────────── */
    const messages: { role: string; content: string }[] = [{ role: 'system', content: SYSTEM_PROMPT }];

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

    const chatRes = await fetchComTimeout(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chatPayload),
    });

    if (!chatRes.ok) {
      const status = chatRes.status;
      console.error(`[assistente-financeiro] Groq respondeu ${status}:`, await chatRes.text());
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
          resultado = await executarFerramenta(nome, args, supabase, userId);
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

      /* Segunda chamada: LLM formula a resposta com os dados reais */
      const followUpRes = await fetchComTimeout(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
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
