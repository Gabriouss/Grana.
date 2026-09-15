// Política compartilhada pelo fluxo real e pelos testes offline.
export type Consulta = { nome: string; args: Record<string, unknown> };
export type Registro = Consulta & { resultado: string; ok: boolean; consulta: boolean };
export type MensagemHistorico = { papel: string; texto: string };
/* As de escrita entram aqui TAMBÉM, e não só em `ESCRITAS`, por um motivo
   mecânico: tudo que está fora de `META` recebe injeção automática dos filtros
   ativos da conversa (cartão, categoria, carteira...). Uma ferramenta de
   lançamento, cujo único argumento é o texto do pedido, seria recusada com
   "não suporta os filtros solicitados" sempre que a conversa tivesse passado
   por uma consulta filtrada antes — ou seja, o lançamento falharia por causa
   da pergunta anterior. */
export const META = new Set([
  'naoConsegui', 'lembrarFato', 'lembrarPreferencia', 'ensinarApelido',
  'criarLancamento', 'desfazerUltimoLancamento',
]);

/**
 * Ferramentas que ESCREVEM dinheiro. Nem consulta, nem meta — e a distinção
 * não é burocrática, cada lado resolve um problema diferente:
 *
 * - **Não são consulta**, porque `exemploElegivel` aprende os planos das
 *   consultas para repetir em perguntas parecidas. Aprender uma ESCRITA
 *   significaria o assistente repetir um lançamento sozinho ao ver uma frase
 *   semelhante. Dinheiro não pode ser criado por semelhança.
 * - **Mas valem como fonte de valor**, porque a confirmação legítima de um
 *   lançamento cita o valor gravado ("Lancei R$ 20,00"). Sem estar aqui, esse
 *   R$ 20,00 não constaria de `permitidos`, `respostaFundamentada` reprovaria
 *   a frase verdadeira, e o `fallbackSeguro` diria "não consegui concluir essa
 *   consulta" DEPOIS de o dinheiro já ter entrado — a mentira exata que o
 *   lançamento pelo chat foi feito para eliminar.
 */
export const ESCRITAS = new Set(['criarLancamento', 'desfazerUltimoLancamento']);
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const PEDIDO_DE_LANCAMENTO = /\b(?:lan[cç](?:a|e|ar)|anot(?:a|e|ar)|registr(?:a|e|ar)|adicion(?:a|e|ar)|coloc(?:a|e|ar)|cadastr(?:a|e|ar)|inclu(?:a|i|ir)|salv(?:a|e|ar))\b/i;
const SINAL_DE_LANCAMENTO = /\b(?:lan[cç](?:a|e|ar)|anot(?:a|e|ar)|registr(?:a|e|ar)|adicion(?:a|e|ar)|coloc(?:a|e|ar)|cadastr(?:a|e|ar)|inclu(?:a|i|ir)|salv(?:a|e|ar)|joguei|fiz|comprei|paguei|gastei|recebi|compra|boleto|conta\s+a\s+pagar)\b/i;
const FATO_NUMERICO = /(?:\br\$\s*[\d.,]*\d|\b\d+(?:[.,]\d{1,2})?\s*(?:reais?|contos?|pila|paus?|mangos?|centavos?)\b|\b\d{1,3}\s*(?:x|vezes|parcelas?)\b|\bparcel(?:ado|ada|as?)\s*(?:em\s*)?\d{1,3}\b)/i;

/**
 * Texto financeiro confiável: números só podem vir do que o usuário digitou.
 * O argumento do modelo é ignorado porque ele pode trocar "283,72 em 8x"
 * por "283.728 em 86 vezes" antes de chamar a ferramenta.
 */
export function textoLancamentoConfiavel(
  mensagem: string,
  historico: MensagemHistorico[] = []
): string {
  const atual = mensagem.trim();
  if (!atual) return atual;

  /* Uma nova mensagem que pede o lançamento é a fonte inteira, sem misturar
     números de uma conversa anterior. */
  if (PEDIDO_DE_LANCAMENTO.test(atual) ||
      (SINAL_DE_LANCAMENTO.test(atual) && FATO_NUMERICO.test(atual))) return atual;

  const fonteAnterior = [...historico].reverse().find((item) =>
    item.papel === 'usuario' && SINAL_DE_LANCAMENTO.test(item.texto) &&
    (FATO_NUMERICO.test(item.texto) || PEDIDO_DE_LANCAMENTO.test(item.texto))
  );
  if (!fonteAnterior) return atual;

  /* Respostas de esclarecimento podem trazer o valor ou as parcelas (quando
     a primeira mensagem só dizia o que foi comprado). Ponha a resposta
     primeiro para uma correção explícita de valor vencer a antiga. */
  return FATO_NUMERICO.test(atual)
    ? `${atual} ${fonteAnterior.texto}`.trim()
    : `${fonteAnterior.texto} ${atual}`.trim();
}

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
  const permitidos = new Set(
    registros.filter((r) => r.ok && (r.consulta || ESCRITAS.has(r.nome))).flatMap((r) => valores(r.resultado))
  );
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
  /* Escrita bem-sucedida manda em qualquer outra coisa. Se o lançamento entrou
     e o modelo, ainda assim, não produziu uma frase aceitável, a saída honesta
     é dizer o que FOI FEITO — nunca a mensagem genérica de falha logo abaixo,
     que mandaria a pessoa lançar de novo e criaria o lançamento em dobro. */
  const escrita = registros.filter((r) => r.ok && ESCRITAS.has(r.nome)).at(-1);
  if (escrita) return escrita.resultado;

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

/** Escrita confirmada não passa pela redação livre do modelo. */
export function respostaFinalSegura(resposta: string, registros: Registro[]): string {
  const escrita = registros.filter((r) => r.ok && ESCRITAS.has(r.nome)).at(-1);
  return escrita?.resultado ?? resposta;
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
  prepararArgs?: (nome: string, args: Record<string, unknown>) => void;
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
        options.prepararArgs?.(nome, args);
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
