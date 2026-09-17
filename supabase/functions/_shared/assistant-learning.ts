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

/** Final de toda pergunta que o lançamento pelo chat faz à pessoa (ver
 *  `executarCriarLancamento`). É por ele que uma resposta com verbo é
 *  reconhecida como resposta, e não como pedido novo. */
export const AINDA_NAO_REGISTREI = 'Ainda não registrei nada.';

const PALAVRAS_DE_LIGACAO = new Set([
  'a', 'o', 'as', 'os', 'e', 'em', 'na', 'no', 'nas', 'nos', 'de', 'da', 'do', 'pra', 'pro', 'para',
  'como', 'categoria', 'cartao', 'foi', 'pode', 'por', 'favor', 'ai', 'isso', 'esse', 'essa', 'nesse',
  'nessa', 'ser', 'la', 'ta', 'sim', 'mesmo', 'entao',
]);

/** O que sobra de uma resposta sem o verbo de lançamento e sem as palavras de ligação. */
function nucleoDaResposta(texto: string): string {
  return normalizar(texto)
    .replace(new RegExp(PEDIDO_DE_LANCAMENTO.source, 'gi'), ' ')
    .replace(/[^\p{L}\d.,/ ]+/gu, ' ')
    .split(/\s+/)
    .filter((palavra) => palavra && !PALAVRAS_DE_LIGACAO.has(palavra))
    .join(' ');
}

/**
 * Se a mensagem atual responde à pergunta que o chat acabou de fazer.
 *
 * Em 16/09/2026, "Coloca em Alimentação", respondendo à pergunta de categoria,
 * era lida como pedido NOVO por ter o verbo "coloca" — sem o valor da mensagem
 * anterior, o Granabô dizia que não achou o valor. A regra de pedido novo
 * existe para não misturar números de conversas diferentes, então a exceção é
 * estreita: a pergunta pendente precisa ser uma das do lançamento, e a
 * resposta, tirado o verbo, precisa ser SÓ o que foi perguntado — uma das
 * opções listadas, um valor, ou um dia. "lança uber 15 reais" depois da
 * pergunta continua sendo pedido novo.
 */
function respondePerguntaPendente(atual: string, pergunta: string): boolean {
  if (!pergunta.trim().endsWith(AINDA_NAO_REGISTREI)) return false;
  const nucleo = nucleoDaResposta(atual);
  if (!nucleo) return false;
  const lista = pergunta.match(/(?:Qual destas é a certa|Em qual cartão foi):\s*(.+)\?\s*Ainda não registrei nada\.\s*$/);
  if (lista) {
    return lista[1].split(/,\s*/).some((opcao) => nucleoDaResposta(opcao) === nucleo);
  }
  if (/Não identifiquei o valor/.test(pergunta)) {
    return /^(?:r\s+)?\d+(?:[.,]\d{1,2})?(?:\s+(?:reais?|real|contos?|pila|paus?|centavos?))?$/.test(nucleo);
  }
  if (/não achei o vencimento/.test(pergunta)) {
    return /^(?:dia\s+)?\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?$/.test(nucleo);
  }
  return false;
}

/** A mensagem atual e, quando ela só esclarece um pedido anterior, a frase
 *  desse pedido. Um lugar só decide isso, para o texto financeiro e o nome do
 *  lançamento nunca discordarem sobre qual foi o pedido. */
function origemDoLancamento(
  mensagem: string,
  historico: MensagemHistorico[]
): { atual: string; anterior: string | null } {
  const atual = mensagem.trim();
  if (!atual) return { atual, anterior: null };

  const ultima = historico[historico.length - 1];
  const respondePergunta = ultima?.papel === 'assistente' && respondePerguntaPendente(atual, ultima.texto);

  /* Uma nova mensagem que pede o lançamento é a fonte inteira, sem misturar
     números de uma conversa anterior — a não ser que ela só responda à
     pergunta que o chat acabou de fazer. */
  if (!respondePergunta && (PEDIDO_DE_LANCAMENTO.test(atual) ||
      (SINAL_DE_LANCAMENTO.test(atual) && FATO_NUMERICO.test(atual)))) return { atual, anterior: null };

  const fonteAnterior = [...historico].reverse().find((item) =>
    item.papel === 'usuario' && SINAL_DE_LANCAMENTO.test(item.texto) &&
    (FATO_NUMERICO.test(item.texto) || PEDIDO_DE_LANCAMENTO.test(item.texto))
  );
  return { atual, anterior: fonteAnterior ? fonteAnterior.texto : null };
}

