// SQL real em PostgreSQL embutido; sem credencial ou chamada externa.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const sql=n=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',n),'utf8');
let checks=0;
const ok=(v,n)=>{assert.ok(v,n);checks++;};
(async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   grant usage on schema public to anon,authenticated,service_role;
   create schema auth; grant usage on schema auth to authenticated;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb$$;
   create table auth.users(id uuid primary key,email text,deleted_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
   create table subscriptions(id uuid primary key,user_id uuid,status text,access_until timestamptz,grace_until timestamptz,email_compra text);
   create table app_backend_config(id int primary key,enforce_subscriptions boolean);insert into app_backend_config values(1,true);
   create schema cron;create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text,active boolean);
   create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare v bigint;begin
     insert into cron.job(jobname,schedule,command,active) values($1,$2,$3,true)
     on conflict(jobname) do update set schedule=$2,command=$3 returning jobid into v;return v;end$$;
   create function cron.alter_job(bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
   insert into auth.users values('00000000-0000-0000-0000-000000000001','conta@example.invalid',null,false,null),
    ('00000000-0000-0000-0000-000000000002','outra@example.invalid',null,false,null);`);
  for(const t of ['transactions','bills','credit_cards','goals'])await db.exec(`create table ${t}(user_id uuid,conteudo text);
   alter table ${t} enable row level security;grant select on ${t} to authenticated;
   create policy bloqueado on ${t} for select to authenticated using(false);
   insert into ${t} values('00000000-0000-0000-0000-000000000001','privado'),
    ('00000000-0000-0000-0000-000000000002','outra conta'),('00000000-0000-0000-0000-000000000002','outro');`);
  const rpc=sql('20261024140000_resumo_dados_guardados.sql'),mail=sql('20261024140100_avisos_assinatura.sql');
  await db.exec(rpc);await db.exec(rpc);await db.exec(mail);await db.exec(mail);
  ok(true,'migrations reaplicáveis');
  await db.exec(`set role authenticated;set test.uid='00000000-0000-0000-0000-000000000001'`);
  assert.deepEqual((await db.query('select resumo_dados_guardados() v')).rows[0].v,{lancamentos:1,contas:1,cartoes:1,metas:1});checks++;
  ok((await db.query('select * from transactions')).rows.length===0,'RLS financeira continua bloqueada');
  await db.exec(`set test.uid='00000000-0000-0000-0000-000000000002'`);
  ok((await db.query('select resumo_dados_guardados() v')).rows[0].v.lancamentos===2,'conta B só vê B');
  await db.exec(`set test.uid='00000000-0000-0000-0000-000000000003'`);
  ok(Object.values((await db.query('select resumo_dados_guardados() v')).rows[0].v).every(x=>x===0),'conta sem dados recebe zeros numéricos');
  await db.exec(`set test.uid=''`);await assert.rejects(db.query('select resumo_dados_guardados()'),/Autenticação/);checks++;
  await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001';set test.jwt='{"is_anonymous":true}'`);
  await assert.rejects(db.query('select resumo_dados_guardados()'),/Autenticação/);checks++;
  await db.exec(`reset role;set test.jwt='{}'`);
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);
   if(role==='anon'){await assert.rejects(db.query('select resumo_dados_guardados()'),/permission denied/);checks++;}
   for(const q of ['select * from avisos_assinatura_enviados','select * from listar_assinaturas_para_avisos()',
     `select reservar_aviso_assinatura(null,'venceu',now())`]){await assert.rejects(db.query(q),/permission denied/);checks++;}
   await db.exec('reset role');
  }
  const cfg=(await db.query(`select proconfig,prosecdef from pg_proc where proname='resumo_dados_guardados'`)).rows[0];
  ok(cfg.prosecdef&&cfg.proconfig.some(x=>/^search_path=("")?$/.test(x)),'security definer search_path vazio');
  const cron=(await db.query('select * from cron.job')).rows;
  ok(cron.length===1&&cron[0].schedule==='0 13 * * *'&&cron[0].active===false,'cron 10BRT único e inativo');
  const sid='10000000-0000-0000-0000-000000000001';
  await db.exec(`insert into subscriptions values('${sid}','00000000-0000-0000-0000-000000000001','canceled',now()+interval '3 days',null,'compra@example.invalid')`);
  const prazo=(await db.query('select access_until from subscriptions')).rows[0].access_until;
  const reserve=()=>db.query(`select reservar_aviso_assinatura($1,'antes_3',$2) v`,[sid,prazo]);
  await db.exec('set role service_role');
  const r=(await reserve()).rows[0].v;ok(r?.id&&r.email==='conta@example.invalid','reserva com email da conta antes da compra');
  ok((await reserve()).rows[0].v===null,'segunda reserva não repete');
  ok((await db.query('select count(*) n from avisos_assinatura_enviados')).rows[0].n===1,'índice garante uma escrita');
  await db.exec('reset role');
  await db.exec(`delete from avisos_assinatura_enviados;update auth.users set email='' where id='00000000-0000-0000-0000-000000000001'`);
  ok((await reserve()).rows[0].v===null,'conta sem email atual não usa compra sem prova de identidade');
  ok((await db.query('select count(*) n from avisos_assinatura_enviados')).rows[0].n===0,'sem destinatário seguro não reserva envio');
  await db.exec(`update auth.users set email='atual@example.invalid' where id='00000000-0000-0000-0000-000000000001'`);
  ok((await reserve()).rows[0].v.email==='atual@example.invalid','troca de email usa endereço atual, nunca endereço de compra antigo');
  await db.exec(`delete from avisos_assinatura_enviados;update auth.users set deleted_at=now() where id='00000000-0000-0000-0000-000000000001'`);
  ok((await reserve()).rows[0].v===null,'conta apagada não aciona fallback');
  ok((await db.query('select * from listar_assinaturas_para_avisos()')).rows.length===0,'conta apagada fora da listagem');
  await db.exec(`delete from auth.users where id='00000000-0000-0000-0000-000000000001'`);
  ok((await reserve()).rows[0].v===null,'auth.users ausente não aciona fallback');
  ok((await db.query('select * from listar_assinaturas_para_avisos()')).rows.length===0,'auth.users ausente fora da listagem');
  await db.exec(`insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','conta@example.invalid');update subscriptions set user_id=null where id='${sid}'`);
  ok((await reserve()).rows[0].v===null,'assinatura legada desvinculada não envia email de compra');
  ok((await db.query('select * from listar_assinaturas_para_avisos()')).rows.length===0,'legado desvinculado fora da listagem');
  await db.exec(`update subscriptions set user_id='00000000-0000-0000-0000-000000000001' where id='${sid}'`);
  await db.exec(`delete from avisos_assinatura_enviados;insert into subscriptions values('20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001','active',now()+interval '30 days',null,'nova@example.invalid')`);
  ok((await reserve()).rows[0].v===null,'renovação entre seleção e reserva impede aviso');
  await db.exec(`delete from subscriptions where id<>'${sid}';delete from avisos_assinatura_enviados;
   insert into subscriptions select '20000000-0000-0000-0000-000000000001',user_id,status,access_until,grace_until,email_compra from subscriptions where id='${sid}'`);
  ok(!!(await reserve()).rows[0].v,'canceled com prazo igual permite assinatura canônica');
  ok((await db.query(`select reservar_aviso_assinatura('20000000-0000-0000-0000-000000000001','antes_3',$1) v`,[prazo])).rows[0].v===null,'canceled duplicada não reserva outro aviso');
  await db.exec(`delete from subscriptions where id<>'${sid}';delete from avisos_assinatura_enviados;
   update subscriptions set access_until=date_trunc('day',now())+interval '3 days 13 hours 0.123456 seconds'`);
  const exato=(await db.query('select access_until::text v from subscriptions')).rows[0].v;
  ok((await db.query(`select reservar_aviso_assinatura($1,'antes_3',$2) v`,[sid,new Date(exato).toISOString()])).rows[0].v===null,'timestamp truncado é corretamente recusado pelo SQL');
  ok(!!(await db.query(`select reservar_aviso_assinatura($1,'antes_3',$2) v`,[sid,exato])).rows[0].v,'timestamp original com microssegundos reserva normalmente');
  await db.exec(`delete from subscriptions where id<>'${sid}'; update subscriptions set access_until=now()-interval '1 hour',status='expired'`);
  const expired=(await db.query('select access_until from subscriptions')).rows[0].access_until;
  const venceu=()=>db.query(`select reservar_aviso_assinatura($1,'venceu',$2) v`,[sid,expired]);
  ok(!!(await venceu()).rows[0].v,'vencimento recente é reservado');
  await db.exec(`delete from avisos_assinatura_enviados;update subscriptions set status='refunded'`);
  ok((await venceu()).rows[0].v===null,'reembolso não recebe aviso');
  await db.exec(`update subscriptions set status='past_due',grace_until=now()+interval '5 days'`);
  ok((await venceu()).rows[0].v===null,'carência protege aviso de vencido');
  await db.exec(`update subscriptions set status='expired',grace_until=null;update app_backend_config set enforce_subscriptions=false`);
  ok((await venceu()).rows[0].v===null,'bloqueio desligado não gera email');
  console.log(`avisos-assinatura-migration: ${checks} checagens OK (SQL real local)`);
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
