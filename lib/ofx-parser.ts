import type { TxType } from './types';
import { guessCategoryFromText } from './heuristics';
import { LIMITS } from './limits';

/**
 * Leitor de extrato OFX (Open Financial Exchange).
 *
 * ── Por que um parser próprio, e não uma lib ────────────────────────────────
 *
 * Os bancos brasileiros emitem quase sempre **OFX 1.x, que NÃO é XML**. É SGML
 * com tags que simplesmente não fecham:
 *
 *     <STMTTRN>
 *     <TRNTYPE>DEBIT
 *     <DTPOSTED>20260815120000[-3:BRT]
 *     <TRNAMT>-187.40
 *     <FITID>20260815001234
 *     <MEMO>SUPERMERCADO PAO DE ACUCAR
 *     </STMTTRN>
 *
 * Nenhum parser de XML aceita isso, e as libs de OFX do npm são feitas para
 * Node (dependem de Buffer e de módulos de stream). O varredor abaixo lê tag a
 * tag e para o valor no próximo `<` ou fim de linha, que é exatamente a regra
 * do SGML do OFX 1.x — e funciona igual no OFX 2.x, que é XML de verdade, já
 * que ali o valor termina na tag de fechamento, que também começa com `<`.
 *
 * ── Por que isto não é Open Finance ─────────────────────────────────────────
 *
 * Vale deixar escrito porque a distinção sustenta o posicionamento do produto:
 * o arquivo OFX é baixado pela própria pessoa no site do banco dela e entregue
 * ao app. Não existe credencial bancária, token, consentimento de agregador ou
 * conexão de qualquer espécie. A regra do PRODUCT.md ("nunca pedir credencial
 * bancária") continua valendo inteira.
 */

/** Uma transação lida do arquivo, já no formato que o app insere. */
export type LancamentoOfx = {
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string; // 'YYYY-MM-DD'
  /** Identificador único da transação no banco emissor. É o que evita duplicata. */
  fitid: string | null;
};

export type OrigemOfx = 'conta' | 'cartao';

export type ResultadoOfx = {
  lancamentos: LancamentoOfx[];
  /** `cartao` quando o arquivo é fatura de cartão (CREDITCARDMSGSRSV1). */
  origem: OrigemOfx;
  /** Quantas transações o arquivo tinha antes de qualquer corte. */
  totalNoArquivo: number;
  /** true quando o teto de linhas cortou parte do arquivo. */
  truncado: boolean;
  /** Número da conta ou do cartão, quando o arquivo informa. Só exibição. */
  contaOuCartao: string | null;
  /** Moeda declarada. Serve para avisar quando não é BRL. */
  moeda: string | null;
};

/**
 * Valor de uma tag em SGML/XML tolerante.
 *
 * No OFX 1.x o valor vai do fim da tag de abertura até o próximo `<` (que pode
 * ser a próxima tag de abertura, já que não há fechamento) ou até a quebra de
 * linha. Os dois critérios juntos cobrem também o OFX 2.x, onde o `<` é sempre
 * a tag de fechamento.
 */
function lerTag(bloco: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = bloco.match(re);
  if (!m) return null;
  const valor = m[1].trim();
  return valor.length ? valor : null;
}

/**
 * `20260815120000[-3:BRT]` → `2026-08-15`.
 *
 * O fuso entre colchetes é DESCARTADO de propósito. Converter para o fuso local
 * moveria lançamentos de meia-noite para o dia anterior ou seguinte, e o que a
 * pessoa reconhece no extrato é a data que o banco imprimiu, não o instante UTC.
 */
