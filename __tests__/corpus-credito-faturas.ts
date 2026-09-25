import { readFileSync } from 'fs';
import { join } from 'path';
import {
  agruparLancamentosPorCartao,
  lancamentosDaCarteira,
  resumoDeFaturas,
  selecaoAposTrocarCarteira,
  somaDaFatura,
  faturaAtualDeTodosOsCartoes,
  faturaParaExibir,
  filtrarLancamentosDaFatura,
  lembretesDeFatura,
  situacaoDaFatura,
} from '../lib/creditoFaturas';
import { mesFaturaDoLancamento } from '../lib/faturaCiclo';
import type { CreditCard, Transaction } from '../lib/types';

let falhas = 0;
let total = 0;
function checar<T>(rotulo: string, obtido: T, esperado: T) {
  total++;
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
}

const cartao = (id: string, name: string, closing_day: number): CreditCard => ({
  id,
  user_id: 'teste',
  name,
  bank: id,
  color: id === 'c6' ? '#123456' : '#654321',
  limit_amount: 1000,
  closing_day,
  due_day: 22,
  created_at: '2026-09-01T00:00:00Z',
});
const transacao = (id: string, card_id: string | null, occurred_on: string, amount: number): Transaction => ({
  id,
  user_id: 'teste',
  type: 'out',
  description: id,
  amount,
  category: 'Outros',
  color: '#ffffff',
  occurred_on,
  recurring: false,
  parent_id: null,
  payment_method: 'credit',
  card_id,
  created_at: `${occurred_on}T12:00:00Z`,
});

const c6 = cartao('c6', 'C6', 15);
const inter = cartao('inter', 'Inter', 5);
const dados = [
  transacao('c6-antes', 'c6', '2026-09-14', 10),
  transacao('c6-corte', 'c6', '2026-09-15', 20),
  transacao('inter-setembro', 'inter', '2026-09-04', 30),
  transacao('inter-outubro', 'inter', '2026-09-05', 40),
  transacao('orfao', null, '2026-09-20', 50),
];

const setembro = filtrarLancamentosDaFatura(dados, [c6, inter], 'all', 2026, 8);
checar('Total resolve cada cartão pelo próprio fechamento', setembro.map((t) => t.id), [
  'c6-antes',
  'inter-setembro',
  'orfao',
]);
checar(
  'cartão específico não recebe lançamentos de outro cartão',
  filtrarLancamentosDaFatura(dados, [c6, inter], 'c6', 2026, 9).map((t) => t.id),
  ['c6-corte']
);
checar(
  'crédito antigo sem card_id usa o único cartão e entra no ciclo da fatura',
  filtrarLancamentosDaFatura(
    [transacao('antigo-agosto', null, '2026-08-30', 70), transacao('novo-setembro', 'c6', '2026-09-04', 5.8)],
    [c6],
    'c6',
    2026,
    8
  ).map((t) => t.id),
  ['antigo-agosto', 'novo-setembro']
);

const secoes = agruparLancamentosPorCartao(
  [dados[2], dados[0], transacao('cartao-excluido', 'apagado', '2026-09-10', 60), dados[4]],
  [c6, inter]
);
checar('seções seguem a ordem do carrossel e deixam órfãos por último', secoes.map((s) => s.titulo), [
  'C6',
  'Inter',
  'Sem cartão vinculado',
]);
checar('subtotal é calculado dentro de cada cartão', secoes.map((s) => s.subtotal), [10, 30, 110]);
checar('cartão excluído e lançamento sem card_id ficam juntos', secoes[2].data.map((t) => t.id), [
  'cartao-excluido',
  'orfao',
]);
checar(
  'com um cartão, lançamento sem card_id aparece na seção dele',
  agruparLancamentosPorCartao([transacao('antigo', null, '2026-08-30', 70)], [c6]).map((s) => s.titulo),
  ['C6']
);

/* ── Qual fatura a tela mostra quando a "atual" muda ─────────────────────
   Caso real de 16/09/2026: o C6 estava com fechamento no dia 17, a fatura de
   setembro foi paga em 15/09, e duas compras de 16/09 entraram nela. O autor
   corrigiu o fechamento para 14 — e a tela seguiu mostrando setembro, porque
   só a troca de cartão recalculava a fatura atual. */
