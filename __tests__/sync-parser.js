/* O parser de lançamentos existe DUAS vezes: em lib/heuristics.ts (app: voz
 * dentro do app, colar comprovante) e copiado dentro de
 * supabase/functions/whatsapp-webhook/index.ts (bot do WhatsApp, que roda em
 * Deno e não importa do app).
 *
 * Isso já causou bug real nesta sessão: uma correção aplicada só em
 * lib/heuristics.ts deixou o bot do WhatsApp quebrado, e só apareceu quando
 * um lançamento saiu errado em produção. Este script falha quando as duas
 * cópias divergem.
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

const APP = 'lib/heuristics.ts';
const WEB = 'supabase/functions/whatsapp-webhook/index.ts';

const COMPARTILHADAS = [
  'NUMERO_POR_EXTENSO', 'somarExtenso', 'segmentarExtenso', 'MOEDA', 'PALAVRA_MOEDA',
  'VERBOS_INICIAIS', 'CONECTOR', 'CONECTOR_INICIAL', 'CONECTOR_FINAL',
  'MULETA_INICIAL', 'MULETA_FINAL', 'MARCA_RECORRENCIA',
  'VALOR_INICIAL', 'VALOR_FINAL', 'FORMA_PAGAMENTO_FINAL',
  'limparSobra', 'capitalizar', 'EXPRESSAO_VALOR', 'guessDescFromText',
  'guessAmountFromText', 'normalizarParaBusca', 'contemPalavra',
];

let divergentes = 0;
let ausentes = 0;

for (const nome of COMPARTILHADAS) {
  const a = corpo(APP, nome);
  const w = corpo(WEB, nome);
  if (a === null || w === null) {
    ausentes++;
    const onde = [a === null ? 'app' : null, w === null ? 'webhook' : null].filter(Boolean).join(' e ');
    console.log('AUSENTE   ' + nome + ' — não localizada em: ' + onde);
    continue;
  }
  if (a !== w) {
    divergentes++;
    console.log('DIVERGE   ' + nome);
  }
}

const total = COMPARTILHADAS.length;
console.log('\n' + (total - divergentes - ausentes) + '/' + total + ' em sincronia — ' + divergentes + ' divergentes, ' + ausentes + ' não localizadas');
if (divergentes > 0 || ausentes > 0) process.exit(1);
