import { isSameMonth } from './format';
import { deslocamentoEntre, mesFaturaDoLancamento, type CicloFatura } from './faturaCiclo';
import type { CreditCard, CreditCardInvoicePayment, Transaction } from './types';

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
 * Quanto um lançamento pesa na fatura. Estorno (`type: 'in'` no cartão)
 * ABATE: até 23/09/2026 toda soma de fatura era `+ amount`, e um estorno de
 * R$ 50 aumentava a fatura em R$ 50 em vez de diminuir. Vale para a tela, o
 * resumo da Início, os lembretes e o limite, que somam por aqui.
 */
export function valorNaFatura(transacao: Pick<Transaction, 'amount' | 'type'>): number {
  const valor = Number(transacao.amount);
  return transacao.type === 'in' ? -valor : valor;
}

/** Soma de uma fatura em centavos inteiros, para R$ 0,10 + R$ 0,20 dar R$ 0,30. */
export function somaDaFatura(transacoes: Pick<Transaction, 'amount' | 'type'>[]): number {
  return transacoes.reduce((centavos, t) => centavos + Math.round(valorNaFatura(t) * 100), 0) / 100;
}

/** Data da compra original de cada parcelamento, pelo id da parcela 1. */
export type DatasDasCompras = ReadonlyMap<string, string>;

function ehParcelaSeguinte(transacao: Transaction): boolean {
  return (transacao.installment_total ?? 1) > 1 && (transacao.installment_current ?? 1) > 1;
}

/**
 * Fechamento 1-28: a data gravada da parcela já dá a fatura certa, porque as
 * parcelas nascem com "compra + (k-1) meses" limitado ao fim do mês
 * (`addMonthsToISO`, `somar_meses_data`). A varredura do
 * `__tests__/corpus-credito-faturas.ts` prova isso. Com fechamento 29-31 a
 * data da parcela pode cair no dia do fechamento limitado e pular ou repetir
 * uma fatura (82 compras na varredura de 2026-27), então só a data da COMPRA
 * decide.
 */
function precisaDaCompraOriginal(cartao: CreditCard): boolean {
  return cartao.closing_day >= 29;
}

function datasCarregadas(transacoes: Transaction[], extras?: DatasDasCompras): Map<string, string> {
  const datas = new Map<string, string>(extras ?? []);
  for (const t of transacoes) {
    if ((t.installment_total ?? 1) > 1 && (t.installment_current ?? 1) === 1) datas.set(t.id, t.occurred_on);
  }
  return datas;
}

/**
 * A fatura de um lançamento no cartão. A parcela k pertence à fatura da
 * compra + (k - 1), como no banco. `incerto` quer dizer que a data da compra
 * original era necessária e não foi achada: o ciclo devolvido é a melhor
 * estimativa (pela data da parcela), e quem mostra a fatura precisa dizer que
 * ela está incompleta. Nunca é silencioso.
 */
export function cicloDoLancamento(
  transacao: Transaction,
  cartao: CreditCard,
  datas: DatasDasCompras
): { ciclo: CicloFatura; incerto: boolean } {
  const pelaData = mesFaturaDoLancamento(transacao.occurred_on, cartao.closing_day);
  if (!ehParcelaSeguinte(transacao) || !precisaDaCompraOriginal(cartao)) return { ciclo: pelaData, incerto: false };
  const compra = transacao.parent_id ? datas.get(transacao.parent_id) : undefined;
  if (!compra) return { ciclo: pelaData, incerto: true };
  const daCompra = mesFaturaDoLancamento(compra, cartao.closing_day);
  const alvo = new Date(daCompra.year, daCompra.month + (transacao.installment_current ?? 1) - 1, 1);
  return { ciclo: { year: alvo.getFullYear(), month: alvo.getMonth() }, incerto: false };
}

/**
 * Ids das compras originais que faltam para resolver as parcelas carregadas
 * (só cartões com fechamento 29-31). Quem chama busca as datas delas e as
 * passa como `extras`.
 */
export function comprasOriginaisAusentes(
  transacoes: Transaction[],
  cartoes: CreditCard[],
  extras?: DatasDasCompras
): string[] {
  const datas = datasCarregadas(transacoes, extras);
  const ausentes = new Set<string>();
  for (const t of transacoes) {
    if (!ehParcelaSeguinte(t) || !t.parent_id || datas.has(t.parent_id)) continue;
    const cartao = resolverCartao(t, cartoes);
    if (cartao && precisaDaCompraOriginal(cartao)) ausentes.add(t.parent_id);
  }
  return [...ausentes].sort();
}

