/* Chave sintética de deduplicação do importador de CSV (gerarFitidSintetico,
 * lib/heuristics.ts) — reimportar o mesmo arquivo numa migração grande (ex.:
 * retomar depois de uma falha de rede no meio do lote) precisa ser
 * reconhecido como duplicado pela mesma infraestrutura que o FITID do OFX já
 * usa, sem inventar um segundo mecanismo.
 *
 * Roda: npx tsx __tests__/corpus-csv-dedup.ts
 */
import { parseCsvText } from '../lib/heuristics';
import { LIMITS } from '../lib/limits';

let falhas = 0;
let total = 0;
function checar<T>(rotulo: string, obtido: T, esperado: T) {
  total++;
  if (obtido !== esperado) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
}

const CSV_BASE = [
  'Data,Descrição,Valor,Categoria',
  '15/08/2026,Supermercado,-187.40,Alimentação',
  '14/08/2026,Salário,6200.00,Salário',
].join('\n');

/* ---------- Mesma linha, duas leituras do mesmo arquivo — mesma chave ---------- */

const p1 = parseCsvText(CSV_BASE);
const p2 = parseCsvText(CSV_BASE);
checar('reimportar o mesmo arquivo gera a mesma chave (linha 1)', p1[0].fitid, p2[0].fitid);
checar('reimportar o mesmo arquivo gera a mesma chave (linha 2)', p1[1].fitid, p2[1].fitid);

/* ---------- Toda linha tem chave, nenhuma nula ---------- */

checar('linha 1 tem fitid não vazio', p1[0].fitid.length > 0, true);
checar('linha 2 tem fitid não vazio', p1[1].fitid.length > 0, true);

/* ---------- Linhas diferentes geram chaves diferentes ---------- */

checar('linhas de conteúdo diferente têm chaves diferentes', p1[0].fitid !== p1[1].fitid, true);

/* ---------- Mesma data/valor, descrição diferente — chaves diferentes ---------- */

const csvDescDiferente = [
  'Data,Descrição,Valor,Categoria',
  '15/08/2026,Farmácia,-187.40,Saúde',
].join('\n');
const p3 = parseCsvText(csvDescDiferente);
checar(
  'mesma data e valor, descrição diferente — chave diferente da linha 1 original',
  p3[0].fitid !== p1[0].fitid,
  true
);

/* ---------- Chave cabe no teto de 255 caracteres da coluna fitid ---------- */

const descricaoNoTeto = 'x'.repeat(500); // bem acima de LIMITS.description
const csvDescLonga = ['Data,Descrição,Valor', `01/01/2026,${descricaoNoTeto},-10,00`].join('\n');
const p4 = parseCsvText(csvDescLonga);
checar('descrição é truncada a LIMITS.description', p4[0].description.length, LIMITS.description);
checar('chave sintética cabe no teto de 255 da coluna fitid', p4[0].fitid.length <= 255, true);

/* ---------- Entrada e saída no mesmo dia/valor não colidem (tipo entra na chave) ---------- */

const csvEntradaSaida = [
  'Data,Descrição,Valor,Tipo',
  '10/08/2026,Reembolso,100.00,Entrada',
  '10/08/2026,Reembolso,100.00,Saída',
].join('\n');
const p5 = parseCsvText(csvEntradaSaida);
checar('entrada e saída de mesmo valor/descrição/data não colidem', p5[0].fitid !== p5[1].fitid, true);

console.log(`\n${total - falhas}/${total} checagens de dedup do CSV passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
