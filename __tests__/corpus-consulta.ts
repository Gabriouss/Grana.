/* Perguntas de gasto respondidas pelo bot do WhatsApp — "quanto eu gastei em
 * alimentação esse mês?", "quanto tenho de boleto pra pagar?", "quanto já
 * gastei no cartão de crédito?". Antes desta função o bot só sabia
 * REGISTRAR lançamento; uma pergunta sem valor numérico dito caía direto na
 * resposta genérica de erro (ver comentário completo em
 * interpretarConsulta, supabase/functions/whatsapp-webhook/index.ts).
 *
 * `interpretarConsulta` é extraída do ARQUIVO REAL (ver __tests__/extrair.ts),
 * junto com o que ela chama por baixo (matchCategoryByKeyword) — não
 * copiada, pra este teste não passar enquanto o bot está quebrado.
 *
 * O que importa aqui é só a CLASSIFICAÇÃO (categoria/boletos/crédito/null) —
 * a consulta em si (responderConsulta) faz leitura no Supabase e não dá pra
 * testar sem banco; a classificação é a parte pura e determinística.
 *
 * Roda: npx tsx __tests__/corpus-consulta.ts
 */
import { corpoDaFuncao } from './extrair';

const NOMES = ['CATEGORY_KEYWORDS', 'normalizarParaBusca', 'contemPalavra', 'matchCategoryByKeyword', 'interpretarConsulta'];
const fonte = NOMES.map((n) => corpoDaFuncao(n)).join('\n\n');
const bot = new Function(
  `${fonte}
   const CATEGORIES = Object.keys(CATEGORY_KEYWORDS).map((name) => ({ name, color: '' }));
   return { interpretarConsulta };`
)() as {
  interpretarConsulta: (t: string, extras?: { name: string; color: string }[]) => { tipo: string; categoria?: { name: string } } | null;
};

const EXTRAS = [{ name: 'Pet', color: '#a35' }];

type Caso = { txt: string; tipo: 'categoria' | 'boletos' | 'credito' | null; categoria?: string };

const CASOS: Caso[] = [
  // ---------- categoria ----------
  { txt: 'quanto eu gastei em alimentação esse mês?', tipo: 'categoria', categoria: 'Alimentação' },
  { txt: 'quanto gastei com transporte?', tipo: 'categoria', categoria: 'Transporte' },
  { txt: 'quanto já gastei no mercado esse mês', tipo: 'categoria', categoria: 'Alimentação' },
  { txt: 'quanto eu gastei com o pet esse mês?', tipo: 'categoria', categoria: 'Pet' },

  // ---------- boletos ----------
  { txt: 'quanto eu tenho de boleto pra pagar esse mês?', tipo: 'boletos' },
  { txt: 'quanto falta de conta a pagar esse mês', tipo: 'boletos' },
  { txt: 'quanto tenho de contas a pagar', tipo: 'boletos' },

  // ---------- crédito ----------
  { txt: 'quanto já gastei no cartão de crédito?', tipo: 'credito' },
  { txt: 'quanto já foi gasto de crédito esse mês', tipo: 'credito' },
  { txt: 'quanto eu gastei no cartão', tipo: 'credito' },

  // ---------- não é consulta — segue fluxo normal de lançamento ----------
  { txt: 'mercado 120 reais', tipo: null },
  { txt: 'almoço 30 no crédito', tipo: null },
  { txt: 'boleto da luz 210', tipo: null },
  { txt: 'gastei 50 no mercado hoje', tipo: null },
  { txt: 'cancela', tipo: null },
  // "quanto"/"qual" sem o verbo de gasto do lado — não é o formato reconhecido.
  { txt: 'qual o nome do meu cartão?', tipo: null },
];

let falhas = 0;
let total = 0;

for (const c of CASOS) {
  total++;
  const r = bot.interpretarConsulta(c.txt, EXTRAS);
  const tipoObtido = r?.tipo ?? null;
  if (tipoObtido !== c.tipo) {
    falhas++;
    console.log(`FALHA  [tipo] "${c.txt}" = ${tipoObtido} (esperado ${c.tipo})`);
    continue;
  }
  if (c.categoria !== undefined) {
    total++;
    const catObtida = r && r.tipo === 'categoria' ? r.categoria?.name : undefined;
    if (catObtida !== c.categoria) {
      falhas++;
      console.log(`FALHA  [categoria] "${c.txt}" = ${catObtida} (esperado ${c.categoria})`);
    }
  }
}

// Pergunta sobre uma categoria custom, mas SEM passar a lista de extras
// (usuário sem essa categoria cadastrada, ou busca ainda não chegou) — tem
// que devolver null, não inventar uma categoria que não foi informada.
total++;
{
  const r = bot.interpretarConsulta('quanto eu gastei com o pet esse mês?', []);
  const tipoObtido = r?.tipo ?? null;
  if (tipoObtido !== null) {
    falhas++;
    console.log(`FALHA  [sem extras] "quanto eu gastei com o pet esse mês?" = ${tipoObtido} (esperado null)`);
  }
}

console.log(`\n${total - falhas}/${total} checagens de interpretarConsulta passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
