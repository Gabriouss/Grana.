import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { consultaComPrazo } from './admin-agregados.ts';
import { rpcReal } from './admin-publicacoes-reais.ts';
import { criarAdaptadorGraphReal, type JobGraph, type MidiaGraph, type ResultadoGraph } from './marketing-real-graph.ts';
import { criarRenovacao, type ContaRenovacao, type ResultadoRenovacao } from './marketing-real-renovacao.ts';
import { lerCorpoLimitado } from './request-body.ts';
import { timingSafeEqual } from './seguranca.ts';
type Claim=JobGraph&{leaseId:string;revisao:number;envioId:string;snapshotId:string;credencialRef:string};
/* Orcamento somado, nao chutado: claim 4 s + trabalho 14 s + recibo 5 s =
   23 s, dentro do total de 25 s e bem antes da lease de 2 min. V2 reserva
   mais 1 s para saúde e 1 s de folga. Os jobs rodam
   em paralelo. O recibo tem prazo PROPRIO, fora do sinal do trabalho: etapa que
   estourou ainda deixa recibo, em vez de esperar a lease vencer.
   A renovacao da capacidade corre em paralelo aos jobs, com conta propria:
   inicio 4 s + leitura Graph 8 s + registro 5 s = 17 s, tambem dentro dos
   25 s e da lease de 1 min da renovacao. */
export const PRAZOS_EXECUTOR={total:25_000,claim:4_000,trabalho:14_000,recibo:5_000,
 renovacaoInicio:4_000,renovacaoLeitura:8_000,renovacaoRegistro:5_000};
type Deps={env:(n:string)=>string|undefined;cliente:(signal:AbortSignal)=>SupabaseClient;rede?:typeof fetch;log:(linha:string)=>void;
 prazos?:Partial<typeof PRAZOS_EXECUTOR>};
// Erros lancados antes de qualquer POST, com nome proprio e sem segredo no texto.
const PERMANENTES_SEM_POST=new Set(['credencial-invalida','credencial-ausente','midia-invalida']);
const MOTIVOS_SEM_POST=new Set([...PERMANENTES_SEM_POST,'snapshot-indisponivel','midia-indisponivel','origem-midia-invalida','efeito-bloqueado']);
// So antes de existir post: depois de publicar (verificar, reconciliar, cancelar) o post pode estar NO AR,
// e "falhou" ali mentiria sobre ele. Nessas etapas o motivo vai ao recibo como adiado.
const ETAPAS_QUE_PODEM_FALHAR=new Set(['preparar','consultar-preparo','publicar']);
const comPrazo=(pai:AbortSignal,ms:number)=>AbortSignal.any([pai,AbortSignal.timeout(ms)]);
export function criarExecutorReal(deps:Deps){
 const prazo={...PRAZOS_EXECUTOR,...deps.prazos};
 return async(req:Request):Promise<Response>=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),prazo.total);let status=500,processados=0,incertos=0;
  let renovacao='nao-rodou';
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
   // Opt-in server-side: nunca envia RPC v2 para o servidor anterior por padrão.
   const contrato=deps.env('MARKETING_REAL_EXECUTOR_CONTRATO')??'e5.real.v1';
   if(!['e5.real.v1','e5.real.v2'].includes(contrato))return responder(503,'contrato-invalido');
   const v2=contrato==='e5.real.v2';
   const rpc=<T>(nome:string,args:Record<string,unknown>,s:AbortSignal)=>rpcReal<T>(client,
    v2&&['claim','admitir','recibo'].includes(nome)?nome+'_v2':nome,args,s);
   // Nunca rejeita: cada desfecho vira um codigo no log, e o banco guarda o recibo.
   const renovando=(async()=>{
    let inicio:{renovacaoId:string;lease:string;contas:ContaRenovacao[]}|null;
    try{inicio=await rpc('renovacao_iniciar',{p_worker:worker},comPrazo(controller.signal,prazo.renovacaoInicio));}
    catch{return 'inicio-indisponivel';}
    if(!inicio)return 'nao-devida';
    let resultados:ResultadoRenovacao[];
    // Prazo efetivo da fase toda: rejeita no limite mesmo que uma leitura nao coopere
    // com o abort, e o resultado que chegar depois nunca e registrado.
    try{resultados=await consultaComPrazo(s=>criarRenovacao({rede:deps.rede??fetch,versao,env:deps.env,signal:s})(inicio.contas),
     controller.signal,prazo.renovacaoLeitura);}
    catch{resultados=inicio.contas.map(c=>({contaId:c.contaId,resultado:'inconclusivo',motivo:'leitura-interrompida'}));}
    try{return (await rpc<{resultado:string}>('renovacao_registrar',{p_worker:worker,p_renovacao:inicio.renovacaoId,
     p_lease:inicio.lease,p_resultado:{contas:resultados}},AbortSignal.timeout(prazo.renovacaoRegistro))).resultado;}
    catch{return 'registro-pendente';}
   })().then(r=>{renovacao=r;});
   try{
   const claims=await rpc<Claim[]>('claim',{p_worker:worker,p_limite:3},comPrazo(controller.signal,prazo.claim));
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
       const ok=await rpc<boolean>('admitir',{p_worker:worker,p_job:job.jobId,p_lease:job.leaseId,p_revisao:job.revisao},s);
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
    }catch(e){
     /* Regra 9: o motivo conhecido vai ao recibo, em vez de um "sem-efeito" mudo.
        Causa permanente sem POST admitido (credencial ou midia fora do snapshot)
        nao se cura repetindo: vira "falhou" com o codigo, sem girar adiada ate
        a autorizacao morrer. Nada saiu para a Meta, entao falhar e seguro. */
     const motivo=e instanceof Error&&MOTIVOS_SEM_POST.has(e.message)?e.message:'sem-efeito';
     resultado=admitido?{estado:'incerto',codigo:'resultado-nao-confirmado'}
      :PERMANENTES_SEM_POST.has(motivo)&&ETAPAS_QUE_PODEM_FALHAR.has(job.etapa)?{estado:'falhou',codigo:motivo}
      :job.etapa==='publicar'?{estado:'incerto',codigo:'resultado-nao-confirmado'}:{estado:'adiado',codigo:motivo};
    }
    if(resultado.estado==='incerto')incertos++;
    await rpc('recibo',{p_worker:worker,p_job:job.jobId,p_lease:job.leaseId,p_revisao:job.revisao,p_resultado:resultado},
      AbortSignal.timeout(prazo.recibo));
    processados++;
   }));
   if(execucoes.some(x=>x.status==='rejected'))return responder(503,'recibo-pendente');
   return responder(200,'execucao-concluida');
   }catch(e){status=controller.signal.aborted?504:503;throw e;}finally{
    await renovando;
    if(v2){
     try{await consultaComPrazo(s=>rpcReal(client,'worker_concluido_v2',
      {p_resultado:{http:status,processados,incertos}},s),controller.signal,1000);}
     catch{deps.log(JSON.stringify({codigo:'saude-executor-pendente'}));}
    }
   }
  }catch{return responder(controller.signal.aborted?504:503,controller.signal.aborted?'prazo':'executor-indisponivel');}
  finally{clearTimeout(timer);deps.log(JSON.stringify({codigo:'executor-real',status,processados,incertos,renovacao}));}
 };
}
