/**
 * Une as duas últimas palavras com espaço não separável, para a última linha
 * nunca ficar com uma palavra só (regra 29 do AGENTS.md).
 *
 * Serve para texto fixo da landing onde `text-wrap: balance` não resolve,
 * medido em 24/10/2026 (auditoria Leis de UI): título de três palavras cujas
 * duas linhas já têm a mesma largura ("Contas com / vencimento"), e parágrafo
 * com mais de 6 linhas, em que o Chromium não aplica `balance`. Não é para
 * colar em todo texto do app: lá a regra 29 manda reescrever a frase.
 */
export function semViuva(texto: string): string {
  return texto.replace(/\s+(\S+)\s*$/, ' $1');
}
