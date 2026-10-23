import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import type { OperacaoAdmin } from './admin-autorizacao.ts';
import { consultaComPrazo } from './admin-agregados.ts';

export const CONTRATO_REAL = 'e5.real.v1';
export const CONTRATO_REAL_V2 = 'e5.real.v2';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const FORMATOS=['feed','carrossel','reels','stories'];
const MAX_ARQUIVO=47185919,MAX_TOTAL=64*1024*1024;
type Contexto={userId:string;agora:Date;signal:AbortSignal};
type Objeto=Record<string,unknown>;
export class ErroPublicacaoReal extends Error {
  constructor(public codigo:string,public status=409){super(codigo);}
}
const falhar=(codigo:string,status=400):never=>{throw new ErroPublicacaoReal(codigo,status);};
function objeto(v:unknown):Objeto{if(!v||typeof v!=='object'||Array.isArray(v))return falhar('pedido-invalido');return v as Objeto;}
function campos(p:Objeto,permitidos:string[]){if(Object.keys(p).some(k=>!permitidos.includes(k)))falhar('pedido-invalido');}
function uuid(v:unknown){if(typeof v!=='string'||!UUID.test(v))falhar('pedido-invalido');return v as string;}
function inteiro(v:unknown,min=1,max=2147483647){if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)falhar('pedido-invalido');return v as number;}
function horario(v:unknown){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)||!Number.isFinite(Date.parse(v)))falhar('horario-invalido');return new Date(v as string).toISOString();}
const CODIGOS=new Set(['pedido-invalido','previa-inexistente','previa-expirada','revisao-divergente','idempotencia-divergente',
 'snapshot-inexistente','snapshot-indisponivel','snapshot-invalido','midia-divergente','midia-invalida','conta-indisponivel',
 'capacidade-nao-comprovada','horario-invalido','destino-duplicado','operacao-bloqueada','operacao-pausada','agendamento-ja-existe',
 'agendamento-inexistente','lote-inexistente','estado-incompativel','ja-publicado','operacao-em-andamento','destino-invalido',
 'midia-incompativel','midia-grande','midia-inexistente','nao-autorizado',
 'atualizar-cliente','geracao-divergente','revisao-editorial-pendente','revisao-nao-iniciada','versao-divergente',
 'identidade-ambigua','antecedencia-insuficiente','consentimento-invalido','politica-invalida','politica-nao-pronta','incidente-inexistente']);
