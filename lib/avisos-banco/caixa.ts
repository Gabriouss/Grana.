import AsyncStorage from '@react-native-async-storage/async-storage';
import { lerDiarioAvisos } from '@/modules/grana-avisos';
import { aplicarAvisos, CAIXA_VAZIA, type EstadoDaCaixa, type ItemAConferir } from './decidir';

/**
 * A lista "A conferir", por dono, só neste aparelho. Não chama rede e não guarda
 * título nem texto: o "Não entendi" lê o texto do diário pelo id do aviso.
 * Nada aqui grava dinheiro (trava T4). Quem grava é `gravar.ts`, depois do toque.
 */
const chaveDoDono = (dono: string) => `grana_avisos_caixa:${dono}`;

/* Uma mudança de cada vez: toque em Descartar durante a leitura do diário não
   pode ser desfeito pela gravação de quem começou antes. */
let fila: Promise<unknown> = Promise.resolve();
function naVez<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(tarefa, tarefa);
  fila = resultado.catch(() => undefined);
  return resultado;
}

/* Caixa ilegível lança: tratar como vazia gravaria por cima e faria todo aviso
   do diário voltar como item novo. */
async function ler(dono: string): Promise<EstadoDaCaixa> {
  const bruto = await AsyncStorage.getItem(chaveDoDono(dono));
  if (!bruto) return CAIXA_VAZIA;
  const estado = JSON.parse(bruto) as EstadoDaCaixa;
  if (!Array.isArray(estado.itens) || typeof estado.vistos !== 'object') throw new Error('caixa de avisos ilegível');
  return estado;
}

const gravar = (dono: string, estado: EstadoDaCaixa) => AsyncStorage.setItem(chaveDoDono(dono), JSON.stringify(estado));

export type ResultadoDaCaixa = { itens: ItemAConferir[]; ilegiveis: number };

/** Traz do diário o que ainda não foi visto. Rejeita se o diário ou a caixa falharem. */
export function sincronizarCaixa(dono: string, agora: number = Date.now()): Promise<ResultadoDaCaixa> {
  return naVez(async () => {
    const [diario, estado] = await Promise.all([lerDiarioAvisos(), ler(dono)]);
    const proximo = aplicarAvisos(estado, diario.itens, agora);
    await gravar(dono, proximo);
    return { itens: proximo.itens, ilegiveis: diario.ilegiveis };
  });
}

export function listarCaixa(dono: string): Promise<ItemAConferir[]> {
  return naVez(async () => (await ler(dono)).itens);
}

/** O id continua nos vistos: o aviso par que chegar depois não reabre o item. */
export function removerItemDaCaixa(dono: string, id: string): Promise<void> {
  return naVez(async () => {
    const estado = await ler(dono);
    await gravar(dono, { ...estado, itens: estado.itens.filter((i) => i.id !== id) });
  });
}

export function marcarContaEmPagamento(dono: string, id: string, contaId: string): Promise<void> {
  return naVez(async () => {
    const estado = await ler(dono);
    await gravar(dono, {
      ...estado,
      itens: estado.itens.map((i) => (i.id === id ? { ...i, contaEmPagamento: contaId } : i)),
    });
  });
}

export function limparCaixa(dono: string): Promise<void> {
  return naVez(() => AsyncStorage.removeItem(chaveDoDono(dono)));
}
