const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { carregar, root } = require('./_carregar-ts.cjs');
const core = carregar('lib/gastos-categoria.ts');
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const tx = (id, amount, payment_method = 'debit') => ({ id, amount, payment_method, card_id: payment_method === 'credit' ? 'cartao' : null, type: 'out', category: 'Transporte', color: '#00a6ca', description: id, occurred_on: '2026-11-03', created_at: '2026-11-03T12:00:00Z' });
let linhas = [tx('debito', 60), tx('pix', 20, 'pix'), tx('credito', 50, 'credit'), tx('fatura', 50)];
let falha = false, usuario = 'usuario-a', notificacoes = 0;
const chamadas = [];
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
    exports, Date, Set, Map, Promise, console: { ...console, error: () => {} },
    require: id => { if (id in mocks) return mocks[id]; throw new Error(`import não simulado ${id}`); },
  }, { filename: file });
  return exports;
}
const api = load('lib/categorias-cliente.ts', {
  './data': {
    fetchTransactionsDoPeriodo: async (...args) => { chamadas.push(args); if (falha) throw new Error('falhou'); return linhas; },
    fetchCardInvoicePayments: async () => [{ paid_transaction_id: 'fatura', extra_transaction_ids: ['parcial'] }],
  },
  './cache-de-tela': { estaServindoDoCache: () => false },
  './sessao-offline': { idDoUsuarioLocal: async () => usuario },
  './gastos-categoria': core,
  './creditLimitAlert': { checarLimiteCartao: () => { notificacoes++; } },
});
async function main() {
  const r = await api.consultarCategorias('2026-11-01', '2026-11-30');
  check(r.resultado.consumo.total.tudo === 13000, '130 em Tudo, pagamento da fatura fora');
  for (const [visao, esperado] of [['tudo', 130], ['avista', 80], ['credito', 50]]) {
    const lista = api.linhasDaCategoria(r.resultado, 'Transporte', visao);
    check(lista.reduce((s, t) => s + t.amount, 0) === esperado, `lista bate com ${esperado} em ${visao}`);
    check(api.categoriasDaVisao(r.resultado.consumo, visao)[0].value === esperado, `donut ${visao}`);
    const teto = core.linhaDoTeto(r.resultado.consumo.porCategoria[0], 100);
    check(teto.gasto === 130, `teto soma débito e crédito na visão ${visao}`);
    check(teto.percentual === 100, `barra limitada a 100 na visão ${visao}`);
    check(teto.excedido === true, `130 excede teto de 100 na visão ${visao}`);
    check(core.acimaDoTeto(r.resultado.consumo.porCategoria[0].tudo, 100) === 3000, 'excesso exato de 30 reais');
  }
  const exato = core.linhaDoTeto({ tudo: 10000 }, 100);
  check(exato.gasto === 100 && exato.percentual === 100 && !exato.excedido, 'exatamente no teto não excede');
  const centavo = core.linhaDoTeto({ tudo: 10001 }, 100);
  check(centavo.gasto === 100.01 && centavo.percentual === 100 && centavo.excedido, 'um centavo acima excede');
  check(core.acimaDoTeto(10001, 100) === 1, 'excesso de um centavo exato');
  const abaixo = core.linhaDoTeto({ tudo: 8000 }, 100);
  check(abaixo.gasto === 80 && abaixo.percentual === 80 && !abaixo.excedido, 'abaixo do teto preserva valor e proporção');
  const charts = carregar('lib/chart-colors.ts', { '@/lib/types': carregar('lib/types.ts') });
  const fatia = (name, value) => ({ name, value, color: 'cor original' });
  const originais = [fatia('Transporte', 70), fatia('Moradia', 50), fatia('Alimentação', 30), fatia('Lazer', 18), fatia('Outros', 22), fatia('Assinaturas', 6), fatia('Saúde', 4)];
  const fatias = charts.prepararFatias(originais);
  const outros = fatias.find(f => f.name === 'Outros');
  const total = fatias.reduce((s, f) => s + f.value, 0);
  check(total === 200 && outros.value === 32, 'Outros inclui os 22 reais originais e 10 agrupados, sem perder dinheiro');
  check(charts.percentualDaFatia(outros.value, total) === 16, 'fatia e legenda usam 16%, não os 11% da categoria original');
  check(outros.color === charts.corDaCategoria('Outros'), 'legenda usa a cor da fatia agrupada');
  check(charts.categoriaDaFatia(outros, originais) === null, 'Outros original mais outras categorias não abre lista parcial');
  check(charts.categoriaDaFatia(fatias.find(f => f.name === 'Transporte'), originais) === 'Transporte', 'fatia individual mantém a navegação');
  const semAgrupamento = [fatia('Transporte', 80), fatia('Outros', 20)];
  check(charts.categoriaDaFatia(charts.prepararFatias(semAgrupamento)[1], semAgrupamento) === 'Outros', 'Outros real, sozinho, continua tocável');
  const semOutrosReal = originais.filter(f => f.name !== 'Outros').concat(fatia('Educação', 2));
  check(charts.categoriaDaFatia(charts.prepararFatias(semOutrosReal).find(f => f.name === 'Outros'), semOutrosReal) === null, 'agrupamento sem categoria Outros real também não tem destino único');
  const semZeros = [...semAgrupamento, ...Array.from({ length: 6 }, (_, i) => fatia(`Vazia ${i}`, 0))];
  check(charts.categoriaDaFatia(charts.prepararFatias(semZeros)[1], semZeros) === 'Outros', 'valores zero não criam falso agrupamento');
  check(originais.find(f => f.name === 'Outros').value === 22, 'classificação e preparação não alteram a entrada');
  linhas = [...linhas, linhas[0], tx('parcial', 10)];
  const repetido = await api.consultarCategorias('2026-11-01', '2026-11-30', r.resultado);
  check(repetido.resultado.consumo.total.tudo === 13000, 'duplicata conciliada e pagamento parcial fora');
  const noDia = (id, amount, iso, extra = {}) => ({ ...tx(id, amount, extra.pm ?? 'debit'), occurred_on: iso, ...extra });
  linhas = [noDia('so-debito', 30, '2026-11-10'), noDia('so-credito', 45.5, '2026-11-11', { pm: 'credit' }),
    noDia('d-debito', 12.25, '2026-11-12'), noDia('d-credito', 20, '2026-11-12', { pm: 'credit' }), noDia('d-pix', 7.75, '2026-11-12', { pm: 'pix' }),
    noDia('fatura-dia', 99, '2026-11-13', { category: 'Cartão de crédito', description: 'Pagamento da fatura' }), noDia('entrada', 500, '2026-11-13', { type: 'in' }),
    noDia('futuro', 15, '2026-11-28')];
  const dia = (await api.consultarCategorias('2026-11-01', '2026-11-30')).resultado;
  const soma = l => Math.round(l.reduce((t, x) => t + x.amount, 0) * 100);
  let gd = api.gastosDoDia(dia, '2026-11-10');
  check(gd.linhas.length === 1 && gd.centavos === 3000 && gd.linhas[0].payment_method === 'debit', 'dia só com débito');
  gd = api.gastosDoDia(dia, '2026-11-11');
  check(gd.linhas.length === 1 && gd.centavos === 4550 && gd.linhas[0].card_id, 'dia só com crédito, no dia da compra');
  gd = api.gastosDoDia(dia, '2026-11-12');
  check(gd.linhas.length === 3 && gd.centavos === 4000 && soma(gd.linhas) === gd.centavos, 'dia com débito, Pix e crédito: total bate com a soma das linhas');
  gd = api.gastosDoDia(dia, '2026-11-13');
  check(gd.linhas.length === 0 && gd.centavos === 0, 'pagamento de fatura e entrada ficam fora');
  gd = api.gastosDoDia(dia, '2026-11-20');
  check(gd.linhas.length === 0 && gd.centavos === 0, 'dia sem gasto');
  gd = api.gastosDoDia(dia, '2026-11-28');
  check(gd.linhas.length === 1 && gd.centavos === 1500, 'dia futuro com lançamento aparece');
  falha = true;
  const antigo = await api.consultarCategorias('2026-12-01', '2026-12-31', r.resultado);
  check(antigo.resultado === r.resultado && antigo.erro && antigo.resultado.inicio === '2026-11-01', 'falha preserva o último intervalo identificado, sem zero');
  check((await api.consultarCategorias('2026-11-01', '2026-11-30')).resultado === null, 'primeira falha não inventa resultado vazio');
  usuario = 'usuario-b';
  check((await api.consultarCategorias('2026-11-01', '2026-11-30', r.resultado)).resultado === null, 'sem vazamento entre usuários');
  check(notificacoes === 0 && chamadas.length >= 4, 'atualizações não disparam alertas de orçamento/cartão');
  const storage = new Map();
  const aviso = load('lib/categorias-aviso.ts', { '@react-native-async-storage/async-storage': { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => storage.set(k, v) } });
  check(await aviso.consumirAvisoCategorias('a'), 'primeira abertura mostra aviso');
  check(!await aviso.consumirAvisoCategorias('a'), 'atualização não repete aviso');
  check(await aviso.consumirAvisoCategorias('b'), 'aviso separado por usuário');
  const g = carregar('lib/gamification.ts');
  const rows = [tx('a', 60), tx('b', 20, 'pix'), tx('c', 50, 'credit')];
  const budget = [{ category: 'Transporte', amount: 100 }];
  const agora = new Date(2026, 10, 4, 12);
  const state = g.getGamificationState(rows, [], budget, undefined, [], { agora, consumoCategorias: core.apurarGastosCategoria(rows, { inicio: '2026-11-01', fim: '2026-11-30' }) });
  check(state.indicadores.find(i => i.label === 'Categorias dentro do teto').valor === '0 de 1', 'Desafios mede teto em Tudo');
  check(g.getGamificationState(rows, [], [], undefined, [], { agora }).score === state.score, 'teto não muda Score de hábito');
  const monthly = carregar('lib/monthly-wrapped.ts', { './supabase': { supabase: {} } });
  const wrapped = monthly.gerarMonthlyWrapped(rows, [], budget, 0, new Date(2026, 11, 1));
  check(wrapped.categoriaCampea.total === 130 && wrapped.categoriaCampea.fatiaDasSaidas === 1, 'resumo mensal usa consumo conjunto e denominador do consumo');
  const html = carregar('lib/pdf-report-html.ts').montarHtml({ ano: 2026, mes: 10, transactions: rows.filter(t => t.payment_method !== 'credit'), bills: [], carteira: 'Total', consumoCategorias: r.resultado.consumo });
  check(html.includes('130,00') && html.includes('100.0%') && html.includes('Débito, Pix e crédito juntos'), 'PDF usa agregado do consumo mesmo com fluxo em caixa');
  console.log(`categorias-cliente: ${checks} verificações passaram`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
