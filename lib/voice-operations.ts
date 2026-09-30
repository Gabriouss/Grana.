import { supabase } from './supabase';
import { idDoUsuarioLocal } from './sessao-offline';
import { notificarDadosDosWidgetsAlterados } from './widgets-home-events';
import { lancamentoGravado } from './cache-de-tela';
import { ITENS_POR_RODADA, ehErroPermanente } from './fila-pendente';
import AsyncStorage from '@react-native-async-storage/async-storage';

type BaseFinanceira = {
  description: string;
  amount: number;
  category: string;
  color: string;
  recurring?: boolean;
  wallet_id: string;
};

export type PayloadOperacaoVoz =
  | (BaseFinanceira & {
      kind: 'bill';
      due_date: string;
    })
  | (BaseFinanceira & {
      kind: 'transaction';
      type: 'in' | 'out';
      occurred_on: string;
      payment_method?: string | null;
      card_id?: string | null;
    })
  | (BaseFinanceira & {
      kind: 'installment';
      type: 'out';
      occurred_on: string;
      installments: number;
      payment_method: 'credit';
      card_id: string;
    });

export type ResultadoOperacaoVoz = {
  status: 'committed' | 'undone' | 'pending';
  operationId: string;
  kind: PayloadOperacaoVoz['kind'];
  ids: string[];
  /** Nada foi gravado agora: a fala já tinha uma operação (replay do
      servidor, ou 22023). Nunca o recibo de lançamento novo (regra 13). */
  replayed: boolean;
  /** O servidor recusou com 22023: este `request_id` já tem uma operação com
      OUTRO conteúdo, e ele não diz se ela está ativa ou foi desfeita. O
      recibo não pode afirmar nenhum dos dois (achado C3 do Lynx, 30/09/2026). */
  conflito?: boolean;
};

/**
 * O que a pessoa fica sabendo depois de uma gravação por voz. Uma decisão só,
 * lida pelas três telas de revisão e pela tarefa da voz (regra 13; achado B1
 * do Lynx, 29/09/2026, em que as telas olhavam só `replayed`):
 *   - 'pendente': guardado no aparelho, sobe quando houver rede;
 *   - 'desfeita': o servidor já tinha esta operação e ela foi desfeita pelo
 *     "Desfazer". Nada existe e nada foi gravado: recibo "Fala já desfeita"
 *     (achado C2 do Lynx, 30/09/2026: o silêncio era indistinguível de "nada
 *     aconteceu"). Dizer "Fala já lançada" aqui seria falso;
 *   - 'ja_lancada': o servidor confirma que a operação existe (replay):
 *     recibo "Fala já lançada", nunca o de lançamento novo;
 *   - 'ja_usada': 22023, a fala já teve uma operação com outro conteúdo, que
 *     pode ter sido desfeita depois: recibo "Fala já usada", que não afirma
 *     nenhum dos dois (achado C3 do Lynx, 30/09/2026);
 *   - 'nova': lançamento novo.
 */
export type DesfechoOperacaoVoz = 'nova' | 'pendente' | 'desfeita' | 'ja_lancada' | 'ja_usada';

export function desfechoDaOperacaoVoz(resultado: Pick<ResultadoOperacaoVoz, 'status' | 'replayed' | 'conflito'>): DesfechoOperacaoVoz {
  if (resultado.status === 'pending') return 'pendente';
  if (resultado.status === 'undone') return 'desfeita';
  if (resultado.conflito) return 'ja_usada';
  return resultado.replayed ? 'ja_lancada' : 'nova';
}

/** O 22023 visto como resultado: nada gravado agora, e a operação existente
    pode estar ativa ou desfeita. A revisão (em `registrarOperacaoVoz`) e o
    `catch` da tarefa da voz partem daqui, para as duas entradas dizerem a
    mesma coisa. */
const RESULTADO_DO_CONFLITO = { status: 'committed', replayed: true, conflito: true } as const;

/** O desfecho de um ERRO da gravação por voz, ou `null` se o erro não for um
    desfecho (é falha de verdade, e segue o caminho de falha de quem chamou). */