export async function rpcReal<T>(cliente:SupabaseClient,nome:string,args:Objeto,signal:AbortSignal):Promise<T>{
 const r=await consultaComPrazo(s=>cliente.rpc('admin_marketing_real_'+nome,args).abortSignal(s),signal);
 if(r.error){const codigo=CODIGOS.has(r.error.message)?r.error.message:'fonte-indisponivel';
   throw new ErroPublicacaoReal(codigo,codigo==='fonte-indisponivel'?503:codigo.endsWith('inexistente')?404:409);}
 return r.data as T;
}
export type PedidoPublicacaoReal={recurso:'publicacoes-reais';modo:'real';acao:string}&Objeto;
export function validarPublicacaoReal(v:unknown):PedidoPublicacaoReal{
  const entrada=objeto(v);
 if(entrada.acao==='incidentes'||entrada.acao==='reconhecer-incidente'){
  campos(entrada,['recurso','modo','acao','contractVersion',...(entrada.acao==='reconhecer-incidente'?['incidenteId','idempotencia','confirmado']:[])]);
  if(entrada.recurso!=='publicacoes-reais'||entrada.modo!=='real')falhar('pedido-invalido');
  if(entrada.contractVersion!==undefined&&![CONTRATO_REAL,CONTRATO_REAL_V2].includes(String(entrada.contractVersion)))falhar('atualizar-cliente',409);
  if(entrada.acao==='reconhecer-incidente'){uuid(entrada.incidenteId);uuid(entrada.idempotencia);if(entrada.confirmado!==true)falhar('pedido-invalido');}
  return entrada as PedidoPublicacaoReal;
 }
 if(['politicaExecucao','capacidadesCliente','consentimentoExecucao'].some(k=>entrada[k]!==undefined)){
  const {politicaExecucao,capacidadesCliente,consentimentoExecucao,...resto}=entrada;
  if(capacidadesCliente!==undefined&&(!Array.isArray(capacidadesCliente)||capacidadesCliente.length>4||capacidadesCliente.some(c=>c!=='execucao-2h-v1')))falhar('atualizar-cliente',409);
  if(politicaExecucao!==undefined&&(!['legado-15min','recuperacao-2h-v1'].includes(String(politicaExecucao))||entrada.acao!=='previa'))falhar('pedido-invalido');
  if(consentimentoExecucao!==undefined&&(consentimentoExecucao!==true||entrada.acao!=='previa'))falhar('pedido-invalido');
  if(politicaExecucao==='recuperacao-2h-v1'&&(consentimentoExecucao!==true||!(capacidadesCliente as string[]|undefined)?.includes('execucao-2h-v1')))falhar('atualizar-cliente',409);
  return {...validarPublicacaoReal(resto),...(politicaExecucao!==undefined?{politicaExecucao}:{}),...(capacidadesCliente!==undefined?{capacidadesCliente}:{}),...(consentimentoExecucao!==undefined?{consentimentoExecucao}:{})};
 }
 const p=objeto(v);if(p.recurso!=='publicacoes-reais'||p.modo!=='real')falhar('pedido-invalido');
 if(p.contractVersion!==undefined){
  if(p.contractVersion===CONTRATO_REAL_V2)return validarPublicacaoRealV2(p);
  if(p.contractVersion!==CONTRATO_REAL)falhar('atualizar-cliente',409);
  const {contractVersion:_v,...legado}=p;return validarPublicacaoReal(legado);
 }
 const base=['recurso','modo','acao'];
 switch(p.acao){
  case 'contas':campos(p,base);break;
  case 'previa':{
   campos(p,[...base,'snapshotId','snapshotRevisao','jobId','destinos']);
   if(p.jobId!==undefined){uuid(p.jobId);if(p.snapshotId!==undefined||p.snapshotRevisao!==undefined)falhar('pedido-invalido');}
   else{uuid(p.snapshotId);inteiro(p.snapshotRevisao);}
   if(!Array.isArray(p.destinos)||p.destinos.length<1||p.destinos.length>8)falhar('destino-invalido');
   p.destinos=(p.destinos as unknown[]).map(x=>{const d=objeto(x);campos(d,['contaId','rede','formato','publicarEm','fuso']);uuid(d.contaId);
    if(!FORMATOS.includes(String(d.formato))||d.fuso!=='America/Sao_Paulo'||(d.rede!==undefined&&!['facebook','instagram'].includes(String(d.rede))))falhar('destino-invalido');
    return {...d,publicarEm:horario(d.publicarEm)};});break;
  }
  case 'confirmar':
   campos(p,[...base,'previaId','previaHash','revisaoEsperada','idempotencia','confirmado']);uuid(p.previaId);uuid(p.idempotencia);inteiro(p.revisaoEsperada);
   if(p.confirmado!==true||typeof p.previaHash!=='string'||!HASH.test(p.previaHash))falhar('pedido-invalido');break;
  case 'consultar':{
   campos(p,[...base,'jobId','loteId','idempotencia']);const refs=['jobId','loteId','idempotencia'].filter(k=>p[k]!==undefined);
   if(refs.length!==1)falhar('pedido-invalido');uuid(p[refs[0]]);break;
  }
  case 'listar':
   campos(p,[...base,'limite','cursor']);if(p.limite!==undefined)inteiro(p.limite,1,50);
   if(p.cursor!==undefined){const c=objeto(p.cursor);campos(c,['id','criadoEm']);uuid(c.id);horario(c.criadoEm);}break;
  case 'cancelar':case 'reconciliar':case 'reagendar':case 'pausar':case 'retomar':{
   campos(p,[...base,'jobId','revisaoEsperada','idempotencia','confirmado','escopo','contaId','publicarEm','fuso','previaId','previaHash']);
   uuid(p.idempotencia);inteiro(p.revisaoEsperada);if(p.confirmado!==true)falhar('pedido-invalido');
   if(p.escopo!==undefined){if(!['pausar','retomar'].includes(String(p.acao))||!['conta','global','facebook','instagram'].includes(String(p.escopo))||p.jobId!==undefined)falhar('pedido-invalido');
    if(p.escopo==='conta')uuid(p.contaId);else if(p.contaId!==undefined)falhar('pedido-invalido');
   }else uuid(p.jobId);
   if(p.acao==='reagendar'){
    p.publicarEm=horario(p.publicarEm);if(p.fuso!=='America/Sao_Paulo')falhar('horario-invalido');
    uuid(p.previaId);if(typeof p.previaHash!=='string'||!HASH.test(p.previaHash))falhar('pedido-invalido');
   }else if(p.publicarEm!==undefined||p.fuso!==undefined||p.previaId!==undefined||p.previaHash!==undefined)falhar('pedido-invalido');break;
  }
  default:falhar('pedido-invalido');
 }
 return p as PedidoPublicacaoReal;
}

