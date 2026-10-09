const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean), appendChild(n) { this.children.push(n); }, replaceChildren(...n) { this.children = n; }, get firstChild() { return this.children[0]; }, removeChild(n) { this.children = this.children.filter((v) => v !== n); }, setAttribute(k,v) { this.attrs[k] = v; }, focus() {} });
const text = (n) => n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(text)].join(' ') : String(n);
const walk = (n) => [n, ...(n.children || []).flatMap(walk)];
const source = fs.readFileSync('tools/admin-local/web/telas/ajustes.js', 'utf8').replace(/export (async )?function /g, '$1function ');
(async () => {
  let antigo = false, erro = false, confirmado = true, resolver, extra = {};
  const calls = [], avisos = [], pedidos = [];
  const ctx = { h: node, obsoleta: () => antigo, recarregar: () => calls.push(['reload']), formatar: { dataHora: (v) => `formatado ${v}` },
    alerta: (tipo, t) => node('p', { tipo, texto: t }),
    estado: { carregando: (r, t) => r.replaceChildren(node('p', { texto: t })), erro: (r) => r.replaceChildren(node('p', { texto: 'Falha com recibo e atualização' })) },
    api: async (url) => { calls.push(['GET', url]); if (erro) throw Error('falha'); return { dados: { pedidos, remoto: { status: 'ausente' }, ...extra } }; },
    confirmar: async () => confirmado,
    acao: async (url, corpo) => { calls.push(['POST', url, corpo]); if (resolver) return new Promise((r) => { resolver = r; }); },
    aviso: (t, tipo) => avisos.push([t, tipo]),
  };
  const logs = [], root = node('main'), sandbox = { root, ctx, console: { warn: (...a) => logs.push(a) } };
  vm.runInNewContext(source, sandbox);
  const render = async () => { root.replaceChildren(); await vm.runInNewContext('montarFila(root,ctx)', sandbox); return text(root); };
  assert.ok((await render()).includes('Nenhum pedido'));
  assert.ok(text(root).includes('ponte remota não está confirmada'));
  const base = { id: 'pedido-ficticio', pecaTitulo: 'Reel de teste', pecaId: 'a'.repeat(16), versaoAlvo: 'a'.repeat(40), versaoCorrigida: 'b'.repeat(40), commit: 'c'.repeat(40), tentativas: 1, criadoEm: '2026-10-08T10:00:00-03:00', textoOriginal: 'CANARIO_PRIVADO_NAO_LOGAR' };
  for (const estado of ['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito', 'falha-de-envio', 'aguardando-aprovacao-de-custo', 'desatualizado', 'precisa-de-atencao', 'desconhecido']) {
    pedidos.splice(0, pedidos.length, { ...base, estado });
    const t = await render(); assert.ok(t.includes('Reel de teste · pedido de') && t.includes('Pedido pedido-f'), 'titulo pelo nome da peca, id curto'); assert.ok(!t.includes('pedido-ficticio') && !t.includes('a'.repeat(40)) && !t.includes('b'.repeat(40)) && !t.includes('c'.repeat(40)), 'nem id nem SHA inteiros ao autor'); assert.equal(t.includes(base.textoOriginal), false);
    assert.equal(walk(root).filter((n) => n.tag === 'button').length, ['corrigido-aguardando-aceite', 'falha-de-envio'].includes(estado) ? 1 : 0);
  }
  pedidos.splice(0, pedidos.length, { ...base, estado: 'corrigido-aguardando-aceite' }); await render();
  let b = walk(root).find((n) => n.tag === 'button'); confirmado = false; await b.attrs.onclick(); assert.equal(calls.filter((c) => c[0] === 'POST').length, 0);
  confirmado = true; resolver = true; const first = b.attrs.onclick(); await Promise.resolve(); await Promise.resolve(); await b.attrs.onclick();
  assert.equal(calls.filter((c) => c[0] === 'POST').length, 1, 'clique duplo não grava duas vezes');
  const body = calls.find((c) => c[0] === 'POST')[2]; assert.equal(body.pedidoId, base.id); assert.equal(body.versao, base.versaoCorrigida); assert.equal(body.confirmacao, true);
  resolver({}); await first; resolver = null;
  pedidos.splice(0, pedidos.length, { ...base, estado: 'falha-de-envio' }); await render(); b = walk(root).find((n) => n.tag === 'button'); await b.attrs.onclick();
  assert.equal(calls.filter((c) => c[0] === 'POST').at(-1)[2].confirmacao, true);
  erro = true; assert.ok((await render()).includes('Falha com recibo')); erro = false; antigo = true; assert.equal((await render()).includes('Pedido pedido-f'), false);
  assert.equal(JSON.stringify([calls, avisos]).includes(base.textoOriginal), false);
  assert.equal(fs.readFileSync('tools/admin-local/web/telas/aprovacao.js', 'utf8').includes('vai para o GitHub público'), false);
  antigo = false; erro = false;
  pedidos.splice(0, pedidos.length, { ...base, estado: 'corrigido-aguardando-aceite' });
  const peca = { id: base.pecaId, versao: base.versaoCorrigida, estado: 'para-aprovacao', tipo: 'imagem', titulo: 'Peça fictícia' };
  ctx.api = async (url) => ({ dados: url.endsWith('/pecas') ? { pecas: [peca] } : { pedidos } });
  Object.assign(ctx, { params: {}, cabecalho() {}, midia: () => node('img'), selo: (_tipo,t) => node('span',{texto:t}), markdown: (t) => node('p',{texto:t}) });
  Object.assign(sandbox, { tituloPeca: (p) => p.titulo, rotuloSemana: () => 'semana fictícia', rotuloEstado: (p) => p.estado, trilha: () => node('p') });
  vm.runInNewContext(fs.readFileSync('tools/admin-local/web/telas/aprovacao.js','utf8').replace(/^import .*\r?\n/gm,'').replace('export async function montar','async function montar'), sandbox);
  root.replaceChildren(); await vm.runInNewContext('montar(root,ctx)', sandbox);
  const generico = walk(root).find((n) => n.attrs?.texto === 'Aceite pela fila de ajustes');
  assert.ok(generico?.attrs.disabled, 'pedido aberto não é contornado pela aprovação genérica');
  // Toast de erro: texto humano, sem codigo interno cru; o codigo vai so para o console.
  pedidos.splice(0, pedidos.length, { ...base, estado: 'falha-de-envio', tentativas: 1 });
  ctx.api = async () => ({ dados: { pedidos, remoto: { status: 'ausente' } } });
  for (const [codigo, trecho] of [['confirmacao-invalida', 'código antigo. Feche a janela "Grana. Admin"'], ['versao-mudou', 'A ação não foi confirmada. Atualize os recibos']]) {
    avisos.length = 0; logs.length = 0; ctx.acao = async () => { throw Object.assign(new Error('x'), { codigo }); };
    await render(); const b = walk(root).find((n) => n.tag === 'button'); await b.attrs.onclick();
    assert.ok(avisos.at(-1)[0].includes(trecho) && avisos.at(-1)[1] === 'erro', codigo);
    assert.ok(!avisos.at(-1)[0].includes(codigo) && !/(w+-w+)/.test(avisos.at(-1)[0]), 'sem codigo cru no toast');
    assert.deepEqual(JSON.parse(JSON.stringify(logs)), [['[ajustes]', codigo]]);
  }
  // Entrega: vigia parado, servidor com codigo antigo e motivo da falha (sem consumir tentativa).
  pedidos.splice(0, pedidos.length, { ...base, estado: 'novo', tentativas: 0 });
  extra = { vigia: { ativo: false, ultimoBatimento: null }, servidor: { desatualizado: true } };
  ctx.api = async () => ({ dados: { pedidos, remoto: { status: 'ausente' }, ...extra } });
  let tela = await render();
  assert.ok(tela.includes('vigia de entrega não está ativo') && tela.includes('vigia-ajustes.cjs'), 'avisa vigia parado com o comando');
  assert.ok(tela.includes('Recebido, aguardando entrega') && tela.includes('Tentativas: 0'), 'pedido fica recebido, sem gastar tentativa');
  assert.ok(tela.includes('Feche a janela') && tela.includes('abra de novo pelo atalho'), 'avisa servidor com codigo antigo');
  extra = { vigia: { ativo: true, ultimoBatimento: '2026-10-09T14:00:00Z' }, servidor: { desatualizado: false } };
  assert.ok(!(await render()).includes('vigia de entrega não está ativo') && !text(root).includes('Feche a janela'));
  for (const [motivo, trecho, botoes] of [['terminal-inacessivel', 'Nada foi enviado e esta tentativa não foi gasta', 1], ['agente-fechado', 'agente estava fechado', 1], ['caixa-ocupada', 'caixa do agente estava ocupada', 1], ['entrega-incerta', 'Confira o agente antes de repetir, ou o pedido pode rodar duas vezes', 1]]) {
    pedidos.splice(0, pedidos.length, { ...base, estado: 'falha-de-envio', motivo, tentativas: 0 });
    tela = await render(); assert.ok(tela.includes(trecho), motivo); assert.equal(walk(root).filter((n) => n.tag === 'button').length, botoes, motivo);
  }
  extra = {};
  pedidos.splice(0, pedidos.length, { ...base, estado: 'falha-de-envio', motivo: null, tentativas: 1 });
  assert.ok((await render()).includes('Confira o agente antes de repetir: uma falha pode deixar a entrega incerta'), 'falha antiga sem motivo mantem o aviso conservador');
  console.log('admin-ajustes-tela: módulos UI reais, 9 estados, recibos, cancelamento, aceite exato, retry, clique duplo, falha/tardio e texto privado fora de ações/logs OK');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
