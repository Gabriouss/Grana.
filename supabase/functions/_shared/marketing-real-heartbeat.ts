// URLs privadas so no ambiente. Nunca incluir URL/erro de transporte em log.
import { consultaComPrazo } from './admin-agregados.ts';
export async function heartbeatMarketing(env:(n:string)=>string|undefined,rede:typeof fetch,
 alvo:'WORKER'|'MONITOR',sucesso:boolean,log:(s:string)=>void):Promise<boolean>{
 const valor=env('MARKETING_HEALTHCHECKS_'+alvo+'_URL');
 if(!valor){log(JSON.stringify({codigo:'heartbeat-ausente',alvo}));return false;}
 try{
  const url=new URL(valor);
  if(url.protocol!=='https:'||url.hostname!=='hc-ping.com'||url.username||url.password||url.port||url.search||url.hash
   ||!/^\/[0-9a-f-]{36}$/.test(url.pathname))throw new Error('configuracao');
  if(!sucesso)url.pathname+='/fail';
  await consultaComPrazo(async signal=>{
   const r=await rede(url,{method:'GET',redirect:'error',signal});
   await r.body?.cancel();if(!r.ok)throw new Error('indisponivel');
  },AbortSignal.timeout(700),700);return sucesso;
 }catch{log(JSON.stringify({codigo:'heartbeat-indisponivel',alvo}));return false;}
}
