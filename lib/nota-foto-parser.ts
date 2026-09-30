/**
 * Valor total de uma nota fiscal a partir do TEXTO reconhecido numa foto.
 *
 * O reconhecimento (ML Kit, no aparelho) devolve texto cru: linhas fora de
 * ordem, "R$" lido como "RS", rótulo numa linha e valor na seguinte. Este
 * módulo só decide qual número daquele texto é o total pago, e não sabe nada
 * de câmera nem de React Native, por isso roda em node puro nos testes.
 *
 * Regra de ouro, a mesma de `nfce-parser.ts`: prefiro devolver `null` a um
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
/** Linhas que têm a palavra total, mas falam de outra coisa. */
const NAO_E_O_TOTAL = /SUBTOTAL|SUB\s+TOTAL|TROCO|DESCONTO|ACRESCIMO|TRIBUT|IMPOSTO|ITENS|QTD|QUANTIDADE|PAGO|RECEBIDO|APROXIMAD/;

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
    .replace(/0/g, 'O');
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
export type LinhaLida = { text: string; frame?: { top: number; left: number; height: number; width?: number } };

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
  const validas = linhas.filter((l) => l.text.trim());
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
  return fileiras
    .map((f) => [...f.linhas].sort((a, b) => a.frame!.left - b.frame!.left).map((l) => l.text).join(' '))
    .join('\n');
}

export function extrairTotalDaFoto(texto: string): TotalDaFoto {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const rotulo of [ROTULO_A_PAGAR, ROTULO_FORTE, ROTULO_FRACO]) {
    const distintos = [...new Set(candidatosDoRotulo(linhas, rotulo))];
    if (distintos.length === 1) return { valorTotal: distintos[0], motivo: 'ok' };
    if (distintos.length > 1) return { valorTotal: null, motivo: 'ambiguo' };
  }
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
  if (!m) return { data: null, recusada: false };
  return dentroDoPrazo(isoValido(Number(m[1]), MESES[m[2].toLowerCase()], Number(m[3])), hojeISO);
}

/** Linhas do topo que não são o nome da loja. */
const NAO_E_NOME = /CNPJ|\bCPF\b|\bIE\b|INSCR|\bRUA\b|\bR\.\s|\bAV\b|AVENIDA|RODOVIA|\bROD\b|ESTRADA|\bCEP\b|BAIRRO|\bFONE\b|\bTEL\b|DOCUMENTO|AUXILIAR|\bNFC|NOTA\s+FISCAL|CUPOM|EXTRATO|DANFE|CONSUMIDOR|ELETRONICA|\bSAT\b/;
const SUFIXO_SOCIETARIO = /\s+(LTDA|EIRELI|EPP|ME|MEI|S\/A|SA|S\.A|CIA)\.?$/;
/* Palavras que ficam em maiúsculas depois de arrumar a caixa. */
const SIGLAS = new Set(['AUDIT', 'BR', 'GNV']);

/**
 * Nome do estabelecimento: a primeira linha do topo do cupom que parece nome
 * (letras, sem CNPJ, sem endereço, sem o título do documento), sem sufixo
 * societário, com a caixa arrumada e encurtada na palavra.
 */
function estabelecimentoDaNota(originais: string[]): string | null {
  for (const original of originais.slice(0, 5)) {
    const t = normalizarTexto(original).trim();
    // O nome fica acima dos itens: a primeira linha com dinheiro ou total encerra o topo.
    if (new RegExp(VALOR.source).test(t) || /TOTAL/.test(t)) break;
    if (!t || NAO_E_NOME.test(t)) continue;
    const letras = (t.match(/[A-Z]/g) ?? []).length;
    const digitos = (t.match(/\d/g) ?? []).length;
    if (letras < 3 || digitos > letras / 2) continue;
    let nome = t.replace(/[^A-Z0-9&'\s.-]/g, ' ').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3; i++) nome = nome.replace(SUFIXO_SOCIETARIO, '').trim();
    if (nome.length < 3) continue;
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