// Negociação explícita: o cliente atual continua v1 sem depender da migration v2.
function validarPublicacaoRealV2(p:Objeto):PedidoPublicacaoReal{
 const base=['recurso','modo','acao','contractVersion'];
 if(p.acao==='saude')campos(p,base);
 else if(p.acao==='acompanhar'){
  campos(p,[...base,'conteudoId','pecaId']);
  if((p.conteudoId!==undefined)===(p.pecaId!==undefined))falhar('pedido-invalido');
  if(p.conteudoId!==undefined)uuid(p.conteudoId);
  else if(typeof p.pecaId!=='string'||!/^[0-9a-f]{16}$/.test(p.pecaId))falhar('pedido-invalido');
 }else if(p.acao==='editorial'){
  campos(p,[...base,'pedido']);const d=objeto(p.pedido);
  campos(d,['operacao','conteudoId','geracaoEsperada','pecaId','versao','aliases','idempotencia']);
  uuid(d.conteudoId);uuid(d.idempotencia);inteiro(d.geracaoEsperada,0);
  if(!['iniciarRevisao','registrarVersao','registrarAceite'].includes(String(d.operacao))
    ||typeof d.pecaId!=='string'||!/^[0-9a-f]{16}$/.test(d.pecaId)
    ||typeof d.versao!=='string'||!/^[0-9a-f]{40}$/.test(d.versao))falhar('pedido-invalido');
  if(d.aliases!==undefined&&(!Array.isArray(d.aliases)||d.aliases.length>100
    ||d.aliases.some(a=>typeof a!=='string'||!/^[0-9a-f]{16}$/.test(a))))falhar('pedido-invalido');
 }else if(p.acao==='previa'&&p.jobId!==undefined){
  campos(p,[...base,'jobId','destinos']);uuid(p.jobId);
  const {contractVersion:_v,jobId:_j,...d}=p;
  validarPublicacaoReal({...d,snapshotId:p.jobId,snapshotRevisao:1});
 }else{
  const {contractVersion:_v,previaId,previaHash,...d}=p;
  if(p.acao==='reagendar'){
   uuid(previaId);if(typeof previaHash!=='string'||!HASH.test(previaHash))falhar('pedido-invalido');
   validarPublicacaoReal({...d,previaId,previaHash});
  }else validarPublicacaoReal({...d,...(previaId!==undefined?{previaId}:{}),...(previaHash!==undefined?{previaHash}:{})});
 }
 return p as PedidoPublicacaoReal;
}
type SnapshotRow={id:string;admin_id:string;identidade:string;estado:string;revisao:number;dados:Objeto};
function snapshotPublico(s:SnapshotRow){
 const d=s.dados;const midias=(d.midias as Objeto[]).map(({objeto:_privado,...m})=>m);
 const capa=d.capa?Object.fromEntries(Object.entries(objeto(d.capa)).filter(([k])=>k!=='objeto')):null;
 return {snapshotId:s.id,revisao:s.revisao,estado:s.estado,pecaId:d.pecaId,versao:d.versao,manifestoSha256:s.identidade,
   aceiteId:d.aceiteId,aceiteRevisao:d.aceiteRevisao,legenda:d.legenda,legendaSha256:d.legendaSha256,midias,capa,motivos:[],
   ...(d.conteudoId?{conteudoId:d.conteudoId,geracaoEditorial:d.geracaoEditorial}:{})};
}
async function lerSnapshot(cliente:SupabaseClient,id:string,signal:AbortSignal):Promise<SnapshotRow>{
 const r=await consultaComPrazo(s=>cliente.from('admin_marketing_real_snapshots').select('id,admin_id,identidade,estado,revisao,dados').eq('id',uuid(id)).abortSignal(s).maybeSingle(),signal);
 if(r.error)throw new ErroPublicacaoReal('fonte-indisponivel',503);if(!r.data)throw new ErroPublicacaoReal('snapshot-inexistente',404);return r.data as SnapshotRow;
}
export function criarOperacaoPublicacoesReais(_deps:unknown={}):OperacaoAdmin<PedidoPublicacaoReal>{
 return {limiteCorpo:16384,validar:validarPublicacaoReal,
  tratarErro:e=>e instanceof ErroPublicacaoReal&&CODIGOS.has(e.codigo)?{
    status:e.status as 400|403|404|409|413|415|422|503,codigo:e.codigo,mensagem:'Não foi possível concluir esta operação. Confira o estado e a versão antes de tentar novamente.'}:null,
  executar:async(cliente,p,{userId,signal,agora})=>{
    uuid(userId);const v2=p.contractVersion===CONTRATO_REAL_V2;
  if(p.acao==='incidentes'||p.acao==='reconhecer-incidente')return {dados:{contractVersion:v2?CONTRATO_REAL_V2:CONTRATO_REAL,modo:'real',...await rpcReal<Objeto>(cliente,p.acao==='incidentes'?'incidentes':'incidente_reconhecer',p.acao==='incidentes'?{p_admin:userId}:{p_admin:userId,p_incidente:p.incidenteId,p_idempotencia:p.idempotencia},signal)}};
  const politica={...(p.politicaExecucao?{politicaExecucao:p.politicaExecucao}:{}),...(p.capacidadesCliente?{capacidadesCliente:p.capacidadesCliente}:{}),...(p.consentimentoExecucao?{consentimentoExecucao:p.consentimentoExecucao}:{})};
  const base={contractVersion:v2?CONTRATO_REAL_V2:CONTRATO_REAL,modo:'real'};
  if(v2){
   if(p.acao==='editorial')return {dados:{...base,...await rpcReal<Objeto>(cliente,'editorial_v2',{p_admin:userId,p_pedido:p.pedido},signal)}};
   if(p.acao==='saude')return {dados:{...base,...await rpcReal<Objeto>(cliente,'saude_v2',{p_admin:userId},signal)}};
   if(p.acao==='acompanhar')return {dados:{...base,...await rpcReal<Objeto>(cliente,'acompanhar_v2',{p_admin:userId,
    p_filtro:p.conteudoId?{conteudoId:p.conteudoId}:{pecaId:p.pecaId}},signal)}};
   if(p.acao==='previa'){
    const row=await rpcReal<{id:string;hash:string;expira_em:string;snapshot_id:string;destinos:Objeto[]}>(cliente,'previa_v2',
     {p_admin:userId,p_pedido:{...(p.jobId?{jobId:p.jobId,destinos:p.destinos}:{snapshotId:p.snapshotId,snapshotRevisao:p.snapshotRevisao,destinos:p.destinos}),...politica}},signal);
    const snapshot=await lerSnapshot(cliente,row.snapshot_id,signal);
    if(snapshot.admin_id!==userId)falhar('nao-autorizado',403);
    const bloqueios=[...new Set(row.destinos.flatMap(d=>d.motivos as string[]))];
    return {dados:{...base,previaId:row.id,previaHash:row.hash,revisao:1,expiraEm:row.expira_em,
     snapshot:snapshotPublico(snapshot),destinos:row.destinos,podeConfirmar:row.destinos.every(d=>d.estado==='pronto'),bloqueios}};
   }
   if(p.acao==='confirmar'){
    const r=await rpcReal<{loteId:string;replay:boolean}>(cliente,p.capacidadesCliente?'confirmar_politica':'confirmar_v2',{...(p.capacidadesCliente?{p_capacidades:p.capacidadesCliente,p_contrato:CONTRATO_REAL_V2}:{}),p_admin:userId,p_previa:p.previaId,
     p_hash:p.previaHash,p_revisao:p.revisaoEsperada,p_idempotencia:p.idempotencia},signal);
    const lote=await rpcReal<Objeto>(cliente,'consultar_v2',{p_admin:userId,p_filtro:{acao:'consultar',loteId:r.loteId,limite:50}},signal);
    return {dados:{...base,...lote,...r,idempotencia:p.idempotencia}};
   }
   const {recurso:_r,modo:_m,contractVersion:_v,...filtro}=p;
   const consulta=['contas','consultar','listar'].includes(p.acao);
   return {dados:{...base,...await rpcReal<Objeto>(cliente,consulta?'consultar_v2':'comando_v2',
    {p_admin:userId,[consulta?'p_filtro':'p_pedido']:filtro},signal)}};
  }
  if(p.acao==='previa'){
   const row=await rpcReal<{id:string;hash:string;expira_em:string;snapshot_id:string;destinos:unknown[]}>(cliente,'previa',
    {p_admin:userId,p_pedido:{...(p.jobId?{jobId:p.jobId,destinos:p.destinos}:{snapshotId:p.snapshotId,snapshotRevisao:p.snapshotRevisao,destinos:p.destinos}),...politica}},signal);
   const snapshot=await lerSnapshot(cliente,row.snapshot_id,signal);
   if(snapshot.admin_id!==userId)falhar('nao-autorizado',403);
   const estado=await rpcReal<{controles:{habilitado:boolean;recuperacaoPendente:boolean;pausaGlobal:boolean;pausaFacebook:boolean;pausaInstagram:boolean;margemValidaAte:string|null};contas:{contaId:string;pausada:boolean}[]}>(cliente,'consultar',{p_admin:userId,p_filtro:{acao:'contas'}},signal);
   const c=estado.controles;const bloqueios:string[]=[];
   if(!c?.habilitado||c.recuperacaoPendente||!c.margemValidaAte||Date.parse(c.margemValidaAte)<=agora.getTime())bloqueios.push('operacao-bloqueada');
   if(c?.pausaGlobal)bloqueios.push('operacao-pausada');
   for(const d of row.destinos as {contaId:string;rede:string}[]){if((d.rede==='facebook'?c?.pausaFacebook:c?.pausaInstagram)||estado.contas.find(x=>x.contaId===d.contaId)?.pausada)bloqueios.push('operacao-pausada');}
   return {dados:{...base,previaId:row.id,previaHash:row.hash,revisao:1,expiraEm:row.expira_em,snapshot:snapshotPublico(snapshot),destinos:row.destinos,podeConfirmar:bloqueios.length===0,bloqueios:[...new Set(bloqueios)]}};
  }
  if(p.acao==='confirmar'){
   const r=await rpcReal<{loteId:string;replay:boolean}>(cliente,p.capacidadesCliente?'confirmar_politica':'confirmar',{...(p.capacidadesCliente?{p_capacidades:p.capacidadesCliente,p_contrato:CONTRATO_REAL}:{}),p_admin:userId,p_previa:p.previaId,p_hash:p.previaHash,p_revisao:p.revisaoEsperada,p_idempotencia:p.idempotencia},signal);
   const lote=await rpcReal<Objeto>(cliente,'consultar',{p_admin:userId,p_filtro:{acao:'consultar',loteId:r.loteId,limite:50}},signal);
   return {dados:{...base,...lote,...r,idempotencia:p.idempotencia}};
  }
  const {recurso:_r,modo:_m,...filtro}=p;
  const r=await rpcReal<Objeto>(cliente,['contas','consultar','listar'].includes(p.acao)?'consultar':'comando',
    {p_admin:userId,[['contas','consultar','listar'].includes(p.acao)?'p_filtro':'p_pedido']:filtro},signal);
  return {dados:{...base,...r}};
 }};
}

