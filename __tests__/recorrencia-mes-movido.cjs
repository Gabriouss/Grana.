// Conta recorrente movida de mês não duplica (Keel, 09/11/2026, pedido do autor: "corrija"), e mês de origem
// FUTURO não é marcado (L1 do Lynx, 22:45). SQL real em PGlite (migrations de mês pulado + a nova) e
// lib/recorrencia.ts real. Fixtures inventadas, sem rede. As datas são relativas ao mês corrente em São Paulo,
// lido do próprio banco, porque o gatilho usa now(): o teste não envelhece.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {novoBanco,novoUsuario,inserir,migration,tentar}=require('./helpers/postgres-t5.cjs');
const watchdog=setTimeout(()=>{console.error('Recorrente movida: teste não concluiu');process.exit(1);},30000);
const raiz=path.join(__dirname,'..');
const cache=new Map();function real(f){f=path.resolve(f);if(cache.has(f))return cache.get(f);const api={};cache.set(f,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:api,Date,console,require:id=>{if(id.startsWith('@/'))return real(path.join(raiz,id.slice(2)+'.ts'));if(!id.startsWith('.'))throw Error(id);return real(path.resolve(path.dirname(f),id+'.ts'));}},{filename:f});return api;}
const rec=real(path.join(raiz,'lib/recorrencia.ts'));
const dia=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
(async()=>{const db=await novoBanco();try{
  await db.exec(migration('20261001120000'));await db.exec(migration('20261001130000'));await db.exec(migration('20261109230000'));
  const HOJE=(await db.query("select to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d")).rows[0].d;
  const [Y,M]=HOJE.split('-').map(Number);
  // d(k, n): dia n do mês corrente + k. Dias até 28, para valer em qualquer mês.
  const d=(k,n)=>{const t=new Date(Date.UTC(Y,M-1+k,1));return t.toISOString().slice(0,8)+String(n).padStart(2,'0');};
  const mes=k=>d(k,1).slice(0,7);
  const u=await novoUsuario(db);
  const linhas=async()=>(await db.query('select * from transactions where user_id=$1 order by occurred_on, id',[u])).rows
    .map(t=>({...t,occurred_on:dia(t.occurred_on),amount:Number(t.amount),recurrence_skipped_months:Array.from(t.recurrence_skipped_months??[])}));
  const faltantes=async(hoje=HOJE,desc)=>Array.from(rec.ocorrenciasFaltantes(await linhas(),hoje),f=>f.cabeca.description+'@'+f.occurred_on).filter(x=>!desc||x.startsWith(desc+'@'));
  // App antigo (APK 1.10.12 e anteriores) não conhece a lista de meses pulados: calcula sem ela e insere tudo num lote só.
  const faltantesDoAppAntigo=async()=>rec.ocorrenciasFaltantes((await linhas()).map(t=>({...t,recurrence_skipped_months:[]})),HOJE);
  const pulados=async id=>Array.from((await db.query('select recurrence_skipped_months m from transactions where id=$1',[id])).rows[0].m);
  const mover=async(id,data)=>db.query('update transactions set occurred_on=$1 where id=$2 and user_id=$3',[data,id,u]);
  const serie=async(desc,cabecaEm,filhas)=>{const h=await inserir(db,u,{description:desc,amount:1500,category:'Moradia',occurred_on:cabecaEm,recurring:true});
    const ids=[];for(const x of filhas)ids.push(await inserir(db,u,{description:desc,amount:1500,category:'Moradia',occurred_on:x,recurring:true,parent_id:h}));return [h,...ids];};

  // 1. Ocorrência do mês corrente paga antes (dia 1 para o fim do mês anterior): o mês corrente não volta.
  const [h1,,o1]=await serie('Aluguel',d(-2,1),[d(-1,1),d(0,1)]);
  assert.deepEqual(await faltantes(),[]);
  await mover(o1,d(-1,28));
  assert.deepEqual(await faltantes(),[],'mês de origem vazio não pode ser recriado (duplicata)');
  assert.deepEqual(await pulados(h1),[mes(0)]);
  // 2. Ocorrência do mês anterior paga depois (fim do anterior para o dia 2 do corrente, com o corrente já lançado).
  const [h2,,o2]=await serie('Condominio',d(-3,28),[d(-2,28),d(-1,28),d(0,28)]);
  await mover(o2,d(0,2));
  assert.deepEqual(await faltantes(),[],'mês seguinte: o anterior não volta');assert.deepEqual(await pulados(h2),[mes(-1)]);
  // 3. Mesmo mês não marca nada.
  const [h3,,o3]=await serie('Escola',d(-2,5),[d(-1,5),d(0,5)]);
  await mover(o3,d(0,8));assert.deepEqual(await pulados(h3),[],'mudança dentro do mês não marca');
  // 4. Parcela não é série: a cabeça da compra parcelada não ganha mês pulado.
  const p1=await inserir(db,u,{description:'Sofa 1/3',amount:300,category:'Casa',occurred_on:d(-2,10),installment_current:1,installment_total:3});
  const p2=await inserir(db,u,{description:'Sofa 2/3',amount:300,category:'Casa',occurred_on:d(-1,10),parent_id:p1,installment_current:2,installment_total:3});
  await mover(p2,d(0,1));assert.deepEqual(await pulados(p1),[],'parcela não marca mês');
  // 5. Cabeça do mês corrente movida para o anterior (paga adiantado): o mês corrente não é gerado de novo.
  const [h5]=await serie('Academia',d(0,1),[]);
  await mover(h5,d(-1,28));
  assert.deepEqual(await faltantes(),[],'cabeça movida para trás não gera o mês de origem');assert.deepEqual(await pulados(h5),[mes(0)]);
  // 6. Cabeça movida para o mês seguinte: o mês de origem fica antes da cabeça e nunca é gerado.
  const [h6]=await serie('Seguro',d(-2,28),[d(-1,28),d(0,28)]);
  await mover(h6,d(-1,2));assert.deepEqual(await faltantes(),[]);
  // L1-B (Lynx). Desfazer uma mudança para o mês futuro: ida e volta não podem marcar o mês futuro, que precisa nascer.
  const [hb,ob]=await serie('Plano',d(-1,5),[d(0,5)]);
  await mover(ob,d(1,5));await mover(ob,d(0,5));
  assert.ok(!(await pulados(hb)).includes(mes(1)),'mês futuro de origem não é marcado');
  assert.deepEqual(await faltantes(d(1,10),'Plano'),['Plano@'+d(1,5)],'no mês seguinte a ocorrência dele nasce');
  // L1-C (Lynx). Série criada com a data no mês seguinte por engano e corrigida para o corrente: o seguinte nasce.
  const [hc]=await serie('Salario',d(1,1),[]);
  await mover(hc,d(0,1));
  assert.deepEqual(await pulados(hc),[],'cabeça vinda do futuro não marca');
  assert.deepEqual(await faltantes(d(1,10),'Salario'),['Salario@'+d(1,1)]);
  // 7. Lote do app antigo: um mês pulado de uma série e um mês que falta de verdade em outra, num INSERT só. Não cai; só o legítimo entra.
  const [h7]=await serie('Internet',d(-1,15),[]);
  const lote=await faltantesDoAppAntigo();
  assert.ok(lote.some(f=>f.cabeca.id===h1&&f.occurred_on===d(0,1)),'o app antigo tentaria recriar o mês corrente do aluguel');
  assert.ok(lote.some(f=>f.cabeca.id===h7&&f.occurred_on===d(0,15)),'e a internet do mês corrente falta de verdade');
  const cols=['user_id','type','description','amount','category','color','occurred_on','recurring','parent_id'];
  const valores=[],params=[];lote.forEach((f,i)=>{valores.push('('+cols.map((_,j)=>'$'+(i*cols.length+j+1)).join(',')+')');params.push(u,'out',f.cabeca.description,1500,'Moradia','#000000',f.occurred_on,true,f.cabeca.id);});
  const r=await tentar(()=>db.query('insert into transactions('+cols.join(',')+') values '+valores.join(','),params));
  assert.equal(r.ok,true,'lote do app antigo não pode cair: '+r.message);
  const depois=await linhas();
  assert.equal(depois.filter(t=>(t.parent_id??t.id)===h1).length,3,'aluguel continua com 3, sem duplicata');
  assert.equal(depois.filter(t=>t.parent_id===h7&&t.occurred_on===d(0,15)).length,1,'internet do mês corrente entrou');
  // 8. Linha sem série não ganha marca.
  const avulsa=await inserir(db,u,{description:'Mercado',amount:80,category:'Mercado',occurred_on:d(-1,20)});
  await mover(avulsa,d(0,2));assert.deepEqual(await pulados(avulsa),[]);
  // 9. Permissões: a função do gatilho não é chamável por quem usa o app.
  const acl=(await db.query("select has_function_privilege('authenticated','public.pular_mes_ao_mover_ocorrencia()','execute') a, has_function_privilege('anon','public.pular_mes_ao_mover_ocorrencia()','execute') b")).rows[0];
  assert.equal(acl.a,false);assert.equal(acl.b,false);
  console.log('Recorrente movida real (mês corrente '+mes(0)+'): anterior e seguinte sem duplicata, mesmo mês e parcela sem marca, cabeça para trás e para frente, origem futura sem marca (desfazer e corrigir início), lote do app antigo sem cair e permissões OK');
}finally{await db.close();}})().then(()=>clearTimeout(watchdog),e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});
