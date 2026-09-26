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

/** Valor no formato brasileiro: `45,90`, `1.234,56`. Exige duas casas. */
const VALOR = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/g;

/** Rótulos que dizem "este é o total a pagar". */
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
  const m = linha.trim().match(/^(?:R\s*[S$5]\s*)?(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})$/i);
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

  for (const rotulo of [ROTULO_FORTE, ROTULO_FRACO]) {
    const distintos = [...new Set(candidatosDoRotulo(linhas, rotulo))];
    if (distintos.length === 1) return { valorTotal: distintos[0], motivo: 'ok' };
    if (distintos.length > 1) return { valorTotal: null, motivo: 'ambiguo' };
  }
  return { valorTotal: null, motivo: 'sem_total' };
}
