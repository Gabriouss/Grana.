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

export type TipoPendente = 'transacao' | 'boleto' | 'meta' | 'parcela';

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
  /** Só para `tipo: 'parcela'`: número de parcelas, e `amount` vira o valor
      TOTAL da compra (o mesmo papel que `totalAmount` tem em
      `addInstallmentPurchase`), não o valor de uma parcela. */
  installments?: number;
};

export type PendingItem = {
  localId: string;
  input: PendingInput;
  tipo?: TipoPendente;
  /** Dono do item. Opcional só por causa da fila gravada antes de 23/09/2026. */
  userId?: string;
  /** Quando foi guardado. Opcional só por causa da fila gravada antes de 24/09/2026. */
  criadoEm?: string;
  /**
   * Chave de idempotência (`client_request_id`, única por usuário no banco).
   * Gerada UMA vez, antes do primeiro envio, e gravada no item antes de
   * qualquer envio: todo reenvio usa a mesma, e o banco ignora a repetição.
   * Opcional só por causa da fila gravada antes de 25/09/2026 (T22); item
   * sem chave recebe uma na primeira leitura.
   */
  clientRequestId?: string;
};

/**
 * uuid v4 para `client_request_id`. `crypto.randomUUID` quando existir; senão
 * `crypto.getRandomValues`, que o `react-native-get-random-values` põe no
 * Hermes (importado em `lib/supabase.ts`). Sem nenhum dos dois, Math.random:
 * a chave continua única na prática para um usuário, que é o escopo do índice.
 */
