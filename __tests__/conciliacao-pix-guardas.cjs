// Guardas da Conciliação Pix (revisão do Keel, 09/11): módulos reais transpilados e SQL real em PGlite. Fixtures inventadas.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {novoBanco,novoUsuario,inserir,migration}=require('./helpers/postgres-t5.cjs');
const watchdog=setTimeout(()=>{console.error('Pix guardas: teste não concluiu');process.exit(1);},30000);
const raiz=path.join(__dirname,'..');
const cache=new Map();function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:api,Date,console,require:id=>{if(id.startsWith('@/'))return real(path.join(raiz,id.slice(2)+'.ts'));if(!id.startsWith('.'))throw Error(id);return real(path.resolve(path.dirname(f),id+'.ts'));}},{filename:f});return api;}
const conc=real(path.join(raiz,'lib/conciliacao-pix.ts')),rec=real(path.join(raiz,'lib/recorrencia.ts'));
const match=(linhas,lancamentos)=>conc.conciliarPix({userId:'a',carteiraId:'p',principalId:'p',linhas,lancamentos});
const linha=(extra={})=>({id:'0',fitid:'pix1:x:0',idBanco:'b0',data:'2026-10-30',centavos:150000,direcao:'out',descricao:'Pix enviado Imobiliaria',categoria:'',cor:'',natureza:'movimento',...extra});
const base={user_id:'a',wallet_id:'p',type:'out',amount:1500,description:'Aluguel',category:'Moradia',color:'#000000',card_id:null,payment_method:null,fitid:null,installment_current:null,installment_total:null,recurrence_skipped_months:[]};
const cabeca={...base,id:'h',occurred_on:'2026-09-01',recurring:true,parent_id:null};
const filha=(id,d)=>({...base,id,occurred_on:d,recurring:true,parent_id:'h'});

// P1: ocorrência recorrente cuja data do banco cai em outro mês não vira "Corrigir data".
const serie=[cabeca,filha('o10','2026-10-01'),filha('o11','2026-11-01')];
const r1=match([linha()],serie)[0];
assert.equal(r1.status,'revisar','recorrente que muda de mês exige revisão');assert.match(r1.motivo,/todo mês/);
// O mecanismo que a guarda evita: mover a filha de mês faz a série recriar a ocorrência (duplicata).
assert.deepEqual(Array.from(rec.ocorrenciasFaltantes(serie,'2026-11-09')),[]);
assert.deepEqual(Array.from(rec.ocorrenciasFaltantes(serie.map(t=>t.id==='o11'?{...t,occurred_on:'2026-10-30'}:t),'2026-11-09'),f=>f.occurred_on),['2026-11-01']);
// A cabeça também é guardada; dentro do mesmo mês a correção continua oferecida, e parcela não é série.
assert.equal(match([linha({data:'2026-08-30'})],[cabeca])[0].status,'revisar','cabeça da série que muda de mês');
assert.equal(match([linha({data:'2026-11-03'})],serie)[0].status,'data','recorrente no mesmo mês continua corrigível');
const parcela={...base,id:'q',occurred_on:'2026-11-01',recurring:false,parent_id:'h0',installment_current:2,installment_total:3};
assert.equal(match([linha()],[parcela])[0].status,'data','parcela não é série recorrente');
// Saída de pagamento de fatura: a data é corrigida em Crédito, nunca por aqui.
const pagamento={...base,id:'f',occurred_on:'2026-10-28',recurring:false,parent_id:null,category:'Cartão de crédito',description:'Pagamento da fatura Cartão'};
const rf=match([linha()],[pagamento])[0];assert.equal(rf.status,'revisar');assert.match(rf.motivo,/Crédito/);

// P2: textos comuns de pagamento de fatura no extrato da conta.
for(const d of ['Pagamento de fatura','PAGTO FATURA CARTAO','PAG FATURA ITAU','Pagamento cartão de crédito','PGTO CARTAO CREDITO','Pagto Fatura Inter','FATURA CARTAO NUBANK','Pagamento fatura','Fatura paga'])
  assert.equal(conc.lerExtratoConciliacao('Data;Descrição;Valor\n05/10/2026;'+d+';-500,00')[0].natureza,'fatura',d);
