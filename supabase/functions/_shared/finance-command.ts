// Núcleo compartilhado de normalização/parser financeiro — usado pelo
// whatsapp-webhook e (a partir da Fase 3) pela Edge Function
// processar-lancamento-voz (app/widget). Extraído do antigo monólito de
// supabase/functions/whatsapp-webhook/index.ts na unificação de voz/widget
// (docs/superpowers/specs/2026-09-04-voz-unificada-widget-android-design.md).
//
// Esta primeira leva cobre só a normalização de número por extenso — a peça
// que a transcrição de áudio depende antes de qualquer parser de campo rodar.
// O resto do parser (forma de pagamento, recorrência, parcelas, categoria,
// boleto) ainda vive em whatsapp-webhook/index.ts e migra em passos
// seguintes, cada um revalidado contra o corpus antes do próximo.
//
// `lib/heuristics.ts` (app, Node/RN) mantém sua própria cópia equivalente —
// Metro não importa arquivos Deno. `__tests__/sync-parser.js` compara as duas
// e falha se divergirem.

/* ── Números falados por extenso ───────────────────────────────────────────
 *
 * Vale tanto para o lançamento por voz dentro do app quanto para o áudio
 * recebido no WhatsApp: nos dois casos a transcrição devolve "cento e vinte
 * reais" com a mesma frequência que "120 reais", e todo o resto da heurística
 * só entende dígitos. Sem esta etapa, metade das falas caía em "não
 * identifiquei o valor".
 */

export const NUMERO_POR_EXTENSO: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, três: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cinqüenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
  duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};

export function somarExtenso(palavras: string[]): number {
  let total = 0;
  let atual = 0;
  for (const p of palavras) {
    const v = NUMERO_POR_EXTENSO[p];
    if (v === undefined) continue; // "e"
    if (v === 1000) {
      atual = (atual === 0 ? 1 : atual) * 1000;
      total += atual;
      atual = 0;
    } else {
      atual += v;
    }
  }
  return total + atual;
}

/**
 * Quebra uma sequência de números falados nos pontos onde ela deixa de ser UM
 * numeral e passa a ser DOIS — que em fala é quase sempre reais e centavos.
 *
 * Numeral composto em português só decresce: "cento e vinte e cinco" (100 >
 * 20 > 5) é um número; "onze e setenta e nove" não existe como numeral único,
 * porque 70 não pode vir depois de 11. Quando alguém fala assim, está dizendo
 * um preço: onze reais e setenta e nove centavos.
 *
 * Sem esta quebra, `somarExtenso` somava tudo — "onze e setenta e nove" virava
 * 11+70+9 = R$ 90,00 no lugar de R$ 11,79, e "café cinco e cinquenta" virava
 * R$ 55,00 no lugar de R$ 5,50. Era o jeito mais comum de falar preço em voz
 * alta, e todo lançamento por áudio saía com valor errado.
 *
 * Devolve os segmentos separados; quem chama junta com " e " de volta, para as
 * regras de decimal mais abaixo ("11 e 79" -> "11,79") reconhecerem o par.
 */
/**
 * O "e" que vem depois de `anterior` ainda pertence ao MESMO numeral?
 *
 * Português compõe numeral encaixando ordem grande + ordem menor, e cada
 * ordem tem um teto para o que pode vir depois dela:
 *
 *   mil     + até 999   "mil e quinhentos"
 *   centena + até 99    "cento e vinte e cinco"
 *   dezena  + até 9     "vinte e cinco"
 *   1 a 19  + NADA
 *
 * A última linha é a que importa aqui, e a regra anterior não a tinha: ela só
 * perguntava se o número seguinte era menor que o anterior, então "dez e
 * cinco" passava como numeral e virava 15. Mas 15 se diz "quinze" — de 1 a 19
 * cada número tem palavra própria e nenhum deles aceita "e" depois. Quem fala
 * "dez e cinco" está dizendo dez reais e cinco centavos, sempre.
 *
 * Eram 1.021 pares de reais-e-centavos lidos como um número só, todos com a
 * parte inteira abaixo de 20 — a faixa de preço mais comum que existe.
 */
function podeContinuarNumeral(anterior: number, proximo: number): boolean {
  if (anterior >= 1000) return proximo < 1000;
  if (anterior >= 100) return proximo < 100;
  if (anterior >= 20) return proximo < 10;
  return false;
}

export function segmentarExtenso(palavras: string[]): number[] {
  const segmentos: number[] = [];
  let atual: string[] = [];
  let anterior = Infinity;

  for (const p of palavras) {
    const v = NUMERO_POR_EXTENSO[p];
    if (v === undefined) continue; // "e"
    if (v !== 1000 && !podeContinuarNumeral(anterior, v)) {
      if (atual.length) segmentos.push(somarExtenso(atual));
      atual = [];
      anterior = Infinity;
    }
    atual.push(p);
    /* Depois de "mil" a referência passa a ser 1000, não o multiplicador que
       veio antes: em "dois mil e quinhentos" o que segue precisa ser menor
       que MIL (500 é), não menor que DOIS. Mantendo `anterior = 2` a regra
       quebrava ali e o valor virava R$ 2.000 — quinhentos ia embora. */
    anterior = v === 1000 ? 1000 : v;
  }
  if (atual.length) segmentos.push(somarExtenso(atual));
  return segmentos;
}

