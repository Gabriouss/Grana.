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
  /** RESERVA (07/10/2026): a tarefa que está processando esta fala anotou
      aqui quando começou. Enquanto a reserva vale (`PRAZO_RESERVA_MS`), a
      fala não é listada nem retomada: a tarefa ainda está viva. Se a tarefa
      morrer (o Android mata a tarefa headless aos 120 s, ou mata o processo),
      a reserva vence e a fala vira uma fala guardada comum, retomada na
      próxima abertura do app com o mesmo requestId. */
  emAndamentoDesde?: number;
  /** O arquivo que a captura entregou (cache), para apagá-lo quando a fala
      sair da fila por uma retomada que não o conhece mais. */
  origem?: string;
};

/**
 * Quanto dura a reserva de uma fala em processamento. Maior que o teto de
 * 120 s da tarefa headless (GranaVoiceHeadlessService.kt): antes disso a
 * tarefa pode estar viva, e retomar a fala seria processá-la duas vezes.
 */
export const PRAZO_RESERVA_MS = 150_000;

function reservaVale(item: VozPendente): boolean {
  return typeof item.emAndamentoDesde === 'number' && Date.now() - item.emAndamentoDesde < PRAZO_RESERVA_MS;
}

/**
 * Fila ilegível NUNCA vira fila vazia calada (regra 9; 07/10/2026). Até aqui
 * um JSON truncado devolvia `[]` sem log, e a gravação seguinte passava por
 * cima: as falas guardadas sumiam sem ninguém saber. Agora o conteúdo é
 * copiado para outra chave antes de qualquer coisa, e fica o log. Os áudios
 * continuam em `voz-pendente/`.
 */
async function preservarFilaIlegivel(bruto: string, causa: unknown): Promise<void> {
  console.error('[voz] fila de falas guardadas ilegível; conteúdo preservado para recuperação', causa);
  try {
    const copia = `${CHAVE}:ilegivel`;
    if (!(await AsyncStorage.getItem(copia))) await AsyncStorage.setItem(copia, bruto);
  } catch (erroCopia) {
    console.error('[voz] não consegui preservar a fila ilegível', erroCopia);
  }
}

