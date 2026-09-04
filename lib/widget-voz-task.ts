import { AppRegistry, Platform } from 'react-native';

/**
 * Tarefa headless do widget Android de lançamento por voz.
 *
 * Roda com o app FECHADO, sem React e sem tela: o serviço nativo grava o
 * áudio (modules/grana-voice-widget) e entrega o caminho do arquivo aqui.
 * Daqui em diante é o mesmo caminho de sempre — transcrição pela Edge Function
 * (`lib/voz.ts`), interpretação por `lib/heuristics.ts`, gravação por
 * `lib/data.ts`. Nenhuma regra financeira nova mora neste arquivo, de
 * propósito: um segundo motor de lançamento é exatamente o que a unificação
 * existe pra não ter.
 *
 * Registrado no boot do bundle (ver `index.js`), não dentro de um componente:
 * quando o Android inicia a tarefa, não existe árvore React montada.
 *
 * Os imports pesados são carregados DENTRO da tarefa, não no topo: este módulo
 * é avaliado em toda abertura normal do app, e puxar Supabase/notificações só
 * pra registrar um nome de tarefa atrasaria o arranque de todo mundo.
 */

type Payload = { caminho?: string; requestId?: string };

async function executarTarefa(payload: Payload) {
  const { definirEstado } = await import('@/modules/grana-voice-widget');
  const caminho = payload?.caminho;
  /* O estado final do widget é decidido aqui e não no `finally` de sempre:
     quando não há como avisar a pessoa, ele NÃO pode voltar ao repouso como
     se nada tivesse acontecido — é justamente esse "nada aconteceu" que
     esconderia um lançamento perdido. */
  let estadoFinal: 'ocioso' | 'atencao' = 'ocioso';

  try {
    if (!caminho) return;

    /* Antes de gastar transcrição, e muito antes de gravar qualquer coisa:
       sem permissão de notificação o widget não tem como entregar o recibo
       nem o "Desfazer". Nesse caso ele não lança — acende o estado de
       atenção, e um toque abre o app pra resolver a permissão. */
    const { podeNotificar } = await import('./widget-voz-notificacoes');
    if (!(await podeNotificar())) {
      estadoFinal = 'atencao';
      return;
    }

    const salvou = await processar(caminho);
    if (salvou) await sincronizarResumoDepoisDaVoz();
  } catch {
    const { notificarFalha } = await import('./widget-voz-notificacoes');
    await notificarFalha('erro_interno');
  } finally {
    /* Áudio financeiro não fica no aparelho depois de usado, e o widget não
       pode ficar preso em "Lançando…" — os dois valem em QUALQUER saída,
       inclusive erro. */
    if (caminho) await apagarArquivo(caminho);
    definirEstado(estadoFinal);
  }
}

async function apagarArquivo(caminho: string) {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const uri = caminho.startsWith('file://') ? caminho : `file://${caminho}`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Arquivo já sumiu (cache limpo pelo sistema) — nada a fazer.
  }
}

async function processar(caminho: string): Promise<boolean> {
  const [{ transcreverAudio }, notificacoes, heuristics, data] = await Promise.all([
    import('./voz'),
    import('./widget-voz-notificacoes'),
    import('./heuristics'),
    import('./data'),
  ]);

  const uri = caminho.startsWith('file://') ? caminho : `file://${caminho}`;
  const transcricao = await transcreverAudio(uri, { mimeType: 'audio/m4a', nomeArquivo: 'widget.m4a' });
  if (!transcricao.ok) {
    await notificacoes.notificarFalha(transcricao.codigo);
    return false;
  }

  const texto = transcricao.transcript;
  const valor = heuristics.guessAmountFromText(texto);

  /* Sem valor não se salva nada — é a regra que separa "lançou errado" de
     "não lançou". A pessoa revê no app, com o que foi ouvido já preenchido. */
  if (!valor || valor <= 0) {
    await notificacoes.notificarRevisao('Não encontrei o valor', texto);
    return false;
  }

  const extras = await categoriasDaPessoa(data);
  const categoria = heuristics.guessCategoryFromText(texto, extras);

  /* "Outros" é o balde de "não reconheci", não uma escolha. Salvar aqui em
     silêncio empurraria gasto pra categoria errada semana após semana, e
     ninguém revisa o que já foi salvo — então o widget prefere perguntar.
     Custa um toque; o contrário custa um extrato torto.
     Quem falou uma palavra-chave de "Outros" de verdade ("shein 200") também
     cai na revisão: errar pro lado de perguntar é o lado barato. */
  if (categoria.name === 'Outros') {
    await notificacoes.notificarRevisao('Qual categoria?', texto);
    return false;
  }

  const tipo = heuristics.guessTypeFromText(texto);
  const descricao = heuristics.guessDescFromText(texto, tipo) || 'Lançamento por voz';

  // Boleto antes de crédito: "boleto no cartão" é boleto. Mesma ordem do bot.
  if (heuristics.ehIntencaoBoleto(texto)) {
    const conta = await data.addBill({
      description: descricao,
      amount: valor,
      category: categoria.name,
      color: categoria.color,
      due_date: heuristics.parseDiaVencimento(texto),
      recurring: heuristics.parseRecorrencia(texto),
    });
    await notificacoes.notificarSucesso({
      titulo: `${descricao} — ${formatarBRL(valor)}`,
      texto: `Conta a pagar · vence ${formatarData(conta.due_date)}`,
      tipo: 'bill',
      ids: [conta.id],
    });
    return true;
  }

  if (heuristics.ehIntencaoCredito(texto)) {
    return lancarNoCredito({ texto, valor, descricao, categoria, heuristics, data, notificacoes });
  }

  const formaPagamento = heuristics.parseFormaPagamento(texto);
  const lancamento = await data.addTransaction({
    type: tipo,
    description: descricao,
    amount: valor,
    category: categoria.name,
    color: categoria.color,
    occurred_on: hojeISO(),
    recurring: heuristics.parseRecorrencia(texto),
    ...(formaPagamento ? { payment_method: formaPagamento } : null),
  });

  await notificacoes.notificarSucesso({
    titulo: `${descricao} — ${formatarBRL(valor)}`,
    texto: [categoria.name, nomeDaForma(formaPagamento), heuristics.parseRecorrencia(texto) ? 'todo mês' : null]
      .filter(Boolean)
      .join(' · '),
    tipo: 'transaction',
    ids: [lancamento.id],
  });
  return true;
}