/* Fonte única das palavras que a pessoa usa no lugar de "reais". Toda regex
   que precisa reconhecer moeda monta a partir daqui — a lista estava copiada
   literalmente em sete pontos deste arquivo, o que só espera divergir. */
export const MOEDA = 'reais|real|contos?|pila|paus?|mangos?';

/* Palavra que, logo depois de um bloco numérico fechado, confirma que aquilo
   era mesmo um valor em dinheiro (não um artigo indefinido).
   "centavo" entra junto porque é a única moeda que aparece depois do "um" na
   parte decimal: sem ela, "um real e um centavo" perdia o centavo — o bloco
   ["um"] caía na exceção do artigo, saía como a palavra "um" em vez de "1", e
   a regra de reais-e-centavos logo abaixo não tinha dois números pra juntar.
   R$ 1,01 virava R$ 1,00, calado. */
export const PALAVRA_MOEDA = new RegExp(`^(?:${MOEDA}|centavos?)$`, 'i');

/** Converte trechos numéricos por extenso em dígitos e junta "X reais e Y centavos". */
export function normalizarTextoTranscrito(texto: string): string {
  const tokens = texto.split(/(\s+)/);
  const saida: string[] = [];
  let bloco: string[] = [];

  /* "um"/"uma" sozinhos são o artigo indefinido na esmagadora maioria das
     frases ("um pix", "uma compra", "um boleto") — só valem como número
     quando vêm seguidos de palavra de moeda ("um real") ou fazem parte de
     um bloco maior já em andamento ("vinte e um reais"). Sem essa distinção,
     "fiz um pix de 50 pra Maria" virava "fiz 1 pix de 50 pra Maria", e a
     regra de "número solto" (último recurso de guessAmountFromText) pegava
     o "1" em vez do valor real 50 — um lançamento de R$1 registrado em
     silêncio no lugar de R$50. `proximaPalavraRelevante` olha adiante no
     texto ORIGINAL (não nos tokens já processados) para decidir. */
  const proximaPalavraRelevante = (aPartirDe: number): string | null => {
    for (let j = aPartirDe; j < tokens.length; j++) {
      if (/^\s+$/.test(tokens[j])) continue;
      return tokens[j].toLowerCase().replace(/[.,!?;:]+$/, '');
    }
    return null;
  };

  const fecharBloco = (indiceAtual: number) => {
    if (bloco.length === 0) return;
    // Um "e" solto no fim do bloco pertence à frase, não ao número.
    while (bloco.length > 0 && NUMERO_POR_EXTENSO[bloco[bloco.length - 1]] === undefined) bloco.pop();

    if (bloco.length === 1 && (bloco[0] === 'um' || bloco[0] === 'uma')) {
      const proxima = proximaPalavraRelevante(indiceAtual);
      if (!proxima || !PALAVRA_MOEDA.test(proxima)) {
        saida.push(bloco[0]);
        bloco = [];
        return;
      }
    }

    /* Junta com " e " de volta: quando o bloco era um numeral só, sai um
       número apenas ("125"); quando eram reais e centavos falados, sai
       "11 e 79", que as regras de decimal abaixo transformam em "11,79". */
    if (bloco.length > 0) saida.push(segmentarExtenso(bloco).join(' e '));
    bloco = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\s+$/.test(token)) {
      if (bloco.length === 0) saida.push(token);
      continue;
    }
    const limpo = token.toLowerCase().replace(/[.,!?;:]+$/, '');
    const pontuacao = token.slice(limpo.length);
    const ehNumero = NUMERO_POR_EXTENSO[limpo] !== undefined;
    // "e" só continua um bloco já começado (evita capturar o "e" de ligação).
    const ehLigacao = limpo === 'e' && bloco.length > 0;

    if (ehNumero || ehLigacao) {
      bloco.push(limpo);
      if (pontuacao) {
        fecharBloco(i + 1);
        saida.push(pontuacao, ' ');
      }
      continue;
    }
    fecharBloco(i);
    if (saida.length > 0 && !/\s$/.test(saida[saida.length - 1])) saida.push(' ');
    saida.push(token);
  }
  fecharBloco(tokens.length);

  return saida
    .join('')
    /* Ruído de alucinação do Whisper em áudio curto ou impreciso: sem sinal
       de fala suficiente pra reconhecer, o modelo às vezes "termina" a
       frase em outro alfabeto (cirílico, CJK etc.) em vez de admitir
       silêncio — mesmo com `language:'pt'` forçado na chamada (é uma dica
       pro modelo, não uma garantia). Português nunca usa nada fora de
       Latin-1/Latin Extended, então qualquer caractere fora desse conjunto
       é ruído de transcrição, nunca fala de verdade. Remove o CARACTERE,
       não a palavra/frase inteira, pra não perder o resto de uma mensagem
       real que só teve uma alucinação colada na ponta (caso real: "5,90
       украї" — o valor tinha vindo certo, só a categoria que sobrou virou
       lixo cirílico e a pessoa via isso ecoado de volta). */
    .replace(/[^a-zA-Z0-9À-ÿ\s.,!?;:'"()$%&\-+/]/g, '')
    /* "5h90": outra forma do mesmo problema, mas nos DÍGITOS em vez de nas
       letras. Um valor falado com vírgula decimal ("cinco e noventa", "5
       reais e 90") às vezes sai transcrito com "h" no lugar da vírgula,
       como se fosse hora do relógio — mas hora de verdade nunca passa de
       59 minutos, então "h" seguido de 60+ (ou de 3+ dígitos) não pode ser
       hora nenhuma; só pode ser a vírgula que o Whisper confundiu com
       marcador de hora. "5h30" (hora real, minuto válido) fica intocado de
       propósito — só reescreve quando o "minuto" é matematicamente
       impossível. Sem isso "5h90" não batia em nenhuma das 4 regras de
       `guessAmountFromText` (não tem vírgula nem "reais" colado) e o
       lançamento morria pedindo repetição, mesmo a pessoa já tendo dito o
       valor certo. */
    .replace(/(\d{1,3})h(\d{2,})/gi, (m: string, h: string, mm: string) => (mm.length > 2 || Number(mm) > 59 ? `${h},${mm}` : m))
    .replace(/\s{2,}/g, ' ')
    .replace(/(\d+)\s*(?:reais|real)\s*e\s*(\d+)\s*centavos?/gi, (_m, r, c) => `${r},${String(c).padStart(2, '0')} reais`)
    /* Fala real quase nunca diz "centavos" ("trinta reais e cinquenta") — só
       entra quando o número depois do "e" tem 1-2 dígitos e não é seguido de
       outra palavra de moeda, pra não confundir com "50 reais e 30 mil" ou
       frases com dois valores diferentes na mesma mensagem. */
    .replace(
      new RegExp(`(\\d+)\\s*(?:reais|real)\\s*e\\s*(\\d{1,2})\\b(?!\\s*(?:mil|${MOEDA}))`, 'gi'),
      (_m: string, r: string, c: string) => `${r},${String(c).padStart(2, '0')} reais`
    )
    /* A forma mais comum de todas não diz "reais" em lugar nenhum: "Monster
       10 e 79" é como se lê um preço em voz alta, e antes disto o "79"
       simplesmente desaparecia — nenhuma regra de moeda ligava os dois
       números, e o extrator de valor pegava só o primeiro (ou só o
       segundo, se "reais" viesse solto no fim da frase). Sem exigir a
       palavra de moeda perto, "10 e 79" vira "10,79" direto — os regexes de
       moeda mais abaixo (`comCentavos`) reconhecem o decimal normalmente,
       com ou sem "reais" sobrando por perto.
       As exclusões existem pra não confundir com hora falada ("são 10 e
       30", "às 8 e 15") e com contagem que nada tem a ver com dinheiro
       ("2 e 3 pessoas", "10 e 20 km").

       Dois lookbehinds, não um: `(?<!\d)` impede o motor de recuar pro MEIO
       de um número quando a checagem de hora barra o início — mesmo recuo
       que já mordeu "99pop" antes de virar "9pop" num bug anterior, aqui
       reencarnado em cima de "10" (barrado por "são ") virando só "0". E a
       checagem de hora usa `(?:^|\s)` em vez de `\b`: `\b` no JS só enxerga
       [A-Za-z0-9_] como letra — diante de "à" (não-ASCII) ele nunca fecha
       fronteira nenhuma, então "às 10 e 30" escapava do bloqueio inteiro. */
    /* A vírgula opcional antes do "e" é o Whisper pontuando a pausa da fala:
       "trinta e quatro, e sessenta e cinco" chega assim com frequência, e sem
       essa folga o valor parava no 34 — os centavos sumiam calados. */
    .replace(
      /(?<!\d)(?<!(?:^|\s)(?:s[aã]o|era|eram|[àa]s?)\s)(\d+)\s*,?\s+e\s+(\d{1,2})\b(?!\s*(?:mil|horas?|km|quil[oô]metros?|anos?|meses?|dias?|semanas?|vezes|pessoas?|unidades?|itens?))/gi,
      (_m: string, r: string, c: string) => `${r},${String(c).padStart(2, '0')}`
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}
