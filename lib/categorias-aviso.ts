import AsyncStorage from '@react-native-async-storage/async-storage';

const emAndamento = new Set<string>();

/** Aviso de mudança de critério, uma vez por usuário neste aparelho. Sem alerta financeiro. */
export async function consumirAvisoCategorias(userId: string): Promise<boolean> {
  if (emAndamento.has(userId)) return false;
  emAndamento.add(userId);
  try {
    const chave = `grana:categorias:aviso-consumo-v1:${userId}`;
    if (await AsyncStorage.getItem(chave) === '1') return false;
    await AsyncStorage.setItem(chave, '1');
    return true;
  } catch (e) {
    console.error('[categorias] aviso de mudança não foi guardado', e);
    return false;
  } finally { emAndamento.delete(userId); }
}
