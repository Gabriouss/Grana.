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

/**
 * Pasta onde o Kotlin do widget guarda uma fala que não conseguiu entregar ao
 * JavaScript (`startService` da ponte recusado). É `filesDir/voz-orfa/` no
 * nativo, o mesmo lugar que `documentDirectory` aponta aqui. Cada arquivo se
 * chama `<requestId>.m4a`. Mesma constante que `PASTA_ORFA` em
 * GranaVoiceCaptureService.kt.
 */
export const PASTA_ORFA = 'voz-orfa';

/**
 * Traz para esta fila as falas que o widget guardou sem conseguir entregar
 * (achado V4 do Watchtower, 26/09/2026: antes o áudio era apagado). O
 * requestId vem do nome do arquivo, o mesmo que o widget gerou, então a
 * idempotência do servidor continua valendo. O arquivo de origem só é apagado
 * depois de copiado para a fila; falha deixa log e o arquivo, para a próxima
 * abertura tentar de novo.
 */
export async function adotarVozesOrfas(userId: string): Promise<number> {
  const fs = await import('expo-file-system/legacy');
  const pasta = `${fs.documentDirectory}${PASTA_ORFA}/`;
  let nomes: string[];
  try {
    if (!(await fs.getInfoAsync(pasta)).exists) return 0;
    nomes = await fs.readDirectoryAsync(pasta);
  } catch (e) {
    console.error('[voz] não consegui ler as falas guardadas pelo widget', e);
    return 0;
  }
  let adotadas = 0;
  for (const nome of nomes.filter((n) => n.endsWith('.m4a'))) {
    const caminho = `${pasta}${nome}`;
    try {
      await adicionarVozPendente({ caminho, requestId: nome.slice(0, -'.m4a'.length), userId, source: 'widget' });
      await fs.deleteAsync(caminho, { idempotent: true });
      adotadas++;
    } catch (e) {
      console.error('[voz] fala guardada pelo widget não entrou na fila', nome, e);
    }
  }
  return adotadas;
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
