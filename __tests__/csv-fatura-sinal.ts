/* CSV marcado como "fatura de cartão": a convenção de sinal é a da fatura, não
 * a do extrato (achado P1 do Harbor, 26/09/2026).
 *
 *   npx tsx __tests__/csv-fatura-sinal.ts
 *
 * Módulos REAIS: lib/heuristics.ts (parseCsvTextDetalhado, tiposDaFatura),
 * lib/ofx-parser.ts e lib/transaction-rules.ts. Antes da correção, numa fatura
 * no formato do Nubank (compra positiva, pagamento e devolução negativos), as
 * compras ficavam de fora como "entrada no cartão" e o pagamento de R$ 500
 * entrava como compra.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsvTextDetalhado, tiposDaFatura } from '../lib/heuristics';
import { parseOfx } from '../lib/ofx-parser';
import { avisoEntradasNoCartaoRecusadas, entradaNoCartao } from '../lib/transaction-rules';

let ok = 0;
const passou = (nome: string) => { ok++; console.log('  ok  ' + nome); };
const resumo = (rows: { type: string; amount: number; description: string }[]) => rows.map((r) => `${r.type} ${r.amount} ${r.description}`);
/* O que a tela de importação faz com uma fatura: reclassifica e deixa de fora o que é entrada. */
const importarFatura = <T extends Parameters<typeof tiposDaFatura>[0][number]>(rows: T[]) => {
  const naFatura = tiposDaFatura(rows);
  const aImportar = naFatura.filter((l) => l.type !== 'in');
  return { aImportar, descartadas: naFatura.length - aImportar.length };
};

const NUBANK = 'date,title,amount\n2026-09-01,Mercado Extra,120.50\n2026-09-03,Uber,18.90\n2026-09-05,Devolucao Mercado Extra,-30.00\n2026-09-10,Pagamento recebido,-500.00\n';

{
  const { rows } = parseCsvTextDetalhado(NUBANK);
  const { aImportar, descartadas } = importarFatura(rows);
  assert.deepEqual(resumo(aImportar), ['out 120.5 Mercado Extra', 'out 18.9 Uber']);
  assert.equal(descartadas, 2);
  assert.ok(aImportar.every((l) => !entradaNoCartao({ type: l.type, payment_method: 'credit' })), 'nada do que sobra é entrada no cartão');
  assert.match(avisoEntradasNoCartaoRecusadas(descartadas), /^2 linhas de entrada no cartão não foram importadas/);
  assert.doesNotMatch(avisoEntradasNoCartaoRecusadas(descartadas), /estorn/i);
  passou('fatura estilo Nubank: compras entram, pagamento e devolução ficam de fora e são contados');
}
{
  const { rows } = parseCsvTextDetalhado('date,title,amount\n2026-09-01,Mercado Extra,120.50\n2026-09-03,Pagamento recebido,500.00\n2026-09-04,Uber,18.90\n');
  const { aImportar, descartadas } = importarFatura(rows);
  assert.deepEqual(resumo(aImportar), ['out 120.5 Mercado Extra', 'out 500 Pagamento recebido', 'out 18.9 Uber']);
  assert.equal(descartadas, 0);
  passou('fatura sem nenhum negativo: tudo é compra, mesmo com texto que pareceria entrada');
}
{
  // Banco que exporta a fatura como extrato: compra negativa, crédito positivo.
  const { rows } = parseCsvTextDetalhado('data,descricao,valor\n01/09/2026,Mercado Extra,-120.50\n02/09/2026,Farmacia,-42.00\n05/09/2026,Devolucao Mercado Extra,30.00\n');
  const { aImportar, descartadas } = importarFatura(rows);
  assert.deepEqual(resumo(aImportar), ['out 120.5 Mercado Extra', 'out 42 Farmacia']);
  assert.equal(descartadas, 1);
  passou('fatura com a compra negativa: o sinal da maioria é o da compra');
}
{
  // Empate: fica com a convenção mais comum de fatura, compra positiva.
  const { rows } = parseCsvTextDetalhado('date,title,amount\n2026-09-01,Mercado Extra,120.50\n2026-09-10,Pagamento recebido,-120.50\n');
  assert.deepEqual(resumo(importarFatura(rows).aImportar), ['out 120.5 Mercado Extra']);
  passou('empate de sinais: compra positiva');
}
{
  // Modo extrato continua exatamente igual: negativo é saída, positivo é entrada.
  const { rows } = parseCsvTextDetalhado(NUBANK);
  assert.deepEqual(resumo(rows), ['in 120.5 Mercado Extra', 'in 18.9 Uber', 'out 30 Devolucao Mercado Extra', 'out 500 Pagamento recebido']);
  const extrato = parseCsvTextDetalhado('Data,Descrição,Valor\n15/08/2026,Supermercado,-187.40\n14/08/2026,Salário,6200.00\n').rows;
  assert.deepEqual(resumo(extrato), ['out 187.4 Supermercado', 'in 6200 Salário']);
  const semSinal = parseCsvTextDetalhado('Data,Descrição,Valor\n15/08/2026,Supermercado,187.40\n14/08/2026,Salário recebido,6200.00\n').rows;
  assert.deepEqual(resumo(semSinal), ['out 187.4 Supermercado', 'in 6200 Salário recebido']);
  passou('modo extrato não muda: sinal manda quando existe, texto adivinha quando não');
}
{
  // A chave de dedup acompanha o tipo reclassificado e é estável entre importações.
  const a = tiposDaFatura(parseCsvTextDetalhado(NUBANK).rows);
  const b = tiposDaFatura(parseCsvTextDetalhado(NUBANK).rows);
  assert.deepEqual(a.map((l) => l.fitid), b.map((l) => l.fitid));
  const extrato = parseCsvTextDetalhado(NUBANK).rows;
  assert.notEqual(a[0].fitid, extrato[0].fitid, 'o tipo mudou, a chave também');
  passou('chave de deduplicação estável na fatura reimportada');
}
{
  // OFX já traz o tipo como fato do arquivo: passa intacto.
  const ofx = `<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260901<TRNAMT>-120.50<FITID>a<MEMO>Mercado Extra</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905<TRNAMT>30.00<FITID>b<MEMO>Devolucao Mercado Extra</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
  const r = parseOfx(ofx);
  assert.equal(r.origem, 'cartao');
  const depois = tiposDaFatura(r.lancamentos);
  assert.deepEqual(depois, r.lancamentos);
  assert.deepEqual(resumo(importarFatura(r.lancamentos).aImportar), ['out 120.5 Mercado Extra']);
  passou('OFX de fatura não é tocado');
}
{
  // A tela de importação usa tiposDaFatura antes de separar as entradas.
  const tela = fs.readFileSync('components/ImportarExtratoModal.tsx', 'utf8');
  assert.match(tela, /const linhasNaOrigem = ehCartao \? tiposDaFatura\(linhas\) : linhas;/);
  assert.match(tela, /const aImportar = ehCartao \? linhasNaOrigem\.filter\(\(l\) => l\.type !== 'in'\) : linhasNaOrigem;/);
  assert.match(tela, /data=\{linhasNaOrigem\}/, 'a prévia mostra os tipos já reclassificados');
  assert.match(tela, /import \{ parseCsvTextDetalhado, tiposDaFatura \} from '@\/lib\/heuristics';/);
  passou('a tela de importação reclassifica a fatura antes de contar as linhas descartadas');
}

console.log(`\n${ok}/${ok} checagens do sinal do CSV de fatura passaram\n`);
