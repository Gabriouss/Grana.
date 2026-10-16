import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import type { OperacaoAdmin } from './admin-autorizacao.ts';
import { consultaComPrazo } from './admin-agregados.ts';
import { previaSimulada, confirmarSimulacao, executarSimulacao, criarAdaptadorSimulado,
  type AcaoAdaptador, type Alvo, type Cenario, type Job, type Peca, type Rede, type StoreSimulacao } from './marketing-simulacao.ts';

export type PedidoSimulacao = {
  recurso:'publicacoes-simulacao'; modo:'simulacao';
  acao:'previa'|'confirmar'|'consultar'|'listar'|'executar'|'cancelar'|'reconciliar'|'pausar'|'retomar';
  alvo?:Alvo; chave?:string; confirmado?:boolean; rede?:'global'|Rede; cenario?:Cenario;
};
const HASH=/^[0-9a-f]{64}$/;
const ACOES=['previa','confirmar','consultar','listar','executar','cancelar','reconciliar','pausar','retomar'];
const CENARIOS=['sucesso','falha','incerto','processando','pronto','horario-divergente','nao-encontrado','interromper'];
export function validarSimulacao(v: unknown): PedidoSimulacao {
  const p=v as Record<string,unknown>|null;
  if (!p || typeof p!=='object' || Array.isArray(p) || p.recurso!=='publicacoes-simulacao'
    || p.modo!=='simulacao' || !ACOES.includes(p.acao as string)) throw new Error('pedido-invalido');
  const permitidos=['recurso','modo','acao'];
  if (p.acao==='previa'||p.acao==='confirmar') permitidos.push('alvo');
  if (p.acao!=='previa' && !['pausar','retomar','listar'].includes(p.acao as string)) permitidos.push('chave');
  if (p.acao==='confirmar'||p.acao==='retomar') permitidos.push('confirmado');
  if (['pausar','retomar'].includes(p.acao as string)) permitidos.push('rede');
  if (['executar','cancelar','reconciliar'].includes(p.acao as string)) permitidos.push('cenario');
  if (Object.keys(p).some(k=>!permitidos.includes(k))) throw new Error('pedido-invalido');
  if (permitidos.includes('chave') && (typeof p.chave!=='string'||!HASH.test(p.chave))) throw new Error('pedido-invalido');
  if (permitidos.includes('confirmado') && p.confirmado!==true) throw new Error('pedido-invalido');
  if (permitidos.includes('rede') && !['global','facebook','instagram'].includes(p.rede as string)) throw new Error('pedido-invalido');
  if (p.cenario!==undefined && !CENARIOS.includes(p.cenario as string)) throw new Error('pedido-invalido');
  let alvo:Alvo|undefined;
  if (permitidos.includes('alvo')) {
    const a=p.alvo as Record<string,unknown>|null;
    if (!a || typeof a!=='object' || Array.isArray(a) || Object.keys(a).length!==6
      || Object.keys(a).some(k=>!['pecaId','rede','conta','formato','horario','estrategia'].includes(k))
      || typeof a.pecaId!=='string'||!/^[0-9a-f]{16}$/.test(a.pecaId)
      || !['facebook','instagram'].includes(a.rede as string)||typeof a.conta!=='string'||!/^\d{1,40}$/.test(a.conta)
      || !['feed','reels','stories'].includes(a.formato as string)||!['nativo-meta','executor-remoto'].includes(a.estrategia as string)
      || typeof a.horario!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(a.horario)
      || !Number.isFinite(Date.parse(a.horario))) throw new Error('pedido-invalido');
    alvo={pecaId:a.pecaId,rede:a.rede as Rede,conta:a.conta,formato:a.formato as Alvo['formato'],
      horario:new Date(a.horario).toISOString(),estrategia:a.estrategia as Alvo['estrategia']};
  }
  return {recurso:'publicacoes-simulacao',modo:'simulacao',acao:p.acao as PedidoSimulacao['acao'],
    ...(alvo?{alvo}:{}),...(p.chave?{chave:p.chave as string}:{}),...(p.rede?{rede:p.rede as 'global'|Rede}:{}),
    ...(p.cenario?{cenario:p.cenario as Cenario}:{}),...(p.confirmado?{confirmado:true}:{})};
}

