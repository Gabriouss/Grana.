'use strict';
// Modulos reais, arquivos sinteticos: nenhum ambiente, Git, rede ou processo real.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const c=require('../tools/admin-local/marketing/catalogo.cjs'),{criarCustodia,validarResumo}=require('../tools/admin-local/marketing/ajustes-prova-local.cjs');
const {fixture}=require('./admin-familia.cjs');
const mod={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tools/admin-local/marketing/ajustes-fila.cjs'),'utf8'),{
 module:mod,exports:mod.exports,process,Date,structuredClone,setTimeout,setInterval,clearInterval,
 require:id=>id==='../config.cjs'?{tem:()=>false,RAIZ:'/fixture',RAIZ_DADOS:'/fixture'}:id==='child_process'?{execFile(){throw Error('processo proibido');}}:id==='./ajustes-remoto.cjs'?require('../tools/admin-local/marketing/ajustes-remoto.cjs'):id==='./legenda-publicacao.cjs'?require('../tools/admin-local/marketing/legenda-publicacao.cjs'):require(id),
});
let n=0;const ok=(x,m)=>{assert.ok(x,m);n++;};
function setup(dir,custodia){
 let db={formato:1,pedidos:[],eventos:[]},registrados=0;let serial=Promise.resolve();
 const deps={ler:()=>structuredClone(db),agora:()=>new Date().toISOString(),id:()=>crypto.randomUUID(),obterPeca:id=>c.obterPeca(dir,id),
  transacao:fn=>{const p=serial.then(()=>{const nova=structuredClone(db),r=fn(nova);db=nova;return structuredClone(r);});serial=p.catch(()=>{});return p;},
  preservarAnterior:custodia.preservar,comprovar:custodia.comprovar,conferirProva:custodia.conferir,
  verificarCommit:()=>{throw Error('Git proibido no caminho local');},registrarVersao:()=>{registrados++;},log:()=>{},entregar:()=>{},
 };
 return {deps,get db(){return db;},get registrados(){return registrados;},fila:mod.exports.criarFila(deps)};
}
(async()=>{
 for(const nomes of [['C01-card.png'],['C01-card-1.png','C01-card-2.png'],['C01-reel.mp4','C01-reel-capa.png'],['C01-ação, espaço.png'],['C01-carrossel, ação-1.png','C01-carrossel, ação-2.png'],['C01-reel, ação.mp4','C01-reel, ação-capa.png']])await fixture(async f=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'grana-custodia-'));
  try{
   fs.writeFileSync(path.join(f.media,'COPYS-FINAIS.md'),'## C01 Fixture\n\n**Legenda:** Legenda anterior sintetica.\n');
   const custodia=criarCustodia({raiz:f.dir,base}),h=setup(f.dir,custodia);
   const antes=c.montarCatalogo(f.dir).find(p=>p.tipo!=='texto'&&!p.capaDe);
   const bytes=fs.readFileSync(path.join(f.dir,decodeURIComponent(antes.arquivos[0].url.slice(1))));
   let preservadoNaRevisao=false;h.deps.iniciarRevisao=()=>{preservadoNaRevisao=fs.readdirSync(path.join(base,'versoes')).length===1;};
   const pedido=await h.fila.solicitar(antes,{versao:antes.versao,motivo:'Ajuste sintetico'});
   ok(preservadoNaRevisao,'historico antes da revisao');ok(pedido.snapshotAnterior.sha256.length===64,'snapshot forte');
   const claim=await h.fila.claim();
   for(const nome of nomes)fs.writeFileSync(path.join(f.media,nome),'correcao sintetica '+nome);
   fs.writeFileSync(path.join(f.media,'COPYS-FINAIS.md'),'## C01 Fixture\n\n**Legenda:** Legenda corrigida sintetica.\n');
   const atual=c.obterPeca(f.dir,antes.id);
   await assert.rejects(h.fila.marcar(pedido.id,claim.lease.id,'corrigido-aguardando-aceite',{pecaId:atual.id,versao:atual.versao}));n++;
   const prova=h.fila.comprovar(pedido.id,claim.lease.id,atual.id,atual.versao);
   ok(prova.reciboSha256.length===64&&prova.versaoAnterior===antes.versao,'recibo vincula versoes');
   for(const alteracao of [{reciboSha256:'0'.repeat(64)},{pecaId:'f'.repeat(16)},{versaoAnterior:atual.versao},{atualSha256:'0'.repeat(64)},{pedidoId:crypto.randomUUID()}]){
    await assert.rejects(h.fila.marcar(pedido.id,claim.lease.id,'corrigido-aguardando-aceite',{pecaId:atual.id,versao:atual.versao,provaCorrecao:{...prova,...alteracao}}));n++;
   }
   const recibo=path.join(base,'recibos',prova.reciboSha256+'.json'),salvo=fs.readFileSync(recibo);fs.unlinkSync(recibo);
   await assert.rejects(h.fila.marcar(pedido.id,claim.lease.id,'corrigido-aguardando-aceite',{pecaId:atual.id,versao:atual.versao,provaCorrecao:prova}));n++;
   fs.writeFileSync(recibo,salvo);
   const dados={pecaId:atual.id,versao:atual.versao,provaCorrecao:prova};
   const r=await h.fila.marcar(pedido.id,claim.lease.id,'corrigido-aguardando-aceite',dados);
   const eventos=h.db.eventos.length;
   const retomada=mod.exports.criarFila(h.deps);
   const cli={exports:{}};
   vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../tools/admin-local/marketing/ajustes-cli.cjs'),'utf8'),{
    module:cli,exports:cli.exports,process,console,require:id=>{assert.equal(id,'./ajustes-fila.cjs');return {fila:retomada};}});
   const refeito=await cli.exports.main(['concluir',pedido.id,claim.lease.id,atual.id,atual.versao,'--prova-local']);
   ok(refeito.provaCorrecao.reciboSha256===prova.reciboSha256,'CLI real retoma com recibo verificavel');
   ok(h.registrados===1&&h.db.eventos.length===eventos,'restart idempotente sem dupla mutacao');
   assert.deepEqual(retomada.comprovar(pedido.id,claim.lease.id,atual.id,atual.versao),prova);n++;
   const resolver=url=>({publico:false,mime:url.endsWith('.mp4')?'video/mp4':'image/png'});
   const antigo=()=>c.lerAnterior(f.dir,r,atual,{custodia,resolver,executar:()=>{throw Error('Git proibido');}});
   assert.deepEqual(antigo().conteudo,bytes);n++;
   assert.throws(()=>c.lerAnterior(f.dir,r,atual,{custodia,resolver,arquivo:'../escape.png'}));n++;
   fs.appendFileSync(path.join(f.media,'COPYS-FINAIS.md'),'\n## C99 Outra peca\n\n**Legenda:** mudou outra peca.\n');
   retomada.conferirAceite(atual,pedido.id);
   fs.appendFileSync(path.join(f.media,nomes[0]),'mudou');
   assert.throws(()=>retomada.conferirAceite(atual,pedido.id));n++;
   await assert.rejects(retomada.aceitar(atual,pedido.id));n++;
   fs.writeFileSync(path.join(f.media,nomes[0]),'correcao sintetica '+nomes[0]);
   const apModulo={exports:{}},apPath=path.join(__dirname,'../tools/admin-local/marketing/aprovacoes.cjs');
   const apRequire=require('node:module').createRequire(apPath);
   vm.runInNewContext(fs.readFileSync(apPath,'utf8'),{module:apModulo,exports:apModulo.exports,process,Date,Buffer,console,
    require:id=>id==='./ajustes-fila.cjs'?{fila:retomada}:id==='./editorial-publicacao.cjs'?{ativo:()=>false}:apRequire(id)});
   const corpo={confirmacao:true,versao:atual.versao};
   delete h.db.pedidos[0].provaCorrecao;
   await assert.rejects(apModulo.exports.aprovar(f.dir,atual.id,corpo));n++;
   h.db.pedidos[0].provaCorrecao=prova;
   fs.unlinkSync(recibo);
   await assert.rejects(apModulo.exports.aprovar(f.dir,atual.id,corpo));n++;
   ok(c.lerJson(c.caminhoPainel(f.dir,'aprovacoes.json'),{aprovacoes:[]}).aprovacoes.length===0,'sem prova nao grava aceite mesmo sem pedidoId');
   fs.writeFileSync(recibo,salvo);
   const aprovado=await apModulo.exports.aprovar(f.dir,atual.id,corpo);
   ok(aprovado.aprovacao.versao===atual.versao,'aprovar real persiste aceite da correcao comprovada');
   await retomada.aceitar(atual,pedido.id);ok(h.db.pedidos[0].estado==='aceito','aceite vinculado a prova');
   // Remove apenas a arvore sintetica de acervo; a custodia e independente do repo.
   fs.renameSync(f.media,f.media+'-removida');
   assert.deepEqual(antigo().conteudo,bytes);n++;
   ok(fs.readFileSync(path.join(base,'objetos',crypto.createHash('sha256').update(bytes).digest('hex')+'.bin')).equals(bytes),'bytes anteriores recuperaveis foraGit');
   assert.throws(()=>validarResumo({...prova,caminho:'docs/marketing/../escape'}));n++;
  }finally{const rel=path.relative(os.tmpdir(),base);assert.ok(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));fs.rmSync(base,{recursive:true,force:true});}
 },nomes);
 await fixture(async f=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'grana-falha-custodia-'));
  try{
   const io=Object.create(fs);io.linkSync=()=>{throw Object.assign(Error('fixture escrita indisponivel'),{code:'EIO'});};
   const custodia=criarCustodia({raiz:f.dir,base,io}),h=setup(f.dir,custodia),p=c.montarCatalogo(f.dir).find(p=>p.tipo!=='texto');
   const original=fs.readFileSync(path.join(f.media,'peca.png'));
   await assert.rejects(h.fila.solicitar(p,{versao:p.versao,motivo:'fixture'}));n++;
   ok(h.db.pedidos.length===0,'falha custodia nao cria pedido sem anterior');
   assert.deepEqual(fs.readFileSync(path.join(f.media,'peca.png')),original);n++;
   const normal=criarCustodia({raiz:f.dir,base}),s=setup(f.dir,normal);
   const pedido=await s.fila.solicitar(p,{versao:p.versao,motivo:'fixture'}),claim=await s.fila.claim();
   const versoes=path.join(base,'versoes'),fora=path.join(base,'versoes-preservadas');
   fs.renameSync(versoes,fora);fs.symlinkSync(fora,versoes,'junction');
   fs.writeFileSync(path.join(f.media,'peca.png'),'corrigida');const novo=c.obterPeca(f.dir,p.id);
   assert.throws(()=>s.fila.comprovar(pedido.id,claim.lease.id,p.id,novo.versao));n++;
   ok(s.db.pedidos[0].estado==='em-correcao','historico adulterado nao conclui pedido');
  }finally{const rel=path.relative(os.tmpdir(),base);assert.ok(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));fs.rmSync(base,{recursive:true,force:true});}
 });
 console.log('admin-ajustes-prova-local: '+n+' assertions; fila/catalogo/custodia reais; zero Git/rede');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
