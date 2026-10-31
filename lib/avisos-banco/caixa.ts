import AsyncStorage from '@react-native-async-storage/async-storage';
import { lerDiarioAvisos } from '@/modules/grana-avisos';
import { aplicarAvisos, CAIXA_VAZIA, type EstadoDaCaixa, type ItemAConferir } from './decidir';

/**
 * A lista "A conferir", por dono, só neste aparelho. Não chama rede e não guarda
 * título nem texto: o "Não entendi" lê o texto do diário pelo id do aviso.
 * Nada aqui grava dinheiro (trava T4). Quem grava é `gravar.ts`, depois do toque.
 */
const chaveDoDono = (dono: string) => `grana_avisos_caixa:${dono}`;
const chaveDasMarcas = (dono: string) => `grana_avisos_gravados:${dono}`;

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

/* Marcas de "já gravado, falta só sair da lista", fora da chave da caixa: é
   justamente a escrita da caixa que pode ter falhado. Guardam o id e se foi para
   a fila, nada do aviso. Marca ilegível vale como nenhuma: a fila e o banco ainda
   reconhecem a chave. */
async function lerMarcas(dono: string): Promise<Record<string, boolean>> {
  try {
    return JSON.parse(await AsyncStorage.getItem(chaveDasMarcas(dono)) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Foi para a fila (`true`), foi gravado (`false`) ou ainda não saiu (`undefined`). */
export function marcaDeGravado(dono: string, id: string): Promise<boolean | undefined> {
  return naVez(async () => (await lerMarcas(dono))[id]);
}

export function marcarComoGravado(dono: string, id: string, guardado: boolean): Promise<void> {
  return naVez(async () => {
    await AsyncStorage.setItem(chaveDasMarcas(dono), JSON.stringify({ ...(await lerMarcas(dono)), [id]: guardado }));
  });
}

export function esquecerMarcaDeGravado(dono: string, id: string): Promise<void> {
  return naVez(async () => {
    const { [id]: _saiu, ...resto } = await lerMarcas(dono);
    await AsyncStorage.setItem(chaveDasMarcas(dono), JSON.stringify(resto));
  });
}

export function limparCaixa(dono: string): Promise<void> {
  return naVez(async () => {
    await AsyncStorage.removeItem(chaveDoDono(dono));
    await AsyncStorage.removeItem(chaveDasMarcas(dono));
  });
}