export function storeSupabaseSimulacao(cliente:SupabaseClient,signal:AbortSignal):StoreSimulacao {
  return {
    peca:async id=>{
      const r=await consultaComPrazo(s=>cliente.from('admin_marketing_sim_catalogo')
        .select('peca_id,versao,manifesto,aprovado').eq('peca_id',id).abortSignal(s).maybeSingle(),signal);
      if(r.error)throw new Error('consulta');
      return r.data?{pecaId:r.data.peca_id,versao:r.data.versao,manifesto:r.data.manifesto,aprovado:r.data.aprovado} as Peca:null;
    },
    ler:async chave=>{
      const r=await consultaComPrazo(s=>cliente.from('admin_marketing_sim_outbox').select('revisao,dados')
        .eq('chave',chave).abortSignal(s).maybeSingle(),signal);
      if(r.error)throw new Error('consulta');
      return r.data?{revisao:r.data.revisao,dados:r.data.dados as Job}:null;
    },
    cas:async(chave,revisao,dados)=>{
      const r=await consultaComPrazo(s=>cliente.rpc('admin_marketing_sim_cas',{
        p_chave:chave,p_revisao:revisao,p_dados:dados,
      }).abortSignal(s),signal);
      if(r.error || (r.data!==null && (!Number.isSafeInteger(r.data)||r.data<0)))throw new Error('persistencia');
      return r.data as number|null;
    },
    pausas:async()=>{
      const r=await consultaComPrazo(s=>cliente.from('admin_marketing_sim_controles')
        .select('global_pausado,facebook_pausado,instagram_pausado').eq('id',true).abortSignal(s).single(),signal);
      if(r.error || !r.data || [r.data.global_pausado,r.data.facebook_pausado,r.data.instagram_pausado].some(v=>typeof v!=='boolean'))throw new Error('controle-indisponivel');
      return {global:r.data.global_pausado,facebook:r.data.facebook_pausado,instagram:r.data.instagram_pausado};
    },
    pausar:async(rede,pausa)=>{
      const r=await consultaComPrazo(s=>cliente.rpc('admin_marketing_sim_pausar',{p_rede:rede,p_pausa:pausa}).abortSignal(s),signal);
      if(r.error)throw new Error('controle-indisponivel');
    },
  };
}
export const operacaoPublicacoesSimulacao:OperacaoAdmin<PedidoSimulacao>={
  limiteCorpo:2048,validar:validarSimulacao,
  executar:async(cliente,p,{userId,agora,signal})=>{
    const store=storeSupabaseSimulacao(cliente,signal);
    if(p.acao==='listar') {
      const r=await consultaComPrazo(s=>cliente.from('admin_marketing_sim_outbox').select('dados')
        .order('atualizado_em',{ascending:false}).order('chave',{ascending:false}).limit(51).abortSignal(s),signal);
      if(r.error || !Array.isArray(r.data) || r.data.length>51)throw new Error('consulta');
      const registros=r.data.slice(0,50).map(x=>{
        const j=x.dados as Job;
        if(j.modo!=='simulacao'||!HASH.test(j.chave))throw new Error('estado-invalido');
        return {chave:j.chave,alvo:j.alvo,versao:j.peca.versao,estado:j.estado,motivo:j.motivo,
          remotoId:j.remotoId,confirmadoEm:j.confirmadoEm,modo:'simulacao'};
      });
      return {dados:{modo:'simulacao',registros,limitado:r.data.length>50,pausas:await store.pausas()}};
    }
    if(p.acao==='pausar'||p.acao==='retomar') {
      await store.pausar(p.rede!,p.acao==='pausar');
      return {dados:{modo:'simulacao',pausas:await store.pausas(),cancelamentos:'Conferir agendamentos na simulação antes de concluir cancelamento.'}};
    }
    if(p.acao==='previa')return {dados:await previaSimulada(store,p.alvo!,agora)};
    if(p.acao==='confirmar')return {dados:await confirmarSimulacao(store,p.alvo!,p.chave!,userId,agora)};
    if(p.acao==='consultar')return {dados:{modo:'simulacao',registro:await store.ler(p.chave!)}};
    const chamadas:AcaoAdaptador[]=[];
    const registro=await executarSimulacao(store,p.chave!,p.acao,criarAdaptadorSimulado(p.cenario??'sucesso',chamadas),agora,p.cenario==='interromper');
    return {dados:{modo:'simulacao',registro,chamadasSimuladas:chamadas,chamadasMetaReais:0}};
  },
};