function dataOfx(bruto: string | null): string | null {
  if (!bruto) return null;
  const m = bruto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  const nMes = Number(mes);
  const nDia = Number(dia);
  if (nMes < 1 || nMes > 12 || nDia < 1 || nDia > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

/** Desfaz as cinco entidades que o OFX 2.x pode trazer. */
function desescapar(texto: string): string {
  return texto
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

/**
 * Tipo do lançamento.
 *
 * O sinal de `TRNAMT` manda, e é por isso que OFX é mais confiável que CSV
 * aqui: no CSV o tipo é adivinhado pelo texto, enquanto no OFX o banco já
 * declara se saiu ou entrou dinheiro. `TRNTYPE` entra só como desempate quando
 * o valor vem sem sinal, o que alguns emissores fazem.
 */
function tipoDoLancamento(valorBruto: number, trnType: string | null): TxType {
  if (valorBruto < 0) return 'out';
  if (valorBruto > 0) return 'in';
  return /^(credit|dep|int|div|directdep|xfer)/i.test(trnType ?? '') ? 'in' : 'out';
}

export function parseOfx(texto: string): ResultadoOfx {
  const vazio: ResultadoOfx = {
    lancamentos: [],
    origem: 'conta',
    totalNoArquivo: 0,
    truncado: false,
    contaOuCartao: null,
    moeda: null,
  };
  if (!texto || !/<OFX>/i.test(texto)) return vazio;

  /* Corta antes de processar, mesmo motivo do importador de CSV: um arquivo
     gigante estoura a memória no split antes de chegar ao teto de linhas. */
  const conteudo = texto.length > LIMITS.pastedText ? texto.slice(0, LIMITS.pastedText) : texto;

  /* Fatura de cartão usa outra árvore de mensagens que a de conta corrente.
     A diferença importa: uma vira compra no crédito, a outra vira saída de
     caixa. */
  const origem: OrigemOfx = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(conteudo) ? 'cartao' : 'conta';

  const contaOuCartao = lerTag(conteudo, 'ACCTID');
  const moeda = lerTag(conteudo, 'CURDEF');

  /* Cada `<STMTTRN>` é uma transação. O split evita depender de `</STMTTRN>`,
     que alguns emissores omitem. */
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1);
  const totalNoArquivo = blocos.length;

  const lancamentos: LancamentoOfx[] = [];
  for (const bruto of blocos) {
    if (lancamentos.length >= LIMITS.csvRows) break;

    const bloco = bruto.split(/<\/STMTTRN>/i)[0];

    const valorTexto = lerTag(bloco, 'TRNAMT');
    if (!valorTexto) continue;
    /* O separador decimal do OFX é sempre ponto, mas emissores brasileiros
       às vezes mandam vírgula. Aceita os dois em vez de descartar a linha. */
    const valorBruto = Number(valorTexto.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(valorBruto) || valorBruto === 0) continue;

    const occurred_on = dataOfx(lerTag(bloco, 'DTPOSTED') ?? lerTag(bloco, 'DTUSER'));
    if (!occurred_on) continue;

    /* MEMO costuma ser mais descritivo que NAME nos bancos brasileiros; quando
       os dois existem e dizem coisas diferentes, os dois juntos ajudam a
       heurística de categoria a acertar. */
    const memo = lerTag(bloco, 'MEMO');
    const name = lerTag(bloco, 'NAME');
    const partes = [name, memo].filter(Boolean) as string[];
    const unicas = [...new Set(partes.map((p) => desescapar(p)))];
    const descricao = (unicas.join(' · ') || 'Lançamento importado').slice(0, LIMITS.description);

    const trnType = lerTag(bloco, 'TRNTYPE');
    const type = tipoDoLancamento(valorBruto, trnType);
    const categoria = guessCategoryFromText(descricao);

    lancamentos.push({
      type,
      description: descricao,
      amount: Math.abs(valorBruto),
      category: categoria.name,
      color: categoria.color,
      occurred_on,
      fitid: lerTag(bloco, 'FITID'),
    });
  }

  return {
    lancamentos,
    origem,
    totalNoArquivo,
    truncado: totalNoArquivo > lancamentos.length,
    contaOuCartao,
    moeda,
  };
}

/**
 * Tabela cp1252 → Unicode das posições 0x80–0x9F.
 *
 * OFX brasileiro quase sempre vem em cp1252 ou ISO-8859-1, e lido como UTF-8
 * "Pão de Açúcar" vira lixo. Nas duas codificações os bytes 0xA0–0xFF já batem
 * com o code point Unicode; só a faixa 0x80–0x9F diverge, e é ela que esta
 * tabela cobre. Escrita à mão porque o `TextDecoder` do Hermes não traz
 * codificações além de UTF-8.
 */
const CP1252_ALTOS = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/** Bytes em cp1252/ISO-8859-1 → string. */
export function decodificarLatin1(bytes: Uint8Array): string {
  let saida = '';
  for (const b of bytes) {
    saida += String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_ALTOS[b - 0x80] : b);
  }
  return saida;
}

/**
 * Decide como interpretar os bytes do arquivo.
 *
 * O cabeçalho do OFX 1.x declara a codificação em texto puro
 * (`ENCODING:USASCII` + `CHARSET:1252`, ou `ENCODING:UTF-8`). O do 2.x é uma
 * declaração XML. Quando o cabeçalho não resolve, o desempate é procurar
 * sequência UTF-8 inválida: se houver, é latin.
 */
export function decodificarOfx(bytes: Uint8Array): string {
  const amostra = decodificarLatin1(bytes.slice(0, 512)).toUpperCase();
  const declaraUtf8 = /ENCODING:\s*UTF-8|CHARSET\s*=\s*["']?UTF-8/.test(amostra);

  if (declaraUtf8) return decodificarUtf8(bytes);

  const declaraLatin = /CHARSET:\s*(1252|8859-1|LATIN1)|ENCODING:\s*USASCII/.test(amostra);
  if (declaraLatin) return decodificarLatin1(bytes);

  /* Sem cabeçalho confiável: tenta UTF-8 e cai para latin se aparecer o
     caractere de substituição, que é o sinal de bytes inválidos. */
  const comoUtf8 = decodificarUtf8(bytes);
  return comoUtf8.includes('�') ? decodificarLatin1(bytes) : comoUtf8;
}

function decodificarUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  /* Hermes antigo sem TextDecoder: decodificação manual de UTF-8. */
  let saida = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) {
      saida += String.fromCharCode(b);
      i += 1;
    } else if (b >= 0xc0 && b < 0xe0 && i + 1 < bytes.length) {
      saida += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b >= 0xe0 && b < 0xf0 && i + 2 < bytes.length) {
      saida += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      saida += '�';
      i += 1;
    }
  }
  return saida;
}

/** base64 → bytes, sem depender de `atob` (mesmo motivo de lib/profile.ts). */
const ALFABETO_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ParaBytes(b64: string): Uint8Array {
  const limpo = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.max(0, Math.floor((limpo.length * 3) / 4)));
  let acumulador = 0;
  let bits = 0;
  let escritos = 0;
  for (const caractere of limpo) {
    const valor = ALFABETO_B64.indexOf(caractere);
    if (valor < 0) continue;
    acumulador = (acumulador << 6) | valor;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (escritos < bytes.length) bytes[escritos++] = (acumulador >> bits) & 0xff;
    }
  }
  return bytes;
}
