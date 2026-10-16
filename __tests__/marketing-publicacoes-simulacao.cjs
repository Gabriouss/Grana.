const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const cache=new Map();
function real(file) {
  file=path.resolve(file);if(cache.has(file))return cache.get(file);
  const api={};cache.set(file,api);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:api,crypto:webcrypto,TextEncoder,TextDecoder,Request,Response,Headers,URL,AbortController,Date,Error,atob,setTimeout,clearTimeout,
    fetch:()=>{throw new Error('REDE REAL PROIBIDA');},console,
    require:id=>real(path.resolve(path.dirname(file),id)),
  });return api;
}
const m=real('supabase/functions/_shared/marketing-simulacao.ts');
const operation=real('supabase/functions/_shared/admin-publicacoes-simulacao.ts');
const {criarHandlerAdmin}=real('supabase/functions/_shared/admin-autorizacao.ts');
const clone=x=>JSON.parse(JSON.stringify(x));
let checks=0;
const eq=(a,b,msg)=>{assert.deepEqual(clone(a),clone(b),msg);checks++;};
const ADMIN='11111111-1111-1111-1111-111111111111',OTHER='22222222-2222-2222-2222-222222222222';
const NOW=new Date('2026-10-16T15:00:00Z');
const P={pecaId:'a'.repeat(16),versao:'b'.repeat(40),aprovado:true,
  manifesto:{legendaSha256:'c'.repeat(64),capaSha256:null,midias:[{tipo:'imagem',sha256:'d'.repeat(64)}]}};
const A={pecaId:P.pecaId,rede:'instagram',conta:'123',formato:'feed',horario:'2026-10-16T15:01:00.000Z',estrategia:'executor-remoto'};
const DUE=new Date(A.horario);