/**
 * Meses civis a buscar para montar estas faturas. A janela de uma fatura
 * cobre o mês do fechamento e o anterior. Com fechamento 29-31, uma parcela
 * de data vizinha pode pertencer à fatura pela compra original, então entram
 * também um mês antes e um depois.
 */
export function mesesCivisDasFaturas(ciclos: CicloFatura[], cartoes: CreditCard[]): CicloFatura[] {
  const folga = cartoes.some(precisaDaCompraOriginal);
  const deslocamentos = folga ? [-2, -1, 0, 1] : [-1, 0];
  const meses = new Map<string, CicloFatura>();
  for (const { year, month } of ciclos) {
    for (const k of deslocamentos) {
      const d = new Date(year, month + k, 1);
      meses.set(`${d.getFullYear()}-${d.getMonth()}`, { year: d.getFullYear(), month: d.getMonth() });
    }
  }
  return [...meses.values()];
}

/** A fatura "atual" de um cartão, como a tela a calculou por último. */
export type FaturaAtualDoCartao = { cartaoId: string; year: number; month: number };

/**
 * Para qual fatura a tela de Crédito deve apontar depois que a fatura "atual"
 * de um cartão foi recalculada. Devolve `null` quando a tela deve ficar onde
 * está.
 *
 * A fatura atual muda por dois motivos, e a tela ignorava os dois: o dia de
 * fechamento do cartão foi editado, ou o próprio dia do fechamento chegou com
 * a aba já aberta (as abas ficam montadas desde `04b2260`). Só a TROCA de
 * cartão movia a tela. Em 16/09/2026 o autor corrigiu o fechamento do C6 de 17
 * para 14, e a tela continuou mostrando a fatura de setembro — já fechada e
 * paga — em vez da de outubro, onde as compras de 16/09 passaram a morar.
 *
 * - Cartão novo na seleção (ou nada visto ainda): abre na atual, como sempre.
 * - A atual mudou e a pessoa ESTAVA nela: acompanha a mudança.
 * - A atual mudou mas a pessoa tinha navegado para outra fatura: fica onde
 *   está. Arrancar alguém de uma fatura passada que ele abriu de propósito
 *   seria o defeito oposto.
 */
export function faturaParaExibir(
  atual: FaturaAtualDoCartao,
  anterior: FaturaAtualDoCartao | null,
  vista: { year: number; month: number } | null
): { year: number; month: number } | null {
  if (!anterior || anterior.cartaoId !== atual.cartaoId || !vista) {
    return { year: atual.year, month: atual.month };
  }
  if (anterior.year === atual.year && anterior.month === atual.month) return null;
  const estavaNaAtual = vista.year === anterior.year && vista.month === anterior.month;
  return estavaNaAtual ? { year: atual.year, month: atual.month } : null;
}

/**
 * Qual fatura é a "atual" na visão Total, onde não há um cartão selecionado.
 *
 * Existe porque a visão Total tratava o eixo dela como MÊS CIVIL, apesar de
 * agrupar cada compra pelo ciclo do próprio cartão. Em 16/09/2026, com um
 * cartão que fecha no dia 15 e uma compra feita no dia 16, a tela mostrava ao
 * mesmo tempo: "Fatura de Setembro 2026 · Atual", "Total em Faturas (Todos os
 * Cartões) R$ 0,00", "Nenhuma compra no crédito nesta fatura" e, logo acima,
 * o próprio cartão anunciando "Fatura atual R$ 300,00". Os R$ 300 estavam na
 * fatura de outubro, pela regra do fechamento, e nada na tela dizia isso.
 *
 * Devolve `null` quando os cartões discordam entre si (fechamentos
 * diferentes): aí não existe uma fatura atual única e afirmar qualquer uma
 * seria voltar a mentir. Sem cartão também é `null`.
 */
export function faturaAtualDeTodosOsCartoes(
  cartoes: CreditCard[],
  hojeISO: string
): { year: number; month: number } | null {
  if (cartoes.length === 0) return null;
  const ciclos = cartoes.map((cartao) => mesFaturaDoLancamento(hojeISO, cartao.closing_day));
  const primeiro = ciclos[0];
  return ciclos.every((c) => c.year === primeiro.year && c.month === primeiro.month)
    ? { year: primeiro.year, month: primeiro.month }
    : null;
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
  month: number,
  datasExtras?: DatasDasCompras
): Transaction[] {
  const datas = datasCarregadas(transacoes, datasExtras);
  return transacoes.filter((transacao) => {
    if (transacao.payment_method !== 'credit' && !transacao.card_id) return false;

    const cartao = resolverCartao(transacao, cartoes);
    if (cartaoSelecionadoId !== 'all' && cartao?.id !== cartaoSelecionadoId) return false;
    if (!cartao) {
      return cartaoSelecionadoId === 'all' && isSameMonth(transacao.occurred_on, year, month);
    }

    const { ciclo } = cicloDoLancamento(transacao, cartao, datas);
    return ciclo.year === year && ciclo.month === month;
  });
}