export function desfechoDoErroVoz(erro: unknown): DesfechoOperacaoVoz | null {
  return ehOperacaoJaRegistrada(erro) ? desfechoDaOperacaoVoz(RESULTADO_DO_CONFLITO) : null;
}

/**
 * Recusa do servidor para crédito sem cartão (contrato do Harbor, 23/09/2026:
 * `registrar_operacao_voz` levanta 23514 com hint `cartao_obrigatorio`).
 * O cliente já não manda crédito sem cartão; isto é a rede de proteção. A
 * fala vai para REVISÃO, onde a pessoa escolhe o cartão e o reenvio sai com
 * outro request_id (o payload muda, e o id antigo seria um replay).
 */
/**
 * O servidor já tem uma operação com este `request_id` e outro conteúdo
 * (`registrar_operacao_voz` levanta 22023). Acontece quando a fala guardada
 * já foi lançada pela revisão, que grava com o id da própria fala, e depois
 * volta pelo "Tentar de novo" com outra interpretação: não é recusa do
 * lançamento, é a prova de que ele já existe.
 */
export function ehOperacaoJaRegistrada(erro: unknown): boolean {
  const e = erro as { code?: unknown; message?: unknown } | null;
  return String(e?.code ?? '') === '22023' && /request_id ja pertence a outra operacao/i.test(String(e?.message ?? ''));
}

export function ehRecusaCartaoObrigatorio(erro: unknown): boolean {
  const e = erro as { code?: unknown; hint?: unknown } | null;
  return String(e?.code ?? '') === '23514' && e?.hint === 'cartao_obrigatorio';
}

/** Texto para a revisão quando a fila local não guardou a transcrição. */
function textoParaRevisao(item: { transcricao?: string; payload: PayloadOperacaoVoz }): string {
  if (item.transcricao) return item.transcricao;
  const valor = String(item.payload.amount).replace('.', ',');
  return `${item.payload.description} ${valor} reais no crédito`;
}

