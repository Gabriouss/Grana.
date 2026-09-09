/* Leitura defensiva de payload de webhook.
 *
 * Nasceu dentro de `kiwify.ts` e saiu para cá quando a Cakto entrou: os dois
 * provedores mandam JSON com formatos diferentes, mas o problema é o mesmo —
 * o campo pode vir aninhado em lugares distintos conforme a versão do
 * provedor, pode vir vazio, e nada disso pode derrubar a função.
 *
 * Ficar em módulo próprio evita a cópia: uma correção aqui vale para os dois
 * normalizadores. Este projeto já pagou caro por código duplicado entre app e
 * webhook (ver `__tests__/sync-parser.js`).
 */

/** Primeiro caminho que existir e não for vazio. `a.b.c` desce por objeto. */
export function pegar(obj: unknown, caminhos: string[]): unknown {
  for (const caminho of caminhos) {
    let valor: unknown = obj;
    for (const chave of caminho.split('.')) {
      valor = valor && typeof valor === 'object'
        ? (valor as Record<string, unknown>)[chave]
        : undefined;
      if (valor === undefined) break;
    }
    if (valor !== undefined && valor !== null && valor !== '') return valor;
  }
  return undefined;
}

/** Texto aparado e truncado no limite da coluna, ou nulo. */
export function texto(body: Record<string, unknown>, caminhos: string[], limite = 255): string | null {
  const valor = pegar(body, caminhos);
  if (valor === undefined) return null;
  const limpo = String(valor).trim();
  return limpo ? limpo.slice(0, limite) : null;
}

/* Data em ISO, ou o fallback.
 *
 * O `replace(' ', 'T') + 'Z'` cobre provedor que manda "2026-09-09 12:00:00"
 * sem fuso. Data com fuso explícito (a Cakto manda `-03:00`) passa direto
 * pelo `new Date`, e o `toISOString` normaliza para UTC — que é o que a
 * coluna `timestamptz` espera. */
export function dataIso(valor: string | null, fallback?: string): string | null {
  if (!valor) return fallback ?? null;
  const date = new Date(valor.includes('T') ? valor : valor.replace(' ', 'T') + 'Z');
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback ?? null;
}

/** Forma neutra de provedor que `processar_evento_assinatura` consome. */
export type TipoEventoAssinatura =
  | 'approved'
  | 'renewed'
  | 'late'
  | 'canceled'
  | 'refunded'
  | 'chargeback';

export type EventoAssinatura = {
  type: TipoEventoAssinatura;
  eventId: string | null;
  eventAt: string;
  orderId: string | null;
  subscriptionId: string | null;
  email: string | null;
  plan: string | null;
  accessUntil: string | null;
};
