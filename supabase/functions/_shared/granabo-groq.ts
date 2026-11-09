/** Transporte candidato da P8. Só será ligado ao Granabô após comparação viva.
 * O orçamento absoluto é compartilhado com quem conduz todas as rodadas.
 * Nenhuma ferramenta hospedada de busca/MCP/código é habilitada aqui.
 */
export const MODELO_CHAT_GROQ = 'openai/gpt-oss-120b';
const URL_CHAT_GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const PRAZO_POR_CHAMADA_MS = 10_000;

export class ErroChatGroq extends Error {
  constructor(readonly codigo: 'muitas_tentativas' | 'sem_provedor' | 'demorou') {
    super(codigo === 'muitas_tentativas' ? 'O limite do assistente foi atingido. Tente mais tarde.'
      : codigo === 'demorou' ? 'A consulta demorou demais. Tente novamente em instantes.'
      : 'O assistente está indisponível agora. Tente mais tarde.');
    this.name = 'ErroChatGroq';
  }
}

type MensagemGroq = { role: 'assistant'; content: string | null; tool_calls?: unknown[] };

/** Sem retry: limite/erro não gera mais tráfego nem um prazo novo a cada rodada. */
export async function chamarChatGroq(
  payload: Record<string, unknown>,
  opcoes: { key: string; deadline: number },
): Promise<{ message: MensagemGroq; usage: unknown }> {
  if (!opcoes.key) throw new ErroChatGroq('sem_provedor');
  const restante = opcoes.deadline - Date.now();
  if (!Number.isFinite(restante) || restante <= 0) throw new ErroChatGroq('demorou');
  if (!Array.isArray(payload.messages) || payload.messages.length === 0
    || (payload.tools !== undefined && (!Array.isArray(payload.tools) || payload.tools.some((t) =>
      !t || t.type !== 'function' || typeof t.function?.name !== 'string')))) {
    throw new ErroChatGroq('sem_provedor');
  }
  const controller = new AbortController();
  let expirou = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expirou = true;
      controller.abort();
      reject(new ErroChatGroq('demorou'));
    }, Math.min(PRAZO_POR_CHAMADA_MS, restante));
  });
  try {
    return await Promise.race([limite, (async () => {
      const res = await fetch(URL_CHAT_GROQ, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${opcoes.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: payload.messages, tools: payload.tools,
          tool_choice: payload.tool_choice ?? 'auto', temperature: payload.temperature ?? 0.2,
          max_tokens: payload.max_tokens ?? 1536, model: MODELO_CHAT_GROQ,
          reasoning_effort: 'low', include_reasoning: false, parallel_tool_calls: false, stream: false }),
      });
      if (expirou) {
        void res.body?.cancel().catch(() => {});
        throw new ErroChatGroq('demorou');
      }
      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        throw new ErroChatGroq(res.status === 429 ? 'muitas_tentativas' : 'sem_provedor');
      }
      // O timer continua ativo durante a leitura do corpo, inclusive se o
      // fetch não obedecer ao abort. Resultado tardio não passa ao chamador.
      const dados = await res.json();
      if (expirou) throw new ErroChatGroq('demorou');
      const m = dados?.choices?.[0]?.message;
      if (!m || m.role !== 'assistant' || (typeof m.content !== 'string' && !Array.isArray(m.tool_calls))
        || (!m.content?.trim() && !m.tool_calls?.length)) throw new ErroChatGroq('sem_provedor');
      const message: MensagemGroq = { role: 'assistant', content: typeof m.content === 'string' ? m.content : null };
      if (Array.isArray(m.tool_calls)) message.tool_calls = m.tool_calls;
      // Não repassar reasoning nem campos livres do provedor ao histórico/app.
      return { message, usage: dados.usage ?? null };
    })()]);
  } catch (erro) {
    if (erro instanceof ErroChatGroq) throw erro;
    throw new ErroChatGroq(expirou ? 'demorou' : 'sem_provedor');
  } finally {
    clearTimeout(timer);
  }
}
