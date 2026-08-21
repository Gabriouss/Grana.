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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

/* ── Números falados por extenso ───────────────────────────────────────────
 *
 * Vale tanto para o lançamento por voz dentro do app quanto para o áudio
 * recebido no WhatsApp: nos dois casos a transcrição devolve "cento e vinte
 * reais" com a mesma frequência que "120 reais", e todo o resto da heurística
 * só entende dígitos. Sem esta etapa, metade das falas caía em "não
 * identifiquei o valor".
 */

const NUMERO_POR_EXTENSO: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cinqüenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
  duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};

function somarExtenso(palavras: string[]): number {
  let total = 0;
  let atual = 0;
  for (const p of palavras) {
    const v = NUMERO_POR_EXTENSO[p];
    if (v === undefined) continue; // "e"
    if (v === 1000) {
      atual = (atual === 0 ? 1 : atual) * 1000;
      total += atual;
      atual = 0;
    } else {
      atual += v;
    }
  }
  return total + atual;
}

/* Fonte única das palavras que a pessoa usa no lugar de "reais". Toda regex
   que precisa reconhecer moeda monta a partir daqui — a lista estava copiada
   literalmente em sete pontos deste arquivo, o que só espera divergir. */
const MOEDA = 'reais|real|contos?|pila|paus?|mangos?';

/* Palavra que, logo depois de um bloco numérico fechado, confirma que aquilo
   era mesmo um valor em dinheiro (não um artigo indefinido). */
const PALAVRA_MOEDA = new RegExp(`^(?:${MOEDA})$`, 'i');

/** Converte trechos numéricos por extenso em dígitos e junta "X reais e Y centavos". */
function normalizarTextoTranscrito(texto: string): string {
  const tokens = texto.split(/(\s+)/);
  const saida: string[] = [];
  let bloco: string[] = [];

  /* "um"/"uma" sozinhos são o artigo indefinido na esmagadora maioria das
     frases ("um pix", "uma compra", "um boleto") — só valem como número
     quando vêm seguidos de palavra de moeda ("um real") ou fazem parte de
     um bloco maior já em andamento ("vinte e um reais"). Sem essa distinção,
     "fiz um pix de 50 pra Maria" virava "fiz 1 pix de 50 pra Maria", e a
     regra de "número solto" (último recurso de guessAmountFromText) pegava
     o "1" em vez do valor real 50 — um lançamento de R$1 registrado em
     silêncio no lugar de R$50. `proximaPalavraRelevante` olha adiante no
     texto ORIGINAL (não nos tokens já processados) para decidir. */
  const proximaPalavraRelevante = (aPartirDe: number): string | null => {
    for (let j = aPartirDe; j < tokens.length; j++) {
      if (/^\s+$/.test(tokens[j])) continue;
      return tokens[j].toLowerCase().replace(/[.,!?;:]+$/, '');
    }
    return null;
  };

  const fecharBloco = (indiceAtual: number) => {
    if (bloco.length === 0) return;
    // Um "e" solto no fim do bloco pertence à frase, não ao número.
    while (bloco.length > 0 && NUMERO_POR_EXTENSO[bloco[bloco.length - 1]] === undefined) bloco.pop();

    if (bloco.length === 1 && (bloco[0] === 'um' || bloco[0] === 'uma')) {
      const proxima = proximaPalavraRelevante(indiceAtual);
      if (!proxima || !PALAVRA_MOEDA.test(proxima)) {
        saida.push(bloco[0]);
        bloco = [];
        return;
      }
    }

    if (bloco.length > 0) saida.push(String(somarExtenso(bloco)));
    bloco = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\s+$/.test(token)) {
      if (bloco.length === 0) saida.push(token);
      continue;
    }
    const limpo = token.toLowerCase().replace(/[.,!?;:]+$/, '');
    const pontuacao = token.slice(limpo.length);
    const ehNumero = NUMERO_POR_EXTENSO[limpo] !== undefined;
    // "e" só continua um bloco já começado (evita capturar o "e" de ligação).
    const ehLigacao = limpo === 'e' && bloco.length > 0;

    if (ehNumero || ehLigacao) {
      bloco.push(limpo);
      if (pontuacao) {
        fecharBloco(i + 1);
        saida.push(pontuacao, ' ');
      }
      continue;
    }
    fecharBloco(i);
    if (saida.length > 0 && !/\s$/.test(saida[saida.length - 1])) saida.push(' ');
    saida.push(token);
  }
  fecharBloco(tokens.length);

  return saida
    .join('')
    .replace(/(\d+)\s*(?:reais|real)\s*e\s*(\d+)\s*centavos?/gi, (_m, r, c) => `${r},${String(c).padStart(2, '0')} reais`)
    /* Fala real quase nunca diz "centavos" ("trinta reais e cinquenta") — só
       entra quando o número depois do "e" tem 1-2 dígitos e não é seguido de
       outra palavra de moeda, pra não confundir com "50 reais e 30 mil" ou
       frases com dois valores diferentes na mesma mensagem. */
    .replace(
      new RegExp(`(\\d+)\\s*(?:reais|real)\\s*e\\s*(\\d{1,2})\\b(?!\\s*(?:mil|${MOEDA}))`, 'gi'),
      (_m: string, r: string, c: string) => `${r},${String(c).padStart(2, '0')} reais`
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
   categoria em vez de arquivar em "Outros" sem avisar. */
function matchCategoryByKeyword(text: string): { name: string; color: string } | null {
  const alvo = normalizarParaBusca(text);
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => contemPalavra(alvo, kw))) {
      return CATEGORIES.find((c) => c.name === catName) ?? null;
    }
  }
  return null;
}

