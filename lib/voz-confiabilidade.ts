import { guessAmountFromText, normalizarTexto } from './heuristics';

/**
 * Recusa transcrições típicas de silêncio antes que qualquer heurística
 * financeira possa transformá-las em lançamento. Provedores de fala às vezes
 * devolvem legenda, chamada de site ou encerramento de vídeo quando só houve
 * ruído; sem esta barreira, um ano ou outro número incidental virava valor.
 */
export function transcricaoPareceLancamentoVoz(texto: string): boolean {
  const original = texto.trim();
  if (!original) return false;
  const t = normalizarTexto(original);
  if (/\b(?:https?:\/\/|www\.|\w+\.(?:com|com\.br|net|org|io))\b/i.test(original)) return false;
  if (/\b(?:obrigad[oa]\s+por\s+assistir|inscreva-se|legendas?\s+(?:pela|por)|acesse\s+o\s+site|todos\s+os\s+direitos\s+reservados)\b/i.test(t)) return false;
  const valor = guessAmountFromText(t);
  return Number.isFinite(valor) && valor > 0;
}

/** Único valor que as telas de revisão podem sugerir a partir de uma fala. */
export function valorSeguroParaRevisaoVoz(texto: string): number | null {
  return precisaRevisarValorVoz(texto) ? null : guessAmountFromText(texto);
}

/** Não repara dígitos por palpite: separador perdido exige confirmação. */
export function precisaRevisarValorVoz(texto: string): boolean {
  if (/\bn[ãa]o\s+(?:(?:quero|deve|[ée]|para|pra|que|seja)\s+)*(?:lan[cç](?:ar|a|e)|registr(?:ar|a|e)|salv(?:ar|a|e))\b/i.test(texto)) return true;
  const t = normalizarTexto(texto);
  const valor = guessAmountFromText(t);
  if (!Number.isFinite(valor) || valor <= 0) return true;
  // Inteiro SOLTO escrito em dígitos não prova se o reconhecedor colou reais e
  // centavos ("18 e 99" -> "1899"). Vale para QUALQUER magnitude.
  // Um decimal explícito mantém a informação dos centavos na transcrição.
  const numeros = t.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)*/gu) ?? [];
  // Segunda compra com valor inteiro também é outro lançamento, não metadado.
  if (/\d+[.,]\d{1,2}\s+e\s+[\p{L}][\p{L}\s]*?\s+\d+(?:[.,]\d+)?(?:\s|$)/iu.test(t)) return true;
  // Dois separadores decimais nunca provam um preço: 18,99,05 não é 1899,05.
  if (numeros.some(n => !/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(n))) return true;
  const valores = numeros.filter(n => guessAmountFromText(`R$ ${n}`) === valor);
  /* Inteiro seguido da palavra "reais"/"real" é valor cheio, e a palavra é a
     prova que faltava: ela só sobra quando NÃO há centavos ditos. Quem diz
     "dezoito e noventa e nove reais" chega aqui como "18,99 reais", porque
     `normalizarTexto` reconstrói o separador antes desta função rodar — e é
     por isso que a colagem perigosa aparece como inteiro SOLTO ("mercado
     1899"), que continua indo para revisão.
     O extenso entra pela mesma porta, sem regra própria: "cento e vinte reais"
     também vira "120 reais" na normalização.
     Sem esta saída, TODO valor redondo caía em revisão. Medido em 14/09/2026,
     em vinte e uma frases reais, quinze eram barradas — "almoço 20 reais",
     "gasolina 100 reais", "café 7 reais" — enquanto "18 e 99", que é o caso
     que a trava nasceu para pegar, passava direto. A trava estava barrando o
     comum e deixando passar o raro.
     Risco residual aceito pelo autor em 14/09/2026: o reconhecedor entregar
     literalmente "1899 reais", já colado e com a palavra intacta. */
  /* Multiplicador falado ("45 mil") não é dígito lido: quem expande é a
     normalização, e neste repositório "45 mil" já virou R$ 1.000 — erro de mil
     vezes. A palavra "reais" ao lado não prova nada sobre a expansão, então
     essa família continua em revisão. */
  const temMultiplicador = /\b(?:mil|milh(?:ão|ao|ões|oes))\b/i.test(texto);
  const inteiroEmReaisCheios = (n: string) =>
    !temMultiplicador &&
    !/[.,]/.test(n) &&
    new RegExp(`(?<![\\p{L}\\d])${n}\\s*(?:reais|real)\\b`, 'iu').test(t);
  if (!valores.some(n => /[.,]\d{1,2}$/.test(n) || inteiroEmReaisCheios(n))) return true;
  /* Duas quantias na mesma fala continuam ambíguas depois da saída acima:
     "carteira Reserva 2,50 mercado 18 reais" tem um decimal E um inteiro cheio,
     e escolher entre eles pelo "primeiro número" é palpite. Antes desta linha a
     contagem final só olhava decimais, então o par decimal+inteiro passava. */
  const quantias = numeros.filter(n => /[.,]\d{1,2}$/.test(n) || inteiroEmReaisCheios(n));
  if (quantias.length > 1) return true;
  // Separador inválido, numeral partido ou dois valores na mesma fala não
  // podem cair no "primeiro número" e se tornar um lançamento confirmado.
  if (/\d+[.,]\d{3,}(?!\d)/.test(t.replace(/\d{1,3}(?:\.\d{3})+,\d{2}/g, ''))) return true;
  if (/\d+\p{L}{3,}|\p{L}{3,}\d+/u.test(t)) return true;
  return numeros.filter(n => /[.,]\d{1,2}$/.test(n)).length > 1;
}
