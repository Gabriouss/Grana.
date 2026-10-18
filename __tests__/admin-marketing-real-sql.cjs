// SQL de producao real em PGlite. Nenhuma instancia Supabase/Meta e chamada.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;};
async function main(){
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const f of ['20261015190000_admin_marketing_fundacao.sql','20261016140000_admin_marketing_operacoes.sql','20261018001000_admin_marketing_real.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  const rpc=async(n,args=[])=>{const r=await db.query(`select public.admin_marketing_real_${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args);return r.rows[0].r;};
  const admin=randomUUID(),account=randomUUID(),worker=randomUUID();
  const pedido={pecaId:'a'.repeat(16),versao:'b'.repeat(40),aceiteId:'aceite-fixture',aceiteRevisao:1,
   legenda:'Legenda aprovada.',legendaSha256:'c'.repeat(64),midias:[{sha256:'d'.repeat(64),mime:'image/jpeg',bytes:100,tipo:'imagem',ordem:0}],capa:null};
  await db.exec('set role service_role');
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
   values($1,'instagram','123','Conta fixture','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',false,$2)`,[account,[{formato:'feed',estado:'disponivel',revisao:1},{formato:'carrossel',estado:'disponivel',revisao:1}]]);
  let snap=await rpc('snapshot_iniciar',[admin,pedido]);ok(snap.estado==='recebendo','snapshot nasce pendente');
  ok((await rpc('snapshot_iniciar',[admin,pedido])).id===snap.id,'repetir snapshot nao duplica');
  await assert.rejects(rpc('snapshot_finalizar',[admin,snap.id,1,{}]),/midia-divergente/);checks++;
  snap=await rpc('snapshot_finalizar',[admin,snap.id,1,{identidade:snap.identidade,midias:snap.dados.midias,capa:null}]);ok(snap.estado==='pronto'&&snap.revisao===2,'finaliza apos verificacao');
  const future=new Date(Date.now()+3600000).toISOString(),dest={contaId:account,formato:'feed',publicarEm:future,fuso:'America/Sao_Paulo'};
  const previa=()=>rpc('previa',[admin,{snapshotId:snap.id,snapshotRevisao:2,destinos:[dest]}]);
  let p=await previa();
  await assert.rejects(rpc('confirmar',[admin,p.id,p.hash,1,randomUUID()]),/operacao-bloqueada/);checks++;
  await db.query(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,
   recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 hour'`);
  const idem=randomUUID();const confirms=await Promise.all([rpc('confirmar',[admin,p.id,p.hash,1,idem]),rpc('confirmar',[admin,p.id,p.hash,1,idem])]);
  ok(confirms[0].loteId===confirms[1].loteId&&confirms[1].replay,'duas invocacoes confirmar criam um lote');
  ok((await db.query('select count(*)::int as n from public.admin_marketing_agendamentos')).rows[0].n===1,'um destino um job');
  const other=await previa();await assert.rejects(rpc('confirmar',[admin,other.id,other.hash,1,randomUUID()]),/agendamento-ja-existe/);checks++;
  await assert.rejects(rpc('confirmar',[admin,other.id,other.hash,1,idem]),/idempotencia-divergente/);checks++;
  // Simula a chegada do horario sem mudar clock de producao ou a autorizacao.
  await db.exec('reset role');await db.query(`update public.admin_marketing_autorizacoes set publicar_em=now()-interval '1 minute',confirmado_em=now()-interval '1 day'`);
  await db.exec('set role service_role');
  await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()`);
  const two=await Promise.all([rpc('claim',[worker,3]),rpc('claim',[randomUUID(),3])]);
  ok(two[0].length===1&&two[1].length===0,'duas invocacoes claim so uma admite o destino');
  const first=two[0][0];ok(first.etapa==='preparar','primeira etapa NAO publica');
  await assert.rejects(rpc('recibo',[worker,first.jobId,first.leaseId,first.revisao,{estado:'publicado',remotoId:'123'}]),/recibo-invalido/);checks++;
  await rpc('recibo',[worker,first.jobId,first.leaseId,first.revisao,{estado:'processando',processamento:{containers:['container-1']}}]);
  ok((await db.query(`select count(*)::int as n from public.admin_marketing_envios where operacao='publicar'`)).rows[0].n===0,'preparo confirmado nao cria recibo publicar');
  await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()`);
  const poll=(await rpc('claim',[worker,3]))[0];ok(poll.etapa==='consultar-preparo','poll persistido');
  await rpc('recibo',[worker,poll.jobId,poll.leaseId,poll.revisao,{estado:'pronto'}]);
  await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()`);
  const pub=(await rpc('claim',[worker,3]))[0];ok(pub.etapa==='publicar','publicar somente depois de preparo pronto');
  await rpc('recibo',[worker,pub.jobId,pub.leaseId,pub.revisao,{estado:'publicacao-aceita',remotoId:'post-1'}]);
  ok((await db.query(`select estado from public.admin_marketing_agendamentos`)).rows[0].estado!=='publicado','POST aceito ainda exige readback');
  await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()`);
  const verify=(await rpc('claim',[worker,3]))[0];ok(verify.etapa==='verificar-publicacao','readback em etapa separada');
  await rpc('recibo',[worker,verify.jobId,verify.leaseId,verify.revisao,{estado:'publicado',remotoId:'post-1'}]);
  ok((await rpc('claim',[worker,3])).length===0,'terminal nao repete');
  await assert.rejects(rpc('recibo',[worker,pub.jobId,pub.leaseId,pub.revisao,{estado:'publicacao-aceita',remotoId:'post-2'}]),/revisao-divergente/);checks++;
  ok((await db.query(`select count(*)::int as n from public.admin_marketing_envios where operacao='publicar'`)).rows[0].n===1,'publicar exatamente um intento');
  await assert.rejects(db.query(`update public.admin_marketing_real_snapshots set dados='{}' where id=$1`,[snap.id]),/permission denied/);checks++;
  // Sondas do Lynx (B1-B3, 18/10/2026) viradas regressao.
  const ig=randomUUID(),fb=randomUUID(),cap=[{formato:'feed',estado:'disponivel',revisao:1}];
  await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
   values($1,'instagram','201','IG fixture','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',false,$3),
   ($2,'facebook','202','FB fixture','MARKETING_FB_TOKEN','verificada',now()+interval '1 day',false,$3)`,[ig,fb,cap]);
  await db.exec('reset role');await db.query(`update public.admin_marketing_controles set pausa_facebook=false`);await db.exec('set role service_role');
  const novoSnap=async i=>{const s=await rpc('snapshot_iniciar',[admin,{...pedido,midias:[{...pedido.midias[0],sha256:String(i).padStart(64,'e')}]}]);
   return rpc('snapshot_finalizar',[admin,s.id,1,{identidade:s.identidade,midias:s.dados.midias,capa:null}]);};
  const agendar=async(s,conta,quando)=>{const pv=await rpc('previa',[admin,{snapshotId:s.id,snapshotRevisao:2,destinos:[{contaId:conta,formato:'feed',publicarEm:quando,fuso:'America/Sao_Paulo'}]}]);
   return rpc('confirmar',[admin,pv.id,pv.hash,1,randomUUID()]);};
  const fila=[];for(const [i,conta] of [[1,ig],[2,ig],[3,ig],[4,fb]])fila.push((await agendar(await novoSnap(i),conta,future)).loteId);
  await db.exec('reset role');
  await db.query(`update public.admin_marketing_agendamentos g set proxima_verificacao_em=now()-case when c.rede='instagram' then interval '5 minutes' else interval '1 minute' end
   from public.admin_marketing_real_contas c where c.id=g.conta_id and g.lote_id=any($1)`,[fila]);
  await db.query(`update public.admin_marketing_controles set pausa_instagram=true`);await db.exec('set role service_role');
  let fome=await rpc('claim',[worker,3]);
  ok(fome.length===1&&fome[0].rede==='facebook','B1 jobs pausados no topo nao ocupam o limite do claim');
  ok((await db.query(`select count(*)::int as n from public.admin_marketing_agendamentos where lote_id=any($1) and estado='programado-no-painel' and lease_id is null`,[fila.slice(0,3)])).rows[0].n===3,'B1 pausados seguem intactos na fila');
  await db.exec('reset role');await db.query(`update public.admin_marketing_controles set pausa_instagram=false`);await db.exec('set role service_role');
  fome=await rpc('claim',[worker,3]);ok(fome.length===3&&fome.every(x=>x.rede==='instagram'),'B1 retomar a rede devolve os jobs');
  const T1=new Date(Date.now()+5400000).toISOString(),T2=new Date(Date.now()+7200000).toISOString(),T3=new Date(Date.now()+9000000).toISOString();
  const s5=await novoSnap(5),job5=async()=>(await db.query(`select g.id,g.revisao,g.pausado,a.manifesto->'_destino'->>'publicarEm' as destino_em
   from public.admin_marketing_agendamentos g join public.admin_marketing_autorizacoes a on a.id=g.autorizacao_id
   where g.snapshot_id=$1 and g.estado<>'cancelado'`,[s5.id])).rows;
  await agendar(s5,ig,T1);let [j5]=await job5();
  await rpc('comando',[admin,{acao:'pausar',jobId:j5.id,revisaoEsperada:j5.revisao,idempotencia:randomUUID()}]);[j5]=await job5();
  await rpc('comando',[admin,{acao:'reagendar',jobId:j5.id,revisaoEsperada:j5.revisao,idempotencia:randomUUID(),publicarEm:T2}]);
  const reag=await job5();ok(reag.length===1&&reag[0].id!==j5.id&&reag[0].pausado===true,'B2 reagendar mantem a pausa do job');
  ok(reag[0].destino_em===T2,'B3 manifesto do reagendado guarda o horario novo');
  await assert.rejects(agendar(s5,ig,T2),/agendamento-ja-existe/);checks++;
  ok((await job5()).length===1,'B3 previa nova no alvo reagendado nao cria segundo job');
  await agendar(s5,ig,T3);[j5]=(await job5()).filter(x=>x.destino_em===T2);
  await assert.rejects(rpc('comando',[admin,{acao:'reagendar',jobId:j5.id,revisaoEsperada:j5.revisao,idempotencia:randomUUID(),publicarEm:T3}]),/agendamento-ja-existe/);checks++;
  await rpc('comando',[admin,{acao:'reagendar',jobId:j5.id,revisaoEsperada:j5.revisao,idempotencia:randomUUID(),publicarEm:T1}]);
  ok((await job5()).map(x=>x.destino_em).sort().join()===[T1,T3].sort().join(),'B3 voltar ao horario de um job ja cancelado continua permitido');
  // Grants das colunas NOVAS sao exercidos com service_role durante todo teste.
  const grants=await db.query(`select has_column_privilege('service_role','public.admin_marketing_agendamentos','revisao','UPDATE') as revisao,
    has_column_privilege('service_role','public.admin_marketing_agendamentos','processamento','UPDATE') as processamento`);
  ok(grants.rows[0].revisao&&grants.rows[0].processamento,'grants explicitos de revisao/processamento');
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(rpc('claim',[worker,3]),/permission denied/);checks++;
   await assert.rejects(db.query('select * from public.admin_marketing_real_snapshots'),/permission denied/);checks++;await db.exec('reset role');
  }
  const bucket=(await db.query(`select file_size_limit,allowed_mime_types from storage.buckets where id='marketing-remoto'`)).rows[0];
  ok(Number(bucket.file_size_limit)===47185919&&bucket.allowed_mime_types.join(',')==='image/jpeg,image/png,video/mp4','limite e MIME Storage intactos');
  console.log(`admin-marketing-real-sql: ${checks} verificacoes SQL real; duas invocacoes, zero Meta/servidor`);
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