/** Casa a resposta de uma pergunta de esclarecimento: nome exato da categoria, ou uma palavra-chave conhecida. */
function matchCategoryByReply(text: string): { name: string; color: string } | null {
  const lower = text.trim().toLowerCase();
  const exact = CATEGORIES.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact;
  return matchCategoryByKeyword(text);
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
  const comCifrao = normalizado.match(/r\$\s*([\d.,]+)/i);
  if (comCifrao) return parseAmount(comCifrao[1]);

  // "350 reais", "120 conto", "50 pila" — em fala e em mensagem informal o
  // cifrão quase nunca aparece; a moeda vem por extenso depois do número.
  const comMoeda = normalizado.match(new RegExp(`([\\d.,]+)\\s*(?:${MOEDA})\\b`, 'i'));
  if (comMoeda) return parseAmount(comMoeda[1]);

  // "150,00" / "1.250,50" — número com centavos explícitos.
  const comCentavos = normalizado.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (comCentavos) return parseAmount(comCentavos[1]);

  // "mercado 50" / "50 no mercado" — último recurso: qualquer número solto.
  // Fica por último de propósito, para não roubar a vez de "99" em "99 Pop"
  // ou de um número que faça parte do nome do estabelecimento.
  const solto = normalizado.match(/(?:^|\s)(\d[\d.]*)(?:\s|$)/);
  if (solto) return parseAmount(solto[1]);

  return 0;
}

/* Verbos e locuções que abrem a frase sem descrever nada ("gastei 50 no bar",
   "caiu 1500 do cliente"). Só valem no início — "vendi" no meio de uma frase
   pode ser parte do nome. */
const VERBOS_INICIAIS =
  /^(?:me\s+pagaram|gastei|gasto|paguei|pagamento|comprei|compra|torrei|coloquei|investi|apliquei|recebi|recebido|ganhei|entrou|caiu|vendi|transferi|mandei|enviei|assinei|custou|saiu|foi|foram)\b\s*/i;
/* Conectores que sobram grudados nas pontas depois que o valor sai. */
const CONECTOR = '(?:de|do|da|dos|das|no|na|nos|nas|em|com|para|pra|pro|por|a|o|um|uma)';
const CONECTOR_INICIAL = new RegExp(`^${CONECTOR}\\b\\s*`, 'i');
const CONECTOR_FINAL = new RegExp(`\\s+${CONECTOR}$`, 'i');
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
const FORMA_PAGAMENTO_FINAL =
  /\s+(?:no|na|via|em|de)\s+(?:pix|dinheiro|espécie|especie|cartão|cartao|débito|debito|crédito|credito|boleto)$/i;

function limparSobra(bruto: string): string {
  let s = bruto.replace(/\s+/g, ' ').trim();
  let anterior = '';
  while (s !== anterior) {
    anterior = s;
    s = s
      .replace(VERBOS_INICIAIS, '')
      .replace(VALOR_INICIAL, '')
      .replace(VALOR_FINAL, '')
      .replace(FORMA_PAGAMENTO_FINAL, '')
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
  const texto = normalizarTextoTranscrito(text).replace(/[.!?]+\s*$/, '');

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

function parseAmount(raw: string): number {
  const trimmed = (raw || '').trim();
  if (!trimmed) return 0;
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  const decimalPos = Math.max(lastComma, lastDot);
  if (decimalPos === -1) return parseFloat(trimmed.replace(/[^0-9-]/g, '')) || 0;
  const intPart = trimmed.slice(0, decimalPos).replace(/[^0-9-]/g, '');
  const decPart = trimmed.slice(decimalPos + 1).replace(/[^0-9]/g, '');
  return parseFloat(intPart + '.' + decPart) || 0;
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
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
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
      const detalhe = await res.text().catch(() => '(sem corpo)');
      console.error(`[sendWhatsappMessage] Meta recusou o envio (HTTP ${res.status}) para ${to}:`, detalhe);
    }
  } catch (e) {
    console.error('[sendWhatsappMessage] Falha de rede ao chamar a Meta:', e);
  }
}

