import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { obterProximaMensagem } from './notification-messages';
import type { Bill, CreditCard } from './types';

const CHANNEL_ID = 'lembretes-contas';

// No SDK 53+, expo-notifications lança erro ao rodar no Expo Go para Android.
// Verificamos o ambiente para evitar que o módulo quebre a inicialização do app no Expo Go.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const isNotificationsSupported = Platform.OS !== 'web' && !(isExpoGo && Platform.OS === 'android');

/**
 * `import * as Notifications from 'expo-notifications'` no topo do arquivo
 * lança IMEDIATAMENTE ao carregar o módulo (não só ao chamar uma função dele)
 * quando roda no Expo Go no Android — o próprio pacote faz essa checagem de
 * ambiente na hora do import. Isso derrubava o app inteiro na inicialização,
 * porque este arquivo é importado por app/_layout.tsx: um import estático
 * quebrado aqui quebrava a tela raiz de todo mundo, mesmo quem nunca usa
 * lembretes. `require()` adiado resolve porque só executa quando chamado —
 * dá pra checar `isNotificationsSupported` ANTES de carregar o módulo.
 */
let cached: typeof NotificationsModule | null = null;
let tentouCarregar = false;

function getNotifications(): typeof NotificationsModule | null {
  if (!isNotificationsSupported) return null;
  if (!tentouCarregar) {
    tentouCarregar = true;
    try {
      cached = require('expo-notifications');
    } catch (e) {
      cached = null;
    }
  }
  return cached;
}

try {
  const Notifications = getNotifications();
  if (Notifications) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
} catch (e) {
  // Ignora erro em ambientes restritos (Expo Go)
}

let channelReady = false;

async function ensureChannel(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS !== 'android' || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Lembretes de contas',
      importance: Notifications.AndroidImportance.HIGH,
    });
    channelReady = true;
  } catch (e) {
    // Falha silenciosa se o canal não puder ser criado
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

type Etapa = '7d' | '3d' | 'venc' | 'atraso';

/* offsetDias é relativo ao vencimento: negativo = antes, 0 = no dia, positivo
   = depois. Horário fixo às 9h, pra nenhum lembrete disparar de madrugada. */
const ETAPAS: { etapa: Etapa; offsetDias: number; titulo: string; corpo: (b: Bill) => string }[] = [
  { etapa: '7d', offsetDias: -7, titulo: 'Conta vence em 7 dias', corpo: (b) => `${b.description} vence em 7 dias.` },
  { etapa: '3d', offsetDias: -3, titulo: 'Conta vence em 3 dias', corpo: (b) => `${b.description} vence em 3 dias.` },
  { etapa: 'venc', offsetDias: 0, titulo: 'Conta vence hoje', corpo: (b) => `${b.description} vence hoje.` },
  { etapa: 'atraso', offsetDias: 1, titulo: 'Conta atrasada', corpo: (b) => `${b.description} está atrasada.` },
];

function idFor(billId: string, etapa: Etapa): string {
  return `conta-${billId}-${etapa}`;
}

function dataComHora(iso: string, offsetDias: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDias, 9, 0, 0, 0);
}

/**
 * Agenda (ou reagenda) os 4 lembretes de uma conta. Usa identificadores
 * determinísticos (`conta-<id>-<etapa>`) em vez dos ids aleatórios que
 * `scheduleNotificationAsync` geraria sozinho — assim cancelar ou substituir
 * um lembrete específico depois não exige guardar nada em banco, só
 * recalcular o mesmo id a partir da conta.
 *
 * Sempre cancela os lembretes antigos antes de agendar de novo: editar o
 * vencimento ou pagar a conta não pode deixar um lembrete velho ativo
 * apontando pra data ou estado errados. Datas que já passaram são puladas.
 */
export async function scheduleBillReminders(bill: Bill): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await cancelBillReminders(bill.id);
  if (bill.status === 'paid') return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureChannel();

  const now = new Date();
  for (const { etapa, offsetDias, titulo, corpo } of ETAPAS) {
    const quando = dataComHora(bill.due_date, offsetDias);
    if (quando.getTime() <= now.getTime()) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: idFor(bill.id, etapa),
        content: {
          title: titulo,
          body: corpo(bill),
          data: { billId: bill.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: quando,
          channelId: CHANNEL_ID,
        },
      });
    } catch (e) {
      // Ignora erro se agendamento local falhar
    }
  }
}

export async function cancelBillReminders(billId: string): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const etapas: Etapa[] = ['7d', '3d', 'venc', 'atraso'];
  await Promise.all(
    etapas.map((etapa) => Notifications!.cancelScheduledNotificationAsync(idFor(billId, etapa)).catch(() => {}))
  );
}

/* ---- lembretes de vencimento de fatura de cartão ---- */

type EtapaFatura = '3d' | 'venc' | 'atraso';