/**
 * A fatura tem parcela cujo ciclo não pôde ser confirmado (compra original
 * não achada, cartão com fechamento 29-31). O total mostrado pode estar
 * errado, e a tela precisa dizer isso e não deixar pagar como se estivesse
 * certo.
 */
export function faturaTemParcelaIncerta(
  transacoes: Transaction[],
  cartoes: CreditCard[],
  cartaoSelecionadoId: string | 'all',
  year: number,
  month: number,
  datasExtras?: DatasDasCompras
): boolean {
  const datas = datasCarregadas(transacoes, datasExtras);
  return filtrarLancamentosDaFatura(transacoes, cartoes, cartaoSelecionadoId, year, month, datasExtras).some((t) => {
    const cartao = resolverCartao(t, cartoes);
    return !!cartao && cicloDoLancamento(t, cartao, datas).incerto;
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
      subtotal: somaDaFatura(data),
    };
  };

  const secoes = cartoes
    .map((cartao) => criarSecao(cartao.id, cartao))
    .filter((secao): secao is SecaoLancamentosCartao => secao !== null);
  const semCartao = criarSecao('__sem_cartao__', null);
  if (semCartao) secoes.push(semCartao);
  return secoes;
}

export type StatusDaFatura = 'paga' | 'parcial' | 'atrasada' | 'vence-hoje' | 'aberta';

export type SituacaoDaFatura = {
  status: StatusDaFatura;
  /** O que já foi pago, somado o restante pago depois. */
  pago: number;
  /** O que falta pagar. Nunca negativo. */
  restante: number;
};

/**
 * Situação de uma fatura: quanto já foi pago e quanto falta.
 *
 * Até 16/09/2026 a tela de Crédito dizia "Paga ✓" se existisse QUALQUER
 * pagamento da fatura, sem olhar o valor, e nada descontava o que foi pago.
 * Quem pagava antes do fechamento e depois comprava mais no mesmo ciclo via
 * "Paga" com dinheiro em aberto. Agora só é "paga" quando o pago cobre o
 * total; antes disso a fatura segue o vencimento como qualquer outra, e
 * "parcial" é o estado de quem pagou uma parte e ainda está no prazo.
 *
 * Fatura sem compra e sem pagamento nunca fica "atrasada": não há o que pagar.
 * A conta é em centavos, para R$ 998,01 pago contra R$ 998,01 dar zero.
 */
export function situacaoDaFatura(
  total: number,
  pagamento: Pick<CreditCardInvoicePayment, 'amount'> | null | undefined,
  vencimento: Date | null,
  hoje: Date = new Date()
): SituacaoDaFatura {
  const pago = pagamento ? Number(pagamento.amount) : 0;
  const faltaEmCentavos = Math.max(0, Math.round(total * 100) - Math.round(pago * 100));
  const restante = faltaEmCentavos / 100;
  if (faltaEmCentavos === 0) return { status: pagamento ? 'paga' : 'aberta', pago, restante: 0 };

  let status: StatusDaFatura = pagamento ? 'parcial' : 'aberta';
  if (vencimento) {
    const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dia(vencimento) === dia(hoje)) status = 'vence-hoje';
    else if (dia(vencimento) < dia(hoje)) status = 'atrasada';
  }
  return { status, pago, restante };
}

export type LembreteDeFatura = { cartao: CreditCard; year: number; month: number; restante: number };

