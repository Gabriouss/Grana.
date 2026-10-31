/**
 * Valor total de uma nota fiscal a partir do TEXTO reconhecido numa foto.
 *
 * O reconhecimento (ML Kit, no aparelho) devolve texto cru: linhas fora de
 * ordem, "R$" lido como "RS", rótulo numa linha e valor na seguinte. Este
 * módulo só decide qual número daquele texto é o total pago, e não sabe nada
 * de câmera nem de React Native, por isso roda em node puro nos testes.
 *
 * Regra de ouro: prefiro devolver `null` a um
 * número errado num app de dinheiro. Sem rótulo de total reconhecível, ou com
 * dois totais diferentes no mesmo nível de confiança, o valor volta vazio e a
 * tela pede que a pessoa digite o que está impresso no cupom. Nunca se chuta
 * "o maior valor da nota".
 */

export type MotivoSemTotal = 'sem_total' | 'ambiguo';

export type TotalDaFoto =
  | { valorTotal: number; motivo: 'ok' }
  | { valorTotal: null; motivo: MotivoSemTotal };

/**
 * Valor no formato brasileiro: `45,90`, `1.234,56`. Exige duas casas. Aceita
 * um espaço em volta da vírgula: o ML Kit leu o total em negrito de um cupom
 * como "21, 35" no emulador (26/09/2026), e sem isto a nota voltava sem total.
 */
const VALOR = /(\d{1,3}(?:\.\d{3})+|\d+) ?, ?(\d{2})(?!\d)/g;

/**
 * O que a pessoa de fato pagou: vem depois do desconto e da taxa. Num cupom
 * com desconto, "VALOR TOTAL" é o bruto e "VALOR A PAGAR" é o que saiu do
 * bolso; os dois no mesmo nível deixavam a nota "ambígua" e o campo em branco.
 */
const ROTULO_A_PAGAR = /\b(TOTAL\s+A\s+PAGAR|VALOR\s+A\s+PAGAR|TOTAL\s+LIQUIDO|VALOR\s+LIQUIDO)\b/;
/** Rótulos que dizem "este é o total da nota". */
const ROTULO_FORTE = /\b(VALOR\s+TOTAL|TOTAL\s+A\s+PAGAR|VALOR\s+A\s+PAGAR|TOTAL\s+GERAL|TOTAL\s+R\s*[S$5])\b/;
/** Só "TOTAL". Vale menos: aparece também em rodapés de tributos e de itens. */
const ROTULO_FRACO = /\bTOTAL\b/;
/**
 * A linha da forma de pagamento com o valor ao lado ("Cartao de Credito
 * 29,97"): último recurso quando o rótulo do total ficou sem número na foto.
 * Só com o valor na MESMA linha; dois valores diferentes (parte no Pix, parte
 * no cartão) deixam o campo vazio.
 */
const ROTULO_PAGAMENTO = /\bCARTAO\s+(?:DE\s+)?(?:CREDITO|DEBITO)\b|^\s*(?:CREDITO|DEBITO|PIX|DINHEIRO)\b/;
/** Linhas que têm a palavra total, mas falam de outra coisa. */
const NAO_E_O_TOTAL = /SUBTOTAL|SUB\s+TOTAL|TROCO|DESCONTO|ACRESCIMO|TRIBUT|IMPOSTO|ITENS|QTD|QUANTIDADE|PAGO|RECEBIDO|APROXIMAD|DESCRICAO|CODIGO|VL\.?\s*UNIT|UNIT\b/;

function paraNumero(inteiro: string, centavos: string): number {
  return Number(inteiro.replace(/\./g, '') + '.' + centavos);
}

function valoresDaLinha(linha: string): number[] {
  return [...linha.matchAll(VALOR)].map((m) => paraNumero(m[1], m[2]));
}

/** Maiúsculas, sem acento, com o zero que o OCR trocou por "O" no rótulo. */
function normalizarRotulo(linha: string): string {
  return linha
    .replace(VALOR, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/0/g, 'O')
    // "TOTAL" em negrito e espaçado ("T O T A L"), ou com o "T" lido como "I" ou "1".
    .replace(/\b[TI1] ?O ?T ?A ?L\b/g, 'TOTAL')
    // "VALORTOTAL" colado, quando o OCR perde o espaço do rótulo espaçado.
    .replace(/\bVALORTOTAL\b/g, 'VALOR TOTAL');
}

/**
 * Casas decimais com ponto ("7.49"), que o OCR devolve no lugar da vírgula
 * quando o total vem em negrito e espaçado (cupom de 26/09/2026, visto no
 * vídeo do autor em 01/10). Só vira vírgula o ponto com exatamente dois
 * dígitos depois e nada de número, ponto ou barra em volta: "1.234,56",
 * "26.09.26" e "12.741/2012" ficam como estão.
 */
