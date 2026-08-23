/* Lançamento pelo WhatsApp, GERADO por combinação — 1000 casos por tipo.
 *
 * O corpus-whatsapp.ts escrito à mão prova que cada regra funciona uma vez.
 * Este aqui prova que elas funcionam JUNTAS: crédito com recorrência, boleto
 * com categoria, parcelado com nome de cartão, débito com muleta de fala. É
 * na combinação que os bugs deste projeto apareceram — "no crédito da C6"
 * entrando na descrição, parcelamento sumindo no áudio, recorrência gravada
 * como false — e nenhuma dessas combinações tinha teste.
 *
 * O que este arquivo simula é o `registrarLancamento` inteiro, com as funções
 * REAIS lidas do webhook (ver __tests__/extrair.ts): boleto desvia antes de
 * tudo, crédito sobrescreve a forma de pagamento, parcela cancela
 * recorrência, categoria não reconhecida vira pergunta. Testar cada função
 * isolada mediria menos do que o bot faz.
 *
 * O esperado é conhecido por CONSTRUÇÃO: o valor, a categoria, a forma e o
 * número de parcelas são escolhidos antes de virarem frase. Não é o código
 * conferindo a si mesmo.
 *
 * Cada caso roda duas vezes — como texto digitado e como áudio transcrito
 * (`comoAudio`). Áudio é o caminho mais usado e o menos parecido com o que se
 * digita.
 *
 * Roda: npx tsx __tests__/corpus-whatsapp-gerado.ts
 */
import { guessAmountFromText, guessDescFromText, guessTypeFromText } from '../lib/heuristics';
import { comoAudio, porExtenso } from './extenso';
import { corpoDaFuncao } from './extrair';

/* ---------- funções reais do webhook ---------- */

/* `CATEGORIES` entra como dependência montada aqui, e não extraída do
   arquivo: a constante de verdade tem anotação de tipo inline
   (`{ name: string; color: string }[]`) que a limpeza ingênua do extrator não
   desmonta. O que interessa em matchCategoryByKeyword é o NOME escolhido, e
   pra isso a lista derivada das chaves de CATEGORY_KEYWORDS é equivalente —
   a cor não participa de nenhuma decisão. */
const fonte = [
  'CATEGORY_KEYWORDS', 'normalizarParaBusca', 'contemPalavra', 'matchCategoryByKeyword',
  'parseParcelas', 'ehIntencaoCredito', 'ehIntencaoBoleto', 'parseDiaVencimento',
  'parseFormaPagamento', 'parseRecorrencia', 'CANCELAR', 'ehIntencaoCancelar',
  'COMANDO_CANCELAR_FINAL',
].map((n) => corpoDaFuncao(n)).join('\n\n');

type Api = {
  matchCategoryByKeyword: (t: string) => { name: string } | null;
  parseParcelas: (t: string) => number | null;
  ehIntencaoCredito: (t: string) => boolean;
  ehIntencaoBoleto: (t: string) => boolean;
  parseDiaVencimento: (t: string) => string;
  parseFormaPagamento: (t: string) => string | null;
  parseRecorrencia: (t: string) => boolean;
  ehIntencaoCancelar: (t: string) => boolean;
  COMANDO_CANCELAR_FINAL: RegExp;
};

const bot = new Function(
  `${fonte}
   const CATEGORIES = Object.keys(CATEGORY_KEYWORDS).map((name) => ({ name, color: '' }));
   return { matchCategoryByKeyword, parseParcelas, ehIntencaoCredito, ehIntencaoBoleto,
            parseDiaVencimento, parseFormaPagamento, parseRecorrencia,
            ehIntencaoCancelar, COMANDO_CANCELAR_FINAL };`
)() as Api;

/* ---------- o roteamento real, em uma função ---------- */

type Resultado = {
  destino: 'erro' | 'bill' | 'transaction';
  valor: number;
  tipo: 'in' | 'out';
  categoria: string | null;
  forma: string | null;
  recorrente: boolean;
  parcelas: number | null;
  desc: string;
  /** O bot para e pergunta a categoria em vez de arquivar em "Outros". */
  pergunta: boolean;
};

