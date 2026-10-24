import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { timingSafeEqual } from './seguranca.ts';

export type AssinaturaAviso = {
  id: string; user_id: string; status: string; access_until: string; grace_until: string | null;
  email_conta: string | null; email_compra: string | null;
};
export type AvisoAssinatura = { assinatura: AssinaturaAviso; tipo: 'antes_7'|'antes_3'|'antes_1'|'venceu'; dataLimite: string };
const DIA = 86_400_000;
const zona = 'America/Sao_Paulo';
function diaBRT(ms: number): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(ms);
  const v = (k:string) => Number(p.find(x=>x.type===k)?.value);
  return Date.UTC(v('year'),v('month')-1,v('day'))/DIA;
}
const prazoOriginal=(s:AssinaturaAviso):string=>s.status==='past_due' ? s.grace_until ?? s.access_until : s.access_until;
function prazo(s: AssinaturaAviso): number { return Date.parse(prazoOriginal(s)); }
// Espelha tem_assinatura_ativa: inclusive outra compra/cortesia da mesma conta.
function acessoAte(s: AssinaturaAviso): number {
  return Math.max(Date.parse(s.access_until),s.status==='past_due' ? Date.parse(s.grace_until ?? s.access_until) : -Infinity);
}
export function selecionarAvisosAssinatura(assinaturas: AssinaturaAviso[], agora: Date): AvisoAssinatura[] {
  const grupos = new Map<string, AssinaturaAviso[]>();
  for (const s of assinaturas) {
    if (!s.user_id || !Number.isFinite(prazo(s)) || !Number.isFinite(acessoAte(s))) continue;
    const grupo = grupos.get(s.user_id) ?? []; grupo.push(s); grupos.set(s.user_id,grupo);
  }
  const avisos: AvisoAssinatura[] = [];
  for (const grupo of grupos.values()) {
    // Uma única comunicação por conta: a assinatura que determina o fim do acesso.
    const [s] = grupo.sort((a,b)=>acessoAte(b)-acessoAte(a)||Number(b.status==='active')-Number(a.status==='active')||a.id.localeCompare(b.id));
    if (['refunded','chargeback'].includes(s.status)) continue;
    const limite = prazo(s), agoraMs=agora.getTime();
    if (acessoAte(s)>limite) continue;
    if (limite<agoraMs && limite>=agoraMs-DIA && !grupo.some(r=>acessoAte(r)>=agoraMs)) {
      avisos.push({assinatura:s,tipo:'venceu',dataLimite:prazoOriginal(s)});
    } else if (['canceled','past_due'].includes(s.status) && limite>agoraMs) {
      const dias=diaBRT(limite)-diaBRT(agoraMs);
      if (dias===7||dias===3||dias===1) avisos.push({assinatura:s,tipo:`antes_${dias}`,dataLimite:prazoOriginal(s)});
    }
  }
  return avisos;
}
export function emailAvisoAssinatura(aviso: AvisoAssinatura): { subject:string; text:string; html:string } {
  const data=new Intl.DateTimeFormat('pt-BR',{timeZone:zona,day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(aviso.dataLimite));
  const dias=aviso.tipo.slice(6);
  const pendente=aviso.assinatura.status==='past_due';
  const subject=aviso.tipo==='venceu'
    ? pendente ? 'Seu acesso foi interrompido. Seus dados continuam guardados.' : 'Sua assinatura venceu. Seus dados continuam guardados.'
    : pendente ? `Seu prazo para regularizar o pagamento termina em ${dias} ${dias==='1'?'dia':'dias'}`
    : `Sua assinatura termina em ${dias} ${dias==='1'?'dia':'dias'}`;
  const situacao=aviso.assinatura.status==='past_due' ? 'O pagamento da sua assinatura não foi confirmado. ' : '';
  const acao=pendente ? 'Atualizar cobrança' : 'Renovar assinatura';
  const instrucao=pendente ? 'Atualize a cobrança para regularizar o pagamento.' : 'Renove sua assinatura para continuar usando o app.';
  const corpo=aviso.tipo==='venceu'
    ? `${situacao}Seu acesso ao Grana. terminou em ${data}. O vencimento não apaga seus dados. Seus lançamentos, contas e metas continuam guardados. ${instrucao}`
    : `${situacao}${pendente?'O prazo para regularizar o pagamento e manter o acesso':'Seu acesso ao Grana.'} termina em ${data}. ${instrucao}`;
  const link='https://granaponto.com.br/assinar';
  const rodape='Este é um aviso sobre sua assinatura do Grana. Para baixar seus dados ou excluir sua conta, entre no app e use as opções da sua conta. Se não conseguir baixar seus dados, responda a este e-mail para solicitar uma cópia. Dúvidas? Responda a este e-mail.';
  return {subject,text:`${subject}\n\n${corpo}\n\n${acao}: ${link}\n\n${rodape}`,
    html:`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;font-weight:400;max-width:560px;margin:24px auto;padding:0 20px"><h1 style="font-size:24px;font-weight:400;text-wrap:balance">${subject}</h1><p style="line-height:1.6;text-wrap:pretty">${corpo}</p><p><a href="${link}">${acao}</a></p><p style="line-height:1.6;text-wrap:pretty">${rodape}</p></body></html>`};
}
type Deps = {
  env:(nome:string)=>string|undefined; cliente:(signal:AbortSignal)=>SupabaseClient;
  rede?:typeof fetch; agora?:()=>Date; log?:(codigo:string)=>void;
};
export function criarHandlerAvisosAssinatura(deps:Deps) {
  const log=deps.log??console.error;
  return async(req:Request):Promise<Response>=>{
    const resposta=(status:number,codigo:string,mais={})=>Response.json({codigo,...mais},{status,headers:{'Cache-Control':'no-store'}});
    if(req.method!=='POST')return resposta(405,'metodo-invalido');
    const segredo=deps.env('CRON_ASSINATURA_SECRET')??'';
    if(segredo.length<32)return resposta(503,'configuracao-ausente');
    if(!timingSafeEqual(req.headers.get('x-cron-secret')??'',segredo))return resposta(401,'nao-autorizado');
    const apiKey=deps.env('RESEND_API_KEY');
    if(!apiKey){log('assinatura:resend-configuracao-ausente');return resposta(503,'configuracao-ausente');}
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),95000);
    let enviados=0, falhas=0;
    try {
      const client=deps.cliente(ctl.signal), assinaturas:AssinaturaAviso[]=[];
      let depois:string|null=null;
      // Não envia nada antes de terminar a paginação: a renovação pode estar na última página.
      for(;;){
        const {data,error}=await client.rpc('listar_assinaturas_para_avisos',{p_apos:depois,p_limite:500});
        if(error)throw new Error('listagem-indisponivel');
        const pagina=(data??[]) as AssinaturaAviso[];
        assinaturas.push(...pagina);
        if(pagina.length<500)break;
        const ultimo=pagina[pagina.length-1].id;
        if(ultimo===depois)throw new Error('paginacao-sem-progresso');
        depois=ultimo;
        if(ctl.signal.aborted)throw new Error('prazo-total');
      }
      const avisos=selecionarAvisosAssinatura(assinaturas,(deps.agora??(()=>new Date()))());
      for(const aviso of avisos){
        if(ctl.signal.aborted)throw new Error('prazo-total');
        const {data:reserva,error}=await client.rpc('reservar_aviso_assinatura',{
          p_subscription_id:aviso.assinatura.id,p_tipo:aviso.tipo,p_data_limite:aviso.dataLimite,
        });
        if(error)throw new Error('reserva-indisponivel');
        if(!reserva)continue;
        // A reserva é irrevogável automaticamente. Queda/resultado incerto exige
        // conferir o provedor, nunca repetir no próximo cron (janela Resend 24h).
        let estado='incerto', codigo='resend-resposta-incerta', provedorId:string|null=null;
        try {
          const email=emailAvisoAssinatura({...aviso,assinatura:{...aviso.assinatura,status:reserva.status??aviso.assinatura.status}});
          const r=await (deps.rede??fetch)('https://api.resend.com/emails',{
            method:'POST',redirect:'error',signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(10000)]),
            headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`assinatura/${reserva.id}`},
            body:JSON.stringify({from:'Grana. <contato@granaponto.com.br>',to:[reserva.email],...email}),
          });
          // O prazo cobre também leitura do corpo, não só os headers.
          const payload=await r.json();
          if(r.ok && typeof payload.id==='string' && payload.id){estado='enviado';codigo='resend-aceito';provedorId=payload.id;}
          else if(r.status>=400 && r.status<500 && r.status!==408){estado='falhou';codigo=`resend-http-${r.status}`;}
        } catch {log('assinatura:resend-resposta-incerta');}
        const {error:gravarErro}=await client.from('avisos_assinatura_enviados').update({
          estado,codigo,provedor_id:provedorId,concluido_em:(deps.agora??(()=>new Date()))().toISOString(),
        }).eq('id',reserva.id).eq('estado','reservado');
        if(gravarErro)throw new Error('recibo-indisponivel');
        if(estado==='enviado')enviados++; else {falhas++;log(`assinatura:${codigo}`);}
      }
      // Reservas interrompidas precisam aparecer mesmo em execuções seguintes.
      const {count,error:pendenciaErro}=await client.from('avisos_assinatura_enviados')
        .select('id',{count:'exact',head:true}).neq('estado','enviado');
      if(pendenciaErro)throw new Error('pendencias-indisponiveis');
      if((count??0)>0){log('assinatura:entregas-exigem-conferencia');return resposta(503,'entregas-exigem-conferencia',{enviados,falhas,pendencias:count});}
      return resposta(falhas?503:200,falhas?'envio-incompleto':'concluido',{enviados,falhas});
    } catch(error){
      const codigo=error instanceof Error ? error.message : 'processamento-indisponivel';
      log(`assinatura:${['listagem-indisponivel','paginacao-sem-progresso','prazo-total','reserva-indisponivel','recibo-indisponivel','pendencias-indisponiveis'].includes(codigo)?codigo:'processamento-indisponivel'}`);
      return resposta(503,'processamento-indisponivel',{enviados,falhas});
    } finally {clearTimeout(timer);}
  };
}