const hoje = '2026-09-16';
const atualCom17 = { cartaoId: 'c6', ...mesFaturaDoLancamento(hoje, 17) };
const atualCom14 = { cartaoId: 'c6', ...mesFaturaDoLancamento(hoje, 14) };
checar('com fechamento 17, a atual em 16/09 é setembro', atualCom17, { cartaoId: 'c6', year: 2026, month: 8 });
checar('com fechamento 14, a atual em 16/09 é outubro', atualCom14, { cartaoId: 'c6', year: 2026, month: 9 });
checar(
  'com fechamento 14, as compras de 16/09 saem de setembro e vão para outubro',
  filtrarLancamentosDaFatura(
    [transacao('energetico', 'c6', '2026-09-16', 10.99), transacao('transporte', 'c6', '2026-09-16', 7.6)],
    [cartao('c6', 'C6', 14)], 'c6', 2026, 9
  ).map((t) => t.id),
  ['energetico', 'transporte']
);

const setembroVisto = { year: 2026, month: 8 };
checar(
  'fechamento editado com a pessoa na fatura atual: a tela vai para a nova atual',
  faturaParaExibir(atualCom14, atualCom17, setembroVisto),
  { year: 2026, month: 9 }
);
checar(
  'fechamento editado com a pessoa numa fatura passada: a tela fica onde está',
  faturaParaExibir(atualCom14, atualCom17, { year: 2026, month: 6 }),
  null
);
checar(
  'o dia do fechamento chegou com a aba aberta: a tela acompanha',
  faturaParaExibir(
    { cartaoId: 'c6', ...mesFaturaDoLancamento('2026-09-17', 17) },
    { cartaoId: 'c6', ...mesFaturaDoLancamento('2026-09-16', 17) },
    setembroVisto
  ),
  { year: 2026, month: 9 }
);
checar(
  'recarga sem mudança de fechamento nem de dia não mexe na navegação',
  faturaParaExibir(atualCom14, atualCom14, { year: 2026, month: 6 }),
  null
);
checar(
  'primeira seleção de cartão abre na atual',
  faturaParaExibir(atualCom14, null, null),
  { year: 2026, month: 9 }
);
checar(
  'troca de cartão abre na atual do novo cartão, mesmo com outra fatura na tela',
  faturaParaExibir({ cartaoId: 'inter', year: 2026, month: 9 }, atualCom17, { year: 2026, month: 6 }),
  { year: 2026, month: 9 }
);

/* ── Situação da fatura: "Paga" só quando o pago cobre o total ──────────
   Até 16/09/2026 qualquer pagamento virava "Paga ✓". O caso do autor: fatura
   de setembro do C6 paga com R$ 998,01, e depois mais R$ 18,59 no ciclo. */
const vence20 = new Date(2026, 8, 20);
const antes = new Date(2026, 8, 16);
const pagamento = (amount: number) => ({ amount });
checar('pago cobre o total: paga', situacaoDaFatura(998.01, pagamento(998.01), vence20, antes), { status: 'paga', pago: 998.01, restante: 0 });
checar('comprou depois de pagar: parcial, com o que falta', situacaoDaFatura(1016.6, pagamento(998.01), vence20, antes), { status: 'parcial', pago: 998.01, restante: 18.59 });
checar('parcial vencida é atrasada', situacaoDaFatura(1016.6, pagamento(998.01), vence20, new Date(2026, 8, 21)), { status: 'atrasada', pago: 998.01, restante: 18.59 });
checar('parcial no dia do vencimento', situacaoDaFatura(1016.6, pagamento(998.01), vence20, new Date(2026, 8, 20, 23, 30)), { status: 'vence-hoje', pago: 998.01, restante: 18.59 });
checar('pagou a mais: paga, sem restante negativo', situacaoDaFatura(100, pagamento(120), vence20, antes), { status: 'paga', pago: 120, restante: 0 });
checar('sem pagamento e no prazo: aberta', situacaoDaFatura(50, null, vence20, antes), { status: 'aberta', pago: 0, restante: 50 });
checar('sem pagamento e vencida: atrasada', situacaoDaFatura(50, undefined, vence20, new Date(2026, 9, 1)), { status: 'atrasada', pago: 0, restante: 50 });
checar('fatura sem compra nunca fica atrasada', situacaoDaFatura(0, null, vence20, new Date(2026, 9, 1)), { status: 'aberta', pago: 0, restante: 0 });
checar('centavos: 0,1 + 0,2 pago contra 0,3 quita', situacaoDaFatura(0.3, pagamento(0.1 + 0.2), vence20, antes).status, 'paga');
checar('valor vindo do banco como texto', situacaoDaFatura(10, { amount: '10.00' as unknown as number }, null).status, 'paga');

