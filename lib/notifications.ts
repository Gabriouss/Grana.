import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Bill } from './types';

const CHANNEL_ID = 'lembretes-contas';

/* Registrado no import (chamado a partir de app/_layout.tsx), pra garantir
   que o handler exista assim que o app abre — não só quando a pessoa visita
   a aba Contas, que é onde este módulo seria importado por acaso. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Lembretes de contas',
    importance: Notifications.AndroidImportance.HIGH,
  });
  channelReady = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
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
  if (Platform.OS === 'web') return;
  await cancelBillReminders(bill.id);
  if (bill.status === 'paid') return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureChannel();

  const now = new Date();
  for (const { etapa, offsetDias, titulo, corpo } of ETAPAS) {
    const quando = dataComHora(bill.due_date, offsetDias);
    if (quando.getTime() <= now.getTime()) continue;
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
  }
}

export async function cancelBillReminders(billId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const etapas: Etapa[] = ['7d', '3d', 'venc', 'atraso'];
  await Promise.all(
    etapas.map((etapa) => Notifications.cancelScheduledNotificationAsync(idFor(billId, etapa)).catch(() => {}))
  );
}
