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

/** Final de todo recibo de lançamento GRAVADO (ver `executarCriarLancamento`).
 *  É por ele que se sabe que o pedido anterior já foi consumido. */
export const RECIBO_DE_LANCAMENTO = 'Se quiser desfazer, é só dizer "desfaz".';

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

/** Começo do recibo que avisa que um lançamento à espera de resposta foi
 *  abandonado (ver `lancamentoPendenteDescartado`). Como o recibo de gravação,
 *  é fronteira: a busca do pedido anterior não passa dele. */
export const RECIBO_DE_DESCARTE = 'Deixei de lado o lançamento';

const ORDINAIS = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'setima', 'oitava', 'nona', 'decima'];

/** "assinatura" responde "Assinaturas": só o "s" final de cada palavra cai. */
const semPlural = (s: string) => s.split(' ').map((p) => (p.length > 3 ? p.replace(/s$/, '') : p)).join(' ');

/** As opções de uma pergunta de lista do lançamento, ou null se não for uma. */
function opcoesDaPergunta(pergunta: string): string[] | null {
  const lista = pergunta.trim().match(/(?:Qual destas é a certa|Em qual cartão foi):\s*(.+)\?\s*Ainda não registrei nada\.$/);
  return lista ? lista[1].split(/,\s*/).filter(Boolean) : null;
}

function mesmaOpcao(nucleo: string, opcao: string): boolean {
  const alvo = nucleoDaResposta(opcao);
  return alvo === nucleo || semPlural(alvo) === semPlural(nucleo);
}

/** A opção que a resposta escolhe: pelo nome, no singular ou no plural, pela
 *  posição ("6", "opção 6") ou pelo ordinal ("a sexta", "o primeiro"). */
function opcaoEscolhida(atual: string, opcoes: string[]): string | null {
  const nucleo = nucleoDaResposta(atual);
  if (!nucleo) return null;
  const porNome = opcoes.find((opcao) => mesmaOpcao(nucleo, opcao));
  if (porNome) return porNome;
  const posicao = nucleo
    .replace(/\b(?:opcao|numero)\b/g, ' ')
    .trim()
    .split(/\s+/)
    .map((palavra) => palavra.replace(/o$/, 'a'))
    .join(' ');
  const indice = /^\d{1,2}[aª]?$/.test(posicao) ? parseInt(posicao, 10) - 1 : ORDINAIS.indexOf(posicao);
  return indice >= 0 && indice < opcoes.length ? opcoes[indice] : null;
}

/**
 * A resposta à pergunta que o chat acabou de fazer, já resolvida, ou null se a
 * mensagem não responde a ela.
 *
 * Em 16/09/2026, "Coloca em Alimentação", respondendo à pergunta de categoria,
 * era lida como pedido NOVO por ter o verbo "coloca" — sem o valor da mensagem
 * anterior, o Granabô dizia que não achou o valor. A regra de pedido novo
 * existe para não misturar números de conversas diferentes, então a exceção é
 * estreita: a pergunta pendente precisa ser uma das do lançamento, e a
 * resposta, tirado o verbo, precisa ser SÓ o que foi perguntado — uma das
 * opções listadas, um valor, ou um dia. "lança uber 15 reais" depois da
 * pergunta continua sendo pedido novo.
 *
 * Opção escolhida volta com o nome da lista: "a sexta" e "6" viram
 * "Assinaturas", porque o interpretador acha a categoria pelo nome, não pela
 * posição (prints do autor, 13/10/2026).
 */
function respostaDaPergunta(atual: string, pergunta: string): string | null {
  if (!pergunta.trim().endsWith(AINDA_NAO_REGISTREI)) return null;
  const nucleo = nucleoDaResposta(atual);
  if (!nucleo) return null;
  const opcoes = opcoesDaPergunta(pergunta);
  if (opcoes) return opcaoEscolhida(atual, opcoes);
  if (/Não identifiquei o valor/.test(pergunta)) {
    return /^(?:r\s+)?\d+(?:[.,]\d{1,2})?(?:\s+(?:reais?|real|contos?|pila|paus?|centavos?))?$/.test(nucleo) ? atual : null;
  }
  if (/não achei o vencimento/.test(pergunta)) {
    return /^(?:dia\s+)?\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?$/.test(nucleo) ? atual : null;
  }
  return null;
}

function ehPedidoNovo(texto: string): boolean {
  return PEDIDO_DE_LANCAMENTO.test(texto) || (SINAL_DE_LANCAMENTO.test(texto) && FATO_NUMERICO.test(texto));
}

