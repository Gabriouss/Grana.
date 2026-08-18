/**
 * Leitura do QR Code de NFC-e (Nota Fiscal de Consumidor Eletrônica).
 *
 * O que dá e o que NÃO dá para extrair do QR Code
 * ------------------------------------------------
 * O padrão ENCAT tem dois formatos de QR em circulação:
 *
 *   v2.00 (o mais comum hoje, emissão online):
 *     https://<sefaz-uf>/...?p=chNFe|nVersao|tpAmb|cIdToken|cHashQRCode
 *
 *   v2.00 em contingência offline, e todo o v1.00:
 *     ...?p=chNFe|nVersao|tpAmb|dhEmi|vNF|vICMS|digVal|cIdToken|cHashQRCode
 *
 * Ou seja: **o valor total (vNF) só está no QR quando a nota foi emitida em
 * contingência**. Na emissão online normal — a maioria das compras — o QR
 * carrega apenas a chave de acesso; o valor mora no site da SEFAZ, atrás de
 * um HTML diferente por estado e frequentemente com captcha. Este módulo, por
 * isso, não promete o valor: devolve `valorTotal: null` quando ele não está
 * no QR, e a tela de escaneamento pede o valor ao usuário em vez de inventar
 * um. Prefiro um campo em branco a um número errado num app de dinheiro.
 *
 * A chave de acesso de 44 dígitos, essa sim, está sempre presente, e dela
 * saem com certeza a UF emissora, o ano/mês de emissão e o CNPJ do
 * estabelecimento. É o suficiente para pré-preencher a data e evitar lançar a
 * mesma nota duas vezes (a chave é única por nota).
 */

/** Códigos de UF do IBGE, usados nos 2 primeiros dígitos da chave de acesso. */
const UF_POR_CODIGO: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

export type NotaFiscal = {
  /** Chave de acesso de 44 dígitos — identificador único da nota. */
  chaveAcesso: string;
  /** Sigla da UF emissora (ex: 'SP'), ou null se o código não for conhecido. */
  uf: string | null;
  /** CNPJ do estabelecimento, só dígitos (14). */
  cnpj: string;
  /** Data de emissão 'YYYY-MM-DD'. Quando o QR não traz dhEmi, o dia cai no dia 1º do mês da chave — ver `dataExata`. */
  dataEmissao: string;
  /** true quando a data veio de dhEmi (dia exato); false quando foi derivada do AAMM da chave (só ano/mês confiáveis). */
  dataExata: boolean;
  /** Valor total em reais, ou null quando o QR não carrega vNF (emissão online). */
  valorTotal: number | null;
  /** true = homologação (nota de teste, não vale como despesa real). */
  homologacao: boolean;
};

/** Dígito verificador da chave de acesso (módulo 11, pesos 2..9 cíclicos, da direita para a esquerda). */
function digitoVerificadorValido(chave: string): boolean {
  const base = chave.slice(0, 43);
  const dv = Number(chave[43]);
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const esperado = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return dv === esperado;
}

function extrairChave(texto: string): string | null {
  // A chave aparece ora como parâmetro `p=<chave>|...`, ora como `chNFe=<chave>`,
  // ora crua. Pegar a primeira sequência de 44 dígitos cobre os três casos sem
  // depender do formato de URL de cada estado, que varia bastante.
  const somenteDigitos = texto.replace(/\D/g, '');
  const match = texto.match(/\d{44}/) ?? somenteDigitos.match(/\d{44}/);
  return match ? match[0] : null;
}

/** Converte "123.45" (formato do vNF, sempre com ponto decimal) em número. Devolve null se não for um valor positivo. */
function parseValorNfce(bruto: string | undefined): number | null {
  if (!bruto) return null;
  const n = Number(String(bruto).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Lê `dhEmi`, que vem em ISO 8601 ou hex-encoded dependendo da versão do QR. Devolve 'YYYY-MM-DD' ou null. */
function parseDataEmissao(bruto: string | undefined): string | null {
  if (!bruto) return null;
  let texto = bruto.trim();

  // Em parte das implementações o dhEmi vem hexadecimal (padrão v1.00).
  if (/^[0-9a-f]+$/i.test(texto) && texto.length > 20 && texto.length % 2 === 0) {
    try {
      let decodificado = '';
      for (let i = 0; i < texto.length; i += 2) {
        decodificado += String.fromCharCode(parseInt(texto.slice(i, i + 2), 16));
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(decodificado)) texto = decodificado;
    } catch {
      // segue com o texto original
    }
  }

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/**
 * Interpreta o conteúdo lido de um QR Code de NFC-e.
 * Devolve null quando o texto não contém uma chave de acesso válida — o que
 * inclui QR Codes de outra natureza (link de wi-fi, Pix, etc.) apontados por
 * engano para a câmera.
 */
export function parseNfceQrCode(conteudo: string): NotaFiscal | null {
  if (!conteudo || typeof conteudo !== 'string') return null;

  const chaveAcesso = extrairChave(conteudo);
  if (!chaveAcesso || !digitoVerificadorValido(chaveAcesso)) return null;

  const uf = UF_POR_CODIGO[chaveAcesso.slice(0, 2)] ?? null;
  const ano = 2000 + Number(chaveAcesso.slice(2, 4));
  const mes = chaveAcesso.slice(4, 6);
  const cnpj = chaveAcesso.slice(6, 20);

  // Os campos extras (quando existem) vêm no parâmetro `p`, separados por "|".
  let campos: string[] = [];
  const pMatch = conteudo.match(/[?&]p=([^&\s]+)/i);
  if (pMatch) campos = decodeURIComponent(pMatch[1]).split('|');

  const tpAmb = campos[2];
  const homologacao = tpAmb === '2';

  // Layout longo (contingência / v1.00): chNFe|nVersao|tpAmb|dhEmi|vNF|vICMS|digVal|cIdToken|cHashQRCode
  const layoutLongo = campos.length >= 7;
  const dataDoQr = layoutLongo ? parseDataEmissao(campos[3]) : null;
  const valorTotal = layoutLongo ? parseValorNfce(campos[4]) : null;

  return {
    chaveAcesso,
    uf,
    cnpj,
    dataEmissao: dataDoQr ?? `${ano}-${mes}-01`,
    dataExata: dataDoQr !== null,
    valorTotal,
    homologacao,
  };
}

/** CNPJ formatado para exibição: 12.345.678/0001-99 */
export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}
