import { payBill } from '../data';
import { todayISO } from '../format';
import { salvarOuGuardarNoAparelho, salvarOuGuardarParceladaNoAparelho } from '../offline-cache';
import type { Bill } from '../types';
import { marcarContaEmPagamento, removerItemDaCaixa } from './caixa';
import { chaveDoItem, type EntradaDoAviso, type ItemAConferir } from './decidir';

/**
 * O único ponto que grava dinheiro, sempre depois do toque em Confirmar (T4).
 * Vai pelo caminho de qualquer lançamento manual, com a chave derivada do aviso:
 * toque duplo ou retomada depois de o processo morrer não duplica.
 * O item só sai da lista depois de gravado ou guardado na fila.
 */
export async function gravarItem(dono: string, item: ItemAConferir, entrada: EntradaDoAviso): Promise<{ guardado: boolean }> {
  const chave = chaveDoItem(item.id);
  const { guardado } = entrada.installments && entrada.installments > 1
    ? await salvarOuGuardarParceladaNoAparelho(entrada, chave)
    : await salvarOuGuardarNoAparelho(entrada, chave);
  await removerItemDaCaixa(dono, item.id);
  return { guardado };
}

/**
 * Boleto que casou com uma conta aberta: paga a conta, que já lança a saída. A
 * marca vem antes para o aviso não virar uma segunda saída se o processo morrer
 * entre o pagamento e a remoção do item.
 */
export async function pagarContaDoItem(dono: string, item: ItemAConferir, conta: Bill): Promise<void> {
  await marcarContaEmPagamento(dono, item.id, conta.id);
  await payBill(conta, item.data || todayISO());
  await removerItemDaCaixa(dono, item.id);
}
