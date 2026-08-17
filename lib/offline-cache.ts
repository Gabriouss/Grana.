import AsyncStorage from '@react-native-async-storage/async-storage';
import { addTransaction } from './data';
import type { Transaction, TxType } from './types';

const CACHE_KEY = 'grana:cache:transactions';
const QUEUE_KEY = 'grana:queue:transactions-pendentes';

/**
 * Cache local dos lançamentos (só leitura). É sempre sobrescrito com a
 * resposta mais recente do Supabase logo após um `fetchTransactions` bem
 * sucedido — serve só pra ter algo pra mostrar quando a próxima tentativa
 * falhar por falta de rede, não como fonte de verdade.
 */
export async function getCachedTransactions(): Promise<Transaction[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedTransactions(list: Transaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // Cache é best-effort — se o dispositivo estiver sem espaço, seguimos sem ela.
  }
}

type PendingInput = {
  type: TxType;
  description: string;
  amount: number;
  category: string;
  color: string;
  occurred_on: string;
  recurring?: boolean;
};

type PendingItem = { localId: string; input: PendingInput };

async function getQueue(): Promise<PendingItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setQueue(items: PendingItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // idem — best-effort.
  }
}

/**
 * Heurística pra separar "sem conexão" de erros de verdade (validação, RLS,
 * sessão expirada). O supabase-js repassa a falha crua do `fetch` do RN
 * quando não há rede, e essas mensagens são as que aparecem nesse caso —
 * sem uma checagem de conectividade nativa (NetInfo) à disposição, isto é o
 * sinal mais confiável que dá pra usar sem adicionar um módulo nativo novo.
 */
export function isLikelyNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return msg.includes('network') || msg.includes('fetch') || msg.includes('conex') || msg.includes('timeout');
}

/**
 * Salva um lançamento na fila local e devolve uma versão otimista dele pra
 * UI exibir na hora, com um id local (`local-...`) — trocado pela linha real
 * do Supabase assim que `flushPendingQueue` conseguir enviá-lo.
 */
export async function queuePendingTransaction(input: PendingInput): Promise<Transaction> {
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queue = await getQueue();
  queue.push({ localId, input });
  await setQueue(queue);

  const optimistic: Transaction = {
    id: localId,
    user_id: 'local',
    type: input.type,
    description: input.description,
    amount: input.amount,
    category: input.category,
    color: input.color,
    occurred_on: input.occurred_on,
    recurring: !!input.recurring,
    parent_id: null,
    created_at: new Date().toISOString(),
  };

  const cached = (await getCachedTransactions()) ?? [];
  await setCachedTransactions([optimistic, ...cached]);

  return optimistic;
}

export async function getPendingCount(): Promise<number> {
  return (await getQueue()).length;
}

/**
 * Tenta gravar no Supabase, em ordem, cada lançamento que ficou pendente
 * offline. Para no primeiro que falhar — se o primeiro da fila ainda não
 * conseguiu sair do aparelho, os de trás provavelmente também não vão
 * conseguir, e tentar mesmo assim só geraria mais chamadas de rede à toa.
 */
export async function flushPendingQueue(): Promise<{ synced: number; remaining: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const remaining = [...queue];
  let synced = 0;

  while (remaining.length > 0) {
    try {
      await addTransaction(remaining[0].input);
      remaining.shift();
      synced++;
    } catch {
      break;
    }
  }

  await setQueue(remaining);
  return { synced, remaining: remaining.length };
}
