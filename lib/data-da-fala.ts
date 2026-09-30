/**
 * A data do gasto dita na fala ("ontem", "na sexta", "dia 12", "12/09"),
 * lida no núcleo da voz, igual para o botão do app e para o widget (regra 13;
 * spec `data na voz`, 30/09/2026).
 *
 * Função pura, sem import: fora de `lib/heuristics.ts` de propósito, para não
 * mexer em nenhuma função espelhada no servidor (`__tests__/sync-parser.js`,
 * regra 11). A expressão de data sai do texto ANTES de valor, categoria,
 * parcelas e descrição: "farmácia dia 12 40 reais" não pode virar R$ 12 nem
 * ficar com "dia 12" no nome.
 *
 * Tudo resolve contra a `referencia`: a data CIVIL da captura da fala, e não
 * a hora em que ela é processada. Uma fala guardada sem rede às 23h50 e
 * processada no dia seguinte diz "ontem" em relação ao dia em que foi dita.
 *
 * Nunca grava uma data que ninguém disse: futura, impossível, fora da janela,
 * vaga, em conflito ou com número ambíguo vai para revisão, com a data dita
 * como proposta, e nunca é trocada por hoje em silêncio.
 */

export type RevisaoDaDataDaFala = {
  /** Título da revisão (notificação e tela). Textos do Flare, julgados pelo Meridian. */
  titulo: 'Confirme a data' | 'Qual foi a data?' | 'Confirme a data da compra';
  /** Dica abaixo do campo "Data da compra" na revisão. */
  dica: string | null;
  /** A data que a fala indicou, quando existe e é válida; o campo NÃO a
      pré-seleciona se ela for futura ou vier de referência aproximada. */
  proposta: string | null;
};

export type DataDaFala = {
  /** A data a gravar quando não há revisão; com revisão, a referência. */
  data: string;
  /** O texto sem a expressão de data, para o resto da interpretação. */
  textoSemData: string;
  /** Havia expressão de data na fala. */
  dita: boolean;
  revisao: RevisaoDaDataDaFala | null;
};

export type OpcoesDataDaFala = {
  /** Data civil da captura, `AAAA-MM-DD`. */
  referencia: string;
  /** Referência reconstruída (fala antiga sem a data da captura): expressão
      relativa vai para revisão em vez de ser contada a partir dela. */
  aproximada?: boolean;
};

/**
 * A referência de uma fala, do jeito que ela viaja: da captura para a fila,
 * da fila para a tarefa, e da tarefa para a revisão (notificação, recibo na
 * tela e parâmetros da tela).
 */
export type ReferenciaDaFala = { referencia: string; aproximada: boolean };

/** `AAAA-MM-DD` que existe no calendário. */
export function ehDataISO(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  return valida(y, m, d) === valor;
}

