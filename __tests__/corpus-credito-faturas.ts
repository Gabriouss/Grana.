import { agruparLancamentosPorCartao, filtrarLancamentosDaFatura } from '../lib/creditoFaturas';
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

console.log(`\n${total - falhas}/${total} checagens da lista de faturas passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
