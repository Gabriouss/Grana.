import { Platform } from 'react-native';
import Constants, { AppOwnership } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as NotificationsModule from 'expo-notifications';
import { obterProximaMensagem } from './notification-messages';
import { pushRemotoAtivo } from './push-state';
import {
  ehIdLembreteHabito,
  ID_HABITO_LEGADO,
  planejarLembretesHabito,
} from './notification-schedule';
import { formatMoney } from './format';
import type { Bill, CreditCard } from './types';

const CHANNEL_ID = 'lembretes-contas';

const isNotificationsSupported = Platform.OS !== 'web';

/* `appOwnership === 'expo'` é a única forma confiável de distinguir Expo Go
   de uma build com dev-client — `executionEnvironment` marca os dois como
   `storeClient`, mas só o Expo Go de verdade não tem o módulo nativo de push.
   O campo está com `@deprecated` na tipagem em favor de `executionEnvironment`,
   mas para ESTA distinção não existe substituto: é o único sinal que aponta
   "Expo Go" e não "storeClient" (que também cobre dev-client, que tem o
   módulo). Sem esta checagem, mesmo o `require('expo-notifications')' dentro
   do try/catch abaixo não bloqueia a queda: o pacote importa em cadeia um
   arquivo de efeito colateral (`DevicePushTokenAutoRegistration.fx.js`) que
   registra um listener de push token no carregamento do módulo, e é esse
   listener que lança o aviso de Expo Go sem suporte — de forma assíncrona,
   fora do escopo síncrono do try/catch que o chama. */
const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

/**
 * O carregamento continua adiado para que uma limitação do ambiente de
 * execução nunca derrube a raiz do app. No Android, o Expo Go do SDK 57 não
 * suporta mais o módulo nativo de push nenhum — nem local, só remoto tinha
 * aviso documentado, mas o pacote inteiro carrega um listener que derruba o
 * app ao ser importado (ver `isExpoGo` acima). Fora do Expo Go (dev-client ou
 * build de release) o módulo carrega normalmente, local e remoto incluídos.
 */
let cached: typeof NotificationsModule | null = null;
let tentouCarregar = false;

export function getNotifications(): typeof NotificationsModule | null {
  if (!isNotificationsSupported || isExpoGo) return null;
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
      name: 'Lembretes do Grana.',
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
    // Android 13 só mostra o pedido de permissão depois que existe um canal.
    await ensureChannel();
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

/* ---- alerta de %-do-limite do cartão ---- */

/**
 * Notificação IMEDIATA — diferente de todos os lembretes acima (sempre
 * agendados por DATA futura), esta é orientada a EVENTO: dispara na hora em
 * que `checarLimiteCartao` (lib/creditLimitAlert.ts) detecta que um cartão
 * acabou de cruzar um degrau de 50/70/90/100% do limite, chamada de dentro
 * de `addTransaction` (lib/data.ts) logo depois de salvar um gasto no
 * crédito — só cobre lançamento feito PELO APP, de propósito (decisão do
 * autor: nada de notificação de limite pra gasto que entra pelo WhatsApp).
 *
 * `trigger: { seconds: 1, channelId }`, não `trigger: null`: o disparo
 * imediato "puro" do expo-notifications não aceita `channelId` junto (só os
 * gatilhos por tempo aceitam), e sem canal explícito o Android pode não
 * mostrar a notificação com a importância HIGH que `ensureChannel` configura.
 * Um segundo de atraso é imperceptível e continua sendo "na hora" pro que a
 * pessoa pediu — só não é usa o caminho sem canal, que arrisca não aparecer.
 */
export async function notifyCreditLimitThreshold(card: CreditCard, threshold: number, spent: number): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await ensureChannel();

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        /* Só a porcentagem, nunca o valor em R$: o corpo da notificação
           aparece na tela de bloqueio por padrão, sem exigir desbloqueio —
           "R$ 450 de R$ 1.000 gastos" ficava visível pra qualquer um que
           olhasse o aparelho de relance. A porcentagem já avisa sem expor
           quanto a pessoa gasta ou qual é o limite do cartão. */
        title: `${card.name} chegou a ${threshold}% do limite`,
        body: 'Fique de olho pra não estourar a fatura deste mês.',
        data: { cardId: card.id, threshold },
      },
      trigger: { seconds: 1, channelId: CHANNEL_ID } as any,
    });
  } catch (e) {
    // Ignora erro se a notificação local falhar
  }
}

/* ---- preferências de notificação ---- */

export type NotifPrefs = {
  lembreteDiarioAtivo: boolean;
  horario: { hour: number; minute: number };
  lembretesContasAtivo: boolean;
  /** Janela extra às 12h, dias úteis — horário fixo, não guardado aqui
      (ver docs/superpowers/specs/2026-09-05-janelas-notificacao-design.md). */
  almocoAtivo: boolean;
};

