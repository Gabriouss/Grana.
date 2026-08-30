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
import { guessAmountFromText, guessTypeFromText } from '../lib/heuristics';

import { APP_WHATSAPP, corpoDaFuncao } from './extrair';

/* As funções puras do bot vêm do ARQUIVO REAL — ver __tests__/extrair.ts.
   `escolherValor` chama guessAmountFromText; a do webhook é a mesma do app
   (sync-parser.js falha se divergirem), então injetar a do app testa a lógica
   de escolha sem arrastar meio parser pra dentro do `new Function`. */
/* `somarMesesISO` saiu desta lista porque saiu do webhook: a criação das
   parcelas passou a acontecer no banco, e a aritmética de meses agora é
   `public.somar_meses_data(date, integer)` em supabase/schema.sql. Os casos
   que viviam aqui (inclusive 31/01 + 1 mês = 28/02) valem para lá, e é lá que
   precisam ser verificados: um teste offline não alcança função de banco. */
const NOMES = ['ehIntencaoCredito', 'ehIntencaoBoleto', 'parseDiaVencimento', 'parseParcelas',
  'leituraAlternativaDeAudio', 'escolherValor', 'codigosCandidatos'];
const fonte = [
  ...NOMES.map((n) => corpoDaFuncao(n)),
  corpoDaFuncao('mensagemDePareamento', APP_WHATSAPP),
].join('\n\n');
const doWebhook = new Function(
  'guessAmountFromText',
  `${fonte}\nreturn { ${NOMES.join(', ')}, mensagemDePareamento };`
)(guessAmountFromText) as {
  ehIntencaoCredito: (t: string) => boolean;
  ehIntencaoBoleto: (t: string) => boolean;
  parseDiaVencimento: (t: string) => string;
  parseParcelas: (t: string) => number | null;
  leituraAlternativaDeAudio: (texto: string, amount: number) => number | null;
  escolherValor: (texto: string, literal: number, alternativa: number) => number | null;
  codigosCandidatos: (texto: string) => string[];
  mensagemDePareamento: (codigo: string) => string;
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

/* Desambiguação de valor falado. Dois lados a proteger: levantar a dúvida
   quando ela existe, e — mais importante pro atrito diário — ficar CALADO
   quando não existe. Um bot que pergunta a cada áudio é pior que um bot que
   erra de vez em quando. */
const AMBIGUOS: [string, number, number | null][] = [
  // Pergunta: o número veio em dígitos, tem 4+ casas e não termina em 00.
  ['monster 1179', 1179, 11.79],
  ['monster 1179 reais', 1179, 11.79],
  ['notebook 3499', 3499, 34.99],
  ['almoço 12990', 12990, 129.9],
  ['uber 99 pop 1234', 1234, 12.34],

  // Cala a boca: valor redondo, "mil e quinhentos" não vira "quinze reais".
  ['aluguel 1500', 1500, null],
  ['salário 3200', 3200, null],
  // Abaixo de mil a leitura literal quase sempre é a certa.
  ['mercado 150', 150, null],
  ['café 550', 550, null],
  // Separador é o Whisper afirmando que são mil e cento e setenta e nove.
  ['aluguel 1.179', 1179, null],
  ['mercado 1179,00', 1179, null],
  // Veio por extenso: a fala já era inequívoca, segmentarExtenso resolveu.
  ['mercado mil cento e setenta e nove reais', 1179, null],
  ['monster onze e setenta e nove', 11.79, null],
  // Grande demais pra ser centavo de compra do dia a dia.
  ['carro 150000', 150000, null],
];

let falhasAmbiguo = 0;
for (const [txt, amount, esperado] of AMBIGUOS) {
  const obtido = doWebhook.leituraAlternativaDeAudio(txt, amount);
  const bate = esperado === null ? obtido === null : obtido !== null && Math.abs(obtido - esperado) < 0.005;
  if (!bate) {
    falhasAmbiguo++;
    console.log(`FALHA  leituraAlternativaDeAudio("${txt}", ${amount}) = ${obtido} (esperado ${esperado})`);
  }
}

/* A resposta da pergunta. O par é sempre (literal 1179, alternativa 11,79):
   a opção 1 é a leitura em centavos porque é a mais provável de ser a certa. */
const RESPOSTAS: [string, number | null][] = [
  ['1', 11.79],
  ['2', 1179],
  ['1️⃣', 11.79],
  ['2️⃣', 1179],
  [' 1. ', 11.79],
  ['um', 11.79],
  ['dois', 1179],
  ['primeiro', 11.79],
  ['Segunda', 1179],
  // Repetir o valor é uma resposta mais clara que o número da opção.
  ['11,79', 11.79],
  ['R$ 11,79', 11.79],
  ['1179', 1179],
  ['onze e setenta e nove', 11.79],
  // Não dá pra deduzir: melhor perguntar de novo que chutar o valor.
  ['mercado 50', null],
  ['sei lá', null],
  ['', null],
];

for (const [txt, esperado] of RESPOSTAS) {
  const obtido = doWebhook.escolherValor(txt, 1179, 11.79);
  const bate = esperado === null ? obtido === null : obtido !== null && Math.abs(obtido - esperado) < 0.005;
  if (!bate) {
    falhasAmbiguo++;
    console.log(`FALHA  escolherValor("${txt}") = ${obtido} (esperado ${esperado})`);
  }
}

/* Código de pareamento dentro da mensagem.
   O app abre o WhatsApp com a frase pronta, então o bot precisa achar o
   código no meio dela — e não pode deixar de achar quando a pessoa escreve à
   mão do jeito dela. O contrato é: o código tem que estar na lista. */
const PAREAMENTO: [string, string | null][] = [
  // A frase que o próprio app escreve.
  ['Oi! Quero vincular meu WhatsApp ao Grana. Meu código é 123456', '123456'],
  // Formato antigo, que precisa continuar valendo.
  ['123456', '123456'],
  ['  123456  ', '123456'],
  // Do jeito que gente escreve.
  ['oi, meu código é 123456', '123456'],
  ['123456 é o código', '123456'],
  ['Aqui está: 123456, obrigado!', '123456'],
  ['código 123456', '123456'],
  // Dígitos separados: só a leitura "tira tudo que não é dígito" pega.
  ['12 34 56', '123456'],
  ['123-456', '123456'],
  // Não é código nenhum: não pode virar candidato a esmo.
  ['oi', null],
  ['mercado 120 reais', null],
  ['12345', null],
  ['1234567', null],
];

let falhasPareamento = 0;
for (const [txt, esperado] of PAREAMENTO) {
  const obtidos = doWebhook.codigosCandidatos(txt);
  const achou = esperado === null ? obtidos.length === 0 : obtidos.includes(esperado);
  if (!achou) {
    falhasPareamento++;
    console.log(`FALHA  codigosCandidatos("${txt}") = [${obtidos}] (esperado ${esperado ?? 'nenhum'})`);
  }
}

/* A costura entre os dois lados: o app escreve a mensagem, o bot lê o código.
   Se alguém mexer no texto de `mensagemDePareamento` e enfiar outro número
   nele ("vincular em 2 toques", "Grana 2.0"), a soma de dígitos deixa de ser
   seis e o vínculo para de funcionar — sem erro nenhum na tela, só um
   "aguardando" eterno. Este teste é o que faz esse acidente falhar aqui. */
let falhasCostura = 0;
const CODIGOS_AMOSTRA = ['000001', '123456', '909948', '111111', '999999', '100000', '654321', '505050'];
for (const codigo of CODIGOS_AMOSTRA) {
  const msg = doWebhook.mensagemDePareamento(codigo);
  const candidatos = doWebhook.codigosCandidatos(msg);
  if (!candidatos.includes(codigo)) {
    falhasCostura++;
    console.log(`FALHA  o bot não acha o código em "${msg}" — candidatos: [${candidatos}]`);
  }
  /* O código também tem que sobreviver ao link: é assim que ele chega no
     WhatsApp, passando por encodeURIComponent e voltando. */
  const voltaDaUrl = decodeURIComponent(encodeURIComponent(msg));
  if (!doWebhook.codigosCandidatos(voltaDaUrl).includes(codigo)) {
    falhasCostura++;
    console.log(`FALHA  o código não sobreviveu à URL: "${voltaDaUrl}"`);
  }
}

const totalChecagens =
  CASOS.length +
  DIVISOES.length +
  AMBIGUOS.length +
  RESPOSTAS.length +
  PAREAMENTO.length +
  CODIGOS_AMOSTRA.length;
const totalFalhas = falhas + falhasDivisao + falhasAmbiguo + falhasPareamento + falhasCostura;
console.log(`\n${totalChecagens - totalFalhas}/${totalChecagens} passaram — ${totalFalhas} falhas`);