export async function listarOperacoesVozLocais(): Promise<{ requestId: string; payload: PayloadOperacaoVoz }[]> {
  const userId = await idDoUsuarioLocal();
  if (!userId) return [];
  const prefixo = `grana:voz:operacao:${userId}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefixo));
  const itens = await AsyncStorage.multiGet(chaves);
  return itens.filter(([, raw]) => !!raw).map(([, raw]) => JSON.parse(raw!));
}

function textoObrigatorio(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !valor) throw new Error(`Resposta invalida: ${campo}`);
  return valor;
}

/**
 * Persiste a fala e o recibo na mesma transacao do banco. Repetir requestId
 * devolve o primeiro resultado; inclusive depois de desfazer, quando o
 * tombstone `undone` impede a fala antiga de reaparecer.
 */
/**
 * `falaGuardada`: o `requestId` da fala da fila de áudios que esta operação
 * REVISA (o "Revisar" do aviso de fala guardada). Achado do Watchtower de
 * 27/09/2026: salvar pela revisão deixava a fala na fila, e "Tentar de novo"
 * depois gravava de novo. Duas travas:
 *   1. a revisão grava com o id DA FALA, e não com o da tela. Se a limpeza
 *      local falhar e a fala voltar depois de reabrir o app, o "Tentar de
 *      novo" usa o mesmo id: o servidor devolve a operação que já existe
 *      (mesmo conteúdo) ou recusa com 22023 (`ehOperacaoJaRegistrada`), e
 *      nunca cria a segunda. Vale sem depender de nada gravado no aparelho;
 *   2. a fala sai da fila, com o áudio, só DEPOIS de o lançamento estar
 *      gravado ou guardado na fila de operações; se a gravação falhar, a
 *      fala continua lá.
 */
export async function registrarOperacaoVoz(
  requestId: string,
  source: 'app' | 'widget',
  payload: PayloadOperacaoVoz,
  transcricao?: string,
  falaGuardada?: string
): Promise<ResultadoOperacaoVoz> {
  let resultado: ResultadoOperacaoVoz;
  try {
    resultado = await gravarOperacaoVoz(falaGuardada ?? requestId, source, payload, transcricao);
  } catch (erro) {
    /* Achado A1 do Lynx (29/09/2026): a fala revisada já tinha sido lançada
       por uma revisão anterior, voltou depois de reabrir o app, e esta
       revisão mudou o conteúdo. Nada é gravado agora, a fala sai da fila
       logo abaixo, e a tela mostra "Fala já usada" em vez de "Erro ao
       salvar". O 22023 não diz se a operação existente está ativa ou foi
       desfeita (C3): o recibo diz as duas possibilidades e pede para
       conferir antes de lançar de novo. Distinguir exigiria o servidor. */
    if (!falaGuardada || !ehOperacaoJaRegistrada(erro)) throw erro;
    // Erro virando desfecho deixa rastro (regra 9, achado B2).
    console.warn('[voz] 22023 na revisão: fala já usada', falaGuardada, (erro as { code?: unknown })?.code);
    resultado = { ...RESULTADO_DO_CONFLITO, operationId: falaGuardada, kind: payload.kind, ids: [] };
  }
  // As telas montadas (a aba Lançamentos) recarregam agora, não só no foco.
  if ((resultado.status === 'committed' && !resultado.replayed) || resultado.status === 'pending') lancamentoGravado();
  if (falaGuardada) {
    try {
      const { concluirVozRevisada } = await import('./widget-voz-pendentes');
      await concluirVozRevisada(falaGuardada);
    } catch (erro) {
      /* O lançamento já está salvo, e a fala já está marcada como concluída
         nesta execução (não é retomada). Mas a fila no disco pode não ter
         sido atualizada: a pessoa precisa saber, para descartar a fala se
         ela reaparecer depois de reabrir o app (regra 9). */
      console.error('[voz] fala revisada não saiu da fila', falaGuardada, erro);
      await avisarFalaNaoConcluida(falaGuardada);
    }
  }
  return resultado;
}

async function avisarFalaNaoConcluida(falaGuardada: string): Promise<void> {
  try {
    const dono = await idDoUsuarioLocal();
    if (!dono) return;
    const { guardarReciboDaFila } = await import('./voz-recibos-da-fila');
    await guardarReciboDaFila({
      id: falaGuardada, dono, tipo: 'aviso',
      titulo: 'Lançamento salvo',
      texto: 'A fala guardada que você revisou pode voltar a aparecer. Se aparecer, toque em "Descartar": ela já foi lançada.',
    });
  } catch (erro) {
    console.error('[voz] aviso da fala não concluída não foi guardado', falaGuardada, erro);
  }
}

async function gravarOperacaoVoz(
  requestId: string,
  source: 'app' | 'widget',
  payload: PayloadOperacaoVoz,
  transcricao?: string
): Promise<ResultadoOperacaoVoz> {
  /* Pelo aparelho, e não pela rede. Este id só nomeia a chave local em que a
     fala fica guardada até o envio — e era aqui que a fila offline morria: com
     o token vencido, `getSession()` devolvia vazio e esta linha recusava
     GRAVAR o lançamento, exatamente na situação em que a fila existe para
     servir. O envio logo abaixo continua exigindo credencial válida. */
  const userId = await idDoUsuarioLocal();
  if (!userId) throw new Error('Entre na conta para salvar o lançamento.');
  const chave = `grana:voz:operacao:${userId}:${requestId}`;
  const existente = await AsyncStorage.getItem(chave);
  /* `criadoEm` é o dia em que a pessoa falou: a lista mostra a fala guardada
     com ele (`lib/voz-pendente-na-lista.ts`), e a sequência conta por ele. */
  const operacao = existente
    ? JSON.parse(existente)
    : { requestId, source, payload, criadoEm: new Date().toISOString(), ...(transcricao ? { transcricao } : null) };
  // Persiste ANTES da rede. O payload original permanece igual em toda retomada.
  await AsyncStorage.setItem(chave, JSON.stringify(operacao));
  notificarDadosDosWidgetsAlterados();
  try {
    const resultado = await enviarOperacaoVoz(operacao.requestId, operacao.source, operacao.payload);
    await AsyncStorage.removeItem(chave);
    notificarDadosDosWidgetsAlterados();
    return resultado;
  } catch (erro) {
    const codigo = String((erro as { code?: string })?.code ?? '');
    // Recusa definitiva não pode reaparecer silenciosamente numa sincronização.
    /* Objeto ausente no servidor — PGRST202, PGRST205, 42883, 42P01 — NAO
       entra aqui, e a tentativa de incluí-lo em 11/09/2026 foi revertida.
       Esses códigos dizem que a migration não foi aplicada: problema de
       deploy, não recusa do lançamento. Descartar ali apagaria a fala da
       pessoa por um erro nosso, e contradiz o que `explicarFalhaDeEnvio`
       promete na tela: "Nada foi perdido". Eles seguem pendentes, com a
       mensagem dizendo que não se resolve sozinho. */
    if (/^(22|23|42501)/.test(codigo)) {
      await AsyncStorage.removeItem(chave);
      throw erro;
    }
    return { status: 'pending', operationId: requestId, kind: payload.kind, ids: [], replayed: false };
  }
}

/**
 * Traduz a falha de envio na frase que a pessoa lê.
 *
 * A distinção que importa é entre "espere" e "isto não vai se resolver
 * sozinho". Em 07/09/2026 a migration das operações de voz não estava
 * aplicada em produção: a RPC não existia, o PostgREST devolvia `PGRST202` a
 * cada tentativa, e como esse caso caía no texto genérico de "continua salvo
 * no aparelho", uma feature inteira fora do ar ficou dois dias parecendo
 * instabilidade de rede. Objeto ausente no servidor não é fila de espera — é
 * chamado para o suporte.
 */
function explicarFalhaDeEnvio(erro: unknown): string {
  if (ehRecusaCartaoObrigatorio(erro)) {
    return 'Um lançamento no crédito ficou sem cartão e não foi salvo. Abra a revisão para escolher o cartão.';
  }
  const codigo = String((erro as { code?: string })?.code ?? '');
  const texto = String((erro as { message?: string })?.message ?? erro);
  // PGRST202/PGRST205: função ou tabela fora do cache de esquema.
  // 42883/42P01: os equivalentes do próprio Postgres.
  if (/^(PGRST202|PGRST205|42883|42P01)/.test(codigo)) {
    return 'O serviço não reconhece o lançamento por voz. Nada foi perdido, mas isso não se resolve sozinho: avise o suporte.';
  }
  if (/^(42501|PGRST30)/.test(codigo)) {
    return 'Não foi possível autorizar o envio. Confira sua sessão e o acesso à conta.';
  }
  if (/network|failed to fetch|fetch failed|socket|dns/i.test(texto)) {
    return 'Sem conexão com o serviço. O lançamento continua salvo no aparelho.';
  }
  return 'O serviço não confirmou o lançamento. Ele continua salvo no aparelho.';
}

type ResumoSync = { sincronizadas: number; falhas: number; mensagem?: string };
let sincronizacao: Promise<ResumoSync> | null = null;
export function sincronizarOperacoesVoz(): Promise<ResumoSync> {
  if (!sincronizacao) sincronizacao = executarSincronizacao().finally(() => { sincronizacao = null; });
  return sincronizacao;
}
async function executarSincronizacao(): Promise<ResumoSync> {
  let sincronizadas = 0;
  let falhas = 0;
  let mensagem: string | undefined;
    const userId = await idDoUsuarioLocal();
    if (!userId) return { sincronizadas, falhas: 1 };
    /* No máximo `ITENS_POR_RODADA` por sincronização (parecer do Harbor,
       24/09/2026): o resto fica para a próxima. */
    const chaves = (await AsyncStorage.getAllKeys())
      .filter((key) => key.startsWith(`grana:voz:operacao:${userId}:`))
      .slice(0, ITENS_POR_RODADA);
    for (const chave of chaves) {
      const raw = await AsyncStorage.getItem(chave);
      if (!raw) continue;
      let item: { requestId: string; source: 'app' | 'widget'; payload: PayloadOperacaoVoz; transcricao?: string };
      try {
        item = JSON.parse(raw);
      } catch (erro) {
        // Item ilegível no aparelho: não impede os demais de serem tentados.
        console.error('[voz] item da fila ilegível', erro);
        falhas++;
        mensagem = explicarFalhaDeEnvio(erro);
        continue;
      }
      /* Guarda de troca de conta no meio da fila: se o dono mudou, para. Lê
         pelo aparelho para não confundir "trocou de conta" com "o token
         venceu e não há rede" — o segundo caso deve seguir tentando. */
      if ((await idDoUsuarioLocal()) !== userId) break;
      try {
        await enviarOperacaoVoz(item.requestId, item.source, item.payload);
      } catch (erro) {
        falhas++;
        mensagem = explicarFalhaDeEnvio(erro);
        if (!ehRecusaCartaoObrigatorio(erro) && !ehErroPermanente(erro)) {
          /* Temporário (rede, prazo, servidor): para aqui. Até 24/09/2026 a
             sincronização seguia pela fila inteira, e sem rede cada item virava
             um pedido; se o primeiro não saiu, os outros também não saem. */
          break;
        }
        /* Recusa do banco: tentar de novo não resolve. A fala vira revisão, e
           só sai da fila depois que a notificação de revisão foi publicada: se
           ela falhar, o item fica e a próxima sincronização tenta de novo.
           Crédito sem cartão pergunta o cartão; o resto pede para revisar. */
        try {
          const { notificarRevisao } = await import('./widget-voz-notificacoes');
          if (ehRecusaCartaoObrigatorio(erro)) await notificarRevisao('Qual cartão?', textoParaRevisao(item));
          else await notificarRevisao('Não consegui salvar', item.transcricao || `${item.payload.description} ${String(item.payload.amount).replace('.', ',')}`);
        } catch (erroRecibo) {
          console.error('[voz] recibo de revisão não foi publicado; a fala fica na fila', erroRecibo);
          continue;
        }
        await AsyncStorage.removeItem(chave);
        notificarDadosDosWidgetsAlterados();
        continue;
      }
      await AsyncStorage.removeItem(chave);
      notificarDadosDosWidgetsAlterados();
      sincronizadas++;
    }
  return { sincronizadas, falhas, mensagem };
}

async function enviarOperacaoVoz(requestId: string, source: 'app' | 'widget', payload: PayloadOperacaoVoz): Promise<ResultadoOperacaoVoz> {
  const { kind, ...dados } = payload;
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), 15_000);
  try {
  const { data, error } = await supabase.rpc('registrar_operacao_voz', {
    p_request_id: requestId,
    p_source: source,
    p_kind: kind,
    p_payload: dados,
  }).abortSignal(controle.signal);
  if (controle.signal.aborted) throw new Error('timeout ao sincronizar lançamento');
  if (error) throw error;

  const resposta = data as Record<string, unknown> | null;
  const status = resposta?.status;
  if (status !== 'committed' && status !== 'undone') {
    throw new Error('Resposta invalida ao registrar operacao de voz');
  }
  const ids = resposta?.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new Error('Resposta invalida: ids');
  }

  const resultado: ResultadoOperacaoVoz = {
    status,
    operationId: textoObrigatorio(resposta?.operation_id, 'operation_id'),
    kind,
    ids,
    replayed: resposta?.replayed === true,
  };
  if (status === 'committed' && !resultado.replayed) notificarDadosDosWidgetsAlterados();
  return resultado;
  } finally { clearTimeout(prazo); }
}

/** Desfaz conta, compra ou todas as parcelas de uma vez, de forma idempotente. */
export async function desfazerOperacaoVoz(operationId: string): Promise<void> {
  const { data, error } = await supabase.rpc('desfazer_operacao_voz', {
    p_operation_id: operationId,
  });
  if (error) throw error;
  if ((data as { status?: unknown } | null)?.status !== 'undone') {
    throw new Error('Resposta invalida ao desfazer operacao de voz');
  }
  notificarDadosDosWidgetsAlterados();
}