const ETAPAS_FATURA: { etapa: EtapaFatura; offsetDias: number; titulo: string }[] = [
  { etapa: '3d', offsetDias: -3, titulo: 'Fatura vence em 3 dias' },
  { etapa: 'venc', offsetDias: 0, titulo: 'Fatura vence hoje' },
  { etapa: 'atraso', offsetDias: 1, titulo: 'Fatura atrasada' },
];

function idForFatura(cardId: string, year: number, month: number, etapa: EtapaFatura): string {
  return `fatura-${cardId}-${year}-${month}-${etapa}`;
}

/**
 * Dia de vencimento cai no mesmo mês da fatura quando due_day >= closing_day
 * (o caso comum — ex: fecha dia 18, vence dia 25), senão no mês seguinte.
 */
function dataVencimentoFatura(card: CreditCard, year: number, month: number): Date {
  const mesVencimento = card.due_day >= card.closing_day ? month : month + 1;
  return new Date(year, mesVencimento, card.due_day, 9, 0, 0, 0);
}

export async function scheduleCardInvoiceReminders(
  card: CreditCard,
  year: number,
  month: number,
  amount: number
): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await cancelCardInvoiceReminders(card.id, year, month);
  if (amount <= 0) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureChannel();

  const vencimento = dataVencimentoFatura(card, year, month);
  const now = new Date();
  for (const { etapa, offsetDias, titulo } of ETAPAS_FATURA) {
    const quando = new Date(vencimento);
    quando.setDate(quando.getDate() + offsetDias);
    if (quando.getTime() <= now.getTime()) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: idForFatura(card.id, year, month, etapa),
        content: {
          title: titulo,
          body: `Fatura do ${card.name}.`,
          data: { cardId: card.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: quando,
          channelId: CHANNEL_ID,
        },
      });
    } catch (e) {
      // Ignora erro se agendamento local falhar
    }
  }
}

export async function cancelCardInvoiceReminders(cardId: string, year: number, month: number): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  const etapas: EtapaFatura[] = ['3d', 'venc', 'atraso'];
  await Promise.all(
    etapas.map((etapa) =>
      Notifications!.cancelScheduledNotificationAsync(idForFatura(cardId, year, month, etapa)).catch(() => {})
    )
  );
}

/* ---- preferências de notificação ---- */

export type NotifPrefs = {
  lembreteDiarioAtivo: boolean;
  horario: { hour: number; minute: number };
  lembretesContasAtivo: boolean;
};

const PREFS_PADRAO: NotifPrefs = {
  lembreteDiarioAtivo: true,
  horario: { hour: 20, minute: 30 },
  lembretesContasAtivo: true,
};

const CHAVE_PREFS = '@grana_notif_prefs';

export async function carregarNotifPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_PREFS);
    if (!raw) return PREFS_PADRAO;
    return { ...PREFS_PADRAO, ...JSON.parse(raw) };
  } catch {
    return PREFS_PADRAO;
  }
}

export async function salvarNotifPrefs(prefs: NotifPrefs): Promise<void> {
  await AsyncStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs));
}

/* ---- lembrete diário de hábito ---- */

const ID_HABITO_DIARIO = 'habito-diario';

/**
 * Agenda (ou reagenda) o lembrete diário de hábito. A mensagem é sorteada
 * agora, no momento do agendamento — notificação local tem conteúdo fixo
 * assim que agendada, então a "rotação" acontece a cada reagendamento
 * (chamado no foco da Home, ver app/(app)/index.tsx), igual ao padrão de
 * scheduleBillReminders/scheduleCardInvoiceReminders acima.
 *
 * Se já lançou algo hoje, silencia o lembrete de hoje e agenda direto para
 * amanhã — repetir o pedido no mesmo dia depois que a pessoa já fez o que
 * foi pedido só gera ruído.
 */
export async function scheduleDailyHabitReminder(opts: {
  hour: number;
  minute: number;
  jaLancouHoje: boolean;
  streak: number;
  diasInativo: number;
}): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await cancelDailyHabitReminder();

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureChannel();

  const agora = new Date();
  let quando = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), opts.hour, opts.minute, 0, 0);
  if (opts.jaLancouHoje || quando.getTime() <= agora.getTime()) {
    quando = new Date(quando.getTime() + 24 * 60 * 60 * 1000);
  }

  const mensagem = await obterProximaMensagem({
    streak: opts.streak,
    diasInativo: opts.diasInativo,
    diaSemana: quando.getDay(),
  });

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: ID_HABITO_DIARIO,
      content: {
        title: mensagem.titulo,
        body: mensagem.texto.replace('{streak}', String(opts.streak)),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: quando,
        channelId: CHANNEL_ID,
      },
    });
  } catch (e) {
    // Ignora erro se agendamento local falhar
  }
}

export async function cancelDailyHabitReminder(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(ID_HABITO_DIARIO).catch(() => {});
}
