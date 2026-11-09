// SQL real em Postgres local, sem conexão/credencial de Supabase.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {novoBanco,novoUsuario,inserir,migration}=require('./helpers/postgres-t5.cjs');
const watchdog=setTimeout(()=>{console.error('Pix SQL: teste não concluiu');process.exit(1);},30000);
const campos=['occurred_on','amount','type','description','category','color','wallet_id','card_id','payment_method','fitid','recurring','parent_id','installment_current','installment_total'];
const dia=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
const snapshot=t=>({...Object.fromEntries(campos.map(k=>[k,t[k]??null])),amount:Number(t.amount),occurred_on:dia(t.occurred_on)});
(async()=>{const db=await novoBanco();try{
  const schema=fs.readFileSync('supabase/schema.sql','utf8');
  await db.exec(schema.match(/alter table transactions add column if not exists fitid[^;]*;/)[0]);
  await db.exec(schema.match(/create unique index if not exists transactions_user_fitid_uniq\s+[^;]*;/)[0]);
  await db.exec("create function public.tem_direito_acesso() returns boolean language sql as $$ select current_setting('app.allowed',true) is distinct from 'false' $$;");
  await db.exec(migration('20261109110000'));
  // Restrições de produção que a RPC precisa respeitar (pré-aplicação de 09/11): tamanhos pelo schema.sql e o teto de valor,
  // conferido em produção e no schema.sql do main (:329), que este clone ainda não tem.
  for(const re of [/alter table transactions add constraint transactions_description_len\s+check[^;]*;/,/alter table transactions add constraint transactions_category_len\s+check[^;]*;/])await db.exec(schema.match(re)[0]);
  await db.exec('alter table transactions add constraint transactions_amount_max check (amount <= 999999999.99)');
  const u=await novoUsuario(db),outro=await novoUsuario(db);
  const w=(await db.query("insert into wallets(user_id,name,is_default) values($1,'Principal',true) returning id",[u])).rows[0].id;
  await db.query("select set_config('app.uid',$1,false)",[u]);
  const chave=n=>'pix1:'+('a'.repeat(64))+':'+n.repeat(64);
  const base={wallet_id:w,chave:chave('1'),operacao:'novo',data:'2026-10-05',centavos:3742,direcao:'out',descricao:'Pix enviado',categoria:'Alimentação',cor:'#1fa98d'};
  const call=async p=>(await db.query('select confirmar_conciliacao_pix($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
  const row=async id=>(await db.query('select * from transactions where id=$1',[id])).rows[0];
  const count=async()=>Number((await db.query('select count(*) n from transactions')).rows[0].n);
  const first=await call(base);assert.equal(first.situacao,'inserido');assert.equal((await call(base)).situacao,'ja_confirmado');assert.equal(await count(),1);
  assert.equal((await call({...base,chave:chave('2')})).situacao,'conflito');assert.equal(await count(),1);
  await db.query("select set_config('app.uid',$1,false)",[outro]);await assert.rejects(call(base));assert.equal(await count(),1);
  await db.query("select set_config('app.uid',$1,false)",[u]);await db.exec("select set_config('app.allowed','false',false)");await assert.rejects(call({...base,chave:chave('3')}));await db.exec("select set_config('app.allowed','true',false)");
  const id=await inserir(db,u,{amount:20,description:'Almoço',category:'Alimentação',wallet_id:w,occurred_on:'2026-10-06',payment_method:'pix'}),old=await row(id);
  const corr={...base,chave:chave('3'),operacao:'data',centavos:2000,alvo_id:id,esperado:snapshot(old)};
  assert.equal((await call(corr)).situacao,'corrigido');const changed=await row(id);assert.equal(dia(changed.occurred_on),'2026-10-05');assert.equal(changed.amount,old.amount);assert.equal(changed.description,old.description);assert.equal(changed.category,old.category);assert.equal(changed.wallet_id,w);assert.equal((await call(corr)).situacao,'ja_confirmado');
  const id2=await inserir(db,u,{amount:21,wallet_id:w,occurred_on:'2026-10-06'}),before=await row(id2);
  await db.query("update transactions set category='Mudou' where id=$1",[id2]);assert.equal((await call({...corr,chave:chave('4'),centavos:2100,alvo_id:id2,esperado:snapshot(before)})).situacao,'conflito');
  assert.equal(dia((await row(id2)).occurred_on),'2026-10-06');
  await inserir(db,u,{amount:22,wallet_id:w,occurred_on:'2026-10-06'});await inserir(db,u,{amount:22,wallet_id:w,occurred_on:'2026-10-05'});
  assert.equal((await call({...base,chave:chave('5'),centavos:2200})).situacao,'conflito');
  await assert.rejects(call({...base,chave:'id-sem-escopo'}));await assert.rejects(call({...base,chave:chave('6'),operacao:'apagar'}));
  const grants=(await db.query("select has_function_privilege('anon','public.confirmar_conciliacao_pix(jsonb)','EXECUTE') a,has_function_privilege('authenticated','public.confirmar_conciliacao_pix(jsonb)','EXECUTE') b")).rows[0];assert.equal(grants.a,false);assert.equal(grants.b,true);
  // P3 da pré-aplicação: o teto da RPC é o da tabela, com 22023 limpo (nunca 23514), e o texto vai aparado para a tabela.
  const idTeto=(await call({...base,chave:chave('7'),centavos:99999999999,data:'2026-09-01'})).id;assert.ok(idTeto,'R$ 999.999.999,99 cabe');assert.equal(Number((await row(idTeto)).amount),999999999.99);
  await assert.rejects(call({...base,chave:chave('8'),centavos:100000000000,data:'2026-08-01'}),e=>e.code==='22023');assert.equal(Number((await db.query("select count(*) n from transactions where fitid=$1",[chave('8')])).rows[0].n),0);
  const r9=await row((await call({...base,chave:chave('9'),centavos:4321,data:'2026-07-01',descricao:'  Pix padaria  ',categoria:'  Mercado  '})).id);
  assert.equal(r9.description,'Pix padaria');assert.equal(r9.category,'Mercado');assert.equal(r9.payment_method,'pix');
  const longa='C'.repeat(58),rb=await row((await call({...base,chave:chave('b'),centavos:4322,data:'2026-06-01',categoria:longa+'     ',descricao:'D'.repeat(198)+'     '})).id);
  assert.equal(rb.category,longa);assert.equal(rb.description,'D'.repeat(198));
  console.log('Pix SQL real: dono/acesso, idempotência, reimportação, data sem cópia, snapshot alterado, duplicatas/ambiguidade, teto de valor, texto aparado e permissões OK');
}finally{await db.close();}})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
