const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('tools/admin-local/web/telas/calendario.js', 'utf8').replace(/^import .*\r?\n/m, '').replace(/export (async )?function /g, '$1function ');
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean) });
const text = (n) => n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(text)].join(' ') : String(n);
const ctx = { h: node, alerta: (tipo, texto) => node('p', { tipo, texto }), formatar: { data: (s) => s.split('-').reverse().join('/'), dataHora: (s) => `data formatada ${s.slice(0, 10)}` } };
const sandbox = { ctx, rotuloCanal: (s) => s || 'sem canal', console };
vm.runInNewContext(source, sandbox);
function render(previsao) { sandbox.previsao = previsao; return text(vm.runInNewContext('detalhesCronograma(ctx,previsao)', sandbox)); }
// F4-1: o texto visível sem abrir "Referências para os agentes" (details) não traz id, versão nem código interno.
const semDetails = (n) => n == null ? '' : typeof n === 'object' ? (n.tag === 'details' ? '' : [n.attrs?.texto || '', ...(n.children || []).map(semDetails)].join(' ')) : String(n);
function visivel(previsao) { sandbox.previsao = previsao; return semDetails(vm.runInNewContext('detalhesCronograma(ctx,previsao)', sandbox)); }
assert.equal(render(null), '');
const origem = { manifestoId: 'campanha-grana', itemId: 'reels-widget-padaria', manifestoVersao: 2 };
const previsto = { origem, dataPrevista: { modo: 'diaD', diasUteis: 4, hora: '19:00', canal: 'reels' }, estado: 'aguardando-dia-d' };
let t = render(previsto);
assert.ok(t.includes('D+4 dias úteis às 19:00'));
assert.ok(t.includes('Aguardando dia D'));
const comMotivoEstado = render({ ...previsto, estadoCronograma: 'aguardando dia D', motivo: 'aguardando dia D', proximoPasso: 'Defina o Dia D para resolver a previsão desta peça.' });
assert.ok(comMotivoEstado.includes('Aguardando dia D. A data sai quando o dia D for marcado.'), 'motivo identico ao estado nao suprime rotulo explicativo');
assert.ok(comMotivoEstado.includes('Defina o Dia D para resolver a previsão desta peça.'));
assert.ok(t.includes('reels-widget-padaria'));
assert.equal(/\d{2}\/\d{2}\/\d{4}/.test(t), false, 'não inventa data absoluta');
t = render({ ...previsto, estado: 'planejado', dataPrevista: { ...previsto.dataPrevista, dataResolvida: '2026-10-15' }, substituicaoManual: { data: '2026-10-16', hora: '20:00', canal: 'stories' }, recibo: { tipo: 'aceite-autor', versaoPeca: 'versao-ficticia', aprovadoEm: '2026-10-07T10:31:32-03:00', evidencia: 'aceite fictício no painel' } });
assert.ok(t.includes('15/10/2026'));
assert.ok(t.includes('Data alterada pelo autor: 16/10/2026 às 20:00'));
assert.ok(t.includes('previsão de origem foi preservada'));
assert.ok(t.includes('Recibo do aceite: seu aceite no painel'));
assert.equal(t.includes('versao-ficticia'), false, 'F4-1: sem versão no texto, nem recolhida');
assert.ok(t.includes('data formatada 2026-10-07'));
assert.ok(t.includes('aceite fictício no painel'));
assert.ok(t.includes('Não comprova publicação na Meta'));
t = render({ origem, recibos: [{ id: 'recibo-ficticio-entrada', tipo: 'entrada-automatica', em: '2026-10-08T19:00:00-03:00', estado: 'aguardando dia D' }, { acao: 'substituicao-manual', em: '2026-10-09T10:00:00-03:00' }] });
assert.ok(t.includes('Recibo do calendário: entrada-automatica'));
assert.equal(t.includes('recibo-ficticio-entrada'), false, 'F4-1: sem id do recibo no texto, nem recolhido');
{
  const v = visivel({ origem, recibos: [{ id: 'recibo-ficticio-entrada', tipo: 'entrada-automatica', em: '2026-10-08T19:00:00-03:00', estado: 'aguardando dia D' }] });
  assert.ok(v.includes('Recibo do calendário: entrada-automatica'));
  assert.equal(v.includes('recibo-ficticio-entrada'), false, 'id do recibo fora do texto visível (F4-1)');
  const a = visivel({ ...previsto, recibo: { tipo: 'aceite-autor', versaoPeca: 'versao-ficticia', aprovadoEm: '2026-10-07T10:31:32-03:00' } });
  assert.ok(a.includes('Recibo do aceite: seu aceite no painel'));
  assert.equal(a.includes('versao-ficticia') || a.includes('aceite-autor'), false, 'versão e código interno fora do texto visível (F4-1)');
}
assert.ok(t.includes('substituicao-manual'));
assert.equal(t.includes('Recibo do aceite'), false, 'evento operacional não é aceite');
t = render({ dataPrevista: { modo: 'absoluta', data: '2026-10-12', hora: '09:00', canal: 'instagram-feed' }, estado: 'data-passada', avisos: ['Feriado explicitamente registrado no manifesto.'] });
assert.ok(t.includes('12/10/2026 às 09:00'));
assert.ok(t.includes('Nada será publicado imediatamente'));
assert.ok(t.includes('Feriado explicitamente registrado'));
for (const estado of ['sem-data-no-cronograma', 'vinculo-invalido', 'vinculo-pendente', 'duplicado', 'desatualizado']) {
 assert.ok(render({ estado }).length > 60, estado);
}
t = render({ origem: { ...origem, itemId: '<script>fixture</script>' } });
assert.ok(t.includes('<script>fixture</script>')); // literal por textContent no h real
assert.equal(source.includes('innerHTML'), false);
assert.ok(render({ ...previsto, dataPrevista: { ...previsto.dataPrevista, diasUteis: 1 } }).includes('D+1 dia útil'));
assert.equal(render({ origem: {} }).includes('undefined'), false);
assert.ok(render({ estado: 'estado-novo' }).includes('Estado do cronograma: estado-novo'));
assert.ok(render({ estado: 'estado-novo', estadoCronograma: 'aguardando dia D', motivo: 'aguardando dia D' }).includes('Estado do cronograma: estado-novo'), 'estado da entrada desconhecido nao fica oculto pelo resumo antigo');
for (const estadoCronograma of ['vinculo-invalido', 'duplicado', 'desatualizado']) {
 const r={estado:'aprovados',estadoCronograma,motivo:'Motivo publico do servidor',proximoPasso:'Atualize a lista e confira o item.'};
 const antes=JSON.stringify(r), texto=render(r);
 assert(texto.includes(r.motivo) && texto.includes(r.proximoPasso));
 assert(!texto.includes('Estado do cronograma: aprovados'));assert.equal(JSON.stringify(r),antes);
}
assert.ok(render({ dataPrevista: { modo: 'diaD' }, recibos: [null] }).includes('Posição relativa não informada'));
console.log('admin-calendario-cronograma-tela: previsão absoluta/relativa, sem D, origem, data manual, recibo, passado e estados pendentes OK');

