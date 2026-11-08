/*
 * Desafios fase 2: "Padrão de gastos" (lib/desafios-padrao-gastos.ts, módulo real).
 *
 *   node __tests__/desafios-padrao-gastos.cjs
 *
 * Cada linha da tabela da seção 2 da spec, com o exemplo numérico.
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const { carregar } = require('./_carregar-ts.cjs');
const p = carregar('lib/desafios-padrao-gastos.ts');

let n = 0;
const ok = (c, nome) => { assert.ok(c, nome); n++; console.log('  ok  ' + nome); };
let seq = 0;
const iso = (dia, mes = 9) => `2026-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const saida = (dia, amount, parcial = {}) => ({
  id: 's' + ++seq, type: 'out', amount, category: 'Mercado', description: 'AUDIT',
  occurred_on: iso(dia), payment_method: 'debit', card_id: null, ...parcial,
});
/* Base mínima que atinge os mínimos: 8 saídas de R$ 10 em 8 dias diferentes. */
const base = () => [1, 2, 3, 4, 5, 6, 7, 8].map((d) => saida(d, 10));
const fechado = new Date(2026, 10, 3); // outubro já fechado
const total = (t, hoje = fechado) => p.calcularPadraoDeGastos(t, 2026, 9, hoje);

// Mínimos
ok(total(base()) !== null, 'base de 8 saídas em 8 dias existe');
ok(total(base().slice(0, 7)) === null, '7 saídas: abaixo do mínimo, não renderiza');
ok(total([1, 1, 2, 2, 3, 3, 4, 4].map((d) => saida(d, 10))) === null, '8 saídas em 4 dias: abaixo de 5 dias, não renderiza');
ok(p.calcularPadraoDeGastos(base(), 2026, 9, new Date(2026, 9, 7)) === null, 'mês vivido há 7 dias: não renderiza');
ok(p.calcularPadraoDeGastos(base(), 2026, 9, new Date(2026, 9, 8)) !== null, 'mês vivido há 8 dias: renderiza');

// Tabela
{
  const t = [...base(), saida(3, 200, { payment_method: 'credit', card_id: 'c1', category: 'Compras' })];
  ok(total(t).totalDoMes === 280, 'compra no crédito R$ 200 conta no dia da compra');
  ok(total(t).dia.iso === iso(3) && total(t).dia.total === 210, 'o crédito soma no dia 3');
}
{
  const pag = saida(10, 1000, { category: 'Cartão de crédito', description: 'Pagamento da fatura C6 (09/2026)' });
  ok(total([...base(), pag]).totalDoMes === 80, 'fatura paga (categoria Cartão de crédito, sem card_id) fica fora');
  const antigo = saida(10, 1000, { category: 'Outros', description: 'Pagamento fatura — C6 (09/2026)' });
  ok(total([...base(), antigo]).totalDoMes === 80, 'pagamento de build antiga (texto "Pagamento fatura —") fica fora');
  const pelaId = saida(10, 1000, { category: 'Outros', description: 'qualquer' });
  ok(total([...base(), pelaId]).totalDoMes === 1080, 'sem vínculo, saída comum de R$ 1.000 conta');
  const r = p.calcularPadraoDeGastos([...base(), pelaId], 2026, 9, fechado, { idsDePagamento: new Set([pelaId.id]) });
  ok(r.totalDoMes === 80, 'id vinculado em credit_card_invoices fica fora, qualquer que seja o texto');
  const compraNoCartao = saida(10, 90, { category: 'Cartão de crédito', payment_method: 'credit', card_id: 'c1' });
  ok(total([...base(), compraNoCartao]).totalDoMes === 170, 'compra no cartão com categoria "Cartão de crédito" ainda conta');
}
ok(total([...base(), { ...saida(9, 50), type: 'in' }]).totalDoMes === 80, 'entrada/estorno de R$ 50 não abate gasto');
ok(total([...base(), saida(12, 5, { occurred_on: '2026-09-30' })]).totalDoMes === 80, 'saída de outro mês fica fora');
{
  // Parcela futura: 3x R$ 100 em 01/10; 10/11 e 10/12 ainda não contam em outubro nem em novembro (hoje 05/11).
  const parcelas = [saida(1, 100, { payment_method: 'credit', card_id: 'c1' }),
    { ...saida(10, 100, { payment_method: 'credit', card_id: 'c1' }), occurred_on: '2026-11-10' },
    { ...saida(10, 100, { payment_method: 'credit', card_id: 'c1' }), occurred_on: '2026-12-10' }];
  ok(total([...base(), ...parcelas]).totalDoMes === 180, 'só a parcela de outubro conta em outubro');
  const nov = [1, 2, 3, 4, 5].flatMap((d) => [saida(d, 10, { occurred_on: iso(d, 10) }), saida(d, 10, { occurred_on: iso(d, 10) })]);
  const r = p.calcularPadraoDeGastos([...nov, ...parcelas], 2026, 10, new Date(2026, 10, 9));
  ok(r !== null && r.totalDoMes === 100, 'parcela de 10/11 não conta em 09/11 (data futura)');
}
ok(total([...base(), saida(5, 40, { description: 'Streaming' })]).totalDoMes === 120, 'assinatura/recorrência gerada conta na sua data');
ok(total([...base(), saida(12, 300, { description: 'Boleto pago' })]).dia.iso === iso(12), 'boleto pago dia 12 conta no dia 12');
ok(total([...base(), saida(6, 25, { category: 'Investimentos' })]).totalDoMes === 105, 'Investimentos é saída e conta, como em "Gastos por categoria"');

