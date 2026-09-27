import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CodigoErroVoz } from './voz';
import { RECIBOS_VOZ } from './voz-recibos';

/**
 * Recibo, na TELA, das falas guardadas que a fila retoma sem poder notificar.
 *
 * A fila de áudios (`widget-voz-pendentes`) só era retomada por
 * `tentarVozesPendentes`, e ela saía na primeira linha quando o aparelho não
 * podia notificar: permissão negada, ou o Expo Go, onde o módulo de
 * notificação não existe. A fala ficava guardada para sempre, e a faixa do
 * topo dizia "aguardando conexão" com a internet ligada. Aconteceu no celular
 * do autor em 26/09/2026 (regra 9: falha permanente virando estado benigno).
 *
 * Sem notificação, a fila continua sendo processada e o recibo vem para cá.
 * Ele é guardado ANTES de a fala sair da fila, e só sai daqui depois que a
 * pessoa o viu (`RespostaVozWidget`). Se o app fechar antes, ele aparece na
 * próxima abertura. Os textos são os do catálogo único (`voz-recibos`), os
 * mesmos da notificação e do botão (regra 13).
 *
 * Módulo-folha: não importa React, Supabase nem notificações.
 */

const CHAVE = 'grana:voz:recibos-da-fila-v1';

export type ReciboDaFila =
  | { id: string; dono: string; tipo: 'sucesso'; titulo: string; texto: string; operationId?: string; destino: 'transaction' | 'bill' }
  | { id: string; dono: string; tipo: 'revisao'; titulo: string; texto: string; transcricao: string }
  | { id: string; dono: string; tipo: 'aviso'; titulo: string; texto: string };

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

export function observarRecibosDaFila(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

async function ler(): Promise<ReciboDaFila[]> {
  const bruto = await AsyncStorage.getItem(CHAVE);
  if (!bruto) return [];
  try {
    const itens = JSON.parse(bruto);
    return Array.isArray(itens) ? itens.filter((r) => r && typeof r.id === 'string' && typeof r.dono === 'string') : [];
  } catch (erro) {
    console.error('[voz] recibos da fila ilegíveis', erro);
    return [];
  }
}

/** Um recibo por fala: o mais novo da mesma fala substitui o anterior. */
export async function guardarReciboDaFila(recibo: ReciboDaFila): Promise<void> {
  const itens = (await ler()).filter((r) => r.id !== recibo.id);
  await AsyncStorage.setItem(CHAVE, JSON.stringify([...itens, recibo]));
  for (const ouvinte of ouvintes) ouvinte();
}

export async function listarRecibosDaFila(dono: string): Promise<ReciboDaFila[]> {
  return (await ler()).filter((r) => r.dono === dono);
}

export async function removerReciboDaFila(id: string): Promise<void> {
  const itens = await ler();
  const restantes = itens.filter((r) => r.id !== id);
  if (restantes.length !== itens.length) await AsyncStorage.setItem(CHAVE, JSON.stringify(restantes));
}

/**
 * Adaptador de recibo para `executarTarefa`, com a mesma forma das
 * notificações do widget. `podeNotificar` é sempre verdadeiro: a tela sempre
 * consegue mostrar. O "áudio guardado" não vira recibo aqui, porque a fala
 * continua na fila e a faixa do topo já diz o motivo; repetir a cada retomada
 * seria um alerta a cada 30 s.
 */
export function reciboDaFilaNaTela(dono: string, requestId: string) {
  type SemDono<T> = T extends unknown ? Omit<T, 'id' | 'dono'> : never;
  const guardar = (recibo: SemDono<ReciboDaFila>) =>
    guardarReciboDaFila({ ...recibo, id: requestId, dono } as ReciboDaFila);
  return {
    podeNotificar: async () => true,
    notificarRevisao: async (titulo: string, transcricao: string) => {
      await guardar({ tipo: 'revisao', ...RECIBOS_VOZ.revisao(titulo, transcricao), transcricao });
    },
    notificarSucesso: async (dados: { titulo: string; texto: string; tipo: 'transaction' | 'bill'; ids: string[]; operationId: string }) => {
      await guardar({ tipo: 'sucesso', ...RECIBOS_VOZ.sucesso(dados.titulo, dados.texto), operationId: dados.operationId, destino: dados.tipo });
    },
    notificarFalha: async (codigo: CodigoErroVoz) => {
      const { mensagemDeErroVoz } = await import('./voz');
      await guardar({ tipo: 'aviso', ...mensagemDeErroVoz(codigo) });
    },
    notificarSalvoLocal: async () => {
      await guardar({ tipo: 'aviso', ...RECIBOS_VOZ.salvoLocal });
    },
    notificarPendenteOffline: async () => {},
  };
}