/**
 * Espelha `registrarLancamento` do webhook, na mesma ordem.
 *
 * A única coisa suposta aqui é que o usuário tem pelo menos um cartão
 * cadastrado — sem cartão o webhook não marca crédito, e o caso "sem cartão"
 * é outro teste, não este.
 */
function processar(txt: string): Resultado {
  const valor = guessAmountFromText(txt);
  const tipo = guessTypeFromText(txt);
  const cat = bot.matchCategoryByKeyword(txt);

  if (!valor || valor <= 0) {
    return { destino: 'erro', valor: 0, tipo, categoria: null, forma: null, recorrente: false, parcelas: null, desc: '', pergunta: false };
  }

  const desc = guessDescFromText(txt, tipo);

  // Boleto desvia antes de tudo: vai pra `bills`, e lá "Outros" é o padrão.
  if (bot.ehIntencaoBoleto(txt)) {
    return {
      destino: 'bill', valor, tipo, categoria: cat?.name ?? 'Outros', forma: null,
      recorrente: bot.parseRecorrencia(txt), parcelas: null, desc, pergunta: false,
    };
  }

  let forma = bot.parseFormaPagamento(txt);
  let parcelas: number | null = null;
  if (tipo === 'out' && bot.ehIntencaoCredito(txt)) {
    forma = 'credit';
    parcelas = bot.parseParcelas(txt);
  }
  const recorrente = parcelas ? false : bot.parseRecorrencia(txt);

  return {
    destino: 'transaction', valor, tipo, categoria: cat?.name ?? null, forma,
    recorrente, parcelas, desc, pergunta: cat === null,
  };
}

/* ---------- peças ---------- */

/** Itens cuja categoria o bot reconhece por palavra-chave. */
const CONHECIDOS: [string, string][] = [
  ['mercado', 'Alimentação'], ['padaria', 'Alimentação'], ['ifood', 'Alimentação'],
  ['almoço', 'Alimentação'], ['pizza', 'Alimentação'], ['açougue', 'Outros'],
  ['uber', 'Transporte'], ['gasolina', 'Transporte'], ['estacionamento', 'Transporte'],
  ['farmácia', 'Saúde'], ['academia', 'Saúde'], ['dentista', 'Saúde'],
  ['netflix', 'Assinaturas'], ['spotify', 'Assinaturas'],
  ['aluguel', 'Moradia'], ['internet', 'Moradia'], ['condomínio', 'Moradia'],
  ['cinema', 'Lazer'], ['hotel', 'Lazer'],
];

/* "Açougue" não tem palavra-chave e cairia na pergunta de categoria; fica na
   lista de desconhecidos, onde o esperado é justamente o bot perguntar. */
const CONHECIDOS_OK = CONHECIDOS.filter(([, c]) => c !== 'Outros');

/** Itens que nenhuma palavra-chave cobre — aqui o bot PERGUNTA a categoria. */
const DESCONHECIDOS = [
  'chaveiro', 'faculdade', 'advogado', 'creche', 'cartório', 'lavanderia',
  'costureira', 'marceneiro', 'despachante', 'dedetização', 'açougue', 'mudança',
];

/** Itens típicos de conta a pagar, com categoria reconhecida. */
const BOLETO_CONHECIDOS: [string, string][] = [
  ['conta de luz', 'Moradia'], ['conta de água', 'Moradia'], ['internet', 'Moradia'],
  ['condomínio', 'Moradia'], ['iptu', 'Moradia'], ['gás', 'Moradia'],
  ['plano de saúde', 'Saúde'], ['academia', 'Saúde'],
  ['ipva', 'Transporte'], ['seguro do carro', 'Transporte'],
  ['netflix', 'Assinaturas'], ['aluguel', 'Moradia'],
];

