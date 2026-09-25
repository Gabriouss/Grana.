import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBill, addTransaction } from './data';
import { createGoal } from './goals';
import { avisarDadoNovo, guardarTela, isLikelyNetworkError, lerTela } from './cache-de-tela';
import { idDoUsuarioLocal } from './sessao-offline';
import { marcarLancamentosAlterados } from './lancamentos-alterados';
import {
  ESPERA_BASE_MS,
  FilaCheiaError,
  ITENS_POR_RODADA,
  TETO_DA_FILA,
  ehErroPermanente,
  novaChaveIdempotencia,
  getQueue,
  guardarEmRevisao,
  otimistaDoItem,
  proximaEspera,
  separarPorDono,
  atualizarFila,
  type PendingInput,
  type PendingItem,
  type TipoPendente,
} from './fila-pendente';
import type { Transaction } from './types';

/* A fila em si mora em `fila-pendente.ts` desde 24/09/2026, para `data.ts`
   poder juntar os pendentes às listas sem ciclo de import. */
export type { TipoPendente, ItemEmRevisao } from './fila-pendente';
export { FilaCheiaError, listarEmRevisao, tirarDaRevisao } from './fila-pendente';

/** Acrescenta à fila, dentro da mesma escrita em série que confere o teto:
    acima dele recusa com a mensagem, e nada é descartado. */
function guardarNaFila(item: PendingItem, userId: string | null): Promise<PendingItem[]> {
  return atualizarFila((fila) => {
    if (separarPorDono(fila, userId).minhas.length >= TETO_DA_FILA) throw new FilaCheiaError();
    return [...fila, item];
  });
}

const CACHE_KEY = 'grana:cache:transactions';

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

/* ── Fila para além do lançamento ───────────────────────────────────────────

   A fila nasceu só para transação, e por meses foi a única coisa que
   sobrevivia sem rede: boleto e meta estouravam um Alert e o que a pessoa
   digitou sumia com o teclado. Numa tela de dinheiro isso é pior que erro de
   leitura, porque a informação existia e foi perdida.

   `tipo` é OPCIONAL de propósito. Quem atualizar o app com fila cheia tem
   itens gravados sem esse campo, e um item sem tipo é uma transação — era o
   único tipo que existia quando ele foi gravado. Ler como obrigatório
   descartaria em silêncio o lançamento que a pessoa fez no metrô. */

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
  await guardarNaFila({
    localId: otimista.id, tipo, input: input as PendingInput, userId: userId ?? undefined, criadoEm: new Date().toISOString(),
    /* Meta não tem coluna de idempotência; boleto tem (T22). */
    ...(tipo === 'boleto' ? { clientRequestId: novaChaveIdempotencia() } : null),
  }, userId);
  agendarNovaTentativa();

  const chave = CACHE_DA_TELA[tipo];
  if (chave) {
    const guardado = await lerTela<T[]>(chave);
    await guardarTela(chave, [otimista, ...(guardado?.dados ?? [])]);
  }
  return otimista;
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
export async function queuePendingTransaction(input: PendingInput, clientRequestId?: string): Promise<Transaction> {
  const userId = await idDoUsuarioLocal();
  const item: PendingItem = {
    localId: novoIdLocal(),
    tipo: 'transacao',
    input,
    userId: userId ?? undefined,
    criadoEm: new Date().toISOString(),
    /* A MESMA chave de um envio que talvez já tenha chegado ao banco
       (`salvarOuGuardarNoAparelho`), ou uma nova. */
    clientRequestId: clientRequestId ?? novaChaveIdempotencia(),
  };
  await guardarNaFila(item, userId);

  const optimistic = otimistaDoItem(item);
  const cached = (await getCachedTransactions()) ?? [];
  await setCachedTransactions([optimistic, ...cached]);
  agendarNovaTentativa();

  return optimistic;
}

/** Quantos itens DESTA conta esperam para subir. */
export async function getPendingCount(): Promise<number> {
  const userId = await idDoUsuarioLocal();
  return separarPorDono(await getQueue(), userId).minhas.length;
}

/**
 * Tenta gravar no Supabase, em ordem, o que ficou pendente offline.
 *
 * - No máximo `ITENS_POR_RODADA` por chamada; o resto vai na próxima rodada.
 * - Falha TEMPORÁRIA (rede, prazo, 5xx, sessão) para a rodada: se o primeiro
 *   não saiu, os de trás também não vão sair, e insistir só gera tráfego. A
 *   próxima tentativa espera mais a cada falha seguida (`proximaEspera`).
 * - Recusa PERMANENTE do banco (`ehErroPermanente`) tira o item da fila para
 *   "precisa de revisão", com recibo visível, e a rodada segue com os outros.
 *   Antes, ele travava a fila e era retentado a cada 30 s para sempre.
 */
