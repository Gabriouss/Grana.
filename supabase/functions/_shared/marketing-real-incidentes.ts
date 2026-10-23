import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from './seguranca.ts';
import { lerCorpoLimitado } from './request-body.ts';
import { consultaComPrazo } from './admin-agregados.ts';
import { jsonLimitado } from './marketing-real-graph.ts';
import { heartbeatMarketing } from './marketing-real-heartbeat.ts';
type Objeto=Record<string,unknown>;
type Deps={env:(n:string)=>string|undefined;cliente:(s:AbortSignal)=>SupabaseClient;rede?:typeof fetch;log:(s:string)=>void};
type Email={emailId:string;incidenteId:string;codigo:string;jobId:string|null;rede:string|null;adminId:string};
export function configuracaoEmailMarketing(env:Deps['env']){
 const apiKey=env('MARKETING_RESEND_API_KEY')||env('RESEND_API_KEY');
 const from=env('MARKETING_INCIDENTES_EMAIL_FROM')||'admin@granaponto.com.br';
 const to=env('MARKETING_INCIDENTES_EMAIL_TO')||env('EMAIL_ENCAMINHAR_PARA');
 const email=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
 return {apiKey,from,to,valida:!!apiKey&&email.test(from)&&!!to&&email.test(to)&&!!env('ADMIN_MARKETING_USER_ID')};
}
export function retryAfterSegundos(v:string|null,agora=Date.now()):number{
 if(!v)return 60;const n=/^\d+$/.test(v)?Number(v):(Date.parse(v)-agora)/1000;
 return Number.isFinite(n)?Math.min(3600,Math.max(60,Math.ceil(n))):60;
}
// Retentativa conserva corpo E Idempotency-Key. Janela de dedup Resend e limitada no DB.
export async function enviarIncidenteEmail(e:Email,deps:Deps,signal:AbortSignal):Promise<Objeto>{
 const {apiKey,from,to,valida}=configuracaoEmailMarketing(deps.env);
 if(!valida||e.adminId!==deps.env('ADMIN_MARKETING_USER_ID'))
  return {estado:'pendente',codigo:'email-configuracao-ausente',retryAfterSegundos:300};
 try{
  const r=await (deps.rede??fetch)('https://api.resend.com/emails',{method:'POST',redirect:'error',signal,
   headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'grana-incidente/'+e.emailId},
   body:JSON.stringify({from,to:[to],subject:'Grana. — incidente de publicação',
    text:`Incidente: ${e.codigo}\nRede: ${e.rede??'serviço'}\nReferência: ${e.incidenteId}\nPublicação: ${e.jobId??'executor'}\nAbra o painel para conferir e reconhecer. Um resultado incerto não autoriza repetir a publicação.`})});
  const after=retryAfterSegundos(r.headers.get('Retry-After'));
  if(r.status===429||r.status>=500){await r.body?.cancel();return {estado:'pendente',codigo:'email-transitorio',retryAfterSegundos:after};}
  const d=await jsonLimitado(r);
  if(!r.ok||typeof d.id!=='string')return {estado:'falhou',codigo:'email-recusado'};
  return {estado:'aceito',provedorId:d.id};
 }catch{return {estado:'pendente',codigo:'email-resposta-incerta',retryAfterSegundos:60};}
}
export async function consultarEntregaEmail(id:string,deps:Deps,signal:AbortSignal):Promise<{estado:string;codigo:string|null}>{
 if(!/^[A-Za-z0-9-]{8,80}$/.test(id))return {estado:'nao-verificada',codigo:'email-id-invalido'};
 try{
  const cfg=configuracaoEmailMarketing(deps.env);if(!cfg.valida)return {estado:'nao-verificada',codigo:'email-configuracao-ausente'};
  const r=await (deps.rede??fetch)('https://api.resend.com/emails/'+id,{method:'GET',redirect:'error',signal,headers:{Authorization:'Bearer '+cfg.apiKey}});
  const d=await jsonLimitado(r);if(!r.ok||d.id!==id)return {estado:'nao-verificada',codigo:'email-status-indisponivel'};
  if(['delivered','opened','clicked'].includes(String(d.last_event)))return {estado:'entregue',codigo:null};
  if(['bounced','complained','failed','suppressed'].includes(String(d.last_event)))return {estado:'falhou',codigo:'email-entrega-falhou'};
  return {estado:'adiada',codigo:'email-entrega-pendente'};
 }catch{return {estado:'nao-verificada',codigo:'email-status-indisponivel'};}
}
export function criarOperadorIncidentes(tipo:'monitor'|'email',deps:Deps){
 return async(req:Request):Promise<Response>=>{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),24000);let sucesso=false;let clientHeartbeat:SupabaseClient|null=null;
  const responder=(s:number,codigo:string)=>Response.json({codigo},{status:s,headers:{'Cache-Control':'no-store'}});
  try{
   if(req.method!=='POST')return responder(405,'metodo-invalido');
   const secret=deps.env(tipo==='monitor'?'MARKETING_MONITOR_SECRET':'MARKETING_EMAIL_SECRET')??'';
   if(secret.length<32||secret.length>256)return responder(503,'nao-configurado');
   if(!timingSafeEqual(req.headers.get('x-marketing-ops-secret')??'',secret))return responder(401,'nao-autorizado');
   const body=await lerCorpoLimitado(req,128,2000);if(!body.ok)return responder(body.status,'corpo-recusado');
   let p;try{p=JSON.parse(new TextDecoder().decode(body.bytes));}catch{return responder(400,'pedido-invalido');}
   if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length)return responder(400,'pedido-invalido');
   const client=deps.cliente(ctl.signal),worker=crypto.randomUUID();clientHeartbeat=client;
   const rpc=async<T>(nome:string,args:Objeto):Promise<T>=>consultaComPrazo(async signal=>{
    const r=await client.rpc('admin_marketing_real_'+nome,args).abortSignal(signal);
    if(r.error)throw new Error('rpc-indisponivel');return r.data as T;
   },ctl.signal,2000);
   if(tipo==='monitor'){
    const estado=await rpc<{saudavel?:boolean}>('monitor',{p_worker:worker,p_admin:deps.env('ADMIN_MARKETING_USER_ID')??null});
    sucesso=estado?.saudavel===true;
    return responder(sucesso?200:503,sucesso?'monitor-concluido':'monitor-canal-indisponivel');
   }
   else{
    const cfg=configuracaoEmailMarketing(deps.env);
    if(!cfg.valida){await rpc('email_concluido',{p_configurado:false,p_saudavel:false,p_codigo:'email-configuracao-ausente'});return responder(503,'email-configuracao-ausente');}
    if(await rpc<boolean>('email_liberado',{})!==true){
     await rpc('email_concluido',{p_configurado:true,p_saudavel:false,p_codigo:'email-aguarda-consentimento'});
     return responder(503,'email-aguarda-consentimento');
    }
    const emails=await rpc<Email[]>('email_claim',{p_worker:worker});
    const results=await Promise.allSettled(emails.map(async e=>{
     const r=await consultaComPrazo(s=>enviarIncidenteEmail(e,deps,s),ctl.signal,5000);
     const gravado=await rpc<boolean>('email_recibo',{p_worker:worker,p_email:e.emailId,p_resultado:r});
     if(!gravado)throw new Error('recibo-indisponivel');
     return r.estado==='aceito';
    }));
    const consultas=await rpc<{emailId:string;provedorId:string}[]>('email_consultas',{});
    const statuses=await Promise.allSettled(consultas.map(async e=>{
     const r=await consultaComPrazo(s=>consultarEntregaEmail(e.provedorId,deps,s),ctl.signal,5000);
     const gravado=await rpc<boolean>('email_entrega',{p_email:e.emailId,p_provedor:e.provedorId,p_estado:r.estado,p_codigo:r.codigo});
     return gravado&&r.estado==='entregue';
    }));
    const saudavel=results.every(x=>x.status==='fulfilled'&&x.value===true)&&statuses.every(x=>x.status==='fulfilled'&&x.value===true);
    await rpc('email_concluido',{p_configurado:true,p_saudavel:saudavel,p_codigo:saudavel?null:'email-canal-indisponivel'});
    if(!saudavel)return responder(503,'email-canal-indisponivel');
   }
   sucesso=true;return responder(200,tipo+'-concluido');
  }catch{deps.log(JSON.stringify({codigo:tipo+'-indisponivel'}));return responder(503,tipo+'-indisponivel');}
  finally{
   if(tipo==='monitor'&&clientHeartbeat)try{
    const ping=await consultaComPrazo(()=>heartbeatMarketing(deps.env,deps.rede??fetch,'MONITOR',sucesso,deps.log),ctl.signal,700);
    if(ping)await consultaComPrazo(async signal=>{
     const r=await clientHeartbeat!.rpc('admin_marketing_real_integracao_recibo',{p_alvo:'MONITOR'}).abortSignal(signal);
     if(r.error)throw new Error('recibo');
    },ctl.signal,700);
   }catch{deps.log(JSON.stringify({codigo:'heartbeat-recibo-pendente'}));}
   clearTimeout(timer);
  }
 };
}
