'use strict';
// SQL e adaptador Graph reais. Somente PGlite e transporte dublado; sem .env/rede.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Module=require('node:module'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),cache=new Map();
function carregar(rel){const abs=path.resolve(root,rel);if(cache.has(abs))return cache.get(abs).exports;
 const m=new Module(abs,module);cache.set(abs,m);m.require=id=>id.startsWith('npm:')?{}:carregar(path.relative(root,path.resolve(path.dirname(abs),id)));
 m._compile(ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,abs);return m.exports;}
const {criarAdaptadorGraphReal}=carregar('supabase/functions/_shared/marketing-real-graph.ts');
const {rpcReal}=carregar('supabase/functions/_shared/admin-publicacoes-reais.ts');
const FILE='20261021083000_admin_marketing_real_midia_formato.sql';
const BASE=['20261015190000_admin_marketing_fundacao.sql','20261016140000_admin_marketing_operacoes.sql',
 '20261018001000_admin_marketing_real.sql','20261018230000_admin_marketing_renovacao.sql',
 '20261019120000_admin_marketing_consultar_preparo.sql','20261020120000_admin_marketing_real_recuperacao_v1.sql'];
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const reject=async(p,re)=>{await assert.rejects(p,re);checks++;};
(async()=>{const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 grant usage on schema public to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 const comV2=process.argv.includes('--com-v2');
 for(const f of BASE){
  if(comV2&&f===BASE.at(-1))await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261019210000_admin_marketing_real_v2_aditiva.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 }
 const admin=randomUUID(),ig='00000000-0000-4000-8000-000000000001',fb='00000000-0000-4000-8000-000000000002';
 const cap=['feed','carrossel','reels','stories'].map(formato=>({formato,estado:'disponivel',revisao:1}));
 await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
 values($1,'instagram','123','IG fixture','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',false,$3),
 ($2,'facebook','456','FB fixture','MARKETING_FB_TOKEN','verificada',now()+interval '1 day',false,$3)`,[ig,fb,cap]);
 await db.exec(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_facebook=false,pausa_instagram=false,
 recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day';set role service_role`);
 const rpc=async(n,args=[])=>(await db.query(`select public.admin_marketing_real_${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
 let serial=0;const midia=(tipo='imagem',mime='image/jpeg')=>({ordem:0,tipo,mime,bytes:100,sha256:'b'.repeat(64)});
 const video=()=>midia('video','video/mp4');
 async function snapshot(midias,capa=null,editorial={}){const hex=(++serial).toString(16).padStart(16,'0');
  let s=await rpc('snapshot_iniciar',[admin,{pecaId:hex,versao:hex.padStart(40,'0'),aceiteId:'fixture',aceiteRevisao:1,
   legenda:'Legenda fixture aprovada.',legendaSha256:'a'.repeat(64),midias,capa,...editorial}]);
  return rpc('snapshot_finalizar',[admin,s.id,1,{identidade:s.identidade,midias:s.dados.midias,capa:s.dados.capa??null}]);}
 const destino=(contaId,formato)=>({contaId,formato,publicarEm:new Date(Date.now()+3600000).toISOString(),fuso:'America/Sao_Paulo'});
 const prever=(s,d)=>rpc('previa',[admin,{snapshotId:s.id,snapshotRevisao:s.revisao,destinos:d}]);
 const confirmar=(p,idem=randomUUID())=>rpc('confirmar',[admin,p.id,p.hash,1,idem]);
 const efeitos=async()=> (await db.query(`select jsonb_build_object('previas',(select count(*) from public.admin_marketing_real_previas),
 'lotes',(select count(*) from public.admin_marketing_real_lotes),'autorizacoes',(select count(*) from public.admin_marketing_autorizacoes),
 'jobs',(select count(*) from public.admin_marketing_agendamentos),'comandos',(select count(*) from public.admin_marketing_real_comandos),
 'envios',(select count(*) from public.admin_marketing_envios)) r`)).rows[0].r;
 // Prévia e autorização legadas existentes ANTES da correção: não alterar os dados históricos.
 const sv=await snapshot([video()]);
 const antigas=[await prever(sv,[destino(ig,'feed')]),await prever(sv,[destino(fb,'feed')])];
 const mista=await prever(sv,[destino(ig,'reels'),destino(fb,'feed')]);
 const idemLegado=randomUUID(),loteLegado=await confirmar(antigas[0],idemLegado);
 const job=(await db.query('select * from public.admin_marketing_agendamentos where lote_id=$1',[loteLegado.loteId])).rows[0];
 const dr=destino(ig,'feed');
 const pr=await rpc('previa',[admin,{jobId:job.id,destinos:[dr]}]);
 if(!process.argv.includes('--baseline')){
  await db.exec('reset role');
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',FILE),'utf8'));
  await db.exec('set role service_role');
 }
 const before=await efeitos();
 await reject(prever(sv,[destino(ig,'feed')]),/midia-incompativel/);
 await reject(prever(sv,[destino(fb,'feed')]),/midia-incompativel/);
 eq(await efeitos(),before,'prévia MP4+Feed não cria prévia, lote, autorização, job ou tentativa');
 for(const p of antigas)await reject(confirmar(p),/midia-incompativel/);
 await reject(confirmar(mista),/midia-incompativel/);
 eq(await efeitos(),before,'confirmação antiga/lote misto revalida e desfaz todos os efeitos');
 await reject(rpc('previa',[admin,{jobId:job.id,destinos:[dr]}]),/midia-incompativel/);
 await reject(rpc('comando',[admin,{acao:'reagendar',jobId:job.id,revisaoEsperada:job.revisao,idempotencia:randomUUID(),
  previaId:pr.id,previaHash:pr.hash,publicarEm:dr.publicarEm,fuso:dr.fuso}]),/midia-incompativel/);
 eq(await efeitos(),before,'reagendamento com prévia legada não cria sucessor nem recibo');
 eq((await db.query('select estado from public.admin_marketing_agendamentos where id=$1',[job.id])).rows[0].estado,job.estado,'não cancela o job histórico');
 eq(await confirmar(antigas[0],idemLegado),{loteId:loteLegado.loteId,replay:true},'replay histórico retorna recibo sem nova autorização');
 eq(await efeitos(),before,'replay não cria nada');
 const rows=await db.query(`select pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('admin_marketing_real_midia_compativel','admin_marketing_real_previa','admin_marketing_real_confirmar','admin_marketing_real_comando')`);
 eq(rows.rows.length,4,'helper e três consumidores');for(const r of rows.rows){eq(r.owner,'postgres','owner preservado');eq(r.prosecdef,false,'invoker');eq(r.proconfig,['search_path=""'],'search_path vazio');eq([r.anon,r.authenticated,r.service],[false,false,true],'grants preservados');}
 for(const dados of [null,{}, {midias:null},{midias:[]},{midias:Array.from({length:11},()=>midia())},{midias:[{tipo:'imagem'}]},{midias:[{tipo:'video',mime:'image/jpeg'}]}]){
  eq((await db.query('select public.admin_marketing_real_midia_compativel($1,$2,$3) r',[dados,'instagram','feed'])).rows[0].r,false,'metadados incompletos nunca viram compatíveis');
 }
 await db.exec('set role anon');
 await reject(db.query("select public.admin_marketing_real_midia_compativel('{}','instagram','feed')"),/permission denied/);
 await db.exec('set role service_role');
 // Matriz de mídia do executor real, sem enviar nada à Meta.
 const cases=[
  ['imagem-feed',[midia()],'feed',true,true],['video-feed',[video()],'feed',false,false],
  ['duas-feed',[midia(),midia()],'feed',false,false],['carrossel-imagens',[midia(),midia()],'carrossel',true,true],
  ['carrossel-misto',[midia(),video()],'carrossel',true,false],['carrossel-unitario',[midia()],'carrossel',false,false],
  ['video-reels',[video()],'reels',true,true],['imagem-reels',[midia()],'reels',false,false],
  ['video-stories',[video()],'stories',true,false],['imagem-stories',[midia()],'stories',true,false],
  ['png-feed',[midia('imagem','image/png')],'feed',false,true],
 ];
 let accepted=0,blocked=0;
 for(const [label,midias,formato,allowIg,allowFb] of cases){
  const s=await snapshot(midias);for(const [conta,rede,allow] of [[ig,'instagram',allowIg],[fb,'facebook',allowFb]]){
   const prior=await efeitos();
   if(allow){const p=await prever(s,[destino(conta,formato)]);const l=await confirmar(p);eq(!!l.loteId,true,label+' '+rede+' válido');accepted++;}
   else{await reject(prever(s,[destino(conta,formato)]),/midia-incompativel/);eq(await efeitos(),prior,label+' '+rede+' zero efeitos');blocked++;}
   const calls=[];const graph=criarAdaptadorGraphReal({versao:'v24.0',token:'fixture-only',signal:new AbortController().signal,
    assinar:async m=>{calls.push({kind:'assinar',mime:m.mime});return 'https://fixture.invalid/midia';},
    rede:async(url,opts)=>{calls.push({kind:'http',method:opts.method,path:new URL(url).pathname});return new Response(JSON.stringify({id:'789',video_id:'790',upload_url:'https://rupload.facebook.com/video-upload/790'}),{status:200});}});
   const result=await graph.executar({jobId:randomUUID(),rede,formato,etapa:'preparar',remotoContaId:'123',processamento:{}},s.dados);
   // IG image+Reels is conservatively refused by v2 too: the Graph adapter builds image_url+REELS
   // without rejecting before POST. Never interpret this local request as Meta acceptance.
   if(label==='imagem-reels'&&rede==='instagram'){
    eq(allow,false,'imagem não vira Reel');eq(calls.some(c=>c.kind==='http'),true,'lacuna atual do executor IG demonstrada sem rede');
   }else{
    eq(result.estado==='falhou',!allow,label+' '+rede+' paridade de recusa/preparo');
    if(!allow)eq(calls.length,0,label+' '+rede+' executor recusa antes de assinar/Graph');
    else eq(calls.some(c=>c.kind==='http'&&c.method==='POST'),true,label+' '+rede+' executa preparo por transporte dublado');
   }
  }
 }
 const sc=await snapshot([video()],midia('imagem','image/png'));
 await reject(prever(sc,[destino(ig,'reels')]),/midia-incompativel/);
 const foreign=randomUUID();await reject(rpc('previa',[foreign,{snapshotId:sv.id,snapshotRevisao:sv.revisao,destinos:[destino(ig,'feed')]}]),/snapshot-indisponivel/);
 const client={rpc:(n,args)=>({abortSignal:async()=>{try{return {data:await rpc(n.replace('admin_marketing_real_',''),[args.p_admin,args.p_pedido]),error:null};}catch(e){return {data:null,error:{message:e.message}};}}})};
 await reject(rpcReal(client,'previa',{p_admin:admin,p_pedido:{snapshotId:sv.id,snapshotRevisao:sv.revisao,destinos:[destino(ig,'feed')]}},new AbortController().signal),e=>e.codigo==='midia-incompativel'&&e.status===409);
 if(comV2){
  const cid=randomUUID();
  const adotado=await snapshot([midia(),midia()],null,{conteudoId:cid,geracaoEditorial:1});
  await db.exec('reset role');
  await db.query(`insert into public.admin_marketing_conteudos(id,admin_id,geracao,estado,peca_id,versao)
   values($1,$2,1,'em-revisao',$3,$4)`,[cid,admin,adotado.dados.pecaId,adotado.dados.versao]);
  await db.query(`insert into public.admin_marketing_conteudo_aliases(admin_id,peca_id,conteudo_id) values($1,$2,$3)`,[admin,adotado.dados.pecaId,cid]);
  await db.exec('set role service_role');
  const pendente=await prever(adotado,[destino(ig,'carrossel'),destino(fb,'carrossel')]);
  const anterior=await efeitos();
  await reject(confirmar(pendente),/revisao-editorial-pendente/);
  eq(await efeitos(),anterior,'triggerV2 inválido preserva atomicidade de loteV1 e não cria autorização/job');
  await db.exec('reset role');await db.query("update public.admin_marketing_conteudos set estado='aceito' where id=$1",[cid]);await db.exec('set role service_role');
  const aceito=await confirmar(pendente);
  eq((await db.query('select count(*)::int n from public.admin_marketing_agendamentos where lote_id=$1',[aceito.loteId])).rows[0].n,2,'carrosselV1 adotado válido aceita os dois destinos sob triggerV2');
 }
 // Retorno local aos três corpos anteriores, sem apagar adições ou dados.
 const previous=fs.readFileSync(path.join(root,'supabase/migrations',BASE.at(-1)),'utf8');
 const names=['previa','confirmar','comando'];
 const snapshotCounts=await efeitos();
 await db.exec('reset role');
 for(const n of names){const re=new RegExp('create or replace function public\\.admin_marketing_real_'+n+'\\([\\s\\S]*?end \\$\\$;');const old=previous.match(re);assert.ok(old,n);await db.exec(old[0]);}
 await db.exec('set role service_role');
 eq(await efeitos(),snapshotCounts,'retorno das RPCs não reverte dados/recibos');
 eq(!!(await prever(sv,[destino(fb,'feed')])).id,true,'retorno restaura comportamento anterior e sua limitação');
 console.log(JSON.stringify({suite:'marketing-real-midia-formato',checks,accepted,blocked,comV2,baseline:false,remoteHTTP:0,returnTested:true,graphTransport:'dublado',historicalRowsPreserved:true}));
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
