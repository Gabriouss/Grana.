import AsyncStorage from '@react-native-async-storage/async-storage';
import { idDoUsuarioLocal } from './sessao-offline';
import type { Transaction, TxType } from './types';

/**
 * A fila local do que foi salvo sem rede, e a versão OTIMISTA de cada
 * lançamento dela.
 *
 * Mora num módulo-folha (não importa `data.ts` nem `offline-cache.ts`) porque
 * os dois precisam dela: `offline-cache.ts` grava e envia a fila, e `data.ts`
 * junta os pendentes a toda lista de lançamentos que devolve. `offline-cache.ts`
 * já importa `data.ts`; importar de volta fecharia um ciclo.
 */

export const QUEUE_KEY = 'grana:queue:transactions-pendentes';

export type TipoPendente = 'transacao' | 'boleto' | 'meta';

export type PendingInput = {
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

export type PendingItem = {
  localId: string;
  input: PendingInput;
  tipo?: TipoPendente;
  /** Dono do item. Opcional só por causa da fila gravada antes de 23/09/2026. */
  userId?: string;
  /** Quando foi guardado. Opcional só por causa da fila gravada antes de 24/09/2026. */
  criadoEm?: string;
};

export async function getQueue(): Promise<PendingItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function setQueue(items: PendingItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // idem — best-effort.
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
export function separarPorDono(queue: PendingItem[], userId: string | null) {
  const minhas: PendingItem[] = [];
  const dosOutros: PendingItem[] = [];
  for (const item of queue) {
    if (!item.userId || item.userId === userId) minhas.push(item);
    else dosOutros.push(item);
  }
  return { minhas, dosOutros };
}

/** O lançamento como a tela o mostra enquanto espera: id `local-...`,
    trocado pela linha real quando a fila sobe. */
export function otimistaDoItem(item: PendingItem): Transaction {
  const input = item.input;
  return {
    id: item.localId,
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
    created_at: item.criadoEm ?? new Date().toISOString(),
  };
}

/**
 * Junta à lista os lançamentos desta conta que ainda esperam na fila.
 *
 * Achado T13 do Sentinel (23/09/2026): sem rede, a busca do mês devolve o que
 * estava no disco COMO SUCESSO (`comCacheOffline`), e esse disco não conhece o
 * que foi salvo depois. A tela recebia a lista sem o lançamento pendente, e
 * `guardarNoCache` de Lançamentos ainda apagava o otimista do cache. Juntar
 * aqui, depois do cache, faz o pendente aparecer em toda tela que lê
 * lançamentos (lista, totais da Início, Gráficos), com ou sem rede.
 *
 * `inicio`/`fim` limitam pela data do lançamento, como a busca do período.
 * Nunca lança: fila ilegível devolve a lista como veio.
 */
export async function juntarPendentes(lista: Transaction[], inicio?: string, fim?: string): Promise<Transaction[]> {
  try {
    const { minhas } = separarPorDono(await getQueue(), await idDoUsuarioLocal());
    const jaNaLista = new Set(lista.map((t) => t.id));
    const pendentes = minhas
      .filter((item) => (item.tipo ?? 'transacao') === 'transacao' && !jaNaLista.has(item.localId))
      .map(otimistaDoItem)
      .filter((t) => (!inicio || t.occurred_on >= inicio) && (!fim || t.occurred_on <= fim));
    return pendentes.length ? [...pendentes, ...lista] : lista;
  } catch (erro) {
    console.error('[fila-pendente] não consegui juntar os pendentes', erro);
    return lista;
  }
}
