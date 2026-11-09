/*
 * Núcleo de gasto por categoria, débito e crédito juntos (lib/gastos-categoria.ts,
 * módulo real). Tabela da seção 2 da spec do Compass.
 *
 *   node __tests__/categorias-consumo.cjs
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('node:assert/strict');
const { carregar } = require('./_carregar-ts.cjs');
const g = carregar('lib/gastos-categoria.ts');

let n = 0;
const ok = (c, nome) => { assert.ok(c, nome); n++; console.log('  ok  ' + nome); };
let seq = 0;
const out = (iso, amount, parcial = {}) => ({
  id: 't' + ++seq, type: 'out', amount, category: 'Transporte', description: 'AUDIT',
  occurred_on: iso, payment_method: 'debit', card_id: null, ...parcial,
});
const NOV = { inicio: '2026-11-01', fim: '2026-11-30' };
const cat = (r, nome) => r.porCategoria.find((c) => c.category === nome);

// T7: mesma entrada, trocando apenas Salário por Assinaturas, não vira gasto.
{
  const hoje = new Date('2026-11-20T12:00:00-03:00');
  const receita = out('2026-11-10', 70, { type: 'in', category: 'Assinaturas' });
  const despesa = out('2026-11-10', 100, { category: 'Assinaturas' });
  const linhas = [despesa, receita];
  const referencia = [despesa, { ...receita, category: 'Salário' }];
  const consumo = g.apurarGastosCategoria(linhas, NOV);
  ok(consumo.total.tudo === 10000 && cat(consumo, 'Assinaturas').tudo === 10000,
    'T7: entrada em Assinaturas não infla nem abate consumo por categoria (Gráficos/orçamento)');
  const desafios = carregar('lib/desafios-padrao-gastos.ts');
  ok(desafios.saidasDeConsumo(linhas, 2026, 10, hoje).length === 1, 'T7: desafios excluem receita de Assinaturas');
  const livre = carregar('lib/safe-to-spend.ts');
  ok(livre.calcularSaldoAtual(linhas, hoje) === -30, 'T7: receita de Assinaturas entra no saldo');
  ok(livre.calcularSafeToSpend(linhas, [], hoje).livreTotal === livre.calcularSafeToSpend(referencia, [], hoje).livreTotal,
    'T7: Livre independe da categoria da entrada');
  const score = carregar('lib/gamification.ts');
  const tetos = [{ category: 'Assinaturas', amount: 110 }];
  const nota = score.calculateScoreBreakdown(linhas, [], tetos, 0, hoje);
  assert.deepEqual(JSON.parse(JSON.stringify(nota)), JSON.parse(JSON.stringify(score.calculateScoreBreakdown(referencia, [], tetos, 0, hoje))),
    'T7: Score, indicadores de resultado e orçamento não mudam por categoria de entrada');
  const pdf = carregar('lib/pdf-report-html.ts');
  const html = pdf.montarHtml({ ano: 2026, mes: 10, transactions: linhas, bills: [] });
  const htmlRef = pdf.montarHtml({ ano: 2026, mes: 10, transactions: referencia, bills: [] });
  assert.equal(html.replaceAll('Assinaturas', 'Salário'), htmlRef.replaceAll('Assinaturas', 'Salário'),
    'T7: PDF e insights preservam valores; apenas rótulo da categoria muda');
}

// 1. Transporte no mesmo mês: débito 60, Pix 20, crédito 50 -> 130 / 80 / 50; teto 100: 30 acima.
{
  const r = g.apurarGastosCategoria([
    out('2026-11-03', 60), out('2026-11-04', 20, { payment_method: 'pix' }), out('2026-11-05', 50, { payment_method: 'credit', card_id: 'c1' }),
  ], NOV);
  const t = cat(r, 'Transporte');
  ok(t.tudo === 13000 && t.avista === 8000 && t.credito === 5000, 'Transporte: Tudo 130 / À vista 80 / Crédito 50');
  ok(g.valorDaVisao(t, 'avista') === 8000 && g.valorDaVisao(t, 'credito') === 5000, 'a visão lê o mesmo retorno, sem refazer conta');
  ok(g.acimaDoTeto(t.tudo, 100) === 3000, 'teto R$ 100: R$ 30 acima (sempre em Tudo)');
  ok(g.acimaDoTeto(t.tudo, 200) === 0, 'abaixo do teto: 0 acima');
  ok(r.total.tudo === 13000 && r.ids.length === 3, 'total e ids das linhas');
}
// 2. Parcelas: cada parcela é uma linha com a sua data; R$ 300 em 3x não soma 300 de novo.
{
  const parcelas = [out('2026-11-01', 100, { card_id: 'c1', payment_method: 'credit' }), out('2026-12-01', 100, { card_id: 'c1', payment_method: 'credit' }), out('2027-01-01', 100, { card_id: 'c1', payment_method: 'credit' })];
  ok(g.apurarGastosCategoria(parcelas, NOV).total.tudo === 10000, 'novembro: R$ 100');
  ok(g.apurarGastosCategoria(parcelas, { inicio: '2026-12-01', fim: '2026-12-31' }).total.tudo === 10000, 'dezembro: R$ 100');
  ok(g.apurarGastosCategoria(parcelas, { inicio: '2027-01-01', fim: '2027-01-31' }).total.tudo === 10000, 'janeiro: R$ 100');
  // centavos: 100,00 / 100,00 / 100,01 e 33,33 x 3
  const c = g.apurarGastosCategoria([out('2026-11-01', 33.33), out('2026-11-02', 33.33), out('2026-11-03', 33.34)], NOV);
  ok(c.total.tudo === 10000, 'centavos exatos: 33,33 + 33,33 + 33,34 = 100,00');
  ok(g.apurarGastosCategoria([out('2026-11-01', 0.1), out('2026-11-02', 0.2)], NOV).total.tudo === 30, '0,10 + 0,20 = 30 centavos, sem erro de ponto flutuante');
  // Parcelas de dia 29 a 31 gravadas pelo banco já vêm com a data certa; fevereiro:
  const fev = g.apurarGastosCategoria([out('2027-02-28', 100, { card_id: 'c1' }), out('2027-03-31', 100, { card_id: 'c1' })], { inicio: '2027-02-01', fim: '2027-02-28' });
  ok(fev.total.tudo === 10000, 'fevereiro: só a parcela de 28/02 (dia 31 limitado) entra');
}
// 3. Fatura paga (inclusive parcial) fica fora; saída no caixa não é consumo.
{
  const porId = out('2026-11-10', 50, { category: 'Outros', description: 'qualquer' });
  const porCategoria = out('2026-11-10', 50, { category: 'Cartão de crédito', description: 'Pagamento da fatura C6 (10/2026)' });
  const restante = out('2026-11-12', 20, { category: 'Cartão de crédito', description: 'Pagamento da fatura C6 (10/2026), restante' });
  const antigo = out('2026-11-10', 50, { category: 'Outros', description: 'Pagamento fatura — C6 (10/2026)' });
  const r = g.apurarGastosCategoria([porId, porCategoria, restante, antigo], { ...NOV, idsPagamentos: new Set([porId.id]) });
  ok(r.total.tudo === 0 && r.saidas.length === 0, 'fatura R$ 50, parcial e texto antigo: zero em consumo');
  ok(g.apurarGastosCategoria([porId], NOV).total.tudo === 5000, 'sem vínculo nem sinal de fatura, é saída comum e conta');
  const compra = out('2026-11-10', 90, { category: 'Cartão de crédito', payment_method: 'credit', card_id: 'c1' });
  ok(g.apurarGastosCategoria([compra], NOV).total.credito === 9000, 'compra no cartão com categoria "Cartão de crédito" conta');
  // nulo + card_id: método ausente mas card_id preenchido é crédito
  const nulo = out('2026-11-10', 40, { payment_method: null, card_id: 'c1' });
  ok(g.apurarGastosCategoria([nulo], NOV).total.credito === 4000, 'payment_method nulo com card_id é crédito');
  const legado = out('2026-11-10', 40, { payment_method: null, card_id: null });
  ok(g.apurarGastosCategoria([legado], NOV).total.avista === 4000, 'legado sem forma é à vista');
  ok(g.apurarGastosCategoria([out('2026-11-10', 40, { payment_method: 'cash' }), out('2026-11-10', 10, { payment_method: undefined })], NOV).total.avista === 5000, 'dinheiro e forma ausente são à vista');
}
// 4. Devolução/estorno não abate; entrada em cartão não existe.
{
  const r = g.apurarGastosCategoria([out('2026-11-03', 100), { ...out('2026-11-04', 50), type: 'in' }], NOV);
  ok(r.total.tudo === 10000, 'entrada de R$ 50 não abate o gasto');
}
// 5. Recorrente/conta paga: cada ocorrência `out` conta uma vez; sem transação não conta.
{
  const dup = out('2026-11-05', 40, { description: 'Streaming' });
  const r = g.apurarGastosCategoria([dup, dup, out('2026-11-12', 300, { description: 'Boleto pago' })], NOV);
  ok(r.total.tudo === 34000, 'a mesma ocorrência repetida na lista (fila + banco) conta uma vez');
  ok(r.porDia.find((d) => d.iso === '2026-11-12').tudo === 30000, 'boleto pago conta no dia do pagamento');
}
// 6. Data futura no mês e fora do mês
{
  const futura = out('2026-11-28', 40);
  ok(g.apurarGastosCategoria([futura], NOV).total.tudo === 4000, 'R$ 40 em 28/11 conta em novembro (mês inteiro)');
  ok(g.apurarGastosCategoria([futura], { inicio: '2026-11-01', fim: '2026-11-01' }).total.tudo === 0, 'com fim = hoje (01/11) a mesma saída ainda não entra');
  ok(g.apurarGastosCategoria([out('2026-12-01', 40)], NOV).total.tudo === 0, '01/12 não conta para novembro');
  ok(g.apurarGastosCategoria([out('2026-10-31', 40)], NOV).total.tudo === 0, '31/10 não conta para novembro');
  ok(g.apurarGastosCategoria([out('2026-11-01', 5), out('2026-11-30', 7)], NOV).total.tudo === 1200, 'as duas pontas do intervalo são inclusivas');
}
// 7. Receita, metas, Investimentos, personalizadas, vazias
{
  const r = g.apurarGastosCategoria([
    out('2026-11-03', 100, { category: 'Investimentos' }), out('2026-11-03', 10, { category: 'Meu Pet' }),
    out('2026-11-03', 5, { category: '' }), out('2026-11-03', 5, { category: null }), out('2026-11-03', 1, { category: 'Outros' }),
  ], NOV);
  ok(cat(r, 'Investimentos').tudo === 10000, 'Investimentos como saída conta');
  ok(cat(r, 'Meu Pet').tudo === 1000, 'categoria personalizada preservada');
  ok(cat(r, 'Outros').tudo === 1100 && !cat(r, ''), 'categoria vazia ou nula vai para Outros');
  ok(r.porCategoria[0].category === 'Investimentos', 'maior Tudo primeiro');
}
// 8. Dia e cor
{
  const r = g.apurarGastosCategoria([out('2026-11-03', 10, { color: '#abc' }), out('2026-11-03', 20, { card_id: 'c1', payment_method: 'credit' }), out('2026-11-02', 5)], NOV);
  ok(r.porDia.length === 2 && r.porDia[0].iso === '2026-11-02', 'porDia em ordem de data');
  const d3 = r.porDia[1];
  ok(d3.tudo === 3000 && d3.avista === 1000 && d3.credito === 2000, 'dia 03: Tudo 30 / À vista 10 / Crédito 20');
  ok(cat(r, 'Transporte').color === '#abc', 'cor da categoria vem da primeira linha que a tem');
}
// 9. Incompletude: lista vazia dá zero explícito (o chamador decide manter o último resultado)
{
  const r = g.apurarGastosCategoria([], NOV);
  ok(r.total.tudo === 0 && r.porCategoria.length === 0 && r.ids.length === 0, 'lista vazia: zeros e listas vazias');
}
console.log(`\n${n} verificações passaram.`);