/**
 * Provedores de transcrição, em ordem de preferência. Ambos falam o mesmo
 * dialeto de API (a Groq expõe endpoints compatíveis com a OpenAI), então o
 * corpo da requisição é idêntico — só mudam URL, modelo e chave. A Groq vem
 * primeiro por ser ordens de grandeza mais rápida e barata no mesmo Whisper;
 * a OpenAI fica como rede de segurança para quando a Groq estiver fora do ar
 * ou com rate limit, situação em que perder o lançamento seria pior do que
 * pagar alguns centavos.
 */
const PROVEDORES_TRANSCRICAO = [
  { nome: 'groq', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3', key: () => GROQ_API_KEY },
  { nome: 'openai', url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1', key: () => OPENAI_API_KEY },
];

/** Baixa o .ogg/Opus da Meta. Devolve null se a mídia expirou ou o token não autoriza. */
async function baixarAudioDaMeta(mediaId: string): Promise<ArrayBuffer | null> {
  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!metaRes.ok) {
    console.error('[transcribeAudio] Meta recusou a consulta da mídia:', metaRes.status);
    return null;
  }
  const { url } = await metaRes.json();
  if (!url) return null;

  const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
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

    for (const provedor of PROVEDORES_TRANSCRICAO) {
      const chave = provedor.key();
      if (!chave) continue;

      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBytes], { type: 'audio/ogg' }), 'audio.ogg');
        formData.append('model', provedor.model);
        formData.append('language', 'pt');
        formData.append('response_format', 'json');

        const res = await fetch(provedor.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}` },
          body: formData,
        });
        if (!res.ok) {
          console.error(`[transcribeAudio] ${provedor.nome} respondeu ${res.status}:`, await res.text());
          continue;
        }
        const bruto = (await res.json())?.text;
        if (typeof bruto !== 'string' || !bruto.trim()) continue;

        const normalizado = normalizarTextoTranscrito(bruto);
        // Só o provedor e o tamanho. A transcrição em si é o extrato da
        // pessoa ("mercado, 120 reais") e os logs da Edge Function ficam
        // retidos e legíveis por qualquer um com acesso ao painel — não é
        // lugar para dado financeiro. Para depurar, o que importa é saber se
        // veio texto e de qual provedor.
        console.log(`[transcribeAudio] ${provedor.nome} devolveu ${normalizado.length} caracteres`);
        return normalizado || null;
      } catch (err) {
        console.error(`[transcribeAudio] ${provedor.nome} lançou exceção:`, err);
      }
    }

    if (!GROQ_API_KEY && !OPENAI_API_KEY) {
      console.warn('[transcribeAudio] nenhuma chave de transcrição configurada (GROQ_API_KEY / OPENAI_API_KEY).');
    }
    return null;
  } catch (err) {
    console.error('[transcribeAudio] erro:', err);
    return null;
  }
}

/* ---- fluxo principal ---- */

/* Janela de validade do código de pareamento — sem isso, um código de 6
   dígitos gerado uma vez e nunca usado fica adivinhável para sempre (o app
   sempre apaga o vínculo anterior ao gerar um novo, então `created_at`
   reflete a geração mais recente). 15 minutos é folga suficiente para copiar
   e colar no WhatsApp, e reduz a janela de tentativa de força bruta de
   "indefinida" para alguns minutos. */
const VALIDADE_PAREAMENTO_MS = 15 * 60 * 1000;

async function handlePairing(phone: string, text: string): Promise<boolean> {
  const codigo = text.trim().replace(/\D/g, '');
  if (codigo.length !== 6) return false;

  const cutoff = new Date(Date.now() - VALIDADE_PAREAMENTO_MS).toISOString();

  const { data: link } = await supabase
    .from('whatsapp_links')
    .select('*')
    .eq('pairing_code', codigo)
    .eq('verified', false)
    .gt('created_at', cutoff)
    .maybeSingle();

  if (!link) return false;

  await supabase
    .from('whatsapp_links')
    .update({ phone, verified: true, verified_at: new Date().toISOString() })
    .eq('id', link.id);

  await sendWhatsappMessage(phone, '✅ WhatsApp vinculado ao Grana. Agora é só me contar seus lançamentos por aqui.');
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
};

async function buscarPendente(phone: string): Promise<Rascunho | null> {
  const { data } = await supabase.from('whatsapp_pending').select('*').eq('phone', phone).maybeSingle();
  return data as Rascunho | null;
}

async function limparPendente(phone: string): Promise<void> {
  await supabase.from('whatsapp_pending').delete().eq('phone', phone);
}

/** Grava o lançamento de verdade e limpa qualquer rascunho pendente daquele número. */
async function finalizarLancamento(
  rascunho: Pick<Rascunho, 'user_id' | 'phone' | 'description' | 'amount' | 'type' | 'occurred_on' | 'card_id' | 'payment_method'>,
  categoria: { name: string; color: string },
  nomeCartao?: string | null
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    user_id: rascunho.user_id,
    type: rascunho.type,
    description: rascunho.description,
    amount: rascunho.amount,
    category: categoria.name,
    color: categoria.color,
    occurred_on: rascunho.occurred_on,
    recurring: false,
    card_id: rascunho.card_id,
    payment_method: rascunho.payment_method,
  });

  await limparPendente(rascunho.phone);

  if (error) {
    await sendWhatsappMessage(rascunho.phone, 'Deu erro ao salvar o lançamento. Tente de novo em instantes.');
    return;
  }

  const valorFmt = rascunho.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sufixoCartao = nomeCartao ? ` no cartão ${nomeCartao}` : '';
  await sendWhatsappMessage(
    rascunho.phone,
    `✅ Lançamento registrado: R$ ${valorFmt} em ${categoria.name} (${rascunho.description})${sufixoCartao}`
  );
}

/* ---- crédito: reconhecer intenção e casar o cartão certo ---- */

/** "no crédito", "cartão de crédito", "parcelei", "3x", "5 vezes" — sinais de que a compra foi no cartão, não em débito/pix. */
function ehIntencaoCredito(text: string): boolean {
  if (/\bno\s+(?:cr[eé]dito|cart[aã]o)\b/i.test(text)) return true;
  if (/\bcart[aã]o\s+de\s+cr[eé]dito\b/i.test(text)) return true;
  if (/\bparcel(?:ei|ado|ada|ar|a)\b/i.test(text)) return true;
  if (/\b\d+\s*x\b/i.test(text)) return true;
  if (/\b\d+\s*vezes\b/i.test(text)) return true;
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
  const { data } = await supabase
    .from('credit_cards')
    .select('id, name, bank')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data as CartaoBusca[] | null) ?? [];
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
async function registrarBoleto(userId: string, phone: string, text: string, amount: number): Promise<void> {
  const description = guessDescFromText(text, 'out');
  const due_date = parseDiaVencimento(text);
  const categoria = matchCategoryByKeyword(text) ?? CATEGORIES.find((c) => c.name === 'Outros')!;

  const { error } = await supabase.from('bills').insert({
    user_id: userId,
    description,
    amount,
    category: categoria.name,
    color: categoria.color,
    due_date,
    status: 'due',
    recurring: false,
  });

  if (error) {
    await sendWhatsappMessage(phone, 'Deu erro ao salvar o boleto. Tente de novo em instantes.');
    return;
  }

  const valorFmt = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vencFmt = due_date.split('-').reverse().join('/');
  await sendWhatsappMessage(
    phone,
    `📄 Boleto registrado em Contas a pagar: R$ ${valorFmt} (${description}), vence ${vencFmt}.`
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
async function registrarLancamento(userId: string, phone: string, text: string): Promise<void> {
  const amount = guessAmountFromText(text);
  if (!amount || amount <= 0) {
    await sendWhatsappMessage(phone, 'Não consegui identificar o valor. Tente algo como: "Almoço de 38 reais" ou "R$ 38 em Alimentação".');
    return;
  }

  if (ehIntencaoBoleto(text)) {
    await registrarBoleto(userId, phone, text, amount);
    return;
  }

  const type = guessTypeFromText(text);
  let description = guessDescFromText(text, type);
  const occurred_on = todayISO();
  const categoria = matchCategoryByKeyword(text);

  let card_id: string | null = null;
  let payment_method: string | null = null;
  let nomeCartao: string | null = null;
  if (ehIntencaoCredito(text)) {
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
    }
  }

  if (categoria) {
    await finalizarLancamento({ user_id: userId, phone, description, amount, type, occurred_on, card_id, payment_method }, categoria, nomeCartao);
    return;
  }

  await supabase
    .from('whatsapp_pending')
    .upsert({ phone, user_id: userId, description, amount, type, occurred_on, attempts: 0, card_id, payment_method });

  const valorFmt = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await sendWhatsappMessage(
    phone,
    `Não identifiquei a categoria de "${description}" (R$ ${valorFmt}). Qual dessas se encaixa melhor?\n${NOMES_CATEGORIAS}`
  );
}

/** Trata a resposta a uma pergunta de esclarecimento pendente. Devolve true se tratou (a mensagem não deve seguir o fluxo normal). */
async function tratarRespostaPendente(phone: string, text: string): Promise<boolean> {
  const pendente = await buscarPendente(phone);
  if (!pendente) return false;

  const categoria = matchCategoryByReply(text);
  if (categoria) {
    await finalizarLancamento(pendente, categoria);
    return true;
  }

  const tentativas = pendente.attempts + 1;
  if (tentativas >= 2) {
    // Duas tentativas sem reconhecer — registra em "Outros" pra não travar o lançamento pra sempre, mas avisa que foi um chute.
    const outros = CATEGORIES.find((c) => c.name === 'Outros')!;
    await finalizarLancamento(pendente, outros);
    await sendWhatsappMessage(phone, 'Não reconheci a categoria — registrei em "Outros" mesmo assim. Você pode trocar depois no app.');
    return true;
  }

  await supabase.from('whatsapp_pending').update({ attempts: tentativas }).eq('phone', phone);
  await sendWhatsappMessage(phone, `Não entendi. Responda só com o nome de uma destas categorias:\n${NOMES_CATEGORIAS}`);
  return true;
}

async function handleTextMessage(phone: string, text: string): Promise<void> {
  const { data: link } = await supabase.from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();

  if (link) {
    const tratou = await tratarRespostaPendente(phone, text);
    if (tratou) return;
    await registrarLancamento(link.user_id, phone, text);
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

async function handleAudioMessage(phone: string, mediaId: string): Promise<void> {
  const { data: link } = await supabase.from('whatsapp_links').select('*').eq('phone', phone).eq('verified', true).maybeSingle();
  if (!link) {
    await sendWhatsappMessage(phone, 'Este número ainda não está vinculado. Gere um código de pareamento em Perfil → WhatsApp no app.');
    return;
  }

  const texto = await transcribeAudio(mediaId);
  if (!texto) {
    await sendWhatsappMessage(phone, '🎙️ Não consegui entender esse áudio. Tente gravar de novo mais perto do microfone, ou me conte em texto (ex: "Mercado de 120 reais").');
    return;
  }

  const tratou = await tratarRespostaPendente(phone, texto);
  if (tratou) return;

  // Sem valor identificado o áudio vira um beco sem saída silencioso: a pessoa
  // não sabe se o problema foi a transcrição ou a frase. Ecoar o que foi
  // entendido deixa o erro óbvio ("ouvi 'mercado' mas não ouvi o valor").
  if (guessAmountFromText(texto) <= 0) {
    await sendWhatsappMessage(
      phone,
      `🎙️ Entendi: "${texto}"\n\nMas não identifiquei o valor. Tente incluir o valor no áudio, tipo: "Mercado, cento e vinte reais".`
    );
    return;
  }

  await registrarLancamento(link.user_id, phone, texto);
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
    const rawBody = await req.text();

    if (!(await assinaturaValida(rawBody, req.headers.get('x-hub-signature-256')))) {
      return new Response('Invalid signature', { status: 401 });
    }

    try {
      const payload = JSON.parse(rawBody);
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (message) {
        const phone = String(message.from);
        if (message.type === 'text') {
          await handleTextMessage(phone, message.text?.body ?? '');
        } else if (message.type === 'audio') {
          await handleAudioMessage(phone, message.audio?.id);
        } else {
          await sendWhatsappMessage(phone, 'Por enquanto só entendo mensagens de texto ou áudio.');
        }
      }
    } catch (err) {
      console.error('[whatsapp-webhook] erro ao processar mensagem:', err);
    }
    // A Meta reenvia o webhook em retry se não receber 200 — sempre respondemos
    // ok mesmo quando o processamento interno falhou (o erro já foi logado).
    return new Response('ok', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
