/* Categorias que o USUÁRIO criou (fora das 9 padrão) precisam ser
 * reconhecidas por voz/texto tanto no bot do WhatsApp quanto no
 * reconhecimento dentro do app (colar comprovante) — antes desta rodada,
 * as duas só conheciam CATEGORY_KEYWORDS, uma lista fixa de 9 categorias, e
 * uma categoria nova cadastrada no gerenciador do app nunca era encontrada
 * mesmo dizendo o nome dela exatamente (ver comentário em
 * supabase/schema.sql sobre `categories`).
 *
 * `matchCategoryByKeyword`/`matchCategoryByReply` só existem no webhook —
 * extraídas do ARQUIVO REAL (ver __tests__/extrair.ts), não copiadas, pra
 * este teste não passar enquanto o bot está quebrado de verdade.
 * `guessCategoryFromText` é a função irmã do app, importada normalmente
 * (é um módulo TS puro, não Deno).
 *
 * Roda: npx tsx __tests__/corpus-categorias-custom.ts
 */
import { guessCategoryFromText } from '../lib/heuristics';
import { corpoDaFuncao } from './extrair';

const NOMES = ['CATEGORY_KEYWORDS', 'normalizarParaBusca', 'contemPalavra', 'matchCategoryByKeyword', 'matchCategoryByReply'];
const fonte = NOMES.map((n) => corpoDaFuncao(n)).join('\n\n');
const bot = new Function(
  /* CATEGORIES não é extraída direto (tem anotação de tipo objeto literal
     que a limpeza ingênua não desmonta) — reconstruída aqui a partir das
     chaves de CATEGORY_KEYWORDS, equivalente pro que este teste checa (o
     NOME escolhido, não a cor). Mesmo truque de corpus-whatsapp-gerado.ts. */
  `${fonte}
   const CATEGORIES = Object.keys(CATEGORY_KEYWORDS).map((name) => ({ name, color: '' }));
   return { matchCategoryByKeyword, matchCategoryByReply };`
)() as {
  matchCategoryByKeyword: (t: string, extras?: { name: string; color: string }[]) => { name: string } | null;
  matchCategoryByReply: (t: string, extras?: { name: string; color: string }[]) => { name: string } | null;
};

const PET = { name: 'Pet', color: '#a35' };
const IGREJA = { name: 'Igreja', color: '#3a5' };
const EXTRAS = [PET, IGREJA];

let falhas = 0;
let total = 0;
function checar(rotulo: string, obtido: string | null, esperado: string | null) {
  total++;
  if (obtido !== esperado) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${obtido} (esperado ${esperado})`);
  }
}

/* ---------- matchCategoryByKeyword (webhook) ---------- */

// Sem `extras`, uma categoria custom nunca é encontrada — comportamento de
// ANTES desta rodada, precisa continuar assim quando ninguém passa a lista.
// (frase escolhida sem nenhuma keyword fixa, pra isolar o que está sendo
// testado — "ração"/"veterinário" já são keyword de "Outros"/"Saúde" e
// confundiriam esta checagem específica com a de baixo.)
checar('sem extras, "gasto com o gato" (Pet)', bot.matchCategoryByKeyword('gasto com o gato 40 reais')?.name ?? null, null);

// Com `extras`, o nome da categoria custom é reconhecido no meio da frase.
checar('com extras, menciona "pet" explicitamente', bot.matchCategoryByKeyword('gasto com o gato 40 reais, pet', EXTRAS)?.name ?? null, PET.name);
checar('com extras, "dízimo da igreja" (Igreja)', bot.matchCategoryByKeyword('dízimo da igreja 50 reais, igreja', EXTRAS)?.name ?? null, IGREJA.name);

// As 9 fixas continuam vencendo — não é a categoria custom "roubando" um
// caso que já tinha dono. "ração"/"veterinário" são keywords de categorias
// fixas (Outros/Saúde) e continuam batendo ANTES do loop de extras.
checar('categoria fixa não é hijackada pelas extras', bot.matchCategoryByKeyword('mercado 120 reais', EXTRAS)?.name ?? null, 'Alimentação');

// Categoria custom cujo nome não aparece no texto: não inventa.
checar('extras presentes mas nome não citado', bot.matchCategoryByKeyword('xyzabc não identificável 30 reais', EXTRAS)?.name ?? null, null);

/* ---------- matchCategoryByReply (webhook) ---------- */

checar('resposta exata a uma categoria custom', bot.matchCategoryByReply('Pet', EXTRAS)?.name ?? null, PET.name);
checar('resposta exata, case-insensitive', bot.matchCategoryByReply('igreja', EXTRAS)?.name ?? null, IGREJA.name);
checar('resposta a categoria fixa continua indo pra fixa, não pra extra', bot.matchCategoryByReply('Alimentação', EXTRAS)?.name ?? null, 'Alimentação');
checar('resposta que não bate em nada', bot.matchCategoryByReply('sei lá', EXTRAS)?.name ?? null, null);

/* ---------- guessCategoryFromText (app — colar comprovante) ---------- */

checar('app: sem extras cai em Outros', guessCategoryFromText('gasto com o gato 40 reais').name, 'Outros');
checar('app: com extras reconhece categoria custom', guessCategoryFromText('gasto com o gato 40 reais, pet', EXTRAS).name, PET.name);
checar('app: categoria fixa não é hijackada', guessCategoryFromText('mercado 120 reais', EXTRAS).name, 'Alimentação');

console.log(`\n${total - falhas}/${total} checagens de categoria custom passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