const VERBOS = ['', 'paguei ', 'gastei ', 'comprei ', 'anota aí '];
const VERBOS_BOLETO = ['', 'chegou ', 'recebi o ', 'tem '];

/** Formas de dizer o valor. O número é escolhido antes; o texto é consequência. */
const VALORES: { n: number; txt: string }[] = [
  { n: 120, txt: '120' },
  { n: 120, txt: '120 reais' },
  { n: 120, txt: 'R$ 120' },
  { n: 120, txt: 'cento e vinte reais' },
  { n: 39.9, txt: '39,90' },
  { n: 39.9, txt: 'R$ 39,90' },
  { n: 39.9, txt: 'trinta e nove e noventa' },
  { n: 1500, txt: '1500 reais' },
  { n: 1500, txt: 'mil e quinhentos reais' },
  { n: 89.9, txt: '89,90' },
  { n: 25, txt: '25 reais' },
  { n: 2400, txt: '2400 reais' },
];

const MARCA_CREDITO = [' no crédito', ' no cartão de crédito', ' crédito', ' no cartão', ' no crédito do nubank', ' no crédito da c6'];
const MARCA_DEBITO = [' no débito', ' no cartão de débito', ' débito', ' pago no débito', ' no debito'];
const MARCA_PIX = [' no pix', ' pelo pix', ' via pix', ' pix'];
const MARCA_DINHEIRO = [' em dinheiro', ' em espécie', ' pago em dinheiro'];
const MARCA_RECORRENTE = [' todo mês', ' todos os meses', ' mensalmente', ' é recorrente', ' que repete todo mês', ' cada mês'];
const MARCA_BOLETO = [' boleto', ' é boleto', ' conta a pagar', ' boleto que vence dia 10', ' vencimento dia 15'];
const PARCELAS: [string, number][] = [
  [' em 3x', 3], [' parcelado em 6x', 6], [' em 10 vezes', 10],
  [' em 12 parcelas', 12], [' parcelei em 8', 8], [' em 4x no crédito', 4],
];

/* ---------- coleta de falhas ---------- */
type Falha = { exemplo: string; obtido: string; esperado: string; qtd: number };
const falhas = new Map<string, Falha>();
let total = 0;

function anota(assinatura: string, txt: string, obtido: string, esperado: string) {
  const f = falhas.get(assinatura);
  if (f) f.qtd++;
  else falhas.set(assinatura, { exemplo: txt, obtido, esperado, qtd: 1 });
}

type Esperado = {
  valor: number;
  destino: 'bill' | 'transaction';
  categoria?: string | null;
  pergunta?: boolean;
  forma?: string | null;
  recorrente?: boolean;
  parcelas?: number | null;
  tipo?: 'in' | 'out';
  /** Palavras que não podem sobrar na descrição do lançamento. */
  sujeira?: string[];
  /** O que o lançamento é. Confere-se a ÚLTIMA palavra — ver `checar`. */
  item?: string;
};

