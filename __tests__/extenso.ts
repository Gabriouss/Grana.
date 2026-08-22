/* Número -> por extenso. O inverso do que o parser faz.
 *
 * Mora num arquivo só porque três corpora precisam dele, e uma cópia por
 * corpus é exatamente o tipo de duplicação que já custou caro neste projeto
 * (ver __tests__/sync-parser.js).
 */

export const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
export const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
export const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

export function porExtenso(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10;
    return u === 0 ? DEZENAS[d] : `${DEZENAS[d]} e ${UNIDADES[u]}`;
  }
  if (n === 100) return 'cem';
  if (n < 1000) {
    const c = Math.floor(n / 100), r = n % 100;
    return r === 0 ? CENTENAS[c] : `${CENTENAS[c]} e ${porExtenso(r)}`;
  }
  const m = Math.floor(n / 1000), r = n % 1000;
  const parteMil = m === 1 ? 'mil' : `${porExtenso(m)} mil`;
  return r === 0 ? parteMil : `${parteMil} e ${porExtenso(r)}`;
}

/* Valor de cada palavra, pra saber se uma sequência falada é UM numeral ou
   DOIS números (reais e centavos). Numeral composto em português só decresce:
   "cento e vinte e cinco" é 125, mas "onze e setenta e nove" não existe como
   numeral — é preço. */
const VALOR_DA_PALAVRA: Record<string, number> = { cem: 100, mil: 1000 };
UNIDADES.forEach((p, i) => { VALOR_DA_PALAVRA[p] = i; });
DEZENAS.forEach((p, i) => { if (p) VALOR_DA_PALAVRA[p] = i * 10; });
CENTENAS.forEach((p, i) => { if (p) VALOR_DA_PALAVRA[p] = i * 100; });

export function valoresDe(extenso: string): number[] {
  return extenso.split(/\s+/).filter((p) => p !== 'e').map((p) => VALOR_DA_PALAVRA[p]);
}

/* Espelha `podeContinuarNumeral` do parser: cada ordem tem um teto para o que
   pode vir depois dela, e 1 a 19 não recebem nada — "dez e cinco" não é 15,
   porque 15 se diz "quinze". */
function podeContinuarNumeral(anterior: number, proximo: number): boolean {
  if (anterior >= 1000) return proximo < 1000;
  if (anterior >= 100) return proximo < 100;
  if (anterior >= 20) return proximo < 10;
  return false;
}

/** A fala "X e Y" se parte em dois números? Só quando Y não pode continuar X. */
export function quebraEmDois(inteiro: number, centavos: number): boolean {
  const dosReais = valoresDe(porExtenso(inteiro));
  const dosCentavos = valoresDe(porExtenso(centavos));
  return !podeContinuarNumeral(dosReais[dosReais.length - 1], dosCentavos[0]);
}

/**
 * Reescreve uma frase escrita como ela sairia de uma transcrição de áudio.
 *
 * O Whisper devolve fala: sem pontuação de valor, sem "R$", e com o número
 * por extenso quando foi dito por extenso. Passar o MESMO caso pelas duas
 * formas prova que o bot entende a frase falada tão bem quanto a digitada —
 * que é onde os erros deste app doem mais.
 *
 * O que não dá pra simular aqui é o Whisper errando (colar centavos, trocar
 * palavra). Isso é tratado em outro lugar: leituraAlternativaDeAudio, no
 * webhook, levanta a dúvida quando o número chega grudado.
 */
export function comoAudio(texto: string): string {
  return texto
    .toLowerCase()
    // "R$ 39,90" e "39,90" viram "trinta e nove e noventa"
    .replace(/r\$\s*/g, '')
    .replace(/(\d+),(\d{2})/g, (_m, i, c) => {
      const centavos = parseInt(c, 10);
      const inteiro = parseInt(i, 10);
      if (centavos === 0) return porExtenso(inteiro);
      return `${porExtenso(inteiro)} e ${porExtenso(centavos)}`;
    })
    /* Inteiro solto vira extenso — menos quando é parcela ("3x", "3 vezes"),
       que em fala continua sendo dita como número junto do "x". */
    .replace(/(?<![\d,.])(\d+)(?![\d,.]|\s*x\b|\s*vezes\b|\s*parcelas?\b|\/)/g, (_m, n) => porExtenso(parseInt(n, 10)))
    // Fala não tem vírgula nem ponto final.
    .replace(/[.,;!?]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
