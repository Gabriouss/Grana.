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
  /** Instante da captura quando conhecido (desde 30/09/2026); antes, o da entrada na fila. */
  criadoEm: number;
  /** Data CIVIL da captura (`AAAA-MM-DD`), gravada no início dela e nunca
      recalculada: é a referência de "ontem" e "na sexta" (data na voz). */
  dataCaptura?: string;
  /** A referência foi reconstruída (órfã sem metadados): expressão relativa
      vai para revisão. */
  referenciaAproximada?: boolean;
  source?: 'app' | 'widget';
  transcricao?: string;
  /** A transcrição não entendeu a fala. Ela fica guardada, fora das
      retomadas automáticas, até a pessoa revisar ou descartar (26/09/2026). */
  revisao?: boolean;
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

/**
 * Falas já salvas pela revisão nesta execução do app (achado do Watchtower,
 * 27/09/2026). Marcadas ANTES de qualquer acesso ao disco: mesmo que tirar a
 * fala da fila falhe, ela não é mais listada, adotada nem retomada, e
 * "Tentar de novo" não grava o mesmo gasto outra vez. A fila persistida
 * continua sendo a garantia entre execuções; esta é a trava para quando o
 * disco falha no meio.
 */
const concluidas = new Set<string>();

/** Áudios de falas já concluídas cuja exclusão falhou: tentados de novo a
    cada retomada da fila (`apagarAudiosPendentes`). */
const CHAVE_APAGAR = 'grana:queue:widget-voz-apagar-v1';

async function gravar(itens: VozPendente[]): Promise<void> {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(itens));
}

export async function adicionarVozPendente(item: Omit<VozPendente, 'criadoEm'> & { criadoEm?: number }): Promise<void> {
  if (concluidas.has(item.requestId)) return;
  const itens = await ler();
  if (itens.some((existente) => existente.requestId === item.requestId)) return;
  const fs = await import('expo-file-system/legacy');
  const pasta = `${fs.documentDirectory}voz-pendente/`;
  await fs.makeDirectoryAsync(pasta, { intermediates: true });
  const destino = `${pasta}${item.requestId}.m4a`;
  await fs.copyAsync({ from: item.caminho.startsWith('file://') ? item.caminho : `file://${item.caminho}`, to: destino });
  itens.push({ ...item, caminho: destino, criadoEm: item.criadoEm ?? Date.now() });
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
 *
 * A data da captura (data na voz, 30/09/2026): o widget grava, ao lado do
 * áudio, `<requestId>.json` com `{ capturadoEm, dataCaptura }`, anotados no
 * INÍCIO da gravação. É a referência de "ontem" mesmo que a órfã seja adotada
 * dias depois. Sem esse arquivo, ou com ele ilegível (órfã de antes desta
 * versão), a referência é a data de modificação do áudio, que é o FIM da
 * gravação: marcada aproximada, e expressão relativa vai para revisão. Um
 * metadado ruim nunca custa o áudio. O `.json` só é apagado depois de a fala
 * estar na fila.
 */
async function capturaDaOrfa(
  fs: typeof import('expo-file-system/legacy'),
  audio: string,
): Promise<{ criadoEm?: number; dataCaptura?: string; referenciaAproximada?: boolean }> {
  const metadados = audio.replace(/\.m4a$/, '.json');
  try {
    if ((await fs.getInfoAsync(metadados)).exists) {
      const lido = JSON.parse(await fs.readAsStringAsync(metadados)) as { capturadoEm?: unknown; dataCaptura?: unknown };
      const { ehDataISO } = await import('./data-da-fala');
      if (ehDataISO(lido?.dataCaptura) && typeof lido.capturadoEm === 'number' && Number.isFinite(lido.capturadoEm) && lido.capturadoEm > 0) {
        return { criadoEm: lido.capturadoEm, dataCaptura: lido.dataCaptura };
      }
      console.warn('[voz] metadados da fala guardada pelo widget inválidos; data aproximada', metadados);
    }
  } catch (e) {
    console.warn('[voz] metadados da fala guardada pelo widget ilegíveis; data aproximada', metadados, e);
  }
  try {
    const info = await fs.getInfoAsync(audio);
    const mtime = info.exists ? (info as { modificationTime?: number }).modificationTime : undefined;
    if (typeof mtime === 'number' && mtime > 0) return { criadoEm: mtime * 1000, referenciaAproximada: true };
  } catch (e) {
    console.warn('[voz] data do áudio guardado pelo widget ilegível', audio, e);
  }
  return { referenciaAproximada: true };
}

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
      const captura = await capturaDaOrfa(fs, caminho);
      await adicionarVozPendente({ caminho, requestId: nome.slice(0, -'.m4a'.length), userId, source: 'widget', ...captura });
      await fs.deleteAsync(caminho, { idempotent: true });
      await fs.deleteAsync(caminho.replace(/\.m4a$/, '.json'), { idempotent: true })
        .catch((e) => console.warn('[voz] metadados da fala adotada ficaram na pasta', nome, e));
      adotadas++;
    } catch (e) {
      console.error('[voz] fala guardada pelo widget não entrou na fila', nome, e);
    }
  }
  return adotadas;
}

export async function listarVozesPendentes(): Promise<VozPendente[]> {
  return (await ler()).filter((item) => !concluidas.has(item.requestId));
}

/** Marca a fala como "precisa de revisão": ela sai das retomadas automáticas,
    mas o áudio continua no aparelho. */
export async function marcarVozEmRevisao(requestId: string, transcricao?: string): Promise<void> {
  await gravar((await ler()).map((item) => (item.requestId === requestId
    ? { ...item, revisao: true, ...(transcricao ? { transcricao } : null) }
    : item)));
}

