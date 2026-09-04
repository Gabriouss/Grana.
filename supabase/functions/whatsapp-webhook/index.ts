// Grana. — webhook do WhatsApp (Meta Cloud API)
//
// Roda como Supabase Edge Function (Deno), fora do bundle do app — por isso
// não importa nada de lib/ do projeto Expo: as heurísticas de categoria/valor
// abaixo são uma cópia mínima de lib/heuristics.ts, mantidas em sincronia à
// mão. Duplicar aqui é mais simples do que criar um pacote compartilhado só
// para esta função.
//
// Configuração necessária (supabase secrets set, uma vez por projeto):
//   WHATSAPP_VERIFY_TOKEN     — string arbitrária escolhida por você, usada
//                                só no handshake de verificação do webhook.
//   WHATSAPP_ACCESS_TOKEN     — token permanente do app da Meta (System User).
//   WHATSAPP_PHONE_NUMBER_ID  — id do número de telefone no Meta Cloud API.
//   WHATSAPP_APP_SECRET       — "Chave secreta do aplicativo" (App Secret) em
//                                Configurações do app -> Básico, no painel da
//                                Meta. Usada só para conferir a assinatura
//                                (X-Hub-Signature-256) de cada mensagem
//                                recebida — sem isso, qualquer pessoa que
//                                descobrisse esta URL poderia forjar POSTs se
//                                passando por um número já vinculado. Enquanto
//                                este secret não estiver configurado, a
//                                verificação fica desligada (com aviso no
//                                log) em vez de derrubar o webhook inteiro.
//   GROQ_API_KEY              — chave da Groq, provedor preferido para
//                                transcrever áudio (whisper-large-v3). Ordem
//                                de grandeza mais rápido e mais barato que a
//                                OpenAI para o mesmo modelo.
//   OPENAI_API_KEY            — opcional: fallback de transcrição (whisper-1)
//                                usado só quando a Groq falha ou não está
//                                configurada.
//   SUPABASE_SERVICE_ROLE_KEY — já disponível por padrão no ambiente da função.
//
// Depois de configurar os secrets, publique com:
//   supabase functions deploy whatsapp-webhook --no-verify-jwt
// e registre a URL pública como webhook do produto WhatsApp no Meta App
// Dashboard, usando o mesmo WHATSAPP_VERIFY_TOKEN no campo "Verify Token".

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
/* Normalização de número por extenso e limpeza de artefatos de transcrição —
   extraída pra supabase/functions/_shared/finance-command.ts na unificação de
   voz/widget: a mesma lógica agora serve whatsapp-webhook e (Fase 3)
   processar-lancamento-voz sem duas cópias divergindo. */
import { MOEDA, normalizarTextoTranscrito } from '../_shared/finance-command.ts';
import { provedoresPadrao, transcrever } from '../_shared/voice-transcription.ts';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const WHATSAPP_ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
const WHATSAPP_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// service_role: ignora RLS de propósito — a função precisa achar o dono de um
// número de telefone sem ter uma sessão de usuário autenticada.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MAX_BODY_BYTES = 512 * 1024;

async function fetchComTimeout(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/* ---- heurísticas (cópia mínima de lib/heuristics.ts e lib/types.ts) ---- */

const CATEGORIES: { name: string; color: string }[] = [
  { name: 'Alimentação', color: '#bb6b60' },
  { name: 'Moradia', color: '#93739e' },
  { name: 'Transporte', color: '#6b9dc2' },
  { name: 'Lazer', color: '#c66f8e' },
  { name: 'Saúde', color: '#74a17c' },
  { name: 'Assinaturas', color: '#d3b869' },
  { name: 'Salário', color: '#4f9483' },
  { name: 'Investimentos', color: '#c1a24c' },
  { name: 'Outros', color: '#8b9198' },
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação': ['alimentacao', 'alimentação', 'ifood', 'rappi', 'ze delivery', 'zé delivery', 'restaurante', 'mercado', 'supermercado', 'mercadinho', 'hortifruti', 'sacolao', 'sacolão', 'padaria', 'padoca', 'lanchonete', 'pizza', 'pizzaria', 'burguer', 'hamburguer', 'hambúrguer', 'açai', 'acai', 'sorvete', 'sorveteria', 'mcdonalds', 'burger king', 'subway', 'bobs', 'habibs', 'outback', 'giraffas', 'china in box', 'spoleto', 'pao de acucar', 'pão de açúcar', 'carrefour', 'assai', 'assaí', 'atacadao', 'atacadão', 'guanabara', 'feira', 'merenda', 'lanche', 'lanchinho', 'almoço', 'almoco', 'janta', 'jantar', 'café', 'cafe', 'cafeteria', 'cafe da manha', 'café da manhã', 'starbucks', 'marmita', 'quentinha', 'comida', 'delivery', 'churrasco', 'espetinho', 'salgado', 'doceria', 'confeitaria', 'buffet', 'self service', 'a quilo', 'petisco', 'petiscos', 'rango', 'sushi', 'japones', 'japonês', 'agua de coco', 'água de coco'],
  'Transporte': ['transporte', 'uber', '99', '99pop', 'indriver', 'cabify', 'moto taxi', 'mototaxi', 'taxi', 'táxi', 'posto', 'combustível', 'combustivel', 'estacionamento', 'zona azul', 'pedágio', 'pedagio', 'gasolina', 'etanol', 'alcool', 'álcool', 'diesel', 'ipiranga', 'shell', 'petrobras', 'br mania', 'onibus', 'ônibus', 'passagem de onibus', 'metro', 'metrô', 'passagem', 'passagem aerea', 'passagem aérea', 'aviao', 'avião', 'voo', 'latam', 'gol linhas aereas', 'azul linhas aereas', 'bilhete unico', 'bilhete único', 'mecanico', 'mecânico', 'oficina', 'pneu', 'lavagem', 'lava jato', 'ipva', 'licenciamento', 'multa', 'detran', 'seguro do carro', 'seguro veicular', 'revisao', 'revisão', 'troca de oleo', 'troca de óleo', 'bike', 'patinete'],
  'Moradia': ['moradia', 'aluguel', 'condominio', 'condomínio', 'energia', 'enel', 'cemig', 'light', 'coelba', 'celpe', 'equatorial', 'luz', 'conta de luz', 'agua', 'água', 'agua e esgoto', 'sabesp', 'cagece', 'embasa', 'saneamento', 'esgoto', 'internet', 'fibra', 'wifi', 'vivo', 'claro', 'tim', 'oi', 'net', 'telefone', 'celular', 'gas', 'gás', 'gas de cozinha', 'gás de cozinha', 'botijao', 'botijão', 'iptu', 'faxina', 'diarista', 'reforma', 'material de construcao', 'material de construção', 'material de limpeza', 'produtos de limpeza', 'movel', 'móvel', 'moveis', 'móveis', 'eletrodomestico', 'eletrodoméstico', 'seguro residencial', 'financiamento imobiliario', 'financiamento imobiliário', 'prestacao da casa', 'prestação da casa', 'tv a cabo', 'sky', 'directv'],
  'Lazer': ['lazer', 'cinema', 'cinemark', 'ingresso', 'show', 'festa', 'bar', 'boteco', 'cerveja', 'balada', 'role', 'rolê', 'happy hour', 'viagem', 'passeio', 'hotel', 'pousada', 'airbnb', 'teatro', 'parque', 'parque de diversao', 'parque de diversão', 'shopping', 'jogo', 'game', 'steam', 'playstation', 'xbox', 'nintendo', 'livro', 'livraria', 'presente', 'praia', 'clube', 'futebol', 'estadio', 'estádio', 'aposta', 'apostas', 'bet', 'betano', 'sportingbet'],
  'Saúde': ['saude', 'saúde', 'farmacia', 'farmácia', 'drogaria', 'drogasil', 'droga raia', 'raia', 'pacheco', 'pague menos', 'remedio', 'remédio', 'clinica', 'clínica', 'consulta', 'consulta medica', 'consulta médica', 'exame', 'exame de sangue', 'medico', 'médico', 'dentista', 'implante dentario', 'implante dentário', 'psicologo', 'psicólogo', 'terapia', 'fisioterapia', 'fisio', 'nutricionista', 'oftalmologista', 'dermatologista', 'ortopedista', 'ginecologista', 'pediatra', 'cardiologista', 'academia', 'smart fit', 'smartfit', 'gympass', 'laboratorio', 'laboratório', 'hospital', 'plano de saude', 'plano de saúde', 'plano odontologico', 'plano odontológico', 'convenio', 'convênio', 'unimed', 'hapvida', 'amil', 'vacina', 'oculos', 'óculos', 'suplemento', 'whey', 'vitamina'],
  'Assinaturas': ['assinaturas', 'netflix', 'spotify', 'deezer', 'apple music', 'tidal', 'amazon prime', 'prime video', 'hbo', 'hbo max', 'globoplay', 'paramount', 'disney', 'disney+', 'star+', 'star plus', 'crunchyroll', 'youtube premium', 'telecine', 'looke', 'mubi', 'assinatura', 'mensalidade', 'icloud', 'google one', 'dropbox', 'kindle unlimited', 'audible', 'twitch', 'discord nitro', 'linkedin premium', 'xbox game pass', 'game pass', 'playstation plus', 'ps plus', 'notion', 'figma', 'github copilot', 'copilot', 'perplexity', 'openai', 'chatgpt', 'claude', 'canva', 'adobe', 'office 365', 'microsoft 365'],
  'Investimentos': ['investimentos', 'investimento', 'investi', 'aporte', 'tesouro direto', 'tesouro selic', 'renda fixa', 'renda variavel', 'renda variável', 'cdb', 'lci', 'lca', 'debenture', 'debênture', 'acoes', 'ações', 'fii', 'fundo imobiliario', 'fundo imobiliário', 'day trade', 'swing trade', 'ibovespa', 'b3', 'bitcoin', 'ethereum', 'cripto', 'criptomoeda', 'binance', 'nubank rendimento', 'poupanca', 'poupança', 'previdencia', 'previdência', 'corretora', 'clear', 'rico', 'toro investimentos', 'warren', 'xp investimentos'],
  'Salário': ['salario', 'salário', 'folha', 'pagamento de salario', 'pro-labore', 'holerite', 'contracheque', 'décimo terceiro', 'decimo terceiro', 'férias', 'ferias', 'freela', 'freelance', 'bico', 'comissao', 'comissão', 'bonificacao', 'bonificação', 'bonus', 'bônus', 'rendimento', 'dividendo', 'dividendos', 'auxilio', 'auxílio', 'beneficio', 'benefício', 'inss', 'aposentadoria', 'pensao', 'pensão', 'restituicao de imposto', 'restituição de imposto', 'fgts'],
  'Outros': ['shein', 'renner', 'c&a', 'cea', 'zara', 'riachuelo', 'marisa', 'hering', 'centauro', 'netshoes', 'nike', 'adidas', 'roupa', 'roupas', 'calca', 'calça', 'camisa', 'camiseta', 'vestido', 'sapato', 'tenis', 'tênis', 'bolsa', 'mochila', 'shopee', 'aliexpress', 'mercado livre', 'americanas', 'magazine luiza', 'magalu', 'casas bahia', 'ponto frio', 'submarino', 'compras online', 'papelaria', 'pet shop', 'petshop', 'veterinario', 'veterinário', 'racao', 'ração', 'salao de beleza', 'salão de beleza', 'cabeleireiro', 'manicure', 'barbearia', 'estetica', 'estética'],
};

/* Normaliza para comparar: minúsculas, pontuação vira espaço, e o texto fica
   cercado por espaços. A comparação passa a ser por palavra inteira em vez de
   `includes` cru — antes a keyword 'max' (de HBO Max) casava dentro de
   "máxima", 'oi' dentro de "coisa" e '99' dentro de "1990", jogando o
   lançamento na categoria errada. Espaço nas pontas faz a keyword de uma
   palavra só casar no começo e no fim da frase. */
function normalizarParaBusca(texto: string): string {
  return ' ' + texto.toLowerCase().replace(/[^0-9a-zà-ÿ]+/gi, ' ').trim() + ' ';
}

function contemPalavra(textoNormalizado: string, keyword: string): boolean {
  return textoNormalizado.includes(normalizarParaBusca(keyword));
}

/* Diferente do guessCategoryFromText do app, que cai em "Outros": aqui um
   não-reconhecimento devolve null de propósito, para o webhook PERGUNTAR a
   categoria em vez de arquivar em "Outros" sem avisar.

   `extras` são as categorias que o PRÓPRIO usuário criou no gerenciador do
   app (tabela `categories`, `is_default = false`) — sem isso, o bot só
   conhecia as 9 categorias fixas de sempre, e uma categoria nova cadastrada
   no app (ex: "Pet", "Filhos") nunca era reconhecida por voz/texto no
   WhatsApp, mesmo a pessoa dizendo o nome dela exatamente. As 9 fixas
   continuam checadas PRIMEIRO — têm listas de palavra-chave ricas (uma
   categoria custom só tem o próprio nome pra casar), e renomear uma
   categoria padrão no app não muda esse vocabulário de propósito (ver
   comentário em supabase/schema.sql sobre `categories`).

   `extras` SEM anotação de tipo de propósito, nem `as` de cast (seria
   `: { name: string; color: string }[]`): __tests__/extrair.ts lê esta
   função direto do arquivo pra testar contra o código real (ver
   __tests__/corpus-whatsapp-gerado.ts), e a limpeza de tipo ali só sabe
   remover `string`/`number`/`boolean` de PARÂMETRO — QUALQUER outra sintaxe
   de TypeScript sobrando (tipo objeto literal, `as`) quebra o `new
   Function` com `SyntaxError`, porque o resultado precisa ser JS puro
   (mesmo problema que já existe pra CATEGORIES, documentado em
   corpus-whatsapp-gerado.ts:32-37). O tipo de retorno continua anotado
   normalmente: esse SIM o extrator sabe limpar (regex própria pra objeto
   literal depois de `):`). */
function matchCategoryByKeyword(text: string, extras = []): { name: string; color: string } | null {
  const alvo = normalizarParaBusca(text);
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => contemPalavra(alvo, kw))) {
      return CATEGORIES.find((c) => c.name === catName) ?? null;
    }
  }
  for (const extra of extras) {
    if (contemPalavra(alvo, extra.name)) return extra;
  }
  return null;
}

