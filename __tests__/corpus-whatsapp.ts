/* O lançamento pelo WhatsApp de ponta a ponta: categoria, forma de pagamento,
 * boleto, recorrência e parcelamento — cada caso testado DUAS vezes, como
 * texto digitado e como áudio transcrito.
 *
 * Os outros corpora cobrem valor e nome (corpus-gerado, corpus-voz-gerado) e
 * o roteamento básico (corpus-roteamento). O que falta é o resto do que o bot
 * promete na mensagem de boas-vindas: dizer "no pix" tem que virar pix, dizer
 * "todo mês" tem que repetir, dizer "boleto vence dia 10" tem que virar conta
 * a pagar. Nada disso tinha teste.
 *
 * A segunda passada (`comoAudio`) é o ponto: o mesmo caso reescrito como fala
 * — sem pontuação, sem "R$", número por extenso. Áudio é o caminho mais usado
 * e o menos parecido com o que se digita, então testar só a forma escrita
 * deixa justamente o pior caso de fora.
 *
 * Roda: npx tsx __tests__/corpus-whatsapp.ts
 */
import { guessAmountFromText, guessCategoryFromText, guessDescFromText, guessTypeFromText } from '../lib/heuristics';
import { comoAudio } from './extenso';
import { funcoesDoWebhook } from './extrair';

const doWebhook = funcoesDoWebhook<{
  ehIntencaoCredito: (t: string) => boolean;
  ehIntencaoBoleto: (t: string) => boolean;
  parseDiaVencimento: (t: string) => string;
  parseParcelas: (t: string) => number | null;
  parseFormaPagamento: (t: string) => string | null;
  parseRecorrencia: (t: string) => boolean;
  ehIntencaoCancelar: (t: string) => boolean;
  COMANDO_CANCELAR_FINAL: RegExp;
}>(['ehIntencaoCredito', 'ehIntencaoBoleto', 'parseDiaVencimento', 'parseParcelas',
  'parseFormaPagamento', 'parseRecorrencia', 'CANCELAR', 'ehIntencaoCancelar', 'COMANDO_CANCELAR_FINAL']);

/* ---------- casos ---------- */
type Caso = {
  txt: string;
  val?: number;
  desc?: string;
  cat?: string;
  tipo?: 'in' | 'out';
  credito?: boolean;
  boleto?: boolean;
  forma?: string | null;
  recorrente?: boolean;
  parcelas?: number | null;
  /** Frases cuja versão falada não faz sentido testar (ex: data "10/03"). */
  soTexto?: boolean;
  nota?: string;
};

