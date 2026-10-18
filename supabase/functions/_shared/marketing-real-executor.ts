import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { consultaComPrazo } from './admin-agregados.ts';
import { rpcReal } from './admin-publicacoes-reais.ts';
import { criarAdaptadorGraphReal, type JobGraph, type MidiaGraph, type ResultadoGraph } from './marketing-real-graph.ts';
import { lerCorpoLimitado } from './request-body.ts';
import { timingSafeEqual } from './seguranca.ts';
type Claim=JobGraph&{leaseId:string;revisao:number;envioId:string;snapshotId:string;credencialRef:string};
/* Orcamento somado, nao chutado: claim 4 s + trabalho 14 s + recibo 5 s =
   23 s, dentro do total de 25 s e bem antes da lease de 2 min. Os jobs rodam
   em paralelo. O recibo tem prazo PROPRIO, fora do sinal do trabalho: etapa que
   estourou ainda deixa recibo, em vez de esperar a lease vencer. */
export const PRAZOS_EXECUTOR={total:25_000,claim:4_000,trabalho:14_000,recibo:5_000};
type Deps={env:(n:string)=>string|undefined;cliente:(signal:AbortSignal)=>SupabaseClient;rede?:typeof fetch;log:(linha:string)=>void;
 prazos?:Partial<typeof PRAZOS_EXECUTOR>};
const comPrazo=(pai:AbortSignal,ms:number)=>AbortSignal.any([pai,AbortSignal.timeout(ms)]);
export function criarExecutorReal(deps:Deps){
 const prazo={...PRAZOS_EXECUTOR,...deps.prazos};
 return async(req:Request):Promise<Response>=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),prazo.total);let status=500,processados=0,incertos=0;
  const responder=(s:number,codigo:string)=>{status=s;return Response.json({modo:'real',codigo,processados,incertos},{status:s,headers:{'Cache-Control':'no-store'}});};
  try{
   if(req.method!=='POST')return responder(405,'metodo-invalido');
   const secret=deps.env('MARKETING_REAL_EXECUTOR_SECRET')??'',versao=deps.env('META_GRAPH_API_VERSION')??'';
   if(deps.env('MARKETING_REAL_EXECUTOR_ATIVO')!=='true'||secret.length<32||secret.length>256||!/^v\d+\.\d+$/.test(versao))return responder(503,'nao-configurado');
   if(!timingSafeEqual(req.headers.get('x-marketing-real-secret')??'',secret))return responder(401,'nao-autorizado');
   const lido=await lerCorpoLimitado(req,128,2000);if(!lido.ok)return responder(lido.status,'corpo-recusado');
   let corpo:unknown;try{corpo=JSON.parse(new TextDecoder().decode(lido.bytes));}catch{return responder(400,'pedido-invalido');}
   if(!corpo||typeof corpo!=='object'||Array.isArray(corpo)||Object.keys(corpo).length)return responder(400,'pedido-invalido');
   const client=deps.cliente(controller.signal),worker=crypto.randomUUID();
   const claims=await rpcReal<Claim[]>(client,'claim',{p_worker:worker,p_limite:3},comPrazo(controller.signal,prazo.claim));
   const execucoes=await Promise.allSettled(claims.map(async job=>{
    /* Todo POST passa por `admitir` no banco antes de sair. Sem admissao neste
       intento nao houve POST, e a etapa pode ser repetida ("adiado"). Depois de
       admitido, qualquer erro e incerto: a Meta pode ter recebido o pedido.
       `publicar` nunca e adiado: a migration deixa a repeticao dele manual. */
    let admitido=false,resultado:ResultadoGraph={estado:'incerto',codigo:'execucao-interrompida'};
    try{
     const trabalho=comPrazo(controller.signal,prazo.trabalho);
     const row=await consultaComPrazo(s=>client.from('admin_marketing_real_snapshots').select('estado,dados').eq('id',job.snapshotId).abortSignal(s).single(),trabalho,prazo.trabalho);
     if(row.error||!row.data||row.data.estado!=='pronto')throw new Error('snapshot-indisponivel');
     if(!/^MARKETING_[A-Z0-9_]{1,80}$/.test(job.credencialRef))throw new Error('credencial-invalida');
     const token=deps.env(job.credencialRef);if(!token)throw new Error('credencial-ausente');
     const snapshot=row.data.dados as {legenda:string;midias:MidiaGraph[];capa?:MidiaGraph|null};
     const redeOriginal=deps.rede??fetch;
     // O adaptador nasce com o sinal da ETAPA: o prazo aborta o transporte, nao so a espera.
     resultado=await consultaComPrazo(s=>criarAdaptadorGraphReal({rede:async(input,init)=>{
      if(init?.method==='POST'){
       const ok=await rpcReal<boolean>(client,'admitir',{p_worker:worker,p_job:job.jobId,p_lease:job.leaseId,p_revisao:job.revisao},s);
       if(!ok)throw new Error('efeito-bloqueado');
       admitido=true;
      }
      return redeOriginal(input,init);
     },versao,token,signal:s,assinar:async m=>{
      // Assina so objeto registrado no snapshot, e confere a origem da URL.
      if(!snapshot.midias.some(x=>x.objeto===m.objeto&&x.sha256===m.sha256)&&snapshot.capa?.objeto!==m.objeto)throw new Error('midia-invalida');
      const r=await consultaComPrazo(()=>client.storage.from('marketing-remoto').createSignedUrl(m.objeto,3600),s);
      if(r.error||!r.data?.signedUrl)throw new Error('midia-indisponivel');
      const u=new URL(r.data.signedUrl),origem=new URL(deps.env('SUPABASE_URL')??'');
      if(u.protocol!=='https:'||u.origin!==origem.origin||!u.pathname.startsWith('/storage/v1/object/sign/marketing-remoto/'))throw new Error('origem-midia-invalida');return u.href;
     }}).executar(job,snapshot),trabalho,prazo.trabalho);
     // Efeito barrado pelo fence (pausa, cancelamento, lease) antes de sair volta incerto do adaptador.
     if(resultado.estado==='incerto'&&resultado.codigo==='resultado-nao-confirmado'&&!admitido&&job.etapa!=='publicar')
      resultado={estado:'adiado',codigo:'efeito-nao-admitido',processamento:resultado.processamento};
    }catch{
     resultado=admitido||job.etapa==='publicar'?{estado:'incerto',codigo:'resultado-nao-confirmado'}:{estado:'adiado',codigo:'sem-efeito'};
    }
    if(resultado.estado==='incerto')incertos++;
    await rpcReal(client,'recibo',{p_worker:worker,p_job:job.jobId,p_lease:job.leaseId,p_revisao:job.revisao,p_resultado:resultado},
      AbortSignal.timeout(prazo.recibo));
    processados++;
   }));
   if(execucoes.some(x=>x.status==='rejected'))return responder(503,'recibo-pendente');
   return responder(200,'execucao-concluida');
  }catch{return responder(controller.signal.aborted?504:503,controller.signal.aborted?'prazo':'executor-indisponivel');}
  finally{clearTimeout(timer);deps.log(JSON.stringify({codigo:'executor-real',status,processados,incertos}));}
 };
}