async function lancarNoCredito(args: {
  texto: string;
  valor: number;
  descricao: string;
  categoria: { name: string; color: string };
  heuristics: typeof import('./heuristics');
  data: typeof import('./data');
  notificacoes: typeof import('./widget-voz-notificacoes');
}): Promise<boolean> {
  const { texto, valor, descricao, categoria, heuristics, data, notificacoes } = args;

  const cartoes = await data.fetchCreditCards();
  /* Sem cartão cadastrado, crédito NÃO vira Pix nem débito caladinho: a
     forma de pagamento muda de quem cobra e quando, e adivinhar isso é
     inventar um fato financeiro. */
  if (cartoes.length === 0) {
    await notificacoes.notificarRevisao('Nenhum cartão cadastrado', texto);
    return false;
  }

  const cartao = heuristics.matchCardByText(texto, cartoes) ?? cartoes[0];
  const parcelas = heuristics.parseParcelas(texto);

  if (parcelas && parcelas > 1) {
    const criados = await data.addInstallmentPurchase({
      description: descricao,
      totalAmount: valor,
      category: categoria.name,
      color: categoria.color,
      occurred_on: hojeISO(),
      payment_method: 'credit',
      card_id: cartao.id,
      installments: parcelas,
    });
    await notificacoes.notificarSucesso({
      titulo: `${descricao} — ${formatarBRL(valor)}`,
      texto: `${parcelas}x no ${cartao.name} · ${categoria.name}`,
      tipo: 'transaction',
      ids: criados.map((t) => t.id),
    });
    return true;
  }

  const lancamento = await data.addTransaction({
    type: 'out',
    description: descricao,
    amount: valor,
    category: categoria.name,
    color: categoria.color,
    occurred_on: hojeISO(),
    payment_method: 'credit',
    card_id: cartao.id,
    recurring: heuristics.parseRecorrencia(texto),
  });
  await notificacoes.notificarSucesso({
    titulo: `${descricao} — ${formatarBRL(valor)}`,
    texto: `Crédito · ${cartao.name} · ${categoria.name}`,
    tipo: 'transaction',
    ids: [lancamento.id],
  });
  return true;
}

async function sincronizarResumoDepoisDaVoz() {
  try {
    const [{ supabase }, { sincronizarWidgetsHome }, { default: AsyncStorage }] = await Promise.all([
      import('./supabase'),
      import('./widgets-home-sync'),
      import('@react-native-async-storage/async-storage'),
    ]);
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const hidden = (await AsyncStorage.getItem('grana_privacy_hidden')) === '1';
    await sincronizarWidgetsHome(data.user.id, hidden);
  } catch {
    /* O lançamento e o recibo já deram certo. Snapshot é consequência
       best-effort e será atualizado na próxima abertura do app. */
  }
}

async function categoriasDaPessoa(data: typeof import('./data')) {
  try {
    const cats = await data.fetchCategories();
    return cats.filter((c) => !c.is_default).map((c) => ({ name: c.name, color: c.color }));
  } catch {
    return [];
  }
}

function hojeISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatarBRL(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function formatarData(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function nomeDaForma(forma: string | null): string | null {
  if (!forma) return null;
  const nomes: Record<string, string> = { pix: 'Pix', debit: 'Débito', cash: 'Dinheiro', credit: 'Crédito' };
  return nomes[forma] ?? null;
}

/* Só Android tem widget. Registrar em outra plataforma seria ruído — e na web
   `AppRegistry.registerHeadlessTask` nem existe do mesmo jeito. */
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('GranaVoiceTask', () => executarTarefa);
}