const CASOS: Caso[] = [
  // ══════ CATEGORIA ══════
  { txt: 'Mercado 120', cat: 'Alimentação', val: 120, desc: 'Mercado' },
  { txt: 'ifood 45,90', cat: 'Alimentação', val: 45.9 },
  { txt: 'padaria 12,50', cat: 'Alimentação', val: 12.5 },
  { txt: 'uber 23,40', cat: 'Transporte', val: 23.4 },
  { txt: 'gasolina 200', cat: 'Transporte', val: 200 },
  { txt: 'estacionamento 15', cat: 'Transporte', val: 15 },
  { txt: 'farmácia 78,90', cat: 'Saúde', val: 78.9 },
  { txt: 'academia 89,90', cat: 'Saúde', val: 89.9 },
  { txt: 'netflix 39,90', cat: 'Assinaturas', val: 39.9 },
  { txt: 'spotify 21,90', cat: 'Assinaturas', val: 21.9 },
  { txt: 'conta de luz 210', cat: 'Moradia', val: 210 },
  { txt: 'aluguel 1500', cat: 'Moradia', val: 1500 },
  { txt: 'cinema 32', cat: 'Lazer', val: 32 },

  // ══════ FORMA DE PAGAMENTO ══════
  { txt: 'almoço 30 no pix', forma: 'pix', credito: false, desc: 'Almoço', val: 30 },
  { txt: 'mercado 120 pelo pix', forma: 'pix', val: 120 },
  { txt: 'fiz um pix de 50 pra maria', forma: 'pix', val: 50 },
  { txt: 'farmácia 55 no débito', forma: 'debit', credito: false, val: 55 },
  { txt: 'mercado 80 no cartão de débito', forma: 'debit', credito: false, val: 80 },
  { txt: 'padaria 12 em dinheiro', forma: 'cash', credito: false, val: 12 },
  { txt: 'feira 40 em espécie', forma: 'cash', val: 40 },
  { txt: 'almoço 30 no crédito', forma: 'credit', credito: true, val: 30 },
  { txt: 'mercado 200 no cartão de crédito', forma: 'credit', credito: true, val: 200 },
  { txt: 'almoço 30 no crédito da c6', forma: 'credit', credito: true, desc: 'Almoço', val: 30 },
  // Sem forma dita, não inventa nenhuma.
  { txt: 'mercado 120', forma: null, credito: false, val: 120 },
  { txt: 'almoço 25', forma: null, val: 25 },

  // ══════ RECORRÊNCIA ══════
  { txt: 'netflix 39,90 todo mês', recorrente: true, cat: 'Assinaturas', val: 39.9, desc: 'Netflix' },
  { txt: 'aluguel 1500 todo mês', recorrente: true, cat: 'Moradia', val: 1500, desc: 'Aluguel' },
  { txt: 'academia 89,90 todos os meses', recorrente: true, val: 89.9, desc: 'Academia' },
  { txt: 'internet 99 mensalmente', recorrente: true, val: 99, desc: 'Internet' },
  { txt: 'spotify 21,90 é recorrente', recorrente: true, val: 21.9, desc: 'Spotify' },
  { txt: 'seguro do carro 180 que repete todo mês', recorrente: true, val: 180 },
  { txt: 'plano de saúde 320 cada mês', recorrente: true, val: 320 },
  // Não é recorrente: gasto avulso não pode virar dinheiro fantasma todo mês.
  { txt: 'mercado 120', recorrente: false },
  { txt: 'netflix 39,90', recorrente: false, nota: 'assinatura por natureza, mas não foi PEDIDA repetição' },
  { txt: 'academia mensalidade 89,90', recorrente: false, nota: '"mensalidade" é substantivo, não pedido de repetir' },
  { txt: 'almoço 30 no crédito', recorrente: false },
  { txt: 'comprei um mês de academia 89,90', recorrente: false },

  // ══════ RECORRÊNCIA + FORMA ══════
  { txt: 'aluguel 1500 no pix todo mês', recorrente: true, forma: 'pix', val: 1500, desc: 'Aluguel' },
  { txt: 'netflix 39,90 no crédito todo mês', recorrente: true, forma: 'credit', credito: true, val: 39.9, desc: 'Netflix' },

  // ══════ BOLETO ══════
  { txt: 'boleto da luz 210', boleto: true, val: 210 },
  { txt: 'conta de água 85 vence dia 20', boleto: true, val: 85 },
  { txt: 'boleto do condomínio 450 todo mês', boleto: true, recorrente: true, val: 450 },
  { txt: 'conta a pagar de 300', boleto: true, val: 300 },
  { txt: 'internet 99 vencimento dia 10 todo mês', boleto: true, recorrente: true, val: 99 },
  // Não é boleto.
  { txt: 'mercado 120', boleto: false },
  { txt: 'almoço 30 no crédito', boleto: false },

  // ══════ CRÉDITO PARCELADO ══════
  { txt: 'mercado 230 parcelado em 3x', parcelas: 3, credito: true, forma: 'credit', val: 230 },
  { txt: 'notebook 3000 em 10x', parcelas: 10, credito: true, val: 3000 },
  { txt: 'sofá 1200 em 6 vezes', parcelas: 6, credito: true, val: 1200 },
  { txt: 'tv 2500 em 12 parcelas', parcelas: 12, credito: true, val: 2500 },
  { txt: 'geladeira 1800 parcelei em 8', parcelas: 8, credito: true, val: 1800 },
  { txt: 'celular 2400 em 4x no crédito da c6', parcelas: 4, credito: true, val: 2400 },
  // Parcelado NUNCA é recorrente: são 3 linhas fechadas, não uma série aberta.
  { txt: 'mercado 230 parcelado em 3x', recorrente: false },
  { txt: 'notebook 3000 em 10x', recorrente: false },
  // Sem parcela dita.
  { txt: 'almoço 30 no crédito', parcelas: null },
  { txt: 'uber 99 pop 25 reais', parcelas: null },

  // ══════ ENTRADA ══════
  { txt: 'recebi 3000 de salário', tipo: 'in', cat: 'Salário', val: 3000 },
  { txt: 'salário 4500 todo mês', tipo: 'in', recorrente: true, val: 4500 },
  { txt: 'caiu 1200 do freela', tipo: 'in', val: 1200 },
  { txt: 'recebi um pix de 250', tipo: 'in', forma: 'pix', val: 250 },
  { txt: 'recebi um crédito de 500', tipo: 'in', credito: false, val: 500, nota: 'não pode virar fatura' },

  // ══════ DATA DE VENCIMENTO (só faz sentido escrito) ══════
  { txt: 'boleto 100 vencimento 25/12', boleto: true, soTexto: true },
  { txt: 'boleto 100 vencimento 05/03/2027', boleto: true, soTexto: true },
];

