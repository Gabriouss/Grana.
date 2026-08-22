/* Corpus GERADO por combinação — complementa o corpus-voz.ts escrito à mão.
 *
 * A ideia: em vez de adivinhar frases uma a uma, monta-se cada mensagem a
 * partir de peças (verbo × descrição × forma de dizer o valor × forma de
 * pagamento × dica de categoria). Como o valor é escolhido ANTES de virar
 * texto, o esperado é conhecido por construção — não é chute.
 *
 * Roda: npx tsx __tests__/corpus-gerado.ts
 * Imprime só falhas, agrupadas por assinatura (senão um bug só vira milhares
 * de linhas iguais).
 */
import { guessAmountFromText, guessDescFromText, guessTypeFromText } from '../lib/heuristics';
import { porExtenso } from './extenso';

/* ---------- peças ---------- */
const DESCRICOES = ['mercado', 'almoço', 'uber', 'farmácia', 'netflix', 'monster', 'padaria',
  'gasolina', 'cinema', 'academia', 'lanche', 'café', 'pizza', 'aluguel', 'internet'];

const VERBOS = ['', 'gastei ', 'paguei ', 'comprei ', 'anota aí '];
const PAGAMENTOS = ['', ' no crédito', ' no débito', ' no pix', ' no crédito da c6', ' no cartão do nubank'];
const DICAS = ['', ', alimentação', ' categoria alimentação', ', outros'];

/** Todas as formas de dizer um valor inteiro. */
function formasInteiro(v: number): string[] {
  return [`${v}`, `${v} reais`, `R$ ${v}`, `${porExtenso(v)} reais`, `${porExtenso(v)}`];
}

/** Todas as formas de dizer um valor com centavos. */
function formasDecimal(inteiro: number, centavos: number): string[] {
  const cc = String(centavos).padStart(2, '0');
  return [
    `${inteiro},${cc}`,
    `R$ ${inteiro},${cc}`,
    `${inteiro},${cc} reais`,
    `${inteiro} e ${cc}`,
    `${porExtenso(inteiro)} e ${porExtenso(centavos)}`,
    `${porExtenso(inteiro)} reais e ${porExtenso(centavos)} centavos`,
  ];
}

/* ---------- geração ---------- */
type Falha = { assinatura: string; exemplo: string; obtido: string; esperado: string; qtd: number };
const falhas = new Map<string, Falha>();
let total = 0;

function checa(txt: string, valEsperado: number, descEsperada: string, forma: string) {
  total++;
  const tipo = guessTypeFromText(txt);
  const val = guessAmountFromText(txt);
  const desc = guessDescFromText(txt, tipo);

  if (Math.abs(val - valEsperado) > 0.005) {
    const a = `VALOR|${forma}`;
    const f = falhas.get(a);
    if (f) f.qtd++;
    else falhas.set(a, { assinatura: a, exemplo: txt, obtido: String(val), esperado: String(valEsperado), qtd: 1 });
  }

  const descNorm = desc.toLowerCase();
  if (!descNorm.startsWith(descEsperada.toLowerCase())) {
    const a = `DESC|${forma}`;
    const f = falhas.get(a);
    if (f) f.qtd++;
    else falhas.set(a, { assinatura: a, exemplo: txt, obtido: desc, esperado: `começar com "${descEsperada}"`, qtd: 1 });
  }
}

const VALORES_INTEIROS = [5, 12, 20, 25, 30, 47, 50, 99, 100, 120, 150, 250, 500, 1000, 1500, 2500, 3200];
const VALORES_DECIMAIS: [number, number][] = [
  [5, 50], [6, 90], [10, 50], [11, 79], [15, 90], [25, 30], [39, 90], [49, 90], [120, 50],
];

for (const desc of DESCRICOES) {
  for (const verbo of VERBOS) {
    for (const pag of PAGAMENTOS) {
      for (const dica of DICAS) {
        for (const v of VALORES_INTEIROS) {
          for (const forma of formasInteiro(v)) {
            checa(`${verbo}${desc} ${forma}${pag}${dica}`, v, desc, `inteiro:${forma.replace(/\d+/g, 'N')}`);
          }
        }
        for (const [i, c] of VALORES_DECIMAIS) {
          for (const forma of formasDecimal(i, c)) {
            checa(`${verbo}${desc} ${forma}${pag}${dica}`, i + c / 100, desc,
              `decimal:${forma.replace(/\d+/g, 'N').replace(/\b(?!e\b|reais\b|centavos\b|R\$)[a-zà-ÿ]+/gi, 'X')}`);
          }
        }
      }
    }
  }
}

const ordenadas = [...falhas.values()].sort((a, b) => b.qtd - a.qtd);
for (const f of ordenadas) {
  console.log(`[${f.qtd}x] ${f.assinatura}`);
  console.log(`      ex: "${f.exemplo}"`);
  console.log(`      obtido: ${f.obtido}  |  esperado: ${f.esperado}`);
}

const casosComFalha = ordenadas.reduce((s, f) => s + f.qtd, 0);
console.log(`\n${total - casosComFalha}/${total} passaram — ${casosComFalha} falhas em ${ordenadas.length} padrões distintos`);
