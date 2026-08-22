/* Corpus de VOZ gerado por combinação — o irmão falado do corpus-gerado.ts.
 *
 * O corpus-gerado varre a mensagem ESCRITA (verbo × descrição × valor ×
 * pagamento × categoria). Aqui o alvo é o que só aparece quando a pessoa
 * FALA e o Whisper transcreve:
 *
 *   A. numeral por extenso — varredura de 1 a 1000 sem pular nenhum, mais
 *      amostras até 250 mil. É a família de bug que já chegou em produção
 *      ("onze e setenta e nove" virando R$ 90,00), então não dá pra testar
 *      por amostragem.
 *   B. reais e centavos falados — todos os 99 centavos contra 25 inteiros.
 *   C. hesitação e muleta de fala ("é...", "então", "né", "beleza").
 *   D. a mesma quantia escrita de todo jeito que o Whisper pode escrever.
 *   E. ordem invertida — valor antes da descrição.
 *   F. gíria de dinheiro (conto, pila, pau, mango).
 *
 * O valor esperado é conhecido por construção: escolhe-se o número ANTES de
 * virar texto. `porExtenso` é uma implementação independente do inverso do
 * que o parser faz — se as duas concordarem em 14 mil frases, o caminho está
 * fechado nos dois sentidos.
 *
 * Roda: npx tsx __tests__/corpus-voz-gerado.ts
 * Imprime só falhas, agrupadas por assinatura.
 */
import { guessAmountFromText, guessDescFromText, guessTypeFromText } from '../lib/heuristics';

