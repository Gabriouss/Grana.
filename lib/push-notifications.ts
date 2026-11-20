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

/** `superada`: uma intenção mais nova (outro foreground, outra preferência,
    outro dono ou a saída da conta) chegou antes; esta não grava nada. */
export type ResultadoSincronizacaoPush = 'push' | 'fallback-local' | 'desativado' | 'superada';

let filaSincronizacao: Promise<unknown> = Promise.resolve();
/** Geração da intenção mais recente (item 31, achado S6 do Sentinel). */
let geracao = 0;

/* Prazo do token do SDK. Pendurado, segurava a fila inteira: novos
   foregrounds, mudanças do Perfil e a saída da conta ficavam atrás dele, e o
   fallback local nunca era decidido. Estourado, vale o mesmo caminho de um
   token que falhou. O token que chegar depois não grava: quem esperava já saiu. */
const PRAZO_TOKEN_MS = 15_000;
function comPrazo<T>(trabalho: Promise<T>, ms: number, oQue: string): Promise<T> {
  let corte: ReturnType<typeof setTimeout> | undefined;
  trabalho.catch(() => {});
  const estouro = new Promise<never>((_, rejeitar) => {
    corte = setTimeout(() => rejeitar(new Error(`${oQue} não respondeu no prazo`)), ms);
  });
  return Promise.race([trabalho, estouro]).finally(() => {
    // O sandbox de push-token-sem-laco não expõe clearTimeout; no app ele sempre existe.
    if (typeof clearTimeout === 'function') clearTimeout(corte);
  });
}

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
  prefs: NotifPrefs,
  minha: number
): Promise<ResultadoSincronizacaoPush> {
  if (Platform.OS === 'web') return 'desativado';
  /* Dois foregrounds seguidos: só a intenção mais nova roda. */
  if (minha !== geracao) return 'superada';

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
  if (!Notifications || !projectId) {
    if (!projectId) console.warn('[push] sem projectId do EAS — só resta o lembrete local.');
    return jaEstavaAtivo ? 'push' : 'fallback-local';
  }

  try {
    const anterior = await tokenPushSalvo();
    const token = (await comPrazo(Notifications.getExpoPushTokenAsync({ projectId }), PRAZO_TOKEN_MS, 'o token do push')).data;
    /* Revalida antes do upsert: desligar, trocar de dono ou sair durante o
       token não pode deixar o servidor com o contexto antigo. */
    if (minha !== geracao) return 'superada';
    const { error } = await supabase.from('push_tokens').upsert({
      expo_push_token: token,
      user_id: userId,
      plataforma: Platform.OS,
      timezone: timezoneDoAparelho(),
      horario_hora: prefs.horario.hour,
      horario_minuto: prefs.horario.minute,
      almoco_ativo: prefs.almocoAtivo,
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
  } catch (e) {
    /* Android no Expo Go não oferece token remoto. Se este aparelho já tinha
       sido cadastrado, o servidor continua sendo a fonte; num aparelho novo,
       o agendamento local mantém o lembrete até a próxima tentativa online.

       O log existe porque este catch já custou caro: sem ele, um push que
       nunca chegou a funcionar ficou indistinguível de um push desligado por
       escolha. Em 07/09/2026 a tabela `push_tokens` estava VAZIA para todas
       as contas e `push_habit_deliveries` não tinha uma linha sequer — o
       projeto nunca teve `google-services.json` nem credencial FCM, então
       `getExpoPushTokenAsync` sempre lançou aqui, em silêncio, desde o
       primeiro dia. Falha permanente de configuração não pode se parecer com
       indisponibilidade temporária (mesma lição de lib/voice-operations.ts). */
    console.warn('[push] registro do token falhou; caindo no lembrete local:', e);
    if (minha !== geracao) return 'superada';
    return jaEstavaAtivo ? 'push' : 'fallback-local';
  }
}

export function sincronizarPushHabito(
  userId: string,
  prefs: NotifPrefs
): Promise<ResultadoSincronizacaoPush> {
  const minha = ++geracao;
  const proxima = filaSincronizacao.then(
    () => sincronizarInterno(userId, prefs, minha),
    () => sincronizarInterno(userId, prefs, minha)
  );
  filaSincronizacao = proxima.catch(() => {});
  return proxima;
}

export async function removerPushHabitoAntesDeSair(): Promise<void> {
  if (Platform.OS === 'web') return;
  geracao++; // Sincronização pendente da conta que sai não grava mais.
  const proxima = filaSincronizacao.then(removerTokenSalvo, removerTokenSalvo);
  filaSincronizacao = proxima.catch(() => {});
  await proxima;
}

export function observarTrocaDeTokenPush(
  aoTrocar: () => void
): NotificationsModule.EventSubscription | null {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS === 'web') return null;
  /* Só reage a token NOVO. O `getDevicePushTokenAsync` nativo (chamado por
     dentro de `getExpoPushTokenAsync`) emite este mesmo evento a cada
     sucesso, e reagir a ele pedia o token de novo: laço sem fim. Com o FCM
     funcionando na 1.10.7, foram ~2,5 POST por segundo em `push_tokens`
     enquanto o app ficava aberto (logs de borda, 17/10/2026), disputando
     rede e JavaScript com o resto do app e com a tarefa do widget. O primeiro
     token visto é o da sincronização da abertura: só é anotado. */
  let ultimo: string | null = null;
  return Notifications.addPushTokenListener(({ data }) => {
    const token = String(data);
    if (token === ultimo) return;
    const primeiro = ultimo === null;
    ultimo = token;
    if (!primeiro) aoTrocar();
  });
}
