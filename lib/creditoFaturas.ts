import { isSameMonth } from './format';
import { mesFaturaDoLancamento } from './faturaCiclo';
import type { CreditCard, Transaction } from './types';

export type SecaoLancamentosCartao = {
  chave: string;
  titulo: string;
  cor: string | null;
  cartao: CreditCard | null;
  data: Transaction[];
  subtotal: number;
};

function resolverCartao(transacao: Transaction, cartoes: CreditCard[]): CreditCard | undefined {
  const vinculado = transacao.card_id
    ? cartoes.find((cartao) => cartao.id === transacao.card_id)
    : undefined;
  if (vinculado) return vinculado;

  /* Dados antigos podiam gravar crédito sem card_id. Com um único cartão a
     associação é inequívoca e recupera o ciclo correto sem reescrever o banco.
     Com 2+, escolher sozinho misturaria justamente as faturas que esta tela
     precisa separar. Um id explícito de cartão já excluído também fica órfão. */
  if (!transacao.card_id && cartoes.length === 1) return cartoes[0];
  return undefined;
}

/**
 * Resolve cada compra pelo ciclo do cartão ao qual ela pertence. O mês civil
 * só é usado quando o cartão já não existe e, portanto, não há closing_day.
 */
export function filtrarLancamentosDaFatura(
  transacoes: Transaction[],
  cartoes: CreditCard[],
  cartaoSelecionadoId: string | 'all',
  year: number,
  month: number
): Transaction[] {
  return transacoes.filter((transacao) => {
    if (transacao.payment_method !== 'credit' && !transacao.card_id) return false;

    const cartao = resolverCartao(transacao, cartoes);
    if (cartaoSelecionadoId !== 'all' && cartao?.id !== cartaoSelecionadoId) return false;
    if (!cartao) {
      return cartaoSelecionadoId === 'all' && isSameMonth(transacao.occurred_on, year, month);
    }

    const ciclo = mesFaturaDoLancamento(transacao.occurred_on, cartao.closing_day);
    return ciclo.year === year && ciclo.month === month;
  });
}

/** Mantém a mesma ordem visual do carrossel e reúne todos os órfãos ao final. */
export function agruparLancamentosPorCartao(
  transacoes: Transaction[],
  cartoes: CreditCard[]
): SecaoLancamentosCartao[] {
  const transacoesPorChave = new Map<string, Transaction[]>();

  for (const transacao of transacoes) {
    const chave = resolverCartao(transacao, cartoes)?.id ?? '__sem_cartao__';
    const grupo = transacoesPorChave.get(chave) ?? [];
    grupo.push(transacao);
    transacoesPorChave.set(chave, grupo);
  }

  const criarSecao = (chave: string, cartao: CreditCard | null): SecaoLancamentosCartao | null => {
    const data = transacoesPorChave.get(chave);
    if (!data?.length) return null;
    return {
      chave,
      titulo: cartao?.name ?? 'Sem cartão vinculado',
      cor: cartao?.color ?? null,
      cartao,
      data,
      subtotal: data.reduce((soma, transacao) => soma + Number(transacao.amount), 0),
    };
  };

  const secoes = cartoes
    .map((cartao) => criarSecao(cartao.id, cartao))
    .filter((secao): secao is SecaoLancamentosCartao => secao !== null);
  const semCartao = criarSecao('__sem_cartao__', null);
  if (semCartao) secoes.push(semCartao);
  return secoes;
}