assert.equal(conc.lerExtratoConciliacao('Data;Descrição;Valor\n05/10/2026;Pix enviado Padaria;-5,00')[0].natureza,'movimento');

// P2: compra já lançada no crédito, mesmo valor e direção em ±3 dias, não vira "Falta lançar".
const credito={...base,id:'c',occurred_on:'2026-10-29',recurring:false,parent_id:null,card_id:'card',payment_method:'credit'};
const rc=match([linha()],[credito])[0];assert.equal(rc.status,'revisar');assert.match(rc.motivo,/compra no crédito com este valor/);
assert.equal(match([linha()],[{...credito,occurred_on:'2026-10-20'}])[0].status,'falta','crédito fora da janela não bloqueia');
assert.equal(match([linha()],[{...credito,type:'in'}])[0].status,'falta','direção diferente não bloqueia');

// P3: segundo Pix de mesmo valor perto de um já conferido por chave: motivo próprio, que orienta o lançamento manual.
const csv='Data;Descrição;Valor\n05/10/2026;Pix enviado Padaria;-10,00\n06/10/2026;Pix enviado Padaria Centro;-10,00';
const ls=conc.lerExtratoConciliacao(csv);ls.forEach((l,i)=>l.fitid='pix1:o:'+i);
const ins={...base,id:'n0',recurring:false,parent_id:null,amount:10,occurred_on:'2026-10-05',fitid:'pix1:o:0',payment_method:'pix'};
const rr=match(ls,[ins]);assert.equal(rr[0].status,'conciliado');assert.equal(rr[1].status,'revisar');assert.match(rr[1].motivo,/Lançamentos/);

// P3: data americana no CSV. Arquivo que prova MM/DD é lido assim e avisado; ambíguo fica DD/MM e avisado.
const us=conc.lerExtratoConciliacao('Data;Descrição;Valor\n10/25/2026;Pix enviado;-2,00\n10/03/2026;Pix enviado;-3,00');
assert.deepEqual(Array.from(us,l=>l.data),['2026-10-25','2026-10-03']);assert.ok(us.every(l=>l.formatoData==='mes-dia'));
const amb=conc.lerExtratoConciliacao('Data;Descrição;Valor\n10/03/2026;Pix enviado;-2,00');assert.equal(amb[0].data,'2026-03-10');assert.equal(amb[0].formatoData,'dia-mes-presumido');
const br=conc.lerExtratoConciliacao('Data;Descrição;Valor\n25/10/2026;Pix enviado;-2,00\n03/10/2026;Pix enviado;-3,00');assert.ok(br.every(l=>l.formatoData===undefined));assert.equal(br[1].data,'2026-10-03');
assert.throws(()=>conc.lerExtratoConciliacao('Data;Descrição;Valor\n25/10/2026;Pix enviado;-2,00\n10/25/2026;Pix enviado;-3,00'),'formatos misturados no mesmo arquivo');

