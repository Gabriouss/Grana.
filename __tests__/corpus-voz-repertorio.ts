/* Repertório do lançamento por voz — as formas que a fala real produz.
 *
 * ── Por que existe, além dos corpus que já havia ──────────────────────────
 *
 * `corpus-voz.ts` e `corpus-voz-gerado.ts` cobrem o que o WHISPER escreve.
 * Na 1.9.0 o widget passou a reconhecer no PRÓPRIO APARELHO quando não há
 * rede (`lib/voz-local.ts`), e o reconhecedor do Android escreve diferente:
 * ele formata número falado como HORA. "merenda cinco e cinquenta e sete"
 * chegou como "Mereda 5h57" e virou R$ 0,00 na tela do autor, em 10/09/2026.
 *
 * A varredura feita a partir daquele caso achou mais três classes de defeito,
 * todas de valor errado e SALVO, que é o desfecho pior do que não lançar:
 *
 *  1. `XhYY` preservado como hora        -> R$ 0,00
 *  2. "45 mil" lido como 1000            -> erro de mil vezes
 *  3. "99 centavos" lido como 99 reais   -> erro de cem vezes
 *  4. "dois e meio" perdendo os centavos -> erro pequeno, mas calado
 *
 * As três primeiras produzem valor > 0 com categoria reconhecida, ou seja,
 * passam pelos dois portões do salvamento automático do widget e entram no
 * extrato sem ninguém perguntar nada.
 *
 * Roda com: npx tsx __tests__/corpus-voz-repertorio.ts
 */
import { guessAmountFromText, guessCategoryFromText, guessTypeFromText } from '../lib/heuristics';

type Caso = { txt: string; val: number; cat?: string; tipo?: 'in' | 'out'; nota?: string };

