import { guessAmountFromText, normalizarTexto } from './heuristics';

/** Não repara dígitos por palpite: separador perdido exige confirmação. */
export function precisaRevisarValorVoz(texto: string): boolean {
  if (/\bn[ãa]o\s+(?:(?:quero|deve|[ée]|para|pra|que|seja)\s+)*(?:lan[cç](?:ar|a|e)|registr(?:ar|a|e)|salv(?:ar|a|e))\b/i.test(texto)) return true;
  const t = normalizarTexto(texto);
  const valor = guessAmountFromText(t);
  if (!Number.isFinite(valor) || valor <= 0) return true;
  // Inteiro escrito em dígitos não prova se o reconhecedor colou reais e
  // centavos ("18 e 99" -> "1899"). Vale para QUALQUER magnitude.
  // Um decimal explícito mantém a informação dos centavos na transcrição.
  const numeros = t.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)*/gu) ?? [];
  // Segunda compra com valor inteiro também é outro lançamento, não metadado.
  if (/\d+[.,]\d{1,2}\s+e\s+[\p{L}][\p{L}\s]*?\s+\d+(?:[.,]\d+)?(?:\s|$)/iu.test(t)) return true;
  // Dois separadores decimais nunca provam um preço: 18,99,05 não é 1899,05.
  if (numeros.some(n => !/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(n))) return true;
  const valores = numeros.filter(n => guessAmountFromText(`R$ ${n}`) === valor);
  if (!valores.some(n => /[.,]\d{1,2}$/.test(n))) return true;
  // Separador inválido, numeral partido ou dois valores na mesma fala não
  // podem cair no "primeiro número" e se tornar um lançamento confirmado.
  if (/\d+[.,]\d{3,}(?!\d)/.test(t.replace(/\d{1,3}(?:\.\d{3})+,\d{2}/g, ''))) return true;
  if (/\d+\p{L}{3,}|\p{L}{3,}\d+/u.test(t)) return true;
  return numeros.filter(n => /[.,]\d{1,2}$/.test(n)).length > 1;
}
