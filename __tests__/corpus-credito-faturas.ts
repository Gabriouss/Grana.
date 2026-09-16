import { readFileSync } from 'fs';
import { join } from 'path';
import {
  agruparLancamentosPorCartao,
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
checar('lembrete de cada cartão sai do ciclo dele, não do mês civil', lembretes([]), [
  { cartao: 'c6', year: 2026, month: 9, restante: 18.59 },
  { cartao: 'inter', year: 2026, month: 9, restante: 60 },
]);
checar('pagamento parcial continua lembrando, com o que falta', lembretes([pag('inter', 2026, 9, 25)])[1], { cartao: 'inter', year: 2026, month: 9, restante: 35 });
checar('pagamento total cancela o lembrete', lembretes([pag('c6', 2026, 9, 18.59)])[0].restante, 0);
checar('pagamento de outra fatura não conta', lembretes([pag('c6', 2026, 8, 998.01)])[0].restante, 18.59);

/* ── A tela usa a regra, e o botão paga o restante pelo caminho certo ─── */
const tela = readFileSync(join(__dirname, '..', 'app', '(app)', 'credito.tsx'), 'utf8');
checar('a tela não trata mais qualquer pagamento como "paga"', /currentInvoicePayment\s*\n?\s*\?\s*'paga'/.test(tela), false);
checar('o status sai de situacaoDaFatura', /situacaoDaFatura\(totalInvoice, currentInvoicePayment, invoiceDueDate\)/.test(tela), true);
checar('com parte paga, o pagamento vai para payCardInvoiceRemainder', /pagandoRestante && currentInvoicePayment\) \{\s*const registro = await payCardInvoiceRemainder/.test(tela), true);
checar('o pagamento que o servidor recusou em silêncio é avisado', (tela.match(/Math\.round\(Number\(registro\.amount\) \* 100\)/g) ?? []).length, 2);
const perfil = readFileSync(join(__dirname, '..', 'app', '(app)', 'perfil.tsx'), 'utf8');
checar('o Perfil agenda pelos mesmos lembretes', /lembretesDeFatura\(transacoes, cards, payments, todayISO\(\)\)/.test(perfil), true);
checar('o Perfil não soma mais pelo mês civil', /isSameMonth\(tx\.occurred_on, anoAtual, mesAtual\)/.test(perfil), false);
const migracao = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20260916200000_pagar_restante_fatura.sql'), 'utf8');
checar('desfazer apaga também as saídas do restante', /id = any\(v_invoice\.extra_transaction_ids\)/.test(migracao), true);
checar('o restante só soma se o valor pago for o que a tela viu', /if v_invoice\.amount <> p_valor_ja_pago then\s+return v_invoice;/.test(migracao), true);

console.log(`\n${total - falhas}/${total} checagens da lista de faturas passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
