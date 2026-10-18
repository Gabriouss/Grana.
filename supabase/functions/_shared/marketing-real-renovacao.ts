// Renovacao automatica da capacidade: SO GET na Graph, token no cabecalho,
// nunca na URL. Classifica cada conta; quem grava e decide e o banco
// (`admin_marketing_real_renovacao_registrar`).
// Leitura que nao chegou a uma resposta conclusiva vira "inconclusivo": nao
// renova nem revoga (regra 9). So o erro 190 da Graph prova token ruim.
import { jsonLimitado } from './marketing-real-graph.ts';
export type ContaRenovacao={contaId:string;rede:'facebook'|'instagram';remotoId:string;credencialRef:string};
export type ResultadoRenovacao={contaId:string;
 resultado:'ok'|'permissao-ausente'|'expirada'|'revogada'|'indisponivel'|'inconclusivo';motivo?:string;formatos?:Record<string,string>};
// FB Stories fica fora: sem contrato oficial de leitura de volta (Compass, 18/10).
export const PERMISSOES={instagram:{permissao:'instagram_content_publish',formatos:['feed','carrossel','reels','stories']},
 facebook:{permissao:'pages_manage_posts',formatos:['feed','carrossel','reels']}} as const;
type Leitura={ok:true;d:Record<string,unknown>}|{ok:false;tipo:'token';sub:number|null}|{ok:false;tipo:'negado'|'nao-aplicavel'|'inconclusivo'};
type Deps={rede:typeof fetch;versao:string;env:(n:string)=>string|undefined;signal:AbortSignal;prazoLeitura?:number};
// 463 = token expirado; o resto do 190 (senha trocada, app removido, sessao encerrada) e revogacao.
const EXPIRADO=new Set([463]);