/** Casa a resposta de uma pergunta de esclarecimento: nome exato da categoria, ou uma palavra-chave conhecida.
    `extras` sem anotação de tipo — mesma razão de matchCategoryByKeyword logo acima. */
function matchCategoryByReply(text: string, extras = []): { name: string; color: string } | null {
  const lower = text.trim().toLowerCase();
  const exact = CATEGORIES.find((c) => c.name.toLowerCase() === lower) ?? extras.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact;
  return matchCategoryByKeyword(text, extras);
}

/* Marcadores de saída, conferidos ANTES dos de entrada. A ordem importa:
   "paguei o salário do estagiário" tem 'salário' (entrada) e 'paguei'
   (saída) na mesma frase, e o verbo que a pessoa escolheu diz mais sobre a
   direção do dinheiro do que o substantivo. */
const MARCADORES_SAIDA = [
  'gastei', 'gastando', 'gasta', 'gasto', 'paguei', 'pagamento de', 'pagando',
  'comprei', 'compra', 'comprando', 'torrei', 'queimei', 'desembolsei', 'desembolso',
  'debitado', 'débito', 'debito', 'debitaram', 'saiu', 'saída', 'saida', 'saiu da conta',
  'enviei', 'enviado', 'transferi', 'pix enviado', 'fiz um pix', 'dei um pix',
  'mandei', 'assinei', 'investi', 'apliquei', 'financiei', 'financiamento',
  'parcelei', 'quitei', 'quitação', 'boleto pago', 'paguei boleto', 'cobraram',
  'cobrança', 'cobranca', 'rachei a conta', 'dividi a conta',
];

const MARCADORES_ENTRADA = [
  'recebi', 'recebeu', 'recebido', 'recebida', 'você recebeu', 'voce recebeu',
  'entrou', 'entrada', 'caiu', 'caiu na conta', 'pingou', 'creditado', 'crédito de', 'credito de',
  'depósito', 'deposito', 'depositado', 'depositaram', 'transferência recebida', 'transferencia recebida',
  'pix recebido', 'estorno', 'reembolso', 'reembolsaram', 'devolução', 'devolucao',
  'devolveram', 'me devolveram', 'me pagaram', 'cashback', 'ganhei', 'ganhei na loteria',
  'prêmio', 'premio', 'vendi', 'venda', 'salário', 'salario', 'freela', 'comissão', 'comissao',
  'bonificação', 'bonificacao', 'bônus', 'bonus', 'rendimento', 'dividendo', 'restituição',
  'restituicao', 'resgatei',
];

function guessTypeFromText(text: string): 'in' | 'out' {
  const alvo = normalizarParaBusca(text);
  if (MARCADORES_SAIDA.some((h) => contemPalavra(alvo, h))) return 'out';
  if (MARCADORES_ENTRADA.some((h) => contemPalavra(alvo, h))) return 'in';
  return 'out';
}

function guessAmountFromText(text: string): number {
  const normalizado = normalizarTextoTranscrito(text);

  // "R$ 1.250,90" — quando o cifrão está lá, é o sinal mais confiável.
  /* Os grupos de captura terminam em `\d` de propósito (`[\d.,]*\d`, não
     `[\d.,]+`). Com `+` a captura era gulosa e engolia a vírgula da FRASE
     que vinha logo depois do valor: em "mercado R$ 5,50, alimentação" ela
     capturava "5,50," e o parseAmount lia a ÚLTIMA vírgula como separador
     decimal — R$ 5,50 virava R$ 550,00, cem vezes o valor certo. */
  const comCifrao = normalizado.match(/r\$\s*([\d.,]*\d)/i);
  if (comCifrao) return parseAmount(comCifrao[1]);

  // "350 reais", "120 conto", "50 pila" — em fala e em mensagem informal o
  // cifrão quase nunca aparece; a moeda vem por extenso depois do número.
  const comMoeda = normalizado.match(new RegExp(`([\\d.,]*\\d)\\s*(?:${MOEDA})\\b`, 'i'));
  if (comMoeda) return parseAmount(comMoeda[1]);

  // "150,00" / "1.250,50" — número com centavos explícitos.
  const comCentavos = normalizado.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (comCentavos) return parseAmount(comCentavos[1]);

  // "mercado 50" / "50 no mercado" — último recurso: qualquer número solto.
  // Fica por último de propósito, para não roubar a vez de "99" em "99 Pop"
  // ou de um número que faça parte do nome do estabelecimento.
  /* O fim do número é reconhecido por lookahead, e pontuação também fecha.
     Antes exigia espaço ou fim de frase (`(?:\s|$)`), então um número colado
     numa vírgula não era valor nenhum: "mercado 30, alimentação" — que é
     exatamente o formato que o app ensina no lançamento por voz — devolvia
     R$ 0 e o lançamento morria pedindo o valor de novo. Continua sendo
     lookahead (não consumo) pra não atrapalhar outra regra que venha depois.
     O grupo termina em `\d` pela mesma razão das capturas acima. */
  const solto = normalizado.match(/(?:^|\s)(\d[\d.]*\d|\d)(?=[\s,;:!?]|$)/);
  if (solto) return parseAmount(solto[1]);

  return 0;
}

/* Verbos e locuções que abrem a frase sem descrever nada ("gastei 50 no bar",
   "caiu 1500 do cliente"). Só valem no início — "vendi" no meio de uma frase
   pode ser parte do nome. */
/* Duas famílias aqui:
   1. Verbos que descrevem o gasto sem nomeá-lo ("gastei 50 no bar").
   2. Aberturas IMPERATIVAS, que é como se dita pro app em voz alta
      ("anota aí, mercado 30", "registra 50 de gasolina"). Sem elas o
      lançamento saía chamado "Anota aí mercado" — apareceu em 50 mil casos
      do corpus gerado, um quinto de tudo que foi testado.

   As ambíguas exigem o "aí" pra serem removidas: "bota" e "marca" também são
   substantivos ("bota 200 reais" pode ser o calçado que custou 200), então
   só somem quando vêm no formato inequívoco de comando.

   Termina em `(?![a-zà-ÿ0-9])` e não em `\b`: no JavaScript o `\b` só enxerga
   [A-Za-z0-9_] como letra, então depois do "í" de "aí" ele não fecha
   fronteira nenhuma. Com `\b` a regra casava só "anota", sobrava " aí", o
   CONECTOR_INICIAL comia o "a" solto, e a descrição saía "Í mercado". */
const VERBOS_INICIAIS =
  /^(?:me\s+pagaram|gastei|gasto|paguei|pagamento|comprei|compra|torrei|coloquei|investi|apliquei|recebi|recebido|ganhei|entrou|caiu|vendi|transferi|mandei|enviei|assinei|custou|saiu|foi|foram|(?:anota|anote|registra|registre|lan[çc]a|lance|adiciona|adicione)(?:\s+a[íi])?|(?:bota|bote|coloca|marca|marque|p[oõ]e)\s+a[íi])(?![a-zà-ÿ0-9])[\s,]*/i;
/* Conectores que sobram grudados nas pontas depois que o valor sai. */
const CONECTOR = '(?:de|do|da|dos|das|no|na|nos|nas|em|com|para|pra|pro|por|a|o|um|uma)';
/* `(?![a-zà-ÿ0-9])` e não `\b`, pela terceira vez neste arquivo: no JavaScript
   o `\b` só enxerga [A-Za-z0-9_] como letra, então entre o "a" e o "ç" de
   "açougue" ele acha uma fronteira que não existe. O conector "a" casava, era
   removido, e "gastei 7 reais no açougue" virava um lançamento chamado
   "Çougue". Vale pra toda descrição que comece com vogal seguida de letra
   acentuada — açaí, ação, aí, ávido. */
const CONECTOR_INICIAL = new RegExp(`^${CONECTOR}(?![a-zà-ÿ0-9])\\s*`, 'i');
const CONECTOR_FINAL = new RegExp(`\\s+${CONECTOR}$`, 'i');

/* ── Muletas de fala ───────────────────────────────────────────────────────
 *
 * Transcrição de áudio não vem limpa: o Whisper escreve o "é...", o "então" e
 * o "né" junto com o lançamento. Nenhum deles descreve nada, e sem tirá-los o
 * gasto era salvo com nome de conversa — "Ah mercado né", "Peraí mercado
 * valeu". Num corpus de 16 mil frases faladas, era a causa de todas as falhas
 * de descrição fora as duas acima.
 *
 * Só valem nas PONTAS. No meio da frase uma dessas palavras pode ser parte do
 * nome, e a lista foi podada com o mesmo critério: "bom" ficou de fora por
 * causa de "Bom Prato", "pera" por causa da fruta (só "peraí" entra), "beleza"
 * só é muleta no fim.
 *
 * O vocativo ("mano", "véi", "cara") exige vírgula pra sumir. Sem essa
 * exigência, "Mano do Açaí" — franquia de verdade — virava um lançamento
 * chamado "Açaí". Mesmo critério que VERBOS_INICIAIS já usa pra "bota aí":
 * a palavra ambígua só é comando quando vem na forma inequívoca.
 */
