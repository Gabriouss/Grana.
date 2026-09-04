type Ouvinte = () => void;

const ouvintes = new Set<Ouvinte>();

/**
 * Sinal leve entre a camada de persistência e o sincronizador dos widgets.
 * Não carrega dados e não importa Supabase, evitando ciclos com `lib/data`.
 */
export function notificarDadosDosWidgetsAlterados(): void {
  for (const ouvinte of ouvintes) ouvinte();
}
export function observarDadosDosWidgets(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
