import { CATEGORIES, type TxType } from './types';
import { parseAmount, todayISO } from './format';
import { LIMITS } from './limits';

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

/** Converte trechos numéricos por extenso em dígitos e junta "X reais e Y centavos". */
/* Palavra que, logo depois de um bloco numérico fechado, confirma que aquilo
   era mesmo um valor em dinheiro (não um artigo indefinido). */
const PALAVRA_MOEDA = /^(?:reais|real|contos?|pila|pau|mangos?)$/i;

export function normalizarTexto(texto: string): string {
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
      /(\d+)\s*(?:reais|real)\s*e\s*(\d{1,2})\b(?!\s*(?:mil|reais|real|conto|contos|pila|pau|mangos?))/gi,
      (_m, r, c) => `${r},${String(c).padStart(2, '0')} reais`
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
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

export function guessCategoryFromText(text: string): { name: string; color: string } {
  const alvo = normalizarParaBusca(text);
  let bestName: string | null = null;

  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => contemPalavra(alvo, kw))) {
      bestName = catName;
      break;
    }
  }

  return (
    CATEGORIES.find((c) => c.name === bestName) ||
    CATEGORIES.find((c) => c.name === 'Outros') ||
    CATEGORIES[0]
  );
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

export function guessTypeFromText(text: string): TxType {
  const alvo = normalizarParaBusca(text);
  if (MARCADORES_SAIDA.some((h) => contemPalavra(alvo, h))) return 'out';
  if (MARCADORES_ENTRADA.some((h) => contemPalavra(alvo, h))) return 'in';
  return 'out';
}