type ResultadoRodada = { synced: number; remaining: number; emRevisao?: number };
let rodadaEmCurso: Promise<ResultadoRodada> | null = null;

/* Uma rodada por vez (T22, 25/09/2026). A carga de Lançamentos, o timer de
   nova tentativa e a volta da rede chamavam isto ao mesmo tempo; duas rodadas
   liam a mesma fila e inseriam os mesmos itens (confirmado em produção: cada
   saída salva sem rede apareceu duas vezes). Quem chega com uma rodada em
   curso recebe o resultado dela. */
export function flushPendingQueue(): Promise<ResultadoRodada> {
  if (!rodadaEmCurso) rodadaEmCurso = executarRodada().finally(() => { rodadaEmCurso = null; });
  return rodadaEmCurso;
}

async function executarRodada(): Promise<ResultadoRodada> {
  const userId = await idDoUsuarioLocal();
  const { minhas: lidas } = separarPorDono(await getQueue(), userId);
  if (lidas.length === 0) {
    /* Sem nada para enviar, não há falha em curso: a próxima começa da base,
       e não da espera longa de uma fila que esvaziou por outro caminho. */
    falhasSeguidas = 0;
    /* Nada desta conta. Os itens de outra conta ficam onde estão, esperando o
       dono voltar: enviá-los agora gravaria o lançamento de uma pessoa na
       conta de outra, que é metade do achado A1. */
    return { synced: 0, remaining: 0 };
  }

  /* Chave para item sem chave (fila gravada antes de 25/09/2026), GRAVADA no
     disco antes de qualquer envio: se o envio chegar ao banco e a resposta se
     perder, o reenvio usa a mesma e o banco não grava de novo. Meta não tem
     coluna de idempotência. */
  const semChave = lidas.filter((i) => (i.tipo ?? 'transacao') !== 'meta' && !i.clientRequestId);
  if (semChave.length > 0) {
    const chaves = new Map(semChave.map((i) => [i.localId, novaChaveIdempotencia()]));
    await atualizarFila((fila) => fila.map((i) => (chaves.has(i.localId) ? { ...i, clientRequestId: chaves.get(i.localId) } : i)));
  }
  const minhas = semChave.length > 0 ? separarPorDono(await getQueue(), userId).minhas : lidas;

  const remaining = [...minhas];
  /* O que esta rodada tirou da fila. No fim a fila é RELIDA e só esses saem:
     sobrescrever com a foto do começo apagaria o que foi guardado durante a
     rodada (a pessoa salvando sem rede enquanto a fila sobe). */
  const saiu = new Set<string>();
  let synced = 0;
  let tentados = 0;
  let falhouTemporario = false;
  const paraRevisao: PendingItem[] = [];

  while (remaining.length > 0 && tentados < ITENS_POR_RODADA) {
    /* Item sem `tipo` é de uma versão anterior do app, quando só transação
       entrava na fila. Ver o comentário em `TipoPendente`. */
    const tipo = remaining[0].tipo ?? 'transacao';
    const enviar = ENVIAR[tipo];
    if (!enviar) {
      /* Tipo que este app não conhece (fila gravada por versão MAIS NOVA, em
         downgrade): tira da frente em vez de travar a fila inteira para
         sempre. Barulhento, porque é perda de dado. */
      console.error('[offline] item pendente de tipo desconhecido, descartado', { tipo });
      saiu.add(remaining.shift()!.localId);
      continue;
    }
    tentados++;
    try {
      const item = remaining[0];
      await enviar(item.clientRequestId ? { ...item.input, client_request_id: item.clientRequestId } : item.input);
      saiu.add(remaining.shift()!.localId);
      synced++;
    } catch (erro) {
      if (ehErroPermanente(erro)) {
        /* Só sai da fila se couber na revisão: se nem isso der, fica onde
           está (retentar é melhor que perder). */
        try {
          await guardarEmRevisao(remaining[0], erro);
          console.error('[offline] item recusado pelo banco foi para revisão', { tipo, erro });
          const recusado = remaining.shift()!;
          saiu.add(recusado.localId);
          paraRevisao.push(recusado);
          continue;
        } catch (erroRevisao) {
          console.error('[offline] não consegui mover o item recusado para revisão; ele fica na fila', erroRevisao);
        }
      } else if (!isLikelyNetworkError(erro)) {
        console.error('[offline] envio de item pendente falhou (temporário)', { tipo, erro });
      }
      falhouTemporario = true;
      break;
    }
  }

  const filaAgora = await atualizarFila((fila) => fila.filter((i) => !saiu.has(i.localId)));
  const restantes = separarPorDono(filaAgora, userId).minhas.length;
  /* A fila também leva boletos e metas; marcar a mais só custa uma carga
     completa da Início, marcar a menos deixaria o item sincronizado fora de
     "Últimos lançamentos". O aviso de dado novo faz a tela aberta recarregar
     e trocar o otimista pela linha real (ou tirar o que foi para revisão). */
  if (synced > 0 || paraRevisao.length > 0) {
    marcarLancamentosAlterados();
    avisarDadoNovo();
  }
  if (paraRevisao.length > 0) await publicarReciboDeRevisao(paraRevisao);

  falhasSeguidas = falhouTemporario ? falhasSeguidas + 1 : 0;
  if (restantes > 0) agendarNovaTentativa(falhouTemporario ? proximaEspera(falhasSeguidas) : ESPERA_BASE_MS);
  return { synced, remaining: restantes, emRevisao: paraRevisao.length };
}

