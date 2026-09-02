/**
 * Comparação de versão semântica. Módulo próprio, e sem NENHUM import.
 *
 * Morava dentro de `lib/atualizacao.ts`, que importa expo-constants,
 * AsyncStorage e o cliente Supabase. Quem quisesse reaproveitar a função
 * arrastava as três dependências junto — e os corpus de teste, que rodam em
 * node puro, não conseguiam importar nada disso. `lib/feature-flags` precisa
 * dela para decidir a faixa de versão de um interruptor, e precisa que isso
 * seja testável fora do React Native.
 */

/** Compara "1.2.3" com "1.10.0" numericamente, não como texto — string
    compararia "10" < "2". Retorna positivo se `a` for mais nova que `b`. */
export function compararVersoes(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