/* ── Lembretes: ciclo do cartão, e pagamento parcial continua lembrando ── */
const c6de14 = cartao('c6', 'C6', 14);
const interDe5 = cartao('inter', 'Inter', 5);
const comprasDoCaso = [
  transacao('antes-do-fechamento', 'c6', '2026-09-05', 998.01), // setembro (fecha 14)
  transacao('depois-do-fechamento', 'c6', '2026-09-16', 18.59), // outubro
  transacao('inter-setembro', 'inter', '2026-09-01', 40), // ciclo que fechou dia 5
  transacao('inter-outubro', 'inter', '2026-09-10', 60),
];
const pag = (card_id: string, year: number, month: number, amount: number) => ({
  id: `${card_id}-${month}`, user_id: 'teste', card_id, year, month, amount, paid_on: '2026-09-15',
  wallet_id: null, paid_transaction_id: null, created_at: '2026-09-15T12:00:00Z',
});
const lembretes = (pagamentos: ReturnType<typeof pag>[]) =>
  lembretesDeFatura(comprasDoCaso, [c6de14, interDe5], pagamentos, '2026-09-16')
    .map((l) => ({ cartao: l.cartao.id, year: l.year, month: l.month, restante: l.restante }));
/* Busca por cartão E ciclo, em vez de por índice: agora são DOIS registros
   por cartão, e índice fixo esconderia qual dos dois está sendo medido. */
const lembrete = (pagamentos: ReturnType<typeof pag>[], cartao: string, month: number) =>
  lembretes(pagamentos).find((l) => l.cartao === cartao && l.month === month);

checar('lembrete de cada cartão sai do ciclo dele, não do mês civil', lembretes([]), [
  { cartao: 'c6', year: 2026, month: 9, restante: 18.59 },
  { cartao: 'c6', year: 2026, month: 8, restante: 998.01 },
  { cartao: 'inter', year: 2026, month: 9, restante: 60 },
  { cartao: 'inter', year: 2026, month: 8, restante: 40 },
]);
checar('pagamento parcial continua lembrando, com o que falta', lembrete([pag('inter', 2026, 9, 25)], 'inter', 9), { cartao: 'inter', year: 2026, month: 9, restante: 35 });
checar('pagamento total cancela o lembrete', lembrete([pag('c6', 2026, 9, 18.59)], 'c6', 9)!.restante, 0);
checar('pagamento de outra fatura não conta', lembrete([pag('c6', 2026, 8, 998.01)], 'c6', 9)!.restante, 18.59);