export function criarRenovacao(deps:Deps){
 if(!/^v\d+\.\d+$/.test(deps.versao))throw new Error('configuracao-invalida');
 const prazo=deps.prazoLeitura??3_000;
 async function ler(token:string,caminho:string,campos:Record<string,string>):Promise<Leitura>{
  if(!/^(?:me|me\/permissions|me\/accounts|[0-9]{1,40})$/.test(caminho))throw new Error('destino-invalido');
  const url=new URL(`https://graph.facebook.com/${deps.versao}/${caminho}`);url.search=new URLSearchParams(campos).toString();
  try{
   const r=await deps.rede(url,{method:'GET',redirect:'error',signal:AbortSignal.any([deps.signal,AbortSignal.timeout(prazo)]),
    headers:{Authorization:'Bearer '+token}});
   const d=await jsonLimitado(r);
   if(r.ok&&!d.error)return {ok:true,d};
   if(r.status>=500)return {ok:false,tipo:'inconclusivo'};
   const e=d.error as {code?:unknown;error_subcode?:unknown}|undefined,code=typeof e?.code==='number'?e.code:-1;
   if(code===190)return {ok:false,tipo:'token',sub:typeof e?.error_subcode==='number'?e.error_subcode:null};
   if(code===100)return {ok:false,tipo:'nao-aplicavel'};
   if(code===10||(code>=200&&code<300))return {ok:false,tipo:'negado'};
   // Limite de chamadas, servico ou codigo desconhecido: nada provado, espera.
   return {ok:false,tipo:'inconclusivo'};
  }catch{return {ok:false,tipo:'inconclusivo'};}
 }
 const porToken=(l:Leitura&{ok:false;tipo:'token'}):ResultadoRenovacao['resultado']=>l.sub!==null&&EXPIRADO.has(l.sub)?'expirada':'revogada';
 const concedidas=(d:Record<string,unknown>)=>Array.isArray(d.data)?new Set((d.data as {permission?:unknown;status?:unknown}[])
  .filter(p=>p.status==='granted'&&typeof p.permission==='string').map(p=>p.permission as string)):null;

 return async function renovar(contas:ContaRenovacao[]):Promise<ResultadoRenovacao[]>{
  const tokens=new Map<string,string>(),permissoes=new Map<string,Promise<Leitura>>(),paginas=new Map<string,Promise<Leitura>>();
  for(const c of contas){const t=/^MARKETING_[A-Z0-9_]{1,80}$/.test(c.credencialRef)?deps.env(c.credencialRef):undefined;if(t)tokens.set(c.credencialRef,t);}
  // Uma leitura por token, mesmo que duas contas usem o mesmo.
  const perms=(ref:string)=>{if(!permissoes.has(ref))permissoes.set(ref,ler(tokens.get(ref)!,'me/permissions',{limit:'200'}));return permissoes.get(ref)!;};
  const contasDoUsuario=(ref:string)=>{if(!paginas.has(ref))paginas.set(ref,ler(tokens.get(ref)!,'me/accounts',{fields:'id,tasks',limit:'100'}));return paginas.get(ref)!;};

  // Token de Pagina nao tem /me/permissions (code 100). A permissao e a do usuario
  // que gerou o token: vale a de um token de usuario desta rodada que lista a
  // pagina com a tarefa de publicar.
  async function permissaoPelaPagina(c:ContaRenovacao,permissao:string):Promise<boolean|'inconclusivo'|null>{
   let algumInconclusivo=false;
   for(const ref of tokens.keys()){if(ref===c.credencialRef)continue;
    const [p,a]=await Promise.all([perms(ref),contasDoUsuario(ref)]);
    if(!p.ok||!a.ok){if(p.ok===false&&p.tipo==='inconclusivo'||a.ok===false&&a.tipo==='inconclusivo')algumInconclusivo=true;continue;}
    const lista=concedidas(p.d),pagina=Array.isArray(a.d.data)?(a.d.data as {id?:unknown;tasks?:unknown}[]).find(x=>x.id===c.remotoId):undefined;
    if(!lista||!pagina)continue;
    return lista.has(permissao)&&Array.isArray(pagina.tasks)&&pagina.tasks.includes('CREATE_CONTENT');
   }
   return algumInconclusivo?'inconclusivo':null;
  }

  async function uma(c:ContaRenovacao):Promise<ResultadoRenovacao>{
   const base={contaId:c.contaId};
   const token=tokens.get(c.credencialRef);if(!token)return {...base,resultado:'indisponivel',motivo:'credencial-ausente'};
   if(!/^[0-9]{1,40}$/.test(c.remotoId))return {...base,resultado:'indisponivel',motivo:'conta-invalida'};
   // IG: o no da conta precisa abrir. FB: o token precisa SER o da pagina (publicar exige token de pagina).
   const no=await ler(token,c.rede==='facebook'?'me':c.remotoId,{fields:'id'});
   if(!no.ok){
    if(no.tipo==='token')return {...base,resultado:porToken(no),motivo:'token:'+(no.sub??'190')};
    if(no.tipo==='inconclusivo')return {...base,resultado:'inconclusivo',motivo:'graph-indisponivel'};
    return {...base,resultado:'indisponivel',motivo:'conta-inacessivel'};
   }
   if(no.d.id!==c.remotoId)return {...base,resultado:'indisponivel',motivo:c.rede==='facebook'?'token-nao-e-da-pagina':'conta-inacessivel'};
   const {permissao,formatos}=PERMISSOES[c.rede];
   const p=await perms(c.credencialRef);let tem:boolean;
   if(p.ok){const lista=concedidas(p.d);if(!lista)return {...base,resultado:'inconclusivo',motivo:'permissoes-ilegiveis'};tem=lista.has(permissao);}
   else if(p.tipo==='token')return {...base,resultado:porToken(p),motivo:'token:'+(p.sub??'190')};
   else if(p.tipo==='nao-aplicavel'&&c.rede==='facebook'){
    const r=await permissaoPelaPagina(c,permissao);
    if(r===null)return {...base,resultado:'inconclusivo',motivo:'permissao-nao-legivel'};
    if(r==='inconclusivo')return {...base,resultado:'inconclusivo',motivo:'graph-indisponivel'};
    tem=r;
   }else return {...base,resultado:'inconclusivo',motivo:p.tipo==='negado'?'permissoes-negadas':'graph-indisponivel'};
   const marca=tem?'ok':'ausente:'+permissao;
   return {...base,resultado:tem?'ok':'permissao-ausente',...(tem?{}:{motivo:'permissao-ausente'}),
    formatos:Object.fromEntries(formatos.map(f=>[f,marca]))};
  }
  // Excecao inesperada numa conta nao derruba as outras nem vira sucesso.
  return Promise.all(contas.map(c=>uma(c).catch(()=>({contaId:c.contaId,resultado:'inconclusivo' as const,motivo:'erro-interno'}))));
 };
}