/** A data civil local de um instante (o calendário do aparelho, o mesmo do saldo). */
export function dataLocal(epochMs: number): string {
  const d = new Date(epochMs);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * A referência de uma fala a partir do que ela carrega. `dataCaptura` é a
 * data civil gravada NO INÍCIO da captura, e vale como está, mesmo que o
 * fuso do aparelho tenha mudado depois. Sem ela (fala de antes desta versão,
 * ou órfã sem o arquivo de metadados), a data do `criadoEm` serve de
 * aproximação, marcada como tal. Sem nada, hoje, também aproximada.
 */
export function referenciaDaFala(
  fala: { dataCaptura?: unknown; criadoEm?: unknown; referenciaAproximada?: unknown },
  hojeISO: string,
): ReferenciaDaFala {
  if (ehDataISO(fala.dataCaptura)) return { referencia: fala.dataCaptura, aproximada: fala.referenciaAproximada === true };
  if (typeof fala.criadoEm === 'number' && Number.isFinite(fala.criadoEm) && fala.criadoEm > 0) {
    return { referencia: dataLocal(fala.criadoEm), aproximada: true };
  }
  return { referencia: hojeISO, aproximada: true };
}

/** A referência como parâmetros de rota (strings), e de volta. */
export function referenciaParaParametros(ref: ReferenciaDaFala | undefined): { referencia?: string; aproximada?: string } {
  return ref ? { referencia: ref.referencia, aproximada: ref.aproximada ? '1' : '0' } : {};
}
export function referenciaDosParametros(
  params: { referencia?: unknown; aproximada?: unknown },
  hojeISO: string,
): ReferenciaDaFala {
  return ehDataISO(params.referencia)
    ? { referencia: params.referencia, aproximada: params.aproximada !== '0' }
    : { referencia: hojeISO, aproximada: true };
}

/**
 * O que a tela de revisão de uma fala (Colar/voz e Crédito) usa para abrir
 * o formulário: o texto sem a data, para valor e descrição, e a data do
 * campo. Com revisão, o campo começa VAZIO, e a dica explica, citando a
 * data que a fala indicou (a `proposta`) quando há uma: a pessoa escolhe, e
 * nada é pré-selecionado em silêncio (parecer do Forge, r2 do commit B).
 */
export function dataInicialDaRevisao(texto: string, ref: ReferenciaDaFala): {
  textoSemData: string; data: string | null; dica: string | null; proposta: string | null;
} {
  const lida = dataDaFala(texto, ref);
  return lida.revisao
    ? { textoSemData: lida.textoSemData, data: null, dica: lida.revisao.dica, proposta: lida.revisao.proposta }
    : { textoSemData: lida.textoSemData, data: lida.data, dica: null, proposta: null };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Mesmo mapa de `parseDiaVencimento` (lib/heuristics.ts). Não é importado de
    lá porque a função é espelhada no servidor; o teste
    `__tests__/voz-data-da-fala.cjs` exige que os dois sejam iguais. */
const palavras: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
};
const NUMERAIS = Object.keys(palavras).sort((a, b) => b.length - a.length).join('|');
const NUMERO = `(?:\\d{1,4}|(?:${NUMERAIS})(?:\\s+e\\s+(?:${NUMERAIS}))?)`;
const FIM = '(?![\\p{L}\\d])';

function numero(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  return s.split(/\s+e\s+/).reduce((n, p) => n + (palavras[p] ?? NaN), 0);
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function partes(dataISO: string): [number, number, number] {
  const [y, m, d] = dataISO.split('-').map(Number);
  return [y, m, d];
}
/** Data civil válida (sem 30/02 nem 31/09), ou nula. */
function valida(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return null;
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dias ? iso(y, m, d) : null;
}
/** Soma dias a uma data civil, sem passar por fuso. */
function somarDias(dataISO: string, dias: number): string {
  const [y, m, d] = partes(dataISO);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function diaDaSemana(dataISO: string): number {
  const [y, m, d] = partes(dataISO);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
/** `dd/mm`, ou `dd/mm/aaaa` quando o ano difere do da referência (Flare). */
export function dataCurta(dataISO: string, referenciaISO: string): string {
  const [y, m, d] = partes(dataISO);
  return y === partes(referenciaISO)[0] ? `${pad(d)}/${pad(m)}` : `${pad(d)}/${pad(m)}/${y}`;
}
/** Primeiro dia do mês anterior ao da referência: o começo da janela. */
function inicioDaJanela(referenciaISO: string): string {
  const [y, m] = partes(referenciaISO);
  return m === 1 ? iso(y - 1, 12, 1) : iso(y, m - 1, 1);
}

const SEMANA: [RegExp, number][] = [
  [/^domingo$/, 0], [/^segunda(?:-feira| feira)?$/, 1], [/^ter[çc]a(?:-feira| feira)?$/, 2], [/^quarta(?:-feira| feira)?$/, 3],
  [/^quinta(?:-feira| feira)?$/, 4], [/^sexta(?:-feira| feira)?$/, 5], [/^s[áa]bado$/, 6],
];
const NOME_SEMANA = '(?:domingo|segunda(?:-feira|\\s+feira)?|ter[çc]a(?:-feira|\\s+feira)?|quarta(?:-feira|\\s+feira)?|quinta(?:-feira|\\s+feira)?|sexta(?:-feira|\\s+feira)?|s[áa]bado)';
const numeroDaSemana = (nome: string) => SEMANA.find(([re]) => re.test(nome.replace(/\s+/g, ' ')))?.[1] ?? -1;

/**
 * O pedaço do recibo de sucesso que diz a data do lançamento (textos R1 a
 * R4 do Flare, julgados pelo Meridian). Uma função só, para a tarefa da voz
 * (app e widget) e as telas de revisão. Compara com o mês em que a fala foi
 * PROCESSADA: uma fala de 30/09 processada em 01/10 caiu no mês anterior.
 *
 * - `null` quando a data é hoje: nada a dizer;
 * - caixa no mesmo mês e ano: "em 28/09";
 * - caixa em outro mês: "em 30/09, fica em setembro" (com o ano quando
 *   difere: "em 30/12/2025, fica em dezembro de 2025");
 * - crédito: nunca fala de saldo, porque compra no cartão não entra no
 *   caixa (regra 20); diz a fatura: "em 30/09, fatura de outubro".
 */
export function resumoDaDataDoLancamento(args: {
  dataISO: string;
  hojeISO: string;
  destino: 'caixa' | 'credito';
  /** Mês da fatura (0 = janeiro), só no crédito: `mesFaturaDoLancamento`. */
  fatura?: { year: number; month: number };
}): string | null {
  const { dataISO, hojeISO, destino, fatura } = args;
  if (dataISO === hojeISO) return null;
  const [y, m] = partes(dataISO);
  const [yh, mh] = partes(hojeISO);
  const quando = `em ${dataCurta(dataISO, hojeISO)}`;
  if (destino === 'credito') {
    if (!fatura) return quando;
    return `${quando}, fatura de ${MESES[fatura.month]}${fatura.year !== yh ? ` de ${fatura.year}` : ''}`;
  }
  if (y === yh && m === mh) return quando;
  return `${quando}, fica em ${MESES[m - 1]}${y !== yh ? ` de ${y}` : ''}`;
}

type Achado = {
  inicio: number;
  fim: number;
  /** Data indicada (pode ser futura ou fora da janela), ou nula. */
  data: string | null;
  /** Por que não dá para usar a data sem perguntar. */
  problema: null | 'futura' | 'impossivel' | 'vaga' | 'ambigua' | 'mes_anterior';
  /** Conta a partir da referência (e cai em revisão se ela for aproximada). */
  relativa: boolean;
  /** O que a pessoa disse, para a dica ("12/09", "30/02", "dia 28"). */
  dito: string;
};

/**
 * Lê a data do gasto na fala. Não deve ser chamada para conta a pagar
 * (`ehIntencaoBoleto`): lá a data dita é o vencimento.
 */
export function dataDaFala(texto: string, { referencia, aproximada = false }: OpcoesDataDaFala): DataDaFala {
  const t = texto.toLowerCase();
  const achados: Achado[] = [];
  const livre = (i: number, f: number) => !achados.some((a) => i < a.fim && f > a.inicio);
  const procurar = (re: RegExp, montar: (m: RegExpExecArray) => Omit<Achado, 'inicio' | 'fim'> | null) => {
    for (const m of t.matchAll(new RegExp(re.source, 'gu'))) {
      const inicio = m.index ?? 0;
      const fim = inicio + m[0].length;
      if (!livre(inicio, fim)) continue;
      const a = montar(m as RegExpExecArray);
      // O que foi dito, para a dica ("Você disse ontem. Entendi 29/09.").
      if (a) achados.push({ inicio, fim, ...a, dito: a.dito || m[0].trim() });
    }
  };
  const absoluta = (y: number, m: number, d: number, dito: string): Omit<Achado, 'inicio' | 'fim'> => {
    const data = valida(y, m, d);
    if (!data) return { data: null, problema: 'impossivel', relativa: false, dito };
    return { data, problema: data > referencia ? 'futura' : null, relativa: false, dito };
  };
  const mesDoNome = (nome: string) => MESES.indexOf(nome.replace('marco', 'março')) + 1;

  /* Recorrência ("todo dia 10", "todo mês dia 5") não é data do gasto: o
     trecho é reservado, para "dia 10" não ser lido abaixo, e fica no texto. */
  const reservados: [number, number][] = [];
  for (const m of t.matchAll(new RegExp(`\\btod[oa]s?\\s+(?:o\\s+)?(?:m[êe]s\\s+)?(?:(?:n?o\\s+)?dia\\s+)?${NUMERO}${FIM}`, 'gu'))) {
    reservados.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  const reservado = (i: number, f: number) => reservados.some(([a, b]) => i < b && f > a);

  /* 1. "12 de setembro [de 2026]", "dia 12 de setembro" */
  /* O começo não pode estar colado a uma letra: sem isto, o "o" final de
     "mercado" era lido como "o 12/09" e o nome virava "mercad". */
  procurar(new RegExp(`(?<![\\p{L}\\d])(?:n?o\\s+)?(?:dia\\s+)?(${NUMERO})\\s+de\\s+(${MESES.join('|')}|marco)(?:\\s+de\\s+(\\d{4}))?${FIM}`), (m) => {
    const ano = m[3] ? Number(m[3]) : partes(referencia)[0];
    return absoluta(ano, mesDoNome(m[2]), numero(m[1]), m[3] ? `${pad(numero(m[1]))}/${pad(mesDoNome(m[2]))}/${ano}` : `${pad(numero(m[1]))}/${pad(mesDoNome(m[2]))}`);
  });
  /* 2. "12/09", "12/9", "12/09/2026", "12 do 9" */
  procurar(new RegExp(`(?<![\\p{L}\\d,.])(?:n?o\\s+)?(?:dia\\s+)?(\\d{1,2})\\s*(?:\\/|\\s+do\\s+)\\s*(\\d{1,2})(?:\\/(\\d{2,4}))?(?![\\d,])`), (m) => {
    let ano = m[3] ? Number(m[3]) : partes(referencia)[0];
    if (ano < 100) ano += 2000;
    const dito = m[3] ? `${pad(Number(m[1]))}/${pad(Number(m[2]))}/${ano}` : `${pad(Number(m[1]))}/${pad(Number(m[2]))}`;
    return absoluta(ano, Number(m[2]), Number(m[1]), dito);
  });
  /* 3. Relativas de dia */
  procurar(/\bdepois\s+de\s+amanh[ãa](?![\p{L}\d])/u, () => ({ data: somarDias(referencia, 2), problema: 'futura', relativa: true, dito: '' }));
  procurar(/\bamanh[ãa](?![\p{L}\d])/u, () => ({ data: somarDias(referencia, 1), problema: 'futura', relativa: true, dito: '' }));
  procurar(/\bante-?ontem(?:\s+(?:de\s+manh[ãa]|[àa]\s+tarde|[àa]\s+noite))?(?![\p{L}\d])/u, () => ({ data: somarDias(referencia, -2), problema: null, relativa: true, dito: '' }));
  procurar(/\bontem(?:\s+(?:de\s+manh[ãa]|[àa]\s+tarde|[àa]\s+noite))?(?![\p{L}\d])/u, () => ({ data: somarDias(referencia, -1), problema: null, relativa: true, dito: '' }));
  /* "Hoje" também depende da referência: com ela aproximada (órfã sem a
     data da captura, reconstruída pelo fim do áudio), "hoje" pode ser o dia
     seguinte ao dito, e vai para revisão como as outras (Forge, r2 do B). */
  procurar(/\bhoje(?:\s+(?:cedo|de\s+manh[ãa]|[àa]\s+tarde|[àa]\s+noite))?(?![\p{L}\d])/u, () => ({ data: referencia, problema: null, relativa: true, dito: '' }));
  /* 4. Vagas: não resolvem uma data */
  procurar(/\b(?:(?:na\s+)?semana\s+passada|(?:no\s+)?m[êe]s\s+passado|(?:no\s+|um\s+)?outro\s+dia|(?:n)?esses\s+dias|uns\s+dias\s+atr[áa]s)(?![\p{L}\d])/u, () => ({ data: null, problema: 'vaga', relativa: true, dito: '' }));
  /* 5. Dia da semana (A1): com preposição ou artigo, com "passada"/"última",
     ou sozinho no fim da frase. Solto no meio ("padaria sexta 12 reais",
     "Sexta Feira Bar") fica no nome, que é a pista para corrigir. */
  const semana = (nome: string, estrita: boolean): Omit<Achado, 'inicio' | 'fim'> => {
    const alvo = numeroDaSemana(nome);
    let volta = (diaDaSemana(referencia) - alvo + 7) % 7;
    if (estrita && volta === 0) volta = 7;
    return { data: somarDias(referencia, -volta), problema: null, relativa: true, dito: '' };
  };
  procurar(new RegExp(`(?<![\\p{L}\\d])(?:n[ao]\\s+)?(?:[úu]ltim[ao]\\s+)(${NOME_SEMANA})(?:\\s+passad[ao])?${FIM}`), (m) => semana(m[1], true));
  procurar(new RegExp(`(?<![\\p{L}\\d])(?:n[ao]\\s+)?(${NOME_SEMANA})\\s+passad[ao]${FIM}`), (m) => semana(m[1], true));
  procurar(new RegExp(`(?<![\\p{L}\\d])n[ao]\\s+(${NOME_SEMANA})${FIM}(?!\\s+(?:parcela|vez|via|m[ãa]o)${FIM})`), (m) => semana(m[1], false));
  procurar(new RegExp(`(?:^|\\s)(${NOME_SEMANA})\\s*[.!?]?\\s*$`), (m) => semana(m[1], false));
  /* 6. "dia N", "no dia N", "dia doze" (fora de recorrência) */
  procurar(new RegExp(`(?<![\\p{L}\\d])(?:n?o\\s+)?dia\\s+(${NUMERO})${FIM}`), (m) => {
    const i = m.index ?? 0;
    if (reservado(i, i + m[0].length)) return null;
    const dia = numero(m[1]);
    const dito = `dia ${m[1]}`;
    /* "dia doze cinquenta" chega da normalização do servidor como
       "dia 12,50": o número pode ser o dia e o valor, ou R$ 12,50. Não dá
       para escolher sem perguntar (13c). */
    const colado = /^[,.]\d/.test(t.slice(i + m[0].length));
    if (colado || !Number.isFinite(dia) || dia < 1 || dia > 31) return { data: null, problema: 'ambigua', relativa: true, dito };
    const [y, mes, hoje] = partes(referencia);
    if (dia <= hoje) {
      const data = valida(y, mes, dia);
      return data ? { data, problema: null, relativa: true, dito } : { data: null, problema: 'impossivel', relativa: true, dito };
    }
    const [ya, ma] = mes === 1 ? [y - 1, 12] : [y, mes - 1];
    const data = valida(ya, ma, dia);
    return data ? { data, problema: 'mes_anterior', relativa: true, dito } : { data: null, problema: 'impossivel', relativa: true, dito: `${pad(dia)}/${pad(ma)}` };
  });

  if (!achados.length) return { data: referencia, textoSemData: texto, dita: false, revisao: null };

  /* Tira as expressões do texto (do fim para o começo, para os índices
     valerem) e junta os espaços que sobraram. */
  let textoSemData = texto;
  for (const a of [...achados].sort((x, y) => y.inicio - x.inicio)) {
    textoSemData = textoSemData.slice(0, a.inicio) + ' ' + textoSemData.slice(a.fim);
  }
  textoSemData = textoSemData.replace(/\s+([,.;!?])/g, '$1').replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',');

  const revisar = (titulo: RevisaoDaDataDaFala['titulo'], dica: string | null, proposta: string | null): DataDaFala =>
    ({ data: referencia, textoSemData, dita: true, revisao: { titulo, dica, proposta } });

  const datas = new Set(achados.map((a) => a.data));
  if (achados.length > 1 && (datas.size > 1 || datas.has(null))) {
    return revisar('Qual foi a data?', 'A data da fala não ficou clara. Escolha a data.', null);
  }
  const a = achados[0];
  if (a.problema === 'vaga' || a.problema === 'ambigua') return revisar('Qual foi a data?', 'A data da fala não ficou clara. Escolha a data.', null);
  if (a.problema === 'impossivel') return revisar('Qual foi a data?', a.dito && /\//.test(a.dito) ? `Você disse ${a.dito}, que não existe.` : 'A data da fala não ficou clara. Escolha a data.', null);
  if (a.problema === 'futura') return revisar('Confirme a data', `Você disse ${dataCurta(a.data!, referencia)}, que ainda não chegou.`, a.data);
  /* Referência aproximada: a proposta aparece na dica (modelo C8 do Flare,
     julgado), e o campo continua vazio até a escolha. */
  if (aproximada && a.relativa) return revisar('Confirme a data', `Você disse ${a.dito}. Entendi ${dataCurta(a.data!, referencia)}.`, a.data);
  if (a.data! < inicioDaJanela(referencia)) {
    const inicio = partes(inicioDaJanela(referencia));
    return revisar('Qual foi a data?', `Você disse ${dataCurta(a.data!, referencia)}. Datas antes de ${MESES[inicio[1] - 1]} precisam ser escolhidas aqui.`, a.data);
  }
  if (a.problema === 'mes_anterior') return revisar('Confirme a data', `Você disse ${a.dito}. Entendi ${dataCurta(a.data!, referencia)}.`, a.data);
  return { data: a.data!, textoSemData, dita: true, revisao: null };
}
