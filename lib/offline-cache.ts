import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBill, addTransaction } from './data';
import { createGoal } from './goals';
import { guardarTela, lerTela } from './cache-de-tela';
import { idDoUsuarioLocal } from './sessao-offline';
import type { Transaction, TxType } from './types';

const CACHE_KEY = 'grana:cache:transactions';
const QUEUE_KEY = 'grana:queue:transactions-pendentes';

/* ── De quem é este dado ────────────────────────────────────────────────────

   Até 23/09/2026 estas duas chaves eram GLOBAIS: o cache não guardava dono e
   a leitura não conferia nada. Num aparelho compartilhado, A saía, B entrava
   sem rede, abria Lançamentos e via o dinheiro de A — e, quando a rede
   voltava, um lançamento que A tinha feito offline era gravado NA CONTA DE B,
   porque `flushPendingQueue` envia com as credenciais de quem estiver logado.
   A saída também não apagava nada: `esquecerTelas` só alcança
   `grana:cache:tela:*`. Achado A1 da auditoria de segurança de 23/09,
   comprovado no código.

   O padrão certo já existia neste projeto, em `cache-de-tela.ts`: carimbar o
   dono no registro e recusar o que for de outra conta. É o mesmo aqui, para
   não haver duas ideias de "cache local com dono" envelhecendo separadas.

   O id vem de `idDoUsuarioLocal`, que lê o disco — `getSession` tentaria
   renovar o token e devolveria vazio justamente sem rede, que é quando este
   módulo inteiro existe para funcionar. */
type Registro<T> = { userId: string; dados: T };

/**
 * Cache local dos lançamentos (só leitura). É sempre sobrescrito com a
 * resposta mais recente do Supabase logo após um `fetchTransactions` bem
 * sucedido — serve só pra ter algo pra mostrar quando a próxima tentativa
 * falhar por falta de rede, não como fonte de verdade.
 */
export async function getCachedTransactions(): Promise<Transaction[] | null> {
  try {
    const userId = await idDoUsuarioLocal();
    if (!userId) return null;
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const guardado = JSON.parse(raw) as Registro<Transaction[]> | Transaction[] | null;
    /* Formato antigo (lista crua, sem dono): descartado. É cache de leitura,
       some e volta na primeira carga com rede — perder isso não custa nada, e
       adivinhar o dono custaria mostrar o dinheiro de outra pessoa. */
    if (!guardado || Array.isArray(guardado)) return null;
    if (guardado.userId !== userId) return null;
    return guardado.dados;
  } catch {
    return null;
  }
}

export async function setCachedTransactions(list: Transaction[]): Promise<void> {
  try {
    const userId = await idDoUsuarioLocal();
    if (!userId) return;
    const registro: Registro<Transaction[]> = { userId, dados: list };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(registro));
  } catch {
    // Cache é best-effort — se o dispositivo estiver sem espaço, seguimos sem ela.
  }
}

/** Some com o cache de leitura — usar ao sair da conta, como `esquecerTelas`. */
export async function esquecerLancamentosLocais(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    /* idem. E a fila NÃO é apagada aqui de propósito: ela agora é por dono,
       então não vaza para a próxima conta, e é lançamento que a pessoa fez e
       ainda não subiu. Apagar seria jogar fora dinheiro registrado. */
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

type PendingItem = {
  localId: string;
  input: PendingInput;
  tipo?: TipoPendente;
  /** Dono do item. Opcional só por causa da fila gravada antes de 23/09/2026. */
  userId?: string;
};

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
  const userId = await idDoUsuarioLocal();
  const queue = await getQueue();
  queue.push({ localId: otimista.id, tipo, input: input as PendingInput, userId: userId ?? undefined });
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

/**
 * Separa a fila entre o que é desta conta e o que não é.
 *
 * Item SEM dono é de uma versão anterior do app, gravado quando a fila não
 * carimbava ninguém. Ele conta como desta conta, e não como de ninguém: quem
 * atualiza o app é quem está logado, e descartar seria perder um lançamento
 * que a pessoa fez e ainda não subiu. A janela em que isso erraria é estreita
 * (atualizar o app, sair, entrar com outra conta e só então recuperar a rede),
 * e o outro lado do erro — perder dinheiro registrado — é pior.
 */
function separarPorDono(queue: PendingItem[], userId: string | null) {
  const minhas: PendingItem[] = [];
  const dosOutros: PendingItem[] = [];
  for (const item of queue) {
    if (!item.userId || item.userId === userId) minhas.push(item);
    else dosOutros.push(item);
  }
  return { minhas, dosOutros };
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
  const userId = await idDoUsuarioLocal();
  const queue = await getQueue();
  queue.push({ localId, tipo: 'transacao', input, userId: userId ?? undefined });
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

/** Quantos itens DESTA conta esperam para subir. */
export async function getPendingCount(): Promise<number> {
  const userId = await idDoUsuarioLocal();
  return separarPorDono(await getQueue(), userId).minhas.length;
}

/**
 * Tenta gravar no Supabase, em ordem, cada lançamento que ficou pendente
 * offline. Para no primeiro que falhar — se o primeiro da fila ainda não
 * conseguiu sair do aparelho, os de trás provavelmente também não vão
 * conseguir, e tentar mesmo assim só geraria mais chamadas de rede à toa.
 */
export async function flushPendingQueue(): Promise<{ synced: number; remaining: number }> {
  const userId = await idDoUsuarioLocal();
  const { minhas, dosOutros } = separarPorDono(await getQueue(), userId);
  if (minhas.length === 0) {
    /* Nada desta conta. Os itens de outra conta ficam onde estão, esperando o
       dono voltar: enviá-los agora gravaria o lançamento de uma pessoa na
       conta de outra, que é metade do achado A1. */
    return { synced: 0, remaining: 0 };
  }

  const remaining = [...minhas];
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

  await setQueue([...dosOutros, ...remaining]);
  return { synced, remaining: remaining.length };
}
