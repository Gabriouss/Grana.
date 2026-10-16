import type { OperacaoAdmin } from './admin-autorizacao.ts';
import { criarOperacaoMeta } from './admin-meta.ts';
import { criarSnapshotAnalitico, recomendar, relatorioSemanal, meiaNoiteSaoPaulo,
  type AnalyticsSnapshot, type CoverageState, type MetricObservation, type RecommendationCandidate, type SourceQuality } from '../../../lib/admin-analytics.ts';

type PedidoAnalytics={recurso:'analytics-leitura';janela:'painel'|'semana-anterior'|'semana-atual'};
function validar(v:unknown):PedidoAnalytics {
  const p=v as Record<string,unknown>|null;
  if(!p||typeof p!=='object'||Array.isArray(p)||p.recurso!=='analytics-leitura'
    ||Object.keys(p).some(k=>!['recurso','janela'].includes(k))
    ||(p.janela!==undefined&&!['painel','semana-anterior','semana-atual'].includes(p.janela as string)))throw new Error('pedido-invalido');
  return {recurso:'analytics-leitura',janela:(p.janela??'painel') as PedidoAnalytics['janela']};
}
function estado(v:unknown):CoverageState {
  return v==='completo'?'complete':v==='parcial'?'partial':v==='nao-configurado'?'not_configured':'unavailable';
}
// Adaptador fechado do DTO E4. Não recebe ledger individual, IDs pessoais,
// payload de provedor, política de amostra ou candidaturas do navegador.
export async function snapshotDeMeta(v:unknown,agora:Date):Promise<AnalyticsSnapshot> {
  const d=v as {periodos:{fuso:string;atual:{desde:string;ateExclusivo:string;parcial:boolean}};
    meta:{estado:string;moeda?:string;fuso?:string;atualizadoEm?:string;atual?:{estado:string;investimentoCentavos:number|null;motivo?:string}}};
  if(!d?.periodos?.atual||!d.meta||d.periodos.fuso!=='America/Sao_Paulo')throw new Error('contrato-e4-invalido');
  const period={startInclusive:meiaNoiteSaoPaulo(d.periodos.atual.desde),endExclusive:meiaNoiteSaoPaulo(d.periodos.atual.ateExclusivo),timezone:d.periodos.fuso};
  let coverage=estado(d.meta.atual?.estado??d.meta.estado);
  if(d.periodos.atual.parcial&&coverage==='complete')coverage='partial';
  const valor=d.meta.atual?.investimentoCentavos;
  if(coverage==='complete'&&(d.meta.moeda!=='BRL'||d.meta.fuso!=='America/Sao_Paulo'
    ||typeof valor!=='number'||!Number.isSafeInteger(valor)||valor<0))throw new Error('contrato-e4-invalido');
  const updated=d.meta.atualizadoEm&&Number.isFinite(Date.parse(d.meta.atualizadoEm))?new Date(d.meta.atualizadoEm).toISOString():null;
  const source=(sourceId:string,cov:CoverageState,reasonCodes:string[]):SourceQuality=>({sourceId,coverage:cov,freshness:'unknown',integrity:'unknown',
    coveredPeriod:cov==='complete'?period:null,lastUpdatedAt:sourceId==='meta_insights'?updated:null,coveragePercent:cov==='complete'?100:null,
    rejectedCount:null,duplicateCount:null,reasonCodes});
  const sources=[source('meta_insights',coverage,['freshness_policy_pending','integrity_unproven']),
    source('cakto_ledger','unavailable',['ledger_completeness_unproven']),source('own_measurement','not_configured',['consent_link_unproven'])];
  const metric=(metricId:MetricObservation['metricId'],sourceIds:string[],unit:string,state:MetricObservation['state'],value:number|null,noteCodes:string[]=[]):MetricObservation=>
    ({metricId,sourceIds,unit,state,value,period,noteCodes});
  const metrics=[metric('meta_ad_spend',['meta_insights'],'BRL_centavos',coverage==='complete'?'observed':coverage,coverage==='complete'?valor!:null),
    metric('cakto_new_paid_subscriptions',['cakto_ledger'],'assinaturas','definition_pending',null,['refund_semantics_pending','ledger_completeness_unproven']),
    metric('cakto_confirmed_gross_revenue',['cakto_ledger'],'BRL_centavos','unavailable',null,['ledger_completeness_unproven']),
    metric('cakto_refunds_chargebacks',['cakto_ledger'],'BRL_centavos','unavailable',null,['ledger_completeness_unproven']),
    metric('campaign_attribution_coverage',['cakto_ledger','own_measurement'],'percent','unavailable',null,['consent_link_unproven'])];
  return await criarSnapshotAnalitico({generatedAt:agora.toISOString(),period,sources,metrics,
    attribution:{state:'unknown',eligibleCount:null,knownCount:null,unknownCount:null,coveragePercent:null,noteCodes:['consent_link_unproven']},
    sample:{eligible:null,observed:null,excluded:null,unknownAttribution:null,state:'unknown',policyId:null,policyState:'pending'},
    qualityNotes:['sample_policy_pending','ledger_completeness_unproven','retention_definition_pending',...(d.periodos.atual.parcial?['period_partial']:[])]});
}
export function candidaturasDeQualidade(snapshot:AnalyticsSnapshot):RecommendationCandidate[] {
  // Fonte totalmente ausente gera lista vazia, nunca opinião de desempenho.
  if(!snapshot.metrics.some(m=>m.state==='observed'))return [];
  return snapshot.sources.filter(s=>s.coverage==='partial'||s.freshness==='delayed'||s.integrity==='compromised'||s.integrity==='has_duplicates'||s.integrity==='has_rejected')
    .map(s=>({id:'review_'+s.sourceId,kind:'quality' as const,area:'other' as const,evidenceMetricIds:snapshot.metrics.filter(m=>m.sourceIds.includes(s.sourceId)).map(m=>m.metricId),
      title:'Confira a qualidade da fonte antes de comparar resultados',hypothesis:'Uma limitação da coleta pode alterar a interpretação dos números.',
      suggestedAction:'Revisar internamente a cobertura e os recibos desta fonte.',expectedSignal:'Cobertura e integridade reconciliadas, com limitações identificadas.',ruleApproved:false}));
}
export function criarOperacaoAnalytics(env:(nome:string)=>string|undefined,rede:typeof fetch=fetch):OperacaoAdmin<PedidoAnalytics> {
  const metas={painel:criarOperacaoMeta(env,rede),'semana-anterior':criarOperacaoMeta(env,rede,'semana-anterior'),'semana-atual':criarOperacaoMeta(env,rede,'semana-atual')};
  return {limiteCorpo:256,validar,executar:async(cliente,p,contexto)=>{
    const leitura=await metas[p.janela].executar(cliente,{recurso:'meta-leitura'},contexto);
    const snapshot=await snapshotDeMeta(leitura.dados,contexto.agora);
    const selection=recomendar(snapshot,candidaturasDeQualidade(snapshot));
    const weeklyReport=p.janela==='painel'?null:relatorioSemanal(snapshot,selection,contexto.agora,p.janela==='semana-atual');
    return {dados:{contractVersion:'e7.v1',snapshot,...selection,weeklyReport,externalMutation:false}};
  }};
}