/* ── A fatura que FECHOU continua na conta, paga ou não ───────────────────
 *
 * Relato do autor em 23/09/2026: "o Grana. me notificou do vencimento da
 * fatura do cartão, sendo que eu já tinha pago o cartão. Ele estava me
 * informando que a fatura estava atrasada, mesmo após paga."
 *
 * O lembrete é agendado no aparelho com o ciclo dentro do identificador
 * (ver idForFatura, em lib/notifications.ts), então cancelar exige acertar o
 * MESMO ciclo. Esta função era a única fonte desses ciclos e devolvia só o
 * que acumula — que VIRA no dia do fechamento. A partir dali o cancelamento
 * mirava a fatura seguinte, e a que fechou ficava com os avisos vivos:
 * "Fatura vence hoje" e, no dia seguinte, "Fatura atrasada", mesmo paga.
 *
 * Ninguém paga antes de a fatura fechar, então o cancelamento só acertava
 * quem pagasse adiantado. O caminho normal estava quebrado.
 *
 * A fatura fechada precisa aparecer AINDA QUE PAGA: é o restante zero dela
 * que manda cancelar. Filtrar as pagas traria o defeito de volta. */
{
  const dia16 = '2026-09-16'; // já passou o fechamento do c6 (dia 14)
  const soDoC6 = (pagamentos: ReturnType<typeof pag>[]) =>
    lembretesDeFatura(comprasDoCaso, [c6de14], pagamentos, dia16)
      .map((l) => ({ ciclo: `${l.year}-${l.month}`, restante: l.restante }));

  checar('depois do fechamento, os dois ciclos entram na conta', soDoC6([]), [
    { ciclo: '2026-9', restante: 18.59 },
    { ciclo: '2026-8', restante: 998.01 },
  ]);
  checar('a fatura fechada e PAGA continua na lista, com restante zero (é o que cancela)',
    soDoC6([pag('c6', 2026, 8, 998.01)]).find((l) => l.ciclo === '2026-8'),
    { ciclo: '2026-8', restante: 0 });
  checar('e a fatura fechada por pagar mantém o valor, para o lembrete continuar',
    soDoC6([]).find((l) => l.ciclo === '2026-8')!.restante, 998.01);

  /* Virada de ano: o ciclo anterior a janeiro é dezembro do ano passado, e
     `new Date(y, -1, 1)` resolve isso sozinho. Sem esta checagem, um mês -1
     passaria despercebido até janeiro. */
  const emJaneiro = lembretesDeFatura([], [c6de14], [], '2026-01-05')
    .map((l) => `${l.year}-${l.month}`);
  checar('na virada do ano, o ciclo anterior é dezembro do ano passado', emJaneiro, ['2026-0', '2025-11']);
}