/**
 * Por cartão, as faturas que podem ter lembrete VIVO agora, e quanto falta
 * pagar de cada uma. `restante` zero quer dizer cancelar o lembrete daquele
 * ciclo; maior que zero, agendar.
 *
 * São DUAS por cartão, e é justamente isso que consertou o defeito relatado
 * pelo autor em 23/09/2026: "o Grana. me notificou do vencimento da fatura do
 * cartão, sendo que eu já tinha pago", com o aviso dizendo que estava
 * atrasada.
 *
 * ── Por que duas ───────────────────────────────────────────────────────────
 *
 * O lembrete é agendado no aparelho com um identificador que carrega o ciclo
 * (`fatura-<cartão>-<ano>-<mês>-{3d,venc,atraso}`, em `lib/notifications.ts`).
 * Cancelar exige acertar o MESMO ciclo.
 *
 * Até aqui esta função devolvia só o ciclo a que uma compra feita hoje
 * pertenceria. Esse ciclo VIRA no dia do fechamento: a partir dali ela passa a
 * apontar para a fatura seguinte, e a que acabou de fechar some da conta. Só
 * que é exatamente essa que vence, e é essa que a pessoa paga — ninguém paga
 * antes de a fatura fechar. O cancelamento mirava um ciclo sem agendamento
 * nenhum, os avisos da fatura fechada sobreviviam ao pagamento, e no dia
 * seguinte ao vencimento disparava "Fatura atrasada" para uma fatura paga.
 *
 * Então entram as duas: a que ACUMULA (o ciclo de hoje) e a que FECHOU (o
 * anterior). O cálculo do ciclo anterior é o mesmo de
 * `faturasFechadasPendentes`, na tela de Crédito, que já desenhava a faixa
 * "Faturas fechadas aguardando pagamento" — a tela enxergava aquela fatura, e
 * só o agendador de lembretes não enxergava.
 *
 * Devolver a fatura fechada também quando ela está PAGA é o ponto: é o
 * `restante: 0` dela que manda cancelar. Filtrar as pagas aqui traria o
 * defeito de volta.
 *
 * Mandar um ciclo já vencido para `scheduleCardInvoiceReminders` é seguro: ele
 * cancela antes de agendar e ignora data que já passou.
 */
export function lembretesDeFatura(
  transacoes: Transaction[],
  cartoes: CreditCard[],
  pagamentos: CreditCardInvoicePayment[],
  hojeISO: string,
  datasExtras?: DatasDasCompras
): LembreteDeFatura[] {
  return cartoes.flatMap((cartao) => {
    const acumulando = mesFaturaDoLancamento(hojeISO, cartao.closing_day);
    /* `month - 1` com dia 1: o próprio `Date` rola o ano quando o ciclo de
       hoje é janeiro e o anterior é dezembro. */
    const anterior = new Date(acumulando.year, acumulando.month - 1, 1);
    const ciclos = [
      acumulando,
      { year: anterior.getFullYear(), month: anterior.getMonth() },
    ];
    return ciclos.map(({ year, month }) => {
      const total = somaDaFatura(filtrarLancamentosDaFatura(transacoes, cartoes, cartao.id, year, month, datasExtras));
      const pagamento = pagamentos.find((p) => p.card_id === cartao.id && p.year === year && p.month === month);
      return { cartao, year, month, restante: situacaoDaFatura(total, pagamento, null).restante };
    });
  });
}

/**
 * O resumo da Início, uma fatura por cartão.
 *
 * No mês corrente, cada cartão entra com a SUA fatura aberta (a que recebe
 * compras hoje), cada uma no próprio ciclo. Até 23/09/2026 o resumo pegava UM
 * ciclo para todos (`cicloDoResumoDeFaturas`) e, quando os cartões fechavam em
 * dias diferentes, caía no mês civil: para um cartão que fecha dia 20, visto
 * em 23/09, "setembro" é a fatura JÁ FECHADA. Era o mesmo buraco da tela de
 * Crédito. Em outro mês do seletor, cada cartão entra com a fatura que fecha
 * naquele mês, que é o que "setembro" quer dizer numa tela de mês civil.
 *
 * Lançamento sem cartão fica fora do total: nenhum cartão responde por ele
 * (decisão do autor de 23/09: órfão fica fora de qualquer total de cartão).
 *
 * "A pagar agora" (T25, decisão 1 do autor de 23/09): no mês corrente, cada
 * cartão também traz a fatura que JÁ FECHOU e ainda tem saldo a pagar. Até
 * 25/09/2026 o resumo olhava só a aberta, e logo depois do fechamento
 * mostrava R$ 0,00 justamente quando havia uma fatura inteira para pagar
 * (print r24-061). O ciclo fechado é o mesmo de `lembretesDeFatura` e da
 * faixa "Faturas fechadas" da tela de Crédito: o anterior ao aberto. `total`
 * continua sendo só o "Em aberto"; o fechado soma em `totalAPagarAgora`.
 * Fatura fechada paga, ou sem compra, fica `null`.
 */
export type ResumoDeFaturas = {
  noMesCorrente: boolean;
  total: number;
  totalAPagarAgora: number;
  incerto: boolean;
  porCartao: {
    cartao: CreditCard;
    ciclo: CicloFatura;
    valor: number;
    incerto: boolean;
    aPagarAgora: { ciclo: CicloFatura; valor: number } | null;
  }[];
};

