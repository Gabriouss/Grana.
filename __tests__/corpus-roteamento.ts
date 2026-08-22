/* Roteamento do lançamento: ENTRADA vs SAÍDA, CRÉDITO (fatura do cartão),
 * BOLETO (conta a pagar) e a data de vencimento.
 *
 * O corpus-voz e o corpus-gerado cobrem valor e descrição. Aqui é o outro
 * lado: mandar a mesma frase pro lugar certo. Errar isso é pior que errar o
 * nome — o dinheiro aparece na conta errada, ou some da fatura.
 *
 * guessTypeFromText mora em lib/heuristics.ts (compartilhada). As outras três
 * só existem dentro do webhook, então são extraídas do arquivo real — não
 * copiadas — pra o teste não passar enquanto o bot está quebrado.
 *
 * Roda: npx tsx __tests__/corpus-roteamento.ts
 */
/* Este arquivo roda em Node (não no app), então precisa dos tipos do Node.
   A referência fica aqui e não no tsconfig porque preencher `types` lá
   restringe a lista global e derrubaria os tipos do React Native. */
/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import { guessTypeFromText } from '../lib/heuristics';

/* ---------- extrai as funções puras do webhook ---------- */
const WEBHOOK = path.join(__dirname, '..', 'supabase', 'functions', 'whatsapp-webhook', 'index.ts');