/**
 * Recibo de "não foi salvo": notificação local, porque a recusa pode chegar com
 * o app em outra tela, ou numa nova tentativa sem ninguém olhando. Guardado:
 * se nem a notificação sair, fica o log, e o item continua listado em
 * `listarEmRevisao` para a tela mostrar.
 */
async function publicarReciboDeRevisao(itens: PendingItem[]): Promise<void> {
  try {
    const { getNotifications } = await import('./notifications');
    const Notifications = getNotifications();
    if (!Notifications) return;
    const primeiro = String((itens[0].input as { description?: string }).description ?? 'lançamento');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: itens.length === 1 ? 'Um lançamento não foi salvo' : `${itens.length} lançamentos não foram salvos`,
        body: itens.length === 1
          ? `O Grana. não conseguiu salvar "${primeiro}". Abra o app para revisar.`
          : `O Grana. não conseguiu salvar "${primeiro}" e outros. Abra o app para revisar.`,
        data: { origem: 'fila', resultado: 'revisar' },
      },
      trigger: null,
    });
  } catch (erro) {
    console.error('[offline] recibo de revisão não foi publicado', erro);
  }
}

/* ── Nova tentativa enquanto houver fila ─────────────────────────────────────

   Achado T13 do Sentinel (23/09/2026): o que foi salvo sem rede só subia
   quando a pessoa reabria o app ou trocava de tela, porque a fila só era
   enviada dentro da carga de uma tela. A rede voltar com o app aberto não
   dispara nada (este app não tem detector de conectividade nativo).

   Enquanto houver item desta conta na fila, tenta de novo: 30 s depois de
   uma rodada sem falha, e mais tempo a cada falha de rede seguida, até
   15 min, com sorteio (`proximaEspera`). Um agendamento por vez; para
   sozinho quando a fila esvazia. Com o app em segundo plano o React Native
   não roda o timer, então não gasta nada. */
export const INTERVALO_NOVA_TENTATIVA_MS = ESPERA_BASE_MS;
let novaTentativa: ReturnType<typeof setTimeout> | null = null;
let falhasSeguidas = 0;

export function agendarNovaTentativa(ms: number = proximaEspera(falhasSeguidas)): void {
  if (novaTentativa) return;
  novaTentativa = setTimeout(() => {
    novaTentativa = null;
    flushPendingQueue().catch((erro) => {
      console.error('[offline] nova tentativa da fila falhou', erro);
      falhasSeguidas++;
      agendarNovaTentativa();
    });
  }, ms);
  /* Só existe no Node (testes): não segura o processo aberto. */
  (novaTentativa as { unref?: () => void }).unref?.();
}

/**
 * Salva o lançamento; sem rede, guarda no aparelho em vez de perder.
 *
 * É o `try/catch` que a Início e Lançamentos repetiam cada uma do seu jeito,
 * num lugar só. `guardado: true` quer dizer "está na fila e já aparece nas
 * listas" (ver `juntarPendentes`), e a tela diz isso à pessoa.
 *
 * A chave de idempotência nasce ANTES do primeiro envio e vai junto para a
 * fila (T22): se o envio chegou ao banco e só a resposta se perdeu, a fila
 * reenvia com a mesma chave e o banco não grava de novo. O teto de espera é o
 * do cliente Supabase (`lib/fetch-com-prazo.ts`). Recusa que não é de rede
 * (validação, crédito sem cartão) sobe como erro.
 */
export async function salvarOuGuardarNoAparelho(
  input: PendingInput
): Promise<{ lancamento: Transaction; guardado: boolean }> {
  const chave = novaChaveIdempotencia();
  try {
    return { lancamento: await addTransaction({ ...input, client_request_id: chave }), guardado: false };
  } catch (erro) {
    if (!isLikelyNetworkError(erro)) throw erro;
    return { lancamento: await queuePendingTransaction(input, chave), guardado: true };
  }
}