function checar(tipoDeTeste: string, modo: string, txt: string, e: Esperado) {
  total++;
  const r = processar(txt);
  const tag = `${tipoDeTeste}|${modo}`;

  if (Math.abs(r.valor - e.valor) > 0.005) {
    anota(`${tag}|VALOR`, txt, String(r.valor), String(e.valor));
    return; // valor errado derruba tudo depois; um sinal basta
  }
  if (r.destino !== e.destino) anota(`${tag}|DESTINO`, txt, r.destino, e.destino);
  if (e.tipo !== undefined && r.tipo !== e.tipo) anota(`${tag}|TIPO`, txt, r.tipo, e.tipo);
  if (e.categoria !== undefined && r.categoria !== e.categoria) {
    anota(`${tag}|CATEGORIA`, txt, String(r.categoria), String(e.categoria));
  }
  if (e.pergunta !== undefined && r.pergunta !== e.pergunta) {
    anota(`${tag}|PERGUNTA`, txt, String(r.pergunta), String(e.pergunta));
  }
  if (e.forma !== undefined && r.forma !== e.forma) anota(`${tag}|FORMA`, txt, String(r.forma), String(e.forma));
  if (e.recorrente !== undefined && r.recorrente !== e.recorrente) {
    anota(`${tag}|RECORRENTE`, txt, String(r.recorrente), String(e.recorrente));
  }
  if (e.parcelas !== undefined && r.parcelas !== e.parcelas) {
    anota(`${tag}|PARCELAS`, txt, String(r.parcelas), String(e.parcelas));
  }

  const descBaixa = r.desc.toLowerCase();
  for (const s of e.sujeira ?? []) {
    if (descBaixa.includes(s)) {
      anota(`${tag}|DESC-SUJA:${s}`, txt, r.desc, `sem "${s}"`);
      break;
    }
  }
  /* Confere o NÚCLEO do item, não a frase inteira: "conta de luz 120 boleto"
     vira "Luz", e isso está certo — o "conta de" é conector, e o nome curto é
     melhor na lista do app. Exigir a frase completa reprovaria uma limpeza
     que é justamente o objetivo da função. */
  if (e.item) {
    const nucleo = e.item.toLowerCase().split(' ').pop()!;
    if (!descBaixa.includes(nucleo)) {
      anota(`${tag}|DESC-PERDEU-ITEM`, txt, r.desc, `conter "${nucleo}"`);
    }
  }
}

/** Roda o caso nas duas formas: digitado e falado. */
function rodar(tipoDeTeste: string, txt: string, e: Esperado) {
  checar(tipoDeTeste, 'texto', txt, e);
  const falado = comoAudio(txt);
  if (falado !== txt.toLowerCase()) checar(tipoDeTeste, 'áudio', falado, e);
}

/* ---------- amostragem ---------- */

/**
 * Escolhe `n` casos espalhados por todo o produto cartesiano.
 *
 * Passo primo em relação ao tamanho: pegar os `n` primeiros percorreria só o
 * começo da lista (sempre o mesmo verbo, sempre o mesmo item), e o passo 1
 * daria a mesma coisa. Assim a amostra atravessa a combinação inteira.
 */
function amostrar<T>(todos: T[], n: number): T[] {
  if (todos.length <= n) return todos;
  const passo = 7919 % todos.length || 1;
  const out: T[] = [];
  const visto = new Set<number>();
  let i = 0;
  while (out.length < n) {
    const k = i % todos.length;
    if (!visto.has(k)) { visto.add(k); out.push(todos[k]); }
    i += passo;
    if (visto.size >= todos.length) break;
  }
  return out;
}

const POR_TIPO = 1000;

/* ---------- geração por tipo ---------- */

type Caso = { txt: string; e: Esperado };

function produto(itens: [string, string][] | string[], marcas: string[], monta: (item: string, cat: string | null, valor: { n: number; txt: string }, marca: string, verbo: string) => Caso, verbos = VERBOS): Caso[] {
  const lista: Caso[] = [];
  const pares: [string, string | null][] = Array.isArray(itens[0])
    ? (itens as [string, string][]).map(([i, c]) => [i, c])
    : (itens as string[]).map((i) => [i, null]);
  for (const [item, cat] of pares) {
    for (const v of VALORES) {
      for (const m of marcas) {
        for (const verbo of verbos) {
          lista.push(monta(item, cat, v, m, verbo));
        }
      }
    }
  }
  return lista;
}

const SUJEIRA_CREDITO = ['crédito', 'cartão', 'nubank', 'c6'];
const SUJEIRA_DEBITO = ['débito', 'debito', 'cartão'];
const SUJEIRA_PIX = ['pix'];
const SUJEIRA_DINHEIRO = ['dinheiro', 'espécie'];
const SUJEIRA_RECORRENTE = ['todo mês', 'todos os meses', 'mensalmente', 'recorrente', 'cada mês', 'repete'];

const suites: { nome: string; casos: Caso[] }[] = [];