export function guessAmountFromText(text: string): number {
  const normalizado = normalizarTexto(text);

  // "R$ 1.250,90" — quando o cifrão está lá, é o sinal mais confiável.
  const comCifrao = normalizado.match(/r\$\s*([\d.,]+)/i);
  if (comCifrao) return parseAmount(comCifrao[1]);

  // "350 reais", "120 conto", "50 pila" — em fala e em mensagem informal o
  // cifrão quase nunca aparece; a moeda vem por extenso depois do número.
  const comMoeda = normalizado.match(/([\d.,]+)\s*(?:reais|real|conto|contos|pila|pau|mangos?)\b/i);
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
/* Restos de valor colados nas pontas: "luz 210" -> "luz", "350 reais x" -> "x". */
const VALOR_INICIAL = /^(?:r\$\s*)?\d[\d.,]*\s*(?:reais|real|conto|contos|pila|pau|mangos?)?\b\s*/i;
const VALOR_FINAL = /\s*(?:r\$\s*)?\d[\d.,]*\s*(?:reais|real|conto|contos|pila|pau|mangos?)?$/i;
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
const EXPRESSAO_VALOR = /(?:r\$\s*)?\d[\d.,]*\s*(?:reais|real|conto|contos|pila|pau|mangos?)?/i;

export function guessDescFromText(text: string, type: TxType): string {
  const texto = normalizarTexto(text);

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
  const semValor = texto
    .replace(/r\$\s*[\d.,]+/gi, ' ')
    .replace(/[\d.,]+\s*(?:reais|real|conto|contos|pila|pau|mangos?)\b/gi, ' ')
    .replace(/\d[\d.,]*/g, ' ');
  const sobra = limparSobra(semValor);
  if (sobra.length >= 2) return capitalizar(sobra.slice(0, 40));

  return type === 'in' ? 'Pix recebido' : 'Pagamento';
}

export type ParsedCsvTransaction = {
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string; // 'YYYY-MM-DD'
};

function splitCsvLine(line: string): string[] {
  const delim = line.split(';').length > line.split(',').length ? ';' : ',';
  return line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
}

function parseCsvDate(raw: string): string {
  if (!raw) return todayISO();
  const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return todayISO();

  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return todayISO();

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/* Resultado do parse, com o aviso de corte quando o arquivo passa do teto —
   a tela precisa disso para não importar em silêncio só uma parte do extrato. */
export type CsvParseResult = {
  rows: ParsedCsvTransaction[];
  /** Quantas linhas de dados o arquivo tinha antes de qualquer corte. */
  totalLinhas: number;
  /** true quando o arquivo passou de LIMITS.csvRows e foi truncado. */
  truncado: boolean;
};

export function parseCsvText(text: string): ParsedCsvTransaction[] {
  return parseCsvTextDetalhado(text).rows;
}

export function parseCsvTextDetalhado(text: string): CsvParseResult {
  const vazio: CsvParseResult = { rows: [], totalLinhas: 0, truncado: false };

  /* Corta o texto antes de qualquer processamento. Sem isto, colar um arquivo
     grande já estoura a memória no split, antes mesmo de chegar ao teto de
     linhas. */
  const texto = text.length > LIMITS.pastedText ? text.slice(0, LIMITS.pastedText) : text;

  const lines = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return vazio;

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.some(
    (h) => h.includes('data') || h.includes('valor') || h.includes('desc') || h.includes('hist')
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;

  let idxDate = hasHeader ? header.findIndex((h) => h.includes('data')) : 0;
  let idxDesc = hasHeader ? header.findIndex((h) => h.includes('desc') || h.includes('hist')) : 1;
  let idxAmount = hasHeader ? header.findIndex((h) => h.includes('valor') || h.includes('quant')) : 2;
  const idxType = hasHeader ? header.findIndex((h) => h.includes('tipo')) : -1;
  const idxCat = hasHeader ? header.findIndex((h) => h.includes('categ')) : -1;

  if (idxDate === -1) idxDate = 0;
  if (idxDesc === -1) idxDesc = 1;
  if (idxAmount === -1) idxAmount = 2;

  const results: ParsedCsvTransaction[] = [];

  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    if (cols.length < 2) continue;

    const rawAmount = cols[idxAmount] || '0';
    const amount = Math.abs(parseAmount(rawAmount));
    if (!amount) continue;

    const desc = (cols[idxDesc] || 'Sem descrição').trim() || 'Sem descrição';
    const typeRaw = (idxType !== -1 ? cols[idxType] : '') || '';
    const isIncome =
      /entrada|receita|credito|crédito|\+/i.test(typeRaw) ||
      (!/saida|saída|despesa|debito|débito|-/i.test(typeRaw) &&
        rawAmount.trim().indexOf('-') !== 0 &&
        guessTypeFromText(desc + ' ' + typeRaw) === 'in');

    const type: TxType = isIncome ? 'in' : 'out';

    const catNameRaw = (idxCat !== -1 ? cols[idxCat] : '') || '';
    const catObj =
      CATEGORIES.find((c) => c.name.toLowerCase() === catNameRaw.trim().toLowerCase()) ||
      guessCategoryFromText(desc);

    const occurred_on = parseCsvDate((cols[idxDate] || '').trim());

    results.push({
      type,
      description: desc,
      amount,
      category: catObj.name,
      color: catObj.color,
      occurred_on,
    });

    /* Teto de linhas: o insert em lote vai numa requisição só, então sem isto
       um extrato grande vira uma escrita em massa no banco e um array enorme
       em memória. Para de acumular, mas segue contando para poder avisar. */
    if (results.length >= LIMITS.csvRows) break;
  }

  return {
    rows: results,
    totalLinhas: dataLines.length,
    truncado: dataLines.length > results.length,
  };
}

export type BudgetTemplate = {
  key: string;
  name: string;
  desc: string;
  pct: Record<string, number>;
};

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    key: 'debt',
    name: 'Sair das dívidas',
    desc: 'Prioriza moradia e essenciais, aperta o lazer para sobrar caixa.',
    pct: {
      'Moradia': 0.32,
      'Alimentação': 0.20,
      'Transporte': 0.10,
      'Saúde': 0.07,
      'Outros': 0.06,
      'Lazer': 0.04,
      'Assinaturas': 0.03,
    },
  },
  {
    key: 'travel',
    name: 'Guardar para uma viagem',
    desc: 'Corta um pouco de tudo para sobrar uma reserva mensal maior.',
    pct: {
      'Moradia': 0.28,
      'Alimentação': 0.18,
      'Transporte': 0.09,
      'Saúde': 0.06,
      'Lazer': 0.06,
      'Outros': 0.05,
      'Assinaturas': 0.03,
    },
  },
  {
    key: 'card',
    name: 'Controlar cartão e assinaturas',
    desc: 'Foco em assinaturas e lazer, o resto fica equilibrado.',
    pct: {
      'Moradia': 0.30,
      'Alimentação': 0.22,
      'Transporte': 0.10,
      'Saúde': 0.07,
      'Lazer': 0.06,
      'Outros': 0.06,
      'Assinaturas': 0.025,
    },
  },
  {
    key: 'invest',
    name: 'Investir e crescer patrimônio',
    desc: 'Limites enxutos em tudo para maximizar o que sobra no mês.',
    pct: {
      'Moradia': 0.26,
      'Alimentação': 0.16,
      'Transporte': 0.08,
      'Saúde': 0.06,
      'Lazer': 0.04,
      'Outros': 0.04,
      'Assinaturas': 0.02,
    },
  },
];
