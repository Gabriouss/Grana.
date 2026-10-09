const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { pedidoPublico } = require('../tools/admin-local/marketing/ajustes-dto.cjs');
const n = (tag, attrs = {}, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter(Boolean), appendChild(x) { this.children.push(x); }, replaceChildren(...x) { this.children=x; }, get firstChild() { return this.children[0]; }, removeChild(x) { this.children.splice(this.children.indexOf(x), 1); }, setAttribute(k, v) { this.attrs[k] = v; } });
const walk = (x) => [x,...(x.children||[]).flatMap(walk)];
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
  const fonteAprovacao = fs.readFileSync('tools/admin-local/web/telas/aprovacao.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export (async )?function /g, '$1function ');
  const fonteAjustes = fs.readFileSync('tools/admin-local/web/telas/ajustes.js', 'utf8')
    .replace(/export (async )?function /g, '$1function ');
  async function montarAprovacao(pedido, respostaFormulario = { motivo: 'Ajuste novo fictício' }) {
    const raiz = n('main'), chamadas = [], formularios = [], navegacoes = [];
    const peca = { id: raw.pecaId, versao: 'd'.repeat(40), estado: 'para-aprovacao', tipo: 'imagem', titulo: 'Peça AUDIT', caminho: 'AUDIT.png', semana: { inicio: '2026-10-08' } };
    const contexto = {
      ...ctx, params: {}, cabecalho: () => {}, midia: () => n('img'),
      api: async (url) => ({ dados: url.endsWith('/pecas') ? { pecas: [peca] } : { pedidos: [pedido], remoto: { status: 'ativo' } } }),
      formulario: async (opcoes) => { formularios.push(opcoes); return respostaFormulario; },
      acao: async (url, body) => { chamadas.push({ url, body }); return { dados: {} }; },
      navegar: (url) => navegacoes.push(url),
    };
    const ajustes = {};
    vm.runInNewContext(fonteAjustes, ajustes);
    const tela = {
      ...ajustes, ctx: contexto, root: raiz,
      tituloPeca: (p) => p.titulo, rotuloSemana: () => 'Semana AUDIT',
      rotuloEstado: () => 'Esperando', trilha: () => n('div'),
    };
    vm.runInNewContext(fonteAprovacao, tela);
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
  console.log('admin-ajustes-tela-integracao: DTO fechado real + UI real + aceite explícito da versão, zero credencial/texto privado/POST real');
  console.log('admin-ajustes-tela-integracao: atalho versão atual + formulário existente + hash correto + cancelamento + sem texto original/autorização de custo: OK');
})().catch((e)=>{console.error(e.message);process.exitCode=1;});