// Interações reais da UI com backend real, exclusivamente numa semana AUDIT temporária.
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
function elemento(tag, attrs = {}, ...children) {
 return { tag, attrs, children: children.flat(Infinity).filter(Boolean), disabled: !!attrs.disabled,
  get textContent() { return this.attrs.texto || ''; }, set textContent(v) { this.attrs.texto = v; },
  appendChild(v) { if (v) this.children.push(v); return v; }, replaceChildren(...v) { this.children = v.flat(Infinity).filter(Boolean); },
  get firstChild() { return this.children[0]; }, removeChild(v) { this.children = this.children.filter((c) => c !== v); },
  addEventListener() {}, setAttribute(k,v) { this.attrs[k]=v; }, getAttribute(k) { return this.attrs[k]; },
  classList: { add() {}, remove() {} }, focus() { this.focada=true; }, scrollIntoView() { this.rolada=true; },
 };
}
function achar(root, label) {
 if (root?.tag === 'button' && root.attrs.texto === label) return root;
 for (const n of root?.children || []) { const b = achar(n, label); if (b) return b; }
}
function encontrar(root, predicado) {
 if (root && predicado(root)) return root;
 for (const n of root?.children || []) { const achado=encontrar(n,predicado); if(achado) return achado; }
}
(async () => {
 const tempBase = path.resolve(os.tmpdir()), dir = fs.mkdtempSync(path.join(tempBase, 'grana-forge-fase3-'));
 const mods = new Map(), uiMods = new Map(), chamadas = [], avisos = [], navegacoes = [], erros = [], forms = [], confirms = [];
 let meta = 0, recargas = 0, obsoleta = false, falhar = null;
 const redeProibida = () => { meta++; throw Error('Rede/Meta proibida'); };
 function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const module = { exports: {} }; mods.set(nome,module);
  vm.runInNewContext(fs.readFileSync(path.join('tools/admin-local/marketing',nome),'utf8'), {
   module, exports: module.exports, Buffer, Date, Intl, structuredClone, console,
   process: { pid: process.pid, env: new Proxy({}, { get() { throw Error('Credencial proibida'); } }) }, fetch: redeProibida,
   require: (id) => id === './ajustes-fila.cjs' ? { fila: { listar: () => [] }, estadoTerminal: (s) => ['aceito','desatualizado','encerrado','recusado-pelo-autor'].includes(s) }
     : id.startsWith('./') ? load(id.slice(2)) : ['fs','path','crypto','node:fs','node:path','node:crypto','node:os'].includes(id) ? require(id) : (() => { throw Error('Import proibido '+id); })(),
  }, { filename: nome }); return module.exports;
 }
 function tela(nome) {
  if (uiMods.has(nome)) return uiMods.get(nome).exports;
  const module = { exports: {} }; uiMods.set(nome,module);
  const js = ts.transpileModule(fs.readFileSync(path.join('tools/admin-local/web/telas',nome),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js,{module,exports:module.exports,require:(id)=>tela(id.replace('./','')), console,Date,Map,Set,URLSearchParams,AbortController,setTimeout:()=>0,clearTimeout:()=>{},fetch:redeProibida,
   localStorage: { getItem: () => null, setItem() {} } },{filename:nome}); return module.exports;
 }
 const cr = load('cronograma.cjs'), c = load('catalogo.cjs'), ap = load('aprovacoes.cjs'), pr = load('promocao.cjs'), cal = load('calendario.cjs');
 const calendario = tela('calendario.js'), aprovacao = tela('aprovacao.js');
 const contexto = { h: elemento, params: { mes: '2099-01' }, obsoleta: () => obsoleta,
  formatar: { ...ctx.formatar, isoLocal: (d) => d.toISOString().slice(0,10) },
  aviso: (t,tipo) => avisos.push({t,tipo}), navegar: (url) => navegacoes.push(url), recarregar: () => recargas++,
  formulario: async (config) => { contexto.ultimoFormulario=config; return forms.shift() ?? null; },
  confirmar: async (config) => { contexto.ultimaConfirmacao=config; return confirms.shift() ?? false; },
  api: async (url) => {
   chamadas.push({metodo:'GET',url});
   if (url === '/api/marketing/ajustes') return {dados:{pedidos:[],remoto:{status:'ativo',ultimaSync:new Date().toISOString()}}};
   if (url === '/api/marketing/pecas') return {dados:c.listarPecas(dir)};
   if (url === '/api/marketing/cronograma') return {dados:cr.ler(dir)};
   if (url.endsWith('/ensaio')) return {dados:{modo:'ensaio',realHabilitado:false,chamadasMeta:0,itens:[],geradoEm:'2099-01-01T10:00:00-03:00'}};
   if (url.startsWith('/api/marketing/calendario?')) return {dados:cal.obterCalendario(dir,'2099-01')};
   throw Error('GET inesperado '+url);
  },
  acao: async (url,body) => {
   chamadas.push({metodo:'POST',url,body:structuredClone(body)});
   if (falhar) throw Object.assign(new Error('Falha fictícia'),{codigo:falhar});
   let dados;
   if (url === '/api/marketing/cronograma') dados=await cr.salvarManifesto(dir,body);
   else if (url === '/api/marketing/cronograma/vinculo') dados=await cr.registrarVinculo(dir,body.pecaId,body);
   else if (url.endsWith('/promover')) dados=await pr.promover(dir,url.split('/')[4],body);
   else if (url.endsWith('/aprovar')) dados=await ap.aprovarEFechar(dir,url.split('/')[4],body);
   else if (url === '/api/marketing/calendario') dados=await cal.planejar(dir,body);
   else throw Error('POST inesperado '+url);
   return {dados};
  },
  estado: { carregando: (r,t) => r.replaceChildren(elemento('p',{texto:t})), erro: (r,e,retry) => { erros.push(e);r.replaceChildren(elemento('p',{texto:e.message}),elemento('button',{texto:'Tentar novamente',onclick:retry})); } },
  cabecalho: (r,t,sub,acoes=[]) => r.appendChild(elemento('header',{texto:t+' '+sub},acoes)),
  secao: (t,...children) => elemento('section',{},elemento('h2',{texto:t}),...children),
  alerta: (tipo,t) => elemento('p',{texto:t,tipo}), tabela: () => elemento('table'), urlArquivo: (u) => u,
  selo: (tipo,t) => elemento('span',{texto:t,class:'selo'}), midia: () => elemento('div'), markdown: (t) => elemento('p',{texto:t}),
 };
 const botao=()=>elemento('button');
 const posts=()=>chamadas.filter((c)=>c.metodo==='POST');
 try {
  const semana='docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
  const pasta=path.join(dir,semana,'para-aprovacao/pecas'); fs.mkdirSync(pasta,{recursive:true});
  fs.writeFileSync(path.join(pasta,'E01-AUDIT.jpg'),'AUDIT mídia fictícia');
  fs.writeFileSync(path.join(pasta,'COPYS-FINAIS.md'),'## E01 - Fixture\n\n**Legenda:** Legenda de teste E01.\n');
  const indice=path.join(dir,semana,'INDICE.md');
  fs.writeFileSync(indice,'# AUDIT\n\n| Peça | Cronograma ID |\n| --- | --- |\n| [AUDIT](para-aprovacao/pecas/E01-AUDIT.jpg) | |\n');
  fs.mkdirSync(path.join(dir,'docs/marketing/painel'),{recursive:true});
  let p=c.montarCatalogo(dir).find((p)=>p.tipo==='imagem'); assert(p);
  const rootAprovacao=elemento('main');contexto.params.peca=p.id;
  await aprovacao.montar(rootAprovacao,contexto);
  assert.equal(encontrar(rootAprovacao,n=>n.tag==='a' && n.attrs.texto==='Aprovados sem data').attrs.href,'#/marketing/calendario?secao=sem-data');
  assert.equal(achar(rootAprovacao,'Mover para aprovados'),undefined,'sem aceite não oferece promoção');
  confirms.push(false);await aprovacao.aprovar(contexto,p,botao());assert.equal(posts().length,0);
  confirms.push('sim');await aprovacao.aprovar(contexto,p,botao());assert.equal(posts().length,0,'confirmação exige booleano');
  let resolverConfirmacao, contaConfirmacao=0;const bDuplo=botao();
  const duplo={...contexto,confirmar:()=>{contaConfirmacao++;return new Promise((r)=>resolverConfirmacao=r);}};
  const pendente=aprovacao.aprovar(duplo,p,bDuplo);await aprovacao.aprovar(duplo,p,bDuplo);
  assert.equal(contaConfirmacao,1,'duplo clique não abre outro diálogo');resolverConfirmacao(false);await pendente;assert.equal(posts().length,0);
  confirms.push(true);await achar(rootAprovacao,'Aprovar').attrs.onclick();
  assert.deepEqual(posts()[0].body,{versao:p.versao,confirmacao:true});
  assert.equal(posts().length,1,'Aprovar faz um unico POST');
  rootAprovacao.replaceChildren();
  await aprovacao.montar(rootAprovacao,contexto);
  assert.equal(achar(rootAprovacao,'Mover para aprovados'),undefined,'nao oferece mover depois de aprovar');
  let nova=c.montarCatalogo(dir).find((p)=>p.estado==='aprovados' && p.tipo==='imagem'); assert(nova);assert.notEqual(nova.id,p.id);
  contexto.params.peca=nova.id;await aprovacao.montar(rootAprovacao,contexto);
  assert.equal(achar(rootAprovacao,'Mover para aprovados'),undefined,'peça aprovada não oferece botão Mover');
  assert.equal(navegacoes.at(-1),`#/marketing/calendario?peca=${nova.id}`);
  assert.match(fs.readFileSync(indice,'utf8'),/aprovados\/pecas\/E01-AUDIT.jpg/);
  assert(fs.readFileSync(indice,'utf8').includes(`<!-- promocao:${nova.id}:${nova.versao} -->`),'recibo de promoção exato no índice');
  assert(avisos.some((a)=>a.t.includes('Promoção registrada em') && a.t.includes('INDICE.md')));
  assert.equal(fs.existsSync(path.join(pasta,'E01-AUDIT.jpg')),false,'limpeza apenas após prova');
  const provas=JSON.parse(fs.readFileSync(path.join(dir,'docs/marketing/painel/aprovacoes.json'),'utf8'));
  assert(provas.aprovacoes.some((a)=>a.id===nova.id && a.origem?.id===p.id && a.indice));
  const repetida=await ap.aprovarEFechar(dir,p.id,{versao:p.versao,confirmacao:true});
  assert.equal(repetida.promocao.id,nova.id,'resposta perdida retoma promoção pelo ID original');
  assert.equal(ap.listarAprovacoes(dir).aprovacoes.length,provas.aprovacoes.length,'retomada não duplica aceite');
  const root=elemento('main'); await calendario.montarCronograma(root,contexto);
  assert(achar(root,'Criar cronograma'));assert.match(text(root),/Cronograma ausente/);
  forms.push({manifestoId:'campanha-audit'}); confirms.push(true);
  await achar(root,'Criar cronograma').attrs.onclick();
  assert.equal(cr.ler(dir).versao,1);assert.equal(cr.ler(dir).itens.length,0);
  assert.deepEqual(posts().at(-1).body,{versaoEsperada:0,manifesto:{formato:1,manifestoId:'campanha-audit',versao:1,fuso:'America/Sao_Paulo',diaD:null,itens:[],removidos:[]},confirmacao:true});
  forms.push({itemId:'audit-reel',diasUteis:4,hora:'19:00',canal:'reels'});confirms.push(true);
  await calendario.montarCronograma(root,contexto);await achar(root,'Adicionar item ao cronograma').attrs.onclick();
  assert.equal(cr.ler(dir).versao,2);assert.equal(cr.ler(dir).itens[0].dataPrevista.diasUteis,4);

  contexto.params.peca=nova.id;contexto.params.secao='sem-data';root.replaceChildren();await calendario.montar(root,contexto);await Promise.resolve();
  const colunaSemData=encontrar(root,n=>n.attrs?.id==='aprovados-sem-data');
  assert(colunaSemData.focada && colunaSemData.rolada,'atalho chega a coluna sem data com foco e rolagem');
  assert(achar(root,'Ligar ao cronograma'),'vínculo usa reciboAceite real, DTO não tem aprovada');
  forms.push({itemId:'audit-reel'}); confirms.push(true);await achar(root,'Ligar ao cronograma').attrs.onclick();
  assert.deepEqual(posts().at(-1).body,{pecaId:nova.id,versao:nova.versao,versaoEsperada:2,manifestoId:'campanha-audit',itemId:'audit-reel'});
  assert.match(fs.readFileSync(indice,'utf8'),/campanha-audit#audit-reel@2/);
  assert.equal(cal.obterCalendario(dir,'2099-01').aguardandoDiaD.length,1);
  assert(avisos.some((a)=>a.t.includes('Vínculo registrado no INDICE.md')));
  // F4-1: a opção mostra o item; a notação manifesto#item@versão fica só no INDICE.md (conferido acima).
  assert.equal(contexto.ultimoFormulario.campos[0].opcoes[0].rotulo,'audit-reel');
  assert(!avisos.some((a)=>/#audit-reel@/.test(a.t)),'aviso de vínculo sem a notação técnica');

  forms.push({diaD:'2099-01-01'}); confirms.push(true);await calendario.montarCronograma(root,contexto);await achar(root,'Definir dia D').attrs.onclick();
  const m=cr.ler(dir);assert.equal(m.versao,3);assert.equal(m.diaD,'2099-01-01');assert.equal(m.itens.length,1,'salva objeto completo');
  assert.equal(m.recibos.at(-1).acao,'dia-d');assert.equal(m.recibos.at(-1).depois,'2099-01-01');
  const dto=cal.obterCalendario(dir,'2099-01');assert.equal(dto.itens.length,1);assert.equal(dto.itens[0].estado,'planejado');
  assert(dto.itens[0].recibos.some((r)=>r.tipo==='entrada-automatica'));
  root.replaceChildren();await calendario.montar(root,contexto);await Promise.resolve();
  assert.match(text(root),/Planejada no calendário local/);assert.match(text(root),/entrada-automatica/);assert.match(text(root),/Recibo do dia D/);
  assert.match(text(root),/Somente simulação/);assert.equal(erros.length,0);

  // CAS, dados inválidos, cancelamento, duplicidade e falha sem sucesso falso.
  let n=posts().length;forms.push({diaD:'2099-02-30'});await calendario.editarCronograma(contexto,m,'diaD',botao());assert.equal(posts().length,n);
  forms.push({diaD:'2099-02-01'});confirms.push(false);await calendario.editarCronograma(contexto,m,'diaD',botao());assert.equal(posts().length,n);
  forms.push({itemId:'audit-reel',diasUteis:0,hora:'19:00',canal:'reels'});await calendario.editarCronograma(contexto,m,'item',botao());assert.equal(posts().length,n);
  forms.push({diaD:'2099-02-01'});confirms.push(true);const antigo={...m,versao:2};await calendario.editarCronograma(contexto,antigo,'diaD',botao());
  assert(avisos.at(-1).t.includes('cronograma mudou'));assert.equal(cr.ler(dir).versao,3);
  nova=cal.obterCalendario(dir,'2099-01').itens[0].peca;
  for(const codigo of ['vinculo-duplicado','vinculo-invalido','linha-cronograma-ausente','vinculo-existente']) {
   falhar=codigo; forms.push({itemId:'audit-reel'});confirms.push(true);const b=botao();const antes=recargas;
   await calendario.ligarCronograma(contexto,nova,b);assert.equal(avisos.at(-1).tipo,'erro');assert.equal(b.disabled,false);assert.equal(recargas,antes);
  }
  falhar='versao-mudou';confirms.push(true);await aprovacao.aprovar(contexto,p,botao());assert.match(avisos.at(-1).t,/revise de novo/);
  falhar=null;n=posts().length;await calendario.ligarCronograma(contexto,{...nova,reciboAceite:null},botao());assert.equal(posts().length,n);
  // Resposta perdida/incompleta não vira sucesso; aviso secundário continua visível.
  const parcial={...contexto,acao:async()=>({dados:{promocao:{id:nova.id,versao:nova.versao,indice:null},avisos:['AUDIT calendário pendente']}})};
  confirms.push(true);await aprovacao.aprovar(parcial,p,botao());assert(avisos.some((a)=>a.t==='AUDIT calendário pendente'));assert.match(avisos.at(-1).t,/recibo no índice está pendente/);
  const incompleta={...contexto,acao:async()=>({dados:{avisos:[]}})};const navAntes=navegacoes.length;
  confirms.push(true);await aprovacao.aprovar(incompleta,p,botao());assert.equal(navegacoes.length,navAntes);assert.equal(avisos.at(-1).tipo,'erro');
  let resolverPost;const tardia={...contexto,acao:()=>new Promise((r)=>resolverPost=r)};
  forms.push({diaD:'2099-02-01'});confirms.push(true);const salvarTardio=calendario.editarCronograma(tardia,m,'diaD',botao());
  for (let i = 0; i < 50 && typeof resolverPost !== 'function'; i++) await new Promise((r) => setImmediate(r));
  assert.equal(typeof resolverPost, 'function', 'POST tardio não chegou: editarCronograma saiu antes de chamar acao');
  const antesAvisos=avisos.length,antesRecarga=recargas;
  obsoleta=true;resolverPost({dados:{manifesto:{...m,versao:4,diaD:'2099-02-01'},avisos:['não exibir']}});await salvarTardio;
  assert.equal(avisos.length,antesAvisos);assert.equal(recargas,antesRecarga);obsoleta=false;
  obsoleta=true;await calendario.editarCronograma(contexto,m,'diaD',botao());await aprovacao.aprovar(contexto,p,botao());assert.equal(posts().length,n);obsoleta=false;
  // Marcação manual pela UI real: recibo conferido, bloqueio de duplicata e navegação antiga.
  const dataManual={data:'2099-01-20',hora:'20:00',canal:'reels',observacao:''};
  n=posts().length;forms.push(dataManual);await calendario.escolherData(contexto,nova,undefined,['reels']);
  assert.equal(posts().length,n+1);assert.equal(posts().at(-1).url,'/api/marketing/calendario');
  assert.equal(cal.obterCalendario(dir,'2099-01').itens[0].data,dataManual.data);
  assert.match(avisos.at(-1).t,/Marcado para/);assert.equal(avisos.at(-1).tipo,'ok');
  n=posts().length;forms.push(null);await calendario.escolherData(contexto,nova,undefined,['reels']);assert.equal(posts().length,n);
  forms.push({...dataManual,data:'2099-02-30'});await calendario.escolherData(contexto,nova,undefined,['reels']);assert.equal(posts().length,n);assert.equal(avisos.at(-1).tipo,'erro');
  let resolverFormulario,aberturas=0;
  const formularioPendente={...contexto,formulario:()=>{aberturas++;return new Promise(r=>resolverFormulario=r);}};
  const escolha=calendario.escolherData(formularioPendente,nova,undefined,['reels']);
  await calendario.escolherData(formularioPendente,nova,undefined,['reels']);assert.equal(aberturas,1);
  obsoleta=true;resolverFormulario(dataManual);await escolha;obsoleta=false;assert.equal(posts().length,n,'nenhum POST de formulario da tela antiga');
  const navManual=navegacoes.length;forms.push(dataManual);await calendario.escolherData(incompleta,nova,undefined,['reels']);
  assert.equal(navegacoes.length,navManual);assert.equal(avisos.at(-1).tipo,'erro','resposta incompleta nao confirma sucesso');
  assert.equal(avisos.at(-1).t,'Não foi possível confirmar a data; atualize e confira antes de repetir.','recibo incompleto deixa gravacao incerta, sem afirmar ausencia');
  resolverPost=null;forms.push(dataManual);const manualTardio=calendario.escolherData(tardia,nova,undefined,['reels']);
  for(let i=0;i<50 && !resolverPost;i++) await new Promise(r=>setImmediate(r));assert.equal(typeof resolverPost,'function');
  const avisosManual=avisos.length;obsoleta=true;resolverPost({dados:{planejamento:{id:nova.id,versao:nova.versao,...dataManual,planejadoEm:new Date().toISOString()},avisos:['nao exibir']}});await manualTardio;obsoleta=false;
  assert.equal(avisos.length,avisosManual);assert.equal(navegacoes.length,navManual,'resposta tardia nao navega');
  assert.equal(meta,0);assert(chamadas.every((c)=>c.url.startsWith('/api/marketing/')));
  console.log(`admin-calendario-cronograma-tela Fase 3: módulos reais UI/backend; promoção/ID novo/retomada -> criação -> item -> vínculo INDICE.md -> D -> planejada/recibos OK; cancelamento, validação, CAS, erros e obsoleta OK; ${posts().length} POST locais em fixture; zero chamadas Meta/rede/credenciais`);
 } finally {
  assert.equal(path.dirname(path.resolve(dir)),tempBase);assert(path.basename(dir).startsWith('grana-forge-fase3-'));fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch((e)=>{console.error(e);process.exitCode=1;});
