/* Cor de traço (ícone e barra de meta) que se lê sobre o cartão. O ícone fica
   num círculo com 19% da própria cor sobre `paperRaised`, e a barra corre sobre
   `paper`; a cor guardada na meta não muda, só o traço é clareado em direção ao
   sea foam, o mínimo para chegar a 3:1 nos dois fundos (V16, 04/10/2026). */
const PAPER = [0x05, 0x22, 0x29];
const PAPER_RAISED = [0x0b, 0x2d, 0x35];
const SEA_FOAM = [0xef, 0xff, 0xfa];
export const CONTRASTE_MINIMO = 3.05;

function luz(c: number[]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function razaoDeContraste(a: number[], b: number[]): number {
  const x = luz(a);
  const y = luz(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function emHex(c: number[]): string {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function corVisivel(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const circulo = c.map((v, i) => Math.round(v * 0.1875 + PAPER_RAISED[i] * 0.8125));
  for (let k = 0; k <= 20; k++) {
    const t = k * 0.05;
    const a = c.map((v, i) => Math.round(v + (SEA_FOAM[i] - v) * t));
    if (razaoDeContraste(a, circulo) >= CONTRASTE_MINIMO && razaoDeContraste(a, PAPER) >= CONTRASTE_MINIMO) return k === 0 ? hex : emHex(a);
  }
  return emHex(SEA_FOAM);
}
