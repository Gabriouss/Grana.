import { payBill } from '../data';
import { todayISO } from '../format';
import { salvarOuGuardarNoAparelho, salvarOuGuardarParceladaNoAparelho } from '../offline-cache';
import type { Bill } from '../types';
import {
  contaEmPagamentoDoItem,
  esquecerMarcaDeGravado,
  marcaDeGravado,
  marcarComoGravado,
  marcarContaEmPagamento,
  removerItemDaCaixa,
  todasAsMarcasDeGravado,
} from './caixa';
import { chaveDoItem, type EntradaDoAviso, type ItemAConferir } from './decidir';

/** O dinheiro já foi registrado. Só a retirada do aviso da lista falhou. */
export class LimpezaPendente extends Error {
  oQue: 'lancamento' | 'conta';
  constructor(oQue: 'lancamento' | 'conta') {
    super('Não consegui tirar o aviso da lista');
    this.name = 'LimpezaPendente';
    this.oQue = oQue;
  }
}

/** Este aviso já iniciou o pagamento de uma conta: não paga de novo nem vira saída. */
export class ContaJaEmPagamento extends Error {
  constructor() {
    super('O pagamento desta conta já foi iniciado');
    this.name = 'ContaJaEmPagamento';
  }
}

/** O pagamento falhou sem resposta certa: pode ter chegado ao banco. */
export class PagamentoIncerto extends Error {
  constructor() {
    super('Não consegui confirmar o pagamento');
    this.name = 'PagamentoIncerto';
  }
}

/**
 * O único ponto que grava dinheiro, sempre depois do toque em Confirmar (T4).
 * Vai pelo caminho de qualquer lançamento manual, com a chave derivada do aviso:
 * toque duplo ou retomada depois de o processo morrer não duplica.
 * O item só sai da lista depois de gravado ou guardado na fila.
 *
 * Se gravou e só a remoção do item falhou, rejeita com `LimpezaPendente`, e chamar
 * de novo não grava: sem a marca, a retomada sem rede poria uma cópia otimista ao
 * lado da linha real, e o saldo mostrado no aparelho contaria a compra duas vezes
 * até sincronizar. A marca em memória cobre o disco que recusou também a marca.
 * `jaEstava` avisa que a entrada desta chamada foi ignorada, para a tela não
 * dizer que salvou um valor corrigido.
 */
const gravadosNesteProcesso = new Map<string, boolean>();

async function tirarDaLista(dono: string, id: string, oQue: 'lancamento' | 'conta'): Promise<void> {
  try {
    await removerItemDaCaixa(dono, id);
  } catch (erro) {
    console.error('[avisos] gravou, mas não tirou o aviso da lista', erro instanceof Error ? erro.name : 'erro');
    throw new LimpezaPendente(oQue);
  }
  gravadosNesteProcesso.delete(`${dono}:${id}`);
  await esquecerMarcaDeGravado(dono, id).catch((erro) => {
    console.warn('[avisos] não apagou a marca de gravado', erro instanceof Error ? erro.name : 'erro');
  });
}

async function lembrarGravado(dono: string, id: string, guardado: boolean): Promise<void> {
  gravadosNesteProcesso.set(`${dono}:${id}`, guardado);
  await marcarComoGravado(dono, id, guardado).catch((erro) => {
    console.warn('[avisos] não guardou a marca de gravado', erro instanceof Error ? erro.name : 'erro');
  });
}

export async function gravarItem(
  dono: string,
  item: ItemAConferir,
  entrada: EntradaDoAviso
): Promise<{ guardado: boolean; jaEstava: boolean }> {
  let guardado = gravadosNesteProcesso.get(`${dono}:${item.id}`) ?? await marcaDeGravado(dono, item.id);
  const jaEstava = guardado !== undefined;
  if (guardado === undefined) {
    if (await contaEmPagamentoDoItem(dono, item.id)) throw new ContaJaEmPagamento();
    const chave = chaveDoItem(item.id);
    ({ guardado } = entrada.installments && entrada.installments > 1
      ? await salvarOuGuardarParceladaNoAparelho(entrada, chave)
      : await salvarOuGuardarNoAparelho(entrada, chave));
    await lembrarGravado(dono, item.id, guardado);
  }
  await tirarDaLista(dono, item.id, 'lancamento');
  return { guardado, jaEstava };
}

/**
 * Boleto que casou com uma conta aberta: paga a conta, que já lança a saída. A
 * marca vem antes para o aviso não virar uma segunda saída se o processo morrer
 * entre o pagamento e a remoção do item. Sem resposta do pagamento, a marca fica:
 * ele pode ter chegado, e a pessoa confere a conta em vez de repetir.
 */
export async function pagarContaDoItem(dono: string, item: ItemAConferir, conta: Bill): Promise<void> {
  const jaPagou = gravadosNesteProcesso.has(`${dono}:${item.id}`) || await marcaDeGravado(dono, item.id) !== undefined;
  if (!jaPagou) {
    if (await contaEmPagamentoDoItem(dono, item.id)) throw new ContaJaEmPagamento();
    await marcarContaEmPagamento(dono, item.id, conta.id);
    try {
      await payBill(conta, item.data || todayISO());
    } catch (erro) {
      console.error('[avisos] pagamento da conta sem confirmação', erro instanceof Error ? erro.name : 'erro');
      throw new PagamentoIncerto();
    }
    await lembrarGravado(dono, item.id, false);
  }
  await tirarDaLista(dono, item.id, 'conta');
}

/** Os avisos já registrados que só faltam sair da lista, para a tela não oferecer Editar. */
export async function itensJaGravados(dono: string): Promise<Set<string>> {
  const prefixo = `${dono}:`;
  const naMemoria = [...gravadosNesteProcesso.keys()].filter((k) => k.startsWith(prefixo)).map((k) => k.slice(prefixo.length));
  return new Set([...naMemoria, ...Object.keys(await todasAsMarcasDeGravado(dono))]);
}

/** Tira da lista o aviso já registrado. Não grava nada. */
export async function concluirLimpeza(dono: string, id: string): Promise<void> {
  await tirarDaLista(dono, id, 'lancamento');
}