async function ler(): Promise<VozPendente[]> {
  let bruto: string | null = null;
  try {
    bruto = await AsyncStorage.getItem(CHAVE);
    if (!bruto) return [];
    const itens = JSON.parse(bruto) as unknown;
    if (!Array.isArray(itens)) {
      await preservarFilaIlegivel(bruto, 'não é uma lista');
      return [];
    }
    return itens.filter((item): item is VozPendente => (
      !!item && typeof item === 'object' &&
      typeof (item as VozPendente).caminho === 'string' &&
      typeof (item as VozPendente).requestId === 'string' &&
      typeof (item as VozPendente).userId === 'string' &&
      typeof (item as VozPendente).criadoEm === 'number'
    ));
  } catch (erro) {
    if (bruto) await preservarFilaIlegivel(bruto, erro);
    else console.error('[voz] não consegui ler a fila de falas guardadas', erro);
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

// App e HeadlessJsTaskService usam o runtime React Native da aplicação.
// Serializar o ciclo inteiro, inclusive cópia, impede snapshots de disco concorrentes.
// Só as mutações folhas entram aqui: adoção/conclusão chamam essas folhas.
let mutacaoEmCurso: Promise<unknown> = Promise.resolve();

/**
 * Prazo de UMA mutação da fila (achado R5 do Lynx, 08/10/2026). Sem ele, uma
 * cópia de áudio que o disco nunca termina segurava a vez para sempre: a
 * fala seguinte, a limpeza do fim da tarefa e a retomada ficavam todas
 * esperando, fora de qualquer prazo, sem recibo. Quem chama recebe o erro e
 * segue pelo próprio caminho de falha.
 */
export const PRAZO_MUTACAO_FILA_MS = 10_000;

/** A vez de uma mutação. `vencida`: o prazo passou e a vez já é de outra. */
type Vez = { vencida: boolean };

function naVez<T>(trabalho: (vez: Vez) => Promise<T>): Promise<T> {
  const executar = (): Promise<T> => {
    const vez: Vez = { vencida: false };
    const feito = trabalho(vez);
    // A mutação abandonada não pode virar rejeição sem dono.
    feito.catch(() => {});
    let corte: ReturnType<typeof setTimeout> | undefined;
    const estouro = new Promise<never>((_, rejeitar) => {
      corte = setTimeout(() => {
        vez.vencida = true;
        console.error('[voz] uma mutação da fila de falas não terminou no prazo; a vez foi liberada');
        rejeitar(new Error('a fila de falas não respondeu no prazo'));
      }, PRAZO_MUTACAO_FILA_MS);
    });
    return Promise.race([feito, estouro]).finally(() => clearTimeout(corte));
  };
  const proxima = mutacaoEmCurso.then(executar, executar);
  mutacaoEmCurso = proxima.catch(() => {});
  return proxima;
}

/**
 * A ÚNICA escrita da fila dentro de uma mutação. Liberar a vez no prazo, só,
 * traria a corrida de volta: a mutação vencida, ao terminar depois, gravaria
 * por cima o retrato velho que leu. Vencida, ela não escreve mais.
 */
async function gravarNaVez(vez: Vez, itens: VozPendente[]): Promise<void> {
  if (vez.vencida) throw new Error('mutação vencida não grava a fila');
  await gravar(itens);
}

/**
 * Cópia que a mutação fez e não conseguiu indexar. Fora do prazo (`vencida`),
 * a vez já é de outra mutação, que pode ter guardado A MESMA fala no mesmo
 * caminho (`voz-pendente/<requestId>.m4a`): apagar na hora levaria o áudio
 * que a fila passou a apontar (resíduo da leitura final do Lynx, 08/10/2026).
 * Então a limpeza entra na fila de mutações e só apaga se nenhum item usar o
 * arquivo. Dentro do prazo ninguém mais mexeu na fila, e apaga já.
 */
async function apagarCopiaSemIndice(vez: Vez, destino: string): Promise<void> {
  const fs = await import('expo-file-system/legacy');
  const apagar = () => fs.deleteAsync(destino, { idempotent: true }).catch((e) => console.error('[voz] cópia sem índice não saiu', e));
  if (!vez.vencida) { await apagar(); return; }
  void naVez(async () => {
    if (!(await ler()).some((i) => i.caminho === destino)) await apagar();
  }).catch((e) => console.error('[voz] limpeza da cópia da mutação vencida não rodou', e));
}

/** `file://` na frente, como o disco do Expo espera. */
function uriDe(caminho: string): string {
  return caminho.startsWith('file://') ? caminho : `file://${caminho}`;
}

/**
 * RESERVA a fala na fila no começo do processamento (07/10/2026): copia o
 * áudio para `voz-pendente/` e anota quando a tarefa começou. É o que impede
 * a fala de se perder se a tarefa for morta no meio: até aqui o áudio ficava
 * no cache, sem ninguém apontando para ele, e nada o trazia de volta.
 *
 * Devolve `true` se reservou. `false` quando a fala já está na fila (veio
 * dela, ou já foi reservada) ou já foi concluída nesta execução.
 */
async function reservarSemConcorrencia(vez: Vez, item: Omit<VozPendente, 'criadoEm' | 'emAndamentoDesde' | 'origem'> & { criadoEm?: number }): Promise<boolean> {
  if (concluidas.has(item.requestId)) return false;
  const itens = await ler();
  if (itens.some((existente) => existente.requestId === item.requestId)) return false;
  const fs = await import('expo-file-system/legacy');
  const pasta = `${fs.documentDirectory}voz-pendente/`;
  await fs.makeDirectoryAsync(pasta, { intermediates: true });
  const destino = `${pasta}${item.requestId}.m4a`;
  const origem = uriDe(item.caminho);
  await fs.copyAsync({ from: origem, to: destino });
  itens.push({ ...item, caminho: destino, origem, criadoEm: item.criadoEm ?? Date.now(), emAndamentoDesde: Date.now() });
  try { await gravarNaVez(vez, itens); }
  catch (erro) {
    // Não deixar cópia sem índice. O original ainda pertence à captura.
    await apagarCopiaSemIndice(vez, destino);
    throw erro;
  }
  return true;
}

/**
 * A tarefa terminou e a fala NÃO precisa ficar guardada (lançou, pediu
 * revisão por notificação ou foi descartada): desfaz a reserva e apaga a
 * cópia do áudio. Só mexe em fala ainda reservada; a que virou fala guardada
 * de verdade fica.
 */
async function liberarSemConcorrencia(vez: Vez, requestId: string): Promise<void> {
  const itens = await ler();
  const item = itens.find((i) => i.requestId === requestId);
  if (!item || typeof item.emAndamentoDesde !== 'number') return;
  await gravarNaVez(vez, itens.filter((i) => i.requestId !== requestId));
  await apagarAudio(item.caminho);
}

async function adicionarSemConcorrencia(vez: Vez, item: Omit<VozPendente, 'criadoEm'> & { criadoEm?: number }): Promise<void> {
  if (concluidas.has(item.requestId)) return;
  const itens = await ler();
  const existente = itens.find((i) => i.requestId === item.requestId);
  if (existente) {
    /* A fala estava RESERVADA pela tarefa e agora fica guardada de verdade
       (sem rede, sem notificação, prazo): sai a reserva, para ela aparecer e
       ser retomada já, e entra o que a tarefa aprendeu (a transcrição). O
       áudio é a cópia feita na reserva. */
    if (typeof existente.emAndamentoDesde !== 'number') return;
    const { emAndamentoDesde: _reserva, ...semReserva } = existente;
    await gravarNaVez(vez, itens.map((i) => (i.requestId === item.requestId
      ? { ...semReserva, ...(item.transcricao ? { transcricao: item.transcricao } : null) }
      : i)));
    return;
  }
  const fs = await import('expo-file-system/legacy');
  const pasta = `${fs.documentDirectory}voz-pendente/`;
  await fs.makeDirectoryAsync(pasta, { intermediates: true });
  const destino = `${pasta}${item.requestId}.m4a`;
  await fs.copyAsync({ from: item.caminho.startsWith('file://') ? item.caminho : `file://${item.caminho}`, to: destino });
  itens.push({ ...item, caminho: destino, criadoEm: item.criadoEm ?? Date.now() });
  try { await gravarNaVez(vez, itens); }
  catch (erro) {
    await apagarCopiaSemIndice(vez, destino);
    throw erro;
  }
}

/**
 * Pasta onde o Kotlin do widget guarda uma fala que não conseguiu entregar ao
 * JavaScript (`startService` da ponte recusado). É `filesDir/voz-orfa/` no
 * nativo, o mesmo lugar que `documentDirectory` aponta aqui. Cada arquivo se
 * chama `<requestId>.m4a`. Mesma constante que `PASTA_ORFA` em
 * GranaVoiceCaptureService.kt.
 */
export const PASTA_ORFA = 'voz-orfa';

/** Fallback durável quando AsyncStorage falha. Só adotar pela conta dona. */
export async function guardarVozOrfa(item: Omit<VozPendente, 'criadoEm'> & { criadoEm?: number }): Promise<void> {
  const fs = await import('expo-file-system/legacy');
  const pasta = `${fs.documentDirectory}${PASTA_ORFA}/`;
  await fs.makeDirectoryAsync(pasta, { intermediates: true });
  const destino = `${pasta}${item.requestId}.m4a`;
  // Metadados ANTES do áudio: nunca adotar sem o dono de uma fala do JS.
  await fs.writeAsStringAsync(destino.replace(/\.m4a$/, '.json'), JSON.stringify({
    userId: item.userId, source: item.source ?? 'widget', capturadoEm: item.criadoEm ?? Date.now(),
    dataCaptura: item.dataCaptura, referenciaAproximada: item.referenciaAproximada,
    transcricao: item.transcricao,
  }));
  try {
    await fs.copyAsync({ from: uriDe(item.caminho), to: destino });
  } catch (erro) {
    // Metadados sem áudio não servem a ninguém.
    await fs.deleteAsync(destino.replace(/.m4a$/, '.json'), { idempotent: true })
      .catch((e) => console.warn('[voz] metadados sem áudio ficaram na pasta', item.requestId, e));
    throw erro;
  }
}

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
): Promise<{ criadoEm?: number; dataCaptura?: string; referenciaAproximada?: boolean;
  userId?: string; source?: 'app' | 'widget'; transcricao?: string }> {
  const metadados = audio.replace(/\.m4a$/, '.json');
  try {
    if ((await fs.getInfoAsync(metadados)).exists) {
      const lido = JSON.parse(await fs.readAsStringAsync(metadados)) as {
        capturadoEm?: unknown; dataCaptura?: unknown; userId?: unknown; source?: unknown; transcricao?: unknown;
      };
      const dono = typeof lido?.userId === 'string' ? lido.userId : undefined;
      const source = lido?.source === 'app' || lido?.source === 'widget' ? lido.source : undefined;
      const transcricao = typeof lido?.transcricao === 'string' ? lido.transcricao : undefined;
      const { ehDataISO } = await import('./data-da-fala');
      if (ehDataISO(lido?.dataCaptura) && typeof lido.capturadoEm === 'number' && Number.isFinite(lido.capturadoEm) && lido.capturadoEm > 0) {
        return { criadoEm: lido.capturadoEm, dataCaptura: lido.dataCaptura, userId: dono, source, transcricao };
      }
      // Mesmo com data ruim, não descartar a propriedade da fala de JS.
      if (dono) return { userId: dono, source, transcricao, referenciaAproximada: true };
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
      if (captura.userId && captura.userId !== userId) continue;
      await adicionarVozPendente({ caminho, requestId: nome.slice(0, -'.m4a'.length), ...captura, source: captura.source ?? 'widget', userId });
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

/** As falas guardadas. Fala RESERVADA por uma tarefa ainda dentro do prazo
    não aparece: ela está sendo processada agora. */
export async function listarVozesPendentes(): Promise<VozPendente[]> {
  return (await ler()).filter((item) => !concluidas.has(item.requestId) && !reservaVale(item));
}

/** Marca a fala como "precisa de revisão": ela sai das retomadas automáticas,
    mas o áudio continua no aparelho. */
async function marcarSemConcorrencia(vez: Vez, requestId: string, transcricao?: string): Promise<void> {
  await gravarNaVez(vez, (await ler()).map((item) => (item.requestId === requestId
    ? { ...item, revisao: true, ...(transcricao ? { transcricao } : null) }
    : item)));
}

/** "Tentar de novo": a fala volta às retomadas, com o mesmo áudio. A
    transcrição antiga sai, para o servidor ouvir de novo. */
async function tirarSemConcorrencia(vez: Vez, requestId: string): Promise<void> {
  await gravarNaVez(vez, (await ler()).map((item) => {
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

async function removerSemConcorrencia(vez: Vez, requestId: string): Promise<void> {
  const itens = await ler();
  const item = itens.find((i) => i.requestId === requestId);
  await gravarNaVez(vez, itens.filter((i) => i.requestId !== requestId));
  /* Fala de tarefa morta, retomada depois: o original que a captura deixou
     no cache sai junto (é o mesmo arquivo que a tarefa apaga quando termina).
     Nunca a própria cópia da fila. */
  if (item?.origem && !item.origem.includes('/voz-pendente/')) {
    try {
      const fs = await import('expo-file-system/legacy');
      await fs.deleteAsync(item.origem, { idempotent: true });
    } catch (erro) {
      console.warn('[voz] original da fala retomada ficou no cache', requestId, erro);
    }
  }
}

/** Saída explícita da conta elimina suas gravações financeiras, não as de
 * outra conta. Não expirar silenciosamente uma fala ainda não sincronizada. */
async function limparSemConcorrencia(vez: Vez, userId: string): Promise<void> {
  const itens = await ler();
  const fs = await import('expo-file-system/legacy');
  for (const item of itens.filter(item => item.userId === userId)) {
    // Só a pasta privada gerenciada pela fila é um alvo válido de exclusão.
    if (item.caminho.startsWith(`${fs.documentDirectory}voz-pendente/`)) {
      await fs.deleteAsync(item.caminho, { idempotent: true });
    }
  }
  await gravarNaVez(vez, itens.filter(item => item.userId !== userId));
}

/** Os argumentos de uma mutação, sem a vez, que é `naVez` quem entrega. */
type SemVez<F> = F extends (vez: Vez, ...resto: infer R) => unknown ? R : never;

export const reservarFalaEmAndamento = (...args: SemVez<typeof reservarSemConcorrencia>) => naVez((vez) => reservarSemConcorrencia(vez, ...args));
export const liberarFalaEmAndamento = (...args: SemVez<typeof liberarSemConcorrencia>) => naVez((vez) => liberarSemConcorrencia(vez, ...args));
export const adicionarVozPendente = (...args: SemVez<typeof adicionarSemConcorrencia>) => naVez((vez) => adicionarSemConcorrencia(vez, ...args));
export const marcarVozEmRevisao = (...args: SemVez<typeof marcarSemConcorrencia>) => naVez((vez) => marcarSemConcorrencia(vez, ...args));
export const tirarVozDaRevisao = (...args: SemVez<typeof tirarSemConcorrencia>) => naVez((vez) => tirarSemConcorrencia(vez, ...args));
export const removerVozPendente = (...args: SemVez<typeof removerSemConcorrencia>) => naVez((vez) => removerSemConcorrencia(vez, ...args));
export const limparVozesDaConta = (...args: SemVez<typeof limparSemConcorrencia>) => naVez((vez) => limparSemConcorrencia(vez, ...args));