function mime(bytes:Uint8Array){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&new TextDecoder().decode(bytes.subarray(4,8))==='ftyp')return 'video/mp4';
 return falhar('midia-invalida',415);
}
async function hash(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),x=>x.toString(16).padStart(2,'0')).join('');}
export function validarSnapshotReal(v:unknown):Objeto{
 const d=objeto(v);campos(d,['pecaId','versao','aceiteId','aceiteRevisao','legenda','legendaSha256','midias','capa','titulo','conteudoId','geracaoEditorial']);
 if(d.conteudoId!==undefined||d.geracaoEditorial!==undefined){uuid(d.conteudoId);inteiro(d.geracaoEditorial);}
 if(typeof d.pecaId!=='string'||!/^[0-9a-f]{16}$/.test(d.pecaId)||typeof d.versao!=='string'||!/^[0-9a-f]{40}$/.test(d.versao)
  ||typeof d.aceiteId!=='string'||d.aceiteId.length<1||d.aceiteId.length>200||typeof d.legenda!=='string'||!d.legenda.trim()
  ||new TextEncoder().encode(d.legenda).length>64000||typeof d.legendaSha256!=='string'||!HASH.test(d.legendaSha256))falhar('snapshot-invalido');
 inteiro(d.aceiteRevisao);if(d.titulo!==undefined&&(typeof d.titulo!=='string'||d.titulo.length>200))falhar('snapshot-invalido');
 if(!Array.isArray(d.midias)||d.midias.length<1||d.midias.length>10)falhar('midia-invalida');let total=0;
 const validarMidia=(v:unknown,capa=false)=>{const m=objeto(v);campos(m,['ordem','sha256','tipo','mime','bytes','largura','altura','duracaoSeg']);
  if(typeof m.sha256!=='string'||!HASH.test(m.sha256)||!['image/jpeg','image/png',...(capa?[]:['video/mp4'])].includes(String(m.mime)))falhar('midia-invalida');
  total+=inteiro(m.bytes,1,MAX_ARQUIVO);if(total>MAX_TOTAL)falhar('midia-grande',413);
  if(!capa&&(m.tipo!==(m.mime==='video/mp4'?'video':'imagem')))falhar('midia-invalida');
  for(const k of ['largura','altura','duracaoSeg'])if(m[k]!==undefined&&m[k]!==null&&(typeof m[k]!=='number'||!Number.isFinite(m[k])||Number(m[k])<=0))falhar('midia-invalida');
 };
 (d.midias as unknown[]).forEach((m,i)=>{validarMidia(m);if(objeto(m).ordem!==i)falhar('midia-invalida');});if(d.capa!==null&&d.capa!==undefined)validarMidia(d.capa,true);return d;
}
// Interface EXCLUSIVA de backend: nao expor estes metodos como JSON do browser.
// O chamador autorizado resolve aceite do catalogo e passa bytes; nao ha URL livre.
const BUCKET='marketing-remoto';
const PRAZO_ENVIO_MS=30_000;
export function criarImportadorSnapshotReal(deps:{rede?:typeof fetch}={}){
 const rede=deps.rede??fetch;
 async function iniciar(cliente:SupabaseClient,pedido:unknown,ctx:Contexto){
  const d=validarSnapshotReal(pedido);if(await hash(new TextEncoder().encode(String(d.legenda)))!==d.legendaSha256)falhar('midia-divergente',409);
  const r=await rpcReal<SnapshotRow>(cliente,d.conteudoId?'snapshot_iniciar_v2':'snapshot_iniciar',{p_admin:uuid(ctx.userId),p_pedido:d},ctx.signal);
  if(r.admin_id!==ctx.userId)falhar('nao-autorizado',403);
  return {snapshotId:r.id,revisao:r.revisao,estado:r.estado,uploads:(r.dados.midias as Objeto[]).map((_,i)=>({indice:String(i),uploadRef:r.id+':'+i})),capa:r.dados.capa?{indice:'capa',uploadRef:r.id+':capa'}:null};
 }
 async function enviar(cliente:SupabaseClient,p:{snapshotId:string;indice:string;bytes:Uint8Array},ctx:Contexto){
  const r=await lerSnapshot(cliente,p.snapshotId,ctx.signal);if(r.admin_id!==ctx.userId||r.estado!=='recebendo')falhar('estado-incompativel',409);
  const m=p.indice==='capa'?r.dados.capa:(r.dados.midias as Objeto[])[Number(p.indice)];
  if(!m||!(/^\d$/.test(p.indice)||p.indice==='capa'))falhar('midia-invalida');const meta=objeto(m);
  if(p.bytes.byteLength!==meta.bytes||mime(p.bytes)!==meta.mime||await hash(p.bytes)!==meta.sha256)falhar('midia-divergente',409);
  /* `storage.upload` nao recebe AbortSignal (storage-js 2.112.3): o prazo so
     encerrava a espera e deixava o envio correndo (revisao do Watchtower,
     17/10/2026). O envio vai por URL assinada de upload e `fetch` com o sinal
     da etapa, que aborta o transporte de verdade. upsert continua falso. */
  const alvo=await consultaComPrazo(()=>cliente.storage.from(BUCKET).createSignedUploadUrl(String(meta.objeto),{upsert:false}),ctx.signal);
  let status=0;
  if(!alvo.error&&alvo.data?.signedUrl){
   const u=new URL(alvo.data.signedUrl);
   if(u.protocol!=='https:'||!u.pathname.includes('/storage/v1/object/upload/sign/'+BUCKET+'/'))throw new ErroPublicacaoReal('upload-indisponivel',503);
   status=await consultaComPrazo(async s=>{
    const r=await rede(u,{method:'PUT',signal:s,redirect:'error',headers:{'content-type':String(meta.mime),'x-upsert':'false'},body:p.bytes as BodyInit});
    await r.body?.cancel().catch(()=>{});return r.status;
   },ctx.signal,PRAZO_ENVIO_MS);
  }
  // Repetir upload interrompido nao pode sobrescrever: o objeto ja existente
  // so vale se tiver o mesmo hash. Finalizar relera o objeto de qualquer jeito.
  if(status<200||status>299){const existente=await baixar(cliente,meta,ctx.signal).catch(()=>null);
   if(!existente||await hash(existente)!==meta.sha256)throw new ErroPublicacaoReal('upload-indisponivel',503);}
  return {snapshotId:r.id,indice:p.indice,recebido:true};
 }
 async function finalizar(cliente:SupabaseClient,p:{snapshotId:string;revisaoEsperada:number},ctx:Contexto){
  const r=await lerSnapshot(cliente,p.snapshotId,ctx.signal);if(r.admin_id!==ctx.userId)falhar('nao-autorizado',403);
  if(r.estado==='pronto')return snapshotPublico(r);
  if(r.estado!=='recebendo'||r.revisao!==p.revisaoEsperada)falhar('revisao-divergente',409);
  const midias=r.dados.midias as Objeto[];for(const m of [...midias,...(r.dados.capa?[objeto(r.dados.capa)]:[])])await baixar(cliente,m,ctx.signal);
  const pronto=await rpcReal<SnapshotRow>(cliente,'snapshot_finalizar',{p_admin:ctx.userId,p_snapshot:r.id,p_revisao:r.revisao,
    p_verificacao:{identidade:r.identidade,midias,capa:r.dados.capa??null}},ctx.signal);return snapshotPublico(pronto);
 }
 async function midia(cliente:SupabaseClient,p:{snapshotId:string;indice:string},ctx:Contexto){
  /* Snapshot e previa pertencem ao ator que os importou (contrato e5.real.v1,
     sec. 4). UUID opaco nao e autorizacao: outro admin e recusado ANTES de
     qualquer leitura do Storage. */
  const r=await lerSnapshot(cliente,p.snapshotId,ctx.signal);if(r.admin_id!==ctx.userId)falhar('nao-autorizado',403);
  if(r.estado!=='pronto')falhar('snapshot-indisponivel',409);
  const meta=p.indice==='capa'?r.dados.capa:/^\d$/.test(p.indice)?(r.dados.midias as Objeto[])[Number(p.indice)]:null;
  if(!meta)falhar('midia-inexistente',404);const m=objeto(meta);return {bytes:await baixar(cliente,m,ctx.signal),mime:String(m.mime)};
 }
 return {iniciar,enviar,finalizar,midia};
}
// O sinal da etapa vai ao transporte: cabecalho e corpo do download ficam sob ele.
async function baixar(cliente:SupabaseClient,m:Objeto,signal:AbortSignal):Promise<Uint8Array>{
 return await consultaComPrazo(async s=>{
  const r=await cliente.storage.from(BUCKET).download(String(m.objeto),{},{signal:s});
  if(r.error||!r.data||r.data.size!==m.bytes||r.data.size>MAX_ARQUIVO)throw new ErroPublicacaoReal('midia-indisponivel',503);
  const bytes=new Uint8Array(await r.data.arrayBuffer());
  if(mime(bytes)!==m.mime||await hash(bytes)!==m.sha256)throw new ErroPublicacaoReal('midia-divergente',409);return bytes;
 },signal);
}
