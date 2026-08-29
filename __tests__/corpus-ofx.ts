/* Leitor de extrato OFX — lib/ofx-parser.ts.
 *
 * O parser é o pedaço mais frágil da importação porque OFX 1.x não é XML: os
 * bancos brasileiros emitem SGML com tags que não fecham, data com fuso entre
 * colchetes, acento em cp1252 e valor com sinal. Cada um desses detalhes já é
 * um jeito diferente de o arquivo entrar errado sem ninguém perceber, e um
 * lançamento importado com data ou sinal trocado só aparece como saldo errado
 * semanas depois.
 *
 * Roda: npx tsx __tests__/corpus-ofx.ts
 */
import { parseOfx, decodificarLatin1, decodificarOfx, base64ParaBytes } from '../lib/ofx-parser';

let total = 0;
let falhas = 0;

function checar(nome: string, condicao: boolean, detalhe?: string) {
  total++;
  if (!condicao) {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/* ── OFX 1.x: SGML sem fechamento de tag, que é o caso real dos bancos ──── */
const OFX_1X = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815120000[-3:BRT]
<TRNAMT>-187.40
<FITID>A001
<MEMO>SUPERMERCADO PAO DE ACUCAR
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805000000[-3:BRT]
<TRNAMT>6200.00
<FITID>A002
<MEMO>SALARIO EMPRESA
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const r1 = parseOfx(OFX_1X);
checar('1.x: lê as duas transações', r1.lancamentos.length === 2, `veio ${r1.lancamentos.length}`);
checar('1.x: reconhece conta corrente', r1.origem === 'conta', r1.origem);
checar('1.x: lê a moeda', r1.moeda === 'BRL', String(r1.moeda));
checar('1.x: lê a conta', r1.contaOuCartao === '12345-6', String(r1.contaOuCartao));

const saida = r1.lancamentos[0];
checar('1.x: valor negativo vira saída', saida?.type === 'out', saida?.type);
checar('1.x: valor sai sem sinal', saida?.amount === 187.4, String(saida?.amount));
checar('1.x: data descarta o fuso', saida?.occurred_on === '2026-08-15', String(saida?.occurred_on));
checar('1.x: guarda o FITID', saida?.fitid === 'A001', String(saida?.fitid));
checar('1.x: descrição vem do MEMO', /SUPERMERCADO/.test(saida?.description ?? ''), saida?.description);
checar('1.x: categoriza pelo texto', saida?.category === 'Alimentação', saida?.category);

const entrada = r1.lancamentos[1];
checar('1.x: valor positivo vira entrada', entrada?.type === 'in', entrada?.type);
checar('1.x: entrada categorizada', entrada?.category === 'Salário', entrada?.category);

/* ── OFX 2.x: XML de verdade, com tags fechadas e entidade escapada ────── */
const OFX_2X = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
  <CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
    <CURDEF>BRL</CURDEF>
    <CCACCTFROM><ACCTID>4111********1111</ACCTID></CCACCTFROM>
    <BANKTRANLIST>
      <STMTTRN>
        <TRNTYPE>DEBIT</TRNTYPE>
        <DTPOSTED>20260812000000</DTPOSTED>
        <TRNAMT>-59.90</TRNAMT>
        <FITID>C900</FITID>
        <NAME>POSTO SHELL</NAME>
        <MEMO>COMBUSTIVEL &amp; CONVENIENCIA</MEMO>
      </STMTTRN>
    </BANKTRANLIST>
  </CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

const r2 = parseOfx(OFX_2X);
checar('2.x: lê a transação', r2.lancamentos.length === 1, `veio ${r2.lancamentos.length}`);
checar('2.x: reconhece fatura de cartão', r2.origem === 'cartao', r2.origem);
checar('2.x: valor com tag fechada', r2.lancamentos[0]?.amount === 59.9, String(r2.lancamentos[0]?.amount));
checar('2.x: desescapa entidade', /&/.test(r2.lancamentos[0]?.description ?? ''), r2.lancamentos[0]?.description);
checar('2.x: junta NAME e MEMO', /POSTO SHELL/.test(r2.lancamentos[0]?.description ?? ''), r2.lancamentos[0]?.description);

/* ── Casos que precisam ser descartados sem derrubar o resto ───────────── */
const OFX_SUJO = `<OFX><BANKMSGSRSV1><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260801<TRNAMT>-10.00<FITID>B1<MEMO>VALIDO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>SEMDATA<TRNAMT>-20.00<FITID>B2<MEMO>SEM DATA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260802<TRNAMT>0.00<FITID>B3<MEMO>VALOR ZERO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260803<FITID>B4<MEMO>SEM VALOR</STMTTRN>
</BANKTRANLIST></BANKMSGSRSV1></OFX>`;

const r3 = parseOfx(OFX_SUJO);
checar('sujo: mantém só a linha válida', r3.lancamentos.length === 1, `veio ${r3.lancamentos.length}`);
checar('sujo: a que sobrou é a certa', r3.lancamentos[0]?.fitid === 'B1', String(r3.lancamentos[0]?.fitid));

/* Valor com vírgula decimal, que alguns emissores mandam fora do padrão. */
const r4 = parseOfx('<OFX><STMTTRN><DTPOSTED>20260801<TRNAMT>-1234,56<FITID>V1<MEMO>X</STMTTRN></OFX>');
checar('vírgula decimal aceita', r4.lancamentos[0]?.amount === 1234.56, String(r4.lancamentos[0]?.amount));

/* Sem sinal no valor, o TRNTYPE desempata. */
const r5 = parseOfx('<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260801<TRNAMT>50.00<FITID>S1<MEMO>X</STMTTRN></OFX>');
checar('sem sinal: positivo continua entrada', r5.lancamentos[0]?.type === 'in', r5.lancamentos[0]?.type);

/* Arquivo que não é OFX não pode virar lançamento nenhum. */
checar('texto qualquer devolve vazio', parseOfx('Data,Descrição,Valor\n01/08,X,10').lancamentos.length === 0);
checar('string vazia devolve vazio', parseOfx('').lancamentos.length === 0);

/* ── Codificação: o acento é o que quebra na prática ───────────────────── */
const bytesLatin = new Uint8Array([0x50, 0xe3, 0x6f, 0x20, 0x64, 0x65, 0x20, 0x41, 0xe7, 0xfa, 0x63, 0x61, 0x72]);
checar('cp1252 decodifica acento', decodificarLatin1(bytesLatin) === 'Pão de Açúcar', decodificarLatin1(bytesLatin));

const cabecalhoLatin = `OFXHEADER:100\nCHARSET:1252\n\n<OFX>`;
const bytesComCabecalho = new Uint8Array([...cabecalhoLatin].map((c) => c.charCodeAt(0)).concat([0xe7]));
checar('detecta cp1252 pelo cabeçalho', decodificarOfx(bytesComCabecalho).endsWith('ç'), JSON.stringify(decodificarOfx(bytesComCabecalho).slice(-3)));

/* UTF-8 declarado tem que passar intacto. */
const utf8 = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><OFX>ção');
checar('detecta UTF-8 pelo cabeçalho', decodificarOfx(utf8).endsWith('ção'), decodificarOfx(utf8).slice(-4));

/* base64 → bytes, o caminho do arquivo lido no nativo. */
checar('base64 volta os bytes certos', decodificarLatin1(base64ParaBytes('UMOjbw==')) === 'PÃ£o', decodificarLatin1(base64ParaBytes('UMOjbw==')));

console.log(`\n${total - falhas}/${total} checagens do leitor OFX passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