// ══════ 1. CRÉDITO, categoria reconhecida ══════
suites.push({
  nome: 'crédito + categoria',
  casos: produto(CONHECIDOS_OK, MARCA_CREDITO, (item, cat, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: cat, pergunta: false, forma: 'credit',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_CREDITO,
    },
  })),
});

// ══════ 2. CRÉDITO, categoria desconhecida (o bot pergunta) ══════
suites.push({
  nome: 'crédito sem categoria',
  casos: produto(DESCONHECIDOS, MARCA_CREDITO, (item, _c, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: null, pergunta: true, forma: 'credit',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_CREDITO,
    },
  })),
});

// ══════ 3. CRÉDITO PARCELADO ══════
{
  const lista: Caso[] = [];
  for (const [item, cat] of CONHECIDOS_OK) {
    for (const v of VALORES) {
      for (const [m, n] of PARCELAS) {
        for (const verbo of VERBOS) {
          lista.push({
            txt: `${verbo}${item} ${v.txt}${m}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: cat, forma: 'credit',
              // Parcelado é série FECHADA: nunca recorrente.
              recorrente: false, parcelas: n, tipo: 'out', item,
              /* Esta suíte era a única sem checagem de sujeira, e por isso foi a
                 única que passou verde enquanto o nome saía "Mercado parcelado
                 em 3x" — o mesmo ruído que o teste pegava em pix e crédito. */
              sujeira: [...SUJEIRA_CREDITO, 'parcel', 'vezes', `${n}x`],
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'crédito parcelado', casos: lista });
}

// ══════ 4. CRÉDITO RECORRENTE + categoria ══════
{
  const lista: Caso[] = [];
  for (const [item, cat] of CONHECIDOS_OK) {
    for (const v of VALORES) {
      for (const mc of MARCA_CREDITO) {
        for (const mr of MARCA_RECORRENTE) {
          lista.push({
            txt: `${item} ${v.txt}${mc}${mr}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: cat, pergunta: false, forma: 'credit',
              recorrente: true, parcelas: null, tipo: 'out', item,
              sujeira: [...SUJEIRA_CREDITO, ...SUJEIRA_RECORRENTE],
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'crédito recorrente + categoria', casos: lista });
}

// ══════ 5. CRÉDITO RECORRENTE sem categoria ══════
{
  const lista: Caso[] = [];
  for (const item of DESCONHECIDOS) {
    for (const v of VALORES) {
      for (const mc of MARCA_CREDITO) {
        for (const mr of MARCA_RECORRENTE) {
          lista.push({
            txt: `${item} ${v.txt}${mc}${mr}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: null, pergunta: true, forma: 'credit',
              recorrente: true, parcelas: null, tipo: 'out', item,
              sujeira: [...SUJEIRA_CREDITO, ...SUJEIRA_RECORRENTE],
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'crédito recorrente sem categoria', casos: lista });
}

// ══════ 6-7. DÉBITO ══════
suites.push({
  nome: 'débito + categoria',
  casos: produto(CONHECIDOS_OK, MARCA_DEBITO, (item, cat, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: cat, pergunta: false, forma: 'debit',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_DEBITO,
    },
  })),
});
suites.push({
  nome: 'débito sem categoria',
  casos: produto(DESCONHECIDOS, MARCA_DEBITO, (item, _c, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: null, pergunta: true, forma: 'debit',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_DEBITO,
    },
  })),
});

// ══════ 8-9. DÉBITO RECORRENTE ══════
{
  const comCat: Caso[] = [];
  const semCat: Caso[] = [];
  for (const md of MARCA_DEBITO) {
    for (const mr of MARCA_RECORRENTE) {
      for (const v of VALORES) {
        for (const [item, cat] of CONHECIDOS_OK) {
          comCat.push({
            txt: `${item} ${v.txt}${md}${mr}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: cat, pergunta: false, forma: 'debit',
              recorrente: true, parcelas: null, tipo: 'out', item,
              sujeira: [...SUJEIRA_DEBITO, ...SUJEIRA_RECORRENTE],
            },
          });
        }
        for (const item of DESCONHECIDOS) {
          semCat.push({
            txt: `${item} ${v.txt}${md}${mr}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: null, pergunta: true, forma: 'debit',
              recorrente: true, parcelas: null, tipo: 'out', item,
              sujeira: [...SUJEIRA_DEBITO, ...SUJEIRA_RECORRENTE],
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'débito recorrente + categoria', casos: comCat });
  suites.push({ nome: 'débito recorrente sem categoria', casos: semCat });
}

// ══════ 10-11. PIX ══════
suites.push({
  nome: 'pix + categoria',
  casos: produto(CONHECIDOS_OK, MARCA_PIX, (item, cat, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: cat, pergunta: false, forma: 'pix',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_PIX,
    },
  })),
});
suites.push({
  nome: 'pix sem categoria',
  casos: produto(DESCONHECIDOS, MARCA_PIX, (item, _c, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: null, pergunta: true, forma: 'pix',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_PIX,
    },
  })),
});

// ══════ 12. PIX RECORRENTE ══════
{
  const lista: Caso[] = [];
  for (const [item, cat] of CONHECIDOS_OK) {
    for (const v of VALORES) {
      for (const mp of MARCA_PIX) {
        for (const mr of MARCA_RECORRENTE) {
          lista.push({
            txt: `${item} ${v.txt}${mp}${mr}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: cat, forma: 'pix',
              recorrente: true, parcelas: null, tipo: 'out', item,
              sujeira: [...SUJEIRA_PIX, ...SUJEIRA_RECORRENTE],
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'pix recorrente', casos: lista });
}

// ══════ 13. DINHEIRO ══════
suites.push({
  nome: 'dinheiro',
  casos: produto(CONHECIDOS_OK, MARCA_DINHEIRO, (item, cat, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'transaction', categoria: cat, forma: 'cash',
      recorrente: false, parcelas: null, tipo: 'out', item, sujeira: SUJEIRA_DINHEIRO,
    },
  })),
});

/* ══════ 14-15. BOLETO ══════
 *
 * `tipo` não é conferido aqui, e não por descuido: `registrarBoleto` nunca
 * consulta o tipo — conta a pagar é sempre saída futura, e vira lançamento só
 * quando marcada como paga no app. "Recebi o boleto da luz" é classificado
 * como ENTRADA pelo guessTypeFromText (o verbo "recebi" manda nisso), e está
 * tudo bem: o boleto é criado igual. Exigir 'out' aqui reprovaria uma frase
 * que o bot trata certo. */
suites.push({
  nome: 'boleto + categoria',
  casos: produto(BOLETO_CONHECIDOS, MARCA_BOLETO, (item, cat, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    e: {
      valor: v.n, destino: 'bill', categoria: cat, recorrente: false, item,
      sujeira: ['boleto', 'conta a pagar'],
    },
  }), VERBOS_BOLETO),
});
suites.push({
  nome: 'boleto sem categoria',
  casos: produto(DESCONHECIDOS, MARCA_BOLETO, (item, _c, v, m, verbo) => ({
    txt: `${verbo}${item} ${v.txt}${m}`,
    /* Boleto NÃO pergunta categoria: `registrarBoleto` arquiva em "Outros" e
       segue. É a diferença de propósito entre `bills` e `transactions`. */
    e: {
      valor: v.n, destino: 'bill', categoria: 'Outros', pergunta: false,
      recorrente: false, item, sujeira: ['boleto', 'conta a pagar'],
    },
  }), VERBOS_BOLETO),
});

// ══════ 16-17. BOLETO RECORRENTE ══════
{
  const comCat: Caso[] = [];
  const semCat: Caso[] = [];
  for (const mb of MARCA_BOLETO) {
    for (const mr of MARCA_RECORRENTE) {
      for (const v of VALORES) {
        for (const [item, cat] of BOLETO_CONHECIDOS) {
          comCat.push({
            txt: `${item} ${v.txt}${mb}${mr}`,
            e: {
              valor: v.n, destino: 'bill', categoria: cat, recorrente: true,
              item, sujeira: ['boleto', ...SUJEIRA_RECORRENTE],
            },
          });
        }
        for (const item of DESCONHECIDOS) {
          semCat.push({
            txt: `${item} ${v.txt}${mb}${mr}`,
            e: {
              valor: v.n, destino: 'bill', categoria: 'Outros', recorrente: true,
              item, sujeira: ['boleto', ...SUJEIRA_RECORRENTE],
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'boleto recorrente + categoria', casos: comCat });
  suites.push({ nome: 'boleto recorrente sem categoria', casos: semCat });
}

// ══════ 18. ENTRADA ══════
{
  const lista: Caso[] = [];
  const FONTES: [string, string][] = [
    ['de salário', 'Salário'], ['do freela', 'Salário'], ['de comissão', 'Salário'],
    ['de bônus', 'Salário'], ['de dividendos', 'Salário'], ['de férias', 'Salário'],
  ];
  const ABERTURAS = ['recebi ', 'caiu ', 'entrou ', 'me pagaram ', 'pingou '];
  const EXTRAS = ['', ' no pix', ' todo mês', ' no pix todo mês', ' mensalmente'];
  for (const [fonte, cat] of FONTES) {
    for (const v of VALORES) {
      for (const ab of ABERTURAS) {
        for (const ex of EXTRAS) {
          lista.push({
            txt: `${ab}${v.txt} ${fonte}${ex}`,
            e: {
              valor: v.n, destino: 'transaction', categoria: cat, tipo: 'in',
              /* Entrada nunca vai pra fatura, mesmo que a frase tenha a
                 palavra crédito: `registrarLancamento` exige type === 'out'. */
              parcelas: null,
              recorrente: /todo mês|mensalmente/.test(ex),
              forma: /pix/.test(ex) ? 'pix' : null,
            },
          });
        }
      }
    }
  }
  suites.push({ nome: 'entrada', casos: lista });
}

/* ---------- 19. CANCELAMENTO ---------- */

/** A decisão real do bot: sem valor vale a família toda, com valor só o fim. */
function comandoDeCancelar(txt: string): boolean {
  return guessAmountFromText(txt) > 0
    ? bot.COMANDO_CANCELAR_FINAL.test(txt)
    : bot.ehIntencaoCancelar(txt);
}

const cancelamentos: [string, boolean][] = [];
{
  /* Verbos que valem como ORDEM: fala, imperativo e infinitivo. "cancelamento"
     (substantivo) e "cancelei" (passado) ficam de fora de propósito — os dois
     aparecem em despesa de verdade. */
  const IMPERATIVOS = [
    'cancela', 'cancele', 'cancelar', 'apaga', 'apague', 'apagar',
    'exclui', 'exclua', 'excluir', 'deleta', 'delete', 'deletar',
    'remove', 'remova', 'remover', 'anula', 'anule', 'anular',
    'desfaz', 'desfaça', 'desfazer',
  ];
  const COMPLEMENTOS = ['', ' isso', ' esse', ' o último', ' o último lançamento', ' esse aí', ' aí', ' esse lançamento'];
  const PONTOS = ['', '.', '!'];

  // (a) comando puro, sem valor → cancela
  for (const v of IMPERATIVOS) {
    for (const c of COMPLEMENTOS) {
      for (const p of PONTOS) {
        cancelamentos.push([`${v}${c}${p}`, true]);
      }
    }
  }

  // (b) o verbo no FIM de uma frase que tem valor → ainda é ordem
  const SO_FINAL = IMPERATIVOS.filter((v) => !/^(?:desfaz|anula|anule|anular|desfaça|desfazer)$/.test(v));
  for (const [item] of CONHECIDOS_OK) {
    for (const v of VALORES) {
      for (const verbo of SO_FINAL) {
        cancelamentos.push([`${item} ${v.txt} ${verbo}`, true]);
      }
    }
  }

  /* (c) falsos amigos: TÊM palavra de cancelar e TÊM valor, mas são despesa.
     Este é o grupo que importa — um falso positivo aqui apaga um lançamento
     certo, e o dano é silencioso. */
  const MOLDES = [
    (i: string, v: string) => `cancelamento de ${i} ${v}`,
    (i: string, v: string) => `multa de cancelamento ${i} ${v}`,
    (i: string, v: string) => `taxa de cancelamento do ${i} ${v}`,
    (i: string, v: string) => `cancelei o ${i} ${v}`,
    (i: string, v: string) => `cancelei a assinatura de ${i} ${v}`,
    (i: string, v: string) => `${i} ${v} cancelei`,
    (i: string, v: string) => `apaguei o ${i} ${v}`,
    (i: string, v: string) => `errei e paguei ${v} a mais no ${i}`,
    (i: string, v: string) => `${i} ${v} no crédito`,
    (i: string, v: string) => `${i} ${v} todo mês`,
    (i: string, v: string) => `paguei ${v} de ${i}`,
  ];
  for (const [item] of CONHECIDOS_OK) {
    for (const v of VALORES) {
      for (const molde of MOLDES) {
        cancelamentos.push([molde(item, v.txt), false]);
      }
    }
  }
}

/* ---------- execução ---------- */

console.log(`Corpus gerado do WhatsApp — ${POR_TIPO} casos por tipo, cada um em texto e em áudio.\n`);

const resumo: { nome: string; casos: number; falhas: number }[] = [];

for (const s of suites) {
  const antes = total;
  const falhasAntes = [...falhas.values()].reduce((a, f) => a + f.qtd, 0);
  for (const c of amostrar(s.casos, POR_TIPO)) rodar(s.nome, c.txt, c.e);
  const falhasDepois = [...falhas.values()].reduce((a, f) => a + f.qtd, 0);
  resumo.push({ nome: s.nome, casos: total - antes, falhas: falhasDepois - falhasAntes });
}

// Cancelamento tem checagem própria (é decisão booleana, não lançamento).
let falhasCancel = 0;
let casosCancel = 0;
for (const [txt, esperado] of amostrar(cancelamentos, POR_TIPO)) {
  for (const forma of [txt, comoAudio(txt)]) {
    if (forma !== txt && forma === txt.toLowerCase()) continue;
    casosCancel++;
    total++;
    if (comandoDeCancelar(forma) !== esperado) {
      falhasCancel++;
      anota(`cancelamento|${forma === txt ? 'texto' : 'áudio'}|${esperado ? 'DEIXOU DE CANCELAR' : 'CANCELOU À TOA'}`,
        forma, String(!esperado), String(esperado));
    }
  }
}
resumo.push({ nome: 'cancelamento', casos: casosCancel, falhas: falhasCancel });

/* ---------- relatório ---------- */

const larguraNome = Math.max(...resumo.map((r) => r.nome.length));
for (const r of resumo) {
  const marca = r.falhas === 0 ? 'ok  ' : 'FALHA';
  console.log(`${marca} ${r.nome.padEnd(larguraNome)}  ${String(r.casos).padStart(5)} checagens  ${r.falhas === 0 ? '' : `${r.falhas} falhas`}`);
}

const ordenadas = [...falhas.values()]
  .map((f, i) => ({ ...f, assinatura: [...falhas.keys()][i] }))
  .sort((a, b) => b.qtd - a.qtd);

if (ordenadas.length) {
  console.log(`\n──── ${ordenadas.length} padrões de falha ────`);
  for (const f of ordenadas) {
    console.log(`\n[${f.qtd}x] ${f.assinatura}`);
    console.log(`      ex: "${f.exemplo}"`);
    console.log(`      obtido: ${f.obtido}  |  esperado: ${f.esperado}`);
  }
}

const comFalha = ordenadas.reduce((s, f) => s + f.qtd, 0);
console.log(`\n${total - comFalha}/${total} passaram — ${comFalha} falhas em ${ordenadas.length} padrões distintos`);
