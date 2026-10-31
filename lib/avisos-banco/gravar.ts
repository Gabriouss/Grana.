import { payBill } from '../data';
import { todayISO } from '../format';
import { salvarOuGuardarNoAparelho, salvarOuGuardarParceladaNoAparelho } from '../offline-cache';
import type { Bill } from '../types';
import { esquecerMarcaDeGravado, marcaDeGravado, marcarComoGravado, marcarContaEmPagamento, removerItemDaCaixa } from './caixa';
import { chaveDoItem, type EntradaDoAviso, type ItemAConferir } from './decidir';

/**
 * O único ponto que grava dinheiro, sempre depois do toque em Confirmar (T4).
 * Vai pelo caminho de qualquer lançamento manual, com a chave derivada do aviso:
 * toque duplo ou retomada depois de o processo morrer não duplica.
 * O item só sai da lista depois de gravado ou guardado na fila.
 *
 * Se gravou e só a remoção do item falhou, chamar de novo não grava: sem a marca,
 * a retomada sem rede poria uma cópia otimista ao lado da linha real, e o saldo
 * mostrado no aparelho contaria a compra duas vezes até sincronizar. A marca em
 * memória cobre o disco que recusou também a marca.
 */
const gravadosNesteProcesso = new Map<string, boolean>();

export async function gravarItem(dono: string, item: ItemAConferir, entrada: EntradaDoAviso): Promise<{ guardado: boolean }> {
  const lembranca = `${dono}:${item.id}`;
  let guardado = gravadosNesteProcesso.get(lembranca) ?? await marcaDeGravado(dono, item.id);
  if (guardado === undefined) {
    const chave = chaveDoItem(item.id);
    ({ guardado } = entrada.installments && entrada.installments > 1
      ? await salvarOuGuardarParceladaNoAparelho(entrada, chave)
      : await salvarOuGuardarNoAparelho(entrada, chave));
    gravadosNesteProcesso.set(lembranca, guardado);
    await marcarComoGravado(dono, item.id, guardado).catch((erro) => {
      console.warn('[avisos] não guardou a marca de gravado', erro instanceof Error ? erro.name : 'erro');
    });
  }
  await removerItemDaCaixa(dono, item.id);
  gravadosNesteProcesso.delete(lembranca);
  await esquecerMarcaDeGravado(dono, item.id).catch((erro) => {
    console.warn('[avisos] não apagou a marca de gravado', erro instanceof Error ? erro.name : 'erro');
  });
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
