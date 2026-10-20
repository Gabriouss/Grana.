'use strict';
// SQL, Edge, executor e Graph reais; PGlite local e transporte dublado.
// Promise.all exercita invocações concorrentes; PGlite serializa a conexão.
// As ordens opostas claim/comando/admitir também são exercitadas explicitamente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..'), cache = new Map();
function carregar(rel) {
  const abs = path.resolve(root, rel);
  if (cache.has(abs)) return cache.get(abs).exports;
  const m = new Module(abs, module); cache.set(abs, m);
  m.require = id => id.startsWith('npm:') ? {} : carregar(path.relative(root, path.resolve(path.dirname(abs), id)));
  m._compile(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, abs);
  return m.exports;
}
const { criarExecutorReal } = carregar('supabase/functions/_shared/marketing-real-executor.ts');
const { criarOperacaoPublicacoesReais, validarPublicacaoReal } = carregar('supabase/functions/_shared/admin-publicacoes-reais.ts');
const MIGRATION = '20261020120000_admin_marketing_real_recuperacao_v1.sql';
const ARGS = { claim: ['p_worker','p_limite'], admitir: ['p_worker','p_job','p_lease','p_revisao'],
  recibo: ['p_worker','p_job','p_lease','p_revisao','p_resultado'], renovacao_iniciar: ['p_worker'],
  renovacao_registrar: ['p_worker','p_renovacao','p_lease','p_resultado'], previa: ['p_admin','p_pedido'],
  consultar: ['p_admin','p_filtro'], comando: ['p_admin','p_pedido'] };
