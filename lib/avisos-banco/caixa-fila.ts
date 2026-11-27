import AsyncStorage from '@react-native-async-storage/async-storage';

export const chaveRevisoesVoz = (dono: string) => `grana_avisos_voz:${dono}`;

let fila: Promise<unknown> = Promise.resolve();
export function naVez<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(tarefa, tarefa);
  fila = resultado.catch(() => undefined);
  return resultado;
}

const geracoes = new Map<string, number>();
const ouvintes = new Map<string, Set<() => void>>();
export const geracaoDaCaixa = (dono: string) => geracoes.get(dono) ?? 0;

export function avisarMudancaDaVoz(dono: string): void {
  for (const ouvinte of ouvintes.get(dono) ?? []) {
    try {
      ouvinte();
    } catch {
      console.warn('[voz:sino] falha ao avisar mudança na caixa');
    }
  }
}

export function assinarRevisoesVoz(dono: string, recarregar: () => void): () => void {
  const assinantes = ouvintes.get(dono) ?? new Set<() => void>();
  assinantes.add(recarregar);
  ouvintes.set(dono, assinantes);
  return () => {
    assinantes.delete(recarregar);
    if (ouvintes.get(dono) === assinantes && !assinantes.size) ouvintes.delete(dono);
  };
}

export function revogarCaixaVoz(dono: string): void {
  geracoes.set(dono, geracaoDaCaixa(dono) + 1);
  avisarMudancaDaVoz(dono);
  ouvintes.delete(dono);
}

export function apagarCaixaVoz(dono: string): Promise<void> {
  return AsyncStorage.removeItem(chaveRevisoesVoz(dono));
}
