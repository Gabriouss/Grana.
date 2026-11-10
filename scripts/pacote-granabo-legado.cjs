#!/usr/bin/env node
'use strict';
/*
 * Monta o pacote do `assistente-financeiro` que serve o APK 1.10.12 de hoje:
 * o código publicado em produção (v60, deploy de 21/10/2026, igual à
 * `cca3afba` nos 11 módulos locais do pacote) mais SÓ a regra que proíbe
 * recomendar empréstimo ou investimento (3b), copiada do `index.ts` deste
 * repositório no HEAD.
 *
 * Por que existe (decisões do autor de 09/11/2026, 21:10 e 21:20): o app de
 * hoje fica como está, sem build nova, e o clone é a fonte única do servidor.
 * O `supabase/functions` daqui já tem o Livre da regra 20, as categorias de
 * entrada (T7) e a descrição com barra, que o APK 1.10.12 não conhece:
 * publicá-lo mudaria o que o Granabô responde para quem usa o app hoje. Até o
 * servidor distinguir o app da Play (desenho da P1), o Granabô sai daqui.
 *
 * Uso: node scripts/pacote-granabo-legado.cjs <pasta-de-saida-vazia> [--sem-veto] [--repo <raiz>]
 *   --sem-veto  monta o pacote igual ao de produção: teste vermelho e retorno.
 * Publicação, só pelo Supremo e com o ok do autor:
 *   supabase functions deploy assistente-financeiro --workdir <pasta-de-saida> --project-ref <ref> --use-api
 */
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');

const BASE = 'cca3afba939c311426c9dcc40677ee92a34fdf1e';
const FUNCAO = 'supabase/functions/assistente-financeiro/index.ts';
const MODULOS = [
  'supabase/functions/_shared/ai-quota.ts',
  'supabase/functions/_shared/assistant-learning.ts',
  'supabase/functions/_shared/caixa.ts',
  'supabase/functions/_shared/category-keywords.ts',
  'supabase/functions/_shared/fatura-ciclo.ts',
  'supabase/functions/_shared/finance-command.ts',
  'supabase/functions/_shared/interpretar-lancamento.ts',
  'supabase/functions/_shared/livre-para-gastar.ts',
  'supabase/functions/_shared/request-body.ts',
  'supabase/functions/_shared/seguranca.ts',
  FUNCAO,
];
/* Fim da regra de caixa em REGRAS_PRIORITARIAS: o veto entra logo depois dela. */
const ANCORA = "o caixa só muda no pagamento da fatura.';";
const ANCORA_COM_VETO = "o caixa só muda no pagamento da fatura. ' +";
const INICIO_VETO = '/* Decisão do autor em 09/11/2026: recomendação de empréstimo ou investimento';
const FIM_VETO = "faturas e metas.';";

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function git(raiz, args) {
  return cp.execFileSync('git', ['-C', raiz, ...args], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
}

/* As linhas do veto no index.ts do repositório, da abertura do comentário ao fim de REGRAS_PRIORITARIAS. */
function extrairVeto(fonte) {
  const linhas = fonte.split('\n');
  const abertura = linhas.filter((l) => l.includes(INICIO_VETO)).length;
  if (abertura !== 1) throw new Error('veto ausente ou repetido no index.ts do repositório');
  const i = linhas.findIndex((l) => l.includes(INICIO_VETO));
  const f = linhas.findIndex((l, n) => n > i && l.trimEnd().endsWith(FIM_VETO));
  if (f < 0) throw new Error('fim do veto não encontrado no index.ts do repositório');
  if (!linhas[i - 1].trimEnd().endsWith(ANCORA_COM_VETO)) throw new Error('o veto não está logo depois da regra de caixa');
  return linhas.slice(i, f + 1).join('\n');
}

function montar(saida, { comVeto = true, raiz = path.resolve(__dirname, '..') } = {}) {
  if (fs.existsSync(saida) && fs.readdirSync(saida).length) throw new Error('a pasta de saída precisa estar vazia: ' + saida);
  if (git(raiz, ['rev-parse', '--verify', BASE + '^{commit}']).toString().trim() !== BASE) throw new Error('commit de produção ausente');
  const arquivos = {};
  for (const m of MODULOS) arquivos[m] = git(raiz, ['show', BASE + ':' + m]);
  if (comVeto) {
    const producao = arquivos[FUNCAO].toString('utf8');
    if (producao.includes('\r')) throw new Error('fim de linha inesperado no blob de produção');
    if (producao.split(ANCORA).length !== 2) throw new Error('âncora da regra de caixa ausente ou repetida na produção');
    if (producao.includes(INICIO_VETO)) throw new Error('a produção já tem o veto');
    const veto = extrairVeto(git(raiz, ['show', 'HEAD:' + FUNCAO]).toString('utf8').split('\r\n').join('\n'));
    const inserido = ANCORA_COM_VETO + '\n' + veto;
    const novo = producao.replace(ANCORA, () => inserido);
    /* Prova de que só o veto entrou: desfazer a inserção devolve a produção byte a byte. */
    if (novo.replace(inserido, () => ANCORA) !== producao) throw new Error('a montagem mudou mais que o veto');
    arquivos[FUNCAO] = Buffer.from(novo, 'utf8');
  }
  for (const [m, b] of Object.entries(arquivos)) {
    const destino = path.join(saida, m);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, b);
  }
  return { base: BASE, comVeto, sha256: Object.fromEntries(Object.entries(arquivos).map(([m, b]) => [m, sha(b)])) };
}

module.exports = { montar, BASE, MODULOS, FUNCAO };

if (require.main === module) {
  const args = process.argv.slice(2);
  const iRepo = args.indexOf('--repo');
  const raiz = iRepo >= 0 ? path.resolve(args[iRepo + 1]) : undefined;
  const saida = args.find((a, n) => !a.startsWith('--') && (iRepo < 0 || n !== iRepo + 1));
  if (!saida) {
    console.error('uso: node scripts/pacote-granabo-legado.cjs <pasta-de-saida-vazia> [--sem-veto] [--repo <raiz>]');
    process.exit(2);
  }
  const r = montar(path.resolve(saida), { comVeto: !args.includes('--sem-veto'), ...(raiz ? { raiz } : {}) });
  console.log(JSON.stringify(r, null, 1));
  console.log('Publicação (só o Supremo, com o ok do autor): supabase functions deploy assistente-financeiro --workdir "'
    + path.resolve(saida) + '" --project-ref <ref> --use-api');
}
