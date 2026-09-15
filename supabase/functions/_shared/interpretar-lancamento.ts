/**
 * Interpretação determinística de um lançamento escrito em linguagem natural.
 *
 * ── Por que este módulo existe ─────────────────────────────────────────────
 *
 * O Granabô passou a registrar lançamentos pelo chat (14/09/2026). Para isso
 * ele precisa, no servidor, da MESMA leitura de valor, tipo, descrição,
 * categoria, carteira, cartão, forma de pagamento e recorrência que o app faz
 * em `lib/heuristics.ts`.
 *
 * Esta cópia foi extraída de `lib/heuristics.ts` — a fonte de verdade do app —
 * e **nunca** do `whatsapp-webhook`, mesmo a cópia de lá estando pronta e
 * testada. O autor determinou em 14/09/2026 que nada de lançamento pode
 * depender do WhatsApp, porque a feature será apagada por completo e o
 * Granachat assume o papel dela. Uma dependência naquele arquivo quebraria o
 * registro de dinheiro no dia da remoção — justamente o caminho que não pode
 * quebrar.
 *
 * ── Quem garante que a cópia não diverge ───────────────────────────────────
 *
 * `__tests__/sync-parser.js`. Cada função aqui é comparada, corpo a corpo,
 * com a de `lib/heuristics.ts` (e `parseAmount` com a de `lib/format.ts`,
 * `precisaRevisarValorVoz` com a de `lib/voz-confiabilidade.ts`). Divergir é
 * erro de teste, não descoberta em produção — que foi como a divergência
 * anterior apareceu, com um lançamento saindo errado.
 *
 * Não edite este arquivo à mão para corrigir lógica: corrija em
 * `lib/heuristics.ts` e traga a correção para cá, senão o guarda acusa.
 *
 * ── O que NÃO vem para cá ──────────────────────────────────────────────────
 *
 * O que já é compartilhado fica onde está e é importado:
 * `normalizarTextoTranscrito` (números por extenso) de `finance-command.ts`,
 * e o dicionário de categorias de `category-keywords.ts`.
 */
import { MOEDA, normalizarTextoTranscrito as normalizarTexto } from './finance-command.ts';
import {
  CATEGORY_KEYWORDS,
  contemPalavra,
  normalizarParaBusca,
  semValorMonetario,
} from './category-keywords.ts';

/** Mesma união de `lib/types.ts`, escrita à mão porque o Deno não importa o app. */
export type TxType = 'in' | 'out';

