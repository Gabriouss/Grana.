import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBill, addTransaction } from './data';
import { createGoal } from './goals';
import { guardarTela, lerTela } from './cache-de-tela';
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
  /** Carteira/método selecionados no formulário — sem eles aqui, o tipo
      TypeScript não refletia o que `lancamentos.tsx` já enviava de verdade
      (o valor sobrevivia por acidente, porque JS não apaga propriedade
      extra que o tipo não declara), e o item OTIMISTA (`optimistic`,
      abaixo) simplesmente não os carregava — enquanto o lançamento ficava
      pendente, ele aparecia sem carteira/método na tela. */
  wallet_id?: string | null;
  payment_method?: string;
  bank?: string;
  card_id?: string | null;
};

type PendingItem = { localId: string; input: PendingInput; tipo?: TipoPendente };

/* ── Fila para além do lançamento ───────────────────────────────────────────

   A fila nasceu só para transação, e por meses foi a única coisa que
   sobrevivia sem rede: boleto e meta estouravam um Alert e o que a pessoa
   digitou sumia com o teclado. Numa tela de dinheiro isso é pior que erro de
   leitura, porque a informação existia e foi perdida.

   `tipo` é OPCIONAL de propósito. Quem atualizar o app com fila cheia tem
   itens gravados sem esse campo, e um item sem tipo é uma transação — era o
   único tipo que existia quando ele foi gravado. Ler como obrigatório
   descartaria em silêncio o lançamento que a pessoa fez no metrô. */
export type TipoPendente = 'transacao' | 'boleto' | 'meta';

/** Para onde cada tipo vai quando a rede volta. */
const ENVIAR: Record<TipoPendente, (input: any) => Promise<unknown>> = {
  transacao: addTransaction,
  boleto: addBill,
  meta: createGoal,
};

/** Qual cache de tela recebe o item otimista, para ele aparecer na hora. */
const CACHE_DA_TELA: Record<TipoPendente, string | null> = {
  transacao: null, // tem cache próprio, com união de meses; ver getCachedTransactions
  boleto: 'boletos:todos',
  meta: 'metas',
};

export function novoIdLocal(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Guarda um boleto ou uma meta na fila e o mostra na tela imediatamente.
 *
 * O item otimista entra no cache da tela correspondente, então ele aparece na
 * lista sem a tela precisar saber que existe fila — e continua aparecendo
 * depois de fechar o app, porque o cache é disco.
 */
export async function enfileirarPendente<T extends { id: string }>(
  tipo: Exclude<TipoPendente, 'transacao'>,
  input: unknown,
  otimista: T
): Promise<T> {
  const queue = await getQueue();
  queue.push({ localId: otimista.id, tipo, input: input as PendingInput });
  await setQueue(queue);

  const chave = CACHE_DA_TELA[tipo];
  if (chave) {
    const guardado = await lerTela<T[]>(chave);
    await guardarTela(chave, [otimista, ...(guardado?.dados ?? [])]);
  }
  return otimista;
}

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

/* Mudou para `cache-de-tela.ts` e é reexportado daqui: `data.ts` passou a
   depender daquele arquivo, e este já dependia de `data.ts` — manter a função
   aqui fechava um ciclo de import. Os 9 chamadores continuam importando deste
   módulo, como sempre fizeram. */
export { isLikelyNetworkError } from './cache-de-tela';

/**
 * Salva um lançamento na fila local e devolve uma versão otimista dele pra
 * UI exibir na hora, com um id local (`local-...`) — trocado pela linha real
 * do Supabase assim que `flushPendingQueue` conseguir enviá-lo.
 */
export async function queuePendingTransaction(input: PendingInput): Promise<Transaction> {
  const localId = novoIdLocal();
  const queue = await getQueue();
  queue.push({ localId, tipo: 'transacao', input });
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
    wallet_id: input.wallet_id ?? null,
    payment_method: input.payment_method as Transaction['payment_method'],
    bank: input.bank,
    card_id: input.card_id ?? null,
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
    /* Item sem `tipo` é de uma versão anterior do app, quando só transação
       entrava na fila. Ver o comentário em `TipoPendente`. */
    const tipo = remaining[0].tipo ?? 'transacao';
    const enviar = ENVIAR[tipo];
    if (!enviar) {
      /* Tipo que este app não conhece (fila gravada por versão MAIS NOVA, em
         downgrade): tira da frente em vez de travar a fila inteira para
         sempre. Barulhento, porque é perda de dado. */
      console.error('[offline] item pendente de tipo desconhecido, descartado', { tipo });
      remaining.shift();
      continue;
    }
    try {
      await enviar(remaining[0].input);
      remaining.shift();
      synced++;
    } catch {
      break;
    }
  }

  await setQueue(remaining);
  return { synced, remaining: remaining.length };
}
