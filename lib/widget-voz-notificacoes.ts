import { getNotifications } from './notifications';
import { ACAO_DA_NOTIFICACAO, RECIBOS_VOZ } from './voz-recibos';
import { mensagemDeErroVoz, type CodigoErroVoz } from './voz';
import type { ReferenciaDaFala } from './data-da-fala';

/**
 * As notificações que o widget publica quando o app está fechado.
 *
 * Canal próprio (`lancamento-voz`), separado de `lembretes-contas`: quem
 * desligou lembrete de boleto não pode deixar de saber que um lançamento foi
 * gravado sozinho. Dinheiro entrando na conta sem aviso é pior que aviso a
 * mais.
 */

const CANAL = 'lancamento-voz';
/** Categoria com o botão "Desfazer" — só na notificação de sucesso. */
export const CATEGORIA_SUCESSO = 'grana-voz-resultado';
export const ACAO_DESFAZER = 'desfazer';

/**
 * Dá pra avisar a pessoa?
 *
 * Esta pergunta decide se o widget pode lançar. Ele é o único caminho do
 * produto que grava dinheiro sem nenhuma tela: a notificação é o recibo
 * inteiro — é ela que diz o que foi salvo e é dela que sai o "Desfazer". No
 * Android 13+ `POST_NOTIFICATIONS` é permissão de runtime e
 * `scheduleNotificationAsync` **falha calada** quando ela está negada, então
 * sem esta checagem o gasto entrava na conta e ninguém ficava sabendo.
 */
export async function podeNotificar(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    /* Fecha, não abre: na dúvida sobre conseguir avisar, o widget não lança.
       O oposto do `feature-flags`, que falha aberto de propósito — lá o custo
       de errar é uma funcionalidade a menos, aqui é dinheiro registrado em
       silêncio. */
    return false;
  }
}

/** Dados que viajam na notificação e voltam quando a pessoa toca nela. */
export type DadosNotifVoz =
  | {
      origem: 'voz';
      resultado: 'salvo';
      tipo: 'transaction' | 'bill';
      ids: string[];
      /** Ausente apenas em notificacoes antigas, anteriores ao undo atomico. */
      operationId?: string;
    }
  /** `referencia`/`aproximada`: a data da captura da fala, para a revisão
      contar "ontem" a partir do dia em que ela foi dita (30/09/2026). */
  | { origem: 'voz'; resultado: 'revisar'; transcricao: string; referencia?: string; aproximada?: boolean }
  | { origem: 'voz'; resultado: 'pendente'; transcricao: string };

async function prepararCanal() {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Lançamento por voz',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  } catch {
    // iOS/web não têm canal; não é erro.
  }
}

async function prepararCategoria() {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORIA_SUCESSO, [
      {
        identifier: ACAO_DESFAZER,
        buttonTitle: 'Desfazer',
        /* Abre o app pra desfazer, em vez de desfazer no escuro: apagar
           lançamento é destrutivo, e o app aberto consegue confirmar o que
           sumiu — e mostrar o erro, se o apagar falhar. */
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // Sem categoria, a notificação ainda aparece — só perde o botão.
  }
}

/**
 * Identidade de uma fala na bandeja (B5, 27/09/2026). Todo recibo da MESMA
 * fala (o `requestId`, que é o mesmo na gravação e em cada retomada da fila)
 * usa o mesmo identificador, e o Android troca o anterior pelo novo: o
 * "Salvo" substitui o "Áudio guardado" em vez de ficar embaixo dele. Até
 * 27/09 cada recibo era uma notificação nova e nenhum saía da bandeja.
 */
export function idNaBandeja(requestId?: string): string | undefined {
  return requestId ? `voz-${requestId}` : undefined;
}

/** Tira um recibo da bandeja. Usado depois do "Desfazer", que no Android não
    fecha a notificação sozinho como o toque no corpo. */
export async function tirarDaBandeja(identificador: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.dismissNotificationAsync(identificador);
  } catch (erro) {
    // O recibo continua na bandeja; nada foi perdido, só não foi limpo.
    console.warn('[voz] recibo não saiu da bandeja', identificador, erro);
  }
}

async function publicar(titulo: string, corpo: string, dados: DadosNotifVoz, categoria?: string, requestId?: string) {
  const Notifications = getNotifications();
  /* `podeNotificar()` já é o gate de verdade antes do widget tentar lançar;
     esta checagem aqui é só a segunda camada, pro caso de `publicar` ser
     chamada num ambiente sem o módulo (Expo Go, web). */
  if (!Notifications) return;
  await prepararCanal();
  if (categoria) await prepararCategoria();
  const identifier = idNaBandeja(requestId);
  await Notifications.scheduleNotificationAsync({
    ...(identifier ? { identifier } : null),
    content: {
      title: titulo,
      body: corpo,
      data: dados,
      ...(categoria ? { categoryIdentifier: categoria } : null),
    },
    /* `null` = agora. A tarefa headless já está rodando depois do fato; não há
       o que agendar. */
    trigger: null,
  });
}

/** Lançamento gravado. Traz o botão "Desfazer". */
export async function notificarSucesso(args: {
  titulo: string;
  texto: string;
  tipo: 'transaction' | 'bill';
  ids: string[];
  operationId: string;
}, requestId?: string) {
  const recibo = RECIBOS_VOZ.sucesso(args.titulo, args.texto);
  await publicar(
    recibo.titulo,
    recibo.texto,
    {
      origem: 'voz', resultado: 'salvo', tipo: args.tipo,
      ids: args.ids, operationId: args.operationId,
    },
    CATEGORIA_SUCESSO,
    requestId
  );
}

/**
 * Nada foi salvo, e o motivo depende de uma escolha da pessoa (valor não
 * reconhecido, categoria incerta, crédito sem cartão). Tocar abre o app com a
 * transcrição já preenchida, pra não obrigar a repetir a fala.
 */
export async function notificarRevisao(titulo: string, transcricao: string, requestId?: string, ref?: ReferenciaDaFala) {
  const recibo = RECIBOS_VOZ.revisao(titulo, transcricao);
  await publicar(
    recibo.titulo,
    `${recibo.texto} ${ACAO_DA_NOTIFICACAO.revisao}`,
    { origem: 'voz', resultado: 'revisar', transcricao, ...(ref ? { referencia: ref.referencia, aproximada: ref.aproximada } : null) },
    undefined,
    requestId
  );
}

/** Falhou antes de haver o que revisar (rede, sessão, áudio inaudível). */
export async function notificarFalha(codigo: CodigoErroVoz, requestId?: string) {
  const msg = mensagemDeErroVoz(codigo);
  await publicar(msg.titulo, msg.texto, { origem: 'voz', resultado: 'revisar', transcricao: '' }, undefined, requestId);
}

/** O áudio foi guardado; falta só a rede para transcrever e salvar. */
export async function notificarPendenteOffline(requestId?: string) {
  await publicar(
    RECIBOS_VOZ.pendenteOffline.titulo,
    RECIBOS_VOZ.pendenteOffline.texto,
    { origem: 'voz', resultado: 'pendente', transcricao: '' },
    undefined,
    requestId
  );
}

export async function notificarSalvoLocal(requestId?: string) {
  await publicar(RECIBOS_VOZ.salvoLocal.titulo, RECIBOS_VOZ.salvoLocal.texto,
    { origem: 'voz', resultado: 'pendente', transcricao: '' }, undefined, requestId);
}
