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
import * as path from 'path';
import { guessCategoryFromText } from '../lib/heuristics';
import { corpoDaFuncao } from './extrair';

/* CATEGORY_KEYWORDS/normalizarParaBusca/contemPalavra foram extraídas do
   webhook pra supabase/functions/_shared/category-keywords.ts (também
   servem assistente-financeiro/index.ts agora) — continuam lidas do
   ARQUIVO ONDE REALMENTE MORAM. */
const CATEGORY_KEYWORDS_FILE = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'category-keywords.ts');
const NOMES_COMPARTILHADOS = ['CATEGORY_KEYWORDS', 'normalizarParaBusca', 'contemPalavra', 'semValorMonetario'];
const NOMES_WEBHOOK = ['matchCategoryByKeyword', 'matchCategoryByReply'];
const fonte = [
  ...NOMES_COMPARTILHADOS.map((n) => corpoDaFuncao(n, CATEGORY_KEYWORDS_FILE)),
  ...NOMES_WEBHOOK.map((n) => corpoDaFuncao(n)),
].join('\n\n');
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

/* ---------- o valor não pode escolher a categoria ----------
 *
 * Relatado do aparelho em 09/09/2026: "Energético 18,99" foi para Transporte.
 * A transcrição estava certa; a classificação não. '99' é keyword do
 * aplicativo de corrida, e `normalizarParaBusca` quebra "18,99" em "18 99",
 * entregando os centavos como palavra. Como preço em real quase sempre
 * termina em ,99, isso atingia qualquer lançamento sem keyword forte no
 * texto — não só categoria custom.
 *
 * O segundo defeito apareceu junto: a categoria custom só era consultada
 * DEPOIS das 9 fixas (isso é de propósito, ver acima), então o falso
 * positivo do valor impedia "Energético" de sequer ser testada. E sem dobra
 * de acento, "energetico" transcrito sem acento não achava "Energético".
 */
const ENERGETICO = { name: 'Energético', color: '#f80' };
const EXTRAS_E = [ENERGETICO];

// O caso relatado, e as outras formas de escrever o mesmo valor.
checar('app: valor ,99 não rouba pra Transporte', guessCategoryFromText('Energético 18,99', EXTRAS_E).name, ENERGETICO.name);
checar('app: valor 99,00', guessCategoryFromText('Energético 99,00', EXTRAS_E).name, ENERGETICO.name);
checar('app: valor com moeda por extenso', guessCategoryFromText('Energético 99 reais', EXTRAS_E).name, ENERGETICO.name);
checar('app: valor com cifrão', guessCategoryFromText('Energético R$ 18,99', EXTRAS_E).name, ENERGETICO.name);
checar('app: milhar com centavos', guessCategoryFromText('Energético 1.899,99', EXTRAS_E).name, ENERGETICO.name);

// Acento: a fala nem sempre devolve, e o nome custom não pode ser duplicado.
checar('app: sem acento acha a categoria acentuada', guessCategoryFromText('energetico 5,99', EXTRAS_E).name, ENERGETICO.name);
checar('app: com acento continua achando', guessCategoryFromText('Energético 5,99', EXTRAS_E).name, ENERGETICO.name);

// O '99' do aplicativo de corrida continua valendo quando é MESMO o serviço.
checar('app: "99" solto ainda é Transporte', guessCategoryFromText('chamei um 99', EXTRAS_E).name, 'Transporte');
checar('app: "99 pop" com valor junto', guessCategoryFromText('99 pop 18,99', EXTRAS_E).name, 'Transporte');
checar('app: keyword forte vence o valor', guessCategoryFromText('uber 18,99', EXTRAS_E).name, 'Transporte');

// Keywords com dígito que NÃO são valor seguem intactas.
checar('app: "office 365" não é comido pelo recorte', guessCategoryFromText('office 365 39,90', EXTRAS_E).name, 'Assinaturas');
checar('app: "b3" segue em Investimentos', guessCategoryFromText('aporte b3 1.500,00', EXTRAS_E).name, 'Investimentos');

// As 9 fixas continuam vencendo — a política não mudou.
checar('app: fixa ainda vence custom', guessCategoryFromText('mercado 120 reais', EXTRAS_E).name, 'Alimentação');

// O mesmo defeito existia no bot; a correção mora no arquivo compartilhado.
checar('bot: valor ,99 não rouba pra Transporte', bot.matchCategoryByKeyword('Energético 18,99', EXTRAS_E)?.name ?? null, ENERGETICO.name);
checar('bot: "99" solto ainda é Transporte', bot.matchCategoryByKeyword('chamei um 99', EXTRAS_E)?.name ?? null, 'Transporte');
checar('bot: sem acento acha a acentuada', bot.matchCategoryByKeyword('energetico 5,99', EXTRAS_E)?.name ?? null, ENERGETICO.name);

console.log(`\n${total - falhas}/${total} checagens de categoria custom passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