/**
 * Depois de uma pergunta de lista (categoria, cartão), uma mensagem com número
 * que traz outra coisa além do número e de uma das opções é outro lançamento:
 * "uber 20", digitado com "Meli+ 113 reais" à espera da categoria, não pode
 * virar "Meli+" gravado em Transporte. "Alimentação, foi 12,50 reais" continua
 * sendo resposta com correção de valor.
 */
function trazOutroLancamento(atual: string, pergunta: string): boolean {
  const opcoes = opcoesDaPergunta(pergunta);
  if (!opcoes || !/\d/.test(atual)) return false;
  const resto = nucleoDaResposta(atual)
    .replace(/\br\s*(?=\d)/g, ' ')
    .replace(/\d+(?:[.,]\d+)*/g, ' ')
    .replace(/[.,/]+/g, ' ')
    .replace(/\b(?:reais?|real|contos?|pila|paus?|mangos?|centavos?)\b/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return !!resto && !opcoes.some((opcao) => mesmaOpcao(resto, opcao));
}

const perguntaDoLancamento = (item: MensagemHistorico | undefined): string | null =>
  item?.papel === 'assistente' && item.texto.trim().endsWith(AINDA_NAO_REGISTREI) ? item.texto : null;

/** Se a mensagem, vinda logo depois da pergunta, continua o mesmo lançamento. */
function continuaOPedido(texto: string, pergunta: string): boolean {
  return respostaDaPergunta(texto, pergunta) !== null || (!ehPedidoNovo(texto) && !trazOutroLancamento(texto, pergunta));
}

/**
 * O pedido que a última pergunta do lançamento deixou em aberto, e as
 * respostas já dadas a perguntas anteriores do mesmo pedido.
 *
 * A pergunta terminada em "Ainda não registrei nada." é a prova de que a
 * mensagem antes dela pediu um lançamento, com verbo ou sem. Até 15/10/2026 a
 * busca exigia verbo ou "gastei/comprei" na frase original: "Meli+ 113 reais"
 * não tem nenhum dos dois, a resposta "Assinaturas" seguia sozinha para o
 * interpretador, e o Granabô dizia que não achou o valor, em laço (prints do
 * autor, 13/10/2026).
 */
function pedidoPendente(historico: MensagemHistorico[]): { pedido: string; esclarecimentos: string[] } | null {
  const esclarecimentos: string[] = [];
  for (let i = historico.length - 1; i >= 1; i -= 2) {
    const fala = historico[i - 1];
    if (!perguntaDoLancamento(historico[i]) || fala.papel !== 'usuario' || !fala.texto.trim()) return null;
    const perguntaAnterior = perguntaDoLancamento(historico[i - 2]);
    if (!perguntaAnterior || !continuaOPedido(fala.texto, perguntaAnterior)) {
      return { pedido: fala.texto.trim(), esclarecimentos: esclarecimentos.reverse() };
    }
    esclarecimentos.push((respostaDaPergunta(fala.texto, perguntaAnterior) ?? fala.texto).trim());
  }
  return null;
}

type Origem = { atual: string; anterior: string | null; esclarecimentos: string[] };

/** A mensagem atual e, quando ela só esclarece um pedido anterior, a frase
 *  desse pedido. Um lugar só decide isso, para o texto financeiro e o nome do
 *  lançamento nunca discordarem sobre qual foi o pedido. */
function origemDoLancamento(mensagem: string, historico: MensagemHistorico[]): Origem {
  const atual = mensagem.trim();
  const sozinha: Origem = { atual, anterior: null, esclarecimentos: [] };
  if (!atual) return sozinha;

  const pergunta = perguntaDoLancamento(historico[historico.length - 1]);
  const resposta = pergunta ? respostaDaPergunta(atual, pergunta) : null;

  /* Uma nova mensagem que pede o lançamento é a fonte inteira, sem misturar
     números de uma conversa anterior — a não ser que ela só responda à
     pergunta que o chat acabou de fazer. */
  if (resposta === null && ehPedidoNovo(atual)) return sozinha;

  /* Com uma pergunta do lançamento à espera, o pedido é o que ela perguntou. */
  if (pergunta) {
    if (resposta === null && trazOutroLancamento(atual, pergunta)) return sozinha;
    const pendente = pedidoPendente(historico);
    if (pendente) return { atual: resposta ?? atual, anterior: pendente.pedido, esclarecimentos: pendente.esclarecimentos };
  }

  /* Um pedido que já virou lançamento não é mais pedido: o recibo de gravação
     é a fronteira, e a busca não passa dele. Até 19/09/2026 passava. Com
     "lança 5 reais do café gelado" já registrado no histórico, a mensagem
     "gastei 23,50 no mercado" caía aqui (tem sinal de lançamento, mas "23,50"
     sem "reais" não conta como fato numérico), era juntada ao pedido do café,
     e o Granabô gravava OUTRO café de R$ 5,00 confirmando que tinha dado
     certo. Visto na conta de teste: três "Cafe gelado R$ 5,00" (achado W5).
     O recibo de descarte é fronteira pelo mesmo motivo: o pedido abandonado
     não volta a ser juntado a uma mensagem posterior.

     A junção continua valendo enquanto o pedido está em aberto, inclusive
     depois de uma pergunta livre do modelo ("Qual cartão você usou?"), que é
     o caso que `__tests__/assistant-learning.cjs` prende. */
  let fonteAnterior: MensagemHistorico | undefined;
  for (let i = historico.length - 1; i >= 0; i--) {
    const item = historico[i];
    if (item.papel === 'assistente' &&
        (item.texto.trim().endsWith(RECIBO_DE_LANCAMENTO) || item.texto.trim().startsWith(RECIBO_DE_DESCARTE))) break;
    if (item.papel === 'usuario' && SINAL_DE_LANCAMENTO.test(item.texto) &&
        (FATO_NUMERICO.test(item.texto) || PEDIDO_DE_LANCAMENTO.test(item.texto))) {
      fonteAnterior = item;
      break;
    }
  }
  return { atual: resposta ?? atual, anterior: fonteAnterior ? fonteAnterior.texto : null, esclarecimentos: [] };
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
  const { atual, anterior, esclarecimentos } = origemDoLancamento(mensagem, historico);
  if (anterior === null) return atual;

  /* Respostas de esclarecimento podem trazer o valor ou as parcelas (quando
     a primeira mensagem só dizia o que foi comprado). Ponha as que trazem
     número primeiro, a mais recente antes, para uma correção explícita de
     valor vencer a antiga. */
  const respostas = [atual, ...[...esclarecimentos].reverse()];
  const comValor = respostas.filter((texto) => FATO_NUMERICO.test(texto));
  const semValor = respostas.filter((texto) => !FATO_NUMERICO.test(texto)).reverse();
  return [...comValor, anterior, ...semValor].join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Recibo de que um lançamento à espera de resposta foi abandonado, ou null.
 *
 * O pedido pendente só vive enquanto a última mensagem do Granabô é a pergunta
 * dele. Se a pessoa muda de assunto, ou pede outro lançamento, ele sai de cena,
 * e isso precisa ser dito: o silêncio deixaria a pessoa achando que os
 * R$ 113,00 da pergunta foram gravados. O recibo vai ANTES da resposta, para
 * uma pergunta nova continuar terminando em "Ainda não registrei nada.".
 */
export function lancamentoPendenteDescartado(
  mensagem: string,
  historico: MensagemHistorico[],
  registros: Registro[]
): string | null {
  const pergunta = perguntaDoLancamento(historico[historico.length - 1]);
  if (!pergunta) return null;
  const tentouLancar = registros.some((registro) => registro.nome === 'criarLancamento');
  if (tentouLancar && origemDoLancamento(mensagem, historico).anterior !== null) return null;
  const citado = pergunta.match(/de "([^"]+)" \(R\$ ([\d.,]+)\)/);
  return citado
    ? `${RECIBO_DE_DESCARTE} de "${citado[1]}" (R$ ${citado[2]}): ele ficou sem registro.`
    : `${RECIBO_DE_DESCARTE} que esperava resposta: ele ficou sem registro.`;
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

     Exige escrita BEM-SUCEDIDA, e não só chamada: com a ferramenta chamada e
     recusada, o modelo ainda podia dizer "pronto, desfiz". Os textos honestos
     de uma escrita que não mudou nada ("não tenho lançamento para desfazer",
     "não removi nada") passam pelo filtro e chegam à tela literais, por
     `respostaFinalSegura`, então não dependem da redação do modelo. */
  if (!registros.some((r) => r.ok && ESCRITAS.has(r.nome)) && afirmaEscritaFeita(texto)) return false;

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