/* ---------- número -> por extenso ---------- */
const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function porExtenso(n: number): string {
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

function valoresDe(extenso: string): number[] {
  return extenso.split(/\s+/).filter((p) => p !== 'e').map((p) => VALOR_DA_PALAVRA[p]);
}

/** A fala "X e Y" se parte em dois números? Só quando Y não pode continuar X. */
function quebraEmDois(inteiro: number, centavos: number): boolean {
  const dosReais = valoresDe(porExtenso(inteiro));
  const dosCentavos = valoresDe(porExtenso(centavos));
  return dosCentavos[0] >= dosReais[dosReais.length - 1];
}

/* ---------- coletor de falhas ---------- */
type Falha = { exemplo: string; obtido: string; esperado: string; qtd: number };
const falhas = new Map<string, Falha>();
let total = 0;

function registrar(sig: string, txt: string, obtido: string, esperado: string) {
  const f = falhas.get(sig);
  if (f) f.qtd++;
  else falhas.set(sig, { exemplo: txt, obtido, esperado, qtd: 1 });
}

/** Checa valor e, quando `desc` vem, a descrição.
 *  `exata` cobra igualdade — usado onde o teste também prova que a sobra do
 *  fim da frase foi limpa; sem isso "Mercado né" passaria por começar certo. */
function checa(sig: string, txt: string, valEsperado: number, desc?: string, exata = false) {
  total++;
  const val = guessAmountFromText(txt);
  if (Math.abs(val - valEsperado) > 0.005) {
    registrar(`VALOR|${sig}`, txt, String(val), String(valEsperado));
  }
  if (desc !== undefined) {
    const obtida = guessDescFromText(txt, guessTypeFromText(txt));
    const ok = exata
      ? obtida.toLowerCase() === desc.toLowerCase()
      : obtida.toLowerCase().startsWith(desc.toLowerCase());
    if (!ok) {
      registrar(`DESC|${sig}`, txt, obtida, exata ? `"${desc}"` : `começar com "${desc}"`);
    }
  }
}

/* ══════════ A. numeral por extenso, varredura ══════════ */
const INTEIROS: number[] = [];
for (let n = 1; n <= 1000; n++) INTEIROS.push(n);
for (let n = 1100; n <= 20000; n += 100) INTEIROS.push(n);
for (const n of [25000, 30000, 45000, 50000, 99000, 100000, 120500, 250000]) INTEIROS.push(n);

for (const n of INTEIROS) {
  const ext = porExtenso(n);
  const moeda = n === 1 ? 'real' : 'reais';
  checa('A:desc+extenso+moeda', `mercado ${ext} ${moeda}`, n, 'Mercado');
  checa('A:verbo+extenso+moeda+desc', `gastei ${ext} ${moeda} no mercado`, n);
  checa('A:extenso+moeda+de+desc', `${ext} ${moeda} de gasolina`, n);
  // "mercado um" é artigo, não valor — a exceção é de propósito no parser.
  if (n !== 1) checa('A:desc+extenso(sem moeda)', `mercado ${ext}`, n, 'Mercado');
}

/* ══════════ B. reais e centavos falados ══════════ */
const INTEIROS_B = [1, 2, 3, 5, 7, 9, 10, 11, 12, 15, 19, 20, 25, 30, 39, 42, 49, 50, 60, 75, 80, 89, 99, 100, 120];

for (const i of INTEIROS_B) {
  const extI = porExtenso(i);
  const moeda = i === 1 ? 'real' : 'reais';
  for (let c = 1; c <= 99; c++) {
    const extC = porExtenso(c);
    const esperado = i + c / 100;
    const cc = String(c).padStart(2, '0');

    // Forma explícita: nunca é ambígua, tem que funcionar sempre.
    checa('B:extenso reais e extenso centavos', `mercado ${extI} ${moeda} e ${extC} centavos`, esperado, 'Mercado');

    /* Forma curta ("onze e setenta e nove"): só vale como preço quando a
       sequência sobe. Quando ela desce ("cem e cinquenta") é um numeral só,
       vale 150 — e testar 100,50 ali seria cobrar do parser um erro de
       português. */
    if (quebraEmDois(i, c)) {
      checa('B:extenso e extenso (curta)', `mercado ${extI} e ${extC}`, esperado, 'Mercado');
    }

    // Dígitos falados soltos: "mercado 11 e 79".
    if (c >= 10) checa('B:digito e digito', `mercado ${i} e ${c}`, esperado, 'Mercado');
  }
}

/* ══════════ C. hesitação e muleta de fala ══════════ */
/* Ninguém dita pro app numa frase limpa. O Whisper transcreve o "é...", o
   "então" e o "né" junto, e eles não podem nem virar valor nem virar nome do
   lançamento. */
const NUCLEOS: { txt: string; val: number; desc: string }[] = [
  { txt: 'mercado cento e vinte reais', val: 120, desc: 'Mercado' },
  { txt: 'almoço vinte e cinco reais', val: 25, desc: 'Almoço' },
  { txt: 'uber quinze reais', val: 15, desc: 'Uber' },
  { txt: 'monster onze e setenta e nove', val: 11.79, desc: 'Monster' },
  { txt: 'gasolina cem reais', val: 100, desc: 'Gasolina' },
  { txt: 'farmácia trinta e sete reais', val: 37, desc: 'Farmácia' },
  { txt: 'padaria oito e cinquenta', val: 8.5, desc: 'Padaria' },
  { txt: 'academia oitenta e nove e noventa', val: 89.9, desc: 'Academia' },
  { txt: 'cinema quarenta reais', val: 40, desc: 'Cinema' },
  { txt: 'aluguel mil e quinhentos reais', val: 1500, desc: 'Aluguel' },
];
const PREFIXOS = ['', 'é ', 'ó ', 'então ', 'tipo assim ', 'olha ', 'ahn ', 'deixa eu ver ', 'peraí ', 'ah '];
const SUFIXOS = ['', ' né', ' tá', ' pronto', ' valeu', ' ok', ' beleza', ' aí'];

for (const nuc of NUCLEOS) {
  for (const p of PREFIXOS) {
    for (const s of SUFIXOS) {
      const cru = `${p}${nuc.txt}${s}`;
      checa(`C:pref="${p.trim()}"|suf="${s.trim()}"`, cru, nuc.val, nuc.desc, true);
      // Como o Whisper devolve de verdade: maiúscula inicial e ponto final.
      const transcrito = cru.charAt(0).toUpperCase() + cru.slice(1) + '.';
      checa(`C:transcrito|pref="${p.trim()}"|suf="${s.trim()}"`, transcrito, nuc.val, nuc.desc, true);
    }
  }
}

/* ══════════ D. a mesma quantia, toda grafia possível ══════════ */
/* O Whisper não é determinístico na hora de escrever dinheiro: o mesmo áudio
   sai "11,79", "11.79", "R$ 11,79" ou "onze reais e setenta e nove centavos".
   Todas têm que cair no mesmo centavo. */
const QUANTIAS: [number, number][] = [
  [1, 50], [2, 99], [3, 50], [5, 50], [6, 90], [8, 90], [9, 99], [10, 50], [11, 79], [12, 0],
  [15, 90], [19, 99], [20, 0], [23, 45], [25, 30], [29, 90], [30, 0], [37, 20], [39, 90], [42, 10],
  [49, 90], [50, 0], [65, 35], [79, 99], [89, 90], [99, 99], [120, 50], [250, 75], [499, 90], [999, 99],
];

for (const [i, c] of QUANTIAS) {
  const cc = String(c).padStart(2, '0');
  const esperado = i + c / 100;
  const extI = porExtenso(i);
  const extC = porExtenso(c);
  const moeda = i === 1 ? 'real' : 'reais';

  checa('D:N,NN', `monster ${i},${cc}`, esperado, 'Monster');
  checa('D:R$ N,NN', `monster R$ ${i},${cc}`, esperado, 'Monster');
  checa('D:N,NN reais', `monster ${i},${cc} reais`, esperado, 'Monster');
  checa('D:N.NN (ponto americano)', `monster ${i}.${cc}`, esperado, 'Monster');

  if (c > 0) {
    checa('D:N reais e N centavos', `monster ${i} ${moeda} e ${c} centavos`, esperado, 'Monster');
    checa('D:extenso reais e extenso centavos', `monster ${extI} ${moeda} e ${extC} centavos`, esperado, 'Monster');
    checa('D:extenso e extenso centavos', `monster ${extI} e ${extC} centavos`, esperado, 'Monster');
    if (c >= 10) checa('D:N e NN', `monster ${i} e ${c}`, esperado, 'Monster');
    if (quebraEmDois(i, c)) checa('D:extenso e extenso', `monster ${extI} e ${extC}`, esperado, 'Monster');
  } else {
    checa('D:extenso moeda', `monster ${extI} ${moeda}`, esperado, 'Monster');
  }
}

/* ══════════ E. ordem invertida — valor antes da descrição ══════════ */
/* Falando, o valor vem primeiro tanto quanto vem por último ("gastei cinquenta
   no mercado"). O nome do lançamento tem que sair do fim da frase. */
const LUGARES = ['mercado', 'posto', 'cinema', 'uber', 'shopping', 'açougue', 'mercadinho',
  'estacionamento', 'restaurante', 'petshop', 'sacolão', 'boteco', 'salão', 'lava jato', 'pedágio'];
const VALORES_E = [7, 12, 20, 25, 30, 45, 50, 80, 100, 150, 250, 500];
const MOLDES: { sig: string; f: (v: string, d: string) => string }[] = [
  { sig: 'E:gastei V no D', f: (v, d) => `gastei ${v} reais no ${d}` },
  { sig: 'E:paguei V de D', f: (v, d) => `paguei ${v} reais de ${d}` },
  { sig: 'E:V de D', f: (v, d) => `${v} reais de ${d}` },
  { sig: 'E:foi V no D', f: (v, d) => `foi ${v} reais no ${d}` },
  { sig: 'E:custou V no D', f: (v, d) => `custou ${v} reais no ${d}` },
];

for (const lugar of LUGARES) {
  for (const v of VALORES_E) {
    for (const molde of MOLDES) {
      const cap = lugar.charAt(0).toUpperCase() + lugar.slice(1);
      checa(molde.sig, molde.f(String(v), lugar), v, cap);
      checa(`${molde.sig} (extenso)`, molde.f(porExtenso(v), lugar), v, cap);
    }
  }
}

/* ══════════ F. gíria de dinheiro ══════════ */
/* "Vinte conto de lanche" é como se fala de verdade. Se a gíria não contar
   como moeda, o número vira número solto e a heurística fica sem âncora. */
const GIRIAS = ['conto', 'contos', 'pila', 'pau', 'paus', 'mango', 'mangos'];
const VALORES_F = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 500, 800, 1000, 1500];
const COISAS = ['lanche', 'mercado', 'uber'];

for (const giria of GIRIAS) {
  for (const v of VALORES_F) {
    for (const coisa of COISAS) {
      const cap = coisa.charAt(0).toUpperCase() + coisa.slice(1);
      checa(`F:${giria}|dígito`, `${v} ${giria} de ${coisa}`, v, cap);
      checa(`F:${giria}|extenso`, `${porExtenso(v)} ${giria} de ${coisa}`, v, cap);
    }
  }
}

/* ---------- relatório ---------- */
const ordenadas = [...falhas.entries()].sort((a, b) => b[1].qtd - a[1].qtd);
for (const [sig, f] of ordenadas) {
  console.log(`[${f.qtd}x] ${sig}`);
  console.log(`      ex: "${f.exemplo}"`);
  console.log(`      obtido: ${f.obtido}  |  esperado: ${f.esperado}`);
}

const comFalha = ordenadas.reduce((s, [, f]) => s + f.qtd, 0);
console.log(`\n${total - comFalha}/${total} passaram — ${comFalha} falhas em ${ordenadas.length} padrões distintos`);
