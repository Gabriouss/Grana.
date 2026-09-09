import { AppRegistry, Platform } from 'react-native';
import { isLikelyNetworkError } from './offline-cache';
import type { CreditCard } from './types';

class VozPendenteOffline extends Error {
  readonly nome = 'VozPendenteOffline';
}

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

type Payload = { caminho?: string; requestId?: string; source?: 'app' | 'widget'; transcricao?: string };

async function executarTarefa(payload: Payload) {
  const { definirEstado } = await import('@/modules/grana-voice-widget');
  const caminho = payload?.caminho;
  const requestId = payload?.requestId;
  /* O estado final do widget é decidido aqui e não no `finally` de sempre:
     quando não há como avisar a pessoa, ele NÃO pode voltar ao repouso como
     se nada tivesse acontecido — é justamente esse "nada aconteceu" que
     esconderia um lançamento perdido. */
  let estadoFinal: 'ocioso' | 'atencao' = 'ocioso';
  let manterArquivo = false;
  const contexto: { transcricao?: string } = {};

  try {
    if (!caminho) return;
    if (!requestId) throw new Error('request_id_ausente');

    /* Antes de gastar transcrição, e muito antes de gravar qualquer coisa:
       sem permissão de notificação o widget não tem como entregar o recibo
       nem o "Desfazer". Nesse caso ele não lança — acende o estado de
       atenção, e um toque abre o app pra resolver a permissão. */
    const { podeNotificar } = await import('./widget-voz-notificacoes');
    if (!(await podeNotificar())) {
      estadoFinal = 'atencao';
      // Uma retomada sem permissão não pode apagar o áudio preservado.
      manterArquivo = payload.source === 'app' || caminho.includes('/voz-pendente/');
      return;
    }

    const salvou = await processar(caminho, requestId, contexto, payload);
    if (salvou) await sincronizarResumoDepoisDaVoz();
    else estadoFinal = 'atencao';
  } catch (erro) {
    console.warn('[voz:widget] tarefa interrompida', (erro as { code?: string })?.code ?? 'falha');
    estadoFinal = 'atencao';
    if (erro instanceof VozPendenteOffline || isLikelyNetworkError(erro)) {
      /* A gravação já aconteceu. Não apagá-la é a diferença entre "sem rede"
         ser uma espera transparente e perder a fala junto com a notificação. */
      if (caminho && requestId) {
        const [{ adicionarVozPendente }, { supabase }] = await Promise.all([
          import('./widget-voz-pendentes'),
          import('./supabase'),
        ]);
        /* A fila é vinculada ao usuário autenticado. Sem isso, alguém que
           saia da conta antes da rede voltar poderia lançar o áudio antigo na
           conta seguinte do mesmo aparelho. */
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (userId) {
          await adicionarVozPendente({ caminho, requestId, userId, source: payload.source, transcricao: contexto.transcricao ?? payload.transcricao });
          manterArquivo = true;
          try {
            const { notificarPendenteOffline } = await import('./widget-voz-notificacoes');
            await notificarPendenteOffline();
          } catch {
            // A fila continua sendo a fonte de verdade se a notificação falhar.
          }
        }
      }
    } else {
      try {
        const notificacoes = await import('./widget-voz-notificacoes');
        if (contexto.transcricao) {
          /* Se a captura e a transcrição deram certo, devolver a fala para a
             revisão é muito mais útil que "erro interno" sem contexto. */
          await notificacoes.notificarRevisao('Não consegui salvar', contexto.transcricao);
        } else {
          await notificacoes.notificarFalha('erro_interno');
        }
      } catch {
        // O estado de atenção continua sendo o recibo mínimo se a notificação
        // também falhar: o próximo toque abre o app em vez de parecer perdido.
      }
    }
  } finally {
    /* Áudio financeiro não fica no aparelho depois de usado, e o widget não
       pode ficar preso em "Lançando…" — os dois valem em QUALQUER saída,
       inclusive erro. */
    if (caminho && !manterArquivo) await apagarArquivo(caminho);
    if (requestId && !manterArquivo) {
      const { removerVozPendente } = await import('./widget-voz-pendentes');
      await removerVozPendente(requestId);
    }
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

async function processar(caminho: string, requestId: string, contexto: { transcricao?: string }, payload: Payload): Promise<boolean> {
  const [{ transcreverAudio }, notificacoes, heuristics, data, voiceOperations] = await Promise.all([
    import('./voz'),
    import('./widget-voz-notificacoes'),
    import('./heuristics'),
    import('./data'),
    import('./voice-operations'),
  ]);

  const uri = caminho.startsWith('file://') ? caminho : `file://${caminho}`;
  const transcricao = payload.transcricao
    ? { ok: true as const, transcript: payload.transcricao }
    : await transcreverAudio(uri, { mimeType: 'audio/m4a', nomeArquivo: 'widget.m4a' });
  if (!transcricao.ok) {
    if (transcricao.codigo === 'sem_rede' || transcricao.codigo === 'demorou') {
      throw new VozPendenteOffline('A transcrição será retomada quando houver conexão.');
    }
    await notificacoes.notificarFalha(transcricao.codigo);
    return false;
  }

  const texto = transcricao.transcript;
  contexto.transcricao = texto;
  if (payload.source === 'app') {
    await notificacoes.notificarRevisao('Revise seu lançamento por voz', texto);
    return false;
  }
  const { precisaRevisarValorVoz } = await import('./voz-confiabilidade');
  if (precisaRevisarValorVoz(texto)) {
    await notificacoes.notificarRevisao('Confirme o valor que ouvi', texto);
    return false;
  }
  const valor = heuristics.guessAmountFromText(texto);

  /* Sem valor não se salva nada — é a regra que separa "lançou errado" de
     "não lançou". A pessoa revê no app, com o que foi ouvido já preenchido. */
  if (!valor || valor <= 0) {
    await notificacoes.notificarRevisao('Não encontrei o valor', texto);
    return false;
  }

  const { fetchWallets } = await import('./wallets');
  let prazoReferencias: ReturnType<typeof setTimeout> | undefined;
  const [extras, carteiras, cartoesDisponiveis] = await Promise.race([
    Promise.all([categoriasDaPessoa(data), fetchWallets(), heuristics.ehIntencaoCredito(texto) ? data.fetchCreditCards() : Promise.resolve([])]),
    new Promise<never>((_, reject) => {
      prazoReferencias = setTimeout(() => reject(new VozPendenteOffline('timeout ao carregar referências')), 8_000);
    }),
  ]).finally(() => clearTimeout(prazoReferencias));
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

  const carteiraMencionada = heuristics.matchWalletByText(texto, carteiras);
  const mencionaCarteira = /\b(?:carteira|conta)\s+[\p{L}\d]/iu.test(texto);
  if (mencionaCarteira && !carteiraMencionada) {
    await notificacoes.notificarRevisao('Qual carteira?', texto);
    return false;
  }
  const carteira = carteiraMencionada ?? carteiras.find((w) => w.is_default) ?? carteiras[0];
  if (!carteira) {
    await notificacoes.notificarRevisao('Nenhuma carteira cadastrada', texto);
    return false;
  }
  const textoFinanceiro = carteiraMencionada ? heuristics.limparReferenciaCarteira(texto, carteira.name) : texto;
  const tipo = heuristics.guessTypeFromText(textoFinanceiro);
  const descricao = heuristics.guessDescFromText(textoFinanceiro, tipo) || 'Lançamento por voz';

  // Boleto antes de crédito: "boleto no cartão" é boleto. Mesma ordem do bot.
  if (heuristics.ehIntencaoBoleto(texto)) {
    const dueDate = heuristics.parseDiaVencimento(texto);
    const resultado = await voiceOperations.registrarOperacaoVoz(requestId, 'widget', {
      kind: 'bill',
      description: descricao,
      amount: valor,
      category: categoria.name,
      color: categoria.color,
      due_date: dueDate,
      recurring: heuristics.parseRecorrencia(texto),
      wallet_id: carteira.id,
    });
    if (resultado.status === 'pending') { await notificacoes.notificarSalvoLocal(); return true; }
    if (resultado.status === 'undone') return true;
    try {
      await notificacoes.notificarSucesso({
        titulo: `${descricao} — ${formatarBRL(valor)}`,
        texto: `Conta a pagar · vence ${formatarData(dueDate)}`,
        tipo: 'bill',
        ids: resultado.ids,
        operationId: resultado.operationId,
      });
    } catch {
      /* A RPC já confirmou a gravação. Uma falha no recibo nunca deve fazer
         parecer que o lançamento não existiu nem provocar nova tentativa. */
    }
    return true;
  }

  if (heuristics.ehIntencaoCredito(texto)) {
    return lancarNoCredito({
      requestId, texto, valor, descricao, categoria, carteiraId: carteira.id, cartoesDisponiveis, heuristics, data, notificacoes, voiceOperations,
    });
  }

  const formaPagamento = heuristics.parseFormaPagamento(texto);
  const resultado = await voiceOperations.registrarOperacaoVoz(requestId, 'widget', {
    kind: 'transaction',
    type: tipo,
    description: descricao,
    amount: valor,
    category: categoria.name,
    color: categoria.color,
    occurred_on: hojeISO(),
    recurring: heuristics.parseRecorrencia(texto),
    ...(formaPagamento ? { payment_method: formaPagamento } : null),
    wallet_id: carteira.id,
  });
  if (resultado.status === 'pending') { await notificacoes.notificarSalvoLocal(); return true; }
  if (resultado.status === 'undone') return true;

  try {
    await notificacoes.notificarSucesso({
      titulo: `${descricao} — ${formatarBRL(valor)}`,
      texto: [categoria.name, nomeDaForma(formaPagamento), heuristics.parseRecorrencia(texto) ? 'todo mês' : null]
        .filter(Boolean)
        .join(' · '),
      tipo: 'transaction',
      ids: resultado.ids,
      operationId: resultado.operationId,
    });
  } catch {
    /* O lançamento já foi confirmado no banco; o próximo refresh do app o
       encontra mesmo que o recibo local não possa ser publicado. */
  }
  return true;
}

async function lancarNoCredito(args: {
  requestId: string;
  texto: string;
  valor: number;
  descricao: string;
  categoria: { name: string; color: string };
  carteiraId: string;
  cartoesDisponiveis: CreditCard[];
  heuristics: typeof import('./heuristics');
  data: typeof import('./data');
  notificacoes: typeof import('./widget-voz-notificacoes');
  voiceOperations: typeof import('./voice-operations');
}): Promise<boolean> {
  const { requestId, texto, valor, descricao, categoria, carteiraId, heuristics, data, notificacoes, voiceOperations } = args;

  const cartoes = args.cartoesDisponiveis;
  /* Sem cartão cadastrado, crédito NÃO vira Pix nem débito caladinho: a
     forma de pagamento muda de quem cobra e quando, e adivinhar isso é
     inventar um fato financeiro. */
  if (cartoes.length === 0) {
    await notificacoes.notificarRevisao('Nenhum cartão cadastrado', texto);
    return false;
  }

  const cartaoIdentificado = heuristics.matchCardByText(texto, cartoes);
  if (!cartaoIdentificado && cartoes.length > 1) {
    await notificacoes.notificarRevisao('Qual cartão?', texto);
    return false;
  }
  const cartao = cartaoIdentificado ?? cartoes[0];
  if (cartao.wallet_id && cartao.wallet_id !== carteiraId) {
    await notificacoes.notificarRevisao('Cartão e carteira não combinam', texto);
    return false;
  }
  const parcelas = heuristics.parseParcelas(texto);

  if (parcelas && parcelas > 1) {
    const resultado = await voiceOperations.registrarOperacaoVoz(requestId, 'widget', {
      kind: 'installment',
      type: 'out',
      description: descricao,
      amount: valor,
      category: categoria.name,
      color: categoria.color,
      occurred_on: hojeISO(),
      payment_method: 'credit',
      card_id: cartao.id,
      installments: parcelas,
      wallet_id: carteiraId,
    });
    if (resultado.status === 'pending') { await notificacoes.notificarSalvoLocal(); return true; }
    if (resultado.status === 'undone') return true;
    const { checarLimiteCartao } = await import('./creditLimitAlert');
    checarLimiteCartao(cartao.id).catch(() => {});
    try {
      await notificacoes.notificarSucesso({
        titulo: `${descricao} — ${formatarBRL(valor)}`,
        texto: `${parcelas}x no ${cartao.name} · ${categoria.name}`,
        tipo: 'transaction',
        ids: resultado.ids,
        operationId: resultado.operationId,
      });
    } catch {
      // A operação já está confirmada; não repetir para tentar publicar o recibo.
    }
    return true;
  }

  const resultado = await voiceOperations.registrarOperacaoVoz(requestId, 'widget', {
    kind: 'transaction',
    type: 'out',
    description: descricao,
    amount: valor,
    category: categoria.name,
    color: categoria.color,
    occurred_on: hojeISO(),
    payment_method: 'credit',
    card_id: cartao.id,
    recurring: heuristics.parseRecorrencia(texto),
    wallet_id: carteiraId,
  });
  if (resultado.status === 'pending') { await notificacoes.notificarSalvoLocal(); return true; }
  if (resultado.status === 'undone') return true;
  const { checarLimiteCartao } = await import('./creditLimitAlert');
  checarLimiteCartao(cartao.id).catch(() => {});
  try {
    await notificacoes.notificarSucesso({
      titulo: `${descricao} — ${formatarBRL(valor)}`,
      texto: `Crédito · ${cartao.name} · ${categoria.name}`,
      tipo: 'transaction',
      ids: resultado.ids,
      operationId: resultado.operationId,
    });
  } catch {
    // A operação já está confirmada; não repetir para tentar publicar o recibo.
  }
  return true;
}

let filaEmExecucao = false;

/** Retoma áudios que foram gravados sem internet quando o app volta à frente. */
export async function tentarVozesPendentes(): Promise<void> {
  if (filaEmExecucao || Platform.OS !== 'android') return;
  filaEmExecucao = true;
  try {
    const [{ listarVozesPendentes, removerVozPendente }, { podeNotificar }, { supabase }] = await Promise.all([
      import('./widget-voz-pendentes'),
      import('./widget-voz-notificacoes'),
      import('./supabase'),
    ]);
    if (!(await podeNotificar())) return;
    const { data: sessao } = await supabase.auth.getSession();
    const userId = sessao.session?.user.id;
    if (!userId) return;

    for (const item of (await listarVozesPendentes()).filter((item) => item.userId === userId)) {
      // Mantém o item até a tarefa concluir; uma interrupção permite retomada.
      await executarTarefa(item);
    }
  } catch {
    // A fila permanece no aparelho; a próxima abertura/retomada tenta de novo.
  } finally {
    filaEmExecucao = false;
  }
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
    const cats = await data.fetchCategories();
    return cats.filter((c) => !c.is_default).map((c) => ({ name: c.name, color: c.color }));
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