function pontoDecimalParaVirgula(linha: string): string {
  return linha.replace(/(?<![\d.,])(\d+) ?\. ?(\d{2})(?![\d.,/])/g, '$1,$2');
}

/** Linha que é só um valor, com ou sem "R$": onde o OCR deixa o número quando separa rótulo e valor. */
function soUmValor(linha: string): number | null {
  const m = linha.trim().match(/^(?:R\s*[S$5]\s*)?(\d{1,3}(?:\.\d{3})+|\d+) ?, ?(\d{2})$/i);
  return m ? paraNumero(m[1], m[2]) : null;
}

function candidatosDoRotulo(linhas: string[], rotulo: RegExp): number[] {
  const achados: number[] = [];
  linhas.forEach((linha, i) => {
    const texto = normalizarRotulo(linha);
    if (!rotulo.test(texto) || NAO_E_O_TOTAL.test(texto)) return;
    const naLinha = valoresDaLinha(linha);
    if (naLinha.length > 0) {
      achados.push(...naLinha);
      return;
    }
    const seguinte = i + 1 < linhas.length ? soUmValor(linhas[i + 1]) : null;
    if (seguinte !== null) achados.push(seguinte);
  });
  return achados.filter((v) => v > 0);
}

/** Uma linha como o ML Kit a devolve: texto e, quase sempre, a caixa dela na foto. */
export type LinhaLida = {
  text: string;
  frame?: { top: number; left: number; height: number; width?: number };
  /** Cantos da linha na foto, a partir do de cima à esquerda, em sentido horário. */
  cornerPoints?: readonly { x: number; y: number }[];
};

/**
 * Foto torta, endireitada pelos cantos de cada linha.
 *
 * Com o cupom inclinado, a caixa reta (`frame`) de uma linha comprida fica
 * bem mais alta que a letra, e linhas de fileiras diferentes passam a dividir
 * a mesma altura: o mesmo cupom do vídeo do autor (17/10/2026) que funcionou
 * numa foto saiu noutra com o nome "Fonte Ibpt Cartao De Credito Iten" e sem
 * total. Aqui a inclinação é a mediana do ângulo das linhas compridas, e cada
 * linha ganha uma caixa no papel desvirado: a altura real da letra, com topo e
 * esquerda girados de volta. Vale para cupom de lado ou de ponta-cabeça. Sem
 * cantos em alguma linha, ou com a foto reta, nada muda.
 */
function endireitar(linhas: LinhaLida[]): LinhaLida[] {
  if (linhas.length === 0 || linhas.some((l) => l.cornerPoints?.length !== 4)) return linhas;
  const angulos = linhas
    .map((l) => {
      const [a, b, , d] = l.cornerPoints!;
      return { ang: Math.atan2(b.y - a.y, b.x - a.x), largura: Math.hypot(b.x - a.x, b.y - a.y), altura: Math.hypot(d.x - a.x, d.y - a.y) };
    })
    .filter((l) => l.altura > 0 && l.largura >= 3 * l.altura)
    .map((l) => l.ang)
    .sort((x, y) => x - y);
  if (angulos.length === 0) return linhas;
  const ang = angulos[Math.floor(angulos.length / 2)];
  if (Math.abs(ang) < (1.5 * Math.PI) / 180) return linhas;
  const cos = Math.cos(-ang);
  const sin = Math.sin(-ang);
  return linhas.map((l) => {
    const cantos = l.cornerPoints!.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
    const xs = cantos.map((c) => c.x);
    const [a, , , d] = l.cornerPoints!;
    const altura = Math.hypot(d.x - a.x, d.y - a.y);
    const centro = cantos.reduce((t, c) => t + c.y, 0) / 4;
    const esquerda = Math.min(...xs);
    return { ...l, frame: { top: centro - altura / 2, left: esquerda, height: altura, width: Math.max(...xs) - esquerda } };
  });
}

/**
 * Texto da foto numa linha por FILEIRA visual, da esquerda para a direita.
 *
 * O ML Kit agrupa o texto em blocos por coluna: num cupom, o rótulo "VALOR
 * TOTAL R$" cai no bloco da esquerda e o "45,90" alinhado à direita cai noutro
 * bloco, muitas linhas depois. Juntar bloco por bloco separa o rótulo do valor,
 * e a nota inteira volta "sem total". Aqui as linhas que dividem a mesma altura
 * na foto viram uma só.
 *
 * Duas linhas estão na mesma fileira quando o centro vertical de uma cai a
 * menos de meia altura (da menor das duas) do centro da fileira. Fileiras
 * vizinhas de um cupom ficam a pelo menos uma altura de linha uma da outra,
 * então não se misturam. Foto torta demais não junta nada: o rótulo continua
 * sem valor e a tela pede o número à mão, nunca um valor errado.
 *
 * Sem caixa em alguma linha, devolve a ordem original.
 */
