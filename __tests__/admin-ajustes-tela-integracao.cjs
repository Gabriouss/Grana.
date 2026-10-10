const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pedidoPublico } = require('../tools/admin-local/marketing/ajustes-dto.cjs');
const n = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter(Boolean), appendChild(x) { this.children.push(x); }, replaceChildren(...x) { this.children=x; }, get firstChild() { return this.children[0]; }, removeChild(x) { this.children.splice(this.children.indexOf(x), 1); }, setAttribute(k, v) { this.attrs[k] = v; } });
const walk = (x) => [x,...(x.children||[]).flatMap(walk)];
const texto = (x) => walk(x).map((y) => y.attrs?.texto || '').join(' ');
// Carrega o módulo real da tela num escopo próprio, como um ES module, e publica só o que ele exporta.
// Os imports resolvem pelos exports reais carregados antes: nenhum dublê de _pecas.js nem de ajustes.js.
function carregarModulo(arquivo, sandbox) {
  const fonte = fs.readFileSync('tools/admin-local/web/telas/' + arquivo, 'utf8');
  const nomes = [...fonte.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]);
  const corpo = fonte.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInNewContext('(function(){' + corpo + '\n;Object.assign(globalThis,{' + nomes.join(',') + '});})()', sandbox);
}
(async () => {
  const canario = 'CREDENCIAL_FICTICIA_NUNCA_TRANSPORTAR';
  const raw={id:'12345678-1234-4234-8234-1234567890ab',pecaId:'1234567890abcdef',estado:'corrigido-aguardando-aceite',tentativas:1,versaoAlvo:'a'.repeat(40),versaoCorrigida:'b'.repeat(40),commit:'c'.repeat(40),criadoEm:'2026-10-08T10:00:00Z',textoOriginal:canario,segredoFuturo:canario,lease:{id:canario,agente:'Beacon',expiraEm:'2026-10-08T11:00:00Z'}};
  const dto=pedidoPublico(raw); assert.equal(JSON.stringify(dto).includes(canario),false);
  const root=n('main'),calls=[];
  const ctx={h:n,obsoleta:()=>false,recarregar:()=>{},formatar:{dataHora:(v)=>v},alerta:(_tipo,t)=>n('p',{texto:t}),selo:(_n,t)=>n('span',{texto:t}),estado:{carregando:()=>{},erro:()=>assert.fail('DTO real deve renderizar')},api:async()=>({dados:{pedidos:[dto],remoto:{status:'ativo'}}}),confirmar:async()=>true,acao:async(url,body)=>calls.push({url,body}),aviso:()=>{}};
  const sandbox={ctx,root};vm.runInNewContext(fs.readFileSync('tools/admin-local/web/telas/ajustes.js','utf8').replace(/export (async )?function /g,'$1function '),sandbox);
  const pedidos=await vm.runInNewContext('montarFila(root,ctx)',sandbox);
  Object.assign(sandbox,{pedidos,pecaId:raw.pecaId});
  root.appendChild(vm.runInNewContext('secaoAjustesDaPeca(ctx,pedidos,pecaId)',sandbox));
  assert.equal(JSON.stringify(root).includes(canario),false);
  const botao=walk(root).find((x)=>x.attrs?.texto==='Aceitar versão corrigida');assert(botao);await botao.attrs.onclick();
  assert.equal(calls.length,1);assert.equal(calls[0].body.versao,raw.versaoCorrigida);assert.equal(calls[0].body.pedidoId,raw.id);
  assert.equal(JSON.stringify(calls).includes(canario),false);
  // Aprovação real: o atalho reaproveita o formulário, com a versão do recibo
  // e texto novo explícito. Nenhuma leitura da fila pessoal ou POST real.
  async function montarAprovacao(pedido, respostaFormulario = { motivo: 'Ajuste novo fictício' }, pecas, familias) {
    const raiz = n('main'), chamadas = [], formularios = [], navegacoes = [];
    const peca = { id: raw.pecaId, versao: 'd'.repeat(40), estado: 'para-aprovacao', tipo: 'imagem', titulo: 'Peça AUDIT', caminho: 'AUDIT.png', semana: { inicio: '2026-10-08' } };
    const contexto = {
      ...ctx, params: {}, cabecalho: () => {}, midia: () => n('img'),
      api: async (url) => ({ dados: url.endsWith('/pecas') ? { pecas: pecas || [peca], familias } : { pedidos: pedido ? [pedido] : [], remoto: { status: 'ativo' } } }),
      formulario: async (opcoes) => { formularios.push(opcoes); return respostaFormulario; },
      acao: async (url, body) => { chamadas.push({ url, body }); return { dados: {} }; },
      navegar: (url) => navegacoes.push(url),
    };
    // Módulos reais, na ordem dos imports: _pecas.js, ajustes.js e aprovacao.js.
    const tela = { ctx: contexto, root: raiz, console: { warn() {} } };
    for (const m of ['_pecas.js', 'ajustes.js', 'aprovacao.js']) carregarModulo(m, tela);
    await vm.runInNewContext('montar(root,ctx)', tela);
    assert.equal(JSON.stringify(raiz).includes(canario), false);
    assert.equal(walk(raiz).some((x) => /autorizar.*custo/i.test(x.attrs?.texto || '')), false);
    return { raiz, chamadas, formularios, navegacoes };
  }
  for (const estado of ['desatualizado', 'em-correcao']) {
    const pedido = { ...dto, estado, versaoAtual: 'd'.repeat(40), textoOriginal: canario };
    const tela = await montarAprovacao(pedido);
    const atalho = walk(tela.raiz).find((x) => x.attrs?.texto === 'Pedir ajuste na versão atual');
    assert(atalho, 'versão atual divergente deve oferecer novo pedido');
    assert.equal(tela.chamadas.length, 0, 'renderizar não envia pedido');
    await atalho.attrs.onclick();
    assert.equal(tela.formularios.length, 1);
    assert.equal(tela.formularios[0].titulo, 'Pedir ajuste');
    assert.equal(JSON.stringify(tela.formularios).includes(canario), false);
    assert.equal(tela.chamadas.length, 1);
    assert.equal(tela.chamadas[0].url, `/api/marketing/pecas/${raw.pecaId}/ajuste`);
    assert.deepEqual(JSON.parse(JSON.stringify(tela.chamadas[0].body)), { versao: 'd'.repeat(40), motivo: 'Ajuste novo fictício' });
    assert.equal(tela.navegacoes.length, 1);
  }
  for (const versaoAtual of [undefined, null, '', 'hash-invalido', 123, 'a'.repeat(40)]) {
    const tela = await montarAprovacao({ ...dto, estado: 'em-correcao', versaoAtual });
    assert.equal(walk(tela.raiz).some((x) => x.attrs?.texto === 'Pedir ajuste na versão atual'), false);
    assert.equal(tela.chamadas.length, 0);
  }
  const cancelada = await montarAprovacao({ ...dto, estado: 'desatualizado', versaoAtual: 'd'.repeat(40) }, null);
  await walk(cancelada.raiz).find((x) => x.attrs?.texto === 'Pedir ajuste na versão atual').attrs.onclick();
  assert.equal(cancelada.chamadas.length, 0, 'cancelar formulário não envia pedido');
  const custo = await montarAprovacao({ ...dto, estado: 'aguardando-aprovacao-de-custo' });
  assert.equal(custo.chamadas.length, 0);
  // Fase 2, mesa de demandas: cada demanda em exatamente uma seção, na ordem de quem age.
  assert.ok(texto(custo.raiz).includes('Precisa de você (1)') && texto(custo.raiz).includes('Com os agentes (0)') && texto(custo.raiz).includes('Responda sobre o custo pela conversa.'));
  for (const estado of ['novo', 'em-correcao', 'falha-de-envio']) {
    const t = texto((await montarAprovacao({ ...dto, estado })).raiz);
    assert.ok(t.includes('Precisa de você (0)') && t.includes('Com os agentes (1)') && t.includes('Resolvidas (0)'), estado);
  }
  // Famílias do servidor: variantes do mesmo reel viram UMA linha, com a irmã em "Alternativas" e a capa fora dela.
  const semana = { numero: 39, inicio: '2026-09-21', fim: '2026-09-27' };
  const dir = 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27/para-aprovacao/pecas/';
  const variante = (letra, nome, extra = {}) => ({ id: letra.repeat(16), versao: letra.repeat(40), estado: 'para-aprovacao', tipo: 'video', nome, caminho: dir + nome, semana, arquivos: [], ...extra });
  const sem = variante('a', 'reel-audit-v2.mp4'), narrado = variante('b', 'reel-audit-v2-narrado.mp4');
  const capa = variante('c', 'reel-audit-v2-capa.png', { tipo: 'imagem', capaDe: sem.id }), outra = variante('d', 'outro-audit.png', { tipo: 'imagem' });
  const acervo = [sem, narrado, capa, outra];
  const familias = [{ id: 'f1', chave: 'familia-reel-audit', principal: sem, alternativas: [narrado], capas: [capa] }, { id: 'f2', chave: 'familia-outro', principal: outra, alternativas: [], capas: [] }];
  const mesa = await montarAprovacao(null, null, acervo, familias);
  assert.equal(walk(mesa.raiz).filter((x) => x.attrs?.class === 'demanda-familia').length, 2, 'quatro arquivos, duas famílias, duas linhas');
  assert.ok(walk(mesa.raiz).some((x) => x.textContent === '2 famílias com esses filtros'));
  const alternativas = walk(mesa.raiz).find((x) => x.attrs?.['aria-label'] === 'Alternativas da família');
  assert.deepEqual(walk(alternativas).filter((x) => x.tag === 'button').map((x) => x.attrs.texto), ['reel-audit-v2-narrado.mp4'], 'irmã narrada em Alternativas; capa fora dela');
  // Recusar: motivo obrigatório, sucessora só da mesma família, confirmação explícita e POST com a versão exata.
  const recusa = await montarAprovacao(null, { motivo: '  Motivo AUDIT  ', sucessora: narrado.id }, acervo, familias);
  const botaoRecusar = walk(recusa.raiz).find((x) => x.attrs?.texto === 'Recusar peça');
  assert.equal(botaoRecusar.attrs.disabled, false, 'sem pedido aberto e com a fila conferida, a recusa fica disponível');
  await botaoRecusar.attrs.onclick();
  assert.deepEqual(Array.from(recusa.formularios[0].campos[1].opcoes, (o) => o.valor),['', narrado.id, capa.id], 'sucessoras: só as outras peças da mesma família');
  assert.equal(recusa.chamadas.length, 1);
  assert.equal(recusa.chamadas[0].url, '/api/marketing/pecas/' + sem.id + '/recusar');
  assert.deepEqual(JSON.parse(JSON.stringify(recusa.chamadas[0].body)), { versao: sem.versao, motivo: 'Motivo AUDIT', confirmacao: true, sucessora: narrado.id });
  for (const [resposta, caso] of [[null, 'cancelar o formulário'], [{ motivo: '   ' }, 'motivo vazio'], [{ motivo: 'x'.repeat(501) }, 'motivo acima de 500'], [{ motivo: 'Motivo AUDIT', sucessora: outra.id }, 'sucessora de outra família']]) {
    const t = await montarAprovacao(null, resposta, acervo, familias);
    await walk(t.raiz).find((x) => x.attrs?.texto === 'Recusar peça').attrs.onclick();
    assert.equal(t.chamadas.length, 0, caso + ' não recusa');
  }
  const aberta = await montarAprovacao({ ...dto, pecaId: sem.id, estado: 'em-correcao' }, { motivo: 'Motivo AUDIT' }, acervo, familias);
  const bloqueado = walk(aberta.raiz).find((x) => x.attrs?.texto === 'Recusar peça');
  assert.equal(bloqueado.attrs.disabled, true, 'pedido aberto bloqueia a recusa');
  await bloqueado.attrs.onclick(); assert.equal(aberta.chamadas.length, 0);
  console.log('admin-ajustes-tela-integracao: Fase 2 com módulos reais, três seções, famílias do servidor, alternativas e recusa com versão exata: OK');
  console.log('admin-ajustes-tela-integracao: DTO fechado real + UI real + aceite explícito da versão, zero credencial/texto privado/POST real');
  console.log('admin-ajustes-tela-integracao: atalho versão atual + formulário existente + hash correto + cancelamento + sem texto original/autorização de custo: OK');
})().catch((e)=>{console.error(e.message);process.exitCode=1;});
