import { idDoUsuarioLocal, lerSessaoDoDisco } from './sessao-offline';

type Pedido<T> = { setHeader(nome: string, valor: string): T };
/** Identidade imutável para uma gravação da fila. A troca da sessão global
 * durante um await não pode trocar o Bearer nem o user_id do pedido. */
export async function escritaDaConta(dono: string) {
  const sessao = await lerSessaoDoDisco();
  if (!dono || !sessao?.access_token || sessao.user.id !== dono || await idDoUsuarioLocal() !== dono) {
    throw new Error('A conta mudou. O registro continua guardado para a conta original.');
  }
  const token = sessao.access_token;
  return {
    userId: dono,
    autorizar<T extends Pedido<T>>(pedido: T): T {
      return pedido.setHeader('Authorization', `Bearer ${token}`);
    },
  };
}
export type EscritaDaConta = Awaited<ReturnType<typeof escritaDaConta>>;