// Servidor: as mesmas guardas na RPC (migration nova sobre a aplicada).
(async()=>{const db=await novoBanco();try{
  const schema=fs.readFileSync(path.join(raiz,'supabase/schema.sql'),'utf8').replace(/\r\n/g,'\n');
  await db.exec(schema.match(/alter table transactions add column if not exists fitid[^;]*;/)[0]);
  await db.exec(schema.match(/create unique index if not exists transactions_user_fitid_uniq\s+[^;]*;/)[0]);
  await db.exec(schema.match(/create table if not exists credit_card_invoices \([\s\S]*?\n\);/)[0]);
  await db.exec("create function public.tem_direito_acesso() returns boolean language sql as $$ select true $$;");
  await db.exec(migration('20261109110000'));await db.exec(migration('20261109220000'));
  const u=await novoUsuario(db);await db.query("select set_config('app.uid',$1,false)",[u]);
  const w=(await db.query("insert into wallets(user_id,name,is_default) values($1,'Principal',true) returning id",[u])).rows[0].id;
  const campos=['occurred_on','amount','type','description','category','color','wallet_id','card_id','payment_method','fitid','recurring','parent_id','installment_current','installment_total'];
  const dia=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
  const row=async id=>(await db.query('select * from transactions where id=$1',[id])).rows[0];
  const snap=t=>({...Object.fromEntries(campos.map(k=>[k,t[k]??null])),amount:Number(t.amount),occurred_on:dia(t.occurred_on)});
  const call=async p=>(await db.query('select confirmar_conciliacao_pix($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
  const chave=n=>'pix1:'+'a'.repeat(64)+':'+String(n).repeat(64);
  const corrigir=async(id,data,n)=>call({wallet_id:w,chave:chave(n),operacao:'data',data,centavos:150000,direcao:'out',descricao:'Pix enviado',categoria:'',cor:'',alvo_id:id,esperado:snap(await row(id))});
  const h=await inserir(db,u,{amount:1500,description:'Aluguel',category:'Moradia',wallet_id:w,occurred_on:'2026-09-01',recurring:true});
  const o11=await inserir(db,u,{amount:1500,description:'Aluguel',category:'Moradia',wallet_id:w,occurred_on:'2026-11-01',recurring:true,parent_id:h});
  assert.deepEqual(await corrigir(o11,'2026-10-30',1),{situacao:'conflito',motivo:'recorrente'});assert.equal(dia((await row(o11)).occurred_on),'2026-11-01');
  assert.equal((await corrigir(o11,'2026-11-03',2)).situacao,'corrigido','mesmo mês continua corrigível');
  assert.deepEqual(await corrigir(h,'2026-08-30',3),{situacao:'conflito',motivo:'recorrente'});
  const pago=await inserir(db,u,{amount:1500,description:'Pagamento da fatura',category:'Cartão de crédito',wallet_id:w,occurred_on:'2026-10-02'});
  const card=(await db.query("insert into credit_cards(user_id,name,bank,limit_amount,closing_day,due_day) values($1,'Cartão','Banco Modelo',1000,1,10) returning id",[u])).rows[0].id;
  await db.query('insert into credit_card_invoices(user_id,card_id,year,month,amount,paid_on,wallet_id,paid_transaction_id) values($1,$2,2026,9,1500,$3,$4,$5)',[u,card,'2026-10-02',w,pago]);
  assert.deepEqual(await corrigir(pago,'2026-10-04',4),{situacao:'conflito',motivo:'fatura'});
  const extra=await inserir(db,u,{amount:1500,description:'Pagamento do restante',category:'Cartão de crédito',wallet_id:w,occurred_on:'2026-12-02'});
  await db.query('update credit_card_invoices set extra_transaction_ids=array[$1::uuid]',[extra]);
  assert.deepEqual(await corrigir(extra,'2026-12-04',5),{situacao:'conflito',motivo:'fatura'});
  // Segundo Pix de mesmo valor na janela: conflito com motivo próprio, nada gravado.
  const novo=n=>call({wallet_id:w,chave:chave(n),operacao:'novo',data:'2027-01-05',centavos:1000,direcao:'out',descricao:'Pix enviado Padaria',categoria:'Alimentação',cor:'#1fa98d'});
  assert.equal((await novo(6)).situacao,'inserido');assert.deepEqual(await novo(7),{situacao:'conflito',motivo:'mesmo_valor'});
  assert.equal(Number((await db.query("select count(*) n from transactions where occurred_on='2027-01-05'")).rows[0].n),1);
  const acl=(await db.query("select has_function_privilege('anon','public.confirmar_conciliacao_pix(jsonb)','execute') a, has_function_privilege('authenticated','public.confirmar_conciliacao_pix(jsonb)','execute') b")).rows[0];
  assert.equal(acl.a,false);assert.equal(acl.b,true);
  console.log('Pix guardas reais: recorrente que muda de mês, pagamento de fatura, textos de fatura, compra no crédito, mesmo valor e data americana OK; SQL com as mesmas guardas e permissões');
}finally{await db.close();}})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