let checks = 0;
const eq = (a,b,m) => { assert.deepEqual(a,b,m); checks++; };
const ok = (a,m) => { assert.ok(a,m); checks++; };
const rejects = async (p,re) => { await assert.rejects(p,re); checks++; };
(async () => {
  const { PGlite } = await import('@electric-sql/pglite'); const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const f of ['20261015190000_admin_marketing_fundacao.sql','20261016140000_admin_marketing_operacoes.sql',
      '20261018001000_admin_marketing_real.sql','20261018230000_admin_marketing_renovacao.sql','20261019120000_admin_marketing_consultar_preparo.sql'])
      await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
    const rpc = async (n,args=[]) => (await db.query(`select public.admin_marketing_real_${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
    const admin = randomUUID(), ig = randomUUID(), fb = randomUUID(); let serial = 0;
    const future = (minutes=60) => new Date(Date.now()+minutes*60000).toISOString();
    await db.query(`insert into public.admin_marketing_real_contas(id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
      values($1,'instagram','123','IG fixture','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',false,$3),
      ($2,'facebook','456','FB fixture','MARKETING_FB_TOKEN','verificada',now()+interval '1 day',false,$3)`,
      [ig,fb,[{formato:'feed',estado:'disponivel',revisao:1}]]);
    const operacional = async () => {
      await db.query(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,pausa_instagram=false,
        pausa_facebook=false,recuperacao_pendente=false,capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day'`);
      await db.query(`update public.admin_marketing_real_contas set pausada=false,conexao='verificada',valida_ate=now()+interval '1 day'`);
    };
    await operacional(); await db.exec('set role service_role');
    const novo = async (conta=ig,ator=admin) => {
      const hex = (++serial).toString(16).padStart(16,'0');
      let s = await rpc('snapshot_iniciar',[ator,{pecaId:hex,versao:hex.padStart(40,'0'),aceiteId:'fixture',aceiteRevisao:1,
        legenda:'Conteúdo aprovado.',legendaSha256:'a'.repeat(64),midias:[{ordem:0,sha256:'b'.repeat(64),mime:'image/jpeg',tipo:'imagem',bytes:100}],capa:null}]);
      s = await rpc('snapshot_finalizar',[ator,s.id,1,{identidade:s.identidade,midias:s.dados.midias,capa:null}]);
      const destinos = (Array.isArray(conta)?conta:[conta]).map(contaId=>({contaId,formato:'feed',publicarEm:future(),fuso:'America/Sao_Paulo'}));
      const p = await rpc('previa',[ator,{snapshotId:s.id,snapshotRevisao:s.revisao,destinos}]);
      const l = await rpc('confirmar',[ator,p.id,p.hash,1,randomUUID()]);
      return (await db.query('select * from public.admin_marketing_agendamentos where lote_id=$1',[l.loteId])).rows[0];
    };
    const row = async id => (await db.query('select * from public.admin_marketing_agendamentos where id=$1',[id])).rows[0];
    const foco = async (...ids) => {
      await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()+interval '1 day'`);
      for (const id of ids) await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now()-interval '1 second' where id=$1`,[id]);
    };
    const claim = (w=randomUUID(),lim=3) => rpc('claim',[w,lim]);
    const admitir = (w,j) => rpc('admitir',[w,j.jobId,j.leaseId,j.revisao]);
    const recibo = (w,j,r) => rpc('recibo',[w,j.jobId,j.leaseId,j.revisao,r]);
    const vencer = id => db.query(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1`,[id]);
    const previa = (j,at=future(90)) => rpc('previa',[admin,{jobId:j.id,destinos:[{contaId:j.conta_id,formato:'feed',publicarEm:at,fuso:'America/Sao_Paulo'}]}]);
    const pedido = (j,p,extra={}) => ({acao:'reagendar',jobId:j.id,revisaoEsperada:j.revisao,idempotencia:randomUUID(),
      publicarEm:p.destinos[0].publicarEm,fuso:'America/Sao_Paulo',previaId:p.id,previaHash:p.hash,...extra});
    const comando = p => rpc('comando',[admin,p]);
    const tentativas = async id => (await db.query('select * from public.admin_marketing_envios where agendamento_id=$1 order by tentativa',[id])).rows;
    async function testarRespostaPerdidaP2() {
      await db.exec('set role service_role'); await operacional();
      const original=await novo([ig,fb]);
      const jobs=(await db.query('select * from public.admin_marketing_agendamentos where lote_id=$1',[original.lote_id])).rows;
      const anterior=jobs.find(j=>j.conta_id===ig), facebook=jobs.find(j=>j.conta_id===fb);
      await db.query(`update public.admin_marketing_agendamentos set estado='publicado',remoto_id='456_925',concluido_em=now(),
        processamento='{"publicacaoId":"456_925"}' where id=$1`,[facebook.id]);
      const facebookAntes=await row(facebook.id), p=await previa(anterior), cmd=pedido(anterior,p);
      // O chamador perde a resposta; só conhece a chave que já tinha enviado.
      await comando(cmd);
      const [sucessor]=(await db.query('select * from public.admin_marketing_agendamentos where substitui_id=$1',[anterior.id])).rows;
      ok(sucessor&&sucessor.id!==anterior.id,'P2 comando concluiu e criou sucessor');
      const banco=async()=>{
        const dados={};
        for(const {tablename} of (await db.query(`select tablename from pg_tables where schemaname='public' order by tablename`)).rows)
          dados[tablename]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') d from public.${tablename} t`)).rows[0].d;
        return dados;
      };
      const consultar=async(ator,filtro)=>{
        await db.exec('begin read only');
        try{return await rpc('consultar',[ator,{acao:'consultar',...filtro}]);}
        finally{await db.exec('rollback');}
      };
      let antes=await banco();
      let recuperado=await consultar(admin,{idempotencia:cmd.idempotencia});
      eq(recuperado.jobs.map(j=>j.jobId),[sucessor.id],'P2 chave do comando devolve somente seu alvo, não o lote todo');
      eq(recuperado.loteId,anterior.lote_id,'P2 recupera o lote real do alvo');
      eq(recuperado.jobs[0].estado,'programado-no-painel','P2 sucessor consultado após resposta perdida');
      eq(await banco(),antes,'P2 consulta não altera nenhuma tabela pública');
      // O estado evolui depois do recibo guardado: devolver o JSON antigo mentiria.
      await comando({acao:'cancelar',jobId:sucessor.id,revisaoEsperada:sucessor.revisao,idempotencia:randomUUID()});
      const outroAtor=randomUUID(), outro=await novo(ig,outroAtor);
      const chaveOutro=(await db.query('select idempotencia from public.admin_marketing_real_lotes where id=$1',[outro.lote_id])).rows[0].idempotencia;
      const chaveEstranha=randomUUID();
      await db.query(`insert into public.admin_marketing_real_comandos(admin_id,idempotencia,pedido,resultado) values($1,$2,$3,$4)`,
        [admin,chaveEstranha,{acao:'reagendar',jobId:anterior.id},{jobs:[{jobId:outro.id}]}]);
      const chaveSemAlvo=randomUUID();
      await db.query(`insert into public.admin_marketing_real_comandos(admin_id,idempotencia,pedido,resultado) values($1,$2,$3,$4)`,
        [admin,chaveSemAlvo,{acao:'pausar',escopo:'global'},{contas:[{privado:'nao-expor'}]}]);
      antes=await banco();
      recuperado=await consultar(admin,{idempotencia:cmd.idempotencia});
      eq(recuperado.jobs.map(j=>j.jobId),[sucessor.id],'P2 segue o alvo registrado mesmo depois de terminar');
      eq(recuperado.jobs[0].estado,'cancelado','P2 retorna estado atual, não cópia do recibo');
      eq(recuperado.jobs[0].revisao,(await row(sucessor.id)).revisao,'P2 retorna revisão atual');
      eq((await db.query('select resultado from public.admin_marketing_real_comandos where admin_id=$1 and idempotencia=$2',[admin,cmd.idempotencia])).rows[0].resultado.jobs[0].estado,
        'programado-no-painel','P2 recibo original não foi reescrito pela consulta');
      await rejects(consultar(outroAtor,{idempotencia:cmd.idempotencia}),/lote-inexistente/);
      await rejects(consultar(admin,{idempotencia:randomUUID()}),/lote-inexistente/);
      await rejects(consultar(admin,{idempotencia:chaveOutro}),/lote-inexistente/);
      await rejects(consultar(admin,{idempotencia:chaveEstranha}),/lote-inexistente/);
      await rejects(consultar(admin,{idempotencia:chaveSemAlvo}),/lote-inexistente/);
      eq((await consultar(outroAtor,{jobId:sucessor.id})).jobs,[],'P2 job de outro ator não vaza por consulta direta');
      eq((await consultar(outroAtor,{loteId:anterior.lote_id})).jobs,[],'P2 lote de outro ator não vaza por consulta direta');
      eq((await consultar(admin,{idempotencia:cmd.idempotencia,jobId:outro.id})).jobs,[],'P2 filtro não pode trocar o alvo da chave');
      const lista=await rpc('consultar',[admin,{acao:'listar',limite:50}]);
      ok(lista.jobs.every(j=>j.jobId!==outro.id),'P2 lista também respeita owner');
      const lote=(await db.query('select idempotencia from public.admin_marketing_real_lotes where id=$1',[anterior.lote_id])).rows[0];
      eq((await consultar(admin,{idempotencia:lote.idempotencia})).jobs.map(j=>j.jobId).sort(),
        [anterior.id,facebook.id,sucessor.id].sort(),'P2 consulta pela chave de lote continua compatível');
      eq((await consultar(outroAtor,{idempotencia:chaveOutro})).jobs.map(j=>j.jobId),[outro.id],'P2 ator continua vendo seu próprio lote');
      eq(await row(facebook.id),facebookAntes,'P2 Facebook publicado permanece intacto');
      eq(await banco(),antes,'P2 consultas positivas/negativas e owner não escrevem dados');
    }
    // Instalar não reinterpreta nem reativa jobs que já estavam no banco.
    let g = await novo(); const before = await row(g.id);
    if (!process.argv.includes('--baseline')) {
      await db.exec('reset role');
      await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',MIGRATION),'utf8'));
      await db.exec('set role service_role');
    }
    if(process.argv.includes('--p2')){
      await testarRespostaPerdidaP2();
      console.log(`marketing-real-recuperacao-v1 P2: ${checks} verificacoes SQL real; chave de comando, estado atual, owner e zero mutacao`);
      return;
    }
    const after = await row(g.id);
    for (const k of Object.keys(before)) eq(after[k],before[k],'instalação preserva '+k);
    await foco(g.id); const oldWorker = randomUUID(), [first] = await claim(oldWorker);
    await vencer(g.id); const nextWorker = randomUUID(), [again] = await claim(nextWorker);
    eq(again?.etapa,'preparar','lease de preparo sem admissão retoma etapa original');
    eq((await row(g.id)).etapa_interrompida,'preparar','etapa interrompida durável');
    eq((await tentativas(g.id))[0].estado,'falhou','diário distingue ausência de efeito de publicação incerta');
    eq(await admitir(oldWorker,first),false,'worker atrasado não admite POST');
    await rejects(recibo(oldWorker,first,{estado:'pronto'}),/revisao-divergente/);
    eq(await admitir(nextWorker,again),true,'worker atual admite preparo uma vez');
    await vencer(g.id); eq(await claim(),[],'preparo admitido não se repete automaticamente');
    g = await row(g.id); eq(g.estado,'precisa-conferir','preparo sem recibo pede atenção');
    eq(g.etapa,'preparar','preparo incerto não se transforma em publicação');
    let dto=(await rpc('consultar',[admin,{jobId:g.id}])).jobs[0];
    eq(dto.reagendamento,{permitido:true,motivo:null,motivos:[]},'servidor libera preparo privado com contrato singular e plural coerentes');
    eq(dto.etapaInterrompida,'preparar','acompanhamento expõe etapa preservada');
    await rejects(comando({acao:'reconciliar',jobId:g.id,revisaoEsperada:g.revisao,idempotencia:randomUUID()}),/estado-incompativel/);
    await rejects(comando({acao:'reagendar',jobId:g.id,revisaoEsperada:g.revisao,idempotencia:randomUUID(),publicarEm:future()}),/previa-inexistente/);
    let p = await previa(g);
    await rejects(rpc('confirmar',[admin,p.id,p.hash,1,randomUUID()]),/estado-incompativel/);
    const command = pedido(g,p);
    const both = await Promise.all([comando(command),comando(command)]);
    eq(both[0],both[1],'duplo clique/idempotência tem o mesmo sucessor');
    let successor = await row(both[0].jobs[0].jobId);
    eq(successor.substitui_id,g.id,'sucessor vinculado ao anterior');
    eq(successor.processamento,{},'sucessor não herda containers privados');
    eq(successor.remoto_id,null,'sucessor não herda publicação');
    eq(successor.lease_id,null,'sucessor não herda lease');
    eq(successor.etapa,'preparar','sucessor começa na preparação');
    eq((await row(g.id)).estado,'cancelado','anterior cancelado atomicamente');
    eq((await tentativas(g.id)).length,2,'histórico anterior preservado');
    eq((await tentativas(successor.id)).length,0,'sucessor sem tentativas herdadas');
    await rejects(comando({...command,publicarEm:future(95)}),/idempotencia-divergente/);
    eq(await admitir(nextWorker,again),false,'substituição invalida autorização anterior');
    await rejects(recibo(nextWorker,again,{estado:'pronto'}),/revisao-divergente/);

    // Concorrência CAS com chaves diferentes; falha não deixa autorização/job órfão.
    g = await novo(); p = await previa(g); const cmd = pedido(g,p);
    const nAntes = (await db.query('select count(*)::int n from public.admin_marketing_autorizacoes')).rows[0].n;
    const race = await Promise.allSettled([comando(cmd),comando({...cmd,idempotencia:randomUUID()})]);
    eq(race.filter(r=>r.status==='fulfilled').length,1,'duas confirmações CAS criam somente um sucessor');
    eq(race.filter(r=>r.status==='rejected').length,1,'segunda revisão fica obsoleta');
    eq((await db.query('select count(*)::int n from public.admin_marketing_autorizacoes')).rows[0].n,nAntes+1,'rejeição é atômica');

    // Worker primeiro; comando primeiro; admissão primeiro. Mesma ordem de locks.
    g = await novo(); p = await previa(g); await foco(g.id); const w = randomUUID(), [active] = await claim(w);
    await rejects(comando(pedido(g,p)),/revisao-divergente/);
    await rejects(comando(pedido(await row(g.id),p)),/operacao-em-andamento/);
    eq(await admitir(w,active),true,'claim vencedor conserva fence');
    await recibo(w,active,{estado:'processando',processamento:{container:'800',itens:['800']}});
    await rejects(comando(pedido(await row(g.id),p)),/revisao-divergente/);
    g = await row(g.id); p = await previa(g);
    const changed = await comando(pedido(g,p)); successor = await row(changed.jobs[0].jobId);
    await foco(g.id); eq(await claim(),[],'job cancelado não volta à fila');
    eq(successor.processamento,{},'nenhum container reutilizado após preparo confirmado');

    // As checagens são refeitas na confirmação; uma prévia não é autorização de envio.
    g = await novo(); p = await previa(g);
    await rejects(comando(pedido(g,p,{previaHash:'f'.repeat(64)})),/revisao-divergente/);
    await rejects(comando(pedido(g,p,{publicarEm:future(120)})),/horario-invalido/);
    await rejects(rpc('previa',[randomUUID(),{jobId:g.id,destinos:p.destinos}]),/agendamento-inexistente/);
    await rejects(rpc('previa',[randomUUID(),{snapshotId:g.snapshot_id,snapshotRevisao:2,destinos:p.destinos}]),/snapshot-indisponivel/);
    await rejects(rpc('previa',[admin,{jobId:g.id,destinos:[{...p.destinos[0],contaId:fb}]}]),/destino-invalido/);
    await db.exec('reset role'); await db.query(`update public.admin_marketing_real_previas set expira_em=now()-interval '1 second' where id=$1`,[p.id]);
    await db.exec('set role service_role'); await rejects(comando(pedido(g,p)),/previa-expirada/);
    p = await previa(g); await db.query(`update public.admin_marketing_real_contas set revisao=revisao+1 where id=$1`,[ig]);
    await rejects(comando(pedido(g,p)),/conta-indisponivel/);
    await db.query(`update public.admin_marketing_real_contas set revisao=revisao-1 where id=$1`,[ig]);
    await comando({acao:'pausar',jobId:g.id,revisaoEsperada:g.revisao,idempotencia:randomUUID()});
    g = await row(g.id); p = await previa(g); successor = await row((await comando(pedido(g,p))).jobs[0].jobId);
    eq(successor.pausado,true,'reagendamento preserva pausa individual');

    // Um publicar reservado, mesmo sem admissão, nunca ganha novo POST/sucessor.
    g = await novo(); await db.query(`update public.admin_marketing_agendamentos set etapa='publicar' where id=$1`,[g.id]);
    await db.exec('reset role'); await db.query(`update public.admin_marketing_autorizacoes set confirmado_em=now()-interval '2 minutes',publicar_em=now()-interval '1 minute' where id=$1`,[g.autorizacao_id]);
    await db.exec('set role service_role'); await foco(g.id); const pw = randomUUID(), [pub] = await claim(pw);
    eq(pub.etapa,'publicar','publicação reservada'); await vencer(g.id); await claim();
    g = await row(g.id); eq(g.etapa_interrompida,'publicar','publicação interrompida preservada');
    eq(g.etapa,'reconciliar','publicação incerta só segue em consulta');
    await rejects(previa(g),/estado-incompativel/);
    await rejects(comando(pedido(g,p)),/estado-incompativel/);
    eq(await admitir(pw,pub),false,'lease velha de publicação não admite efeito');
    eq((await tentativas(g.id)).filter(e=>e.operacao==='publicar').length,1,'diário mantém publicação única');
    // Uma segunda lease de consulta não apaga a origem da incerteza.
    const uncertainPublication=g.id;
    await comando({acao:'reconciliar',jobId:g.id,revisaoEsperada:g.revisao,idempotencia:randomUUID()});
    await foco(g.id); const [readback]=await claim(); eq(readback.etapa,'reconciliar','consulta reservada sem repetir publicar');
    await vencer(g.id); await claim();
    eq((await row(uncertainPublication)).etapa_interrompida,'publicar','nova expiração de GET preserva etapa original');

    // Decisão usa todo o diário, inclusive publicação fora dos últimos 50 recibos.
    const history=await novo();
    await db.query(`insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao,estado,iniciado_em,terminado_em)
      values($1,$2,1,'publicar','incerto',now()-interval '3 minutes',now()-interval '2 minutes')`,[history.id,'7'.repeat(64)]);
    await db.query(`insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao,estado,iniciado_em,terminado_em)
      select $1::uuid,encode(sha256(convert_to($1::uuid::text||':'||n,'UTF8')),'hex'),n,'preparar','falhou',now()-interval '1 minute',now()
      from generate_series(1,51) n`,[history.id]);
    dto=(await rpc('consultar',[admin,{jobId:history.id}])).jobs[0];
    eq(dto.recibosLimitados,true,'diário truncado sinalizado');
    eq(dto.recibos.some(e=>e.operacao==='publicar'),false,'publicação antiga está fora da janela');
    eq(dto.reagendamento,{permitido:false,motivo:'estado-incompativel',motivos:['estado-incompativel']},'publicação antiga bloqueia ambos contratos de elegibilidade');
    await rejects(previa(history),/estado-incompativel/);

    // Limite de tentativas retirado ANTES do LIMIT, sem bloquear trabalho seguinte.
    const exhausted = await novo(), eligible = await novo();
    await db.query(`insert into public.admin_marketing_envios(agendamento_id,chave,tentativa,operacao,estado,terminado_em)
      values($1,$2,1000,'preparar','falhou',now())`,[exhausted.id,'9'.repeat(64)]);
    await foco(exhausted.id,eligible.id); const slots = await claim(randomUUID(),1);
    eq(slots.map(x=>x.jobId),[eligible.id],'tentativa esgotada não consome vaga');
    eq((await row(exhausted.id)).codigo_erro,'tentativas-esgotadas','esgotado deixa atenção visível');
    eq((await tentativas(exhausted.id)).length,1,'não insere tentativa 1001');

    // Executor/Graph reais: recibo incerto após POST privado perdido não é repetido.
    const network = [], rpcCalls = []; let responderGraph = async () => { throw new Error('resposta perdida'); };
    const cliente = {
      rpc(nome,args) { return {abortSignal:async signal => {
        signal?.throwIfAborted(); const n = nome.replace('admin_marketing_real_',''); rpcCalls.push(n);
        assert.ok(ARGS[n],'RPC conhecida '+n);
        try { return {data:await rpc(n,ARGS[n].map(k=>args[k])),error:null}; }
        catch(e) { return {data:null,error:{message:e.message}}; }
      }}; },
      from(table) { let id; const b={select(){return b;},eq(_k,v){id=v;return b;},abortSignal(){return b;},
        async single(){const data=(await db.query(`select * from public.${table} where id=$1`,[id])).rows[0];return {data,error:null};},
        maybeSingle(){return b.single();}};return b; },
      storage:{from:()=>({createSignedUrl:async obj=>({data:{signedUrl:'https://proj.supabase.co/storage/v1/object/sign/marketing-remoto/'+obj},error:null})})},
    };
    const env = {MARKETING_REAL_EXECUTOR_ATIVO:'true',MARKETING_REAL_EXECUTOR_SECRET:'s'.repeat(40),META_GRAPH_API_VERSION:'v23.0',
      SUPABASE_URL:'https://proj.supabase.co',MARKETING_IG_TOKEN:'fixture-token',MARKETING_FB_TOKEN:'fixture-token'};
    const executor = criarExecutorReal({cliente:()=>cliente,env:k=>env[k],log:()=>{},rede:async (u,init)=>{
      const event={url:String(u),method:init.method,body:init.body};network.push(event); return responderGraph(event);
    }});
    const tick = async () => {
      const res = await executor(new Request('http://fixture/executor',{method:'POST',headers:{'x-marketing-real-secret':env.MARKETING_REAL_EXECUTOR_SECRET},body:'{}'}));
      eq(res.status,200,'executor registra resultado');return res.json();
    };
    g = await novo(); await foco(g.id); await tick();
    eq(network.filter(x=>x.method==='POST').length,1,'um POST privado admitido');
    eq((await row(g.id)).etapa,'preparar','recibo incerto preserva etapa de preparo');
    eq((await row(g.id)).estado,'precisa-conferir','resposta perdida tem recibo visível');
    ok((await tentativas(g.id))[0].efeito_admitido_em,'efeito admitido registrado antes do transporte');
    await tick(); eq(network.length,1,'segundo worker não repete preparo incerto');
    ok(rpcCalls.includes('recibo'),'módulo real gravou recibo');

    // Preparos privados confirmados em ambas as redes podem ser substituídos.
    for (const conta of [ig,fb]) {
      g = await novo(conta); await foco(g.id);
      responderGraph = async e => { eq(e.method,'POST','preparo usa POST privado');
        if(conta===fb)ok(new URLSearchParams(e.body).get('published')==='false','foto FB explicitamente privada');
        return Response.json({id:'900'}); };
      await tick(); g = await row(g.id); p = await previa(g);
      successor = await row((await comando(pedido(g,p))).jobs[0].jobId);
      eq(successor.processamento,{},'novo preparo independente em '+conta);
      eq((await tentativas(g.id)).filter(e=>e.operacao==='publicar').length,0,'zero publicação na substituição');
    }

    // Lote parcial: substituir só Instagram mantém Facebook publicado byte a byte.
    const partial=await novo([ig,fb]);
    const partialJobs=(await db.query('select * from public.admin_marketing_agendamentos where lote_id=$1',[partial.lote_id])).rows;
    const partialIG=partialJobs.find(j=>j.conta_id===ig), partialFB=partialJobs.find(j=>j.conta_id===fb);
    await db.query(`update public.admin_marketing_agendamentos set estado='publicado',remoto_id='456_920',concluido_em=now(),
      processamento='{"publicacaoId":"456_920"}' where id=$1`,[partialFB.id]);
    const facebookBefore=await row(partialFB.id), postsBefore=network.filter(e=>e.method==='POST').length;
    p=await previa(partialIG); await comando(pedido(partialIG,p));
    eq(await row(partialFB.id),facebookBefore,'Facebook publicado é preservado integralmente');
    eq(network.filter(e=>e.method==='POST').length,postsBefore,'reagendamento SQL/Edge não faz POST adicional');

    // Leitura continua mesmo com toda capacidade operacional vencida/pausada.
    const prep = await novo(), verified = await novo(), reconcile = await novo(), blocked = await novo();
    for (const [j,stage,state] of [[prep,'consultar-preparo',{container:'901'}],
      [verified,'verificar-publicacao',{publicacaoId:'902'}],[reconcile,'reconciliar',{publicacaoId:'903'}]])
      await db.query(`update public.admin_marketing_agendamentos set etapa=$2,processamento=$3,pausado=true where id=$1`,[j.id,stage,state]);
    await db.query(`update public.admin_marketing_controles set habilitado=false,recuperacao_pendente=true,pausa_global=true,
      pausa_instagram=true,capacidade_validada_em=now()-interval '2 days',margem_validada_ate=now()-interval '1 day'`);
    await db.query(`update public.admin_marketing_real_contas set pausada=true,conexao='revogada',valida_ate=now()-interval '1 day'`);
    await foco(prep.id,verified.id,reconcile.id,blocked.id); network.length=0;
    responderGraph=async e=>{eq(e.method,'GET','capacidade vencida permite só GET'); const id=new URL(e.url).pathname.split('/').at(-1);
      return Response.json(id==='901'?{status_code:'FINISHED'}:{id,media_product_type:'FEED',permalink:'https://www.instagram.com/p/fixture/'});};
    const readbacks=()=>network.filter(e=>/\/(901|902|903)(?:\?|$)/.test(e.url));
    await tick(); eq(readbacks().length,3,'três consultas mesmo durante pausa/expiração');
    eq((await row(verified.id)).estado,'publicado','readback de publicação não perde resultado');
    eq((await row(reconcile.id)).estado,'publicado','reconciliação não perde resultado');
    eq((await tentativas(blocked.id)).length,0,'nenhum preparo novo durante pausa');
    await tick(); eq(readbacks().length,3,'pronto em consulta não autoriza POST enquanto pausado');
    eq(network.filter(e=>e.method==='POST').length,0,'renovação e acompanhamento não publicam durante pausa');
    await operacional();

    // A validade pode acabar entre claim e admitir; o fence revalida também.
    // Nova janela sintética: cenários anteriores já gastaram o orçamento de admissão.
    await db.exec('reset role');
    await db.query(`update public.admin_marketing_envios set iniciado_em=now()-interval '1 day'`);
    await db.exec('set role service_role');
    g = await novo(); await foco(g.id); const fenceWorker=randomUUID(), [fenced]=await claim(fenceWorker);
    await db.query(`update public.admin_marketing_controles set margem_validada_ate=now()-interval '1 second'`);
    eq(await admitir(fenceWorker,fenced),false,'expiração após claim barra POST');

    // Extensão v1 estrita na borda real, sem adotar v2.
    await operacional(); g = await novo(); const at=future(100);
    const entrada = validarPublicacaoReal({recurso:'publicacoes-reais',modo:'real',acao:'previa',jobId:g.id,
      destinos:[{contaId:ig,formato:'feed',publicarEm:at,fuso:'America/Sao_Paulo'}]});
    const op=criarOperacaoPublicacoesReais(); const response=await op.executar(cliente,entrada,{userId:admin,signal:new AbortController().signal,agora:new Date()});
    eq(response.dados.contractVersion,'e5.real.v1','prévia nova preserva versão v1');
    eq(response.dados.snapshot.snapshotId,g.snapshot_id,'prévia resolve snapshot no servidor');
    eq(response.dados.destinos[0].publicarEm,at,'prévia mostra novo horário');
    assert.throws(()=>validarPublicacaoReal({...entrada,snapshotId:g.snapshot_id,snapshotRevisao:2}),/pedido-invalido/); checks++;
    assert.throws(()=>validarPublicacaoReal({recurso:'publicacoes-reais',modo:'real',confirmado:true,...pedido(g,{id:randomUUID(),hash:null,destinos:[{publicarEm:at}]})}),/pedido-invalido/); checks++;
    const edgeCommand=validarPublicacaoReal({recurso:'publicacoes-reais',modo:'real',confirmado:true,
      ...pedido(g,{id:response.dados.previaId,hash:response.dados.previaHash,destinos:response.dados.destinos})});
    const edgeResult=await op.executar(cliente,edgeCommand,{userId:admin,signal:new AbortController().signal,agora:new Date()});
    eq(edgeResult.dados.jobs[0].reagendamento.permitido,true,'Edge real devolve sucessor com nova elegibilidade');
    eq((await row(edgeResult.dados.jobs[0].jobId)).substitui_id,g.id,'Edge real encaminha prévia e CAS ao SQL');
    g=await novo(); await foco(g.id);
    const concurrentClaims=await Promise.all([claim(),claim()]);
    eq(concurrentClaims.flat().filter(j=>j.jobId===g.id).length,1,'claims concorrentes não compartilham lease');
    eq((await rpc('consultar',[admin,{jobId:g.id}])).jobs[0].reagendamento.permitido,false,'lease ativa bloqueia elegibilidade na leitura');
    await db.exec('reset role');
    for (const role of ['anon','authenticated']) {
      await db.exec('set role '+role); await rejects(rpc('claim',[randomUUID(),3]),/permission denied/);
      await rejects(rpc('publicacao_possivel',[g.id]),/permission denied/); await db.exec('reset role');
    }
    await testarRespostaPerdidaP2();
    console.log(`marketing-real-recuperacao-v1: ${checks} verificacoes; SQL/Edge/executor/Graph reais; sem rede externa; concorrencia de chamadas e interleavings locais (PGlite serializa a conexao)`);
  } finally { await db.close(); }
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
