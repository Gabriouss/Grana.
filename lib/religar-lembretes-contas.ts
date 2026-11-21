/* Religar os lembretes de contas e faturas pelo Perfil (L5, 21/11/2026).

   Até aqui o Perfil disparava cada agendamento com `.catch(() => {})` e
   envolvia as consultas num `catch {}` sem log: sem rede, ou com o SDK
   recusando um agendamento, o controle ficava "ligado" e nada era agendado,
   sem recibo nenhum (regra 9). Esta função espera todos os agendamentos e
   devolve o desfecho para a tela decidir o recibo, em janela flutuante.

   Desfechos:
   - `ok`: tudo agendado (ou cancelado, para fatura quitada).
   - `indisponivel`: ambiente sem notificação local (web, Expo Go); nada a
     agendar nem a avisar, como antes.
   - `sem-permissao`: o aparelho negou notificações; nada foi agendado.
   - `falhou`: a consulta caiu (`erro`) ou `falhas` agendamentos rejeitaram.
     Contas e Crédito reagendam ao abrir, então é temporário, mas precisa
     aparecer. */

export type FaturaParaLembrete<C> = { cartao: C; year: number; month: number; restante: number };

export type DesfechoReligar =
  | { situacao: 'ok' }
  | { situacao: 'indisponivel' }
  | { situacao: 'sem-permissao' }
  | { situacao: 'falhou'; falhas: number; erro?: unknown };

export async function religarLembretesDeContas<B, C extends { id: string }>(deps: {
  suportado: () => boolean;
  buscar: () => Promise<{ contas: B[]; faturas: FaturaParaLembrete<C>[] }>;
  pedirPermissao: () => Promise<boolean>;
  agendarConta: (conta: B) => Promise<unknown>;
  agendarFatura: (cartao: C, ano: number, mes: number, restante: number) => Promise<unknown>;
  cancelarFatura: (cartaoId: string, ano: number, mes: number) => Promise<unknown>;
}): Promise<DesfechoReligar> {
  if (!deps.suportado()) return { situacao: 'indisponivel' };
  let dados: { contas: B[]; faturas: FaturaParaLembrete<C>[] };
  try {
    dados = await deps.buscar();
  } catch (erro) {
    return { situacao: 'falhou', falhas: 0, erro };
  }
  let permitido: boolean;
  try {
    permitido = await deps.pedirPermissao();
  } catch (erro) {
    return { situacao: 'falhou', falhas: 0, erro };
  }
  if (!permitido) return { situacao: 'sem-permissao' };

  const tarefas: Promise<unknown>[] = [
    ...dados.contas.map((conta) => deps.agendarConta(conta)),
    ...dados.faturas.map(({ cartao, year, month, restante }) =>
      restante > 0 ? deps.agendarFatura(cartao, year, month, restante) : deps.cancelarFatura(cartao.id, year, month)),
  ];
  const rejeitadas = (await Promise.allSettled(tarefas)).filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (rejeitadas.length) return { situacao: 'falhou', falhas: rejeitadas.length, erro: rejeitadas[0].reason };
  return { situacao: 'ok' };
}