export function textoPorFileira(linhas: LinhaLida[]): string {
  const validas = endireitar(linhas.filter((l) => l.text.trim()));
  if (validas.some((l) => !l.frame || !(l.frame.height > 0))) return validas.map((l) => l.text).join('\n');

  const centro = (l: LinhaLida) => l.frame!.top + l.frame!.height / 2;
  const fileiras: { centro: number; altura: number; linhas: LinhaLida[] }[] = [];
  for (const linha of [...validas].sort((a, b) => centro(a) - centro(b))) {
    const f = fileiras[fileiras.length - 1];
    if (f && Math.abs(centro(linha) - f.centro) <= Math.min(f.altura, linha.frame!.height) / 2) {
      f.linhas.push(linha);
    } else {
      fileiras.push({ centro: centro(linha), altura: linha.frame!.height, linhas: [linha] });
    }
  }
  const textos = fileiras.map((f) => [...f.linhas].sort((a, b) => a.frame!.left - b.frame!.left).map((l) => l.text).join(' '));
  fileiras.forEach((f, i) => {
    const extra = valorDaFotoInclinada(f.linhas, validas);
    if (extra) textos[i] += ' ' + extra;
  });
  return textos.join('\n');
}

/**
 * Foto inclinada: o lado direito do cupom cai mais baixo que o esquerdo, e o
 * "7.49" do total deixa de dividir a fileira com o "VALOR TOTAL:" (cupom de
 * 26/09/2026: valor uns 18 px abaixo do rótulo, com linhas de 48 px; medido
 * no quadro do vídeo, não na saída do ML Kit). O agrupamento por fileira não
 * junta os dois, e o rótulo ficava sem valor. Aqui, rótulo de total sem valor
 * na própria fileira procura, à direita dele, a linha que é SÓ um valor e a
 * mais próxima na vertical. Só vale se a escolha for clara: dentro de uma
 * altura de linha e bem mais perto que a segunda colocada. Na dúvida devolve
 * nada e o campo fica em branco: melhor vazio do que o número da linha vizinha
 * (o troco, o "Cartao de Credito").
 */
function valorDaFotoInclinada(linhasDaFileira: LinhaLida[], todas: LinhaLida[]): string | null {
  const centro = (l: LinhaLida) => l.frame!.top + l.frame!.height / 2;
  const texto = linhasDaFileira.map((l) => l.text).join(' ');
  if (valoresDaLinha(pontoDecimalParaVirgula(texto)).length > 0) return null;
  const rotulo = linhasDaFileira.find((l) => {
    const t = normalizarRotulo(l.text);
    return (ROTULO_A_PAGAR.test(t) || ROTULO_FORTE.test(t) || ROTULO_FRACO.test(t)) && !NAO_E_O_TOTAL.test(t);
  });
  if (!rotulo) return null;
  const meio = rotulo.frame!.left + (rotulo.frame!.width ?? 0) / 2;
  const candidatos = todas
    .filter((l) => !linhasDaFileira.includes(l) && l.frame!.left > meio && soUmValor(pontoDecimalParaVirgula(l.text.trim())) !== null)
    .map((l) => ({ l, dy: Math.abs(centro(l) - centro(rotulo)) }))
    .sort((a, b) => a.dy - b.dy);
  if (candidatos.length === 0) return null;
  const altura = Math.max(rotulo.frame!.height, candidatos[0].l.frame!.height);
  if (candidatos[0].dy > altura) return null;
  /* Empate com o MESMO número não é dúvida: no cupom de 17/10/2026 o "29.97"
     do total e o da linha "Cartao de Credito", logo abaixo, são o mesmo. */
  const valor = (l: LinhaLida) => soUmValor(pontoDecimalParaVirgula(l.text.trim()));
  if (candidatos.length > 1 && candidatos[1].dy - candidatos[0].dy < altura / 2 &&
      valor(candidatos[1].l) !== valor(candidatos[0].l)) return null;
  return candidatos[0].l.text.trim();
}