const PREFS_PADRAO: NotifPrefs = {
  lembreteDiarioAtivo: true,
  horario: { hour: 20, minute: 30 },
  lembretesContasAtivo: true,
  almocoAtivo: true,
};

/** Horário fixo da janela de almoço — não configurável, mesmo espírito dos
    lembretes de conta (fixos às 9h, sem escolha do usuário). */
const HORARIO_ALMOCO = { hour: 12, minute: 0 } as const;

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

const CHAVE_HORARIO_HABITO = '@grana_habit_schedule_time';
let filaHabito: Promise<void> = Promise.resolve();

function enfileirarHabito(operacao: () => Promise<void>): Promise<void> {
  const proxima = filaHabito.then(operacao, operacao);
  filaHabito = proxima.catch(() => {});
  return proxima;
}

async function idsHabitoAgendados(Notifications: typeof NotificationsModule): Promise<string[]> {
  try {
    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    return agendadas.map((item) => item.identifier).filter(ehIdLembreteHabito);
  } catch {
    return [];
  }
}

async function cancelarHabitoInterno(
  Notifications: typeof NotificationsModule,
  limparHorario: boolean
): Promise<void> {
  const ids = new Set([ID_HABITO_LEGADO, ...(await idsHabitoAgendados(Notifications))]);
  await Promise.all(
    [...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
  if (limparHorario) await AsyncStorage.removeItem(CHAVE_HORARIO_HABITO).catch(() => {});
}

/**
 * Mantém sete lembretes diários à frente, cada um com mensagem e id próprios.
 * Ao abrir a Home, preserva o que já estava agendado e só completa a janela;
 * assim a rotação das 48 mensagens não é consumida por sorteios descartados.
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
  /** Default `true` — quem nunca tocou no toggle novo ganha a janela de
      almoço junto, mesmo comportamento "ligado por padrão" do restante. */
  almocoAtivo?: boolean;
}): Promise<void> {
  return enfileirarHabito(async () => {
    const Notifications = getNotifications();
    if (!Notifications) return;

    if (await pushRemotoAtivo()) {
      await cancelarHabitoInterno(Notifications, true);
      return;
    }

    const granted = await requestNotificationPermission();
    if (!granted) return;

    const chaveHorario = `${opts.hour}:${opts.minute}`;
    const horarioAnterior = await AsyncStorage.getItem(CHAVE_HORARIO_HABITO).catch(() => null);
    if (horarioAnterior !== chaveHorario) {
      await cancelarHabitoInterno(Notifications, false);
    }

    const agora = new Date();
    const planejados = [
      ...planejarLembretesHabito({
        agora, hour: opts.hour, minute: opts.minute, jaLancouHoje: opts.jaLancouHoje, janela: 'noite',
      }).map((p) => ({ ...p, janela: 'noite' as const })),
      // `almocoAtivo` por padrão true — só desliga se explicitamente false.
      ...(opts.almocoAtivo === false ? [] : planejarLembretesHabito({
        agora, hour: HORARIO_ALMOCO.hour, minute: HORARIO_ALMOCO.minute, jaLancouHoje: opts.jaLancouHoje, janela: 'almoco',
      }).map((p) => ({ ...p, janela: 'almoco' as const }))),
    ];
    const idsDesejados = new Set(planejados.map((item) => item.id));
    const existentes = await idsHabitoAgendados(Notifications);

    // Remove o id antigo e também o lembrete de hoje quando o lançamento do
    // dia já foi feito; notificações de contas/faturas ficam intocadas.
    // A mesma limpeza cuida de cancelar a janela de almoço quando o toggle
    // é desligado: os ids dela deixam de aparecer em `idsDesejados`.
    await Promise.all(
      existentes
        .filter((id) => !idsDesejados.has(id))
        .map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
    );

    const aindaAgendados = new Set(existentes.filter((id) => idsDesejados.has(id)));
    for (const planejado of planejados) {
      if (aindaAgendados.has(planejado.id)) continue;

      const mensagem = await obterProximaMensagem({
        streak: opts.streak,
        diasInativo: opts.diasInativo + planejado.diasDesdeHoje,
        diaSemana: planejado.quando.getDay(),
      }, planejado.janela);

      try {
        await Notifications.scheduleNotificationAsync({
          identifier: planejado.id,
          content: {
            title: mensagem.titulo,
            body: mensagem.texto.replace('{streak}', String(opts.streak)),
            data: {
              tipo: 'habito-diario',
              mensagemId: mensagem.id,
              janela: planejado.janela,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: planejado.quando,
            channelId: CHANNEL_ID,
          },
        });
      } catch {
        // A próxima abertura da Home tenta completar a ocorrência que faltou.
      }
    }

    await AsyncStorage.setItem(CHAVE_HORARIO_HABITO, chaveHorario).catch(() => {});
  });
}

export async function cancelDailyHabitReminder(): Promise<void> {
  return enfileirarHabito(async () => {
    const Notifications = getNotifications();
    if (!Notifications) return;
    await cancelarHabitoInterno(Notifications, true);
  });
}
