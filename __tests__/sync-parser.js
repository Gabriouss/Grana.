/* Código do app que também existe copiado dentro de uma Edge Function. As
 * Edge Functions rodam em Deno e não importam do app, então o mesmo código
 * vive em dois arquivos — e duas cópias que ninguém compara sempre divergem.
 *
 * Isso já causou bug real: uma correção aplicada só em lib/heuristics.ts
 * deixou o bot do WhatsApp quebrado, e só apareceu quando um lançamento saiu
 * errado em produção. Este script falha quando as cópias divergem.
 *
 * Hoje são dois pares:
 *  - o parser de lançamentos (app: voz e colar comprovante / bot do WhatsApp);
 *  - a guarda ortográfica das notas de versão (CLI pré-build e testes /
 *    webhook do EAS, que é quem de fato escreve o texto no banco).
 *
 * Rode: node __tests__/sync-parser.js
 */
const fs = require('fs');

function corpo(arquivo, nome) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
  const re = new RegExp('^(?:export )?(?:async )?(?:function|const) ' + nome + '(?![A-Za-z0-9_])');
  const i = linhas.findIndex((l) => re.test(l));
  if (i === -1) return null;

  let profundidade = 0;
  const out = [];
  for (let j = i; j < linhas.length; j++) {
    out.push(linhas[j]);
    for (const ch of linhas[j]) {
      if (ch === '{' || ch === '[' || ch === '(') profundidade++;
      if (ch === '}' || ch === ']' || ch === ')') profundidade--;
    }
    if (profundidade <= 0 && /[;}]\s*$/.test(linhas[j])) break;
  }
  /* Compara só a lógica: espaçamento e comentários não contam. Os comentários
     divergem de propósito entre as cópias (um fala "app", outro "bot"). */
  return (
    out
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      /* Diferenças conhecidas e legítimas entre as cópias — normalizadas pra
         o verificador só apitar em divergência de LÓGICA:
         - o app exporta as funções, o webhook não;
         - o app tem o tipo TxType, o webhook escreve a união na mão;
         - a função de normalizar fala tem nome diferente em cada lado;
         - a lista de categorias vem de estruturas diferentes. */
      .replace(/^export /, '')
      .replace(/TxType/g, "'in' | 'out'")
      .replace(/normalizarTextoTranscrito/g, 'normalizarTexto')
      .replace(/CATEGORIES\.map\(\(c\) => c\.name\)/g, 'LISTA_CATEGORIAS')
      .replace(/Object\.keys\(CATEGORY_KEYWORDS\)/g, 'LISTA_CATEGORIAS')
      .replace(/\s+/g, ' ')
      .trim()
  );
}


/* Cada entrada é o nome da função; quando ela se chama diferente nos dois
   arquivos, vira [nomeNoApp, nomeNoWebhook]. */
const COMPARTILHADAS = [
  'NUMERO_POR_EXTENSO', 'somarExtenso', 'segmentarExtenso', 'MOEDA', 'PALAVRA_MOEDA',
  /* A função mais importante do lançamento por voz — é ela que transforma
     "trinta e quatro e sessenta e cinco" em "34,65". Ficou de fora desta
     lista desde o começo, embora a normalização de nomes acima já existisse
     pra ela: o guarda sabia traduzir o nome e nunca comparava o corpo. */
  ['normalizarTexto', 'normalizarTextoTranscrito'],
  'VERBOS_INICIAIS', 'CONECTOR', 'CONECTOR_INICIAL', 'CONECTOR_FINAL',
  'MULETA_INICIAL', 'MULETA_FINAL', 'MARCA_RECORRENCIA',
  'VALOR_INICIAL', 'VALOR_FINAL', 'FORMA_PAGAMENTO_FINAL', 'VENCIMENTO_FINAL', 'PARCELAMENTO_FINAL',
  'limparCaudaDeMetadado', 'limparSobra', 'capitalizar', 'EXPRESSAO_VALOR', 'guessDescFromText',
  'guessAmountFromText', 'normalizarParaBusca', 'contemPalavra',
  'parseParcelas', 'ehIntencaoCredito', 'matchCardByText',
  'ehIntencaoBoleto', 'parseDiaVencimento',
];

/* A guarda ortográfica das notas de versão. Divergir aqui é pior que no
   parser: o webhook é quem escreve o texto que abre no pop-up de novidades,
   então uma regra corrigida só no lado do app não protegeria nada. */
const NOTAS_RELEASE = [
  'ACENTUADAS_OBRIGATORIAS', 'REGRAS_DE_SUFIXO', 'PREFIXO_COMMIT',
  'palavrasDe', 'validarNotaRelease', 'notaEhPublicavel',
];

const PARES = [
  { app: 'lib/heuristics.ts', web: 'supabase/functions/whatsapp-webhook/index.ts', funcoes: COMPARTILHADAS },
  { app: 'lib/notas-release.ts', web: 'supabase/functions/eas-build-webhook/index.ts', funcoes: NOTAS_RELEASE },
];

let divergentes = 0;
let ausentes = 0;
let total = 0;

for (const par of PARES) {
  for (const entrada of par.funcoes) {
    total++;
    const [nomeApp, nomeWeb] = Array.isArray(entrada) ? entrada : [entrada, entrada];
    const nome = nomeApp;
    const a = corpo(par.app, nomeApp);
    const w = corpo(par.web, nomeWeb);
    if (a === null || w === null) {
      ausentes++;
      const onde = [a === null ? par.app : null, w === null ? par.web : null].filter(Boolean).join(' e ');
      console.log('AUSENTE   ' + nome + ' — não localizada em: ' + onde);
      continue;
    }
    if (a !== w) {
      divergentes++;
      console.log('DIVERGE   ' + nome + ' — ' + par.app + ' vs ' + par.web);
    }
  }
}

console.log('\n' + (total - divergentes - ausentes) + '/' + total + ' em sincronia — ' + divergentes + ' divergentes, ' + ausentes + ' não localizadas');
if (divergentes > 0 || ausentes > 0) process.exit(1);