/**
 * Resumo da leitura SEM o conteúdo da nota, para o log de desenvolvimento: os
 * dígitos viram 9, então "VALOR TOTAL: 7.49" aparece como "VALOR TOTAL: 9.99".
 * Mostra o que decide o resultado (formato do decimal, se rótulo e valor ficaram
 * na mesma linha, se havia caixas) sem expor loja, itens nem valores. Só as
 * linhas que falam de total entram, com a seguinte.
 */
export function diagnosticoDaLeitura(texto: string, total: TotalDaFoto, comCaixas: boolean): string {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const mascara = (l: string) => l.replace(/\d/g, '9').slice(0, 60);
  const marcadas: string[] = [];
  linhas.forEach((l, i) => {
    if (/TOTAL|PAGAR|LIQUIDO/.test(normalizarRotulo(l))) {
      marcadas.push(`#${i + 1} "${mascara(l)}"` + (i + 1 < linhas.length ? ` -> "${mascara(linhas[i + 1])}"` : ''));
    }
  });
  return `linhas=${linhas.length} caixas=${comCaixas} resultado=${total.motivo} rotulos=[${marcadas.join(' | ')}]`;
}

export function extrairTotalDaFoto(texto: string): TotalDaFoto {
  const linhas = texto.split(/\r?\n/).map((l) => pontoDecimalParaVirgula(l.trim())).filter(Boolean);

  for (const rotulo of [ROTULO_A_PAGAR, ROTULO_FORTE, ROTULO_FRACO]) {
    const distintos = [...new Set(candidatosDoRotulo(linhas, rotulo))];
    if (distintos.length === 1) return { valorTotal: distintos[0], motivo: 'ok' };
    if (distintos.length > 1) return { valorTotal: null, motivo: 'ambiguo' };
  }
  const pagos = [...new Set(linhas.flatMap((linha) => {
    const t = normalizarRotulo(linha);
    return ROTULO_PAGAMENTO.test(t) && !NAO_E_O_TOTAL.test(t) ? valoresDaLinha(linha).filter((v) => v > 0) : [];
  }))];
  if (pagos.length === 1) return { valorTotal: pagos[0], motivo: 'ok' };
  if (pagos.length > 1) return { valorTotal: null, motivo: 'ambiguo' };
  return { valorTotal: null, motivo: 'sem_total' };
}

/* ───────────────────── Detalhes da nota: pagamento, data, loja ───────────── */

export type FormaPagamentoDaFoto = 'credit' | 'debit' | 'pix' | 'cash';

export type DetalhesDaNota = {
  /** `null` quando a nota não diz, diz "Outros"/"Cartão", ou diz duas formas diferentes. */
  pagamento: FormaPagamentoDaFoto | null;
  /** Data de emissão em ISO, só se for plausível (até hoje, no máximo um ano atrás). */
  data: string | null;
  /** O cupom tinha uma data, mas ela era futura, impossível ou antiga demais: a tela usa hoje e pede conferência. */
  dataRecusada: boolean;
  /** Nome do estabelecimento, legível, ou `null`. */
  estabelecimento: string | null;
};

/** Maiúsculas, sem acento, com os dígitos que o OCR põe no lugar de letras dentro das palavras. */
function normalizarTexto(linha: string): string {
  return linha
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/(?<=[A-Z])0|0(?=[A-Z])/g, 'O')
    .replace(/(?<=[A-Z])1|1(?=[A-Z])/g, 'I');
}

/** Onde começa a região de pagamento de uma NFC-e. */
const CABECALHO_PAGAMENTO = /FORMAS?\s+(DE\s+)?PAGAMENTO|FORMA\s+PAGTO|VALOR\s+PAGO/;
/** Onde ela acaba: o que vem depois dos pagamentos no DANFE. */
const FIM_PAGAMENTO = /TROCO|TRIBUT|IMPOSTO|ICMS|\bLEI\b|CONSUMIDOR|\bCPF\b|CNPJ|CHAVE|PROTOCOLO|EMISS|CONSULT|\bNFC|SERIE/;
/** Linha de pagamento que não diz qual forma foi. */
const FORMA_INDEFINIDA = /\bOUTROS?\b|\bVALE\b|\bCREDIARIO\b|\bCHEQUE\b|\bBOLETO\b|\bCARTAO\b/;

function formaDaLinha(linha: string): FormaPagamentoDaFoto | 'indefinida' | null {
  const t = linha.replace(VALOR, ' ');
  if (/\bCREDITO\b/.test(t)) return 'credit';
  if (/\bDEBITO\b/.test(t)) return 'debit';
  if (/\bPIX\b|PAGAMENTO\s+INSTANTANEO/.test(t)) return 'pix';
  if (/\bDINHEIRO\b|\bESPECIE\b/.test(t)) return 'cash';
  if (FORMA_INDEFINIDA.test(t)) return 'indefinida';
  return null;
}