/** Espelho de `CATEGORIES` em `lib/types.ts`: nome e cor das nove padrão. */
export const CATEGORIES: { name: string; color: string }[] = [
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

export function parseAmount(raw: string): number {
  /* Pontuação de frase nas pontas não faz parte do número. Sem isso, um
     "5,50," (a vírgula que separa o valor do resto da frase entrando junto
     na captura de quem chamou) era lido com a ÚLTIMA vírgula como separador
     decimal: R$ 5,50 virava R$ 550,00. Os chamadores em lib/heuristics.ts já
     capturam terminando em dígito, mas a limpeza fica aqui também porque
     esta função é o funil por onde todo valor do app passa. */
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
    /* "0.999" continua decimal: o teste de `antes` diferente de zero evita
       transformar um valor abaixo de um real em novecentos e noventa e nove. */
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

export function parseParcelas(text: string): number | null {
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
  for (const [dezena, base] of [['vinte', 20], ['trinta', 30]] as const) {
    for (const [unidade, valor] of Object.entries({ um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 })) {
      EXTENSO[`${dezena} e ${unidade}`] = base + valor;
    }
  }
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

/** "no crédito", "cartão de crédito", "parcelei", "3x", "5 vezes" — sinais de que a compra foi no cartão, não em débito/pix. */
export function ehIntencaoCredito(text: string): boolean {
  if (/\b(?:recebi|recebido|entrou|creditado|dep[oó]sito|reembolso)\b/i.test(text)
    && !/\b(?:paguei|comprei|gastei|parcelei)\b/i.test(text)) return false;
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

type CartaoBusca = { id: string; name: string; bank: string; wallet_id?: string | null };

/** Acha o cartão citado no texto pelo nome que o usuário deu a ele ou pelo banco ("Nubank", "Itaú Click", "no Inter"). */
export function matchCardByText(text: string, cards: CartaoBusca[]): CartaoBusca | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const alvo = norm(text);
  const contem = (s: string) => !!s.trim() && new RegExp(`(?<![\\p{L}\\d])${norm(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u').test(alvo);
  const nomes = cards.filter(c => contem(c.name));
  // Nomes completos mais específicos prevalecem sobre o nome-base do banco.
  const especificos = nomes.filter(c => !nomes.some(outro => outro !== c && norm(outro.name).includes(norm(c.name)) && outro.name.length > c.name.length));
  if (especificos.length > 1) return null;
  if (especificos.length === 1) {
    const escolhido = especificos[0];
    // Um nome completo não pode ocultar a menção a outro banco.
    if (cards.some(c => norm(c.bank) !== norm(escolhido.bank) && contem(c.bank))) return null;
    if (norm(escolhido.name) === norm(escolhido.bank) && cards.filter(c => norm(c.bank) === norm(escolhido.bank)).length > 1) return null;
    return escolhido;
  }
  const bancos = cards.filter(c => contem(c.bank));
  if (bancos.length) return bancos.length === 1 ? bancos[0] : null;
  const partes = cards.filter(c => c.name.split(/\s+/).filter(p => p.length >= 4).some(contem));
  return partes.length === 1 ? partes[0] : null;
}

type CarteiraBusca = { id: string; name: string };

/** Remove só a referência ancorada ao cartão, nunca o nome da loja solto. */
export function limparReferenciaCartao(text: string, card: CartaoBusca): string {
  const original = text.normalize('NFC');
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nomes = [card.name, card.bank].filter(Boolean).sort((a, b) => b.length - a.length)
    .map(n => norm(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`\\b(?:credito|cartao)(?:\\s+(?:de|do|da|no|na))?\\s+(?:${nomes})(?![\\p{L}\\d])`, 'gu');
  let resultado = original;
  for (const m of [...norm(original).matchAll(re)].reverse()) {
    resultado = resultado.slice(0, m.index) + 'crédito' + resultado.slice(m.index! + m[0].length);
  }
  return resultado;
}

function normalizarNomeCarteira(texto: string): string {
  return normalizarParaBusca(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Encontra nomes personalizados somente quando a fala os ancora em "carteira" ou "conta". */
export function matchWalletByText(text: string, wallets: CarteiraBusca[]): CarteiraBusca | null {
  const alvo = normalizarNomeCarteira(text);
  const ordenadas = [...wallets].sort((a, b) => b.name.length - a.name.length);
  const encontradas = new Map<string, CarteiraBusca>();
  // A preferência pelo nome longo vale por menção, não pela frase inteira.
  for (const mencao of alvo.matchAll(/\b(?:carteira|conta)\s+/g)) {
    const trecho = alvo.slice(mencao.index! + mencao[0].length);
    const candidatas = ordenadas.filter(wallet => {
      const nome = normalizarNomeCarteira(wallet.name);
      return !!nome && new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u').test(trecho);
    });
    if (!candidatas.length) return null;
    const melhor = candidatas[0];
    if (candidatas.filter(w => normalizarNomeCarteira(w.name) === normalizarNomeCarteira(melhor.name)).length > 1) return null;
    encontradas.set(melhor.id, melhor);
  }
  return encontradas.size === 1 ? [...encontradas.values()][0] : null;
}

export function limparReferenciaCarteira(text: string, walletName: string): string {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escaped = norm(walletName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b(?:carteira|conta)\\s+${escaped}(?![\\p{L}\\d])`, 'gu');
  // Busca sem acento, preservando a grafia do restante da descrição.
  const chars = Array.from(text.normalize('NFC'));
  const original = chars.join('');
  return original.replace(/\b(?:carteira|conta)\s+[^\n]+/giu, trecho => {
    const match = re.exec(norm(trecho));
    re.lastIndex = 0;
    return match ? trecho.slice(0, match.index) + ' ' + trecho.slice(match.index + match[0].length) : trecho;
  }).replace(/\s{2,}/g, ' ').trim();
}

/* ---- boleto: reconhecer intenção e a data de vencimento ----
   Cópia da mesma extensão em supabase/functions/whatsapp-webhook; vigiada
   por __tests__/sync-parser.js pra não divergir. */

/** Só vira boleto se a pessoa disser explicitamente — "paguei a luz" sozinho continua sendo um lançamento normal, não uma conta a programar. */
export function ehIntencaoBoleto(text: string): boolean {
  // Pagamento concluído é saída, não uma nova dívida com data inventada.
  if (/\b(?:paguei|quitei|liquidei)\b|\bboleto\s+(?:j[áa]\s+)?pago\b/i.test(text) && !/\bn[ãa]o\s+(?:paguei|quitei|liquidei)\b/i.test(text)) return false;
  return (
    /\bboletos?\b/i.test(text) ||
    /\bvencimento\b/i.test(text) ||
    /\bvence\s+(?:dia|em|no|dessa|hoje|amanh[ãa])(?![\p{L}\d])/iu.test(text) ||
    /\bconta\s+a\s+pagar\b/i.test(text)
  );
}

export function parseDiaVencimento(text: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const valida = (y: number, m: number, d: number) => {
    const data = new Date(y, m - 1, d);
    return data.getFullYear() === y && data.getMonth() === m - 1 && data.getDate() === d ? iso(data) : '';
  };
  const hoje = new Date();
  const palavras: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
    treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
    dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  };
  const numero = (s: string) => /^\d+$/.test(s) ? Number(s) :
    s.split(/\s+e\s+/).reduce((n, p) => n + (palavras[p] ?? NaN), 0);
  const t = text.toLowerCase();
  const dataCompleta = t.match(/(?<!\d)(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?(?!\d)/);
  if (dataCompleta) {
    let y = dataCompleta[3] ? Number(dataCompleta[3]) : hoje.getFullYear();
    if (y < 100) y += 2000;
    return valida(y, Number(dataCompleta[2]), Number(dataCompleta[1]));
  }
  const relativa = t.match(/\bvence\s+(hoje|amanh[ãa]|em\s+(.+?)\s+dias?)(?![\p{L}\d])/iu);
  if (relativa) {
    const dias = relativa[1] === 'hoje' ? 0 : /^amanh/.test(relativa[1]) ? 1 : numero(relativa[2]);
    if (!Number.isFinite(dias) || dias < 0 || dias > 365) return '';
    hoje.setDate(hoje.getDate() + dias);
    return iso(hoje);
  }
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const nomeMes = t.match(/\b(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?/);
  if (nomeMes) {
    const m = meses.indexOf(nomeMes[2]) + 1;
    return valida(nomeMes[3] ? Number(nomeMes[3]) : hoje.getFullYear(), m, Number(nomeMes[1]));
  }
  const numerais = Object.keys(palavras).join('|');
  const diaSolto = t.match(new RegExp(`\\bdia\\s+(\\d{1,2}|(?:${numerais})(?:\\s+e\\s+(?:${numerais}))?)(?![\\p{L}\\d])`, 'u'));
  if (diaSolto) {
    const dia = numero(diaSolto[1]);
    if (dia < 1 || dia > 31 || !Number.isFinite(dia)) return '';
    const mesAlvo = dia < hoje.getDate() ? hoje.getMonth() + 1 : hoje.getMonth();
    const primeiro = new Date(hoje.getFullYear(), mesAlvo, 1);
    return valida(primeiro.getFullYear(), primeiro.getMonth() + 1, dia);
  }
  // Uma data explicitamente mencionada, mas ilegível, exige revisão.
  if (/\b(?:vence|vencimento|dia)\b/.test(t)) return '';
  hoje.setDate(hoje.getDate() + 5);
  return iso(hoje);
}

/**
 * Forma de pagamento dita na frase.
 *
 * `transactions.payment_method` aceita 'debit' | 'credit' | 'pix' | 'cash'
 * desde sempre, mas o lançamento por voz do app não gravava nada: dizer "no
 * pix" era ouvido, entrava na descrição e sumia. Quem lança pelo WhatsApp já
 * tinha isto; quem lançava por voz no app, não.
 *
 * Crédito NÃO sai daqui: quem decide é `ehIntencaoCredito`, que já sabe
 * recusar "cartão de débito" e "recebi um crédito de 500". Misturar as duas
 * decisões faria uma desfazer a outra.
 *
 * Cópia da mesma função em supabase/functions/whatsapp-webhook, vigiada por
 * __tests__/sync-parser.js.
 */
export function parseFormaPagamento(text: string): string | null {
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

/**
 * "Todo mês" — a série que se repete sozinha (ver lib/recorrencia.ts).
 *
 * O app gravava `recurring: false` fixo no lançamento por voz de crédito e de
 * boleto, então "aluguel 1500 todo mês" virava um lançamento avulso e a pessoa
 * redigitava todo mês uma coisa que ela já tinha dito que repetia.
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
export function parseRecorrencia(text: string): boolean {
  const t = text.toLowerCase();
  /* "Parcelado em 3x" é uma série FECHADA de três linhas, criada de uma vez —
     o oposto de uma série aberta. Dizer as duas coisas é contradição, e o
     parcelamento é o mais específico dos dois. */
  if (parseParcelas(text) !== null) return false;
  if (/\b(?:n[ãa]o|sem)\s+(?:(?:ser|[ée]|vai|deve|quero|precisa|que|se)\s+)*(?:recorrente|repita|repete|repetir|recorr[êe]ncia)\b/i.test(t)) return false;
  return /\btod[oa]s?\s+(?:o\s+|os\s+)?m[êe]s(?:es)?\b|\bcada\s+m[êe]s\b|\bmensalmente\b|\brecorrente\b|\bse\s+repete\b|\bque\s+repete\b|\brepete\s+tod[oa]\s+m[êe]s\b/.test(t);
}

/* `extras` são as categorias que o usuário criou no gerenciador do app
   (fetchCategories(), filtradas por `!is_default`) — sem isso, colar
   comprovante/escanear nota nunca reconhecia uma categoria custom, só as 9
   fixas. Cópia da mesma extensão em supabase/functions/whatsapp-webhook —
   ver o comentário completo lá sobre por que as 9 fixas continuam checadas
   primeiro. */
export function guessCategoryFromText(
  text: string,
  extras: { name: string; color: string }[] = []
): { name: string; color: string } {
  const alvo = normalizarParaBusca(semValorMonetario(text));
  let bestName: string | null = null;

  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => contemPalavra(alvo, kw))) {
      bestName = catName;
      break;
    }
  }

  if (!bestName) {
    const extra = extras.find((c) => contemPalavra(alvo, c.name));
    if (extra) return extra;
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

  /* Os grupos de captura terminam em `\d` de propósito (`[\d.,]*\d`, não
     `[\d.,]+`). Com `+` a captura era gulosa e engolia a vírgula da FRASE
     que vinha logo depois do valor: em "mercado R$ 5,50, alimentação" ela
     capturava "5,50," e o parseAmount lia a ÚLTIMA vírgula como separador
     decimal — R$ 5,50 virava R$ 550,00, cem vezes o valor certo. */

  // "R$ 1.250,90" — quando o cifrão está lá, é o sinal mais confiável.
  const comCifrao = normalizado.match(/r\$\s*([\d.,]*\d)/i);
  if (comCifrao) return parseAmount(comCifrao[1]);

  // "350 reais", "120 conto", "50 pila" — em fala e em mensagem informal o
  // cifrão quase nunca aparece; a moeda vem por extenso depois do número.
  const comMoeda = normalizado.match(new RegExp(`([\\d.,]*\\d)\\s*(?:${MOEDA})\\b`, 'i'));
  if (comMoeda) return parseAmount(comMoeda[1]);

  // "150,00" / "1.250,50" — número com centavos explícitos.
  const comCentavos = normalizado.match(/(?<![\d.,])(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+,\d{1,2})(?!\d)/);
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
/* O `(?:\s+d[aeo]\s+\S+)?` no fim cobre "no crédito DA C6", "no cartão DO
   Nubank" — a forma como se cita o cartão em voz alta. Sem isso a regra só
   casava com a forma de pagamento no fim exato da frase, e "Almoço 30 no
   crédito da C6" virava a descrição "Almoço no crédito da c6". No WhatsApp
   isso ficava meio escondido porque `limparReferenciaCartao` apagava o nome
   do cartão depois — mas só quando o cartão era encontrado no cadastro, e
   nunca no lançamento por voz DENTRO do app, que não passa por lá. */
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
   pelo parseDiaVencimento do bot. Sem tirar daqui, a conta a pagar nascia
   chamada "Conta de luz boleto que vence dia". */
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

export function guessDescFromText(text: string, type: TxType): string {
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
  const NOMES_CATEGORIA = CATEGORIES.map((c) => c.name)
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
    normalizarTexto(text).replace(/[.!?]+\s*$/, '').replace(DICA_CATEGORIA_FINAL, '')
  );

  /* Em boletos a data costuma vir antes do valor e o nome depois dele:
     "boleto para o dia 13 de setembro, 47 reais Liga das lendas". O parser
     antigo mordia o primeiro "para"/"de" e devolvia a data como descrição.
     Só usamos esta forma quando há sinal explícito de boleto/vencimento; em
     frases comuns, o texto depois do valor pode ser outra metainformação. */
  const nomeAposValor = texto.match(new RegExp(
    `(?:r\\$\\s*\\d[\\d.,]*|\\d[\\d.,]*\\s+(?:${MOEDA}))\\s+(.{2,40})$`,
    'i'
  ));
  if (nomeAposValor && /\b(?:boleto|conta\s+a\s+pagar|vencimento|vence|vencendo|dia)\b/i.test(
    texto.slice(0, nomeAposValor.index ?? 0)
  )) {
    const nome = limparSobra(nomeAposValor[1]);
    if (nome.length >= 2) return capitalizar(nome);
  }

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
