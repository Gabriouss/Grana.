'use strict';
// Resultados de marketing do painel local (E4, Lumen): módulos reais. null nunca vira zero; sem credencial
// da Meta é "Não configurado" (só os NOMES do que falta); rede falsa nos testes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const f = 'tools/admin-local/web/telas/resultados.js';
const saida = ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: 'x.js',
}).outputText;
const tela = {};
vm.runInNewContext(saida, { exports: tela, require: () => ({ SIMULADO: {} }), Date, Intl, console, String, Number, Array, Math }, { filename: f });
const copia = (x) => JSON.parse(JSON.stringify(x));

// ---- rótulos e estados
assert.deepEqual(copia(tela.seloDoEstado('nao-configurado')), ['alerta', 'Não configurado']);
assert.deepEqual(copia(tela.seloDoEstado('parcial')), ['alerta', 'Parcial']);
assert.deepEqual(copia(tela.seloDoEstado('completo')), ['ok', 'Completo']);
assert.deepEqual(copia(tela.seloDoEstado('qualquer-coisa')), ['neutro', 'Indisponível'], 'estado desconhecido não vira "completo"');
assert.equal(tela.rotuloIntervalo({ desde: '2026-09-16', ateInclusivo: '2026-10-15' }), '16 set. a 15 out. 2026');
assert.equal(tela.rotuloIntervalo({ desde: '2026-10-15', ateInclusivo: '2026-10-15' }), '15 out. 2026');
assert.equal(tela.rotuloIntervalo(null), 'intervalo indisponível');

// ---- variação: sem base não vira percentual nem zero
assert.equal(tela.textoVariacao(5, null, null), 'sem base de comparação');
assert.equal(tela.textoVariacao(null, 5, null), 'sem base de comparação');
assert.equal(tela.textoVariacao(5, 0, null), 'sem base de comparação');
assert.equal(tela.textoVariacao(5, 4, null), null, 'a tela não inventa percentual que o servidor não mandou');
assert.equal(tela.textoVariacao(5, 4, 25.9), '+25,9% sobre o período anterior');

// ---- medidas: DTO vazio, não configurado e parcial
const periodos = { atual: { desde: '2026-09-16', ateInclusivo: '2026-10-15' }, anterior: { desde: '2026-08-17', ateInclusivo: '2026-09-15' } };
for (const dto of [{}, { periodos }, { periodos, meta: { estado: 'nao-configurado', investimentoCentavos: null }, cakto: { estado: 'indisponivel', novasAssinaturas: null, receitaConfirmadaCentavos: null, reembolsosCentavos: null } }]) {
  const m = tela.montarMedidas(dto);
  assert.deepEqual(copia(m.map((x) => x.id)), ['investimento', 'assinaturas', 'receita', 'reversoes'], 'quatro medidas separadas');
  for (const x of m) { assert.equal(x.valor, null, `${x.id}: sem dado não vira 0 nem R$ 0,00`); assert.ok(x.indisponivel && x.fonte); }
}
const base = tela.montarMedidas({ periodos, meta: { estado: 'nao-configurado' } });
assert.equal(base[0].fonte, 'Meta Ads');
assert.ok(base.slice(1).every((x) => x.fonte === 'Cakto'), 'Meta e Cakto nunca misturadas numa medida');
assert.match(base[0].indisponivel, /não configurado/);
// zero que o servidor manda é zero; ausente continua ausente
const zero = tela.montarMedidas({ periodos, cakto: { estado: 'parcial', novasAssinaturas: 0, receitaConfirmadaCentavos: null, reembolsosCentavos: 0 } });
assert.equal(zero[1].valor, '0');
assert.equal(zero[2].valor, null);
assert.match(zero[3].valor, /0,00/);
const cheio = tela.montarMedidas({ periodos, meta: { estado: 'completo', investimentoCentavos: 64280, anterior: { investimentoCentavos: 51040 }, variacaoPercentual: 25.9 }, cakto: { estado: 'parcial', novasAssinaturas: 18, receitaConfirmadaCentavos: 176400, reembolsosCentavos: 10000, anterior: { novasAssinaturas: 13 } } });
assert.match(cheio[0].valor, /642,80/);
assert.match(cheio[0].variacao, /\+25,9%/);
assert.equal(cheio[1].valor, '18');
assert.match(cheio[2].nota, /Não é lucro/, 'receita bruta não se passa por lucro');