/**
 * Forma de pagamento, lida SÓ da região de pagamento do cupom: as linhas
 * depois de "FORMA DE PAGAMENTO" (ou "VALOR PAGO"), até o troco, os tributos
 * ou o rodapé. "Crédito" fora dali (crédito de ICMS, tributos, "crédito" no
 * nome da loja) não conta. Sem cabeçalho, sem forma, com "Outros" ou só
 * "Cartão", ou com duas formas diferentes, devolve `null`: a pessoa escolhe,
 * porque crédito e débito mudam o saldo de jeitos diferentes (regra 20).
 */
function pagamentoDaNota(linhas: string[]): FormaPagamentoDaFoto | null {
  const inicio = linhas.findIndex((l) => CABECALHO_PAGAMENTO.test(l));
  if (inicio < 0) return null;
  const formas = new Set<FormaPagamentoDaFoto | 'indefinida'>();
  // A própria linha do cabeçalho pode trazer a forma ("FORMA DE PAGAMENTO: PIX").
  const naLinha = formaDaLinha(linhas[inicio].replace(CABECALHO_PAGAMENTO, ' '));
  if (naLinha) formas.add(naLinha);
  for (const linha of linhas.slice(inicio + 1, inicio + 7)) {
    if (FIM_PAGAMENTO.test(linha)) break;
    const forma = formaDaLinha(linha);
    if (forma) formas.add(forma);
  }
  if (formas.size !== 1 || formas.has('indefinida')) return null;
  return [...formas][0] as FormaPagamentoDaFoto;
}

function isoValido(dia: number, mes: number, ano: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Data de emissão. Prefere a linha que diz "EMISSÃO"; sem ela, a primeira data
 * do cupom. Data impossível, futura ou de mais de um ano atrás é recusada: um
 * "2062" lido de "2026" jogaria a compra num mês que a pessoa nunca vai abrir.
 */
function dataDaNota(linhas: string[], hojeISO: string): { data: string | null; recusada: boolean } {
  const DATA = /(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})(?!\d)/;
  const comEmissao = linhas.find((l) => /EMISS/.test(l) && DATA.test(l));
  const linha = comEmissao ?? linhas.find((l) => DATA.test(l));
  if (!linha) return { data: null, recusada: false };
  const m = linha.match(DATA)!;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return dentroDoPrazo(isoValido(Number(m[1]), Number(m[2]), ano), hojeISO);
}

