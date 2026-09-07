// Política compartilhada pelo fluxo real e pelos testes offline.
export type Consulta = { nome: string; args: Record<string, unknown> };
export type Registro = Consulta & { resultado: string; ok: boolean; consulta: boolean };
export const META = new Set(['naoConsegui', 'lembrarFato', 'lembrarPreferencia', 'ensinarApelido']);
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function resultadoValido(texto: string): boolean {
  return !!texto.trim() && !/(^erro|nao existe |nao tem nenhum|nao ha .*cadastrad|nao consegui|nao deu|nao gravei|faltou|faltam|invalido|invalida|nao reconhecida|nao bate com|reformular|motivo interno)/.test(normalizar(texto));
}

export function feedbackExplicito(texto: string): 'positivo' | 'negativo' | null {
  const s = normalizar(texto).trim();
  if (/\b(esta errado|ta errado|resposta errada|nao foi isso|nao era isso|voce errou|nao pedi|eu quis dizer)\b/.test(s)) return 'negativo';
  // Não confundir "certo, mas está errado" ou uma nova pergunta com confirmação.
  if (/^(isso mesmo|correto|agora sim|esta correto|resposta correta|exatamente)[!.\s]*$/.test(s)) return 'positivo';
  return null;
}

function valores(texto: string): string[] {
  return [...texto.matchAll(/R\$\s*(-?\s*\d[\d.,]*)/g)]
    .map((m) => m[1].replace(/\s/g, '').replace(/\.$/, ''));
}

export function respostaFundamentada(texto: string, registros: Registro[]): boolean {
  // Uma consulta ampla bem-sucedida não resolve a ausência do cartão/categoria
  // solicitado. Sem recuperação do filtro, nenhum valor pode ser apresentado.
  const pendente = registros.some((r, i) => r.consulta && !r.ok &&
    !registros.slice(i + 1).some((c) => c.consulta && c.ok && c.nome === r.nome));
  if (pendente && valores(texto).length) return false;
  const permitidos = new Set(registros.filter((r) => r.ok && r.consulta).flatMap((r) => valores(r.resultado)));
  return valores(texto).every((valor) => permitidos.has(valor));
}

export function exemploElegivel(texto: string, registros: Registro[]): boolean {
  const consultas = registros.filter((r) => r.consulta);
  return resultadoValido(texto) && consultas.length > 0 &&
    consultas.every((r, i) => r.ok || consultas.slice(i + 1).some((c) => c.nome === r.nome && c.ok)) &&
    registros.every((r) => r.nome !== 'naoConsegui') &&
    respostaFundamentada(texto, registros);
}

export function fallbackSeguro(registros: Registro[]): string {
  const consultas = registros.filter((r) => r.consulta);
  if (consultas.some((r) => /nao tem nenhum cartao/.test(normalizar(r.resultado)))) {
    return 'Não encontrei nenhum cartão de crédito cadastrado na sua conta. Preciso do cartão cadastrado para consultar essa fatura.';
  }
  if (!consultas.length || consultas.some((r) => !r.ok)) {
    return 'Não consegui concluir essa consulta. Pode confirmar o período e os filtros que deseja consultar?';
  }
  return [...new Set(consultas.map((r) => r.resultado))].map((resultado) => resultado
    .replace(/O usuário gastou/g, 'Você gastou')
    .replace(/\s*Cite[^.\n]*\./g, '')
    .replace(/\s*\(cite-os na resposta\)/g, '')).join('\n\n');
}

export type MensagemLLM = { role: string; content?: string | null; tool_call_id?: string; tool_calls?: any[] };

/** Até três rodadas para aprender apelidos, corrigir argumentos e consultar.
 * Chamadas idênticas são reutilizadas, inclusive escritas de memória.
 * Nunca executa ferramentas fora do catálogo ou com JSON inválido.
 */
export async function conduzirConversa(options: {
  messages: MensagemLLM[];
  tools: any[];
  deadline?: number;
  chamar: (payload: Record<string, unknown>) => Promise<any>;
  executar: (nome: string, args: Record<string, unknown>) => Promise<string>;
}): Promise<{ resposta: string; registros: Registro[]; recuperado: boolean }> {
  const messages = [...options.messages];
  const registros: Registro[] = [];
  const cache = new Map<string, Registro>();
  const filtrosAtivos: Record<string, unknown> = {};
  for (let rodada = 0; rodada < 4; rodada++) {
    if (Date.now() >= (options.deadline ?? Infinity)) break;
    let choice: any;
    try {
      choice = await options.chamar({ messages, tools: options.tools,
        tool_choice: rodada < 3 ? 'auto' : 'none', temperature: 0.2, max_tokens: 1536 });
    } catch (e) {
      if (!registros.length) throw e;
      break;
    }
    const calls = choice?.tool_calls;
    if (!calls?.length) {
      const resposta = typeof choice?.content === 'string' ? choice.content.trim() : '';
      if (resposta && respostaFundamentada(resposta, registros)) {
        return { resposta, registros, recuperado: false };
      }
      if (rodada < 3) {
        messages.push({ role: 'system', content: 'A resposta veio vazia ou contém valor em reais sem evidência. Consulte os dados e responda somente com valores retornados pelas ferramentas.' });
        continue;
      }
      break;
    }
    if (rodada === 3 || calls.length > 8) break;
    messages.push(choice);
    for (const call of calls) {
      const nome = call?.function?.name;
      const schema = options.tools.find((t) => t.function.name === nome)?.function.parameters;
      let args: Record<string, unknown> = {};
      let resultado: string;
      let ok = false;
      try {
        if (!schema || typeof call.id !== 'string') throw new Error('Ferramenta inválida');
        const parsed = JSON.parse(call.function.arguments ?? '{}');
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Argumentos inválidos');
        args = parsed;
        // Uma tentativa posterior só pode trocar os filtros, nunca omiti-los
        // silenciosamente. Ferramenta sem capacidade de aplicá-los é recusada.
        if (!META.has(nome)) {
          for (const [key, value] of Object.entries(filtrosAtivos)) {
            if (!schema.properties?.[key]) throw new Error('Ferramenta não suporta os filtros solicitados');
            if (args[key] === undefined) args[key] = value;
          }
        }
        for (const required of schema.required ?? []) {
          if (args[required] === undefined) throw new Error('Argumento obrigatório ausente');
        }
        for (const [key, value] of Object.entries(args)) {
          const prop = schema.properties?.[key];
          if (!prop || typeof value !== prop.type || (prop.enum && !prop.enum.includes(value))) throw new Error('Argumento inválido');
          if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Número inválido');
        }
        if (!META.has(nome)) {
          for (const key of ['cartao', 'categoria', 'carteira', 'payment_method', 'fatura']) {
            if (args[key] !== undefined && args[key] !== '') filtrosAtivos[key] = args[key];
          }
        }
        const key = nome + ':' + JSON.stringify(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)));
        const anterior = cache.get(key);
        resultado = anterior ? anterior.resultado : await options.executar(nome, args);
        ok = resultadoValido(resultado) && nome !== 'naoConsegui';
        cache.set(key, { nome, args, resultado, ok, consulta: !META.has(nome) });
      } catch {
        resultado = 'Erro ao executar a consulta: verifique os argumentos. Se faltar informação, pergunte ao usuário sem inventar valores.';
      }
      registros.push({ nome, args, resultado, ok, consulta: !META.has(nome) });
      messages.push({ role: 'tool', tool_call_id: call.id, content: resultado });
    }
  }
  return { resposta: fallbackSeguro(registros), registros, recuperado: true };
}
