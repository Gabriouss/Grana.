/* Corpus de mensagens reais de lançamento — foco em VOZ (transcrição).
   Roda com: npx tsx __tests__/corpus-voz.ts
   Imprime só o que falha. */
import { guessAmountFromText, guessDescFromText, guessTypeFromText, guessCategoryFromText } from '../lib/heuristics';

type Caso = { txt: string; val?: number; desc?: string; tipo?: 'in' | 'out'; cat?: string; nota?: string };

const CASOS: Caso[] = [
  // ---------- VOZ: número por extenso ----------
  { txt: 'almoço vinte reais', val: 20, desc: 'Almoço', cat: 'Alimentação' },
  { txt: 'almoço de vinte reais', val: 20, desc: 'Almoço' },
  { txt: 'mercado cento e vinte reais', val: 120, desc: 'Mercado' },
  { txt: 'mercado cento e vinte e cinco reais', val: 125 },
  { txt: 'uber quinze reais', val: 15, cat: 'Transporte' },
  { txt: 'gastei trinta reais na farmácia', val: 30, cat: 'Saúde' },
  { txt: 'paguei duzentos e cinquenta de aluguel', val: 250, cat: 'Moradia' },
  { txt: 'mil e quinhentos reais de aluguel', val: 1500, cat: 'Moradia' },
  { txt: 'dois mil reais de salário', val: 2000, tipo: 'in', cat: 'Salário' },
  { txt: 'recebi três mil reais', val: 3000, tipo: 'in' },
  { txt: 'cinquenta pila no mercado', val: 50 },
  { txt: 'vinte conto de lanche', val: 20 },

  // ---------- VOZ: centavos falados ----------
  { txt: 'monster onze e setenta e nove', val: 11.79, desc: 'Monster' },
  { txt: 'monster onze reais e setenta e nove', val: 11.79 },
  { txt: 'café cinco e cinquenta', val: 5.5, desc: 'Café' },
  { txt: 'pão seis e noventa', val: 6.9 },
  { txt: 'gasolina cem e cinquenta', val: 150, nota: 'numeral decrescente = 150; R$100,50 se fala "cem e cinquenta centavos"' },
  { txt: 'almoço vinte e cinco', val: 25, nota: 'vinte e cinco = 25, nao 20,05' },
  { txt: 'almoço vinte e cinco reais', val: 25 },
  { txt: 'lanche dez e cinquenta centavos', val: 10.5 },

  // ---------- VOZ: sem pontuação, corrido ----------
  { txt: 'monster no posto dez e setenta e nove no crédito da c6 categoria alimentação', val: 10.79 },
  { txt: 'almoço trinta reais no débito categoria alimentação', val: 30 },
  { txt: 'comprei um monster de dez reais', val: 10, desc: 'Monster' },
  { txt: 'fiz um pix de cinquenta reais pra maria', val: 50 },
  { txt: 'então tipo assim gastei quarenta reais no mercado', val: 40 },

  // ---------- Números ambíguos / armadilhas ----------
  { txt: 'uber 99 pop 25 reais', val: 25, nota: '99 nao pode virar valor' },
  { txt: 'almoço no crédito da c6 30 reais', val: 30 },
  { txt: 'posto 24 horas 50 reais', val: 50 },
  { txt: 'são 10 e 30 almoço 25 reais', val: 25, nota: 'hora nao vira valor' },
  { txt: 'comprei 2 cervejas 15 reais', val: 15, nota: 'quantidade nao vira valor' },
  { txt: 'mercado 1179', val: 1179, nota: 'genuinamente ambiguo' },

  // ---------- Escrito: formatos com valor ----------
  { txt: 'Mercado R$ 120,50', val: 120.5, desc: 'Mercado' },
  { txt: 'Mercado 120,50', val: 120.5 },
  { txt: 'Mercado 1.250,90', val: 1250.9 },
  { txt: 'Almoço 25', val: 25, desc: 'Almoço' },
  { txt: 'mercado', val: 0, nota: 'sem valor -> pergunta' },

  // ---------- Entrada vs saída ----------
  { txt: 'recebi 1500 de freela', tipo: 'in', val: 1500 },
  { txt: 'caiu 3000 do cliente', tipo: 'in', val: 3000 },
  { txt: 'salário 4000', tipo: 'in', val: 4000, cat: 'Salário' },
  { txt: 'paguei 50 de uber', tipo: 'out', val: 50 },
  { txt: 'recebi um crédito de 500', tipo: 'in', val: 500, nota: 'nao pode virar cartao' },

  // ---------- Categorias ----------
  { txt: 'netflix 39,90', cat: 'Assinaturas', val: 39.9 },
  { txt: 'ifood 45', cat: 'Alimentação', val: 45 },
  { txt: 'academia 89,90', cat: 'Saúde', val: 89.9 },
  { txt: 'conta de luz 210', cat: 'Moradia', val: 210 },
  { txt: 'gasolina 100', cat: 'Transporte', val: 100 },
  { txt: 'cinema 30', cat: 'Lazer', val: 30 },

  // ---------- Descrição: cartão/pagamento não é nome ----------
  { txt: 'almoço 30 no crédito da c6', desc: 'Almoço' },
  { txt: 'mercado 50 no pix', desc: 'Mercado' },
  { txt: 'farmácia 30 no débito', desc: 'Farmácia' },
  { txt: 'chip de 22 reais, outros', desc: 'Chip' },
  { txt: 'monster no categoria alimentação', desc: 'Monster' },

  // ---------- VOZ: mais decimais falados ----------
  { txt: 'quarenta e nove e noventa', val: 49.9, nota: '49 e 90 = R$49,90' },
  { txt: 'cerveja quinze e noventa', val: 15.9 },
  { txt: 'um real e cinquenta', val: 1.5 },
  { txt: 'três e cinquenta', val: 3.5 },
  { txt: 'trinta e sete e vinte', val: 37.2 },
  { txt: 'cento e vinte e nove e noventa', val: 129.9 },
  { txt: 'dois mil e quinhentos', val: 2500 },
  { txt: 'mil duzentos e cinquenta reais', val: 1250 },

  // ---------- Numerais que NÃO podem quebrar ----------
  { txt: 'cento e cinco reais', val: 105 },
  { txt: 'duzentos e cinquenta reais', val: 250 },
  { txt: 'noventa e nove reais', val: 99 },
  { txt: 'quarenta e dois reais', val: 42 },
  { txt: 'mil e quinhentos', val: 1500 },
  { txt: 'vinte mil reais', val: 20000 },

  // ---------- Fala informal / hesitação ----------
  { txt: 'é... almoço aí uns trinta reais', val: 30 },
  { txt: 'ó comprei um lanche de quinze reais', val: 15 },
  { txt: 'anota aí mercado oitenta reais', val: 80 },
  { txt: 'bota trinta reais de gasolina', val: 30, cat: 'Transporte' },
  { txt: 'foi cinquenta reais no ifood', val: 50, cat: 'Alimentação' },

  // ---------- Valores altos ----------
  { txt: 'aluguel mil e oitocentos', val: 1800, cat: 'Moradia' },
  { txt: 'notebook três mil e duzentos', val: 3200 },
  { txt: 'salário cinco mil reais', val: 5000, tipo: 'in' },

  // ---------- Traps de contexto ----------
  { txt: 'comprei 3 pães 12 reais', val: 12 },
  { txt: 'uber até o aeroporto 45 reais', val: 45, cat: 'Transporte' },
  { txt: 'paguei o boleto de 250', val: 250 },
  { txt: 'netflix mensalidade 39,90', val: 39.9, cat: 'Assinaturas' },
  { txt: 'gastei 20 reais e 30 reais hoje', val: 20, nota: 'pega o primeiro' },
];

let falhas = 0;
for (const c of CASOS) {
  const tipo = guessTypeFromText(c.txt);
  const val = guessAmountFromText(c.txt);
  const desc = guessDescFromText(c.txt, tipo);
  const cat = guessCategoryFromText(c.txt).name;
  const erros: string[] = [];
  if (c.val !== undefined && Math.abs(val - c.val) > 0.001) erros.push(`valor=${val} (esperado ${c.val})`);
  if (c.desc !== undefined && desc !== c.desc) erros.push(`desc="${desc}" (esperado "${c.desc}")`);
  if (c.tipo !== undefined && tipo !== c.tipo) erros.push(`tipo=${tipo} (esperado ${c.tipo})`);
  if (c.cat !== undefined && cat !== c.cat) erros.push(`cat=${cat} (esperado ${c.cat})`);
  if (erros.length) {
    falhas++;
    console.log(`FALHA  "${c.txt}"`);
    for (const e of erros) console.log(`         ${e}`);
    if (c.nota) console.log(`         nota: ${c.nota}`);
  }
}
console.log(`\n${CASOS.length - falhas}/${CASOS.length} passaram — ${falhas} falhas`);
