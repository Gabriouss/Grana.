// Adaptador sem credencial global: conta e token sao resolvidos pelo worker.
// Um passo por lease/intento. Nunca repetir POST depois de resultado incerto.
// Protocolo IG: colecao oficial Meta/Postman, Instagram Content Publishing.
// Protocolo FB Reels: colecao oficial Meta/Postman, Facebook API, Publish Reel.
export type EtapaGraph='preparar'|'consultar-preparo'|'publicar'|'verificar-publicacao'|'cancelar'|'reconciliar';
export type MidiaGraph={objeto:string;sha256:string;mime:string;bytes:number;tipo:'imagem'|'video'};
export type JobGraph={jobId:string;rede:'facebook'|'instagram';formato:'feed'|'carrossel'|'reels'|'stories';
 etapa:EtapaGraph;remotoContaId:string;processamento:EstadoGraph;remotoId?:string|null;
 publicarEm?:string;executarAte?:string;politicaExecucao?:string};
export type EstadoGraph={itens?:string[];container?:string;video?:string;uploadUrl?:string;transferido?:boolean;publicacaoId?:string;permalink?:string|null};
// Link relativo (o permalink_url de video de Page pode vir assim) ou de outro host nao e montado: fica nulo.
const HOSTS_LINK={instagram:new Set(['www.instagram.com','instagram.com']),facebook:new Set(['www.facebook.com','facebook.com','m.facebook.com','web.facebook.com'])};
export function linkOficial(v:unknown,rede:'facebook'|'instagram'):string|null{
 if(typeof v!=='string'||v.length>500)return null;
 try{const u=new URL(v);return u.protocol==='https:'&&HOSTS_LINK[rede].has(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}
}
export type ResultadoGraph={estado:'adiado'|'preparo-parcial'|'pronto'|'processando'|'publicacao-aceita'|'publicado'|'cancelado'|'falhou'|'incerto';
 processamento?:EstadoGraph;remotoId?:string;codigo?:string;retryAfterSegundos?:number};
type Deps={rede:typeof fetch;versao:string;token:string;assinar:(midia:MidiaGraph)=>Promise<string>;signal:AbortSignal};
const ID=/^[0-9]+(?:_[0-9]+)?$/;
function id(v:unknown):string{if(typeof v!=='string'||!ID.test(v))throw new Error('resposta-invalida');return v;}
class FalhaGraph extends Error{constructor(public codigo:string,public incerto:boolean,public retryAfterSegundos?:number){super(codigo);}}
// GET que nao chegou a resposta (rede, prazo, corpo): sem efeito, a etapa so espera.
class ConsultaIndisponivel extends Error{constructor(public retryAfterSegundos=60){super('consulta-indisponivel');}}
// O corpo inteiro, inclusive leitura do stream, esta sob o signal do worker.
export async function jsonLimitado(r:Response):Promise<Record<string,unknown>>{
 const reader=r.body?.getReader();if(!reader)throw new Error('corpo-ausente');const partes:Uint8Array[]=[];let tamanho=0;
 try{for(;;){const x=await reader.read();if(x.done)break;tamanho+=x.value.length;if(tamanho>262144)throw new Error('corpo-grande');partes.push(x.value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(tamanho);let offset=0;for(const p of partes){bytes.set(p,offset);offset+=p.length;}
 const d=JSON.parse(new TextDecoder().decode(bytes));if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('json-invalido');return d;
}
export function criarAdaptadorGraphReal(deps:Deps){
 if(!/^v\d+\.\d+$/.test(deps.versao)||!deps.token)throw new Error('configuracao-invalida');
 async function graph(path:string,metodo:'GET'|'POST',params:Record<string,string>={}):Promise<Record<string,unknown>>{
  if(!/^[0-9]+(?:_[0-9]+)?(?:\/(?:media|media_publish|photos|feed|video_reels|photo_stories|video_stories|stories))?$/.test(path))throw new Error('destino-invalido');
  const url=new URL(`https://graph.facebook.com/${deps.versao}/${path}`),body=new URLSearchParams(params);
  if(metodo==='GET')url.search=body.toString();let r:Response;
  try{r=await deps.rede(url,{method:metodo,redirect:'error',signal:deps.signal,
   headers:{Authorization:'Bearer '+deps.token,...(metodo==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
   ...(metodo==='POST'?{body:body.toString()}:{})});const d=await jsonLimitado(r);
   if(!r.ok||d.error){const error=d.error as {code?:number}|undefined;
    // Erro HTTP nao prova ausencia de efeito num POST (inclui 5xx/erro proxy).
    const after=r.headers.get('Retry-After');const bruto=after&&/^\d+$/.test(after)?Number(after):after?(Date.parse(after)-Date.now())/1000:60;
    const retry=Number.isFinite(bruto)?Math.min(3600,Math.max(60,Math.ceil(bruto))):60;
    if(metodo==='GET'&&(r.status===429||r.status>=500||[4,17,32,613].includes(error?.code??0)))throw new ConsultaIndisponivel(retry);
    throw new FalhaGraph(error?.code===190?'conexao-revogada':'meta-recusou',metodo==='POST',retry);}return d;
  }catch(e){if(e instanceof FalhaGraph||e instanceof ConsultaIndisponivel)throw e;if(metodo==='GET')throw new ConsultaIndisponivel();throw new FalhaGraph('resultado-nao-confirmado',true);}
 }
 async function transferir(url:string,midia:MidiaGraph){
  const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='rupload.facebook.com'||u.username||u.password||u.port||u.search||u.hash||!/^\/video-upload\/(?:v\d+\.\d+\/)?\d+$/.test(u.pathname))throw new Error('upload-host-recusado');
  const file=await deps.assinar(midia);const r=await deps.rede(u,{method:'POST',redirect:'error',signal:deps.signal,
   headers:{Authorization:'OAuth '+deps.token,file_url:file}});const d=await jsonLimitado(r);if(!r.ok||d.success!==true)throw new FalhaGraph('transferencia-incerta',true);
 }
 async function executar(job:JobGraph,snapshot:{legenda:string;midias:MidiaGraph[];capa?:MidiaGraph|null}):Promise<ResultadoGraph>{
  let estado:EstadoGraph={...job.processamento,itens:[...(job.processamento.itens??[])]};
  const itens=estado.itens!;const midias=snapshot.midias;id(job.remotoContaId);
  if(!midias.length||midias.length>10||itens.some(x=>!ID.test(x)))return {estado:'falhou',codigo:'midia-invalida'};
  try{
   // Uma consulta inconclusiva nunca vira POST. Sem id recuperavel, escalar.
   if(job.etapa==='cancelar')return {estado:'incerto',codigo:'cancelamento-requer-conferencia'};
   if(job.etapa==='reconciliar'&&!estado.publicacaoId&&!job.remotoId)return {estado:'incerto',codigo:'publicacao-sem-id-recuperavel'};
   if(job.etapa==='verificar-publicacao'||job.etapa==='reconciliar'){
    const post=id(estado.publicacaoId??job.remotoId);
    // O link vem na MESMA leitura de volta; sem link absoluto da propria rede, fica nulo.
    const publicado=(link:unknown):ResultadoGraph=>({estado:'publicado',remotoId:post,processamento:{...estado,permalink:linkOficial(link,job.rede)}});
    if(job.rede==='instagram'){
     // media_product_type separa Story, Reel e Feed (IG Content Publishing, "Story posts").
     const d=await graph(post,'GET',{fields:'id,media_product_type,permalink'});
     if(d.id===post&&d.media_product_type===(job.formato==='reels'?'REELS':job.formato==='stories'?'STORY':'FEED'))return publicado(d.permalink);
    }else if(job.formato==='stories'){
     // Story de Page: a prova e o post_id na lista oficial /stories (Page Stories API, "Get stories").
     // Vencido em 24 h, aparece como ARCHIVED, que tambem prova que saiu.
     const d=await graph(job.remotoContaId+'/stories','GET');
     const s=Array.isArray(d.data)?(d.data as {post_id?:unknown;status?:unknown;url?:unknown}[])
      .find(x=>String(x?.post_id)===post&&(x.status==='PUBLISHED'||x.status==='ARCHIVED')):undefined;
     if(s)return publicado(s.url);
     // Video ainda processando pode demorar a entrar na lista: consulta sem efeito, repete.
     if(job.etapa==='verificar-publicacao')return {estado:'adiado',codigo:'story-ainda-nao-listado',processamento:estado};
    }else if(job.formato==='reels'){
     // Reel de Page: o ID e o do video. success:true do finish nao prova nada;
     // so a fase de publicacao concluida e publicada (FB Reels Publishing, status).
     const d=await graph(post,'GET',{fields:'status,permalink_url'});
     const fase=(d.status as {publishing_phase?:{status?:string;publish_status?:string}}|undefined)?.publishing_phase;
     if((fase?.status==='complete'||fase?.status==='completed')&&fase.publish_status==='published')return publicado(d.permalink_url);
    }else{
     const d=await graph(post,'GET',{fields:'id,is_published,permalink_url'});if(d.id===post&&d.is_published===true)return publicado(d.permalink_url);
    }
    return {estado:'incerto',codigo:'publicacao-sem-readback'};
   }
   if(job.rede==='instagram'){
    if(job.etapa==='preparar'){
     if(job.formato==='carrossel'&&midias.length<2)return {estado:'falhou',codigo:'carrossel-invalido'};
     if(job.formato!=='carrossel'&&midias.length!==1)return {estado:'falhou',codigo:'formato-invalido'};
     if(job.formato==='feed'&&midias[0].tipo!=='imagem')return {estado:'falhou',codigo:'feed-video-nao-validado'};
     // "JPEG is the only image format supported" (IG Content Publishing).
     if(midias.some(m=>m.tipo==='imagem'&&m.mime!=='image/jpeg')||(job.formato==='reels'&&snapshot.capa&&snapshot.capa.mime!=='image/jpeg'))
      return {estado:'falhou',codigo:'midia-incompativel'};
     if(itens.length<midias.length){const m=midias[itens.length];const params:Record<string,string>={};
      params[m.tipo==='video'?'video_url':'image_url']=await deps.assinar(m);
      if(job.formato==='carrossel'){params.is_carousel_item='true';if(m.tipo==='video')params.media_type='VIDEO';}
      else{// Container de Story nao tem caption na sintaxe oficial (IG User Media, Story Containers).
       if(job.formato!=='stories')params.caption=snapshot.legenda;if(job.formato==='reels')params.media_type='REELS';if(job.formato==='stories')params.media_type='STORIES';
       if(job.formato==='reels'&&snapshot.capa)params.cover_url=await deps.assinar(snapshot.capa);}
      const d=await graph(job.remotoContaId+'/media','POST',params);itens.push(id(d.id));
      if(job.formato!=='carrossel')estado.container=itens[0];
      return {estado:'processando',processamento:estado};
     }
     if(job.formato==='carrossel'&&!estado.container){const d=await graph(job.remotoContaId+'/media','POST',{
       media_type:'CAROUSEL',children:itens.join(','),caption:snapshot.legenda});estado.container=id(d.id);return {estado:'processando',processamento:estado};}
     return {estado:'pronto',processamento:estado};
    }
    if(job.etapa==='consultar-preparo'){
     const alvo=id(estado.container??itens.at(-1));const d=await graph(alvo,'GET',{fields:'status_code'});
     if(d.status_code==='FINISHED')return {estado:estado.container?'pronto':'preparo-parcial',processamento:estado};
     if(d.status_code==='IN_PROGRESS')return {estado:'processando',processamento:estado};
     return {estado:'incerto',codigo:'container-nao-confirmado'};
    }
    const d=await graph(job.remotoContaId+'/media_publish','POST',{creation_id:id(estado.container)});
    estado.publicacaoId=id(d.id);return {estado:'publicacao-aceita',remotoId:estado.publicacaoId,processamento:estado};
   }
   const video=midias[0].tipo==='video';
   if(job.etapa==='preparar'){
    // Story de Page: foto via /photos published=false + photo_stories; video via video_stories (Page Stories API).
    if(job.formato==='stories'&&midias.length!==1)return {estado:'falhou',codigo:'formato-invalido'};
    // Meta SDK oficial: Page.create_feed aceita attached_media list<Object>, nao um par.
    // 2..10 e o limite INTERNO do snapshot; nao representa um teto declarado pela Meta.
    // https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py
    if(job.formato==='carrossel'&&(midias.length<2||midias.some(x=>x.tipo!=='imagem')))return {estado:'falhou',codigo:'carrossel-invalido'};
    if(job.formato==='feed'&&(video||midias.length!==1))return {estado:'falhou',codigo:'feed-video-nao-validado'};
    if(job.formato==='reels'||(job.formato==='stories'&&video)){
     if(midias.length!==1||!video)return {estado:'falhou',codigo:'formato-invalido'};
     const edge=job.formato==='reels'?'video_reels':'video_stories';
     if(!estado.video){const d=await graph(job.remotoContaId+'/'+edge,'POST',{upload_phase:'start'});
      estado.video=id(d.video_id);if(typeof d.upload_url!=='string')throw new Error('upload-ausente');
      const u=new URL(d.upload_url);if(u.hostname!=='rupload.facebook.com')throw new Error('upload-host-recusado');estado.uploadUrl=d.upload_url;
      return {estado:'preparo-parcial',processamento:estado};}
     if(!estado.transferido){if(!estado.uploadUrl)throw new Error('upload-ausente');await transferir(estado.uploadUrl,midias[0]);
      // Story: a API oficial publica (finish) logo depois do upload; o status e conferido na leitura.
      estado={...estado,transferido:true};}
     return {estado:job.formato==='stories'?'pronto':'processando',processamento:estado};
    }
    if(itens.length<midias.length){const d=await graph(job.remotoContaId+'/photos','POST',{url:await deps.assinar(midias[itens.length]),published:'false'});
     itens.push(id(d.id));return {estado:itens.length===midias.length?'pronto':'preparo-parcial',processamento:estado};}
    return {estado:'pronto',processamento:estado};
   }
   if(job.etapa==='consultar-preparo'){
    const d=await graph(id(estado.video),'GET',{fields:'status'});const status=d.status as {video_status?:string}|undefined;
    return status?.video_status==='ready'?{estado:'pronto',processamento:estado}:{estado:'processando',processamento:estado};
   }
   let post:string;
   if(job.formato==='stories'){
    const d=video?await graph(job.remotoContaId+'/video_stories','POST',{video_id:id(estado.video),upload_phase:'finish'})
     :await graph(job.remotoContaId+'/photo_stories','POST',{photo_id:id(itens[0])});
    // post_id numerico so se for inteiro seguro; acima disso o JSON ja perdeu digitos.
    if(d.success!==true)throw new Error('publicacao-nao-confirmada');post=id(Number.isSafeInteger(d.post_id)?String(d.post_id):d.post_id);
   }else if(job.formato==='reels'){
    const d=await graph(job.remotoContaId+'/video_reels','POST',{video_id:id(estado.video),upload_phase:'finish',video_state:'PUBLISHED',description:snapshot.legenda});
    if(d.success!==true)throw new Error('publicacao-nao-confirmada');post=id(estado.video);
   }else{
    const d=await graph(job.remotoContaId+'/feed','POST',{message:snapshot.legenda,attached_media:JSON.stringify(itens.map(media_fbid=>({media_fbid})))});post=id(d.id);
   }
   estado.publicacaoId=post;return {estado:'publicacao-aceita',remotoId:post,processamento:estado};
  }catch(e){
   if(e instanceof ConsultaIndisponivel)return {estado:'adiado',codigo:'consulta-indisponivel',processamento:estado,retryAfterSegundos:e.retryAfterSegundos};
   /* Depois do POST de publicar, recusa da Meta numa CONSULTA nao prova que o
      post nao saiu: "falhou" ali convidaria a republicar. Fica para conferir. */
   const depoisDePublicar=job.etapa==='verificar-publicacao'||job.etapa==='reconciliar';
   return {estado:e instanceof FalhaGraph&&!e.incerto&&!depoisDePublicar?'falhou':'incerto',codigo:e instanceof FalhaGraph?e.codigo:'resultado-nao-confirmado',processamento:estado,
    ...(e instanceof FalhaGraph&&e.retryAfterSegundos?{retryAfterSegundos:e.retryAfterSegundos}:{})};
  }
 }
 return {executar};
}