/* ══════════ CANCELAMENTO ══════════
 *
 * A regra real do bot é a conjunção: palavra de cancelar E mensagem sem
 * valor. Testar só `ehIntencaoCancelar` mediria menos do que ele faz — e
 * mediria justamente o lado perigoso de menos, porque o filtro de valor é o
 * que impede "cancelamento de voo 200 reais" de apagar o lançamento anterior.
 */
const CANCELAMENTOS: [string, boolean][] = [
  // Comando: cancela mesmo.
  ['cancela', true],
  ['cancelar', true],
  ['Cancela.', true],
  ['cancela isso', true],
  /* As formas em -e (imperativo escrito) faltavam na primeira versão: quem
     digitou "Cancele o último lançamento" recebeu de volta um pedido de
     valor. Cada verbo entra agora pelo radical, com fala, imperativo e
     infinitivo. */
  ['cancele', true],
  ['Cancele o último lançamento', true],
  ['cancele esse aí', true],
  ['apague', true],
  ['exclua', true],
  ['delete', true],
  ['remove', true],
  ['remova esse', true],
  ['anule', true],
  ['desfaça', true],
  ['esqueça', true],
  ['desconsidere', true],
  ['ignore', true],
  ['não era isso', true],
  ['não é isso', true],
  ['tá errado', true],
  ['apaga', true],
  ['apaga isso', true],
  ['apagar o último', true],
  ['errei', true],
  ['errei, cancela', true],
  ['desfaz', true],
  ['desfazer', true],
  ['desconsidera', true],
  ['exclui esse', true],
  ['deleta', true],
  ['esquece', true],
  ['ignora isso', true],

  /* NÃO é comando: tem valor, logo é despesa. Este é o grupo que importa —
     um falso positivo aqui apaga um lançamento certo. */
  ['cancelamento de voo 200 reais', false],
  ['cancelei a netflix 39,90', false],
  ['multa de cancelamento 150', false],
  ['taxa de cancelamento do hotel 89,90', false],
  ['apaguei o quadro 45 reais', false],
  ['errei e paguei 30 a mais', false],

  // NÃO é comando: nem palavra de cancelar tem.
  ['mercado 120', false],
  ['oi', false],
  ['almoço trinta reais', false],
];

/* Com valor junto, só vale o verbo imperativo no FIM. Estes casos são o
   contrário do grupo acima: TÊM número e mesmo assim são comando. */
const CANCELAMENTOS_COM_VALOR: [string, boolean][] = [
  // Ordem no fim da frase: cancela.
  ['Mercado 10,05 cancele', true],
  ['mercado 10,05 cancela', true],
  ['almoço 30 apaga', true],
  ['uber 25 apague', true],
  ['netflix 39,90 exclua', true],
  ['pousada 175 remove', true],
  ['mercado 120 cancelar.', true],

  // Substantivo no meio: é despesa de verdade.
  ['cancelamento de voo 200 reais', false],
  ['multa de cancelamento 150', false],
  ['taxa de cancelamento do hotel 89,90', false],
  // Passado em primeira pessoa: conta o que a pessoa fez, não uma ordem.
  ['netflix 39,90 cancelei', false],
  ['cancelei a netflix 39,90', false],
  ['errei e paguei 30 a mais', false],
  // Sem verbo nenhum.
  ['mercado 120', false],
  ['almoço 30 no crédito', false],
];

let falhasCancel = 0;

