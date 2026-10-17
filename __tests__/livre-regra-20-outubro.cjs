// Pedido expresso do autor, 17/10/2026. Executa os modulos reais e SQL real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative, mocks = {}) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module); cache.set(file, m);
  m.require = id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id.endsWith('.ts') ? id : id + '.ts'), mocks);
    throw Error('Import inesperado: ' + id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return m.exports;
}
const app = load('lib/safe-to-spend.ts');
const server = load('supabase/functions/_shared/caixa.ts');
const widget = load('lib/widgets-home-snapshot.ts');
const cofre = load('lib/cofrinho-origem.ts');
const hoje = new Date(2026, 9, 17, 12);
const tx = (id, type, amount, extra = {}) => ({id, type, amount, occurred_on:'2026-10-10', ...extra});
const cards = [{id:'c', closing_day:20}];
const contexto = {cards, payments:[]};
const metas = [{id:'g', current_amount:6000, target_amount:10000, title:'Reserva', color:'#7BD8C0', month_reserves:{'2026-10':1000}}];
const base = [tx('salario','in',5000), tx('contas','out',3000), tx('compra','out',750,{card_id:'c'})];
function conferir(transactions, goals, ctx, esperado) {
  const a = app.calcularSafeToSpend(transactions, goals, hoje, ctx);
  const b = server.calcularLivreParaGastar(transactions, goals, '2026-10-17',ctx);
  assert.deepEqual(a,b,'mesmo nucleo app e Granabo');
  const w = widget.montarSnapshotWidgets({userId:'u', transactions, goals, bills:[], privacyHidden:false, hoje, ...ctx});
  assert.equal(w.safeToSpend.livreTotal,a.livreTotal);
  assert.equal(w.safeToSpend.livrePorDia,a.livrePorDia);
  assert.equal(a.livreTotal,esperado);
  return a;
}
(async()=>{
  assert.equal(conferir(base,metas,contexto,250).livrePorDia,250/15);
  const parcial = {card_id:'c',year:2026,month:9,amount:300,paid_on:'2026-10-15'};
  assert.equal(conferir([...base,tx('pago','out',300)],metas,{cards,payments:[parcial]},250).creditoNaoPago,450);
  assert.equal(conferir([...base,tx('pago','out',750)],metas,{cards,payments:[{...parcial,amount:750}]},250).creditoNaoPago,0);
  conferir([...base,tx('passado','out',100,{card_id:'c',occurred_on:'2026-09-05'})],metas,contexto,150);
  conferir([...base,tx('futuro','out',900,{card_id:'c',occurred_on:'2026-11-10'})],metas,contexto,250);
  // Parcela com fechamento 31: data original decide, incluindo fevereiro curto.
  const parcelas = [tx('orig','out',200,{card_id:'c',occurred_on:'2026-01-30',installment_current:1,installment_total:12}),
    tx('p10','out',200,{card_id:'c',occurred_on:'2026-10-30',installment_current:10,installment_total:12,parent_id:'orig'})];
  conferir([...base.filter(t=>!t.card_id),...parcelas],metas,{cards:[{id:'c',closing_day:31}],payments:[]},600);
  // Credito orfao nao desaparece; dados legados com um cartao usam seu ciclo.
  conferir(base.map(t=>t.card_id?{...t,card_id:null,payment_method:'credit'}:t),metas,contexto,250);
  const anterior = cofre.movimentarCofrinhoLocal(metas[0],2000,'anterior','2026-10');
  conferir(base,[anterior],contexto,250);
  conferir(base,[cofre.movimentarCofrinhoLocal(anterior,-2000,'anterior','2026-10')],contexto,250);
  conferir(base,[cofre.movimentarCofrinhoLocal(metas[0],-500,'mes','2026-10')],contexto,750);
  conferir(base,[cofre.movimentarCofrinhoLocal(metas[0],200,'mes','2026-10')],contexto,50);
  conferir(base,[{...metas[0],month_reserves:{'2026-09':6000}}],contexto,1250);
  assert.throws(()=>cofre.movimentarCofrinhoLocal(metas[0],-1001,'mes','2026-10'));
  // RPC real encaminha origem, invalida cache e avisa widgets, sem transacao.
  const calls=[];
  const goals=load('lib/goals.ts',{
    './supabase':{supabase:{rpc:async(name,args)=>{calls.push([name,args]);return{data:anterior,error:null}}}},
    './cache-de-tela':{comCacheOffline:(_,fn)=>fn,invalidarRespostasAtrasadas:()=>calls.push('cache')},
    './sessao-offline':{idDoUsuarioLocal:async()=> 'u'},
    './widgets-home-events':{notificarDadosDosWidgetsAlterados:()=>calls.push('widget')},
  });
  await goals.depositToGoal(metas[0],2000,'anterior');
  assert.deepEqual(calls,[['deposit_to_goal',{p_goal_id:'g',p_delta:2000,p_origin:'anterior'}],'cache','widget']);
  // Sincronizador REAL: busca pagamentos/cartoes e envia o mesmo 250 ao nativo.
  const snapshots=[];let falharPagamentos=false;
  const sync=load('lib/widgets-home-sync.ts',{
    './data':{fetchTransactions:async()=>base,fetchBills:async()=>[],fetchCreditCards:async()=>cards,
      fetchCardInvoicePayments:async()=>{if(falharPagamentos)throw Error('offline esperado');return[]}},
    './goals':{fetchGoals:async()=>metas},
    './widgets-home-snapshot':{...widget,montarSnapshotWidgets:input=>widget.montarSnapshotWidgets({...input,hoje})},
    '@/modules/grana-voice-widget':{widgetDisponivel:true,atualizarSnapshot:s=>snapshots.push(s),
      definirPrivacidade:()=>{},garantirUsuario:()=>{},limparSnapshot:()=>{}},
  });
  assert.equal(await sync.sincronizarWidgetsHome('u',false),true);
  assert.equal(snapshots[0].safeToSpend.livreTotal,250);
  falharPagamentos=true;
  assert.equal(await sync.sincronizarWidgetsHome('u',false),false);
  assert.equal(snapshots.length,1,'fonte incompleta nao vira snapshot falso');
  // Postgres embutido: aplica a migration real, sem rede/credencial.
  const {PGlite}=await import('@electric-sql/pglite'); const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
      create function public.tem_direito_acesso() returns boolean language sql as $$select current_setting('app.acesso',true) = 'sim'$$;
      create table public.goals(id uuid primary key,user_id uuid not null,current_amount numeric not null check(current_amount>=0),target_amount numeric not null);
      create table public.user_gamification(user_id uuid primary key,lifetime_xp integer,updated_at timestamptz);
      create table public.transactions(id integer primary key,amount numeric);
      insert into public.goals values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',5000,10000);
      set app.uid='00000000-0000-0000-0000-000000000002';set app.acesso='sim';`);
    const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261017180000_cofrinhos_origem_do_dinheiro.sql'),'utf8');
    await db.exec(sql);await db.exec(sql);
    const mover=async(delta,origem)=> (await db.query(`select * from public.deposit_to_goal('00000000-0000-0000-0000-000000000001',$1::numeric,$2::text)`,[delta,origem])).rows[0];
    const mes=(await db.query(`select to_char(statement_timestamp() at time zone 'America/Sao_Paulo','YYYY-MM') mes`)).rows[0].mes;
    const antigo=await mover(1000,'anterior');assert.equal(Number(antigo.current_amount),6000);assert.deepEqual(antigo.month_reserves,{});
    const atual=await mover(1000,'mes');assert.equal(Number(atual.month_reserves[mes]),1000);
    assert.equal(Number((await mover(-300,'mes')).month_reserves[mes]),700);
    assert.equal(Number((await mover(-400,'anterior')).month_reserves[mes]),700);
    await assert.rejects(mover(-701,'mes'));await assert.rejects(mover('NaN','mes'));await assert.rejects(mover(0,'mes'));await assert.rejects(mover(1,'errada'));
    assert.equal((await db.query('select count(*)::int n from public.transactions')).rows[0].n,0);
    assert.equal((await db.query(`select has_function_privilege('anon','public.deposit_to_goal(uuid,numeric,text)','execute') p`)).rows[0].p,false);
    await db.exec('set role anon');await assert.rejects(mover(1,'mes'));await db.exec('reset role');
    await db.exec(`set app.uid='00000000-0000-0000-0000-000000000003'`);await assert.rejects(mover(1,'mes'));
    await db.exec(`set app.uid='00000000-0000-0000-0000-000000000002';set app.acesso='nao'`);await assert.rejects(mover(1,'mes'));
    await assert.rejects(db.query(`select public.deposit_to_goal('00000000-0000-0000-0000-000000000001',-1)`));
    await db.exec(`set app.acesso='sim'; select public.deposit_to_goal('00000000-0000-0000-0000-000000000001',-800);`);
    const legado=(await db.query('select * from public.goals')).rows[0];assert.equal(Number(legado.month_reserves[mes]),0);assert.equal(Number(legado.current_amount),5500);
  }finally{await db.close()}
  console.log('livre-regra-20-outubro: exemplo 250, paridade, parcial, origens, RPC e SQL real OK');
})().catch(e=>{console.error(e);process.exitCode=1});
