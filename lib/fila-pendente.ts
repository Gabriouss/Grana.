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

/* ── Limites da sincronização (parecer do Harbor, 24/09/2026) ────────────────

   Decisão do autor: todo lançamento guardado sem rede sobe ao reconectar,
   "a não ser que isso gere um perigo de segurança ao nosso sistema em caso de
   ataque DDOS". A fila em si não dá a um atacante nada que ele não tenha
   chamando a API direto; o risco era do próprio app: nova tentativa FIXA de
   30 s (depois de uma queda do servidor, todos os aparelhos voltariam juntos, a
   cada 30 s, para sempre), a fila inteira de uma vez, erro permanente retentado
   sem fim e nenhum teto. Contrato completo em
   E:\Grana-temporarios\2026-09-24-harbor\contrato-fila-offline.md. */

/** Primeira espera, e a espera depois de uma rodada sem falha. */
export const ESPERA_BASE_MS = 30_000;
/** Teto da espera crescente. */
export const ESPERA_TETO_MS = 15 * 60_000;
/** Quantos itens uma rodada envia, no máximo; o resto fica para a próxima. */
export const ITENS_POR_RODADA = 50;
/** Quantos itens de uma conta a fila aceita. Acima disso, recusa com aviso. */
export const TETO_DA_FILA = 500;

/**
 * Espera antes da próxima tentativa, depois de `falhasSeguidas` rodadas que
 * falharam por rede.
 *
 * Dobra a cada falha, de 30 s até 15 min, e sorteia entre a metade e o valor
 * cheio ("equal jitter"). O sorteio é o que desfaz a manada: aparelhos que
 * falharam no mesmo instante (queda do servidor) não voltam no mesmo instante.
 * Nunca abaixo de 30 s: sorteio perto de zero seria martelar o servidor.
 */
export function proximaEspera(falhasSeguidas: number, aleatorio: () => number = Math.random): number {
  const teto = Math.min(ESPERA_TETO_MS, ESPERA_BASE_MS * 2 ** Math.max(0, falhasSeguidas - 1));
  return Math.max(ESPERA_BASE_MS, Math.round(teto / 2 + aleatorio() * (teto / 2)));
}

/**
 * O banco recusou este item de um jeito que tentar de novo não resolve?
 *
 * Classes do Postgres 22 (dado inválido) e 23 (restrição: crédito sem cartão,
 * carteira de outra conta, duplicata) e `42501` (sem permissão, conta sem
 * acesso). Rede, prazo do cliente, 5xx, sessão vencida e função fora do cache
 * (`PGRST202`) são temporários: o item fica e a fila tenta de novo.
 */
export function ehErroPermanente(erro: unknown): boolean {
  const codigo = String((erro as { code?: unknown } | null)?.code ?? '');
  return /^(22|23)[0-9A-Z]{3}$/.test(codigo) || codigo === '42501';
}

/** Erro de "a fila chegou ao teto": a tela mostra a mensagem como está. */
export class FilaCheiaError extends Error {
  constructor() {
    super(
      `Há ${TETO_DA_FILA} lançamentos esperando conexão neste aparelho. ` +
        'Conecte-se à internet para enviá-los antes de guardar mais. Nada do que já foi guardado se perdeu.'
    );
    this.name = 'FilaCheiaError';
  }
}

/* ── Precisa de revisão ──────────────────────────────────────────────────────

   Item que o banco recusou de vez sai da fila (senão trava todos os de trás e
   é retentado para sempre) e vem para cá, com o motivo. Nunca é descartado em
   silêncio: quem o move publica um recibo visível, e a tela pode listar,
   devolver à fila ou descartar por escolha da pessoa. */
export const REVISAO_KEY = 'grana:queue:precisa-de-revisao';

export type ItemEmRevisao = PendingItem & {
  motivo: { code: string; message: string };
  revisaoDesde: string;
};

async function lerRevisao(): Promise<ItemEmRevisao[]> {
  try {
    const raw = await AsyncStorage.getItem(REVISAO_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (erro) {
    console.error('[fila-pendente] não consegui ler a lista de revisão', erro);
    return [];
  }
}

export async function guardarEmRevisao(item: PendingItem, erro: unknown): Promise<void> {
  const e = erro as { code?: unknown; message?: unknown } | null;
  const lista = await lerRevisao();
  lista.push({
    ...item,
    motivo: { code: String(e?.code ?? ''), message: String(e?.message ?? erro).slice(0, 300) },
    revisaoDesde: new Date().toISOString(),
  });
  /* Sem try: se não der para guardar em revisão, quem chama NÃO pode tirar o
     item da fila. Perder o item é pior que retentar. */
  await AsyncStorage.setItem(REVISAO_KEY, JSON.stringify(lista));
}

/** Itens desta conta que o banco recusou e esperam a pessoa decidir. */
export async function listarEmRevisao(): Promise<ItemEmRevisao[]> {
  const userId = await idDoUsuarioLocal();
  return (await lerRevisao()).filter((item) => !item.userId || item.userId === userId);
}

/** Tira um item da revisão (a tela devolve à fila ou descarta por escolha da pessoa). */
export async function tirarDaRevisao(localId: string): Promise<ItemEmRevisao | null> {
  const userId = await idDoUsuarioLocal();
  const lista = await lerRevisao();
  const i = lista.findIndex((item) => item.localId === localId && (!item.userId || item.userId === userId));
  if (i < 0) return null;
  const [item] = lista.splice(i, 1);
  await AsyncStorage.setItem(REVISAO_KEY, JSON.stringify(lista));
  return item;
}