// Quinzenas: média por dia, mês fechado
{
  // 1ª quinzena R$ 980, 2ª R$ 1.240 (16 dias): 980/15 = 65,3 ; 1240/16 = 77,5
  const t = [saida(2, 100), saida(3, 100), saida(4, 100), saida(5, 100), saida(6, 100), saida(7, 100), saida(8, 100), saida(9, 100), saida(10, 100), saida(11, 80),
    saida(17, 300), saida(20, 300), saida(24, 300), saida(28, 340)];
  const r = total(t);
  ok(r.quinzena.tipo === 'maior' && r.quinzena.periodo.rotulo === 'segunda', 'segunda quinzena é a de maior gasto');
  ok(r.quinzena.periodo.total === 1240 && r.quinzena.outro.total === 980, 'totais 1.240 e 980');
  ok(r.quinzena.periodo.dias === 16 && r.quinzena.outro.dias === 15, 'média por dia usa 16 e 15 dias');
  ok(/^A segunda quinzena teve a maior média diária: R\$.77,50 por dia, contra R\$.65,33 na primeira\.$/.test(r.frases.quinzena), 'frase da quinzena: ' + r.frases.quinzena);
  ok(!/[—–]/.test(Object.values(r.frases).join(' ')), 'sem travessão nas frases');
  ok(/R\$ \d/.test(r.frases.quinzena), 'R$ colado ao número (espaço inquebrável)');
}
{
  // Fevereiro/2026 (28 dias): 1ª quinzena tem 15 dias, 2ª tem 13. R$ 1.000 em 15 dias (66,7/dia)
  // contra R$ 950 em 13 dias (73,1/dia): o total da segunda é MENOR, a média é MAIOR e a média decide.
  const f = (dia, amount) => ({ ...saida(dia, amount), occurred_on: `2026-02-${String(dia).padStart(2, '0')}` });
  const t = [f(2, 250), f(4, 250), f(6, 250), f(8, 250), f(17, 250), f(20, 250), f(24, 250), f(27, 200)];
  const r = p.calcularPadraoDeGastos(t, 2026, 1, new Date(2026, 2, 3));
  ok(r.quinzena.tipo === 'maior' && r.quinzena.periodo.rotulo === 'segunda' && r.quinzena.periodo.total === 950, 'a média por dia decide: segunda quinzena vence com total menor');
  ok(r.quinzena.periodo.dias === 13 && r.quinzena.outro.dias === 15, 'fevereiro: 13 e 15 dias');
  ok(r.frases.quinzena === 'A segunda quinzena teve a maior média diária: R$ 73,08 por dia, contra R$ 66,67 na primeira.', 'H03 fevereiro: frase usa médias em centavos antes de mapear');
  const { componente, textos } = require('./_copy-componentes-reais.cjs');
  const Tela = componente('components/DesafiosPadraoGastos.tsx').default;
  const texto = textos(Tela({ padrao: r })).join(' ');
  ok(texto.includes('A segunda quinzena teve a maior média diária: R$ 73,08 por dia, contra R$ 66,67 na primeira.'), 'H03 componente real usa médias em reais depois de mapear, sem fator100');
}
{
  // Empate: médias com menos de 5% de diferença
  const t = [saida(2, 150), saida(4, 150), saida(6, 150), saida(8, 150), saida(10, 150), saida(12, 150), saida(14, 150), // 1.050/15 = 70
    saida(17, 280), saida(20, 280), saida(24, 280), saida(26, 290), saida(28, 0.01)]; // ~1.130/16 = 70,6
  const r = total(t);
  ok(r.quinzena.tipo === 'parecidas', 'médias a menos de 5%: "parecidas", sem vencedora');
  ok(r.frases.quinzena === 'As duas quinzenas tiveram gastos parecidos por dia.', 'frase de empate');
  const { componente, textos } = require('./_copy-componentes-reais.cjs');
  ok(textos(componente('components/DesafiosPadraoGastos.tsx').default({ padrao: r })).join(' ').includes(r.frases.quinzena), 'H03 empate de quinzena tem unidade por dia tambem na tela');
}