/** Data impossível, futura ou de mais de um ano atrás é recusada. */
function dentroDoPrazo(iso: string | null, hojeISO: string): { data: string | null; recusada: boolean } {
  if (!iso) return { data: null, recusada: true };
  const [ah, mh, dh] = hojeISO.split('-').map(Number);
  const umAnoAtras = isoValido(dh, mh, ah - 1) ?? `${ah - 1}-${String(mh).padStart(2, '0')}-28`;
  if (iso > hojeISO || iso < umAnoAtras) return { data: null, recusada: true };
  return { data: iso, recusada: false };
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const HORA_DO_TEXTO = '\\s*,?\\s*(?:[àa]s\\s+)?\\d{1,2}(?::\\d{2}(?::\\d{2})?|h\\d{2})';
/**
 * `dd/mm` sem ano no texto colado (decisão de 30/10/2026). Sozinho ele tem a
 * mesma forma de parcela ("TV 03/12"), então só é data com sinal: "em", "dia",
 * "no dia" ou "data" antes, ou a hora depois. Na dúvida fica como parcela e não
 * se inventa data. O contexto de prazo/parcela é conferido em uma função só,
 * compartilhada com a limpeza do texto: hora e pontuação não mudam o rótulo.
 */
const DATA_SEM_ANO = new RegExp(
  '(?<![\\p{L}\\d/.,-])' +
    `(?:(?:em|no\\s+dia|dia|data)\\s*:?\\s+(\\d{1,2})/(\\d{1,2})(?![ \\t]*parc)(?:${HORA_DO_TEXTO})?|(\\d{1,2})/(\\d{1,2})(?![ \\t]*parc)${HORA_DO_TEXTO})` +
    '(?![\\p{L}\\d/:-]|[.,]\\d)',
  'iu',
);

const ROTULO_SEM_DATA_DE_PAGAMENTO = /\b(?:(?:parc|venc|valid|expir|agend|previs|fechamento|prazo|limite)\p{L}*|fecha|proximo\s+pagamento|pagar)\b/giu;
const LIGACAO_DO_ROTULO = /^(?:[\s\p{P}]|\b(?:em|no|dia|para|ate|de)\b)*$/iu;
/* "Vencimento do pagamento" e "Validade da compra" qualificam o rótulo: depois de
   preposição, a palavra só abre um campo efetivo em "data do pagamento". */
const PAGAMENTO_DECLARADO = /\b(?:pago|paga|efetuado|realizado)\b|\b(?:data|dia)\s+(?:de|do|da)\s+(?:pagamento|compra)\b|(?<!\b(?:de|do|da|para|pra)\s+)\b(?:pagamento|compra)\b/iu;
const FIM_DO_CONTEXTO_DO_ROTULO = new RegExp(`[\\r\\n;]|[.!?](?:\\s|$)|${PAGAMENTO_DECLARADO.source}|\\b(?:\\d{1,2}\\/\\d{1,2}|\\d{4}-\\d{1,2}-\\d{1,2})\\b`, 'iu');
/** "até" e "para" colados na data apontam para a frente, em qualquer rótulo. */
const APONTA_PARA_A_FRENTE = /\b(?:ate|para|pra)\s*:?\s*$/iu;
/* Sinal de que o trecho fala de um pagamento feito. Débito e crédito ficam de fora
   de propósito: "débito automático em 05/11" ainda vai acontecer. */
const ACONTECEU = new RegExp(`${PAGAMENTO_DECLARADO.source}|\\b(?:pix|pagou|paguei|comprei|comprou|transfer\\p{L}*|enviad\\p{L}*|recebid\\p{L}*)\\b`, 'iu');

/**
 * Candidatos a data do pagamento, e a mesma decisão vale para leitura e limpeza.
 * Qualificações são livres; pagamento, outra data ou fim de trecho encerram o rótulo.
 * Com `hojeISO`, `dd/mm` no futuro só continua se o trecho diz que o pagamento
 * aconteceu: sem isso é quase sempre um prazo, e o recuo ao ano anterior gravaria
 * o gasto um ano antes. Na dúvida fica de fora e a tela usa hoje.
 */
function datasSemAnoDoTexto(texto: string, hojeISO?: string): RegExpExecArray[] {
  return [...texto.matchAll(new RegExp(DATA_SEM_ANO.source, 'giu'))].filter((m) => {
    const antes = texto.slice(0, m.index).normalize('NFD').replace(/\p{M}/gu, '');
    if (APONTA_PARA_A_FRENTE.test(antes)) return false;
    const rotulo = [...antes.matchAll(ROTULO_SEM_DATA_DE_PAGAMENTO)].at(-1);
    if (rotulo) {
      const entre = antes.slice(rotulo.index + rotulo[0].length);
      // Pontuação sem conteúdo ainda liga o rótulo à data ("Vencimento. em 05/11").
      if (LIGACAO_DO_ROTULO.test(entre) || !FIM_DO_CONTEXTO_DO_ROTULO.test(entre)) return false;
    }
    if (!hojeISO) return true;
    const iso = isoValido(Number(m[1] ?? m[3]), Number(m[2] ?? m[4]), Number(hojeISO.slice(0, 4)));
    if (!iso || iso <= hojeISO) return true;
    // Outra data também fecha o trecho: "Pago em 28/10 Conta em 05/11" não prova a segunda.
    const trecho = antes.split(/[\r\n;]|[.!?](?:\s|$)|\b\d{1,2}\/\d{1,2}\b/).at(-1) ?? '';
    return ACONTECEU.test(trecho);
  });
}

/**
 * Do ano corrente; se cair no futuro, do ano anterior. Data impossível, como
 * 31/02 ou 29/02 fora de ano bissexto, é recusada e nunca rola para outro mês.
 */
function dataSemAno(dia: number, mes: number, hojeISO: string): { data: string | null; recusada: boolean } {
  const ano = Number(hojeISO.slice(0, 4));
  const iso = isoValido(dia, mes, ano);
  return dentroDoPrazo(iso && iso > hojeISO ? isoValido(dia, mes, ano - 1) : iso, hojeISO);
}

/**
 * Data de um texto colado (comprovante de Pix, transferência, e-mail de
 * compra). Decisão do autor de 27/09/2026: o Colar comprovante grava na data
 * do texto ("26/09/2026 às 18:42" grava em 26/09), e hoje só quando o texto
 * não trouxer data. As mesmas recusas da foto da nota, com dia/mês de um ou
 * dois dígitos, ISO e mês por extenso, comum em comprovante de banco ("26 SET 2026",
 * "26 de setembro de 2026").
 */
export function dataDoTexto(texto: string, hojeISO: string): { data: string | null; recusada: boolean } {
  // Metadado explícito de versão não é data, mesmo com números válidos.
  // Remover só o token preserva uma data real na mesma linha.
  const linhas = texto.split(/\r?\n/).map((l) => l.toUpperCase()
    .replace(/\bVERS[ÃA]O\s*:?\s*V?\d+(?:\.\d+){2,}\b/g, ' '));
  /* O parser da foto continua restrito ao formato do cupom. No texto colado,
     a borda antes da data evita ler o fim de um ano ISO como DD/MM/AA. */
  const DATA_TEXTO = /(?:^|[^\d])(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2}))(?!\d)/;
  const comEmissao = linhas.find((l) => /EMISS/.test(l) && DATA_TEXTO.test(l));
  const linha = comEmissao ?? linhas.find((l) => DATA_TEXTO.test(l));
  if (linha) {
    const m = linha.match(DATA_TEXTO)!;
    const ano = m[1] ? Number(m[1]) : m[6].length === 2 ? 2000 + Number(m[6]) : Number(m[6]);
    const mes = Number(m[2] ?? m[5]);
    const dia = Number(m[3] ?? m[4]);
    return dentroDoPrazo(isoValido(dia, mes, ano), hojeISO);
  }
  const m = texto.match(/\b(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s+(?:de\s+)?(\d{4})\b/i);
  if (m) return dentroDoPrazo(isoValido(Number(m[1]), MESES[m[2].toLowerCase()], Number(m[3])), hojeISO);
  const semAno = datasSemAnoDoTexto(texto, hojeISO)[0];
  if (!semAno) return { data: null, recusada: false };
  return dataSemAno(Number(semAno[1] ?? semAno[3]), Number(semAno[2] ?? semAno[4]), hojeISO);
}

