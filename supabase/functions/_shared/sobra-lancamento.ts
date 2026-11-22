/* Mesma marca de lib/sobra-lancamento.ts (o Deno não importa de lib/; a
   igualdade está travada em __tests__/sobra-dia-de-registro.cjs): confirmar a
   sobra do mês não é dia de registro (A8, autor, 22/11/2026). */
export function ehLancamentoDeSobra(t: { type?: string | null; category?: string | null }): boolean {
  return t.type === 'in' && t.category === 'Sobra do mês';
}