async function main() {
  const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;alter default privileges grant all on tables to anon,authenticated,service_role;');
    await db.exec(fs.readFileSync('supabase/migrations/20261016160000_admin_marketing_simulacao.sql','utf8'));
    for(const role of ['anon','authenticated']) {
      await db.exec('set role '+role);
      for(const table of ['catalogo','controles','outbox']){
        await assert.rejects(db.query('select * from public.admin_marketing_sim_'+table),/permission denied/);checks++;
      }
      await assert.rejects(db.query("select public.admin_marketing_sim_pausar('global',false)"),/permission denied/);checks++;
      await assert.rejects(db.query("select public.admin_marketing_sim_cas($1,-1,$2)",['a'.repeat(64),{modo:'simulacao'}]),/permission denied/);checks++;
      await db.exec('reset role');
    }
    const store={
      peca:async id=>{const r=(await db.query('select * from public.admin_marketing_sim_catalogo where peca_id=$1',[id])).rows[0];
        return r?{pecaId:r.peca_id,versao:r.versao,manifesto:r.manifesto,aprovado:r.aprovado}:null;},
      ler:async key=>{const r=(await db.query('select revisao,dados from public.admin_marketing_sim_outbox where chave=$1',[key])).rows[0];return r??null;},
      cas:async(key,rev,data)=>(await db.query('select public.admin_marketing_sim_cas($1,$2,$3) as r',[key,rev,data])).rows[0].r,
      pausas:async()=>{const r=(await db.query('select * from public.admin_marketing_sim_controles')).rows[0];return {global:r.global_pausado,facebook:r.facebook_pausado,instagram:r.instagram_pausado};},
      pausar:async(rede,pausa)=>{await db.query('select public.admin_marketing_sim_pausar($1,$2)',[rede,pausa]);},
    };
    async function seed(piece=P) {
      await db.exec('reset role;truncate public.admin_marketing_sim_catalogo,public.admin_marketing_sim_outbox;');
      await db.query('insert into public.admin_marketing_sim_catalogo(peca_id,versao,manifesto,aprovado) values($1,$2,$3,$4)',[piece.pecaId,piece.versao,piece.manifesto,piece.aprovado]);
      await db.exec('set role service_role');
      for(const rede of ['global','facebook','instagram'])await store.pausar(rede,false);
    }
    async function confirmed(target=A,piece=P) {
      const key=await m.identidadeSimulacao(piece,target);
      const r=await m.confirmarSimulacao(store,target,key,ADMIN,NOW);eq(r.chave,key);return key;
    }
    async function run(key,command='executar',scenario='sucesso',when=DUE,calls=[],interrupt=false) {
      return await m.executarSimulacao(store,key,command,m.criarAdaptadorSimulado(scenario,calls),when,interrupt);
    }
    await seed();
    const preview=await m.previaSimulada(store,A,NOW);eq(preview.estado,'planejado');eq(await store.ler(preview.chave),null,'previa nao autoriza');
    eq((await m.confirmarSimulacao(store,A,'f'.repeat(64),ADMIN,NOW)).estado,'bloqueado');
    const key=await confirmed();await confirmed();
    eq((await db.query('select count(*)::int as n from public.admin_marketing_sim_outbox')).rows[0].n,1,'confirmacao deduplicada');
    const calls=[];await Promise.all([run(key,'executar','sucesso',DUE,calls),run(key,'executar','sucesso',DUE,calls)]);
    eq(calls,['publicar'],'duas reservas, um adaptador');eq((await store.ler(key)).dados.estado,'publicado');
    await run(key,'executar','sucesso',DUE,calls);eq(calls,['publicar'],'destino concluido nunca repete');
    const target={...A,rede:'facebook',conta:'456'},fb=await confirmed(target);
    await run(fb,'executar','falha',DUE,calls);eq((await store.ler(fb)).dados.estado,'falhou');
    await run(key,'executar','sucesso',DUE,calls);eq(calls,['publicar','publicar'],'falha de outra rede nao repete sucesso');

    await seed();const uncertain=await confirmed();const uncertainCalls=[];
    eq((await run(uncertain,'executar','incerto',DUE,uncertainCalls)).estado,'precisa-conferir');
    await run(uncertain,'executar','sucesso',DUE,uncertainCalls);eq(uncertainCalls,['publicar']);
    eq((await run(uncertain,'reconciliar','nao-encontrado',DUE,uncertainCalls)).estado,'precisa-conferir');
    // Um recibo inconclusivo não permite retry cego.
    await run(uncertain,'executar','sucesso',DUE,uncertainCalls);eq(uncertainCalls,['publicar','reconciliar']);
    eq((await run(uncertain,'reconciliar','sucesso',DUE,uncertainCalls)).estado,'publicado','segunda consulta recupera o efeito original');
    await seed();const failedRecon=await confirmed();await run(failedRecon,'executar','incerto');
    eq((await run(failedRecon,'reconciliar','falha')).estado,'precisa-conferir','falha ao consultar nao prova que envio falhou');

    await seed();const reconcile=await confirmed();const reconCalls=[];
    await run(reconcile,'executar','incerto',DUE,reconCalls);
    eq((await run(reconcile,'reconciliar','sucesso',DUE,reconCalls)).estado,'publicado');
    eq(reconCalls,['publicar','reconciliar'],'reconciliacao so consulta');
    await seed();const crash=await confirmed();const crashCalls=[];
    await run(crash,'executar','sucesso',DUE,crashCalls,true);eq(crashCalls,[]);
    eq((await run(crash,'executar','sucesso',new Date(DUE.getTime()+121000),crashCalls)).motivo,'lease-vencida');eq(crashCalls,[]);
    eq((await store.ler(crash)).dados.intentos[0].estado,'incerto');

    for(const extra of [900000,900001]){
      await seed();const k=await confirmed(),c=[];const r=await run(k,'executar','sucesso',new Date(DUE.getTime()+extra),c);
      eq(r.estado,extra===900000?'publicado':'precisa-conferir');eq(c.length,extra===900000?1:0,'fronteira 15 minutos');
    }
    await seed();const paused=await confirmed();await store.pausar('instagram',true);const pauseCalls=[];
    eq((await run(paused,'executar','sucesso',DUE,pauseCalls)).motivo,'pausado');eq(pauseCalls,[]);
    const pausedFb=await confirmed(target);eq((await run(pausedFb)).estado,'publicado','pausa por rede independente');
    await store.pausar('global',true);await store.pausar('instagram',false);await run(paused,'executar','sucesso',DUE,pauseCalls);eq(pauseCalls,[]);
    await seed();const race=await confirmed();const raceCalls=[];
    const racingStore={...store,cas:async(k,r,d)=>{
      const n=await store.cas(k,r,d);if(n!==null&&d.lease)await store.pausar('global',true);return n;
    }};
    eq((await m.executarSimulacao(racingStore,race,'executar',m.criarAdaptadorSimulado('sucesso',raceCalls),DUE)).motivo,'pausado');
    eq(raceCalls,[],'pausa entre reserva e adaptador impede chamada');

    await seed();const native={...A,estrategia:'nativo-meta'},nk=await confirmed(native);const nativeCalls=[];
    eq((await run(nk,'executar','sucesso',NOW,nativeCalls)).estado,'agendado-na-meta');
    await store.pausar('global',true);
    eq((await run(nk,'executar','processando',NOW,nativeCalls)).estado,'cancelamento-pendente');
    eq((await run(nk,'cancelar','sucesso',NOW,nativeCalls)).estado,'cancelado');eq(nativeCalls,['agendar','cancelar','cancelar']);
    await seed();const mismatch=await confirmed(native);eq((await run(mismatch,'executar','horario-divergente',NOW)).estado,'precisa-conferir');
    eq((await run(mismatch,'reconciliar','sucesso',NOW)).estado,'agendado-na-meta','reconciliar agenda nao finge publicado');
    await seed();const noId=await confirmed(native);
    eq((await m.executarSimulacao(store,noId,'executar',async()=>({estado:'confirmado',horario:native.horario}),NOW)).estado,'precisa-conferir','sem ID nao agenda');

    await seed();const changed=await confirmed();
    await db.query('update public.admin_marketing_sim_catalogo set versao=$1',['e'.repeat(40)]);
    const changeCalls=[];eq((await run(changed,'executar','sucesso',DUE,changeCalls)).estado,'precisa-conferir');eq(changeCalls,[]);
    await run(changed,'reconciliar','sucesso',DUE,changeCalls);eq(changeCalls,[],'mudanca sem tentativa nao inventa recibo');
    for(const mutate of [p=>p.manifesto.legendaSha256='e'.repeat(64),p=>p.manifesto.capaSha256='e'.repeat(64),
      p=>p.manifesto.midias[0].sha256='e'.repeat(64),p=>p.versao='e'.repeat(40)]){
      const p=clone(P);mutate(p);eq((await m.identidadeSimulacao(p,A))!==await m.identidadeSimulacao(P,A),true,'bytes novos exigem prova nova');
    }
    const multi=clone(P);multi.manifesto.midias.push({tipo:'imagem',sha256:'f'.repeat(64)});
    const reverse=clone(multi);reverse.manifesto.midias.reverse();
    eq((await m.identidadeSimulacao(multi,A))!==await m.identidadeSimulacao(reverse,A),true,'ordem importa');
    for(const change of [{rede:'facebook'},{conta:'456'},{formato:'stories'},
      {horario:'2026-10-16T15:02:00.000Z'},{estrategia:'nativo-meta'}]) {
      eq(await m.identidadeSimulacao(P,{...A,...change})!==await m.identidadeSimulacao(P,A),true,'destino/formato/horario mudam prova');
    }
    eq((await m.previaSimulada(store,{...A,pecaId:'f'.repeat(16)},NOW)).estado,'nao-configurado');
    const withoutApproval=clone(P);withoutApproval.aprovado=false;await seed(withoutApproval);
    eq((await m.previaSimulada(store,A,NOW)).motivo,'peca-sem-aceite');
    assert.throws(()=>m.validarPeca({...P,manifesto:{...P.manifesto,token:'proibido'}}));checks++;

    const video=clone(P);video.manifesto.midias[0].tipo='video';await seed(video);const vk=await confirmed(A,video),vCalls=[];
    const preparation=await run(vk,'executar','processando',DUE,vCalls);eq(preparation.estado,'preparando');eq(preparation.containerId.startsWith('sim-'),true);
    await run(vk,'executar','pronto',DUE,vCalls);await run(vk,'executar','sucesso',DUE,vCalls);
    eq(vCalls,['preparar','consultar-preparo','publicar']);eq((await store.ler(vk)).dados.estado,'publicado');
    await seed();const cancel=await confirmed();const cancelCalls=[];eq((await run(cancel,'cancelar','sucesso',NOW,cancelCalls)).estado,'cancelado');eq(cancelCalls,[],'cancelar antes nao envia');
    await assert.rejects(store.cas('f'.repeat(64),-1,{modo:'real',chave:'f'.repeat(64),estado:'publicado'}),/check constraint/);checks++;
    await assert.rejects(store.cas('f'.repeat(64),-1,{chave:'f'.repeat(64),estado:'publicado'}),/check constraint/);checks++;
    await assert.rejects(db.query("insert into public.admin_marketing_sim_outbox(chave,revisao,dados) values($1,0,$2)",['f'.repeat(64),{}]),/permission denied/);checks++;
    await db.exec('reset role');
    await db.query(`insert into public.admin_marketing_sim_outbox(chave,dados)
      select k,jsonb_build_object('modo','simulacao','chave',k,'estado','cancelado')
      from (select encode(sha256(convert_to('cap-'||i,'UTF8')),'hex') k from generate_series(1,99) i) x`);
    await db.exec('set role service_role');
    await assert.rejects(store.cas('f'.repeat(64),-1,{modo:'simulacao',chave:'f'.repeat(64),estado:'cancelado'}),/simulacao-limite/);checks++;
    eq(await store.cas(cancel,-1,(await store.ler(cancel)).dados),null,'duplicata no teto nao custa outra linha');

    const valid={recurso:'publicacoes-simulacao',modo:'simulacao',acao:'previa',alvo:A};
    eq(operation.validarSimulacao(valid).alvo.horario,A.horario);
    for(const p of [{...valid,modo:'real'},{...valid,token:'not-accepted'},
      {...valid,acao:'confirmar',chave:'a'.repeat(64)},
      {recurso:'publicacoes-simulacao',modo:'simulacao',acao:'retomar',rede:'global'}]) {
      assert.throws(()=>operation.validarSimulacao(p));checks++;
    }
    for(const user of [{sub:OTHER,aal:'aal2',totp:true},{sub:ADMIN,aal:'aal1',totp:true},
      {sub:ADMIN,aal:'aal2',totp:false},{sub:null,aal:'aal2',totp:true}]){
      let effects=0;const keys=[];
      const client={auth:{getUser:async()=>({data:{user:user.sub?{id:user.sub,factors:user.totp?[{factor_type:'totp',status:'verified'}]:[]}:null}})},
        from:()=>{effects++;throw new Error('forbidden');},rpc:()=>{effects++;throw new Error('forbidden');}};
      const handler=criarHandlerAdmin({env:k=>({SUPABASE_URL:'https://fake.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',ADMIN_USER_IDS:ADMIN})[k],
        cliente:(_u,k)=>{keys.push(k);return client;},log:()=>{}},operation.operacaoPublicacoesSimulacao);
      const jwt='valid.'+Buffer.from(JSON.stringify({sub:user.sub??ADMIN,aal:user.aal})).toString('base64url')+'.sig';
      const r=await handler(new Request('https://fake.invalid',{method:'POST',headers:{Origin:'https://granaponto.com.br',Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(valid)}));
      eq(r.status,user.sub?403:401);eq(effects,0);eq(keys.includes('service'),false);
    }
    console.log(`marketing-publicacoes-simulacao: ${checks} verificacoes, motor real + RPCs SQL reais, zero Meta/rede`);
  }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
