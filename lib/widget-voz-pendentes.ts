import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * A transcrição depende da rede, mas a gravação não. Quando o widget é usado
 * sem internet, o áudio fica no cache privado do app e entra nesta fila. O
 * requestId não muda: se o servidor tiver recebido o pedido antes da conexão
 * cair, repetir a chamada devolve o mesmo resultado em vez de duplicar o
 * lançamento.
 */
const CHAVE = 'grana:queue:widget-voz-pendente-v1';

export type VozPendente = {
  caminho: string;
  requestId: string;
  userId: string;
  criadoEm: number;
  source?: 'app' | 'widget';
  transcricao?: string;
};

async function ler(): Promise<VozPendente[]> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    if (!bruto) return [];
    const itens = JSON.parse(bruto) as unknown;
    if (!Array.isArray(itens)) return [];
    return itens.filter((item): item is VozPendente => (
      !!item && typeof item === 'object' &&
      typeof (item as VozPendente).caminho === 'string' &&
      typeof (item as VozPendente).requestId === 'string' &&
      typeof (item as VozPendente).userId === 'string' &&
      typeof (item as VozPendente).criadoEm === 'number'
    ));
  } catch {
    return [];
  }
}

async function gravar(itens: VozPendente[]): Promise<void> {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(itens));
}

export async function adicionarVozPendente(item: Omit<VozPendente, 'criadoEm'>): Promise<void> {
  const itens = await ler();
  if (itens.some((existente) => existente.requestId === item.requestId)) return;
  const fs = await import('expo-file-system/legacy');
  const pasta = `${fs.documentDirectory}voz-pendente/`;
  await fs.makeDirectoryAsync(pasta, { intermediates: true });
  const destino = `${pasta}${item.requestId}.m4a`;
  await fs.copyAsync({ from: item.caminho.startsWith('file://') ? item.caminho : `file://${item.caminho}`, to: destino });
  itens.push({ ...item, caminho: destino, criadoEm: Date.now() });
  await gravar(itens);
}

export async function listarVozesPendentes(): Promise<VozPendente[]> {
  return ler();
}

export async function removerVozPendente(requestId: string): Promise<void> {
  await gravar((await ler()).filter((item) => item.requestId !== requestId));
}

/** Saída explícita da conta elimina suas gravações financeiras, não as de
 * outra conta. Não expirar silenciosamente uma fala ainda não sincronizada. */
export async function limparVozesDaConta(userId: string): Promise<void> {
  const itens = await ler();
  const fs = await import('expo-file-system/legacy');
  for (const item of itens.filter(item => item.userId === userId)) {
    // Só a pasta privada gerenciada pela fila é um alvo válido de exclusão.
    if (item.caminho.startsWith(`${fs.documentDirectory}voz-pendente/`)) {
      await fs.deleteAsync(item.caminho, { idempotent: true });
    }
  }
  await gravar(itens.filter(item => item.userId !== userId));
}