export function resumoDeFaturas(
  transacoes: Transaction[],
  cartoes: CreditCard[],
  year: number,
  month: number,
  hojeISO: string,
  pagamentos: Pick<CreditCardInvoicePayment, 'card_id' | 'year' | 'month' | 'amount'>[] = [],
  datasExtras?: DatasDasCompras
): ResumoDeFaturas {
  const noMesCorrente = Number(hojeISO.slice(0, 4)) === year && Number(hojeISO.slice(5, 7)) - 1 === month;
  const datas = datasCarregadas(transacoes, datasExtras);
  const porCartao = cartoes.map((cartao) => {
    const ciclo = noMesCorrente ? mesFaturaDoLancamento(hojeISO, cartao.closing_day) : { year, month };
    const valor = somaDaFatura(filtrarLancamentosDaFatura(transacoes, cartoes, cartao.id, ciclo.year, ciclo.month, datasExtras));
    /* Sem a compra original, a estimativa pela data pode estar UMA fatura
       adiante ou atrás. Avisa nos dois ciclos próximos; só olhar os itens já
       filtrados deixaria a fatura que perdeu a parcela parecer completa. */
    const incerto = transacoes.some((t) => {
      if (resolverCartao(t, cartoes)?.id !== cartao.id || t.payment_method !== 'credit') return false;
      const resultado = cicloDoLancamento(t, cartao, datas);
      return resultado.incerto && Math.abs(deslocamentoEntre(resultado.ciclo, ciclo)) <= 1;
    });
    let aPagarAgora: { ciclo: CicloFatura; valor: number } | null = null;
    if (noMesCorrente) {
      const d = new Date(ciclo.year, ciclo.month - 1, 1);
      const fechado = { year: d.getFullYear(), month: d.getMonth() };
      const totalFechado = somaDaFatura(filtrarLancamentosDaFatura(transacoes, cartoes, cartao.id, fechado.year, fechado.month, datasExtras));
      const pagamento = pagamentos.find((p) => p.card_id === cartao.id && p.year === fechado.year && p.month === fechado.month);
      const { restante } = situacaoDaFatura(totalFechado, pagamento, null);
      if (restante > 0) aPagarAgora = { ciclo: fechado, valor: restante };
    }
    return { cartao, ciclo, valor, incerto, aPagarAgora };
  });
  const somar = (valores: number[]) => valores.reduce((centavos, v) => centavos + Math.round(v * 100), 0) / 100;
  const total = somar(porCartao.map((item) => item.valor));
  const totalAPagarAgora = somar(porCartao.map((item) => item.aPagarAgora?.valor ?? 0));
  return { noMesCorrente, total, totalAPagarAgora, incerto: porCartao.some((item) => item.incerto), porCartao };
}

/**
 * Lançamentos de crédito que pertencem a uma carteira. Um lançamento com
 * cartão pertence à carteira do CARTÃO, seja qual for o `wallet_id` gravado
 * nele (decisão P11 do autor: a carteira separa os cartões). Até 23/09/2026 o
 * filtro usava o `wallet_id` do lançamento, e uma compra no cartão da mãe
 * gravada com a carteira Principal (a voz e o Granabô gravavam assim) sumia
 * da carteira da mãe e aparecia na Principal como órfã. Lançamento sem cartão,
 * ou com cartão excluído, segue o próprio `wallet_id`. `'total'` é tudo.
 */
export function lancamentosDaCarteira(
  transacoes: Transaction[],
  todosOsCartoes: CreditCard[],
  carteiraId: string
): Transaction[] {
  if (carteiraId === 'total') return transacoes;
  const carteiraDoCartao = new Map(todosOsCartoes.map((c) => [c.id, c.wallet_id]));
  return transacoes.filter((t) => {
    if (t.card_id && carteiraDoCartao.has(t.card_id)) return carteiraDoCartao.get(t.card_id) === carteiraId;
    return t.wallet_id === carteiraId;
  });
}

/**
 * Cartão selecionado depois de trocar de carteira. Se ele não é da carteira
 * nova, volta para "todos": até 23/09/2026 a seleção ficava, `selectedCard`
 * virava nulo e o filtro recebia o id de um cartão de fora, e a lista
 * aparecia vazia sem nenhum cartão destacado.
 */
export function selecaoAposTrocarCarteira(
  selecionado: string | 'all',
  cartoesDaCarteira: CreditCard[]
): string | 'all' {
  if (selecionado === 'all') return 'all';
  return cartoesDaCarteira.some((c) => c.id === selecionado) ? selecionado : 'all';
}
