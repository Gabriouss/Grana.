import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';
import { supabase } from './supabase';
import {
  cancelDailyHabitReminder,
  getNotifications,
  requestNotificationPermission,
  type NotifPrefs,
} from './notifications';
import { limparEstadoPush, pushRemotoAtivo, salvarEstadoPush, tokenPushSalvo } from './push-state';

export type ResultadoSincronizacaoPush = 'push' | 'fallback-local' | 'desativado';

let filaSincronizacao: Promise<unknown> = Promise.resolve();

function timezoneDoAparelho(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function removerTokenSalvo(): Promise<void> {
  const token = await tokenPushSalvo();
  if (token) {
    const { error } = await supabase.from('push_tokens').delete().eq('expo_push_token', token);
    if (error) throw error;
  }
  await limparEstadoPush();
}

async function sincronizarInterno(
  userId: string,
  prefs: NotifPrefs
): Promise<ResultadoSincronizacaoPush> {
  if (Platform.OS === 'web') return 'desativado';

  if (!prefs.lembreteDiarioAtivo) {
    await removerTokenSalvo();
    await cancelDailyHabitReminder();
    return 'desativado';
  }

  const jaEstavaAtivo = await pushRemotoAtivo();
  const permitido = await requestNotificationPermission();
  if (!permitido) {
    await removerTokenSalvo();
    await cancelDailyHabitReminder();
    return 'desativado';
  }

  const Notifications = getNotifications();
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!Notifications || !projectId) return jaEstavaAtivo ? 'push' : 'fallback-local';

  try {
    const anterior = await tokenPushSalvo();
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.from('push_tokens').upsert({
      expo_push_token: token,
      user_id: userId,
      plataforma: Platform.OS,
      timezone: timezoneDoAparelho(),
      horario_hora: prefs.horario.hour,
      horario_minuto: prefs.horario.minute,
      ativo: true,
      visto_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'expo_push_token' });
    if (error) throw error;

    if (anterior && anterior !== token) {
      await supabase.from('push_tokens').delete().eq('expo_push_token', anterior);
    }
    await salvarEstadoPush(token);
    await cancelDailyHabitReminder();
    return 'push';
  } catch {
    // Android no Expo Go não oferece token remoto. Se este aparelho já tinha
    // sido cadastrado, o servidor continua sendo a fonte; num aparelho novo,
    // o agendamento local mantém o lembrete até a próxima tentativa online.
    return jaEstavaAtivo ? 'push' : 'fallback-local';
  }
}

export function sincronizarPushHabito(
  userId: string,
  prefs: NotifPrefs
): Promise<ResultadoSincronizacaoPush> {
  const proxima = filaSincronizacao.then(
    () => sincronizarInterno(userId, prefs),
    () => sincronizarInterno(userId, prefs)
  );
  filaSincronizacao = proxima.catch(() => {});
  return proxima;
}

export async function removerPushHabitoAntesDeSair(): Promise<void> {
  if (Platform.OS === 'web') return;
  const proxima = filaSincronizacao.then(removerTokenSalvo, removerTokenSalvo);
  filaSincronizacao = proxima.catch(() => {});
  await proxima;
}

export function observarTrocaDeTokenPush(
  aoTrocar: () => void
): NotificationsModule.EventSubscription | null {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS === 'web') return null;
  return Notifications.addPushTokenListener(() => aoTrocar());
}
