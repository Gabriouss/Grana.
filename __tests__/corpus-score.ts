/* O Score Grana — o que ele mede, e o que ele deixou de medir.
 *
 * A crítica de comportamento encontrou três defeitos de desenho, e este
 * corpus existe para que nenhum deles volte:
 *
 *  1. metade dos mil pontos vinha de RESULTADO financeiro (superávit e tetos),
 *     então um mês apertado derrubava a nota de quem mais precisa do app, sem
 *     que usar o app melhor recuperasse nada;
 *  2. definir um orçamento e estourá-lo dava 0 pontos contra 120 de não
 *     definir nenhum, ou seja, engajar com a funcionalidade custava caro;
 *  3. o fator de ritmo saturava aos 8 dias, então a partir dali a consistência
 *     parava de ser reconhecida: dia 9, dia 40 e dia 365 valiam o mesmo.
 *
 * O DESIGN.md diz que o Grana. "escuta sem julgar" e que "gastar não é um erro
 * a ser sinalizado". Os casos abaixo são essa frase virada em teste.
 */
process.env.TZ = 'America/Sao_Paulo';

import { calculateScoreBreakdown } from '../lib/gamification';
import { isoLocal } from '../lib/format';
import type { Bill, Budget, Transaction } from '../lib/types';

let total = 0;
let falhas = 0;

function checar(nome: string, condicao: boolean, detalhe = '') {
  total += 1;
  if (!condicao) {
    falhas += 1;
    console.log(`  FALHA  ${nome}${detalhe ? '\n         ' + detalhe : ''}`);
  }
}

const AGORA = new Date('2026-08-20T12:00:00-03:00');

function tx(dia: number, campos: Partial<Transaction> = {}): Transaction {
  const quando = new Date(`2026-08-${String(dia).padStart(2, '0')}T12:00:00-03:00`);
  return {
    id: `t${dia}-${campos.type ?? 'out'}-${campos.category ?? 'x'}`, user_id: 'u',
    type: 'out', description: 'x', amount: 100, category: 'Alimentação', color: '#bb6b60',
    occurred_on: isoLocal(quando), recurring: false, parent_id: null,
    created_at: quando.toISOString(), ...campos,
  } as Transaction;
}

const mesTipico: Transaction[] = [
  tx(1, { type: 'in', amount: 3000, category: 'Salário' }),
  tx(3), tx(5), tx(8), tx(12), tx(15), tx(18),
];

// ── 1. Estourar um teto não custa ponto nenhum ────────────────────────────
{
  const semOrcamento = calculateScoreBreakdown(mesTipico, [], [], 5, AGORA);
  const estourado: Budget[] = [{ user_id: 'u', category: 'Alimentação', amount: 10, color: '#bb6b60', updated_at: '' }];
  const comOrcamentoEstourado = calculateScoreBreakdown(mesTipico, [], estourado, 5, AGORA);

  checar(
    'definir um teto e estourá-lo NÃO reduz o Score',
    comOrcamentoEstourado.score === semOrcamento.score,
    `sem orçamento: ${semOrcamento.score} · com orçamento estourado: ${comOrcamentoEstourado.score}`
  );
  checar(
    'o teto estourado vira indicador, não fator de nota',
    comOrcamentoEstourado.indicadores.some((i) => i.label === 'Categorias dentro do teto') &&
      !comOrcamentoEstourado.factors.some((f) => /rçamento|teto/i.test(f.label))
  );
}

// ── 2. Mês no vermelho não é punido ───────────────────────────────────────
{
  const sobrando = [tx(1, { type: 'in', amount: 5000, category: 'Salário' }), tx(3), tx(5), tx(8)];
  const apertado = [tx(1, { type: 'in', amount: 500, category: 'Salário' }), tx(3, { amount: 900 }), tx(5), tx(8)];

  const a = calculateScoreBreakdown(sobrando, [], [], 4, AGORA);
  const b = calculateScoreBreakdown(apertado, [], [], 4, AGORA);
  checar(
    'mês com déficit tem o mesmo Score de um mês com sobra, com o mesmo hábito',
    a.score === b.score,
    `sobrando: ${a.score} · apertado: ${b.score}`
  );
  checar('o resultado do mês aparece como indicador', b.indicadores.some((i) => i.label === 'Resultado do mês'));
  checar(
    'e o indicador do mês apertado não repreende',
    !b.indicadores.some((i) => /cuidado|erro|atenção|reduza|corte/i.test(i.descricao))
  );
}

// ── 3. Conta atrasada não derruba a nota ──────────────────────────────────
{
  const emDia: Bill[] = [{ id: 'b1', user_id: 'u', description: 'Luz', amount: 100, category: 'Moradia', color: '#93739e', due_date: '2026-08-10', status: 'paid', recurring: false, paid_transaction_id: null, created_at: '' }];
  const atrasada: Bill[] = [{ ...emDia[0], status: 'due' as const }];

  const comEmDia = calculateScoreBreakdown(mesTipico, emDia, [], 5, AGORA);
  const comAtraso = calculateScoreBreakdown(mesTipico, atrasada, [], 5, AGORA);
  checar('conta vencida aparece como indicador', comAtraso.indicadores.some((i) => i.label === 'Contas vencidas'));
  checar(
    'o fator de contas mede acompanhamento no app, não pontualidade',
    comEmDia.factors.some((f) => f.label === 'Contas acompanhadas')
  );
  checar('quem não cadastra conta nenhuma não é penalizado',
    calculateScoreBreakdown(mesTipico, [], [], 5, AGORA).factors.find((f) => f.label === 'Contas acompanhadas')!.points === 200);
}