/* ── A tela usa a regra, e o botão paga o restante pelo caminho certo ─── */
const tela = readFileSync(join(__dirname, '..', 'app', '(app)', 'credito.tsx'), 'utf8');
checar('a tela não trata mais qualquer pagamento como "paga"', /currentInvoicePayment\s*\n?\s*\?\s*'paga'/.test(tela), false);
checar('o status sai de situacaoDaFatura', /situacaoDaFatura\(totalInvoice, currentInvoicePayment, invoiceDueDate\)/.test(tela), true);
checar('com parte paga, o pagamento vai para payCardInvoiceRemainder', /pagandoRestante && currentInvoicePayment\) \{\s*const registro = await payCardInvoiceRemainder/.test(tela), true);
checar('o pagamento que o servidor recusou em silêncio é avisado', (tela.match(/Math\.round\(Number\(registro\.amount\) \* 100\)/g) ?? []).length, 2);
checar('com parte paga, o botão diz "Pagar restante"', /pagandoRestante \? 'Pagar restante' : 'Pagar fatura'/.test(tela), true);
checar('o desfazer aparece com qualquer pagamento, mesmo parcial', /selectedCard && currentInvoicePayment && \(\s*<AppPressable style=\{styles\.undoPayBtn\}/.test(tela), true);
checar('A21 mostra faturas fechadas pendentes acima do carrossel', tela.includes('faturasFechadasPendentes') && tela.includes('Faturas fechadas aguardando pagamento'), true);
checar('A21 força o ciclo da fatura escolhida pela faixa', tela.includes('faturaForcada.current') && tela.includes('setFaturaCardYear(year)'), true);
checar('A22 troca o rótulo quando o cartão mostra ciclo antigo', tela.includes('ehCicloAtual ?') && tela.includes('Fatura de ${MESES[cicloDoCard.month]}'), true);
const perfil = readFileSync(join(__dirname, '..', 'app', '(app)', 'perfil.tsx'), 'utf8');
checar('o Perfil agenda pelos mesmos lembretes', /lembretesDeFatura\(transacoes, cards, payments, todayISO\(\)\)/.test(perfil), true);
checar('o Perfil não soma mais pelo mês civil', /isSameMonth\(tx\.occurred_on, anoAtual, mesAtual\)/.test(perfil), false);
const migracao = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20260916200000_pagar_restante_fatura.sql'), 'utf8');
checar('desfazer apaga também as saídas do restante', /id = any\(v_invoice\.extra_transaction_ids\)/.test(migracao), true);
checar('o restante só soma se o valor pago for o que a tela viu', /if v_invoice\.amount <> p_valor_ja_pago then\s+return v_invoice;/.test(migracao), true);

/* ── A visão Total tem eixo de FATURA, não de mês civil ────────────────
 *
 * O defeito, visto na auditoria de 16/09/2026 com um cartão que fecha no dia
 * 15 e uma compra feita no dia 16: a tela afirmava, ao mesmo tempo, "Fatura de
 * Setembro 2026 · Atual", "Total em Faturas (Todos os Cartões) R$ 0,00",
 * "Nenhuma compra no crédito nesta fatura" e, no cartão logo acima, "Fatura
 * atual R$ 300,00". Os R$ 300 estavam na fatura de OUTUBRO, pela regra do
 * fechamento; a visão Total agrupava pelo ciclo certo mas abria no mês do
 * calendário e o carimbava de "Atual". */
{
  const c15 = cartao('c15', 'Fecha dia 15', 15);
  const c20 = cartao('c20', 'Fecha dia 20', 20);

  // Depois do fechamento: a fatura atual é a do mês SEGUINTE, não a de hoje.
  checar('depois do fechamento, a atual é a do mês seguinte', faturaAtualDeTodosOsCartoes([c15], '2026-09-16'), { year: 2026, month: 9 });
  // Antes do fechamento: a do próprio mês.
  checar('antes do fechamento, a atual é a do próprio mês', faturaAtualDeTodosOsCartoes([c15], '2026-09-14'), { year: 2026, month: 8 });
  // No dia do fechamento já conta para a seguinte, como o resto do app.
  checar('no dia do fechamento já vale a seguinte', faturaAtualDeTodosOsCartoes([c15], '2026-09-15'), { year: 2026, month: 9 });
  // Vira o ano junto.
  checar('dezembro depois do fechamento vira janeiro do ano seguinte', faturaAtualDeTodosOsCartoes([c15], '2026-12-20'), { year: 2027, month: 0 });
  // Cartões que concordam: há uma atual única.
  checar('cartões no mesmo ciclo têm fatura atual única', faturaAtualDeTodosOsCartoes([c15, cartao('outro', 'Também 15', 15)], '2026-09-16'), { year: 2026, month: 9 });
  // Cartões que DISCORDAM: não existe uma atual, e afirmar uma seria mentir.
  checar('cartões em ciclos diferentes não têm fatura atual única', faturaAtualDeTodosOsCartoes([c15, c20], '2026-09-16'), null);
  checar('sem cartão não há fatura atual', faturaAtualDeTodosOsCartoes([], '2026-09-16'), null);

  // A GARANTIA de coerência: a fatura que a visão Total abre é a mesma em que
  // a compra do cartão cai. Era exatamente isso que divergia na tela.
  const atualTotal = faturaAtualDeTodosOsCartoes([c15], '2026-09-16')!;
  const cicloDaCompra = mesFaturaDoLancamento('2026-09-16', c15.closing_day);
  checar('a fatura atual da visão Total é a mesma da compra feita hoje', { year: atualTotal.year, month: atualTotal.month }, { year: cicloDaCompra.year, month: cicloDaCompra.month });

  // E a tela precisa realmente usar isso, em vez de cair no calendário.
  checar('a tela pergunta a fatura atual dos cartões na visão Total', tela.includes('faturaAtualTotal?.year'), true);
  checar('a visão Total não abre mais no mês civil', tela.includes('faturaAtualDeTodosOsCartoes(walletCards, hojeISO)'), true);
}

/* ── O resumo da Início mostra a fatura aberta de CADA cartão ─────────────
 *
 * Achado V8 da varredura de 17/09/2026: o card "Faturas de crédito" da Início
 * mostrava R$ 0,00 no mesmo instante em que a tela de Crédito mostrava
 * R$ 300,00 de fatura atual para o mesmo cartão. Em 23/09/2026 o resumo passou
 * a ter um ciclo por cartão: antes, com cartões que fechavam em dias
 * diferentes, ele caía no mês civil, que para um deles era a fatura fechada. */
{
  const HOJE = '2026-09-16';
  const fechaDia15 = cartao('c15', 'Fecha dia 15', 15);
  const fechaDia25 = cartao('c25', 'Fecha dia 25', 25);
  const txs = [
    transacao('ago-15', 'c15', '2026-09-10', 100), // fatura de set do c15 (fechada)
    transacao('out-15', 'c15', '2026-09-16', 30), // fatura de out do c15 (aberta)
    transacao('set-25', 'c25', '2026-09-10', 50), // fatura de set do c25 (aberta)
    transacao('orfa', null, '2026-09-12', 999), // sem cartão, com dois cartões: órfã
  ];

  const corrente = resumoDeFaturas(txs, [fechaDia15, fechaDia25], 2026, 8, HOJE);
  checar('no mês corrente, cada cartão na SUA fatura aberta',
    corrente.porCartao.map((p) => [p.cartao.id, p.ciclo.month, p.valor]),
    [['c15', 9, 30], ['c25', 8, 50]]);
  checar('total = soma das faturas abertas, sem a órfã', corrente.total, 80);
  checar('marca que é o mês corrente', corrente.noMesCorrente, true);

  const passado = resumoDeFaturas(txs, [fechaDia15, fechaDia25], 2026, 7, HOJE);
  checar('em outro mês do seletor, as faturas que fecham naquele mês',
    passado.porCartao.map((p) => [p.cartao.id, p.ciclo.month]), [['c15', 7], ['c25', 7]]);

  const setembro = resumoDeFaturas(txs, [fechaDia15, fechaDia25], 2026, 8, '2026-10-02');
  checar('setembro visto de outubro: fatura que fecha em setembro de cada um',
    setembro.porCartao.map((p) => [p.cartao.id, p.valor]), [['c15', 100], ['c25', 50]]);

  checar('sem cartão, total zero', resumoDeFaturas(txs, [], 2026, 8, HOJE).total, 0);

  /* Sem a compra original, a parcela pode estar na fatura estimada pela data
     ou na vizinha. O resumo precisa avisar em ambas, inclusive na que ficou
     com zero e poderia parecer completa. */
  const c29 = cartao('c29', 'Fecha 29', 29);
  const parcela14 = {
    ...transacao('p14', 'c29', '2027-02-28', 10),
    installment_current: 14,
    installment_total: 14,
    parent_id: 'p1',
  };
  const fevereiroSemPai = resumoDeFaturas([parcela14], [c29], 2027, 1, '2027-01-15');
  const marcoSemPai = resumoDeFaturas([parcela14], [c29], 2027, 2, '2027-01-15');
  checar('sem compra original, a fatura que pode ter perdido parcela avisa',
    [fevereiroSemPai.total, fevereiroSemPai.incerto], [0, true]);
  checar('sem compra original, a fatura estimada também avisa',
    [marcoSemPai.total, marcoSemPai.incerto], [10, true]);
  checar('incerteza não contamina fatura distante',
    resumoDeFaturas([parcela14], [c29], 2027, 5, '2027-01-15').incerto, false);
  const compra = { ...transacao('p1', 'c29', '2026-01-28', 10), installment_current: 1, installment_total: 14 };
  const fevereiroComPai = resumoDeFaturas([compra, parcela14], [c29], 2027, 1, '2027-01-15');
  checar('com compra original, a parcela volta ao ciclo correto sem aviso',
    [fevereiroComPai.total, fevereiroComPai.incerto], [10, false]);

  const resumo = readFileSync(join(__dirname, '..', 'components', 'CreditSummaryCard.tsx'), 'utf8');
  checar('o resumo usa uma fatura por cartão', resumo.includes('resumoDeFaturas(transactions, cards, year, month'), true);
  checar('e avisa quando o número é de outra fatura', resumo.includes('outraFatura'), true);
  checar('e avisa quando uma parcela não tem a compra original', resumo.includes('resumo.incerto'), true);
}

/* ── A carteira separa os cartões (P11, 23/09/2026) ─────────────────────── */
{
  const w = (id: string, wallet: string, closing = 20): CreditCard => ({ ...cartao(id, id, closing), wallet_id: wallet });
  const cartoes = [w('pessoal20', 'pessoal'), w('casal5', 'casal', 5), w('casal15', 'casal', 15), w('mae20', 'mae')];
  const t = (id: string, card: string | null, wallet: string) => ({ ...transacao(id, card, '2026-09-22', 10), wallet_id: wallet });
  const txs = [
    t('compra-mae-gravada-na-pessoal', 'mae20', 'pessoal'), // o caso da voz sem carteira
    t('compra-casal', 'casal5', 'casal'),
    t('orfa-casal', null, 'casal'),
    t('cartao-excluido', 'sumiu', 'mae'),
  ];
  const ids = (l: { id: string }[]) => l.map((x) => x.id).sort();
  checar('Mãe: a compra no cartão dela aparece, seja qual for o wallet_id gravado',
    ids(lancamentosDaCarteira(txs, cartoes, 'mae')), ['cartao-excluido', 'compra-mae-gravada-na-pessoal']);
  checar('Pessoal: não recebe a compra do cartão da mãe, nem como órfã',
    ids(lancamentosDaCarteira(txs, cartoes, 'pessoal')), []);
  checar('Casal: cartão e órfã da própria carteira',
    ids(lancamentosDaCarteira(txs, cartoes, 'casal')), ['compra-casal', 'orfa-casal']);
  checar('Total: tudo', lancamentosDaCarteira(txs, cartoes, 'total').length, 4);

  const casal = cartoes.filter((c) => c.wallet_id === 'casal');
  const daCasal = lancamentosDaCarteira(txs, cartoes, 'casal');
  checar('Casal "Todos": só a seção do cartão dela (a órfã fica no mês civil dela)',
    agruparLancamentosPorCartao(filtrarLancamentosDaFatura(daCasal, casal, 'all', 2026, 9), casal).map((s) => s.chave),
    ['casal5']);
  checar('Pessoal-20 e Mãe-20 têm o mesmo fechamento e não se somam na Pessoal',
    somaDaFatura(filtrarLancamentosDaFatura(lancamentosDaCarteira(txs, cartoes, 'pessoal'), cartoes.filter((c) => c.wallet_id === 'pessoal'), 'all', 2026, 9)), 0);

  checar('trocar para a carteira Mãe com Casal-5 selecionado volta para todos',
    selecaoAposTrocarCarteira('casal5', cartoes.filter((c) => c.wallet_id === 'mae')), 'all');
  checar('trocar para Total mantém o cartão selecionado',
    selecaoAposTrocarCarteira('casal5', cartoes), 'casal5');
  checar('"todos" continua "todos"', selecaoAposTrocarCarteira('all', []), 'all');

  const tela = readFileSync(join(__dirname, '..', 'app', '(app)', 'credito.tsx'), 'utf8');
  checar('Crédito filtra pela carteira do cartão', tela.includes('lancamentosDaCarteira(transactions, cards, activeWalletId)'), true);
  checar('Crédito reinicia a seleção ao trocar de carteira', tela.includes('selecaoAposTrocarCarteira(atual, walletCards)'), true);
  const inicio = readFileSync(join(__dirname, '..', 'app', '(app)', 'index.tsx'), 'utf8');
  checar('Início filtra o resumo pela carteira do cartão', inicio.includes('lancamentosDaCarteira(transactions, creditCards, activeWalletId)'), true);
}

/* ── Estado vazio por carteira (T24, 25/09/2026) ────────────────────────────
 *
 * Uma carteira sem cartão não é uma conta sem cartão: os cartões podem existir
 * em outra carteira. O estado precisa orientar cadastro na carteira atual e
 * oferecer a troca de carteira; "primeiro cartão" fica reservado ao vazio
 * global. O resumo também não pode dizer "todos" quando está filtrado. */
{
  const creditoT24 = readFileSync(join(__dirname, '..', 'app', '(app)', 'credito.tsx'), 'utf8');
  checar(
    'T24 distingue carteira sem cartão de conta sem cartão',
    /const carteiraSemCartao = activeWalletId !== 'total' && cards\.length > 0 && walletCards\.length === 0;/.test(creditoT24),
    true
  );
  checar('T24 nomeia o estado vazio da carteira atual', creditoT24.includes('Nenhum cartão nesta carteira'), true);
  checar('T24 oferece cadastro na carteira atual', creditoT24.includes('+ Cadastrar cartão aqui'), true);
  checar('T24 oferece trocar de carteira', creditoT24.includes('Trocar de carteira'), true);
  checar('T24 mantém primeiro cartão só no vazio global', creditoT24.includes('+ Cadastrar primeiro cartão'), true);
  checar(
    'T24 resume as faturas dos cartões da carteira',
    creditoT24.includes('Total das faturas (cartões desta carteira)'),
    true
  );
}

/* ── Sem rede, a tela não afirma "Nenhum cartão cadastrado" (W1) ──────────
 *
 * Visto no emulador em 18/09/2026, modo avião: a conta tinha um cartão com
 * fatura de R$ 300,00 e a tela dizia "Nenhum cartão cadastrado", "Total em
 * Faturas R$ 0,00". `fetchRecurrenceContext` era a única das sete buscas do
 * `Promise.all` sem cache offline; rejeitava, levava as outras junto, e o
 * `catch` vazio deixava `cards` em `[]`.
 *
 * Checagem do fonte, e não execução: `loadData` vive dentro de um componente
 * com hooks. O que ela prende são as três pernas do defeito. */
{
  const telaW1 = readFileSync(join(__dirname, '..', 'app', '(app)', 'credito.tsx'), 'utf8');
  const loadData = telaW1.slice(telaW1.indexOf('const loadData = useCallback'), telaW1.indexOf('useRecarregarAoChegarDadoNovo(() =>'));
  checar('achou o loadData do Crédito', loadData.length > 500, true);

  const primeiroPromiseAll = loadData.slice(loadData.indexOf('await Promise.all(['), loadData.indexOf(']);', loadData.indexOf('await Promise.all([')));
  checar('a busca sem cache não trava as buscas com cache', primeiroPromiseAll.includes('fetchRecurrenceContext'), false);
  checar('a busca sem cache continua existindo, em separado', /ocorrenciasFaltantes\(await fetchRecurrenceContext\(\), todayISO\(\)\)/.test(loadData), true);
  checar('os cartões chegam à tela antes do acerto de recorrências',
    loadData.indexOf('setCards(c)') < loadData.indexOf('fetchRecurrenceContext()'), true);

  checar('o catch do loadData não é mais vazio', /\}\s*catch\s*\{\s*\/\/ Falha graciosa/.test(loadData), false);
  checar('falha na carga vira estado de erro', /catch \(erro\) \{[\s\S]*?setErroCarga\(/.test(loadData), true);
  /* S51 (auditoria de 22/09): sem rede, o Crédito dizia "ainda não há cartões
     salvos neste aparelho" a quem tinha cartão no disco. Cada busca tem cache
     por CHAVE, e bastava uma chave sem nada guardado — um mês nunca aberto com
     rede — para a rejeição derrubar o `Promise.all` inteiro, cartões
     incluídos. É a mesma forma do defeito do `fetchRecurrenceContext`, acima:
     por isso as duas guardas ficam lado a lado. */
  checar('os cartões são buscados fora do Promise.all dos meses',
    loadData.includes('const c = await fetchCreditCards();'), true);
  checar('nenhum fetchCreditCards sobrou dentro do Promise.all',
    primeiroPromiseAll.includes('fetchCreditCards'), false);
  checar('mês sem cache entra vazio, em vez de derrubar a tela',
    loadData.includes('opcional(fetchCreditTransactionsForMonth('), true);
  checar('e só falha de REDE vira vazio; erro permanente continua subindo',
    loadData.includes('if (!isLikelyNetworkError(erro)) throw erro;'), true);
  checar('mês faltando acende aviso na tela, em vez de um total menor calado',
    loadData.includes('setFaturaIncompleta(faltouAlgumMes)') && telaW1.includes('faturaIncompleta &&'), true);

  const inicioVazioCartoes = telaW1.indexOf(') : erroCarga ? (');
  const tituloVazioGlobal = telaW1.indexOf("'Nenhum cartão cadastrado'", inicioVazioCartoes);
  checar('o erro de carga vem ANTES do "Nenhum cartão cadastrado"',
    inicioVazioCartoes > 0 && inicioVazioCartoes < tituloVazioGlobal, true);
}

console.log(`\n${total - falhas}/${total} checagens da lista de faturas passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