/** A decisão real do bot: sem valor vale a família toda, com valor só o fim. */
function comandoDeCancelar(txt: string): boolean {
  return guessAmountFromText(txt) > 0
    ? doWebhook.COMANDO_CANCELAR_FINAL.test(txt)
    : doWebhook.ehIntencaoCancelar(txt);
}

for (const [txt, esperado] of [...CANCELAMENTOS, ...CANCELAMENTOS_COM_VALOR]) {
  const obtido = comandoDeCancelar(txt);
  if (obtido !== esperado) {
    falhasCancel++;
    console.log(`FALHA [cancelar]  "${txt}" -> ${obtido} (esperado ${esperado})`);
  }
}

/* ---------- execução ---------- */
let falhas = 0;
let checados = 0;

function rodar(c: Caso, txt: string, rotulo: string) {
  checados++;
  const erros: string[] = [];

  if (c.val !== undefined) {
    const v = guessAmountFromText(txt);
    if (Math.abs(v - c.val) > 0.005) erros.push(`valor=${v} (esperado ${c.val})`);
  }
  if (c.tipo !== undefined) {
    const t = guessTypeFromText(txt);
    if (t !== c.tipo) erros.push(`tipo=${t} (esperado ${c.tipo})`);
  }
  if (c.desc !== undefined) {
    const d = guessDescFromText(txt, guessTypeFromText(txt));
    if (d.toLowerCase() !== c.desc.toLowerCase()) erros.push(`desc="${d}" (esperado "${c.desc}")`);
  }
  if (c.cat !== undefined) {
    const k = guessCategoryFromText(txt).name;
    if (k !== c.cat) erros.push(`categoria=${k} (esperado ${c.cat})`);
  }
  if (c.credito !== undefined) {
    /* A decisão real é a do registrarLancamento, que exige SAÍDA: sem isso,
       "recebi um crédito de 500" — dinheiro entrando — iria parar numa
       fatura. Testar `ehIntencaoCredito` sozinha mediria menos do que o bot
       de fato faz. */
    const v = guessTypeFromText(txt) === 'out' && doWebhook.ehIntencaoCredito(txt);
    if (v !== c.credito) erros.push(`crédito=${v} (esperado ${c.credito})`);
  }
  if (c.boleto !== undefined) {
    const v = doWebhook.ehIntencaoBoleto(txt);
    if (v !== c.boleto) erros.push(`boleto=${v} (esperado ${c.boleto})`);
  }
  if (c.forma !== undefined) {
    /* Crédito tem dono: quem decide é ehIntencaoCredito (que sabe recusar
       "cartão de débito" e "recebi um crédito"), então a forma só é
       consultada quando não é crédito. Mesma ordem do registrarLancamento. */
    const v = doWebhook.ehIntencaoCredito(txt) && guessTypeFromText(txt) === 'out'
      ? 'credit'
      : doWebhook.parseFormaPagamento(txt);
    if (v !== c.forma) erros.push(`forma=${v} (esperado ${c.forma})`);
  }
  if (c.recorrente !== undefined) {
    const v = doWebhook.parseRecorrencia(txt);
    if (v !== c.recorrente) erros.push(`recorrente=${v} (esperado ${c.recorrente})`);
  }
  if (c.parcelas !== undefined) {
    const v = doWebhook.parseParcelas(txt);
    if (v !== c.parcelas) erros.push(`parcelas=${v} (esperado ${c.parcelas})`);
  }

  if (erros.length) {
    falhas++;
    console.log(`FALHA [${rotulo}]  "${txt}"`);
    for (const e of erros) console.log(`         ${e}`);
    if (c.nota) console.log(`         nota: ${c.nota}`);
  }
}

for (const c of CASOS) {
  rodar(c, c.txt, 'texto');
  if (!c.soTexto) {
    const falado = comoAudio(c.txt);
    /* Só vale rodar a segunda passada se a transcrição ficou diferente —
       senão é o mesmo teste contado duas vezes. */
    if (falado !== c.txt.toLowerCase()) rodar(c, falado, 'áudio');
  }
}

const totalGeral = checados + CANCELAMENTOS.length + CANCELAMENTOS_COM_VALOR.length;
const totalFalhas = falhas + falhasCancel;
console.log(`\n${totalGeral - totalFalhas}/${totalGeral} passaram — ${totalFalhas} falhas`);