/** "Tentar de novo": a fala volta às retomadas, com o mesmo áudio. A
    transcrição antiga sai, para o servidor ouvir de novo. */
export async function tirarVozDaRevisao(requestId: string): Promise<void> {
  await gravar((await ler()).map((item) => {
    if (item.requestId !== requestId) return item;
    const { revisao: _revisao, transcricao: _transcricao, ...resto } = item;
    return resto;
  }));
}

/** "Descartar": a única saída de uma fala em revisão que apaga o áudio. */
export async function descartarVozPendente(requestId: string): Promise<void> {
  const item = (await ler()).find((i) => i.requestId === requestId);
  if (!item) return;
  const fs = await import('expo-file-system/legacy');
  // Só a pasta privada gerenciada pela fila é um alvo válido de exclusão.
  if (item.caminho.startsWith(`${fs.documentDirectory}voz-pendente/`)) {
    await fs.deleteAsync(item.caminho, { idempotent: true });
  }
  await removerVozPendente(requestId);
}

/** A limpeza da fala concluída não terminou; o lançamento já está salvo. */
export class LimpezaDaFalaIncompleta extends Error {
  constructor(readonly etapa: 'fila' | 'recibo', causa: unknown) {
    super(`fala concluída, limpeza incompleta: ${etapa}`);
    this.cause = causa;
  }
}

/**
 * A fala foi salva pela revisão (`registrarOperacaoVoz` com `falaGuardada`).
 * Chamar só DEPOIS de salvar. Idempotente. A ordem é o que impede a segunda
 * gravação (achado do Watchtower, 27/09/2026: apagar o arquivo vinha antes de
 * tirar da fila, e uma falha no arquivo deixava a fala retomável):
 *   1. marcada como concluída nesta execução, antes de qualquer disco;
 *   2. tirada da fila persistida;
 *   3. só então o áudio é apagado; se falhar, fica para a próxima retomada;
 *   4. o aviso da fala sai da tela.
 * Lança `LimpezaDaFalaIncompleta` se 2 ou 4 falharem, para quem chama deixar
 * recibo; a trava 1 já vale nesse caso.
 */
export async function concluirVozRevisada(requestId: string): Promise<void> {
  concluidas.add(requestId);
  const item = (await ler()).find((i) => i.requestId === requestId);
  try {
    await removerVozPendente(requestId);
  } catch (erro) {
    throw new LimpezaDaFalaIncompleta('fila', erro);
  }
  if (item) await apagarAudio(item.caminho);
  try {
    const { removerReciboDaFila } = await import('./voz-recibos-da-fila');
    await removerReciboDaFila(requestId);
  } catch (erro) {
    throw new LimpezaDaFalaIncompleta('recibo', erro);
  }
}

/** Apaga o áudio da pasta da fila; se falhar, guarda o caminho para tentar
    de novo, com log. Áudio financeiro não fica no aparelho sem ninguém saber. */
async function apagarAudio(caminho: string): Promise<void> {
  const fs = await import('expo-file-system/legacy');
  // Só a pasta privada gerenciada pela fila é um alvo válido de exclusão.
  if (!caminho.startsWith(`${fs.documentDirectory}voz-pendente/`)) return;
  try {
    await fs.deleteAsync(caminho, { idempotent: true });
  } catch (erro) {
    console.error('[voz] áudio da fala concluída não foi apagado; nova tentativa na próxima retomada', erro);
    try {
      const bruto = await AsyncStorage.getItem(CHAVE_APAGAR);
      const lista: string[] = bruto ? JSON.parse(bruto) : [];
      if (!lista.includes(caminho)) await AsyncStorage.setItem(CHAVE_APAGAR, JSON.stringify([...lista, caminho]));
    } catch (erroLista) {
      console.error('[voz] caminho do áudio a apagar não foi guardado', erroLista);
    }
  }
}

/** Nova tentativa de apagar os áudios de falas concluídas. Chamada no início
    de cada retomada da fila. */
export async function apagarAudiosPendentes(): Promise<void> {
  let lista: string[] = [];
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_APAGAR);
    lista = bruto ? JSON.parse(bruto) : [];
  } catch {
    return;
  }
  if (!lista.length) return;
  const fs = await import('expo-file-system/legacy');
  const restantes: string[] = [];
  for (const caminho of lista) {
    try {
      await fs.deleteAsync(caminho, { idempotent: true });
    } catch (erro) {
      console.error('[voz] áudio da fala concluída segue sem apagar', erro);
      restantes.push(caminho);
    }
  }
  await AsyncStorage.setItem(CHAVE_APAGAR, JSON.stringify(restantes));
}

/** O botão "Revisar" da faixa: publica de novo o recibo de cada fala em
    revisão desta conta, com o mesmo texto do catálogo. Devolve quantas. */
export async function reabrirRevisoesDeFala(userId: string): Promise<number> {
  const [{ guardarReciboDaFila }, { reciboDaFalaGuardada }] = await Promise.all([
    import('./voz-recibos-da-fila'),
    import('./voz-recibos'),
  ]);
  const emRevisao = (await ler()).filter((item) => item.userId === userId && item.revisao && !concluidas.has(item.requestId));
  for (const item of emRevisao) {
    const transcricao = item.transcricao ?? '';
    await guardarReciboDaFila({
      id: item.requestId, dono: userId, tipo: 'audio',
      ...reciboDaFalaGuardada(transcricao),
    });
  }
  return emRevisao.length;
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