// ---- adaptador Node real, sem .env/rede real no teste
(async () => {
const { criarBackend } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const agora = new Date('2026-10-16T15:00:00Z');
const ad = criarBackend({ configuracao: { ler: () => null }, relogio: () => agora,
  rede: () => { throw new Error('rede proibida'); } });
const r = await ad.meta();
assert.equal(r.meta.estado, 'nao-configurado');
assert.equal(r.meta.investimentoCentavos, null);
assert.equal(r.cakto.novasAssinaturas, null);
assert.equal(r.periodos.hoje.parcial, true); // E4 mantém definição; meta.hoje é consulta opcional.
assert.equal(r.periodos.fuso, 'America/Sao_Paulo');
assert.deepEqual(copia(r.periodos.atual), { desde: '2026-09-16', ateExclusivo: '2026-10-16', ateInclusivo: '2026-10-15', parcial: false });
assert.deepEqual(copia(r.periodos.anterior), { desde: '2026-08-17', ateExclusivo: '2026-09-16', ateInclusivo: '2026-09-15', parcial: false });
assert.equal((await ad.meta({ incluirHoje: true })).periodos.hoje.parcial, true);
assert.deepEqual(copia(r.meta.faltantes), ['META_READ_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_GRAPH_API_VERSION']);

// ---- medidas da Cakto, módulo real, pedidos inventados
const { medidasCakto } = require('../tools/admin-local/adaptadores/cakto.cjs');
const per = { atual: { desde: '2026-09-17', ateExclusivo: '2026-10-17' }, anterior: { desde: '2026-08-18', ateExclusivo: '2026-09-17' } };
const pedidosCakto = [
  { subscription: 'A', status: 'paid', amount: '39.90', paidAt: '2026-09-10T12:00:00-03:00' }, // A começa no período anterior
  { subscription: 'A', status: 'paid', amount: '39.90', paidAt: '2026-10-10T12:00:00-03:00' }, // renovação de A: receita, não assinatura nova
  { subscription: 'B', status: 'paid', amount: '119.90', paidAt: '2026-09-20T09:00:00-03:00' }, // B nova no atual
  { subscription: 'C', status: 'refunded', amount: '39.90', paidAt: '2026-09-25T09:00:00-03:00', refundedAt: '2026-09-28T09:00:00-03:00' }, // estornada
  { subscription: 'D', status: 'chargedback', amount: '19.90', paidAt: '2026-09-01T09:00:00-03:00', chargedbackAt: '2026-09-18T09:00:00-03:00' }, // venda no anterior, reversão no atual
  { subscription: 'E', status: 'canceled', amount: '39.90', paidAt: null }, // nunca pago
  { subscription: 'F', status: 'paid', amount: '39.90', paidAt: '2026-10-17T00:00:00-03:00' }, // meia-noite do fim: fora (fim exclusivo)
  { subscription: 'G', status: 'paid', amount: '39.90', paidAt: '2026-09-17T02:59:59Z' }, // 23:59:59 de 16/09 em SP: anterior
];
const mc = medidasCakto(pedidosCakto, per, true);
assert.equal(mc.estado, 'completo');
assert.equal(mc.novasAssinaturas, 1, 'só B: renovação de A não conta e C estornada fica de fora');
assert.equal(mc.receitaConfirmadaCentavos, 3990 + 11990 + 3990, 'A renovada + B + C antes da reversão');
assert.equal(mc.reembolsosCentavos, 3990 + 1990, 'C reembolsada e D com chargeback no atual');
assert.deepEqual(copia(mc.anterior), { novasAssinaturas: 2, receitaConfirmadaCentavos: 3990 + 1990 + 3990, reembolsosCentavos: 0 }, 'A e G novas; D paga no anterior mas estornada');
const inc = medidasCakto(pedidosCakto, per, false);
assert.equal(inc.estado, 'parcial');
assert.equal(inc.receitaConfirmadaCentavos, null, 'lista incompleta nunca vira número');
const ruim = medidasCakto([{ subscription: 'X', status: 'paid', amount: '39,90', paidAt: '2026-09-20T09:00:00-03:00' }], per, true);
assert.equal(ruim.estado, 'indisponivel');
assert.equal(ruim.novasAssinaturas, null, 'valor ilegível invalida a leitura inteira');
assert.equal(medidasCakto([], per, true).novasAssinaturas, 0, 'lista completa e vazia é zero comprovado');

// ---- fiação e segurança do texto
const rotas = fs.readFileSync('tools/admin-local/rotas.cjs', 'utf8');
assert.ok(rotas.includes("'/api/marketing/resultados'") && rotas.includes("adaptador('meta-leitura')"), 'rota GET registrada');
assert.ok(!/MARKETING_POST = new Set\(\[[^\]]*resultados/.test(rotas), 'leitura: nenhuma rota de escrita');
const app = fs.readFileSync('tools/admin-local/web/app.js', 'utf8');
assert.ok(app.includes("'marketing/resultados': { modulo: 'resultados', titulo: 'Resultados de marketing' }"));
const html = fs.readFileSync('tools/admin-local/web/index.html', 'utf8');
assert.ok(html.indexOf('#/marketing/trafego') < html.indexOf('#/marketing/resultados'), 'menu: depois de Tráfego pago');
const fonte = fs.readFileSync(f, 'utf8');
assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/.test(fonte), 'texto da API só entra por textContent');
assert.ok(!/fetch\(|XMLHttpRequest/.test(fonte), 'a tela só fala com o servidor local pelo ctx.api');
assert.ok(fonte.includes("typeof v !== 'number'"), 'gráfico trata nulo como lacuna');
const css = fs.readFileSync('tools/admin-local/web/estilo.css', 'utf8');
const bloco = css.slice(css.indexOf('Resultados de marketing (E4'));
for (const [, px] of bloco.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(px) >= 12, `texto de ${px}px`);
assert.ok(!/animation|transition/.test(bloco), 'sem movimento a desligar');

console.log('admin-resultados-local: medidas sem zero inventado, adaptador sem credencial, fiação e texto seguro OK');

})().catch(e => { console.error(e); process.exitCode = 1; });
