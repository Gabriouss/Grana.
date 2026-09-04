import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_PUSH_REMOTO_ATIVO = '@grana_push_habito_ativo';
const CHAVE_EXPO_PUSH_TOKEN = '@grana_expo_push_token';

export async function pushRemotoAtivo(): Promise<boolean> {
  return (await AsyncStorage.getItem(CHAVE_PUSH_REMOTO_ATIVO).catch(() => null)) === '1';
}

export async function tokenPushSalvo(): Promise<string | null> {
  return AsyncStorage.getItem(CHAVE_EXPO_PUSH_TOKEN).catch(() => null);
}

export async function salvarEstadoPush(token: string): Promise<void> {
  await AsyncStorage.multiSet([
    [CHAVE_EXPO_PUSH_TOKEN, token],
    [CHAVE_PUSH_REMOTO_ATIVO, '1'],
  ]);
}

export async function limparEstadoPush(): Promise<void> {
  await AsyncStorage.multiRemove([CHAVE_EXPO_PUSH_TOKEN, CHAVE_PUSH_REMOTO_ATIVO]);
}