/**
 * O texto colado sem as datas que `dataDoTexto` sabe ler (achado do P2,
 * 30/09/2026): "Pix recebido em 29/09/2026 R$ 500,00" virava a descrição
 * "Pix recebido em / /", porque a leitura da descrição tira os dígitos e
 * deixa os separadores. A data continua lida do texto ORIGINAL; isto só
 * limpa o que vai para valor e descrição.
 *
 * Só sai o trecho INTEIRO, com limites dos dois lados, nos mesmos formatos
 * de `dataDoTexto` (ISO com hora, `d/m/aaaa`, "26 de setembro de 2026"),
 * junto com o conectivo e a hora ligados a ele ("em", "dia", "às 18:42").
 * Formato que não casa inteiro fica inteiro: ISO com sufixo estranho,
 * `dd/mm` sem sinal de data (`DATA_SEM_ANO`), número dentro de sequência
 * maior. Parcela ("parcela 2/12") e valor ("1.250,50") nunca casam.
 */
export function semDatasDoTexto(texto: string, hojeISO?: string): string {
  const MES = '(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\\.?';
  const ISO = '\\d{4}-\\d{1,2}-\\d{1,2}(?:T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?)?';
  const DMA = '\\d{1,2}[/.-]\\d{1,2}[/.-](?:\\d{4}|\\d{2})';
  const EXTENSO = `\\d{1,2}\\s+(?:de\\s+)?${MES}\\s+(?:de\\s+)?\\d{4}`;
  const CONECTIVO = '(?:(?:em|no\\s+dia|dia|de|data)\\s*:?\\s+)?';
  const HORA = '(?:\\s*,?\\s*(?:[àa]s\\s+)?\\d{1,2}(?::\\d{2}(?::\\d{2})?|h\\d{2}))?';
  const DATA = new RegExp(
    `(?<![\\p{L}\\d/.,-])(?<!parc\\p{L}*\\s*)${CONECTIVO}(?:${ISO}|${DMA}|${EXTENSO})${HORA}(?![\\p{L}\\d/:-]|[.,]\\d)`,
    'giu',
  );
  const semAno = datasSemAnoDoTexto(texto, hojeISO).reduceRight(
    (limpo, m) => limpo.slice(0, m.index) + ' ' + limpo.slice(m.index + m[0].length), texto,
  );
  return semAno.replace(DATA, ' ').replace(/[ \t]+([.,;])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '');
}

