 'use strict';
// Migrador real em VM + filesystem real e writer serializar real; somente fixtures externas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const net = require('node:net');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const raiz = path.resolve(__dirname, '..');
const cat = require('../tools/admin-local/marketing/catalogo.cjs');
const pp = cat.pastaPainel;
const fonte = fs.readFileSync(path.join(raiz, 'scripts/migrar-pasta-painel.cjs'), 'utf8');
const base = fs.mkdtempSync(path.join(process.env.GRANA_TEMP || os.tmpdir(), 'grana-migrador-'));
const S = 'docs/marketing/2099-01/semana-01-2099-01-01-a-2099-01-07';
const REL = `${S}/para-aprovacao/pecas/Reel.mp4`;
let assertions = 0, grupos = 0;
const ok = (v, msg) => { assertions++; assert.ok(v, msg); };
const eq = (a, b, msg) => { assertions++; assert.deepEqual(a, b, msg); };
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function fixture(nome) {
  const dir = fs.mkdtempSync(path.join(base, nome+'-')), repo=path.join(dir,'repo'), painel=path.join(dir,'painel'), fora=path.join(dir,'fora');
  fs.mkdirSync(repo); fs.mkdirSync(fora);
  const dados = { [REL]:'VIDEO-original', [`${S}/para-aprovacao/pecas/Reel-capa.png`]:'CAPA-original', [`${S}/para-aprovacao/pecas/COPYS-FINAIS.md`]:'Legenda original', [`${S}/historico/anterior.mp4`]:'VIDEO-anterior', [`${S}/INDICE.md`]:'# Indice', 'docs/marketing/painel/aprovacoes.json':'{"aprovacoes":[{"id":"identidade-preservada"}]}' };
  for (const [rel,bytes] of Object.entries(dados)) { const f=path.join(repo,rel); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,bytes); }
  return {dir,repo,painel,fora,dados,arquivo:path.join(repo,REL),destino:pp.mapear(painel,REL).abs};
}
function listar(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?listar(path.join(dir,e.name)):e.isFile()?[path.join(dir,e.name)]:[]).sort();
}
const recibos = f => listar(path.join(f.painel,'Registros')).filter(p=>/^migracao-.+\.json$/.test(path.basename(p)));
const snapshot = dir => listar(dir).map(p=>[path.relative(dir,p),hash(p)]);
async function executar(f, op={}) {
  const logs=[],writes=[];
  const io=new Proxy(fs,{get(target,key) {
    if (op.io?.[key]) return (...args)=>op.io[key](...args);
    if (key==='copyFileSync') return (...args)=>{ writes.push(['copy',...args.slice(0,2)]); const r=fs.copyFileSync(...args); op.aposCopia?.(args,f); return r; };
    if (['writeFileSync','mkdirSync','renameSync','linkSync','unlinkSync','openSync'].includes(key)) return (...args)=>{ writes.push([key,...args.slice(0,2)]); return fs[key](...args); };
    return target[key];
  }});
  const proc={argv:['node','migrar',op.modo||'--copiar'],env:{GRANA_ADMIN_PORTA:String(op.porta||4317)},pid:process.pid,exitCode:0,exit(code){throw Error('exit '+code);}};
  const req=name=>{
    if (name==='node:fs'||name==='fs') return io;
    if (name.endsWith('/pasta-painel.cjs')) return {...pp,REPO:f.repo,pasta:()=>f.painel};
    if (name.endsWith('/catalogo.cjs')) return cat;
    if (name==='node:child_process') return {execFileSync(bin,args){assert.equal(bin,'git');assert.ok(args.includes('ls-files'));return Buffer.from(Object.keys(f.dados).join('\0')+'\0');}};
    if (name==='node:net'&&!op.porta) return {connect(){ const e=new (require('node:events').EventEmitter)(); process.nextTick(()=>e.emit('error',Error('fixture porta livre')));return e; }};
    if (name==='node:crypto'&&op.uuid) return {...crypto,randomUUID:()=>op.uuid};
    return require(name);
  };
  await vm.runInNewContext(fonte,{require:req,process:proc,console:{log:(...x)=>logs.push(x.join(' ')),error:(...x)=>logs.push(x.join(' '))},Buffer,Date,setTimeout,clearTimeout,URL},{filename:path.join(raiz,'scripts/migrar-pasta-painel.cjs')});
  return {exit:proc.exitCode,logs,writes};
}
async function caso(nome, fn) { await fn();grupos++;console.log('OK '+nome); }
(async()=>{
 const failures=[];
 const check=async(nome,fn)=>{try{await caso(nome,fn);}catch(e){failures.push(e);console.error('FALHOU '+nome+': '+e.stack);}};
 await check('junction ancestral destino: zero escrita fora e zero recibo',async()=>{
  const f=fixture('junction-ancestral'),anc=path.join(f.dir,'atalho');fs.symlinkSync(f.fora,anc,'junction'); f.painel=path.join(anc,'painel');f.destino=pp.mapear(f.painel,REL).abs;
  const antes=snapshot(f.fora),r=await executar(f);
  fs.writeFileSync(path.join(f.dir,'evidencia.json'),JSON.stringify({exit:r.exit,antes,foraDepois:snapshot(f.fora),recibos:recibos(f)},null,2));
  eq(r.exit,1,'deve recusar junction ancestral');eq(snapshot(f.fora),antes,'nenhuma escrita fisica fora');eq(recibos(f),[],'sem ativacao');
 });
 await check('writer real intercalado depois da copia nao entra',async()=>{
  const f=fixture('writer'),antes=hash(f.arquivo);let writer;
  const r=await executar(f,{aposCopia(args){if(args[0]!==f.arquivo||writer)return;const code=`const cat=require(${JSON.stringify(path.join(raiz,'tools/admin-local/marketing/catalogo.cjs'))});cat.serializar(${JSON.stringify(f.repo)},()=>require('node:fs').writeFileSync(${JSON.stringify(f.arquivo)},'ALTERADO-pelo-writer')).then(()=>process.exitCode=0,e=>{console.error(e.codigo);process.exitCode=19});`;writer=cp.spawnSync(process.execPath,['-e',code],{encoding:'utf8',timeout:10000});}});
  fs.writeFileSync(path.join(f.dir,'evidencia.json'),JSON.stringify({exit:r.exit,writer:writer.status,hashAntes:antes,hashOrigem:hash(f.arquivo),hashDestino:fs.existsSync(f.destino)?hash(f.destino):null,recibos:recibos(f),logs:r.logs},null,2));
  eq(writer.status,19,'writer cooperante deve encontrar a mesma reserva');ok(writer.stderr.includes('marketing-trava-ocupada'));eq(hash(f.arquivo),antes);eq(r.exit,0);eq(hash(f.destino),antes);eq(recibos(f).length,1);ok(!fs.existsSync(path.join(f.repo,'.grana-admin-writer.lock')),'liberou trava');
 });
 if(process.argv.includes('--red')) {if(failures.length)throw Error(`${failures.length} cenarios RED confirmados`);return;}

 const semTrava=f=>ok(!fs.existsSync(path.join(f.repo,'.grana-admin-writer.lock')),'trava propria liberada');
 const falhou=(f,r,re)=>{eq(r.exit,1);ok(r.logs.some(x=>re.test(x)),r.logs.join('\n'));semTrava(f);};
 for (const tipo of ['raiz-painel','estado','Registros','origem-ancestral']) await check('junction '+tipo+' sem escape',async()=>{
  const f=fixture('junction-'+tipo);let link;
  if(tipo==='raiz-painel')link=f.painel;
  else if(tipo==='origem-ancestral'){
   const docs=path.join(f.repo,'docs'),out=path.join(f.fora,'docs');fs.renameSync(docs,out);link=docs;
   fs.symlinkSync(out,link,'junction');
  }else{fs.mkdirSync(f.painel);link=path.join(f.painel,tipo==='estado'?'Para aprovar':'Registros');}
  if(tipo!=='origem-ancestral')fs.symlinkSync(f.fora,link,'junction');
  const antes=snapshot(f.fora),r=await executar(f);
  falhou(f,r,/link|junction|escape/);eq(snapshot(f.fora),antes);eq(recibos(f),[]);
 });
 await check('temporario junction nao escreve fora nem apaga entrada alheia',async()=>{
  const f=fixture('tmp-junction'),tmp=f.destino+'.teste.tmp';fs.mkdirSync(path.dirname(tmp),{recursive:true});fs.symlinkSync(f.fora,tmp,'junction');
  const r=await executar(f,{uuid:'teste'});falhou(f,r,/link|junction/);eq(snapshot(f.fora),[]);ok(fs.lstatSync(tmp).isSymbolicLink());eq(recibos(f),[]);
 });
 await check('sucesso: hashes, identidade, historico, capa, legenda e idempotencia',async()=>{
  const f=fixture('sucesso'),orig=snapshot(f.repo),r=await executar(f);
  eq(r.exit,0);eq(snapshot(f.repo),orig);semTrava(f);eq(recibos(f).length,1);
  const arq=recibos(f)[0],anterior=hash(arq),rec=JSON.parse(fs.readFileSync(arq,'utf8'));
  eq(rec.formato,1);eq(rec.arquivos.map(x=>x.origem).sort(),Object.keys(f.dados).sort());
  for(const x of rec.arquivos){eq(hash(path.join(f.repo,x.origem)),x.sha256);eq(hash(path.join(f.painel,x.destino)),x.sha256);eq(cat.idDe(x.origem),cat.idDe(path.relative(f.repo,path.join(f.repo,x.origem)).split(path.sep).join('/')));}
  const bytes=listar(f.painel).filter(p=>!recibos(f).includes(p)).map(p=>[p,hash(p)]);let copias=0;
  const replay=await executar(f,{aposCopia(){copias++;}});eq(replay.exit,0);eq(copias,0);eq(hash(arq),anterior,'recibo anterior imutavel');eq(recibos(f).length,2,'novo recibo independente sem sobrescrever anterior');
  eq(listar(f.painel).filter(p=>!recibos(f).includes(p)).map(p=>[p,hash(p)]),bytes);eq(snapshot(f.repo),orig);semTrava(f);
 });
 await check('conflito preexistente preserva destino, origem e recibo anterior',async()=>{
  const f=fixture('conflito');fs.mkdirSync(path.dirname(f.destino),{recursive:true});fs.writeFileSync(f.destino,'CONFLITO');fs.mkdirSync(path.join(f.painel,'Registros'));
  const old=path.join(f.painel,'Registros/migracao-anterior.json');fs.writeFileSync(old,'RECIBO-ANTERIOR');const antes=snapshot(f.painel),orig=snapshot(f.repo);
  const r=await executar(f);falhou(f,r,/conteúdo diferente/);eq(snapshot(f.painel),antes);eq(snapshot(f.repo),orig);eq(recibos(f),[old]);
 });
 await check('porta ocupada real recusa antes de copiar e libera reserva',async()=>{
  const f=fixture('porta'),server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {const r=await executar(f,{porta:server.address().port});falhou(f,r,/painel está ligado/);ok(!fs.existsSync(f.painel));eq(r.writes.filter(x=>x[0]==='copy').length,0);}
  finally{await new Promise(resolve=>server.close(resolve));}
 });
 await check('trava preexistente nao e removida nem alterada',async()=>{
  const f=fixture('reservado'),lock=path.join(f.repo,'.grana-admin-writer.lock');fs.writeFileSync(lock,'OUTRO-DONO');const r=await executar(f);
  eq(r.exit,1);ok(r.logs.some(x=>/trava de escrita/.test(x)));eq(fs.readFileSync(lock,'utf8'),'OUTRO-DONO');ok(!fs.existsSync(f.painel));
 });
 await check('origem muda apos copia: nenhum recibo falso, anterior preservado',async()=>{
  const f=fixture('mudanca');fs.mkdirSync(path.join(f.painel,'Registros'),{recursive:true});const old=path.join(f.painel,'Registros/migracao-anterior.json');fs.writeFileSync(old,'ANTERIOR');
  const r=await executar(f,{aposCopia(args){if(args[0]===f.arquivo)fs.writeFileSync(f.arquivo,'MUTACAO-EXTERNA');}});
  falhou(f,r,/conferência origem\/destino/);eq(recibos(f),[old]);eq(fs.readFileSync(old,'utf8'),'ANTERIOR');ok(hash(f.arquivo)!==hash(f.destino));
 });
 for(const tipo of ['adicao','remocao'])await check('inventario '+tipo+' recusa ativacao',async()=>{
  const f=fixture('inventario-'+tipo);let fez=false;
  const r=await executar(f,{aposCopia(args){if(args[0]!==f.arquivo||fez)return;fez=true;if(tipo==='adicao'){const p=path.join(f.repo,S,'aprovados','novo.png');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'NOVO');}else fs.unlinkSync(f.arquivo);}});
  falhou(f,r,/inventário da origem mudou/);eq(recibos(f),[]);
 });
 await check('falha de copia visivel libera trava e permite retomar',async()=>{
  const f=fixture('falha-copia'),r=await executar(f,{io:{copyFileSync(){throw Error('copia-injetada');}}});
  falhou(f,r,/copia-injetada/);eq(recibos(f),[]);eq(listar(f.painel).filter(p=>p.endsWith('.tmp')),[]);
  const depois=await executar(f);eq(depois.exit,0);semTrava(f);
 });
 await check('falha de gravacao de recibo: limpa temporario e preserva recibo anterior',async()=>{
  const f=fixture('falha-recibo');fs.mkdirSync(path.join(f.painel,'Registros'),{recursive:true});const old=path.join(f.painel,'Registros/migracao-anterior.json');fs.writeFileSync(old,'ANTERIOR');const antes=hash(old);
  const r=await executar(f,{io:{writeFileSync(...args){if(typeof args[0]==='number')throw Error('recibo-injetado');return fs.writeFileSync(...args);}}});
  falhou(f,r,/recibo-injetado/);eq(recibos(f),[old]);eq(hash(old),antes);eq(listar(f.painel).filter(p=>p.endsWith('.tmp')),[]);
 });
 await check('recibo publicado por ultimo: reserva e hashes reais conferidos antes do link',async()=>{
  const f=fixture('ultimo');let publicou=false;
  const r=await executar(f,{io:{linkSync(a,b){if(/^migracao-.+\.json$/.test(path.basename(b))){eq(recibos(f),[]);ok(fs.existsSync(path.join(f.repo,'.grana-admin-writer.lock')));const rec=JSON.parse(fs.readFileSync(a,'utf8'));for(const x of rec.arquivos){eq(hash(path.join(f.repo,x.origem)),x.sha256);eq(hash(path.join(f.painel,x.destino)),x.sha256);}publicou=true;}return fs.linkSync(a,b);}}});
  eq(r.exit,0);ok(publicou);eq(recibos(f).length,1);eq(listar(f.painel).filter(p=>p.endsWith('.tmp')),[]);semTrava(f);
 });
 await check('conflito tardio nao sobrescreve arquivo de outro writer',async()=>{
  const f=fixture('conflito-tardio'),r=await executar(f,{io:{linkSync(a,b){if(b===f.destino)fs.writeFileSync(b,'OUTRO-ARQUIVO');return fs.linkSync(a,b);}}});
  falhou(f,r,/EEXIST/);eq(fs.readFileSync(f.destino,'utf8'),'OUTRO-ARQUIVO');eq(recibos(f),[]);eq(listar(f.painel).filter(p=>p.endsWith('.tmp')),[]);
 });
 await check('destino adulterado depois da copia nao ativa',async()=>{
  const f=fixture('destino-mudou'),r=await executar(f,{io:{linkSync(a,b){fs.linkSync(a,b);if(b===f.destino)fs.writeFileSync(b,'ALTERADO');}}});
  falhou(f,r,/conferência origem\/destino/);eq(recibos(f),[]);eq(fs.readFileSync(f.arquivo,'utf8'),f.dados[REL]);
 });
 await check('troca tardia de Registros por junction recusa escrita fora',async()=>{
  const f=fixture('registros-tardio');let fez=false;
  const r=await executar(f,{aposCopia(args){if(args[0]!==f.arquivo||fez)return;fez=true;fs.renameSync(path.join(f.painel,'Registros'),path.join(f.painel,'registros-original'));fs.symlinkSync(f.fora,path.join(f.painel,'Registros'),'junction');}});
  falhou(f,r,/link|junction|ancoragem/);eq(snapshot(f.fora),[]);eq(recibos(f),[]);
 });
 await check('modo seco sem trava, pasta, temporarios ou recibos',async()=>{
  const f=fixture('seco'),antes=snapshot(f.repo),r=await executar(f,{modo:'--seco'});
  eq(r.exit,0);eq(r.writes,[]);eq(snapshot(f.repo),antes);ok(!fs.existsSync(f.painel));semTrava(f);
 });
 await check('pai inexistente nao autoriza escrever fora da raiz do painel',async()=>{
  const f=fixture('pai-ausente');f.painel=path.join(f.dir,'pai-ausente','painel');const r=await executar(f);
  falhou(f,r,/pai da pasta do painel precisa existir/);ok(!fs.existsSync(path.dirname(f.painel)));eq(recibos(f),[]);
 });
 await check('arquivo da origem com nome de ativacao nao vira recibo prematuro',async()=>{
  const f=fixture('nome-reservado'),rel='docs/marketing/painel/migracao-isca.json';fs.writeFileSync(path.join(f.repo,rel),'ISCA');f.dados[rel]='ISCA';
  const r=await executar(f);falhou(f,r,/nome reservado/);ok(!fs.existsSync(f.painel));eq(recibos(f),[]);
 });
 if(failures.length)throw Error(`${failures.length} cenarios falharam`);
 console.log(JSON.stringify({grupos,assertions,fixture:base,fonteSha256:crypto.createHash('sha256').update(fonte).digest('hex')}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
