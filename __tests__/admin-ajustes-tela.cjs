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
    alerta: (tipo, t) => node('p', { tipo, texto: t }), selo: (nivel, t) => node('span', { nivel, texto: t }),
    estado: { carregando: (r, t) => r.replaceChildren(node('p', { texto: t })), erro: (r) => r.replaceChildren(node('p', { texto: 'Falha com recibo e atualização' })) },
    api: async (url) => { calls.push(['GET', url]); if (erro) throw Error('falha'); return { dados: { pedidos, remoto: { status: 'ausente' }, ...extra } }; },
    confirmar: async () => confirmado,
    acao: async (url, corpo) => { calls.push(['POST', url, corpo]); if (resolver) return new Promise((r) => { resolver = r; }); },
    aviso: (t, tipo) => avisos.push([t, tipo]),
  };
  const logs = [], root = node('main'), sandbox = { root, ctx, console: { warn: (...a) => logs.push(a) } };
  vm.runInNewContext(source, sandbox);
  // Como a Aprovacao monta: resumo no topo + secao dos ajustes no detalhe da peca (onde moram as acoes).
  const render = async () => {
    root.replaceChildren(); const lista = await vm.runInNewContext('montarFila(root,ctx)', sandbox);
    if (Array.isArray(lista)) { Object.assign(sandbox, { lista, idDaPeca: 'a'.repeat(16) }); const sec = vm.runInNewContext('secaoAjustesDaPeca(ctx, lista, idDaPeca)', sandbox); if (sec) root.appendChild(sec); }
    return text(root);
  };
  assert.ok((await render()).includes('Nenhum pedido'));
  assert.ok(text(root).includes('Nenhum pedido de ajuste.') && walk(root).every((n) => n.tag !== 'details'), 'sem pedidos: uma linha, sem lista');
  const base = { id: 'pedido-ficticio', pecaTitulo: 'Reel de teste', pecaId: 'a'.repeat(16), versaoAlvo: 'a'.repeat(40), versaoCorrigida: 'b'.repeat(40), commit: 'c'.repeat(40), tentativas: 1, criadoEm: '2026-10-08T10:00:00-03:00', textoOriginal: 'CANARIO_PRIVADO_NAO_LOGAR' };
  for (const estado of ['novo', 'em-correcao', 'corrigido-aguardando-aceite', 'aceito', 'falha-de-envio', 'aguardando-aprovacao-de-custo', 'desatualizado', 'precisa-de-atencao', 'desconhecido']) {
    pedidos.splice(0, pedidos.length, { ...base, estado });
    const t = await render(); assert.ok(t.includes('Reel de teste · ') && t.includes('Pedido pedido-f'), 'lista pelo nome da peca, id curto'); assert.ok(!t.includes('pedido-ficticio') && !t.includes('a'.repeat(40)) && !t.includes('b'.repeat(40)) && !t.includes('c'.repeat(40)), 'nem id nem SHA inteiros ao autor'); assert.equal(t.includes(base.textoOriginal), false);
    assert.equal(walk(root).filter((n) => n.tag === 'button').length, ['corrigido-aguardando-aceite', 'falha-de-envio', 'precisa-de-atencao'].includes(estado) ? 1 : 0);
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
  assert.ok(tela.includes('Recebido, aguardando entrega') && tela.includes('tentativas 0'), 'pedido fica recebido, sem gastar tentativa');
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
  // Topo da Aprovacao: UMA linha, que nao cresce com a quantidade; ordem estavel, mais recente primeiro.
  extra = { vigia: { ativo: false, ultimoBatimento: null } };
  for (const n of [1, 4, 12]) {
    pedidos.splice(0, pedidos.length, ...Array.from({ length: n }, (_, i) => ({ ...base, id: 'p' + String(i).padStart(2, '0') + 'xxxxxx', estado: i % 2 ? 'falha-de-envio' : 'novo', criadoEm: '2026-10-08T' + String(10 + i).padStart(2, '0') + ':00:00-03:00' })));
    await render(); const secao = root.children[0];
    assert.equal(secao.children.filter((x) => x.tag === 'details').length, 1, 'uma lista recolhida, com ' + n + ' pedidos');
    assert.ok(secao.children.some((x) => x.attrs?.['aria-live'] === 'polite' && text(x).includes('Ponte remota ausente')), 'aviso de ponte visível fora da lista recolhida');
    const det = walk(secao).find((x) => x.tag === 'details'); assert.ok(det && !det.attrs.open, 'lista recolhida por padrao');
    const resumo = walk(secao).find((x) => x.attrs?.class === 'pedidos-texto').attrs.texto;
    assert.ok(resumo.startsWith(n + (n === 1 ? ' pedido de ajuste' : ' pedidos de ajuste')), resumo);
    assert.ok(walk(secao).some((x) => x.attrs?.texto === 'Entrega parada'), 'um aviso curto, para o autor');
    assert.equal(walk(secao).filter((x) => x.attrs?.tipo === 'atencao').length, 0, 'sem blocos amarelos no topo');
    const ids = walk(secao).filter((x) => x.attrs?.class === 'campo-ajuda mono quebra').map((x) => x.attrs.texto.slice(7, 10));
    assert.deepEqual([...ids], [...ids].sort().reverse(), 'mais recente primeiro');
  }
  const ant = text(root); await render(); assert.equal(text(root), ant, 'recarregar nao muda a ordem nem o conteudo');
  const cmd = walk(root).find((x) => x.attrs?.class === 'pedidos-tecnico'); assert.ok(cmd && !cmd.attrs.open && text(cmd).includes('vigia-ajustes.cjs'), 'comando do vigia dentro de Detalhes recolhido');
  extra = {};
  // Relógio e timers controlados: GET real da UI, sem rede, fila ou conta real.
  const agora = Date.parse('2026-10-09T18:00:00Z');
  class Relogio extends Date { static now() { return agora; } }
  const timers = [], gets = [], raizPolling = node('main');
  let obsoleta = false, falharGet = false, getPendente = null;
  const privado = 'CANARIO_ERRO_BRUTO_NUNCA_EXIBIR';
  let dados = {
    pedidos: [{ ...base, estado: 'em-correcao', espelho: { estado: 'falha', codigo: 'remoto-estado-recusado', em: '2026-10-09T17:59:00Z' }, evidencia: privado, lease: { id: privado } }],
    remoto: { status: 'ativo', ultimaSync: null, ultimoErro: null },
  };
  const contextoPolling = {
    ...ctx, obsoleta: () => obsoleta,
    api: async (url) => {
      gets.push(url);
      if (getPendente) await new Promise((resolve) => { getPendente = resolve; });
      if (falharGet) throw new Error(privado);
      return { dados };
    },
  };
  const ambientePolling = { ctx: contextoPolling, root: raizPolling, Date: Relogio, setTimeout: (fn, ms) => { assert.equal(ms, 15000); timers.push(fn); } };
  vm.runInNewContext(source, ambientePolling);
  const listaPolling = await vm.runInNewContext('montarFila(root,ctx)', ambientePolling);
  Object.assign(ambientePolling, { listaPolling, pecaId: base.pecaId });
  const detalhePolling = vm.runInNewContext('secaoAjustesDaPeca(ctx,listaPolling,pecaId)', ambientePolling);
  raizPolling.appendChild(detalhePolling);
  const avisoVisivel = () => text(raizPolling.children[0].children.find((x) => x.attrs?.['aria-live'] === 'polite'));
  assert.ok(avisoVisivel().includes('configurada ativa; sincronização recente não confirmada'));
  assert.ok(!avisoVisivel().includes('ausente') && !avisoVisivel().includes('inativa'), 'configuração ativa não vira ponte desligada');
  assert.ok(avisoVisivel().includes('não suporta o estado'), 'recusa visível sem abrir lista');
  assert.ok(text(detalhePolling).includes('Em correção') && text(detalhePolling).includes('não suporta este estado'));
  assert.ok(text(detalhePolling).includes('formatado 2026-10-09T17:59:00Z'), 'momento seguro do recibo');
  assert.equal(timers.length, 1);
  // Reiniciar a tela usa o mesmo recibo persistido, não ultimoErro global.
  const raizReaberta = node('main'); ambientePolling.reaberta = raizReaberta;
  await vm.runInNewContext('montarFila(reaberta,ctx)', ambientePolling);
  assert.ok(text(raizReaberta).includes('não suporta o estado'));
  timers.pop(); // timer da segunda montagem; exercitamos só a primeira abaixo.
  // Nova ação local e ciclo de GET não apagam o recibo de falha.
  dados = { ...dados, pedidos: [{ ...dados.pedidos[0], estado: 'aceito' }] };
  await timers.shift()();
  assert.ok(text(detalhePolling).includes('Aceito nesta versão') && text(detalhePolling).includes('não suporta este estado'));
  falharGet = true;
  await timers.shift()();
  await timers.shift()();
  assert.ok(avisoVisivel().includes('não suporta o estado') && avisoVisivel().includes('Não foi possível atualizar'));
  assert.equal((avisoVisivel().match(/Não foi possível atualizar/g) || []).length, 1, 'erro de GET não empilha avisos');
  assert.ok(text(detalhePolling).includes('Aceito nesta versão'), 'GET falho conserva estado local');
  falharGet = false;
  dados = { ...dados, remoto: { status: 'ausente' }, pedidos: [{ ...dados.pedidos[0], espelho: { estado: 'indisponivel', codigo: 'ponte-ausente', em: null } }] };
  await timers.shift()();
  assert.ok(avisoVisivel().includes('Ponte remota ausente') && text(detalhePolling).includes('Ponte remota indisponível'));
  for (const status of ['inativo', undefined]) {
    dados = { ...dados, remoto: { status } }; await timers.shift()();
    assert.ok(avisoVisivel().includes('inativa ou não confirmada'));
  }
  dados = { ...dados, remoto: { status: 'ativo', ultimaSync: '2026-10-09T17:00:00Z' } };
  await timers.shift()();
  assert.ok(avisoVisivel().includes('configurada ativa; sincronização recente não confirmada'), 'carimbo antigo não confirma saúde');
  dados = { ...dados, pedidos: [{ ...dados.pedidos[0], espelho: { estado: 'pendente', codigo: null, em: null } }] };
  await timers.shift()();
  assert.ok(text(detalhePolling).includes('espelhamento pendente'));
  dados = { ...dados, pedidos: [{ ...dados.pedidos[0], espelho: { estado: 'falha', codigo: privado, em: privado } }] };
  await timers.shift()();
  assert.ok(text(detalhePolling).includes('não confirmou a mudança'));
  assert.equal(JSON.stringify(raizPolling).includes(privado), false, 'nenhum código/erro bruto/evidência/lease no aviso');
  assert.equal(JSON.stringify(raizPolling).includes(base.textoOriginal), false);
  dados = { ...dados, remoto: { status: 'ativo', ultimaSync: '2026-10-09T18:00:00Z' }, pedidos: [{ ...dados.pedidos[0], espelho: { estado: 'sincronizado', codigo: null, em: '2026-10-09T18:00:00Z' } }] };
  await timers.shift()();
  assert.ok(!text(raizPolling).includes('não suporta') && !text(raizPolling).includes('espelhamento pendente'));
  assert.ok(!avisoVisivel().includes('não confirmada'), 'sucesso atual limpa aviso');
  assert.ok(text(detalhePolling).includes('Aceito nesta versão'), 'sucesso remoto não troca estado local');
  // Falha global de importação não pode sumir por carimbo recente ou lista vazia.
  dados = { pedidos: [], remoto: { status: 'ativo', ultimaSync: '2026-10-09T17:59:30Z', ultimoErro: 'remoto-sem-resposta' } };
  await timers.shift()();
  assert.ok(avisoVisivel().includes('Falha na importação remota'), 'ultimoErro prevalece sobre ultimaSync recente sem pedidos pendentes');
  assert.ok(avisoVisivel().includes('fila local continua disponível') && avisoVisivel().includes('sincronização não confirmada'));
  assert.ok(text(raizPolling).includes('Nenhum pedido de ajuste.'));
  assert.equal(JSON.stringify(raizPolling).includes(privado), false, 'erro global bruto não chega ao aviso');
  await timers.shift()();
  assert.ok(avisoVisivel().includes('Falha na importação remota'), 'aviso global persiste no polling');
  dados = { ...dados, pedidos: [{ ...base, estado: 'aceito', espelho: { estado: 'sincronizado', codigo: null, em: '2026-10-09T17:59:30Z' } }] };
  await timers.shift()();
  assert.ok(avisoVisivel().includes('Falha na importação remota'), 'ultimoErro global aparece mesmo com todos os pedidos sincronizados');
  assert.ok(!avisoVisivel().includes('pedido sem confirmação'), 'falha global não inventa falha por pedido');
  assert.equal(text(raizPolling).includes('remoto-sem-resposta'), false, 'código seguro vira mensagem fixa');
  dados = { ...dados, remoto: { ...dados.remoto, ultimoErro: privado } };
  await timers.shift()();
  assert.ok(avisoVisivel().includes('Falha na importação remota'));
  assert.equal(JSON.stringify(raizPolling).includes(privado), false, 'valor inesperado do erro global nunca é exibido');
  dados = { ...dados, remoto: { ...dados.remoto, ultimoErro: null } };
  await timers.shift()();
  assert.ok(!avisoVisivel().includes('Falha na importação remota'), 'recibo global limpo remove o aviso');
  // Polling serial: nenhuma nova chamada enquanto GET anterior está pendente.
  getPendente = true; const antes = gets.length;
  const ciclo = timers.shift()(); await Promise.resolve();
  assert.equal(gets.length, antes + 1); assert.equal(timers.length, 0);
  getPendente(); getPendente = null; await ciclo; assert.equal(timers.length, 1);
  obsoleta = true; await timers.shift()();
  assert.equal(timers.length, 0); assert.equal(gets.length, antes + 1, 'tela obsoleta para polling');
  assert.ok(gets.every((url) => url === '/api/marketing/ajustes'));
  assert.equal(walk(raizPolling).some((x) => /autorizar.*custo/i.test(x.attrs?.texto || '')), false);
  // Encerrar: motivo aparado, 1–500 pontos de código Unicode, sem truncar,
  // sem texto anterior e confirmação estritamente booleana após o clique.
  const postsEncerrar = [], formulariosEncerrar = [], confirmacoesEncerrar = [];
  let valoresEncerrar = null, respostaConfirmacao = true;
  const contextoEncerrar = {
    ...ctx, obsoleta: () => false,
    formulario: async (opcoes) => { formulariosEncerrar.push(opcoes); return valoresEncerrar; },
    confirmar: async (opcoes) => { confirmacoesEncerrar.push(opcoes); return respostaConfirmacao; },
    acao: async (url, body) => { postsEncerrar.push({ url, body }); return { dados: { gravadoLocalmente: true, espelhamentoPendente: true } }; },
    recarregar: () => {},
  };
  Object.assign(sandbox, { contextoEncerrar, pedidoEncerrar: { ...base, estado: 'precisa-de-atencao' } });
  const encerrar = async () => {
    sandbox.botaoEncerrar = { disabled: false };
    await vm.runInNewContext('agir(contextoEncerrar,pedidoEncerrar,"encerrar",botaoEncerrar)', sandbox);
    assert.equal(sandbox.botaoEncerrar.disabled, false);
  };
  for (const motivo of ['', '   ', 'x'.repeat(501), '😀'.repeat(501), 123, undefined]) {
    valoresEncerrar = { motivo }; await encerrar();
    assert.equal(postsEncerrar.length, 0); assert.equal(confirmacoesEncerrar.length, 0, 'motivo inválido não avança à confirmação');
  }
  valoresEncerrar = null; await encerrar(); assert.equal(postsEncerrar.length, 0, 'cancelar formulário não encerra');
  for (const resposta of [false, undefined, null, 'true', 1]) {
    valoresEncerrar = { motivo: 'Motivo novo' }; respostaConfirmacao = resposta; await encerrar();
    assert.equal(postsEncerrar.length, 0, 'somente boolean true confirma');
  }
  respostaConfirmacao = true;
  for (const motivo of [' x ', 'x'.repeat(500), ' 😀'.repeat(250) + ' ']) {
    valoresEncerrar = { motivo }; await encerrar();
    const post = postsEncerrar.at(-1);
    assert.equal(post.url, '/api/marketing/ajustes/encerrar');
    assert.equal(post.body.motivo, motivo.trim()); assert.equal(post.body.confirmacao, true); assert.equal(post.body.pedidoId, base.id);
  }
  valoresEncerrar = { motivo: '😀'.repeat(500) }; await encerrar();
  assert.equal(postsEncerrar.at(-1).body.motivo, '😀'.repeat(500), '500 caracteres fora do BMP aceitos sem truncamento');
  assert.equal(postsEncerrar.length, 4);
  assert.equal(JSON.stringify([formulariosEncerrar, confirmacoesEncerrar, postsEncerrar]).includes(base.textoOriginal), false);
  assert.ok(formulariosEncerrar[0].campos[0].ajuda.includes('500'));
  assert.ok(!avisos.at(-1)[0].includes('entregue') && avisos.at(-1)[0].includes('localmente'));
  console.log('admin-ajustes-tela: Encerrar motivo aparado 1–500 Unicode, confirmação true estrita após diálogo, cancelamentos e zero texto original: OK');
  console.log('admin-ajustes-tela: espelho por pedido persistente, ponte ativa sem saúde inferida, polling serial, GET falho conserva recibos, sucesso limpa e tela obsoleta encerra: OK');
  console.log('admin-ajustes-tela: módulos UI reais, 9 estados, recibos, cancelamento, aceite exato, retry, clique duplo, falha/tardio e texto privado fora de ações/logs OK');
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