/** Linhas do topo que não são o nome da loja. */
const NAO_E_NOME = /CNPJ|\bCPF\b|\bIE\b|INSCR|\bRUA\b|\bR\.\s|\bAV\b|AVENIDA|RODOVIA|\bROD\b|ESTRADA|\bCEP\b|BAIRRO|\bFONE\b|\bTEL\b|DOCUMENTO|AUXILIAR|\bNFC|NOTA\s+FISCAL|CUPOM|EXTRATO|DANFE|CONSUMIDOR|ELETRONICA|\bSAT\b/;
const SUFIXO_SOCIETARIO = /\s+(LTDA|EIRELI|EPP|ME|MEI|S\/A|SA|S\.A|CIA)\.?$/;
/* Palavras que ficam em maiúsculas depois de arrumar a caixa. */
const SIGLAS = new Set(['AUDIT', 'BR', 'GNV']);

/** Rodapé, pagamento e tabela de itens: nunca o nome da loja, mesmo quando a foto os põe no topo. */
const RODAPE = /FONTE|IBPT|\bLEI\b|TRIBUT|IMPOSTO|ICMS|CARTAO\s+(?:DE\s+)?(?:CREDITO|DEBITO)|^(?:CREDITO|DEBITO|PIX|DINHEIRO)\b[\s\d.,R$:]*$|\bITE[MN]S?\b|\bQTD|DESCRICAO|CODIGO|VALOR|TROCO|\bPAGO\b|CHAVE|ACESSO|PROTOCOLO|EMISSAO|CONSULT|\bSERIE\b|\bVEND|\bOPER/;

/**
 * Nome do estabelecimento, achado pelo lugar e não pela ordem das linhas.
 *
 * Numa NFC-e o nome fica logo ACIMA do CNPJ (nome fantasia e razão social).
 * Com CNPJ lido, o nome é procurado nas linhas antes dele; sem CNPJ, nas
 * primeiras do texto. Nunca vem de rodapé, pagamento ou cabeçalho de itens
 * (`RODAPE`). Vence o primeiro candidato que parece nome, com duas palavras ou
 * seis letras; ruído curto do OCR ("Hift", no cupom do autor de 17/10/2026)
 * só vale se não houver outro. Sai sem sufixo societário, com a caixa
 * arrumada e encurtada na palavra.
 */
function estabelecimentoDaNota(originais: string[]): string | null {
  const normais = originais.map((o) => normalizarTexto(o).trim());
  const cnpj = normais.findIndex((t) => /CNPJ/.test(t));
  const topo = cnpj > 0 ? normais.slice(Math.max(0, cnpj - 6), cnpj) : normais.slice(0, 5);
  const candidatos: string[] = [];
  for (const t of topo) {
    // Sem CNPJ, o nome fica acima dos itens: a primeira linha com dinheiro ou total encerra o topo.
    if (cnpj <= 0 && (new RegExp(VALOR.source).test(t) || /\bTOTAL\b/.test(t))) break;
    if (!t || NAO_E_NOME.test(t) || RODAPE.test(t) || /TOTAL/.test(t)) continue;
    const letras = (t.match(/[A-Z]/g) ?? []).length;
    const digitos = (t.match(/\d/g) ?? []).length;
    if (letras < 3 || digitos > letras / 2) continue;
    let nome = t.replace(/[^A-Z0-9&'\s.-]/g, ' ').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3; i++) nome = nome.replace(SUFIXO_SOCIETARIO, '').trim();
    if (nome.length >= 3) candidatos.push(nome);
  }
  const pareceNome = (n: string) =>
    n.split(' ').filter((p) => /[A-Z]{2}/.test(p)).length >= 2 || (n.match(/[A-Z]/g) ?? []).length >= 6;
  const nome = candidatos.find(pareceNome) ?? candidatos[0];
  if (nome) {
    const arrumado = nome
      .split(' ')
      .map((p) => (SIGLAS.has(p) ? p : p.charAt(0) + p.slice(1).toLowerCase()))
      .join(' ');
    if (arrumado.length <= 40) return arrumado;
    const corte = arrumado.slice(0, 40);
    const espaco = corte.lastIndexOf(' ');
    return (espaco > 10 ? corte.slice(0, espaco) : corte).trim();
  }
  return null;
}

/**
 * O resto do que a tela de confirmação precisa, além do total: forma de
 * pagamento, data e estabelecimento. Recebe o texto JÁ em fileiras
 * (`textoPorFileira`) e a data de hoje em ISO, para ser pura. Na dúvida, cada
 * campo volta vazio e a pessoa preenche: nada aqui é adivinhado.
 */
export function extrairDetalhesDaNota(texto: string, hojeISO: string): DetalhesDaNota {
  const originais = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const linhas = originais.map(normalizarTexto);
  const { data, recusada } = dataDaNota(linhas, hojeISO);
  return {
    pagamento: pagamentoDaNota(linhas),
    data,
    dataRecusada: recusada,
    estabelecimento: estabelecimentoDaNota(originais),
  };
}
