const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter((x) => x != null) });
const texto = (n) => n == null ? '' : Array.isArray(n) ? n.map(texto).join(' ') : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(texto)].join(' ') : String(n);
const privados = ['CANARIO_EMAIL_FICTICIO', 'CANARIO_PEDIDO_FICTICIO', 'CANARIO_VALOR_INDIVIDUAL', 'CANARIO_DATA_INDIVIDUAL'];
async function render(tela, dto) {
  const raiz = node('main');
  raiz.appendChild = (n) => raiz.children.push(n);
  const ctx = {
    h: node, cabecalho: () => {}, recarregar: () => {},
    bloco: (_titulo, rota, montar) => rota.endsWith('/resumo') ? montar(dto) : null,
    cartao: (a) => node('article', null, a.titulo, a.valor, a.detalhe),
    tabela: (colunas, linhas) => node('table', null, linhas.map((l) => node('tr', null, colunas.map((c) => c.valor(l))))),
    selo: (_tipo, t) => t,
    formatar: { numero: (v) => String(v ?? 'sem dado'), reais: (v) => String(v ?? 'sem dado'), dataHora: (v) => v, data: (v) => v },
  };
  const fonte = fs.readFileSync(`tools/admin-local/web/telas/${tela}.js`, 'utf8').replace('export async function montar', 'async function montar');
  const sandbox = { ctx, raiz };
  vm.runInNewContext(fonte, sandbox);
  await vm.runInNewContext('montar(raiz, ctx)', sandbox);
  return texto(raiz);
}
(async () => {
  const cadastros = { usuarios: { total: 37, hoje: 2, ultimos7: 5, ultimos30: 11 }, assinaturas: { porStatus: { active: 9 } }, ultimosCadastros: [{ email: privados[0], data: privados[3] }] };
  const vendas = { pagos: { hoje: { valor: 150, pedidos: 3 }, ultimos7: { valor: 550, pedidos: 11 }, ultimos30: { valor: 900, pedidos: 18 } }, porStatus: { paid: 18 }, recentes: [{ ref: privados[1], valor: privados[2], pagoEm: privados[3], status: 'paid' }] };
  for (const [tela, dto, agregado] of [['supabase', cadastros, '37'], ['vendas', vendas, '550']]) {
    const t = await render(tela, dto);
    assert.ok(t.includes(agregado), `${tela}: preserva agregado`);
    assert.ok(privados.every((v) => !t.includes(v)), `${tela}: nunca renderiza linhas individuais legadas`);
    assert.ok(!/Últimos cadastros|Pedidos recentes/.test(t), `${tela}: remove lista individual`);
  }
  assert.ok((await render('vendas', { pagos: { hoje: { valor: 0, pedidos: 0 } } })).includes('0 pedidos pagos'));
  assert.ok((await render('vendas', { porStatus: { paid: 7 } })).includes('7'));
  assert.equal((await render('vendas', { recentes: vendas.recentes })).trim(), '');
  const simulador = { URLSearchParams, Date };
  const fonteSimulada = fs.readFileSync('tools/admin-local/web/simulado.js', 'utf8').replace('export const SIMULADO', 'const SIMULADO');
  vm.runInNewContext(fonteSimulada, simulador);
  for (const rota of ['/api/supabase/resumo', '/api/cakto/resumo']) {
    simulador.rota = rota;
    const resposta = await vm.runInNewContext('SIMULADO.ler(rota)', simulador);
    assert.equal(/"(?:email|ultimosCadastros|recentes|user_id|customer)"/.test(JSON.stringify(resposta.dados)), false, 'simulador só transporta agregados');
  }
  for (const arquivo of ['supabase', 'vendas', 'simulado']) {
    const pasta = arquivo === 'simulado' ? 'tools/admin-local/web' : 'tools/admin-local/web/telas';
    const fonte = fs.readFileSync(`${pasta}/${arquivo}.js`, 'utf8');
    assert.equal(/ultimosCadastros|d\.recentes|email:/.test(fonte), false, 'superfície frontend não contém DTO individual');
  }
  console.log('admin-local-agregados-tela: módulos UI reais, agregados, zero e canários individuais OK; sem rede/dados reais');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
