const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync('tools/admin-local/web/telas/build-painel.js', 'utf8').replace('export function ', 'function ');
function node(tag, attrs = {}, ...children) {
  return { tag, attrs, children: children.flat(Infinity).filter(Boolean), appendChild(v) { this.children.push(v); v.parent = this; }, replaceChildren() { this.children = []; },
    get firstChild() { return this.children[0]; }, removeChild(v) { this.children = this.children.filter((c) => c !== v); },
    remove() { this.parent?.removeChild(this); }, setAttribute(k, v) { this.attrs[k] = v; } };
}
const find = (n, text) => n.attrs?.texto === text ? n : (n.children || []).map((c) => typeof c === 'object' && find(c, text)).find(Boolean);
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function ambiente(estado, resposta, confirmar = true) {
  const root = node('main'), calls = [], confirms = [], logs = [];
  const ctx = {
    h: node, alerta: (tipo, texto) => node('p', { tipo, texto }),
    confirmar: async (pedido) => { confirms.push(pedido); return confirmar; },
    acao: async (rota, pedido) => { calls.push({ rota, pedido }); return resposta(rota, pedido); },
  };
  vm.runInNewContext(fonte + '\nmontarReciboBuild(ctx,root,preparo);', {
    ctx, root, preparo: { id: 'preparo-fixture', versao: '1.10.7', estado, nota: 'Linha 1\nLinha 2\nLinha 3' },
    console: { warn: (...v) => logs.push(v) },
  });
  return { root, calls, confirms, logs };
}
(async () => {
  const cancel = ambiente('preparado', () => { throw Error('não deve chamar'); }, false);
  await find(cancel.root, 'Disparar build').attrs.onclick(); assert.equal(cancel.calls.length, 0);
  let resolver;
  const a = ambiente('preparado', () => new Promise((r) => resolver = r));
  const button = find(a.root, 'Disparar build'); const p1 = button.attrs.onclick(), p2 = button.attrs.onclick();
  await tick(); assert.equal(a.calls.length, 1); assert.equal(a.confirms[0].frase, 'DISPARAR BUILD');
  assert.ok(a.confirms[0].detalhes.some((x) => x.includes('Linha 1\nLinha 2\nLinha 3')));
  resolver({ dados: { preparoPersistido: { id: 'preparo-fixture', estado: 'enviado', versao: '1.10.7', nota: 'Nota' } } }); await Promise.all([p1, p2]);
  assert.equal(find(a.root, 'Disparar build'), undefined);
  const fail = ambiente('preparado', () => { throw Object.assign(Error('Resultado desconhecido.'), { codigo: 'resultado-desconhecido' }); });
  await find(fail.root, 'Disparar build').attrs.onclick(); assert.equal(fail.calls.length, 1);
  assert.equal(find(fail.root, 'Disparar build'), undefined); assert.ok(find(fail.root, 'Registrar que não saiu no EAS')); assert.equal(fail.logs.length, 1);
  const nota = ambiente('enviado', (rota) => ({ dados: rota.endsWith('verificar-nota') ? { estado: 'nota-divergente', notaAprovada: 'A\nB', notaAnunciada: 'AB' } : { estado: 'nota-confirmada' } }));
  await find(nota.root, 'Conferir nota anunciada').attrs.onclick();
  assert.ok(find(nota.root, 'A\nB')); assert.ok(find(nota.root, 'AB'));
  await find(nota.root, 'Regravar nota aprovada').attrs.onclick();
  assert.equal(nota.confirms[0].frase, 'REGRAVAR NOTA'); assert.equal(nota.calls[1].pedido.preparoId, 'preparo-fixture');
  assert.equal(find(nota.root, 'Regravar nota aprovada'), undefined);
  for (const estado of ['nota-confirmada', 'nota-divergente']) {
    const anunciado = ambiente('desconhecido', () => ({ dados: { estado } }));
    await find(anunciado.root, 'Conferir nota anunciada').attrs.onclick();
    assert.equal(find(anunciado.root, 'Registrar que não saiu no EAS'), undefined);
    assert.equal(find(anunciado.root, 'Disparar build'), undefined);
  }
  const prazo = ambiente('preparado', () => { throw Object.assign(Error('A resposta demorou. A ação pode continuar no servidor.'), { codigo: 'prazo' }); });
  await find(prazo.root, 'Disparar build').attrs.onclick();
  assert.equal(prazo.calls.length, 1);
  assert.equal(find(prazo.root, 'Disparar build'), undefined);
  assert.ok(find(prazo.root, 'Conferir nota anunciada'));
  const push = ambiente('push-falhou', () => ({ dados: {} }));
  assert.equal(find(push.root, 'Disparar build'), undefined); await find(push.root, 'Publicar este preparo').attrs.onclick();
  assert.equal(push.confirms[0].frase, 'PUBLICAR PREPARO');
  const telaEas = fs.readFileSync('tools/admin-local/web/telas/eas.js', 'utf8').replace(/^import .*\n/m, '').replace('export async function ', 'async function ');
  const root = node('section'), botaoPreparo = node('button'), avisos = [], acoes = [];
  const ctx = { h: node, alerta: (tipo, texto) => { avisos.push(texto); return node('p', { tipo, texto }); },
    formulario: async () => ({ tipo: 'patch', mensagem: 'Linha 1\nLinha 2' }), confirmar: async () => true,
    acao: async (rota, pedido) => { acoes.push({ rota, pedido }); return { dados: { preparoPersistido: { id: 'fixture', estado: 'preparado' }, comando: 'não copiar' } }; } };
  const sandbox = { ctx, root, button: botaoPreparo, montarReciboBuild: () => {}, console };
  vm.runInNewContext(telaEas + '\ndesenharPreparo(ctx,root,null,{estado:"desconhecido"});', sandbox);
  assert.equal(find(root, 'Preparar build').attrs.disabled, true);
  root.replaceChildren();
  await vm.runInNewContext('preparar(ctx,null,root,button)', sandbox);
  assert.equal(botaoPreparo.disabled, true, 'preparo real pendente não oferece novo bump');
  assert.equal(find(root, 'Copiar comando'), undefined);
  assert.equal(acoes[0].pedido.mensagem, 'Linha 1\nLinha 2');
  ctx.acao = async () => { throw Object.assign(Error('falha'), { codigo: 'preparo-nao-publicado' }); };
  await vm.runInNewContext('preparar(ctx,null,root,button)', sandbox);
  assert.equal(botaoPreparo.disabled, true);
  assert.ok(avisos.at(-1).includes('preparo pendente'));
  console.log('admin-build-tela: cancelamento, frase, clique duplo, nota multiline, resultado desconhecido e regravação OK; API somente dublê');
})().catch((e) => { console.error(e); process.exitCode = 1; });