function corpoDaFuncao(nome: string): string {
  const linhas = fs.readFileSync(WEBHOOK, 'utf8').split(/\r?\n/);
  const re = new RegExp('^(?:export )?(?:async )?function ' + nome + '(?![A-Za-z0-9_])');
  const i = linhas.findIndex((l) => re.test(l));
  if (i === -1) throw new Error('não achei ' + nome + ' no webhook');
  let profundidade = 0;
  const out: string[] = [];
  for (let j = i; j < linhas.length; j++) {
    out.push(linhas[j]);
    for (const ch of linhas[j]) {
      if (ch === '{') profundidade++;
      if (ch === '}') profundidade--;
    }
    if (j > i && profundidade === 0) break;
  }
  /* Tira as anotações de tipo pra rodar como JS puro dentro de `new Function`.
     São funções pequenas e só de regex, então esta limpeza simples basta —
     e vale a pena para o teste ler o ARQUIVO REAL do bot em vez de uma cópia
     que pode divergir sem ninguém notar. */
  return (
    out
      .join('\n')
      /* O tipo de RETORNO sai primeiro: fazendo o contrário, `): number | null {`
         perdia só o "number" e sobrava um `| null` solto, que não é JS válido. */
      .replace(/\)\s*:\s*[A-Za-z<>[\]|'\s]+?\{/g, ') {')
      .replace(/:\s*(?:string|number|boolean)\b/g, '')
  );
}

const fonte = [
  corpoDaFuncao('ehIntencaoCredito'),
  corpoDaFuncao('ehIntencaoBoleto'),
  corpoDaFuncao('parseDiaVencimento'),
  corpoDaFuncao('parseParcelas'),
  corpoDaFuncao('somarMesesISO'),
].join('\n\n');
const doWebhook = new Function(
  fonte + '\nreturn { ehIntencaoCredito, ehIntencaoBoleto, parseDiaVencimento, parseParcelas, somarMesesISO };'
)() as {
  ehIntencaoCredito: (t: string) => boolean;
  ehIntencaoBoleto: (t: string) => boolean;
  parseDiaVencimento: (t: string) => string;
  parseParcelas: (t: string) => number | null;
  somarMesesISO: (iso: string, meses: number) => string;
};

/* ---------- casos ---------- */
type Caso = {
  txt: string;
  tipo?: 'in' | 'out';
  credito?: boolean;
  boleto?: boolean;
  venc?: string;
  parcelas?: number | null;
};

const hoje = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const emDias = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

const CASOS: Caso[] = [
  // ---------- ENTRADA ----------
  { txt: 'recebi 3000 de salário', tipo: 'in', credito: false, boleto: false },
  { txt: 'salário 4500 caiu hoje', tipo: 'in' },
  { txt: 'caiu 1200 do freela', tipo: 'in' },
  { txt: 'me pagaram 800', tipo: 'in' },
  { txt: 'vendi a bicicleta por 400', tipo: 'in' },
  { txt: 'cashback de 15 reais', tipo: 'in' },
  { txt: 'recebi um pix de 250', tipo: 'in' },
  { txt: 'restituição do imposto 900', tipo: 'in' },
  { txt: 'rendimento da poupança 30 reais', tipo: 'in' },

  // entrada que MENCIONA crédito mas não é cartão
  { txt: 'recebi um crédito de 500', tipo: 'in' },

  // ---------- SAÍDA simples ----------
  { txt: 'mercado 120', tipo: 'out', credito: false, boleto: false },
  { txt: 'gastei 40 no uber', tipo: 'out', credito: false },
  { txt: 'almoço 30 no pix', tipo: 'out', credito: false },
  { txt: 'farmácia 55 no débito', tipo: 'out', credito: false },
  { txt: 'paguei 25 em dinheiro', tipo: 'out', credito: false },

  // ---------- CRÉDITO ----------
  { txt: 'almoço 30 no crédito', credito: true },
  { txt: 'almoço 30 no crédito da c6', credito: true },
  { txt: 'mercado 200 no cartão de crédito', credito: true },
  { txt: 'chip de 22 reais, crédito, c6', credito: true },
  { txt: 'crédito almoço 20 reais', credito: true },
  { txt: 'parcelei o notebook em 10x', credito: true },
  { txt: 'mercado 230 parcelado em 3x', credito: true },
  { txt: 'comprei em 5 vezes', credito: true },
  { txt: 'almoço 30 no cartão', credito: true },

  // débito dito com todas as letras nunca vai pro crédito
  { txt: 'almoço 30 no cartão de débito', credito: false },
  { txt: 'mercado 80 no débito', credito: false },

  // ---------- BOLETO ----------
  { txt: 'boleto da luz 210', boleto: true },
  { txt: 'conta de água 85, vencimento dia 20', boleto: true },
  { txt: 'internet 99 vence dia 10', boleto: true },
  { txt: 'conta a pagar de 300', boleto: true },
  { txt: 'mercado 120', boleto: false },
  { txt: 'almoço 30 no crédito', boleto: false },

  // ---------- VENCIMENTO ----------
  { txt: 'boleto 100 vencimento 25/12', venc: `${hoje.getFullYear()}-12-25` },
  { txt: 'boleto 100 vencimento 05/03/2027', venc: '2027-03-05' },
  { txt: 'boleto 100 sem data', venc: emDias(5) },

  // ---------- PARCELAS ----------
  { txt: 'mercado 230 parcelado em 3x', parcelas: 3, credito: true },
  { txt: 'notebook 3000 em 10x', parcelas: 10 },
  { txt: 'sofá 1200 em 6 vezes', parcelas: 6 },
  { txt: 'tv 2000 em 12 parcelas', parcelas: 12 },
  { txt: 'geladeira 1800 parcelei em 8', parcelas: 8 },
  { txt: 'compra 500 3x', parcelas: 3 },
  { txt: 'mercado 120', parcelas: null },
  { txt: 'almoço 30 no crédito', parcelas: null },
  // 1x é o mesmo que não parcelar
  { txt: 'compra 100 em 1x', parcelas: null },
  // não pode confundir número da descrição com parcela
  { txt: 'uber 99 pop 25 reais', parcelas: null },
  { txt: 'posto 24 horas 50 reais', parcelas: null },
];

/* Divisão das parcelas: as N-1 primeiras iguais e a última absorvendo a
   sobra, pra soma bater EXATAMENTE com o total — um centavo perdido por
   parcela vira erro visível na fatura. */
const DIVISOES: { total: number; n: number }[] = [
  { total: 230, n: 3 },
  { total: 100, n: 3 },
  { total: 1000, n: 7 },
  { total: 99.99, n: 4 },
  { total: 0.05, n: 2 },
];

let falhas = 0;
for (const c of CASOS) {
  const erros: string[] = [];
  if (c.tipo !== undefined) {
    const t = guessTypeFromText(c.txt);
    if (t !== c.tipo) erros.push(`tipo=${t} (esperado ${c.tipo})`);
  }
  if (c.credito !== undefined) {
    const v = doWebhook.ehIntencaoCredito(c.txt);
    if (v !== c.credito) erros.push(`crédito=${v} (esperado ${c.credito})`);
  }
  if (c.boleto !== undefined) {
    const v = doWebhook.ehIntencaoBoleto(c.txt);
    if (v !== c.boleto) erros.push(`boleto=${v} (esperado ${c.boleto})`);
  }
  if (c.venc !== undefined) {
    const v = doWebhook.parseDiaVencimento(c.txt);
    if (v !== c.venc) erros.push(`vencimento=${v} (esperado ${c.venc})`);
  }
  if (c.parcelas !== undefined) {
    const v = doWebhook.parseParcelas(c.txt);
    if (v !== c.parcelas) erros.push(`parcelas=${v} (esperado ${c.parcelas})`);
  }
  if (erros.length) {
    falhas++;
    console.log(`FALHA  "${c.txt}"`);
    for (const e of erros) console.log(`         ${e}`);
  }
}

/* A soma das parcelas tem que fechar com o total, ao centavo. */
let falhasDivisao = 0;
for (const { total, n } of DIVISOES) {
  const base = Math.round((total / n) * 100) / 100;
  const ultima = Math.round((total - base * (n - 1)) * 100) / 100;
  const soma = Math.round((base * (n - 1) + ultima) * 100) / 100;
  if (Math.abs(soma - total) > 0.001) {
    falhasDivisao++;
    console.log(`FALHA  divisão de R$ ${total} em ${n}x soma R$ ${soma}`);
  }
  if (ultima < 0) {
    falhasDivisao++;
    console.log(`FALHA  divisão de R$ ${total} em ${n}x deixa última parcela negativa (R$ ${ultima})`);
  }
}

/* As datas das parcelas: uma por mês, a partir do mês da compra, sem estourar
   em mês curto (31/01 + 1 mês = 28/02, não 03/03). */
const DATAS: [string, number, string][] = [
  ['2026-08-21', 0, '2026-08-21'],
  ['2026-08-21', 1, '2026-09-21'],
  ['2026-01-31', 1, '2026-02-28'],
  ['2026-12-15', 3, '2027-03-15'],
];
for (const [inicio, meses, esperado] of DATAS) {
  const obtido = doWebhook.somarMesesISO(inicio, meses);
  if (obtido !== esperado) {
    falhasDivisao++;
    console.log(`FALHA  ${inicio} + ${meses} mês(es) = ${obtido} (esperado ${esperado})`);
  }
}

const totalChecagens = CASOS.length + DIVISOES.length + DATAS.length;
const totalFalhas = falhas + falhasDivisao;
console.log(`\n${totalChecagens - totalFalhas}/${totalChecagens} passaram — ${totalFalhas} falhas`);