/**
 * Texto financeiro confiável: números só podem vir do que o usuário digitou.
 * O argumento do modelo é ignorado porque ele pode trocar "283,72 em 8x"
 * por "283.728 em 86 vezes" antes de chamar a ferramenta.
 */
export function textoLancamentoConfiavel(
  mensagem: string,
  historico: MensagemHistorico[] = []
): string {
  const { atual, anterior } = origemDoLancamento(mensagem, historico);
  if (anterior === null) return atual;

  /* Respostas de esclarecimento podem trazer o valor ou as parcelas (quando
     a primeira mensagem só dizia o que foi comprado). Ponha a resposta
     primeiro para uma correção explícita de valor vencer a antiga. */
  return FATO_NUMERICO.test(atual)
    ? `${atual} ${anterior}`.trim()
    : `${anterior} ${atual}`.trim();
}

/**
 * De onde sai o NOME do lançamento, em ordem de preferência: a frase que pediu
 * o lançamento e, só depois, a resposta a uma pergunta do assistente.
 *
 * O texto financeiro acima junta a resposta à frase original, e precisa: é ela
 * que traz a categoria, o cartão ou o valor que faltava. Para o nome, a junção
 * atrapalha. Em 16/09/2026, na conta de teste, "lança energético 10,99 no
 * crédito C6" seguido de "Alimentação" foi gravado como "Energético no crédito
 * Alimentação". A resposta só serve de nome quando a frase original não tinha
 * nome nenhum ("lança 20 reais no crédito C6", e depois "almoço").
 */
export function fontesDoNomeDoLancamento(
  mensagem: string,
  historico: MensagemHistorico[] = []
): string[] {
  const { atual, anterior } = origemDoLancamento(mensagem, historico);
  return (anterior === null ? [atual] : [anterior, atual])
    .map((texto) => texto.trim())
    .filter(Boolean);
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

/* Verbos com que o Granabô AFIRMA que a escrita já aconteceu. Só as formas
   sem acento: a checagem roda sobre o texto normalizado. */
const AFIRMA_ESCRITA =
  /\b(registrei|lancei|anotei|adicionei|salvei|cadastrei|removi|apaguei|exclui|desfiz|registrado|registrada|lancado|lancada|anotado|anotada|salvo|salva|cadastrado|cadastrada|removido|removida|apagado|apagada|excluido|excluida|desfeito|desfeita)\b/g;

/**
 * Se a frase afirma, de forma positiva, que um lançamento foi criado ou
 * removido. Negativas ("ainda não registrei nada", "não consegui apagar")
 * ficam de fora: elas são justamente o contrário de uma afirmação.
 */
function afirmaEscritaFeita(texto: string): boolean {
  const s = normalizar(texto);
  for (const achado of s.matchAll(AFIRMA_ESCRITA)) {
    const antes = s.slice(Math.max(0, (achado.index ?? 0) - 40), achado.index);
    // Negação vale até o fim da frase em que ela aparece.
    if (!/\b(nao|nem|sem|ainda)\b[^.!?]*$/.test(antes)) return true;
  }
  return false;
}

export function respostaFundamentada(texto: string, registros: Registro[]): boolean {
  /* Afirmar que registrou ou desfez sem NENHUMA ferramenta de escrita ter sido
     chamada no turno é a alucinação mais cara que este assistente pode
     cometer: a pessoa fecha o app achando que o dinheiro entrou, ou que saiu.
     A trava de valores abaixo não pega isso, porque só enxerga números
     prefixados por "R$" — e "Desfeito. Removi o último lançamento" não tem
     número nenhum. Observado no Granachat em 16/09/2026: o chat anunciou
     "Desfeito. Removi o último lançamento que eu tinha registrado" numa hora
     em que nenhuma operação foi desfeita no banco (`voice_operations` sem
     `undone_at` correspondente, e a transação ainda lá).

     A checagem é por ferramenta CHAMADA, não por ferramenta bem-sucedida: com
     a ferramenta chamada o modelo tem base para falar do que aconteceu,
     inclusive para dizer que o lançamento já tinha sido desfeito antes. */
  if (!registros.some((r) => ESCRITAS.has(r.nome)) && afirmaEscritaFeita(texto)) return false;

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