// Mês em andamento
{
  const t = base();
  const dia14 = p.calcularPadraoDeGastos(t, 2026, 9, new Date(2026, 9, 14));
  ok(dia14 && dia14.quinzena === null, 'dia 14: sem quinzena');
  const dia20 = p.calcularPadraoDeGastos([...t, saida(17, 10), saida(18, 10)], 2026, 9, new Date(2026, 9, 20));
  ok(dia20 && dia20.quinzena === null, 'dia 20: sem quinzena (só a partir do dia 21)');
  const dia21 = p.calcularPadraoDeGastos([...t, saida(17, 10), saida(19, 90)], 2026, 9, new Date(2026, 9, 21));
  ok(dia21 && dia21.quinzena !== null, 'dia 21 em diante: quinzena aparece');
  const fut = p.calcularPadraoDeGastos([...t, saida(25, 999)], 2026, 9, new Date(2026, 9, 21));
  ok(fut.totalDoMes === 80, 'compra de data futura dentro do mês não entra');
}

// Semanas
{
  // Outubro/2026: 1ª semana 01 a 04 (quinta a domingo = 4 dias) conta; 26 a 31 (segunda a sábado... 26 a 31 = 6 dias)
  const t = [saida(1, 10), saida(2, 10), saida(3, 10), saida(4, 10), // semana 01 a 04: 40
    saida(5, 100), saida(8, 100), saida(11, 100), // 05 a 11: 300
    saida(12, 20), saida(15, 20), saida(18, 20), // 12 a 18: 60
    saida(19, 10), saida(22, 10), saida(25, 10), // 19 a 25: 30
    saida(26, 10), saida(29, 10)]; // 26 a 31: 20
  const r = total(t);
  ok(r.semana.tipo === 'maior' && r.semana.periodo.rotulo === '05/10 a 11/10' && r.semana.periodo.total === 300, 'semana de maior gasto: 05/10 a 11/10');
  ok(/^A semana de 05\/10 a 11\/10 teve a maior média diária: R\$.42,86 por dia\.$/.test(r.frases.semana), 'frase da semana: ' + r.frases.semana);
  const { componente, textos } = require('./_copy-componentes-reais.cjs');
  const Tela = componente('components/DesafiosPadraoGastos.tsx').default;
  ok(textos(Tela({ padrao: r })).join(' ').includes('A semana de 05/10 a 11/10 teve a maior média diária: R$ 42,86 por dia.'), 'H03 semana na tela real tem mesma unidade');
  // mês em andamento: precisa de 2 semanas elegíveis
  const andamento = p.calcularPadraoDeGastos([...t.filter((x) => x.occurred_on <= '2026-10-11'), saida(10, 5)], 2026, 9, new Date(2026, 9, 11, 23));
  ok(andamento.semana !== null, 'dia 11: duas semanas completas (01-04 e 05-11) permitem comparar');
  const so1 = p.calcularPadraoDeGastos([...[1, 2, 3, 4].map((d) => saida(d, 10)), ...[5, 6, 7, 8].map((d) => saida(d, 10))], 2026, 9, new Date(2026, 9, 9));
  ok(so1.semana === null, 'só uma semana completa: sem comparação de semana');
}

// Dia: maior soma; empate fica com o mais recente
{
  const r = total(Array.from({ length: 11 }, (_, i) => saida(i + 1, 10)));
  ok(r.semana.tipo === 'parecidas', 'H03 semanas de 4 e 7 dias empatam com media de 10 por dia');
  ok(r.frases.semana === 'As semanas tiveram gastos parecidos por dia.', 'H03 empate de semana declara unidade');
  const { componente, textos } = require('./_copy-componentes-reais.cjs');
  ok(textos(componente('components/DesafiosPadraoGastos.tsx').default({ padrao: r })).join(' ').includes(r.frases.semana), 'H03 empate de semana tambem coerente na tela');
}
{
  const t = [...base(), saida(12, 80), saida(12, 20), saida(20, 100)];
  const r = total(t);
  ok(r.dia.iso === iso(20) && r.dia.total === 100, 'empate de dia: o mais recente (20 antes do 12)');
  ok(r.frases.dia === 'O dia de maior gasto foi 20/10, com R$ 100,00.', 'frase do dia: ' + r.frases.dia);
}
// Soma por categoria: débito e crédito juntos, fatura fora
{
  const t = [saida(2, 30, { category: 'Mercado' }), saida(3, 20, { category: 'Mercado', payment_method: 'credit', card_id: 'c1' }),
    saida(4, 15, { category: 'Lazer' }), saida(5, 900, { category: 'Cartão de crédito', description: 'Pagamento da fatura C6 (09/2026)' })];
  const r = p.gastosPorCategoria(t, 2026, 9, fechado);
  ok(r.length === 2 && r[0].category === 'Mercado' && r[0].amount === 50 && r[1].amount === 15, 'categoria soma débito + crédito e não conta a fatura');
}
console.log(`\n${n} verificações passaram.`);
