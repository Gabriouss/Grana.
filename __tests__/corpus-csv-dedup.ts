/* Chave sintética de deduplicação do importador de CSV (gerarFitidSintetico,
 * lib/heuristics.ts) — reimportar o mesmo arquivo numa migração grande (ex.:
 * retomar depois de uma falha de rede no meio do lote) precisa ser
 * reconhecido como duplicado pela mesma infraestrutura que o FITID do OFX já
 * usa, sem inventar um segundo mecanismo.
 *
 * Roda: npx tsx __tests__/corpus-csv-dedup.ts
 */
import { parseCsvTextDetalhado } from '../lib/heuristics';
import { LIMITS } from '../lib/limits';

const parseCsvText = (text: string) => parseCsvTextDetalhado(text).rows;

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

/* ---------- Sinal do valor (achado A49, 19/09/2026) ---------- */

/* O caso visto no emulador: coluna sem "tipo", uma saída com "-" e uma
   entrada positiva cuja descrição não diz nada. Entrava como saída. */
const comSinal = parseCsvText([
  'Data,Descricao,Valor',
  '10/09/2026,AUDIT import um,-12.30',
  '11/09/2026,AUDIT import dois,500.00',
].join('\n'));
checar('negativo num arquivo com sinal é saída', comSinal[0].type, 'out');
checar('positivo num arquivo com sinal é entrada, mesmo com descrição neutra', comSinal[1].type, 'in');
checar('o valor continua positivo depois de ler o sinal', comSinal[1].amount, 500);

const comSinalReal = parseCsvText(['Data;Descrição;Valor', '10/09/2026;Mercado;R$ -45,90', '12/09/2026;Transferência;R$ 1.200,00'].join('\n'));
checar('"R$ -45,90" também conta como negativo', comSinalReal[0]?.type, 'out');
checar('e "R$ 1.200,00" no mesmo arquivo é entrada', comSinalReal[1]?.type, 'in');

/* Banco que exporta tudo positivo: o sinal não diz nada, segue a descrição. */
const semSinal = parseCsvText(['Data,Descricao,Valor', '10/09/2026,Supermercado,45.90', '11/09/2026,Salário,3000.00'].join('\n'));
checar('arquivo sem nenhum negativo: despesa pela descrição', semSinal[0].type, 'out');
checar('arquivo sem nenhum negativo: salário pela descrição', semSinal[1].type, 'in');

/* Coluna "tipo" continua mandando sobre o sinal. */
const comTipo = parseCsvText(['Data,Descricao,Valor,Tipo', '10/09/2026,Estorno,-20.00,Entrada', '11/09/2026,Loja,30.00,Saída'].join('\n'));
checar('coluna tipo "Entrada" vence o sinal negativo', comTipo[0].type, 'in');
checar('coluna tipo "Saída" vence o valor positivo', comTipo[1].type, 'out');

/* O exemplo que o próprio campo do app mostra. */
const exemploDoApp = parseCsvText('Data,Descrição,Valor\n15/08/2026,Supermercado,-187.40\n14/08/2026,Salário,6200.00');
checar('exemplo do app: supermercado sai', exemploDoApp[0].type, 'out');
checar('exemplo do app: salário entra', exemploDoApp[1].type, 'in');

/* ---------- Data ISO e data impossível (achado do Codex, 19/09/2026) ---------- */

/* Antes, o regex dd/mm/aa lia "2026-09-12" como dia=26, mês=09, ano=12 — uma
   data ERRADA e silenciosa (2012-09-26), não uma falha visível. */
const csvDataIso = parseCsvText(['Data,Descricao,Valor', '2026-09-12,AUDIT iso,50.00'].join('\n'));
checar('data ISO (AAAA-MM-DD) é lida na ordem certa', csvDataIso[0].occurred_on, '2026-09-12');

/* "31 dentro de 1 a 31" não garante que a data existe — fevereiro nunca
   chega lá. Antes isso virava a data impossível "2026-02-31" (que o
   Postgres recusa ao gravar); agora cai no fallback de hoje. */
const agora = new Date();
const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
const csvDataImpossivel = parseCsvText(['Data,Descricao,Valor', '31/02/2026,AUDIT impossivel,50.00'].join('\n'));
checar('31 de fevereiro (data impossível) cai no fallback de hoje, não vira "2026-02-31"',
  csvDataImpossivel[0].occurred_on, hoje);

/* Uma data real de fim de mês continua funcionando (não é regressão do
   fallback acima: 31/01 existe de verdade). */
const csvDataRealFimDeMes = parseCsvText(['Data,Descricao,Valor', '31/01/2026,AUDIT real,50.00'].join('\n'));
checar('31 de janeiro (data real) continua sendo lida normalmente', csvDataRealFimDeMes[0].occurred_on, '2026-01-31');

/* ---------- Campo entre aspas com o delimitador embutido ---------- */

/* Antes, `line.split(',')` quebrava "Mercado, Centro" em duas colunas e
   empurrava o resto da linha (o valor de verdade) para o lado. */
const csvComAspas = parseCsvText(['data,descricao,valor', '12/09/2026,"Mercado, Centro",123.45'].join('\n'));
checar('descrição entre aspas preserva a vírgula interna', csvComAspas[0]?.description, 'Mercado, Centro');
checar('e o valor não é afetado pela vírgula dentro das aspas', csvComAspas[0]?.amount, 123.45);

console.log(`\n${total - falhas}/${total} checagens de dedup do CSV passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