export function novaChaveIdempotencia(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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

let escritaEmCurso: Promise<unknown> = Promise.resolve();

/**
 * Lê, muda e grava a fila, UMA mudança por vez.
 *
 * Guardar um item e fechar uma rodada são ler-mudar-gravar na mesma chave do
 * disco. Intercalados, a escrita de quem leu antes apaga a de quem leu depois:
 * um item guardado durante a rodada sumia, ou um item já enviado voltava para
 * a fila (visto no teste do T22, 25/09/2026). Toda mudança na fila passa por
 * aqui, em série.
 */
export function atualizarFila(mudar: (fila: PendingItem[]) => PendingItem[] | Promise<PendingItem[]>): Promise<PendingItem[]> {
  const proxima = escritaEmCurso.then(async () => {
    const nova = await mudar(await getQueue());
    await setQueue(nova);
    return nova;
  });
  escritaEmCurso = proxima.catch(() => {});
  return proxima;
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

/** Mesma conta de `somar_meses_data` no banco: primeiro dia do mês alvo, mais
    o dia original, com o próprio teto no último dia do mês alvo (31/01 + 1 mês
    = 28/02, não 03/03 como um `Date.setMonth` cru daria). As N parcelas de um
    item `parcela` pendente têm de nascer na mesma data que
    `adicionar_compra_parcelada` vai gravar, senão o otimista mostra um mês
    errado até a fila subir. */
function somarMesesComLimite(dataISO: string, meses: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const totalMeses = (mes - 1) + meses;
  const anoAlvo = ano + Math.floor(totalMeses / 12);
  const mesAlvo = ((totalMeses % 12) + 12) % 12;
  const ultimoDiaDoMesAlvo = new Date(anoAlvo, mesAlvo + 1, 0).getDate();
  const diaFinal = Math.min(dia, ultimoDiaDoMesAlvo);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${anoAlvo}-${pad(mesAlvo + 1)}-${pad(diaFinal)}`;
}

/** As N linhas otimistas de uma compra parcelada pendente, no mesmo formato
    que `adicionar_compra_parcelada` grava no banco (arredondamento da última
    parcela, texto "(i/n)" na descrição, `parent_id` na cabeça da série). */
export function otimistasDaParcela(item: PendingItem): Transaction[] {
  const input = item.input;
  const n = Math.max(2, Math.round(input.installments ?? 2));
  const base = Math.round((input.amount / n) * 100) / 100;
  const last = Math.round((input.amount - base * (n - 1)) * 100) / 100;
  const descricao = input.description.trim() || 'Compra parcelada';
  return Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? item.localId : `${item.localId}-${i + 1}`,
    user_id: 'local',
    type: 'out' as const,
    description: `${descricao} (${i + 1}/${n})`,
    amount: i === n - 1 ? last : base,
    category: input.category,
    color: input.color,
    occurred_on: somarMesesComLimite(input.occurred_on, i),
    recurring: false,
    parent_id: i === 0 ? null : item.localId,
    wallet_id: input.wallet_id ?? null,
    payment_method: input.payment_method as Transaction['payment_method'],
    bank: input.bank,
    card_id: input.card_id ?? null,
    installment_current: i + 1,
    installment_total: n,
    created_at: item.criadoEm ?? new Date().toISOString(),
  }));
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
 * `filtro`, quando dado, decide por `PendingInput` — a Crédito usa para só
 * juntar pendente de cartão (`payment_method === 'credit'` ou `card_id`
 * presente), senão uma saída comum guardada sem rede apareceria na fatura.
 * Nunca lança: fila ilegível devolve a lista como veio.
 */
export async function juntarPendentes(
  lista: Transaction[],
  inicio?: string,
  fim?: string,
  filtro?: (input: PendingInput) => boolean
): Promise<Transaction[]> {
  try {
    const { minhas } = separarPorDono(await getQueue(), await idDoUsuarioLocal());
    const jaNaLista = new Set(lista.map((t) => t.id));
    const pendentes = minhas
      .filter((item) => {
        const tipo = item.tipo ?? 'transacao';
        return (tipo === 'transacao' || tipo === 'parcela') && !jaNaLista.has(item.localId) && (!filtro || filtro(item.input));
      })
      .flatMap((item) => ((item.tipo ?? 'transacao') === 'parcela' ? otimistasDaParcela(item) : [otimistaDoItem(item)]))
      .filter((t) => (!inicio || t.occurred_on >= inicio) && (!fim || t.occurred_on <= fim));
    return pendentes.length ? [...pendentes, ...lista] : lista;
  } catch (erro) {
    console.error('[fila-pendente] não consegui juntar os pendentes', erro);
    return lista;
  }
}

/**
 * Entradas ainda na fila, somadas por carteira — mesmo formato de linha que
 * `entradas_por_carteira()` devolve (`{wallet_id, entradas}`), para o
 * seletor de carteira (regra 20) não ficar um passo atrás do que a pessoa
 * acabou de guardar sem rede. Só `tipo: 'transacao'` entra: `parcela` é
 * sempre uma compra (`type: 'out'`, ver `otimistasDaParcela`), e `boleto`/
 * `meta` não são entrada de caixa. Mesma regra da RPC: fora do cartão.
 * Nunca lança: fila ilegível devolve nada, como `juntarPendentes`.
 */
export async function entradasPendentesPorCarteira(): Promise<{ wallet_id: string | null; entradas: number }[]> {
  try {
    const { minhas } = separarPorDono(await getQueue(), await idDoUsuarioLocal());
    const porCarteira = new Map<string | null, number>();
    for (const item of minhas) {
      if ((item.tipo ?? 'transacao') !== 'transacao') continue;
      const input = item.input;
      if (input.type !== 'in' || input.payment_method === 'credit' || input.card_id) continue;
      const chave = input.wallet_id ?? null;
      porCarteira.set(chave, (porCarteira.get(chave) ?? 0) + input.amount);
    }
    return Array.from(porCarteira, ([wallet_id, entradas]) => ({ wallet_id, entradas }));
  } catch (erro) {
    console.error('[fila-pendente] não consegui somar entradas pendentes por carteira', erro);
    return [];
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
 * carteira de outra conta, duplicata). Rede, prazo do cliente, 5xx, sessão
 * vencida, função fora do cache (`PGRST202`) e `42501` são temporários: o item
 * fica e a fila tenta de novo, com a espera crescente.
 *
 * `42501` (sem permissão) é temporário de propósito (autorizado pelo maestro
 * em 25/09/2026). O mesmo código sai de uma corrida de renovação do token (o
 * pedido chega ao banco como `anon`, visto em `saldos_por_carteira` em 24/09
 * com a sessão local válida) e de uma assinatura vencida. Nos dois casos o
 * lançamento é legítimo e sobe sozinho quando a sessão ou a assinatura
 * voltam; mandar para revisão exigiria ação manual por engano. Custo: conta
 * bloqueada com o app aberto faz no máximo uns 4 pedidos por hora.
 */
export function ehErroPermanente(erro: unknown): boolean {
  const codigo = String((erro as { code?: unknown } | null)?.code ?? '');
  return /^(22|23)[0-9A-Z]{3}$/.test(codigo);
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

/**
 * A recusa do banco em frase de gente, para a tela de revisão.
 *
 * O `motivo.message` é o texto cru do Postgres ("new row violates check
 * constraint ..."), que não diz nada a quem lançou um café. O código da classe
 * diz o bastante para orientar a escolha entre tentar de novo e descartar.
 */
export function motivoDaRecusa(motivo: { code: string; message: string }): string {
  const codigo = motivo.code;
  if (codigo === '23505') return 'Ele parece já ter sido salvo antes. Confira seus lançamentos antes de tentar de novo.';
  if (codigo === '23503') return 'Um cartão, carteira ou categoria usado nele não existe mais.';
  if (codigo.startsWith('23')) return 'Faltou um dado obrigatório, ou algum valor ficou fora do permitido.';
  if (codigo.startsWith('22')) return 'Algum valor ficou num formato que o Grana. não aceita.';
  return 'O Grana. recusou este lançamento.';
}

export type ResumoDaRevisao = {
  titulo: string;
  /** Para a legenda: "Saída", "Conta", "Compra parcelada em 3x"... */
  tipo: string;
  valor: number | null;
  /** AAAA-MM-DD, ou null quando o item não tem data (meta sem prazo). */
  data: string | null;
  motivo: string;
};

/**
 * O que a tela mostra de cada item em revisão. Só leitura do que foi guardado:
 * meta guarda `title`/`target_amount`, boleto guarda `due_date`, e o resto tem
 * o formato do lançamento. Item antigo sem `tipo` é transação (ver
 * `TipoPendente`).
 */
export function resumoDaRevisao(item: ItemEmRevisao): ResumoDaRevisao {
  const tipo = item.tipo ?? 'transacao';
  const input = item.input as PendingInput & { title?: string; target_amount?: number; due_date?: string; deadline?: string | null };
  const motivo = motivoDaRecusa(item.motivo);
  if (tipo === 'meta') {
    return { titulo: input.title?.trim() || 'Meta', tipo: 'Meta', valor: Number(input.target_amount) || null, data: input.deadline ?? null, motivo };
  }
  const titulo = input.description?.trim() || 'Lançamento';
  const valor = Number(input.amount) || null;
  if (tipo === 'boleto') return { titulo, tipo: 'Conta', valor, data: input.due_date ?? null, motivo };
  if (tipo === 'parcela') {
    const n = Math.max(2, Math.round(input.installments ?? 2));
    return { titulo, tipo: `Compra parcelada em ${n}x`, valor, data: input.occurred_on ?? null, motivo };
  }
  return { titulo, tipo: input.type === 'in' ? 'Entrada' : 'Saída', valor, data: input.occurred_on ?? null, motivo };
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
