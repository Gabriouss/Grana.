import AsyncStorage from '@react-native-async-storage/async-storage';
import { idDoUsuarioLocal } from './sessao-offline';
import type { Transaction } from './types';

/**
 * Fala guardada no aparelho aparece na lista como "aguardando envio".
 *
 * Decisão do autor (24/09/2026): todo lançamento guardado sem rede precisa
 * aparecer e subir depois. A voz (app e widget, regra 13) já guardava a fala
 * interpretada em `grana:voz:operacao:<dono>:<requestId>`, mas ela não
 * aparecia na lista nem nos totais até subir: a mesma classe do T13, que
 * `juntarPendentes` resolveu só para a fila comum.
 *
 * Duas filas de voz, tratadas de forma diferente:
 *
 *  - Fala JÁ INTERPRETADA (`kind: 'transaction'`): vira um item otimista com
 *    id `local-voz-<requestId>`. O prefixo `local-` é o que as telas usam
 *    para mostrar "aguardando envio", e o item soma nos totais como qualquer
 *    lançamento guardado.
 *  - Áudio AINDA NÃO TRANSCRITO (`grana:queue:widget-voz-pendente-v1`): não
 *    tem valor, então não entra na lista nem nos totais. Só é contado, para
 *    o aviso "fala aguardando conexão".
 *
 * Sem dobrar: a linha que a RPC grava leva `source_event_id = requestId`.
 * Se ela já está na lista, a fala local é descartada da junção no mesmo
 * passo, mesmo que a chave local ainda não tenha sido apagada.
 *
 * Parcelada (`installment`) e boleto (`bill`) por voz ficam de fora da lista:
 * a divisão em parcelas é do servidor, e boleto não é lançamento. Continuam
 * contados no aviso de voz salva no aparelho.
 *
 * Filtro pelo dono (achado A1): só a conta que está no aparelho.
 * Módulo-folha: não importa `data.ts` nem `voice-operations.ts`.
 */

const PREFIXO_OPERACAO = 'grana:voz:operacao:';
const CHAVE_AUDIO = 'grana:queue:widget-voz-pendente-v1';

type OperacaoGuardada = {
  requestId: string;
  source?: 'app' | 'widget';
  criadoEm?: string;
  payload: {
    kind: 'transaction' | 'installment' | 'bill';
    type?: 'in' | 'out';
    description: string;
    amount: number;
    category: string;
    color: string;
    occurred_on?: string;
    recurring?: boolean;
    wallet_id?: string | null;
    payment_method?: string | null;
    card_id?: string | null;
  };
};

async function operacoesDoDono(dono: string): Promise<OperacaoGuardada[]> {
  const prefixo = `${PREFIXO_OPERACAO}${dono}:`;
  const chaves = (await AsyncStorage.getAllKeys()).filter((chave) => chave.startsWith(prefixo));
  if (!chaves.length) return [];
  const itens = await AsyncStorage.multiGet(chaves);
  const operacoes: OperacaoGuardada[] = [];
  for (const [, bruto] of itens) {
    if (!bruto) continue;
    try {
      const item = JSON.parse(bruto);
      if (item && typeof item.requestId === 'string' && item.payload) operacoes.push(item);
    } catch {
      // Item ilegível não derruba a lista; a sincronização da voz é quem lida com ele.
    }
  }
  return operacoes;
}

function otimistaDaFala(op: OperacaoGuardada, dono: string): Transaction {
  const p = op.payload;
  return {
    id: `local-voz-${op.requestId}`,
    user_id: dono,
    type: p.type ?? 'out',
    description: p.description,
    amount: Number(p.amount),
    category: p.category,
    color: p.color,
    occurred_on: p.occurred_on!,
    recurring: !!p.recurring,
    parent_id: null,
    wallet_id: p.wallet_id ?? null,
    payment_method: (p.payment_method ?? undefined) as Transaction['payment_method'],
    card_id: p.card_id ?? null,
    created_at: op.criadoEm ?? new Date().toISOString(),
  };
}

/**
 * Junta à lista as falas interpretadas desta conta que ainda não subiram.
 * `inicio`/`fim` limitam pela data do lançamento. Nunca lança.
 */
export async function juntarVozPendente(lista: Transaction[], inicio?: string, fim?: string): Promise<Transaction[]> {
  try {
    const dono = await idDoUsuarioLocal();
    if (!dono) return lista;
    const operacoes = await operacoesDoDono(dono);
    if (!operacoes.length) return lista;
    const jaNoServidor = new Set(
      lista.map((t) => (t as { source_event_id?: string | null }).source_event_id).filter(Boolean)
    );
    const jaNaLista = new Set(lista.map((t) => t.id));
    const falas = operacoes
      .filter((op) => op.payload.kind === 'transaction' && !!op.payload.occurred_on)
      .filter((op) => !jaNoServidor.has(op.requestId) && !jaNaLista.has(`local-voz-${op.requestId}`))
      .map((op) => otimistaDaFala(op, dono))
      .filter((t) => (!inicio || t.occurred_on >= inicio) && (!fim || t.occurred_on <= fim));
    return falas.length ? [...falas, ...lista] : lista;
  } catch (erro) {
    console.error('[voz-pendente] não consegui juntar as falas guardadas', erro);
    return lista;
  }
}

/** Quantos áudios desta conta esperam conexão para serem transcritos. Sem valor. */
export async function contarFalasAguardandoConexao(): Promise<number> {
  try {
    const dono = await idDoUsuarioLocal();
    if (!dono) return 0;
    const bruto = await AsyncStorage.getItem(CHAVE_AUDIO);
    const itens = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(itens) ? itens.filter((item) => item && item.userId === dono).length : 0;
  } catch {
    return 0;
  }
}
