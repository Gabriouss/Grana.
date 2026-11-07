import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Agora não" na pergunta da sobra do mês passado (autor, 07/11/2026, rodada 2:
 * "No dia seguinte"). Guarda o DIA local em que a pessoa adiou; no mesmo dia a
 * Início não pergunta de novo, e a sobra continua zero. No dia seguinte volta.
 * Por usuário, neste aparelho. Não é dado financeiro: falhar em ler ou gravar
 * só faz a pergunta voltar antes, então o erro fica no log e não vira alerta.
 */
const chave = (userId: string) => `grana:sobra-adiada:${userId}`;

export async function sobraAdiadaHoje(userId: string, hojeISO: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(chave(userId))) === hojeISO;
  } catch (e) {
    console.error('[sobra] leitura do adiamento falhou', e);
    return false;
  }
}

export async function adiarSobraAteAmanha(userId: string, hojeISO: string): Promise<void> {
  try {
    await AsyncStorage.setItem(chave(userId), hojeISO);
  } catch (e) {
    console.error('[sobra] adiamento não foi guardado', e);
  }
}
