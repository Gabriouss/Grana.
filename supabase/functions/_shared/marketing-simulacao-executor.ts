import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { lerCorpoLimitado } from './request-body.ts';
import { timingSafeEqual } from './seguranca.ts';
import { consultaComPrazo } from './admin-agregados.ts';
import { storeSupabaseSimulacao } from './admin-publicacoes-simulacao.ts';
import { criarAdaptadorSimulado, executarSimulacao, type AcaoAdaptador } from './marketing-simulacao.ts';

type Dependencias = {
  env:(nome:string)=>string|undefined;
  cliente:(signal:AbortSignal)=>SupabaseClient;
  log:(linha:string)=>void;
  agora?:()=>Date;
};
// Não usa sessão humana ou arquivos/Maestri/M1. O chamador remoto precisa de
// JWT do gateway + segredo próprio do servidor. Sem ativação explícita recusa.
export function criarExecutorSimulacao(deps:Dependencias) {
  let recentes:number[]=[];
  return async(req:Request):Promise<Response>=>{
    let processados=0,status=500;
    const total=new AbortController(),timer=setTimeout(()=>total.abort(),9000);
    const responder=(s:number,codigo:string,chamadasSimuladas=0)=>{
      status=s;return Response.json({modo:'simulacao',codigo,processados,chamadasSimuladas,chamadasMetaReais:0},
        {status:s,headers:{'Cache-Control':'no-store'}});
    };
    try {
      if(req.method!=='POST')return responder(405,'metodo-invalido');
      const secret=deps.env('MARKETING_SIM_EXECUTOR_SECRET')??'';
      if(deps.env('MARKETING_SIM_EXECUTOR_ATIVO')!=='true'||secret.length<32||secret.length>256
        || !deps.env('SUPABASE_URL')||!deps.env('SUPABASE_SERVICE_ROLE_KEY'))return responder(503,'nao-configurado');
      const recebido=req.headers.get('x-marketing-sim-secret')??'';
      if(recebido.length>256||!timingSafeEqual(secret,recebido))return responder(401,'nao-autorizado');
      recentes=recentes.filter(t=>t>Date.now()-60000);
      if(recentes.length>=12)return responder(429,'limite');
      recentes.push(Date.now());
      const lido=await lerCorpoLimitado(req,128,2000);
      if(!lido.ok)return responder(lido.status,'corpo-recusado');
      let corpo:unknown;
      try{corpo=JSON.parse(new TextDecoder().decode(lido.bytes));}catch{return responder(400,'pedido-invalido');}
      if(!corpo||typeof corpo!=='object'||Array.isArray(corpo)||Object.keys(corpo).length!==0)return responder(400,'pedido-invalido');
      const agora=deps.agora?.()??new Date(),cliente=deps.cliente(total.signal);
      const fila=await consultaComPrazo(s=>cliente.from('admin_marketing_sim_outbox').select('chave,revisao')
        .in('dados->>estado',['programado-no-painel','preparando','cancelamento-pendente','agendado-na-meta'])
        .lte('proxima_verificacao_em',agora.toISOString()).order('proxima_verificacao_em',{ascending:true})
        .order('chave',{ascending:true}).limit(3).abortSignal(s),total.signal);
      if(fila.error||!Array.isArray(fila.data)||fila.data.length>3)throw new Error('consulta');
      const store=storeSupabaseSimulacao(cliente,total.signal),chamadas:AcaoAdaptador[]=[];
      for(const row of fila.data) {
        if(total.signal.aborted)throw new Error('prazo');
        if(typeof row.chave!=='string'||!/^[0-9a-f]{64}$/.test(row.chave)||!Number.isSafeInteger(row.revisao))throw new Error('consulta');
        await executarSimulacao(store,row.chave,'executar',criarAdaptadorSimulado('sucesso',chamadas),agora);
        // Até um retorno sem transição (lease ativa, pausa ou horário futuro)
        // precisa sair do topo da fila, sem criar outra tentativa do adaptador.
        const atual=await store.ler(row.chave);
        if(atual&&atual.revisao===row.revisao)await store.cas(row.chave,atual.revisao,atual.dados);
        processados++;
      }
      return responder(200,'simulacao-concluida',chamadas.length);
    }catch{
      return responder(total.signal.aborted?504:503,total.signal.aborted?'prazo':'simulacao-indisponivel');
    }finally{
      clearTimeout(timer);
      deps.log(JSON.stringify({codigo:'executor-simulacao',status,processados,modo:'simulacao'}));
    }
  };
}
