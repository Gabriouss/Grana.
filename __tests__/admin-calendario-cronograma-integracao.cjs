const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const base = path.join(process.cwd(), 'tools/admin-local/marketing'), mods = new Map();
function load(nome) {
 if (mods.has(nome)) return mods.get(nome).exports;
 const m = { exports: {} }; mods.set(nome, m);
 vm.runInNewContext(fs.readFileSync(path.join(base, nome), 'utf8'), { module: m, exports: m.exports, Buffer, Date, Intl, console, structuredClone,
  process: { pid: process.pid, env: new Proxy({}, { get() { throw Error('env proibido'); } }) }, fetch: () => { throw Error('rede proibida'); },
  require: (id) => id === './ajustes-fila.cjs' ? { fila: { listar: () => [] } } : id.startsWith('./') ? load(id.slice(2)) : ['fs','path','crypto','node:fs','node:path','node:crypto'].includes(id) ? require(id) : (() => { throw Error('import proibido '+id); })(),
 }, { filename: nome }); return m.exports;
}
const node = (tag, attrs = {}, ...children) => ({ tag, attrs, children: children.flat(Infinity).filter(Boolean), appendChild(v) { this.children.push(v); }, replaceChildren(...v) { this.children=v; },
 get firstChild() { return this.children[0]; }, removeChild(v) { this.children=this.children.filter((c)=>c!==v); }, addEventListener() {}, classList: { add() {}, remove() {} } });
const text = (n) => n == null ? '' : typeof n === 'object' ? [n.attrs?.texto || '', ...(n.children || []).map(text)].join(' ') : String(n);
const source=fs.readFileSync('tools/admin-local/web/telas/calendario.js','utf8').replace(/^import .*\n/m,'').replace(/export (async )?function /g,'$1function ');
(async()=>{
 const tempBase=path.resolve(os.tmpdir()), dir=fs.mkdtempSync(path.join(tempBase,'grana-cronograma-tela-'));
 try {
  const semana='docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
  const pasta=path.join(dir,semana,'para-aprovacao/pecas'); fs.mkdirSync(pasta,{recursive:true}); fs.writeFileSync(path.join(pasta,'E01.jpg'),'fixture');
  fs.writeFileSync(path.join(dir,semana,'INDICE.md'),'# Semana\n\n| Peça | Cronograma ID |\n| --- | --- |\n| [Peça](para-aprovacao/pecas/E01.jpg) | |\n');
  fs.mkdirSync(path.join(dir,'docs/marketing/painel'),{recursive:true});
  const c=load('catalogo.cjs'), cr=load('cronograma.cjs'), ap=load('aprovacoes.cjs'), cal=load('calendario.cjs');
  const p=c.montarCatalogo(dir).find((p)=>p.tipo!=='texto'); assert(p);
  const manifesto={formato:1,manifestoId:'campanha-teste',versao:1,fuso:'America/Sao_Paulo',diaD:null,itens:[{id:'peca-teste',dataPrevista:{modo:'diaD',diasUteis:4}}],removidos:[]};
  await cr.salvarManifesto(dir,{manifesto,versaoEsperada:0});
  await cr.registrarVinculo(dir,p.id,{versao:p.versao,versaoEsperada:1,manifestoId:manifesto.manifestoId,itemId:'peca-teste'});
  await ap.aprovar(dir,p.id,{versao:p.versao,confirmacao:'APROVAR'});
  let dto=cal.obterCalendario(dir,'2099-01');
  assert.equal(dto.aguardandoDiaD.length,1);
  let obsoleta=false, reject=false, late=false, resolver; const calls=[], errors=[], root=node('main');
  const ctx={h:node,params:{mes:'2099-01'},obsoleta:()=>obsoleta,
   cabecalho:(root,t,sub)=>root.appendChild(node('header',{texto:t+' '+sub})),
   secao:(t,...children)=>node('section',{},node('h2',{texto:t}),...children),
   alerta:(tipo,txt)=>node('p',{tipo,texto:txt}), tabela:()=>node('table'),
   estado:{carregando:(r,t)=>r.replaceChildren(node('p',{texto:t})),erro:(r,e,retry)=>{errors.push(e);r.replaceChildren(node('p',{texto:'Falha com recibo'}));}},
   formatar:{data:(s)=>s?s.split('-').reverse().join('/'):'sem data',dataHora:(s)=>'hora formatada',isoLocal:(d)=>d.toISOString().slice(0,10)},
   acao:()=>{throw Error('POST proibido');}, recarregar:()=>{},
   api:async(url)=>{calls.push(url); if(url.endsWith('/ensaio')) return {dados:{modo:'ensaio',realHabilitado:false,chamadasMeta:0,itens:[]}}; if(reject) throw Error('falha de leitura');if(late)return new Promise((r)=>resolver=r);return {dados:dto};},
  };
  const sandbox={ctx,root,Date,Map,CANAIS:[{valor:'instagram-feed'}],rotuloCanal:(s)=>s||'sem canal',console}; vm.runInNewContext(source,sandbox);
  const render=()=>vm.runInNewContext('montar(root,ctx)',sandbox);
  await render(); let t=text(root);
  assert.ok(t.includes('Aguardando dia D')); assert.ok(t.includes('D+4 dias úteis')); assert.ok(t.includes('campanha-teste')); assert.ok(t.includes('peca-teste'));
  assert.ok(t.includes('horário pendente')); assert.ok(t.includes('canal pendente'));
  assert.equal(t.includes('undefined'),false);
  const m=cr.ler(dir); await cr.salvarManifesto(dir,{manifesto:{...m,versao:m.versao+1,diaD:'2099-01-01'},versaoEsperada:m.versao,confirmacao:'DECLARAR DIA D'});
  await cal.planejar(dir,{id:p.id,versao:p.versao,data:'2099-01-22',hora:'20:00',canal:'instagram-feed'});
  dto=cal.obterCalendario(dir,'2099-01'); root.replaceChildren(); await render();t=text(root);
  assert.ok(t.includes('Previsão resolvida:')); assert.ok(t.includes('Data alterada pelo autor: 22/01/2099 às 20:00'));
  assert.equal(dto.itens.length,1); assert.notEqual(dto.itens[0].data,dto.itens[0].dataPrevista.dataResolvida);
  root.replaceChildren();reject=true;await render();assert.ok(text(root).includes('Falha com recibo'));assert.equal(errors.length,1);
  reject=false;late=true;root.replaceChildren();const promise=render();await Promise.resolve();obsoleta=true;resolver({dados:dto});await promise;
  assert.equal(text(root).includes('Previsões e entradas'),false);
  assert.ok(calls.every((c)=>c.startsWith('/api/marketing/calendario')));
  console.log('admin-calendario-cronograma-integracao: criar vínculo -> aceite real -> DTO real -> tela, semD/resolvido/manual/falha/tardio OK; zero POST/rede/env');
 } finally { assert.equal(path.dirname(path.resolve(dir)),tempBase);assert(path.basename(dir).startsWith('grana-cronograma-tela-'));fs.rmSync(dir,{recursive:true,force:true}); }
})().catch((e)=>{console.error(e);process.exitCode=1;});