const MULETA_INICIAL =
  /^(?:(?:[ée]|eh|ahn?|hum|hmm|ó|opa|olha(?:\s+s[óo])?|ent[aã]o|tipo(?:\s+assim)?|assim|enfim|deixa\s+eu\s+ver|pera[íi]|pera\s+a[íi])(?![a-zà-ÿ0-9'-])[\s,.:;]*|(?:mano|v[ée]i|cara)\s*[,.:;]\s*)/i;
const MULETA_FINAL =
  /[\s,.:;-]+(?:n[ée]|t[áa](?:\s+(?:ok|certo))?|ok(?:ay)?|beleza|blz|valeu|vlw|pronto|viu|certo|s[óo]\s+isso|[ée]\s+isso|obrigad[oa]|por\s+favor|pfv|a[íi]|ent[aã]o)(?![a-zà-ÿ0-9])$/i;
/* Restos de valor colados nas pontas: "luz 210" -> "luz", "350 reais x" -> "x".
   VALOR_FINAL tem um `(?<![a-zà-ÿ])` antes do dígito que VALOR_INICIAL não
   precisa: âncorado em `^`, nunca há uma letra antes pra checar. Sem esse
   lookbehind, "...da C6," virava "...da C" — `[\d.,]` inclui vírgula (pensada
   pra grupo de milhar tipo "1.234,56"), então o "6," no fim de "C6," casava
   como se fosse um valor solto, mesmo colado numa letra que não tem nada a
   ver com dinheiro (mesma causa-raiz do bug já corrigido na regra 3 de
   guessDescFromText, só que nesta função, chamada por TODAS as regras). */
const VALOR_INICIAL = new RegExp(`^(?:r\\$\\s*)?\\d[\\d.,]*\\s*(?:${MOEDA})?\\b\\s*`, 'i');
const VALOR_FINAL = new RegExp(`\\s*(?:r\\$\\s*)?(?<![a-zà-ÿ\\d])\\d[\\d.,]*\\s*(?:${MOEDA})?$`, 'i');
/* Forma de pagamento mencionada solta no fim da frase — "Mercado 50 no pix",
   "Farmácia 30 no débito" — não é parte do nome do lançamento. */
/* A preposição é OPCIONAL, e essa foi a maior fonte de nome sujo do corpus
   gerado: "Academia 39,90 pix", "Cinema 89,90 débito", "Mercado 120 crédito"
   — a forma mais curta, que é justamente a que se digita com pressa e a que
   sai de transcrição de áudio — não casava com nada e ia inteira pro nome do
   lançamento ("Academia pix"). Junto entram o "é" ("Chaveiro 120 é boleto") e
   "conta a pagar", pelo mesmo motivo: já viraram `payment_method` ou uma
   linha em `bills`, então repetir no nome é ruído. */
const FORMA_PAGAMENTO_FINAL =
  /\s+(?:[ée]\s+)?(?:(?:no|na|via|em|de|pago\s+(?:no|na|em|com))\s+)?(?:pix|dinheiro|esp[ée]cie|cart[aã]o|d[ée]bito|cr[ée]dito|boletos?|conta\s+a\s+pagar)(?:\s+d[aeo]\s+\S+)?$/i;

/* "Parcelado em 3x", "em 12 parcelas" — o número de parcelas já foi extraído
   pra `installments`, e a série de linhas criada a partir dele. Sem tirar
   daqui, cada uma das três parcelas nascia chamada "Mercado parcelado em 3x". */
const PARCELAMENTO_FINAL =
  /\s+(?:parcel(?:ei|ado|ada|ar|a)(?:\s+em)?\s+\d{1,2}(?:\s*x)?|(?:em\s+)?\d{1,2}\s*(?:x|vezes|parcelas?))\s*$/i;

/* "Vence dia 10", "vencimento 25/12" — a data já foi extraída pra `due_date`
   pelo parseDiaVencimento logo abaixo. Sem tirar daqui, a conta a pagar
   nascia chamada "Conta de luz boleto que vence dia". */
const VENCIMENTO_FINAL =
  /\s+(?:(?:que|e)\s+)?(?:vencimento|vencendo|vence|venc\.?)\s*(?:em|no|na|dia|pro\s+dia)?\s*(?:\d{1,2}(?:[\/-]\d{1,2}(?:[\/-]\d{2,4})?)?)?\s*$/i;

/* "Todo mês" diz COMO o lançamento se repete, não o que ele é — sem tirar
   daqui, a série virava um gasto chamado "Aluguel todo mês", e o nome errado
   se repetia em cada ocorrência gerada. Vale em qualquer posição da frase:
   tanto "aluguel 1500 todo mês" quanto "todo mês pago aluguel 1500". */
const MARCA_RECORRENCIA =
  /(?:^|\s)(?:[ée]\s+)?(?:tod[oa]s?\s+(?:o\s+|os\s+)?m[êe]s(?:es)?|cada\s+m[êe]s|mensalmente|recorrente|(?:que\s+)?se\s+repete|que\s+repete(?:\s+tod[oa]\s+m[êe]s)?)(?![a-zà-ÿ0-9])/gi;

/**
 * Tira o que JÁ FOI EXTRAÍDO para outro campo: recorrência, forma de
 * pagamento e vencimento.
 *
 * Existe separada de `limparSobra` porque precisa rodar ANTES das três regras
 * de nome, e não só depois. A regra 2 ("<algo> de <Nome>") casa com o
 * primeiro "de" da frase — e em "gastei estacionamento 120 no cartão de
 * débito" esse "de" é o de "cartão de débito". A regra sequestrava o nome
 * inteiro e devolvia "Débito"; o nome real do gasto simplesmente sumia.
 * Limpando a cauda antes, não sobra "de" nenhum para ela morder.
 */
function limparCaudaDeMetadado(bruto: string): string {
  let s = bruto.trim();
  let anterior = '';
  while (s !== anterior) {
    anterior = s;
    s = s
      .replace(MARCA_RECORRENCIA, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(PARCELAMENTO_FINAL, '')
      .replace(VENCIMENTO_FINAL, '')
      .replace(FORMA_PAGAMENTO_FINAL, '')
      .trim();
  }
  return s;
}

function limparSobra(bruto: string): string {
  let s = bruto.replace(/\s+/g, ' ').trim();
  let anterior = '';
  while (s !== anterior) {
    anterior = s;
    s = limparCaudaDeMetadado(s)
      .replace(MULETA_INICIAL, '')
      .replace(MULETA_FINAL, '')
      .replace(VERBOS_INICIAIS, '')
      .replace(VALOR_INICIAL, '')
      .replace(VALOR_FINAL, '')
      .replace(CONECTOR_INICIAL, '')
      .replace(CONECTOR_FINAL, '')
      .trim();
  }
  return s.replace(/^[-–—.,;:]+|[-–—.,;:]+$/g, '').trim();
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Nome do lançamento a partir de texto livre (comprovante colado, transcrição
 * de áudio, notificação de banco).
 *
 * A versão anterior procurava um nome logo depois de "de"/"para" e aceitava o
 * primeiro que aparecesse. Em "energia de 350 reais" o "de" que casava era o
 * do VALOR, então a descrição virava "350 reais." e o nome real ("energia")
 * se perdia — relatado pelo autor num áudio de WhatsApp. Duas mudanças
 * consertam isso: o padrão de "de/para" agora recusa um número logo em
 * seguida, e existe um segundo caminho que simplesmente remove a expressão de
 * valor e usa o que sobra, o que também cobre frases sem "de" nenhum
 * ("paguei 47,90 na farmácia", "mercado").
 */
/* Expressão de valor: "R$ 350", "350 reais", "350,00", "350". Usada tanto
   para reconhecer o padrão "<Nome> de <Valor>" quanto para apagar o valor do
   texto e ficar só com o nome. */
const EXPRESSAO_VALOR = new RegExp(`(?:r\\$\\s*)?\\d[\\d.,]*\\s*(?:${MOEDA})?`, 'i');

function guessDescFromText(text: string, type: 'in' | 'out'): string {
  /* Pontuação de frase solta no fim ("Almoço de 20 reais.") vem principalmente
     de transcrição de áudio, que costuma fechar a frase com ponto final —
     sem tirar isso aqui, a regra 1 abaixo nunca casava (o `$` dela não aceita
     nada depois do valor além de uma categoria com vírgula), a descrição caía
     na regra 3 e saía "Almoço de" em vez de só "Almoço". */
  /* Dica de categoria colada com vírgula no fim ("Chip de 22 reais,
     assinaturas", "Monster no posto, alimentação") — formato que o próprio
     app ensina (ver o placeholder do lançamento por voz). Só a regra 1
     sabia descartar isso, e só quando o valor vem logo antes da vírgula com
     "de"/"por" no meio; em qualquer outra forma ("Monster no posto,
     categoria alimentação 10,79", sem conector) a frase caía nas regras 2/3,
     que não tinham essa limpeza — a vírgula e "categoria alimentação"
     ficavam colados na descrição. Tirar isso ANTES das três regras corrige
     os três caminhos de uma vez, não só o primeiro. */
  const NOMES_CATEGORIA = Object.keys(CATEGORY_KEYWORDS)
    .map((nome) => nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  /* Duas formas: ", <categoria>" (vírgula, texto escrito/colado — "categoria"
     opcional) ou "categoria <categoria>" sem vírgula nenhuma (áudio
     transcrito raramente inclui pontuação; "categoria" aqui É a âncora,
     não dá pra soltar também, senão qualquer frase que termine com o nome
     de uma categoria — "Presente para os outros" — perderia palavras à
     toa). Achado num lançamento real por WhatsApp: "Monster no categoria
     alimentação" (sem vírgula) ainda deixava "categoria alimentação" preso
     na descrição, porque a versão anterior só cobria o caso com vírgula. */
  const DICA_CATEGORIA_FINAL = new RegExp(
    `(?:,\\s*(?:categoria\\s+)?|\\bcategoria\\s+)(?:${NOMES_CATEGORIA})\\s*$`,
    'i'
  );

  const texto = limparCaudaDeMetadado(
    normalizarTextoTranscrito(text).replace(/[.!?]+\s*$/, '').replace(DICA_CATEGORIA_FINAL, '')
  );

  /* 1º) "<Nome> de <Valor>" — "Energia de 350 reais", "Merenda de 31 reais",
     "Mercado de 120 reais". Vem primeiro porque é o formato mais comum e o
     mais inequívoco: o que está antes do "de" é sempre o nome. Antes esta
     regra vinha DEPOIS da regra do "de <nome>", e o "de" do valor casava
     primeiro — a descrição virava "350 reais" e o nome real se perdia. */
  /* `(?:\s*,.*)?$` em vez de só `\s*$`: "Chip de 22 reais, outros" tem uma
     categoria colada depois da vírgula (formato que o próprio app ensina —
     ver o placeholder do lançamento por voz). Sem essa folga, o valor não
     ficava no fim exato da frase, a regra 1 nunca casava, e a descrição
     caía na regra 3 (sobra do texto), que deixava "de" e a vírgula soltos
     no meio do nome ("Chip de , outros" em vez de "Chip"). */
  const nomeAntes = texto.match(new RegExp(`^\\s*(.{2,40}?)\\s+(?:de|por)\\s+${EXPRESSAO_VALOR.source}(?:\\s*,.*)?\\s*$`, 'i'));
  if (nomeAntes) {
    const nome = limparSobra(nomeAntes[1]);
    if (nome.length >= 2) return capitalizar(nome);
  }

  /* 2º) "<algo> de/para <Nome>" — "Pizza para Maria", "transferiu para
     Restaurante Sabor da Terra", "2000 reais de salário". O `(?!\d)` recusa
     números logo depois do conector, para nunca capturar o próprio valor. */
  const nomeDepois = texto.match(/\b(?:de|para)\b\s+((?!\d)[A-ZÀ-Úa-zà-ú0-9 .]{3,40})/i);
  if (nomeDepois) {
    const nome = limparSobra(nomeDepois[1].replace(/\s+em\s+.*$/i, ''));
    if (nome.length >= 2) return capitalizar(nome);
  }

  /* 3º) Sobra do texto sem o valor e sem o verbo — cobre as formas que não
     têm conector nenhum: "paguei 47,90 na farmácia", "50 no mercado",
     "mercado 120", "uber 25", ou só "mercado". */
  /* A última limpeza era um `\d[\d.,]*` cego — apagava QUALQUER dígito
     restante, inclusive um colado numa letra que não tem nada a ver com
     valor: "no crédito da C6" virava "no crédito da C" (o "6" some), porque
     pra essa regex "C6" é só um "6" com uma letra do lado. O lookbehind/
     lookahead de letra faz ela só apagar números que estão SOZINHOS
     (separados por espaço/pontuação dos dois lados) — que é o caso real de
     "mercado 50" → "mercado" — e deixa "C6", "99" (de "99 Pop", já tratado
     em CATEGORY_KEYWORDS) e afins intactos.

     Os `\d` dentro do lookbehind/lookahead não são decoração: sem eles a
     regex ainda comia dígito colado em letra, por backtracking. Em "99pop",
     `\d[\d.,]*` é guloso e pega "99"; o lookahead vê o "p" e reprova; aí o
     motor RECUA pra só "9", cujo próximo caractere é "9" — não é letra, então
     passa, e a descrição saía "9pop". Exigindo que não haja dígito de nenhum
     dos lados, o recuo também é reprovado e "99pop" fica inteiro. */
  const semValor = texto
    .replace(/r\$\s*[\d.,]+/gi, ' ')
    .replace(new RegExp(`[\\d.,]+\\s*(?:${MOEDA})\\b`, 'gi'), ' ')
    .replace(/(?<![a-zà-ÿ\d])\d[\d.,]*(?![a-zà-ÿ\d])/gi, ' ');
  const sobra = limparSobra(semValor);
  if (sobra.length >= 2) return capitalizar(sobra.slice(0, 40));

  return type === 'in' ? 'Pix recebido' : 'Pagamento';
}

/**
 * Tira da descrição o nome do cartão e a menção solta a "crédito"/"débito" —
 * essa informação já foi extraída pra `card_id`/`payment_method` em
 * registrarLancamento(), então repeti-la no nome do lançamento é ruído (e foi
 * exatamente o bug relatado: "Almoço pago no crédito da C6" ficava com "da
 * C6" grudado na descrição). Roda DEPOIS de guessDescFromText, só quando um
 * cartão foi de fato identificado — reaproveita limparSobra() pra tirar o
 * conector que sobra pendurado ("da", "no") depois que o nome do cartão sai.
 */
function limparReferenciaCartao(descricao: string, nomeCartao: string): string {
  const escapado = nomeCartao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const semReferencia = descricao
    .replace(new RegExp(`\\b${escapado}\\b`, 'i'), ' ')
    .replace(/\bcr[eé]dito\b/i, ' ')
    .replace(/\bd[eé]bito\b/i, ' ');
  const limpo = limparSobra(semReferencia);
  return limpo.length >= 2 ? capitalizar(limpo) : descricao;
}

const NOMES_CATEGORIAS = CATEGORIES.map((c) => c.name).join(', ');

/* Lista de categorias mostrada na pergunta de esclarecimento — as 9 fixas
   mais as que o usuário criou no app (`extras`, já filtradas por
   `is_default = false` em fetchCategoriasDoUsuario). Sem isso a pergunta
   listava só as 9 fixas mesmo quando a categoria certa era uma custom que a
   pessoa acabou de citar — ela nunca aparecia como opção pra responder. */
function listaCategoriasPara(extras: { name: string; color: string }[]): string {
  if (extras.length === 0) return NOMES_CATEGORIAS;
  return `${NOMES_CATEGORIAS}, ${extras.map((c) => c.name).join(', ')}`;
}

/* Cópia sincronizada de parseAmount em lib/format.ts — ver o comentário longo
   lá sobre por que o ponto tem dois papéis. Este é o caminho que atende o
   WhatsApp, onde o bug de "1.500" virando R$ 1,50 era visível de verdade. */
function parseAmount(raw: string): number {
  /* Pontuação de frase nas pontas não faz parte do número. Sem isso, um
     "5,50," (a vírgula que separa o valor do resto da frase entrando junto
     na captura de quem chamou) era lido com a ÚLTIMA vírgula como separador
     decimal: R$ 5,50 virava R$ 550,00. */
  const bruto = (raw || '').trim().replace(/^[^\d\-]+|[^\d]+$/g, '');
  if (!bruto) return 0;

  const soDigitos = (s: string) => s.replace(/[^0-9]/g, '');
  const sinal = bruto.includes('-') ? -1 : 1;

  const ultimaVirgula = bruto.lastIndexOf(',');
  const ultimoPonto = bruto.lastIndexOf('.');

  let posDecimal: number;

  if (ultimaVirgula !== -1) {
    posDecimal = ultimaVirgula;
  } else if (ultimoPonto !== -1) {
    const depois = soDigitos(bruto.slice(ultimoPonto + 1));
    const antes = soDigitos(bruto.slice(0, ultimoPonto));
    if (depois.length === 3 && antes !== '' && antes !== '0') {
      return sinal * (parseFloat(antes + depois) || 0);
    }
    posDecimal = ultimoPonto;
  } else {
    return sinal * (parseFloat(soDigitos(bruto)) || 0);
  }

  const inteiro = soDigitos(bruto.slice(0, posDecimal));
  const decimal = soDigitos(bruto.slice(posDecimal + 1));
  return sinal * (parseFloat(`${inteiro || '0'}.${decimal || '0'}`) || 0);
}

/** Casa por palavra-chave, sem cair pra "Outros" — quem chama decide o que fazer com a incerteza. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---- assinatura da Meta (X-Hub-Signature-256) ---- */

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** true = pode processar. Sem WHATSAPP_APP_SECRET configurado, deixa passar (com aviso) em vez de derrubar o webhook. */
async function assinaturaValida(rawBody: string, header: string | null): Promise<boolean> {
  if (!WHATSAPP_APP_SECRET) {
    // Falha FECHADA. Antes esta função devolvia true com um aviso no log
    // quando o secret não estava configurado, para não derrubar o webhook
    // durante a configuração inicial. O efeito colateral é que um secret
    // apagado por engano transformava silenciosamente o endpoint em aberto:
    // qualquer um que descobrisse a URL poderia forjar lançamentos em nome
    // de um número já vinculado. Recusar tudo é o mesmo comportamento da
    // função eas-build-webhook, e a configuração inicial já está feita.
    console.error('[whatsapp-webhook] WHATSAPP_APP_SECRET não configurado — recusando tudo.');
    return false;
  }
  if (!header || !header.startsWith('sha256=')) return false;
  const esperado = `sha256=${await hmacSha256Hex(WHATSAPP_APP_SECRET, rawBody)}`;
  return timingSafeEqual(header, esperado);
}

/* ---- WhatsApp Cloud API ---- */

/* A resposta da Meta nunca era conferida — `await fetch(...)` sozinho só
   verifica se a REQUISIÇÃO saiu, não se a Meta aceitou o envio. Um token de
   acesso vencido, número não autorizado ou payload rejeitado voltava um
   corpo de erro no JSON com HTTP 200/4xx que o código simplesmente
   ignorava: o lançamento era salvo no banco, mas a pessoa nunca recebia a
   confirmação nem um aviso de erro — parecia que o bot não respondia mais
   nada, sem nenhum rastro no log pra investigar. Agora loga status e corpo
   da resposta sempre que a Meta recusar. */
async function sendWhatsappMessage(to: string, body: string): Promise<void> {
  const res = await fetchComTimeout(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  if (!res.ok) {
    console.error('[sendWhatsappMessage] Meta recusou o envio', { status: res.status });
    throw Object.assign(new Error('Falha ao enviar confirmação pela Meta'), { code: 'meta_send_failed' });
  }
}

/** Baixa o .ogg/Opus da Meta. Devolve null se a mídia expirou ou o token não autoriza. */
async function baixarAudioDaMeta(mediaId: string): Promise<ArrayBuffer | null> {
  const metaRes = await fetchComTimeout(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!metaRes.ok) {
    console.error('[transcribeAudio] Meta recusou a consulta da mídia:', metaRes.status);
    return null;
  }
  const { url } = await metaRes.json();
  if (!url) return null;

  const mediaRes = await fetchComTimeout(url, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
  if (!mediaRes.ok) {
    console.error('[transcribeAudio] falha ao baixar bytes do áudio:', mediaRes.status);
    return null;
  }
  return await mediaRes.arrayBuffer();
}

/**
 * Transcreve um áudio recebido por WhatsApp. Tenta cada provedor configurado
 * na ordem e devolve a primeira transcrição não vazia, já normalizada (ver
 * normalizarTextoTranscrito). Devolve null quando nenhum provedor está
 * configurado, todos falharam, ou o áudio saiu inaudível — quem chama decide
 * a mensagem de fallback.
 */
async function transcribeAudio(mediaId: string): Promise<string | null> {
  try {
    const audioBytes = await baixarAudioDaMeta(mediaId);
    if (!audioBytes) return null;

    const resultado = await transcrever(audioBytes, {
      mimeType: 'audio/ogg',
      nomeArquivo: 'audio.ogg',
      provedores: provedoresPadrao(GROQ_API_KEY, OPENAI_API_KEY),
      fetchComTimeout,
    });
    if (!resultado) {
      if (!GROQ_API_KEY && !OPENAI_API_KEY) {
        console.warn('[transcribeAudio] nenhuma chave de transcrição configurada (GROQ_API_KEY / OPENAI_API_KEY).');
      }
      return null;
    }
    return resultado.texto;
  } catch (err) {
    console.error('[transcribeAudio] erro:', err);
    return null;
  }
}

/* ---- fluxo principal ---- */

/**
 * Códigos de pareamento que a mensagem pode conter.
 *
 * Antes exigia que a mensagem INTEIRA reduzisse a seis dígitos, o que só
 * funcionava com a pessoa mandando "123456" e nada mais. Agora o app abre o
 * WhatsApp com a frase pronta ("...Meu código é 123456"), e quem escreve à mão
 * costuma acompanhar de um "oi" ou de um "aqui está" — nenhum dos dois pode
 * custar o vínculo. As duas leituras entram como candidatas:
 *
 *  - tudo que não é dígito removido, se sobrarem exatamente seis. Cobre o
 *    formato antigo e quem separa os dígitos ("12 34 56", "123-456");
 *  - qualquer sequência isolada de seis dígitos dentro da frase.
 *
 * É seguro tentar as duas: só vira vínculo se o código existir, estiver
 * pendente e dentro da validade — um número solto qualquer não casa com nada.
 */
function codigosCandidatos(text: string): string[] {
  const candidatos: string[] = [];
  const soDigitos = text.replace(/\D/g, '');
  if (soDigitos.length === 6) candidatos.push(soDigitos);
  for (const m of text.matchAll(/(?<!\d)(\d{6})(?!\d)/g)) {
    if (!candidatos.includes(m[1])) candidatos.push(m[1]);
  }
  return candidatos;
}

async function handlePairing(phone: string, text: string): Promise<boolean> {
  const candidatos = codigosCandidatos(text);
  if (candidatos.length === 0) return false;

  let status = 'invalid';
  for (const candidato of candidatos) {
    const { data, error } = await supabase.rpc('confirmar_pareamento_whatsapp', {
      p_phone: phone,
      p_code: candidato,
    });
    if (error) throw error;
    status = typeof data?.status === 'string' ? data.status : 'invalid';
    if (status !== 'invalid') break;
  }

  if (status === 'rate_limited') {
    await sendWhatsappMessage(phone, 'Muitas tentativas de código. Aguarde 15 minutos e gere um novo código no app.');
    return true;
  }
  if (status === 'phone_in_use') {
    await sendWhatsappMessage(phone, 'Este número já está vinculado a outra conta do Grana. Remova o vínculo anterior pelo app.');
    return true;
  }
  if (status !== 'confirmed') return false;

  /* Exemplos, e não uma lista de comandos: o bot entende linguagem natural, e
     falar em "comando" faz a pessoa procurar uma sintaxe que não existe —
     escreve "/gasto 20", não funciona, e desiste. Três frases soltas ensinam
     o formato sem prometer regra nenhuma. */
  await sendWhatsappMessage(
    phone,
    '✅ WhatsApp vinculado ao Grana.\n\n' +
      'Agora é só me contar seus gastos como você falaria com alguém:\n\n' +
      '• Almoço 25 reais\n' +
      '• Uber 18 no crédito da C6\n' +
      '• Mercado 230 parcelado em 3x\n\n' +
      'Pode mandar áudio também — eu escuto e lanço igual.\n\n' +
      'Errou? Responda "cancela" que eu desfaço o último.'
  );
  return true;
}

type Rascunho = {
  phone: string;
  user_id: string;
  description: string;
  amount: number;
  type: 'in' | 'out';
  occurred_on: string;
  attempts: number;
  card_id: string | null;
  payment_method: string | null;
  /* Atravessa a pergunta de categoria junto do resto do rascunho — sem isto,
     "mercado 300 em 3x" cuja categoria o bot não reconhece perderia o
     parcelamento no caminho e viraria um lançamento único de R$ 300. */
  installments: number | null;
  /* "Todo mês" também precisa atravessar a pergunta de categoria: sem isso,
     "seguro 180 todo mês" com categoria desconhecida perderia a recorrência
     e a pessoa redigitaria todo mês uma coisa que já tinha dito que repete. */
  recurring: boolean;
  /* Que pergunta está no ar. 'categoria' é a original (qual categoria usar);
     'valor' é a desambiguação de áudio logo abaixo. Sem esse campo as duas
     perguntas dividiriam a mesma linha da tabela e a resposta "1" cairia no
     lugar errado. */
  pending_kind: 'categoria' | 'valor';
  /* Só no rascunho de valor: a segunda leitura possível, e o texto original
     do áudio pra reprocessar tudo (crédito, parcelas, boleto, categoria) com
     o valor já resolvido, em vez de tentar remontar o lançamento pela metade. */
  amount_alt: number | null;
  raw_text: string | null;
};

/**
 * A ambiguidade que o parser não tem como resolver sozinho: quando alguém
 * fala "onze e setenta e nove", o Whisper às vezes transcreve "1179". Aí o
 * parser está CERTO em ler R$ 1.179 — o erro aconteceu antes dele, e nenhuma
 * regra de gramática recupera o que foi perdido na transcrição.
 *
 * A saída é o bot desconfiar e perguntar. Mas perguntar sempre torraria a
 * paciência de quem fala valor redondo, então os filtros aqui são estreitos
 * de propósito:
 *
 *  - só quando o número aparece em DÍGITOS no áudio transcrito. Se veio por
 *    extenso ("mil cento e setenta e nove"), a fala já era inequívoca e
 *    segmentarExtenso resolveu — não há o que perguntar.
 *  - só de R$ 1.000 pra cima. Abaixo disso a leitura literal quase sempre é a
 *    certa ("cento e cinquenta" -> 150), e perguntar seria puro atrito.
 *  - nunca quando termina em 00: "mil e quinhentos" vira 1500, e ninguém fala
 *    centavos zerados em voz alta ("onze reais" sai como "11 reais", não
 *    "1100").
 *  - e o número tem que estar solto, sem separador nenhum. "1.179" com ponto
 *    de milhar é o Whisper afirmando que são mil e cento e setenta e nove.
 *
 * Devolve a leitura alternativa (em centavos) ou null quando não há dúvida.
 */
function leituraAlternativaDeAudio(texto: string, amount: number): number | null {
  if (!Number.isInteger(amount)) return null;
  if (amount < 1000 || amount > 99999) return null;
  if (amount % 100 === 0) return null;
  const solto = new RegExp(`(?<![\\d.,])${amount}(?![\\d.,])`);
  if (!solto.test(texto)) return null;
  return amount / 100;
}

/**
 * Lê a resposta da pergunta de valor. Aceita o número da opção, o ordinal por
 * extenso (a pessoa pode responder por áudio) ou o próprio valor repetido —
 * quem responde "11,79" está sendo mais claro que quem responde "1".
 */
function escolherValor(text: string, literal: number, alternativa: number): number | null {
  /* Tira acento, emoji e pontuação: a resposta pode vir como "1", "1️⃣",
     "1.", "primeiro" ou " Um ". */
  const so = (text || '').toLowerCase().replace(/[^0-9a-zà-ÿ]/g, '');
  if (so === '1' || so === 'um' || so === 'primeiro' || so === 'primeira') return alternativa;
  if (so === '2' || so === 'dois' || so === 'segundo' || so === 'segunda') return literal;

  const dito = guessAmountFromText(text);
  if (Math.abs(dito - alternativa) < 0.005) return alternativa;
  if (Math.abs(dito - literal) < 0.005) return literal;
  return null;
}

function formatarBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** As duas opções, do jeito que aparecem na pergunta e na repetição dela. */
function textoDasOpcoes(literal: number, alternativa: number): string {
  return `1️⃣ R$ ${formatarBRL(alternativa)}\n2️⃣ R$ ${formatarBRL(literal)}`;
}

async function buscarPendente(phone: string): Promise<Rascunho | null> {
  const { data, error } = await supabase.from('whatsapp_pending').select('*').eq('phone', phone).maybeSingle();
  if (error) throw error;
  return data as Rascunho | null;
}

async function limparPendente(phone: string): Promise<void> {
  const { error } = await supabase.from('whatsapp_pending').delete().eq('phone', phone);
  if (error) throw error;
}

/** Grava o lançamento de verdade e limpa qualquer rascunho pendente daquele número. */
async function finalizarLancamento(
  rascunho: Pick<Rascunho, 'user_id' | 'phone' | 'description' | 'amount' | 'type' | 'occurred_on' | 'card_id' | 'payment_method'> & {
    installments?: number | null;
    recurring?: boolean;
  },
  categoria: { name: string; color: string },
  eventId: string,
  nomeCartao?: string | null,
  ouvido?: string
): Promise<void> {
  const parcelas = rascunho.installments && rascunho.installments >= 2 ? rascunho.installments : null;
  const { error } = await supabase.rpc('registrar_lancamento_whatsapp', {
    p_user_id: rascunho.user_id,
    p_phone: rascunho.phone,
    p_event_id: eventId,
    p_type: rascunho.type,
    p_description: rascunho.description,
    p_amount: rascunho.amount,
    p_category: categoria.name,
    p_color: categoria.color,
    p_occurred_on: rascunho.occurred_on,
    p_card_id: rascunho.card_id,
    p_payment_method: rascunho.payment_method,
    p_installments: parcelas,
    p_recurring: rascunho.recurring ?? false,
  });
  if (error) throw error;

  const valorFmt = rascunho.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sufixoCartao = nomeCartao ? ` no cartão ${nomeCartao}` : '';
  const sufixoParcelas = parcelas ? ` em ${parcelas}x` : '';
  const sufixoRecorrente = rascunho.recurring ? '\n🔁 Vai repetir todo mês.' : '';
  await sendWhatsappMessage(
    rascunho.phone,
    `✅ Lançamento registrado: R$ ${valorFmt}${sufixoParcelas} em ${categoria.name} (${rascunho.description})${sufixoCartao}` +
      sufixoRecorrente +
      linhaDoQueFoiOuvido(ouvido)
  );
}

/**
 * O que o bot ouviu, ecoado na confirmação de lançamento por áudio.
 *
 * Só aparece em áudio, e a razão é que a transcrição é a única etapa do
 * caminho que ninguém consegue ver. Quando um valor sai errado por causa dela,
 * a pessoa não tem como saber se falou mal, se o Whisper ouviu mal ou se o bot
 * interpretou mal — e quem for investigar depois também não, porque o texto
 * transcrito não fica gravado em lugar nenhum. Com o eco, o erro se explica
 * sozinho na hora: dá pra ler "ouvi: mercado quarenta" e reagir.
 */
function linhaDoQueFoiOuvido(ouvido?: string): string {
  return ouvido ? `\n\n🎙️ Ouvi: "${ouvido}"` : '';
}

/* ---- parcelas ---- */

/**
 * Número de parcelas de uma compra no crédito: "3x", "em 3 vezes",
 * "parcelado em 5", "10 parcelas".
 *
 * A mensagem de boas-vindas do bot sempre prometeu isto ("Mercado 230
 * parcelado em 3x"), mas nada extraía o número: a compra ia pra fatura como
 * um lançamento único do valor CHEIO, no mês da compra. Quem parcelou em 10x
 * via a fatura do mês estourar e as dez seguintes vazias.
 *
 * Devolve null quando não há parcelamento (1x é o mesmo que não parcelar).
 * O teto de 36 evita que um número solto grande vire mil parcelas.
 */
function parseParcelas(text: string): number | null {
  /* Falado, o número da parcela vem por extenso — "parcelei em oito", "em
     três vezes" — e o resto desta função só enxerga dígito. Sem esta troca,
     o parcelamento sumia calado em todo lançamento por áudio: virava uma
     compra única pelo valor cheio, e a fatura do mês levava o tombo inteiro.
     A tabela é local, e não uma constante de módulo, porque os testes
     extraem esta função inteira do arquivo — uma constante de fora ficaria
     para trás e o teste passaria medindo outra coisa. */
  const EXTENSO: Record<string, number> = {
    dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
    oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14,
    quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
    dezenove: 19, vinte: 20, 'vinte e quatro': 24, trinta: 30, 'trinta e seis': 36,
  };
  /* Do mais longo pro mais curto: senão "vinte" casa antes e "vinte e quatro"
     nunca chega a ser reconhecido. */
  const palavras = Object.keys(EXTENSO)
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/ /g, '\\s+'))
    .join('|');
  const alvo = text.replace(new RegExp(`\\b(?:${palavras})\\b`, 'gi'), (m) =>
    String(EXTENSO[m.toLowerCase().replace(/\s+/g, ' ')])
  );

  const padroes = [
    /\bem\s+(\d{1,2})\s*x\b/i,
    /\b(\d{1,2})\s*x\b/i,
    /\bem\s+(\d{1,2})\s+vezes\b/i,
    /\b(\d{1,2})\s+vezes\b/i,
    /\bem\s+(\d{1,2})\s+parcelas?\b/i,
    /\b(\d{1,2})\s+parcelas?\b/i,
    /\bparcel(?:ei|ado|ada|ar|a)\s+em\s+(\d{1,2})\b/i,
  ];
  for (const re of padroes) {
    const m = alvo.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 36) return n;
    }
  }
  return null;
}

/* ---- crédito: reconhecer intenção e casar o cartão certo ---- */

/** "no crédito", "cartão de crédito", "parcelei", "3x", "5 vezes" — sinais de que a compra foi no cartão, não em débito/pix. */
function ehIntencaoCredito(text: string): boolean {
  /* Débito dito com todas as letras encerra a conversa antes de qualquer
     outra regra: "no cartão de débito" casava com a regra de "no cartão" e
     ia parar na fatura do crédito. */
  if (/\bd[eé]bito\b/i.test(text)) return false;

  /* A palavra "crédito" sozinha basta. A regra antiga exigia a preposição
     "no" grudada nela, e por isso mandava pro débito as formas mais curtas,
     que são justamente as que a pessoa usa quando manda áudio ou escreve com
     pressa: "Almoço crédito C6", "Chip de 22 reais, Crédito, C6",
     "Crédito Almoço 20 reais". Todas foram lançadas errado. */
  if (/\bcr[eé]dito\b/i.test(text)) return true;

  if (/\bno\s+(?:cr[eé]dito|cart[aã]o)\b/i.test(text)) return true;
  if (/\bcart[aã]o\s+de\s+cr[eé]dito\b/i.test(text)) return true;
  if (/\bparcel(?:ei|ado|ada|ar|a)\b/i.test(text)) return true;
  if (/\b\d+\s*x\b/i.test(text)) return true;
  if (/\b\d+\s*vezes\b/i.test(text)) return true;
  /* Parcelamento só existe no crédito, então achar parcela JÁ é dizer que é
     crédito. As regras acima cobriam "3x" e "em 3 vezes" mas não "em 12
     parcelas" nem parcela falada por extenso — e como registrarLancamento só
     procura parcelas DENTRO do ramo de crédito, o parcelamento era descartado
     em silêncio: "TV 2500 em 12 parcelas" virava uma saída única de R$ 2.500
     fora da fatura. Delegar pro parseParcelas mantém as duas decisões
     concordando sempre, em vez de duas listas de padrões pra divergir. */
  if (parseParcelas(text) !== null) return true;
  return false;
}

type CartaoBusca = { id: string; name: string; bank: string };

/** Acha o cartão citado no texto pelo nome que o usuário deu a ele ou pelo banco ("Nubank", "Itaú Click", "no Inter"). */
function matchCardByText(text: string, cards: CartaoBusca[]): CartaoBusca | null {
  const alvo = normalizarParaBusca(text);
  for (const c of cards) {
    if (contemPalavra(alvo, c.name) || contemPalavra(alvo, c.bank)) return c;
    const partes = c.name.split(/\s+/).filter((p) => p.length >= 4);
    if (partes.some((p) => contemPalavra(alvo, p))) return c;
  }
  return null;
}

async function fetchCreditCardsDoUsuario(userId: string): Promise<CartaoBusca[]> {
  const { data, error } = await supabase
    .from('credit_cards')
    .select('id, name, bank')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as CartaoBusca[] | null) ?? [];
}

/* `is_default = false`: as 9 categorias padrão já são cobertas pelas
   keywords ricas de CATEGORY_KEYWORDS acima — buscar elas de novo aqui só
   duplicaria a checagem contra o mesmo nome (a seed em lib/data.ts grava as
   padrão como linhas reais, `is_default = true`, na primeira vez que o
   usuário abre o gerenciador de categorias no app). O que falta cobrir são
   só as categorias que a pessoa criou do zero. */
async function fetchCategoriasDoUsuario(userId: string): Promise<{ name: string; color: string }[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('name, color')
    .eq('user_id', userId)
    .eq('is_default', false);
  if (error) throw error;
  return (data as { name: string; color: string }[] | null) ?? [];
}

/* ── Desfazer o último lançamento ──────────────────────────────────────────
 *
 * Errar um lançamento e ter que abrir o app pra corrigir quebra o motivo de o
 * bot existir. Com "cancela", a pessoa desfaz e refaz sem sair da conversa.
 *
 * Três decisões que separam isto de uma arma apontada pro histórico:
 *
 *  1. Só o ÚLTIMO, e só o que saiu daqui. Apagar por descrição ("apaga o
 *     mercado") acharia cinco lançamentos e escolheria um — o erro seria pior
 *     que o original, porque ninguém percebe.
 *  2. Só com a mensagem SEM VALOR. "Cancelamento de voo 200 reais" é uma
 *     despesa de verdade, e "cancelei a Netflix 39,90" também: se veio número,
 *     é lançamento, não comando. Este é o filtro que impede a palavra de
 *     virar uma armadilha.
 *  3. Janela de 24 horas. Sem limite, um "cancela" mandado dias depois apaga
 *     algo que a pessoa já esqueceu que existia.
 *
 * Não pede confirmação de propósito: o bot já diz o que removeu, e refazer é
 * um áudio de três segundos. Perguntar "tem certeza?" cobraria um toque a mais
 * de todo mundo pra proteger de um erro que a própria resposta já revela.
 */
/* Cada verbo entra pelo RADICAL, com as três terminações que a pessoa usa:
   "cancela" (fala), "cancele" (imperativo escrito) e "cancelar" (infinitivo).
   A primeira versão listava as formas uma a uma e esqueceu metade — "cancela"
   e "cancelar" estavam lá, "cancele" não, e quem escreveu "Cancele o último
   lançamento" recebeu de volta um pedido de valor.

   Fronteiras por lookaround em vez de `\b`: no JavaScript o `\b` só enxerga
   [A-Za-z0-9_], e "esqueça", "desfaça" e "não é isso" têm caractere fora
   dessa faixa — é o mesmo `\b` que já mordeu três vezes neste projeto. */
const CANCELAR =
  /(?<![a-zà-ÿ0-9])(?:cancel(?:a|e|ar|amento)|apag(?:a|ue|ar)|exclu(?:i|a|ir)|delet(?:a|e|ar)|desfa(?:z|ça|zer)|desconsider(?:a|e|ar)|ignor(?:a|e|ar)|esque(?:ce|ça|cer)|remov(?:e|a|er)|anul(?:a|e|ar)|errei|errado|n[ãa]o\s+(?:era|[ée])\s+(?:isso|esse|essa))(?![a-zà-ÿ0-9])/i;

function ehIntencaoCancelar(text: string): boolean {
  return CANCELAR.test(text);
}

/**
 * Verbo de comando no FIM da mensagem — vale como cancelamento mesmo tendo
 * valor junto.
 *
 * A regra "tem valor, então é lançamento" sozinha produziu isto: quem escreveu
 * "Mercado 10,05 cancele" ganhou um lançamento NOVO chamado "Mercado cancele".
 * O oposto do que pediu, com a palavra de comando virando parte do nome.
 *
 * O que separa este caso de "cancelamento de voo 200 reais" é a posição e a
 * forma do verbo: imperativo/infinitivo no fim é ordem, substantivo no meio é
 * descrição. Por isso a lista aqui é menor que a de cima e exclui de
 * propósito:
 *  - "cancelamento" — substantivo, aparece em despesa real (multa, taxa);
 *  - "cancelei", "errei" — passado em primeira pessoa, conta o que a pessoa
 *    fez, não o que ela quer que o bot faça. "Netflix 39,90 cancelei" é o
 *    registro da última cobrança de quem cancelou a assinatura.
 */
const COMANDO_CANCELAR_FINAL =
  /[\s,.;:!-]+(?:cancel(?:a|e|ar)|apag(?:a|ue|ar)|exclu(?:i|a|ir)|delet(?:a|e|ar)|desfa(?:z|ça|zer)|remov(?:e|a|er)|anul(?:a|e|ar))[\s.!]*$/i;

/* ---- forma de pagamento ---- */

/**
 * Pix, débito ou dinheiro dito na mensagem.
 *
 * `transactions.payment_method` aceita 'debit' | 'credit' | 'pix' | 'cash'
 * desde sempre, mas o bot só sabia gravar 'credit' — dizer "no pix" não
 * gravava nada, e o lançamento ficava sem forma de pagamento nenhuma. Quem
 * lança pelo app escolhe num seletor; quem lança pelo WhatsApp dizia e era
 * ignorado.
 *
 * Crédito NÃO sai daqui: quem decide é `ehIntencaoCredito`, que já sabe
 * recusar "cartão de débito" e "recebi um crédito de 500". Misturar as duas
 * decisões faria uma desfazer a outra.
 */
function parseFormaPagamento(text: string): string | null {
  const t = text.toLowerCase();
  /* Débito antes de pix: "paguei no débito e o resto no pix" é raro, mas
     quando aparecem os dois vale o primeiro dito. */
  const iDebito = t.search(/\bd[ée]bito\b/);
  const iPix = t.search(/\bpix\b/);
  const iDinheiro = t.search(/\b(?:dinheiro|esp[ée]cie)\b/);

  const achados = [
    { forma: 'debit', i: iDebito },
    { forma: 'pix', i: iPix },
    { forma: 'cash', i: iDinheiro },
  ].filter((a) => a.i >= 0);

  if (achados.length === 0) return null;
  achados.sort((a, b) => a.i - b.i);
  return achados[0].forma;
}

/* ---- recorrência ---- */

/**
 * "Todo mês" — a série que se repete sozinha (ver lib/recorrencia.ts).
 *
 * O bot gravava `recurring: false` fixo nos três lugares onde escreve, então
 * "aluguel 1500 todo mês" virava um lançamento avulso e a pessoa redigitava
 * todo mês uma coisa que ela já tinha dito que repetia.
 *
 * A lista é curta de propósito, e o motivo é assimetria de dano: marcar
 * recorrência à toa cria dinheiro que não existe nos meses seguintes — o
 * mesmo tipo de erro de um valor errado. Não marcar só custa redigitar. Por
 * isso "mensalidade" e "assinatura" ficaram de fora: são substantivos que
 * descrevem o gasto ("academia mensalidade 89,90"), não um pedido de repetir.
 * Só entra quem disse com todas as letras que repete.
 *
 * Semana e dia também ficam de fora, e não por esquecimento: o modelo de
 * recorrência do app é mensal. Marcar "toda semana" como mensal seria dar uma
 * resposta errada em vez de nenhuma.
 */
function parseRecorrencia(text: string): boolean {
  const t = text.toLowerCase();
  /* "Parcelado em 3x" é uma série FECHADA de três linhas, criada de uma vez —
     o oposto de uma série aberta. Dizer as duas coisas é contradição, e o
     parcelamento é o mais específico dos dois. */
  if (parseParcelas(text) !== null) return false;
  return /\btod[oa]s?\s+(?:o\s+|os\s+)?m[êe]s(?:es)?\b|\bcada\s+m[êe]s\b|\bmensalmente\b|\brecorrente\b|\bse\s+repete\b|\bque\s+repete\b|\brepete\s+tod[oa]\s+m[êe]s\b/.test(t);
}

/* ---- boleto: reconhecer intenção e a data de vencimento ---- */

/** Só vira boleto se a pessoa disser explicitamente — "paguei a luz" sozinho continua sendo um lançamento normal, não uma conta a programar. */
function ehIntencaoBoleto(text: string): boolean {
  return (
    /\bboletos?\b/i.test(text) ||
    /\bvencimento\b/i.test(text) ||
    /\bvence\s+(?:dia|em|no|dessa)\b/i.test(text) ||
    /\bconta\s+a\s+pagar\b/i.test(text)
  );
}

/* ── Perguntas de gasto ("quanto eu gastei em X?") ──────────────────────────
 *
 * Antes desta função, o bot só sabia REGISTRAR (lançamento) ou responder às
 * próprias perguntas de esclarecimento (categoria/valor pendente) — nunca
 * respondia uma pergunta informativa. Uma pergunta sem valor numérico dito
 * ("quanto eu gastei em alimentação esse mês?") caía direto na resposta
 * genérica de `registrarLancamento` ("Não consegui identificar o valor"),
 * porque perguntar "quanto" nunca vem acompanhado de um número — é o bot
 * quem devolve o número. Por isso esta checagem roda ANTES do fallthrough
 * pra `registrarLancamento`, não depois.
 *
 * Só reconhece o FORMATO de pergunta de gasto (`/quanto|qual.../`) — dentro
 * disso, decide qual das três consultas é: boletos e crédito são checados
 * ANTES de categoria porque "cartão"/"boleto" são sinais mais específicos
 * que uma palavra-chave de categoria solta no meio da frase. Sem reconhecer
 * nenhum dos três, devolve `null` — a mensagem segue o fluxo normal (mesmo
 * comportamento de antes desta função existir). */
type ResultadoConsulta =
  | { tipo: 'categoria'; categoria: { name: string; color: string } }
  | { tipo: 'boletos' }
  | { tipo: 'credito' };

/* `categoriasDoUsuario` sem anotação de tipo — mesma razão de
   matchCategoryByKeyword: __tests__/corpus-consulta.ts extrai esta função
   direto do arquivo real, e a limpeza de tipo do extrator não sabe remover
   tipo objeto literal de parâmetro (só o de retorno). */
function interpretarConsulta(text: string, categoriasDoUsuario = []): ResultadoConsulta | null {
  if (!/\b(?:quanto|qual)\b[\s\S]*\b(?:gastei|gasto|tenho|falta|foi\s+gasto|j[aá]\s+gastei)\b/i.test(text)) return null;

  if (/\bboletos?\b|\bconta[s]?\s+a\s+pagar\b|\bvencer\b/i.test(text)) return { tipo: 'boletos' };
  if (/\bcr[eé]dito\b|\bcart[aã]o\b/i.test(text)) return { tipo: 'credito' };

  const categoria = matchCategoryByKeyword(text, categoriasDoUsuario);
  if (categoria) return { tipo: 'categoria', categoria };

  return null;
}

/** Primeiro e último dia do mês corrente, em ISO — `new Date(ano, mes, 0)` pega o último dia certo (28/29/30/31) sem tabela de exceção. */
function janelaDoMesCorrente(): { inicio: string; fim: string; nomeMes: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-based
  const pad = (n: number) => String(n).padStart(2, '0');
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return {
    inicio: `${ano}-${pad(mes + 1)}-01`,
    fim: `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}`,
    nomeMes: hoje.toLocaleDateString('pt-BR', { month: 'long' }),
  };
}

/** Responde uma consulta informativa — só leitura, não deixa rascunho pendente nenhum. */
async function responderConsulta(userId: string, phone: string, resultado: ResultadoConsulta): Promise<void> {
  const { inicio, fim, nomeMes } = janelaDoMesCorrente();

  if (resultado.tipo === 'categoria') {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'out')
      .eq('category', resultado.categoria.name)
      .gte('occurred_on', inicio)
      .lte('occurred_on', fim);
    if (error) throw error;
    const total = (data ?? []).reduce((s, t) => s + Number(t.amount), 0);
    await sendWhatsappMessage(phone, `💸 Você gastou R$ ${formatarBRL(total)} em ${resultado.categoria.name} em ${nomeMes}.`);
    return;
  }

  if (resultado.tipo === 'boletos') {
    /* Mesma janela/filtro que lib/projections.ts usa pro Safe-to-Spend do
       app (`calcularSafeToSpend`) — status 'due' e vencimento dentro do mês
       corrente. Portado, não importado: Deno não importa de lib/. */
    const { data, error } = await supabase
      .from('bills')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'due')
      .gte('due_date', inicio)
      .lte('due_date', fim);
    if (error) throw error;
    const total = (data ?? []).reduce((s, b) => s + Number(b.amount), 0);
    await sendWhatsappMessage(phone, `🧾 Você tem R$ ${formatarBRL(total)} em boletos pra pagar em ${nomeMes}.`);
    return;
  }

  // credito — mesma fórmula de app/(app)/credito.tsx (soma de transactions do
  // mês por payment_method='credit'), com detalhamento por cartão quando o
  // usuário tem mais de um (senão a soma sozinha já responde a pergunta).
  const [cartoes, gastosResult] = await Promise.all([
    fetchCreditCardsDoUsuario(userId),
    supabase
      .from('transactions')
      .select('amount, card_id')
      .eq('user_id', userId)
      .eq('payment_method', 'credit')
      .gte('occurred_on', inicio)
      .lte('occurred_on', fim),
  ]);
  if (gastosResult.error) throw gastosResult.error;
  const gastos = gastosResult.data;
  const linhas = gastos ?? [];
  const total = linhas.reduce((s, t) => s + Number(t.amount), 0);
  if (cartoes.length <= 1) {
    await sendWhatsappMessage(phone, `💳 Você já gastou R$ ${formatarBRL(total)} no crédito em ${nomeMes}.`);
    return;
  }
  const porCartao = cartoes
    .map((c) => `${c.name}: R$ ${formatarBRL(linhas.filter((t) => t.card_id === c.id).reduce((s, t) => s + Number(t.amount), 0))}`)
    .join('\n');
  await sendWhatsappMessage(phone, `💳 Você já gastou R$ ${formatarBRL(total)} no crédito em ${nomeMes}:\n${porCartao}`);
}

/** "vence dia 25", "vencimento 25/08", "vence 25/08/2026" — sem nada disso, vence em 5 dias por padrão (editável no app). */
function parseDiaVencimento(text: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dataCompleta = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dataCompleta) {
    const d = parseInt(dataCompleta[1], 10);
    const m = parseInt(dataCompleta[2], 10);
    let y = dataCompleta[3] ? parseInt(dataCompleta[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`;
  }

  const diaSolto = text.match(/\bdia\s+(\d{1,2})\b/i);
  if (diaSolto) {
    const dia = parseInt(diaSolto[1], 10);
    if (dia >= 1 && dia <= 31) {
      const hoje = new Date();
      // Se o dia já passou neste mês, o vencimento só pode ser no mês seguinte.
      const mesAlvo = dia < hoje.getDate() ? hoje.getMonth() + 1 : hoje.getMonth();
      const venc = new Date(hoje.getFullYear(), mesAlvo, dia);
      return `${venc.getFullYear()}-${pad(venc.getMonth() + 1)}-${pad(venc.getDate())}`;
    }
  }

  const padrao = new Date();
  padrao.setDate(padrao.getDate() + 5);
  return `${padrao.getFullYear()}-${pad(padrao.getMonth() + 1)}-${pad(padrao.getDate())}`;
}

/** Cria a conta a pagar direto (sem passar por transactions — boleto só vira saída quando marcado como pago, igual no app). */
async function registrarBoleto(
  userId: string,
  phone: string,
  text: string,
  amount: number,
  eventId: string,
  ouvido?: string,
  categoriasDoUsuario = []
): Promise<void> {
  const description = guessDescFromText(text, 'out');
  const due_date = parseDiaVencimento(text);
  const categoria = matchCategoryByKeyword(text, categoriasDoUsuario) ?? CATEGORIES.find((c) => c.name === 'Outros')!;

  const { error } = await supabase.rpc('registrar_boleto_whatsapp', {
    p_user_id: userId,
    p_phone: phone,
    p_event_id: eventId,
    p_description: description,
    p_amount: amount,
    p_category: categoria.name,
    p_color: categoria.color,
    p_due_date: due_date,
    p_recurring: parseRecorrencia(text),
  });
  if (error) throw error;

  const valorFmt = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vencFmt = due_date.split('-').reverse().join('/');
  await sendWhatsappMessage(
    phone,
    `📄 Boleto registrado em Contas a pagar: R$ ${valorFmt} (${description}), vence ${vencFmt}.` + linhaDoQueFoiOuvido(ouvido)
  );
}

/**
 * Ponto de entrada de um texto que pode virar lançamento. Quando o valor não
 * é identificado, pede pra reformular — não tem rascunho possível sem valor.
 * Quando o valor é identificado mas a categoria não bate com nenhuma palavra-
 * chave conhecida, guarda um rascunho pendente e PERGUNTA em vez de arquivar
 * tudo em "Outros" sem avisar — essa era a reclamação original: falta de
 * assertividade quando a mensagem é ambígua.
 *
 * Boleto ("vence dia 25", "boleto de luz") é desviado antes de tudo pra
 * `bills`, não `transactions` — não tem categoria pendente a perguntar,
 * então sai direto sem passar pelo rascunho.
 */
/* `valorForcado` chega quando o valor já foi decidido fora daqui — hoje só
   pela desambiguação de áudio. Reprocessar o texto original inteiro (em vez
   de remontar o lançamento a partir do rascunho) mantém crédito, cartão,
   parcelas, boleto e categoria funcionando exatamente igual ao caminho
   normal, sem uma segunda implementação pra divergir. */
async function registrarLancamento(
  userId: string,
  phone: string,
  text: string,
  eventId: string,
  valorForcado?: number,
  ouvido?: string
): Promise<void> {
  const amount = valorForcado ?? guessAmountFromText(text);
  if (!amount || amount <= 0) {
    await sendWhatsappMessage(phone, 'Não consegui identificar o valor. Tente algo como: "Almoço de 38 reais" ou "R$ 38 em Alimentação".');
    return;
  }

  /* Buscada uma vez só aqui e repassada adiante (pro boleto e pro match
     principal) — evita duas idas ao banco pro mesmo dado dentro da mesma
     mensagem. Ver comentário completo em fetchCategoriasDoUsuario. */
  const categoriasDoUsuario = await fetchCategoriasDoUsuario(userId);

  if (ehIntencaoBoleto(text)) {
    await registrarBoleto(userId, phone, text, amount, eventId, ouvido, categoriasDoUsuario);
    return;
  }

  const type = guessTypeFromText(text);
  let description = guessDescFromText(text, type);
  const occurred_on = todayISO();
  const categoria = matchCategoryByKeyword(text, categoriasDoUsuario);

  let card_id: string | null = null;
  /* Pix, débito e dinheiro saem daqui; crédito é decidido logo abaixo e
     sobrescreve. Antes disto o campo só era preenchido no crédito — dizer "no
     pix" era ouvido pra tirar da descrição e jogado fora na hora de salvar. */
  let payment_method: string | null = parseFormaPagamento(text);
  let nomeCartao: string | null = null;
  /* Só faz sentido parcelar saída no crédito — "recebi 300 em 3x" não existe,
     e parcelar um pix/débito também não. Fica null fora desse caso. */
  let installments: number | null = null;
  /* Só saída vai pra fatura. Agora que a palavra "crédito" sozinha aciona a
     regra, "recebi um crédito de 500" — que é dinheiro entrando — cairia num
     cartão sem esta trava. */
  if (type === 'out' && ehIntencaoCredito(text)) {
    const cartoes = await fetchCreditCardsDoUsuario(userId);
    if (cartoes.length > 0) {
      // Cita o cartão pelo nome/banco? usa esse. Senão, cai no primeiro
      // cadastrado — na prática o único, pra maioria de quem usa 1 cartão —
      // e avisa qual foi usado na confirmação, pra corrigir fácil se errou.
      const achado = matchCardByText(text, cartoes) ?? cartoes[0];
      card_id = achado.id;
      payment_method = 'credit';
      nomeCartao = achado.name;
      /* "C6" (ou o nome que a pessoa deu ao cartão) identifica ONDE lançar,
         não faz parte do nome do gasto — "Almoço pago no crédito da C6"
         virava a descrição "Almoço pago no crédito da C6" (relatado pelo
         autor), quando o esperado é só "Almoço pago", com o cartão indo
         para `card_id` separadamente. */
      description = limparReferenciaCartao(description, nomeCartao);
      installments = parseParcelas(text);
    }
  }

  /* Parcelamento e recorrência são modelos que se excluem: 3x é uma série
     FECHADA (três linhas criadas de uma vez), recorrência é uma série ABERTA
     que o app vai preenchendo mês a mês. `parseRecorrencia` já recusa quando
     acha parcela; a repetição aqui é só pra deixar a regra visível no ponto
     onde o lançamento é montado. */
  const recurring = installments ? false : parseRecorrencia(text);

  if (categoria) {
    await finalizarLancamento(
      { user_id: userId, phone, description, amount, type, occurred_on, card_id, payment_method, installments, recurring },
      categoria,
      eventId,
      nomeCartao,
      ouvido
    );
    return;
  }

  const { error: pendingError } = await supabase
    .from('whatsapp_pending')
    /* `pending_kind`, `amount_alt` e `raw_text` vão explícitos mesmo valendo o
       default: o upsert só sobrescreve as colunas que recebe, então um
       rascunho de valor abandonado deixaria `pending_kind = 'valor'` grudado
       na linha e a resposta de categoria cairia no ramo errado. */
    .upsert({
      phone, user_id: userId, description, amount, type, occurred_on, attempts: 0,
      card_id, payment_method, installments, recurring,
      pending_kind: 'categoria', amount_alt: null, raw_text: null,
    });
  if (pendingError) throw pendingError;

  const valorFmt = formatarBRL(amount);
  await sendWhatsappMessage(
    phone,
    `Não identifiquei a categoria de "${description}" (R$ ${valorFmt}).` +
      linhaDoQueFoiOuvido(ouvido) +
      `\n\nQual dessas se encaixa melhor?\n${listaCategoriasPara(categoriasDoUsuario)}`
  );
}

/** Guarda o áudio inteiro e pergunta qual das duas leituras é a certa. */
async function perguntarValorAmbiguo(
  userId: string,
  phone: string,
  texto: string,
  literal: number,
  alternativa: number
): Promise<void> {
  const type = guessTypeFromText(texto);
  const { error } = await supabase.from('whatsapp_pending').upsert({
    phone,
    user_id: userId,
    description: guessDescFromText(texto, type),
    amount: literal,
    type,
    occurred_on: todayISO(),
    attempts: 0,
    card_id: null,
    payment_method: null,
    installments: null,
    pending_kind: 'valor',
    amount_alt: alternativa,
    raw_text: texto,
  });
  if (error) throw error;

  await sendWhatsappMessage(
    phone,
    `🎙️ Ouvi "${literal}" — e isso pode ser duas coisas:\n\n${textoDasOpcoes(literal, alternativa)}\n\nQual foi? Responde 1 ou 2.`
  );
}

/** Resposta à pergunta de valor. Resolvido o valor, o áudio original é reprocessado inteiro. */
async function tratarRespostaValor(pendente: Rascunho, text: string, eventId: string): Promise<boolean> {
  const alternativa = pendente.amount_alt ?? pendente.amount;
  const escolhido = escolherValor(text, pendente.amount, alternativa);

  if (escolhido !== null) {
    await limparPendente(pendente.phone);
    await registrarLancamento(
      pendente.user_id,
      pendente.phone,
      pendente.raw_text ?? pendente.description,
      eventId,
      escolhido,
      pendente.raw_text ?? undefined
    );
    return true;
  }

  const tentativas = pendente.attempts + 1;
  /* Sem palpite possível aqui: errar o valor é o erro que a pessoa não
     perdoa, então na dúvida o rascunho é descartado e ela manda de novo —
     ao contrário da pergunta de categoria, que cai em "Outros" pra não
     travar o lançamento. */
  if (tentativas >= 2) {
    await limparPendente(pendente.phone);
    await sendWhatsappMessage(
      pendente.phone,
      'Não consegui confirmar o valor, então não registrei nada. Manda o lançamento de novo — se ficar mais fácil, pode ser em texto.'
    );
    return true;
  }

  const { error } = await supabase.from('whatsapp_pending').update({ attempts: tentativas }).eq('phone', pendente.phone);
  if (error) throw error;
  await sendWhatsappMessage(
    pendente.phone,
    `Não entendi. Responde só 1 ou 2:\n\n${textoDasOpcoes(pendente.amount, alternativa)}`
  );
  return true;
}

/**
 * Desfaz o último lançamento feito por este número. Devolve true se tratou.
 *
 * Compra parcelada some INTEIRA: "3x" gravou três linhas ligadas por
 * parent_id, e apagar só a primeira deixaria duas parcelas órfãs na fatura de
 * meses futuros — o tipo de resto que só aparece semanas depois.
 */
async function cancelarUltimoLancamento(phone: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancelar_ultimo_whatsapp', { p_phone: phone });
  if (error) throw error;
  const resultado = data as {
    status?: string;
    kind?: string;
    count?: number;
    amount?: number;
    description?: string;
    category?: string;
  };

  if (resultado.status === 'none') {
    await sendWhatsappMessage(
      phone,
      'Não tenho nenhum lançamento recente deste número pra cancelar. Consigo desfazer só o último feito por aqui, e dentro de 24 horas — o resto dá pra excluir pelo app.'
    );
    return;
  }
  if (resultado.status === 'expired') {
    await sendWhatsappMessage(
      phone,
      'Esse lançamento é de mais de um dia atrás — pra evitar apagar algo por engano, o cancelamento por aqui vale só nas primeiras 24 horas. Dá pra excluir pelo app.'
    );
    return;
  }
  if (resultado.status === 'missing') {
    await sendWhatsappMessage(phone, 'Esse lançamento já não existe mais — deve ter sido removido pelo app.');
    return;
  }
  if (resultado.kind === 'bill') {
    await sendWhatsappMessage(
      phone,
      `🗑️ Removido de Contas a pagar: R$ ${formatarBRL(Number(resultado.amount))} (${resultado.description}).\n\nPode mandar o certo agora.`
    );
    return;
  }
  const sufixoParcelas = Number(resultado.count) > 1 ? ` — as ${resultado.count} parcelas` : '';
  await sendWhatsappMessage(
    phone,
    `🗑️ Removido: R$ ${formatarBRL(Number(resultado.amount))} em ${resultado.category} (${resultado.description})${sufixoParcelas}.\n\nPode mandar o certo agora.`
  );
}

/**
 * Ponto único de entrada do "cancela", para texto e áudio. Devolve true
 * quando a mensagem era um comando e já foi respondida.
 *
 * A ordem importa: se existe uma pergunta no ar (categoria ou valor), o
 * "cancela" se refere a ELA, não ao lançamento anterior já salvo. Quem
 * desiste no meio da pergunta quer descartar o rascunho — apagar por cima
 * disso um lançamento que estava certo seria o pior desfecho possível.
 */
async function tratarCancelamento(phone: string, text: string): Promise<boolean> {
  /* Com valor junto a barra sobe: só conta como comando o verbo imperativo no
     FIM da frase, porque "cancelamento de voo 200 reais" é uma despesa de
     verdade e não pode apagar nada. Sem valor, qualquer palavra da família
     serve — não há lançamento possível ali pra confundir. */
  const comando = guessAmountFromText(text) > 0 ? COMANDO_CANCELAR_FINAL.test(text) : ehIntencaoCancelar(text);
  if (!comando) return false;

  const pendente = await buscarPendente(phone);
  if (pendente) {
    await limparPendente(phone);
    await sendWhatsappMessage(phone, 'Beleza, descartei. Não registrei nada — pode mandar de novo quando quiser.');
    return true;
  }

  await cancelarUltimoLancamento(phone);
  return true;
}

/** Trata a resposta a uma pergunta de esclarecimento pendente. Devolve true se tratou (a mensagem não deve seguir o fluxo normal). */
async function tratarRespostaPendente(phone: string, text: string, eventId: string): Promise<boolean> {
  const pendente = await buscarPendente(phone);
  if (!pendente) return false;

  if (pendente.pending_kind === 'valor') return await tratarRespostaValor(pendente, text, eventId);

  /* Recarregada aqui porque esta função roda numa mensagem SEPARADA da que
     criou o rascunho pendente (a resposta à pergunta de categoria) — não dá
     pra reaproveitar a lista já buscada em registrarLancamento, que rodou
     numa invocação anterior da function. */
  const categoriasDoUsuario = await fetchCategoriasDoUsuario(pendente.user_id);

  const categoria = matchCategoryByReply(text, categoriasDoUsuario);
  if (categoria) {
    await finalizarLancamento(pendente, categoria, eventId);
    return true;
  }

  const tentativas = pendente.attempts + 1;
  if (tentativas >= 2) {
    // Duas tentativas sem reconhecer — registra em "Outros" pra não travar o lançamento pra sempre, mas avisa que foi um chute.
    const outros = CATEGORIES.find((c) => c.name === 'Outros')!;
    await finalizarLancamento(pendente, outros, eventId);
    await sendWhatsappMessage(phone, 'Não reconheci a categoria — registrei em "Outros" mesmo assim. Você pode trocar depois no app.');
    return true;
  }

  const { error } = await supabase.from('whatsapp_pending').update({ attempts: tentativas }).eq('phone', phone);
  if (error) throw error;
  await sendWhatsappMessage(phone, `Não entendi. Responda só com o nome de uma destas categorias:\n${listaCategoriasPara(categoriasDoUsuario)}`);
  return true;
}

async function handleTextMessage(phone: string, text: string, eventId: string): Promise<void> {
  const { data: link, error: linkError } = await supabase
    .from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();
  if (linkError) throw linkError;

  if (link) {
    const { data: allowed, error: accessError } = await supabase.rpc('usuario_tem_direito', {
      p_user_id: link.user_id,
    });
    if (accessError) throw accessError;
    if (!allowed) {
      await sendWhatsappMessage(phone, 'Sua assinatura do Grana. precisa ser renovada para continuar lançando pelo WhatsApp. Abra o app para regularizar.');
      return;
    }
    if (await tratarCancelamento(phone, text)) return;
    const tratou = await tratarRespostaPendente(phone, text, eventId);
    if (tratou) return;
    /* Antes de registrarLancamento de propósito — ver comentário completo
       em interpretarConsulta sobre por que a ordem importa aqui. */
    const consulta = interpretarConsulta(text, await fetchCategoriasDoUsuario(link.user_id));
    if (consulta) {
      await responderConsulta(link.user_id, phone, consulta);
      return;
    }
    await registrarLancamento(link.user_id, phone, text, eventId);
    return;
  }

  const pareado = await handlePairing(phone, text);
  if (!pareado) {
    await sendWhatsappMessage(
      phone,
      'Este número ainda não está vinculado a uma conta Grana. Gere um código de pareamento em Perfil → WhatsApp no app e envie o código de 6 dígitos aqui.'
    );
  }
}

async function handleAudioMessage(phone: string, mediaId: string, eventId: string): Promise<void> {
  const { data: link, error: linkError } = await supabase
    .from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();
  if (linkError) throw linkError;
  if (!link) {
    await sendWhatsappMessage(phone, 'Este número ainda não está vinculado. Gere um código de pareamento em Perfil → WhatsApp no app.');
    return;
  }
  const { data: allowed, error: accessError } = await supabase.rpc('usuario_tem_direito', {
    p_user_id: link.user_id,
  });
  if (accessError) throw accessError;
  if (!allowed) {
    await sendWhatsappMessage(phone, 'Sua assinatura do Grana. precisa ser renovada para continuar lançando pelo WhatsApp. Abra o app para regularizar.');
    return;
  }

  const texto = await transcribeAudio(mediaId);
  if (!texto) {
    await sendWhatsappMessage(phone, '🎙️ Não consegui entender esse áudio. Tente gravar de novo mais perto do microfone, ou me conte em texto (ex: "Mercado de 120 reais").');
    return;
  }

  if (await tratarCancelamento(phone, texto)) return;

  const tratou = await tratarRespostaPendente(phone, texto, eventId);
  if (tratou) return;

  /* Antes da checagem de valor de propósito — uma pergunta falada nunca tem
     valor numérico dito, então cairia direto na mensagem de "não identifiquei
     o valor" logo abaixo se checada depois. Ver interpretarConsulta. */
  const consulta = interpretarConsulta(texto, await fetchCategoriasDoUsuario(link.user_id));
  if (consulta) {
    await responderConsulta(link.user_id, phone, consulta);
    return;
  }

  // Sem valor identificado o áudio vira um beco sem saída silencioso: a pessoa
  // não sabe se o problema foi a transcrição ou a frase. Ecoar o que foi
  // entendido deixa o erro óbvio ("ouvi 'mercado' mas não ouvi o valor").
  const valor = guessAmountFromText(texto);
  if (valor <= 0) {
    await sendWhatsappMessage(
      phone,
      `🎙️ Entendi: "${texto}"\n\nMas não identifiquei o valor. Tente incluir o valor no áudio, tipo: "Mercado, cento e vinte reais".`
    );
    return;
  }

  /* Só o áudio passa por aqui. Em texto, "1179" é o que a pessoa digitou e
     não há dúvida nenhuma a levantar — a ambiguidade nasce da transcrição. */
  const alternativa = leituraAlternativaDeAudio(texto, valor);
  if (alternativa !== null) {
    await perguntarValorAmbiguo(link.user_id, phone, texto, valor, alternativa);
    return;
  }

  await registrarLancamento(link.user_id, phone, texto, eventId, undefined, texto);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Handshake de verificação do webhook (Meta exige isto uma vez, ao registrar a URL).
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 });
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return new Response('Payload too large', { status: 413 });
    }

    if (!(await assinaturaValida(rawBody, req.headers.get('x-hub-signature-256')))) {
      return new Response('Invalid signature', { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const mensagens: Array<{
      id?: string;
      from?: string;
      type?: string;
      text?: { body?: string };
      audio?: { id?: string };
    }> = [];
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const batch = Array.isArray(change?.value?.messages) ? change.value.messages : [];
        mensagens.push(...batch);
      }
    }
    if (mensagens.length === 0) return new Response('ok', { status: 200 });

    let houveFalha = false;

    for (const message of mensagens) {
      const eventId = String(message.id ?? '').slice(0, 255);
      const phone = String(message.from ?? '').replace(/\D/g, '');
      if (!eventId || !phone) {
        houveFalha = true;
        continue;
      }
      const messageHashBuffer = await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(JSON.stringify(message))
      );
      const payloadHash = Array.from(
        new Uint8Array(messageHashBuffer), (b) => b.toString(16).padStart(2, '0')
      ).join('');

      const { data: claim, error: claimError } = await supabase.rpc('reivindicar_webhook_evento', {
        p_provider: 'whatsapp',
        p_event_id: eventId,
        p_event_type: message.type ?? 'unknown',
        p_payload_hash: payloadHash,
      });
      if (claimError) {
        houveFalha = true;
        continue;
      }
      if (claim === 'done') continue;
      if (claim === 'busy') {
        houveFalha = true;
        continue;
      }

      const holder = `${eventId}:${crypto.randomUUID()}`;
      const { data: lock, error: lockError } = await supabase.rpc('adquirir_webhook_lock', {
        p_resource_key: `whatsapp:${phone}`,
        p_holder: holder,
        p_ttl_seconds: 120,
      });
      if (lockError || lock !== true) {
        houveFalha = true;
        await supabase.rpc('falhar_webhook_evento', {
          p_provider: 'whatsapp', p_event_id: eventId, p_error_code: 'phone_busy',
        });
        continue;
      }

      try {
        if (message.type === 'text') {
          await handleTextMessage(phone, message.text?.body ?? '', eventId);
        } else if (message.type === 'audio' && message.audio?.id) {
          await handleAudioMessage(phone, message.audio.id, eventId);
        } else {
          await sendWhatsappMessage(phone, 'Por enquanto só entendo mensagens de texto ou áudio.');
        }
        const { error: finishError } = await supabase.rpc('finalizar_webhook_evento', {
          p_provider: 'whatsapp', p_event_id: eventId,
        });
        if (finishError) throw finishError;
      } catch (err) {
        houveFalha = true;
        const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : 'processing_error';
        await supabase.rpc('falhar_webhook_evento', {
          p_provider: 'whatsapp', p_event_id: eventId, p_error_code: code,
        });
        console.error('[whatsapp-webhook] falha ao processar evento', { eventId, code });
      } finally {
        await supabase.rpc('liberar_webhook_lock', {
          p_resource_key: `whatsapp:${phone}`, p_holder: holder,
        });
      }
    }

    return new Response(houveFalha ? 'retry' : 'ok', { status: houveFalha ? 500 : 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