// ── 4. A consistência continua sendo reconhecida depois do oitavo dia ─────
{
  const pontosPorSequencia = (s: number) =>
    calculateScoreBreakdown(mesTipico, [], [], s, AGORA).factors.find((f) => f.label === 'Sequência de registros')!.points;

  checar('8 dias valem mais que 4', pontosPorSequencia(8) > pontosPorSequencia(4));
  checar('12 dias valem mais que 8', pontosPorSequencia(12) > pontosPorSequencia(8), 'antes o fator saturava aos 8 dias');
  checar('15 dias chegam ao teto do fator', pontosPorSequencia(15) === 300);
  checar('30 dias não valem menos que 15', pontosPorSequencia(30) === 300);
}

// ── 5. O Score reage ao hábito, que é o que a pessoa controla ─────────────
{
  const poucoRegistro = [tx(1, { type: 'in', amount: 3000, category: 'Salário' }), tx(2)];
  const muitoRegistro = mesTipico;
  const a = calculateScoreBreakdown(poucoRegistro, [], [], 1, AGORA);
  const b = calculateScoreBreakdown(muitoRegistro, [], [], 7, AGORA);
  checar('registrar mais dias eleva o Score', b.score > a.score, `${a.score} → ${b.score}`);

  const semCategoria = mesTipico.map((t) => ({ ...t, category: 'Outros' }));
  const c = calculateScoreBreakdown(semCategoria, [], [], 7, AGORA);
  checar('escolher categoria conta no retrato completo', b.score > c.score, `com categoria: ${b.score} · tudo em Outros: ${c.score}`);
}

// ── 6. Nada nos fatores fala de dinheiro, só de hábito ────────────────────
{
  const r = calculateScoreBreakdown(mesTipico, [], [], 5, AGORA);
  checar('são quatro fatores', r.factors.length === 4);
  checar('somados, valem 1000', r.factors.reduce((s, f) => s + f.maxPoints, 0) === 1000);
  checar(
    'nenhum fator julga resultado financeiro',
    !r.factors.some((f) => /superávit|sobra|economia|poupança|estourou|limite/i.test(f.label + f.description))
  );
}

// ── 7. Os indicadores de dinheiro usam o caixa, como a Início ─────────────
/* Visto na auditoria de 16/09/2026: com uma compra de R$ 300 no crédito, a
   tela de Desafios mostrava "Resultado do mês − R$ 677,20" enquanto a Início
   mostrava − R$ 377,20. E com a fatura paga o pagamento também entrava, então
   o mesmo dinheiro saía duas vezes. */
{
  const salario = tx(1, { type: 'in', amount: 1000, category: 'Salário' });
  const almoco = tx(2, { amount: 100, category: 'Alimentação' });
  const compraNoCredito = tx(3, { amount: 300, category: 'Alimentação', payment_method: 'credit', card_id: 'c1' });
  const pagamentoDaFatura = tx(10, { amount: 300, category: 'Outros', description: 'Pagamento fatura' });
  const resultado = (lista: Transaction[]) =>
    calculateScoreBreakdown(lista, [], [{ category: 'Alimentação', amount: 150 } as Budget], 1, AGORA).indicadores;
  const valor = (ind: ReturnType<typeof resultado>, rotulo: string) => ind.find((i) => i.label === rotulo)?.valor;

  checar(
    'compra no crédito não entra no resultado do mês',
    valor(resultado([salario, almoco, compraNoCredito]), 'Resultado do mês') === '+ R$ 900,00',
    String(valor(resultado([salario, almoco, compraNoCredito]), 'Resultado do mês'))
  );
  checar(
    'com a fatura paga, o dinheiro sai uma vez só (o pagamento)',
    valor(resultado([salario, almoco, compraNoCredito, pagamentoDaFatura]), 'Resultado do mês') === '+ R$ 600,00',
    String(valor(resultado([salario, almoco, compraNoCredito, pagamentoDaFatura]), 'Resultado do mês'))
  );
  checar(
    'o teto usa a mesma régua da Início: crédito fora',
    valor(resultado([salario, almoco, compraNoCredito]), 'Categorias dentro do teto') === '1 de 1',
    String(valor(resultado([salario, almoco, compraNoCredito]), 'Categorias dentro do teto'))
  );
}

// ── 8. "Contas acompanhadas" precisa ver as contas pagas ──────────────────
/* A tela de Desafios buscava só as PENDENTES. Com tudo pago, o fator dizia
   "Nenhuma conta cadastrada por enquanto"; com 2 de 3 pagas, dava 0 pontos. */
{
  const conta = (id: string, status: 'paid' | 'due') =>
    ({ id, user_id: 'u', description: id, amount: 50, due_date: '2026-08-25', status, category: 'Moradia' }) as Bill;
  const fator = (contas: Bill[]) =>
    calculateScoreBreakdown(mesTipico, contas, [], 5, AGORA).factors.find((f) => f.label === 'Contas acompanhadas')!;

  const duasDeTres = fator([conta('a', 'paid'), conta('b', 'paid'), conta('c', 'due')]);
  checar('2 de 3 contas em dia valem 2/3 do fator', duasDeTres.points === 133, String(duasDeTres.points));
  const todasPagas = fator([conta('a', 'paid')]);
  checar('com tudo pago, não diz que não há conta', !/nenhuma conta/i.test(todasPagas.description), todasPagas.description);

  const desafios = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app', '(app)', 'desafios.tsx'), 'utf8');
  checar(
    'a tela de Desafios não filtra só as pendentes',
    !/fetchBills\(\{\s*status:\s*'due'\s*\}\)/.test(desafios)
  );
}

console.log(`\n${total - falhas}/${total} checagens do Score passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
