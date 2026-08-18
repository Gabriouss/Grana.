import { BANKS, CATEGORIES, type BankInfo, type TxType } from './types';
import { parseAmount, todayISO } from './format';
import { LIMITS } from './limits';

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Alimentação': ['ifood', 'restaurante', 'mercado', 'supermercado', 'padaria', 'lanchonete', 'pizza', 'burguer', 'hamburguer', 'açai', 'acai', 'mcdonalds', 'burger king', 'pao de acucar', 'carrefour', 'feira', 'merenda', 'lanche', 'almoço', 'almoco', 'jantar'],
  'Transporte': ['uber', '99', 'taxi', 'táxi', 'posto', 'combustível', 'combustivel', 'estacionamento', 'pedágio', 'pedagio', 'gasolina', 'etanol', 'ipiranga', 'shell'],
  'Moradia': ['aluguel', 'condominio', 'condomínio', 'energia', 'enel', 'luz', 'agua', 'água', 'sabesp', 'internet', 'fibra', 'vivo', 'claro', 'tim', 'gas', 'gás', 'iptu'],
  'Lazer': ['cinema', 'cinemark', 'ingresso', 'show', 'bar', 'balada', 'viagem', 'hotel', 'airbnb', 'teatro'],
  'Saúde': ['farmacia', 'farmácia', 'drogaria', 'drogasil', 'pacheco', 'clinica', 'clínica', 'consulta', 'medico', 'médico', 'dentista', 'academia', 'smart fit', 'laboratorio'],
  'Assinaturas': ['netflix', 'spotify', 'amazon prime', 'prime video', 'hbo', 'max', 'disney', 'youtube', 'apple', 'assinatura', 'mensalidade', 'icloud', 'openai', 'chatgpt'],
  'Salário': ['salario', 'salário', 'folha', 'pagamento de salario', 'pro-labore', 'holerite', 'rendimento'],
};

export function guessCategoryFromText(text: string): { name: string; color: string } {
  const lower = text.toLowerCase();
  let bestName: string | null = null;

  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
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

export function guessTypeFromText(text: string): TxType {
  const lower = text.toLowerCase();
  const inHints = [
    'recebeu',
    'recebido',
    'você recebeu',
    'voce recebeu',
    'crédito de',
    'credito de',
    'depósito',
    'deposito',
    'transferência recebida',
    'pix recebido',
    'estorno',
    'salário',
    'salario',
  ];
  return inHints.some((h) => lower.includes(h)) ? 'in' : 'out';
}

export function guessAmountFromText(text: string): number {
  const match = text.match(/r\$?\s*([\d.,]+)/i);
  if (match) {
    return parseAmount(match[1]);
  }
  // Fallback: search for stand-alone currency numbers like 150,00 or 1.250,50
  const fallbackMatch = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
  if (fallbackMatch) {
    return parseAmount(fallbackMatch[1]);
  }
  return 0;
}

export function guessDescFromText(text: string, type: TxType): string {
  // "Pizza para Maria" / "Presente de Maria" — o nome vem DEPOIS de "de"/"para".
  const depois = text.match(/(?:de|para)\s+([A-ZÀ-Úa-zà-ú0-9 .]{3,40})/);
  if (depois) {
    const name = depois[1].replace(/\s+em\s+.*$/i, '').trim();
    if (name) return name;
  }
  // "Merenda de R$ 38,00" / "Mercado de 120 reais" — o item vem ANTES de "de <valor>".
  const antes = text.match(/^([A-ZÀ-Úa-zà-ú0-9 .]{3,40}?)\s+de\s+(?:r\$|\d)/i);
  if (antes) {
    const name = antes[1].trim();
    if (name) return name;
  }
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

/* ── Roteamento de notificações bancárias ──────────────────────────────────
 *
 * Etapa 5 do "Plano Mestre de Execução": dado o pacote Android de origem e o
 * texto de uma notificação bancária, decidir automaticamente pra qual aba
 * ela pertence (Crédito, Débito e Pix, ou baixa de Boleto).
 *
 * Isto é só a CLASSIFICAÇÃO — texto e pacote entram, um veredito determinístico
 * sai. A captura de verdade das notificações do sistema (NotificationListenerService
 * no Android) é um módulo nativo à parte, que não existe neste arquivo: não dá
 * pra escrever nem testar código nativo sem um build de desenvolvimento (não
 * funciona no Expo Go, e não há como validar aqui sem instalar esse build no
 * aparelho). Quando esse listener existir, o texto e o pacote que ele captura
 * alimentam exatamente esta função.
 */

export type DestinoNotificacao = 'credito' | 'debito_pix' | 'boleto';

export type NotificacaoBancariaClassificada = {
  banco: BankInfo;
  destino: DestinoNotificacao;
  type: TxType;
  amount: number;
  description: string;
  category: string;
  color: string;
};

/** Identifica o banco pelo pacote Android de origem — mais confiável que adivinhar pelo texto, já que não depende de como cada banco escreve a notificação. */
export function identificarBancoPorPacote(packageName: string): BankInfo {
  return BANKS.find((b) => b.packageNames?.includes(packageName)) ?? BANKS.find((b) => b.id === 'outro')!;
}

/* Ordem importa: boleto e crédito são checados antes do fallback de
   débito/pix, que é deliberadamente o destino "pega tudo" — é o tipo de
   movimentação bancária mais comum, e a maioria dos textos de notificação
   não vai conter nenhuma destas palavras-chave explicitamente. */
const PALAVRAS_BOLETO = ['boleto', 'conta paga', 'pagamento efetuado', 'fatura paga', 'conta de consumo', 'código de barras'];
const PALAVRAS_CREDITO = ['cartão de crédito', 'crédito aprovada', 'compra aprovada', 'fatura', 'parcelado', 'parcela'];

export function classificarDestinoNotificacao(texto: string): DestinoNotificacao {
  const lower = texto.toLowerCase();
  if (PALAVRAS_BOLETO.some((p) => lower.includes(p))) return 'boleto';
  if (PALAVRAS_CREDITO.some((p) => lower.includes(p))) return 'credito';
  return 'debito_pix';
}

/**
 * Classifica uma notificação bancária inteira: banco de origem, destino
 * (Crédito / Débito e Pix / Boleto), tipo, valor, descrição e categoria
 * sugerida — pronta pra virar um lançamento de rascunho. Reaproveita os
 * mesmos heurísticos já usados no colar de comprovante (guessTypeFromText /
 * guessAmountFromText / guessDescFromText / guessCategoryFromText): o texto
 * de uma notificação bancária tem a mesma natureza de "chute sobre dado
 * sujo" que um comprovante colado à mão.
 */
export function classificarNotificacaoBancaria(
  packageName: string,
  titulo: string,
  corpo: string
): NotificacaoBancariaClassificada {
  const texto = `${titulo} ${corpo}`;
  const banco = identificarBancoPorPacote(packageName);
  const destino = classificarDestinoNotificacao(texto);
  const type = guessTypeFromText(texto);
  const amount = guessAmountFromText(texto);
  const description = guessDescFromText(texto, type);
  const categoria = guessCategoryFromText(texto);

  return { banco, destino, type, amount, description, category: categoria.name, color: categoria.color };
}
