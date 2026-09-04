import * as Notifications from 'expo-notifications';
import { mensagemDeErroVoz, type CodigoErroVoz } from './voz';

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

/** Dados que viajam na notificação e voltam quando a pessoa toca nela. */
export type DadosNotifVoz =
  | { origem: 'voz'; resultado: 'salvo'; tipo: 'transaction' | 'bill'; ids: string[] }
  | { origem: 'voz'; resultado: 'revisar'; transcricao: string };

async function prepararCanal() {
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

async function publicar(titulo: string, corpo: string, dados: DadosNotifVoz, categoria?: string) {
  await prepararCanal();
  if (categoria) await prepararCategoria();
  await Notifications.scheduleNotificationAsync({
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
}) {
  await publicar(
    args.titulo,
    `${args.texto} · salvo no Grana.`,
    { origem: 'voz', resultado: 'salvo', tipo: args.tipo, ids: args.ids },
    CATEGORIA_SUCESSO
  );
}

/**
 * Nada foi salvo, e o motivo depende de uma escolha da pessoa (valor não
 * reconhecido, categoria incerta, crédito sem cartão). Tocar abre o app com a
 * transcrição já preenchida, pra não obrigar a repetir a fala.
 */
export async function notificarRevisao(titulo: string, transcricao: string) {
  await publicar(
    titulo,
    `Ouvi: "${transcricao}". Toque para revisar e salvar.`,
    { origem: 'voz', resultado: 'revisar', transcricao }
  );
}

/** Falhou antes de haver o que revisar (rede, sessão, áudio inaudível). */
export async function notificarFalha(codigo: CodigoErroVoz) {
  const msg = mensagemDeErroVoz(codigo);
  await publicar(msg.titulo, msg.texto, { origem: 'voz', resultado: 'revisar', transcricao: '' });
}