const CASOS: Caso[] = [
  /* ── 1. Hora é PROIBIDA ───────────────────────────────────────────────────
     Decisão do autor, literal: "preciso que você proiba a interpretação de
     números se transformando em formato de hora. É PROIBIDO." Num aplicativo
     cujo único assunto é dinheiro, `5h57` é sempre R$ 5,57. Antes disso a
     regra convertia só o que NÃO era hora válida, e por isso 5h57 (57 <= 59)
     sobrevivia como horário e o valor sumia. */
  { txt: 'Mereda 5h57', val: 5.57, nota: 'o caso real, com o erro de reconhecimento junto' },
  { txt: 'merenda 5h57', val: 5.57 },
  { txt: 'cafe 2h50', val: 2.5 },
  { txt: 'almoco 12h30', val: 12.3, nota: 'hora válida, e ainda assim vale como dinheiro' },
  { txt: 'jantar 45h00', val: 45 },
  { txt: 'uber 8h05', val: 8.05 },
  { txt: 'pizza 60h90', val: 60.9 },
  { txt: 'lanche 15:90', val: 15.9, nota: 'a mesma proibição na grafia com dois pontos' },
  { txt: 'cinema 32:00', val: 32 },
  { txt: 'estacionamento 7:50', val: 7.5 },

  /* ── 2. Milhar na forma MISTA ────────────────────────────────────────────
     O reconhecedor transcreve a parte numérica como dígito e deixa "mil" por
     extenso. O bloco de número por extenso só resolvia quando tudo era
     palavra, então "carro 45 mil reais" devolvia R$ 1.000,00: o "mil" virava
     um 1000 solto e a regra de moeda casava com ele. */
  { txt: 'carro 45 mil reais', val: 45000 },
  { txt: 'casa 250 mil', val: 250000 },
  { txt: 'salario 3 mil', val: 3000, tipo: 'in' },
  { txt: 'terreno 180 mil reais', val: 180000 },
  { txt: 'moto 12 mil', val: 12000 },
  { txt: 'bonus 1,5 mil', val: 1500, nota: 'milhar quebrado' },
  { txt: 'apartamento 1,2 milhoes', val: 1200000 },
  { txt: 'premio 2 milhoes', val: 2000000 },
  { txt: 'carro quarenta e cinco mil reais', val: 45000, nota: 'a forma toda por extenso, que já funcionava' },

  /* ── 3. Centavos sem parte inteira ───────────────────────────────────────
     "noventa e nove centavos" é fala corriqueira e valia R$ 99,00. */
  { txt: 'doce noventa e nove centavos', val: 0.99 },
  { txt: 'doce 99 centavos', val: 0.99 },
  { txt: 'bala 50 centavos', val: 0.5 },
  { txt: 'pao 5 centavos', val: 0.05 },
  /* E o que NÃO pode ser tocado por aquela regra: com parte inteira, os
     centavos pertencem ao número da frente. Foi o que quebrou quando a regra
     nova entrou cedo demais na cadeia. */
  { txt: 'lanche dez e cinquenta centavos', val: 10.5 },
  { txt: 'monster dois e noventa e nove centavos', val: 2.99 },
  { txt: 'agua dois reais e cinco centavos', val: 2.05 },
  { txt: 'bala um real e um centavo', val: 1.01 },

  /* ── 4. "meio" ──────────────────────────────────────────────────────────
     O bloco de extenso não conhece a palavra, então ela sobrevivia inteira e
     os cinquenta centavos sumiam. */
  { txt: 'cafe dois e meio', val: 2.5 },
  { txt: 'pao meio real', val: 0.5 },

  /* ── Fala natural, que já funcionava e não pode regredir ────────────────── */
  { txt: 'merenda de cinquenta e sete reais e sessenta e seis centavos', val: 57.66, cat: 'Alimentação' },
  { txt: 'merenda cinco e cinquenta e sete', val: 5.57 },
  { txt: 'onze e setenta e nove', val: 11.79 },
  { txt: 'uber quinze e cinquenta', val: 15.5, cat: 'Transporte' },
  { txt: 'mercado cento e vinte reais', val: 120, cat: 'Alimentação' },
  { txt: 'aluguel mil e quinhentos', val: 1500, cat: 'Moradia' },
  { txt: 'seguro novecentos e noventa e nove', val: 999 },
  { txt: 'imposto quatro mil trezentos e vinte', val: 4320 },

  /* ── Decimal com PONTO, que o prompt já não proíbe mais ─────────────────
     A instrução que mandava o Whisper usar vírgula foi retirada em 08/09
     (ela causava eco do prompt e numerais partidos), então o ponto voltou a
     aparecer. O parser precisa distinguir decimal de milhar sozinho. */
  { txt: 'mercado 5.57', val: 5.57 },
  { txt: 'mercado 12.50', val: 12.5 },
  { txt: 'mercado 5.570', val: 5570, nota: 'três casas: é milhar, não decimal' },
  { txt: 'mercado 1.250', val: 1250 },
  { txt: 'compra 1.250,90', val: 1250.9 },

  /* ── Números que NÃO são o valor ────────────────────────────────────────── */
  { txt: '99 pop 18 reais', val: 18, nota: 'o 99 é o aplicativo de corrida' },
  { txt: 'uber 99 taxi 22,50', val: 22.5 },
  { txt: 'office 365 por 40 reais', val: 40 },
  { txt: 'posto 7 estrelas 150 reais', val: 150 },
  { txt: 'fiz um pix de 50 pra maria', val: 50, nota: '"um" é artigo, não valor' },

  /* ── Gírias de dinheiro ──────────────────────────────────────────────────── */
  { txt: 'cinquenta pila no mercado', val: 50 },
  { txt: '30 conto de lanche', val: 30 },
  { txt: 'uber 20 pau', val: 20 },
  { txt: 'almoco 25 mangos', val: 25 },
  { txt: 'pizza quarenta conto', val: 40 },

  /* ── Conversacional ─────────────────────────────────────────────────────── */
  { txt: 'anota ai que gastei 45 reais no mercado', val: 45 },
  { txt: 'paguei 89,90 de internet', val: 89.9 },
  { txt: 'coloquei 100 reais de gasolina', val: 100 },
  { txt: 'deixa eu ver, foi 35 e 40 no mercado', val: 35.4 },
  { txt: 'mercado 30, alimentação', val: 30 },
  { txt: 'mercado 45 virgula 90', val: 45.9 },

  /* ── Entrada ────────────────────────────────────────────────────────────── */
  { txt: 'recebi tres mil reais de salario', val: 3000, tipo: 'in' },
  { txt: 'entrou 1500 de freelance', val: 1500, tipo: 'in' },
  { txt: 'vendi a bicicleta por 800 reais', val: 800, tipo: 'in' },

  /* ── Crédito e parcelas ─────────────────────────────────────────────────── */
  { txt: 'geladeira 1200 em 12x no nubank', val: 1200 },
  { txt: 'tenis 350 reais parcelado em 3 vezes', val: 350 },
  { txt: 'celular 2 mil em 10x', val: 2000 },
];

let falhas = 0;
for (const c of CASOS) {
  const problemas: string[] = [];
  const valor = guessAmountFromText(c.txt);
  if (Math.abs(valor - c.val) >= 0.005) problemas.push(`valor ${valor} (esperado ${c.val})`);
  if (c.cat) {
    const cat = guessCategoryFromText(c.txt, []).name;
    if (cat !== c.cat) problemas.push(`categoria ${cat} (esperado ${c.cat})`);
  }
  if (c.tipo) {
    const tipo = guessTypeFromText(c.txt);
    if (tipo !== c.tipo) problemas.push(`tipo ${tipo} (esperado ${c.tipo})`);
  }
  if (problemas.length > 0) {
    falhas++;
    console.log(`FALHA  "${c.txt}"`);
    console.log(`         ${problemas.join('  |  ')}${c.nota ? `   (${c.nota})` : ''}`);
  }
}

console.log(`\n${CASOS.length - falhas}/${CASOS.length} do repertório de voz passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
