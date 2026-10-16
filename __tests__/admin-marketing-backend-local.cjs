'use strict';
// SDK e contratos reais. Todo transporte é dublê; nenhuma configuração local é usada.
const assert = require('node:assert/strict');
const { criarBackend } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const { carregar } = require('../tools/admin-local/adaptadores/_contratos-marketing.cjs');
let provas = 0;
const eq = (a,b) => { assert.deepEqual(a,b); provas++; };
const ok = a => { assert.ok(a); provas++; };
const agora = new Date('2026-10-16T15:00:00Z');
const user = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const token = 'fixture-segredo-servidor-nao-publicar';
const env = { EXPO_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY:token,
  ADMIN_MARKETING_USER_ID:user, META_READ_ACCESS_TOKEN:token, META_AD_ACCOUNT_ID:'1234', META_GRAPH_API_VERSION:'v25.0' };
const cfg = { ler: k => env[k] };
const peca = { peca_id:'a'.repeat(16), versao:'b'.repeat(40), aprovado:true,
  manifesto:{legendaSha256:'c'.repeat(64),capaSha256:null,midias:[{sha256:'d'.repeat(64),tipo:'imagem'}]} };
let row = null, revisao = -1, pausado = false, falhar = false;
const chamadas = [];
const logs = [];
const json = (v, status=200, headers={}) => new Response(JSON.stringify(v), {status,headers:{'Content-Type':'application/json',...headers}});
async function rede(input, init = {}) {
  const url = new URL(String(input));
  const metodo = init.method || 'GET';
  chamadas.push({url,metodo,init});
  if (falhar) throw new Error(token);
  if (url.hostname === 'graph.facebook.com') {
    eq(metodo,'GET');
    ok(!url.search.includes(token));
    if (url.pathname.endsWith('/insights')) return json({data:[]});
    if (url.pathname.endsWith('/campaigns')) return json({data:[]});
    return json({currency:'BRL',timezone_name:'America/Sao_Paulo'});
  }
  eq(url.origin,'https://fixture.supabase.co');
  eq(init.redirect,'error');
  eq(new Headers(init.headers).get('apikey'),token);
  if (url.pathname.endsWith('/admin_marketing_sim_catalogo')) return json(peca);
  if (url.pathname.endsWith('/rpc/admin_marketing_sim_cas')) {
    const p = JSON.parse(init.body);
    eq(p.p_revisao,row ? revisao : -1);
    row = p.p_dados; revisao++;
    return json(revisao);
  }
  if (url.pathname.endsWith('/admin_marketing_sim_outbox')) {
    if (url.searchParams.get('select') === 'dados') return json(row ? [{dados:row}] : []);
    return json(row ? {dados:row,revisao} : null);
  }
  if (url.pathname.endsWith('/admin_marketing_sim_controles')) return json({global_pausado:pausado,facebook_pausado:false,instagram_pausado:false});
  if (url.pathname.endsWith('/rpc/admin_marketing_sim_pausar')) { pausado = JSON.parse(init.body).p_pausa; return json(null); }
  if (url.pathname.endsWith('/admin_marketing_notificacoes')) {
    eq(url.searchParams.get('destinatario_id'),'eq.'+user);
    if (metodo === 'HEAD') return new Response(null,{status:200,headers:{'content-range':'0-0/1'}});
    if (metodo === 'PATCH') { eq(JSON.parse(init.body),{lida_em:agora.toISOString()}); return json([{id}]); }
    return json([{id,codigo:'codigo-desconhecido',importancia:'critica',agendamento_id:null,criado_em:agora.toISOString(),lida_em:null,resolvida_em:null}]);
  }
  throw new Error('transporte-nao-previsto');
}
(async () => {
  const b = criarBackend({configuracao:cfg,rede,relogio:()=>agora,log:linha=>logs.push(linha)});
  const e4 = await b.meta();
  eq(e4.meta.investimentoCentavos,0);
  eq(e4.cakto.receitaConfirmadaCentavos,null);
  const n = chamadas.length;
  eq(await b.meta(),e4); eq(chamadas.length,n); // Cache real do coletor.
  const e7 = await b.analytics();
  eq(e7.weeklyReport.period.startInclusive,'2026-10-05T03:00:00.000Z');
  eq(e7.weeklyReport.period.endExclusive,'2026-10-12T03:00:00.000Z');
  eq(e7.weeklyReport.snapshotId,e7.snapshot.snapshotId);
  eq(e7.weeklyReport.metrics,e7.snapshot.metrics);
  eq(e7.weeklyReport.metrics[0].value,0);
  eq(e7.weeklyReport.recommendations,[]);
  eq(e7.externalMutation,false);
  const consultas = chamadas.filter(c=>c.url.pathname.endsWith('/insights')).map(c=>JSON.parse(c.url.searchParams.get('time_range')));
  ok(consultas.some(p=>p.since==='2026-10-05'&&p.until==='2026-10-11'));
  ok(consultas.some(p=>p.since==='2026-09-16'&&p.until==='2026-10-15'));
  const atual = await b.analytics('semana-atual');
  eq(atual.weeklyReport.periodState,'partial'); eq(atual.snapshot.metrics[0].value,null);

  const pedido = {recurso:'publicacoes-simulacao',modo:'simulacao',acao:'previa',alvo:{pecaId:peca.peca_id,rede:'facebook',conta:'99',formato:'feed',horario:'2026-10-16T16:00:00.000Z',estrategia:'nativo-meta'}};
  const antes = chamadas.length;
  const previa = await b.simulacao(pedido);
  ok(previa.chave);
  ok(chamadas.slice(antes).every(c=>c.metodo==='GET'));
  await b.simulacao({...pedido,acao:'confirmar',chave:previa.chave,confirmado:true});
  ok(row); eq(row.modo,'simulacao');
  eq((await b.simulacao({recurso:pedido.recurso,modo:'simulacao',acao:'listar'})).registros.length,1);
  await b.simulacao({recurso:pedido.recurso,modo:'simulacao',acao:'pausar',rede:'global'});
  eq(pausado,true);
  const total = chamadas.length;
  for (const ruim of [{...pedido,modo:'real'}, {...pedido,token}, {...pedido,userId:id}, {...pedido,alvo:{...pedido.alvo,manifesto:peca.manifesto}}]) {
    await assert.rejects(()=>b.simulacao(ruim),e=>e.codigo==='pedido-invalido'); provas++;
  }
  eq(chamadas.length,total);
  const notificacoes = await b.notificacoes({recurso:'marketing-notificacoes'});
  eq(notificacoes.naoLidas,1); eq(notificacoes.notificacoes[0].id,id);
  eq(await b.notificacoes({recurso:'marketing-ler',ids:[id]}),{atualizados:1});
  await assert.rejects(()=>b.notificacoes({recurso:'marketing-ler',ids:[id],userId:id}),e=>e.codigo==='pedido-invalido'); provas++;
  ok(!JSON.stringify([e4,e7,previa,notificacoes,row]).includes(token));
  ok(chamadas.filter(c=>c.metodo!=='GET'&&c.metodo!=='HEAD').every(c=>c.url.hostname==='fixture.supabase.co'));
  // A casca local utiliza a fonte real e projeta códigos desconhecidos sem texto externo.
  const moduloBackend = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
  const originalBackend = moduloBackend.backend;
  const config = require('../tools/admin-local/config.cjs');
  const originalSimular = config.SIMULAR;
  const moduloSino = require.resolve('../tools/admin-local/marketing/notificacoes.cjs');
  moduloBackend.backend = () => b; config.SIMULAR = false;
  delete require.cache[moduloSino];
  const sino = require(moduloSino);
  try {
    const lista = await sino.listarNotificacoes();
    eq(lista.fonte,'remota');eq(lista.naoLidas,1);eq(lista.notificacoes[0].importancia,'agir');
    eq(lista.notificacoes[0].destino,null);
    eq((await sino.marcarNotificacoes(null,{ids:[id]})).atualizados,1);
    await assert.rejects(()=>sino.marcarNotificacoes(null,{ids:[id],desfazer:true}),e=>e.status===400);provas++;
    const ausente = criarBackend({configuracao:{ler:()=>null},rede:()=>assert.fail('rede sem config')});
    moduloBackend.backend = () => ausente;
    delete require.cache[moduloSino];
    const semSino = await require(moduloSino).listarNotificacoes();
    eq(semSino.fonte,'indisponivel');eq(semSino.naoLidas,null);
  } finally { moduloBackend.backend=originalBackend;config.SIMULAR=originalSimular;delete require.cache[moduloSino]; }
  falhar = true;
  await assert.rejects(()=>b.notificacoes({recurso:'marketing-notificacoes'}),e=>e.status===503&&!e.message.includes(token)); provas++;
  eq(logs,['[painel] marketing-fonte-indisponivel']);
  const sem = criarBackend({configuracao:{ler:()=>null},rede:()=>assert.fail('rede sem config')});
  eq((await sem.meta()).meta.estado,'nao-configurado');
  eq((await sem.simulacao({recurso:pedido.recurso,modo:'simulacao',acao:'listar'})).status,'indisponivel');
  eq((await sem.notificacoes({recurso:'marketing-notificacoes'})).status,'indisponivel');
  eq((await sem.analytics()).snapshot.metrics.map(m=>m.value),[null,null,null,null,null]);
  assert.throws(()=>carregar('.env'),/contrato-nao-permitido/); provas++;
  console.log(`admin-marketing-backend-local: ${provas} provas OK`);
})().catch(e=>{console.error(e);process.exitCode=1;});
