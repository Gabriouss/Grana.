// Contrato E7 comum ao servidor e aos renderizadores. Sem rede ou mutações.
export type CoverageState='complete'|'partial'|'unavailable'|'not_configured';
export type FreshnessState='current'|'delayed'|'unknown';
export type IntegrityState='clean'|'has_rejected'|'has_duplicates'|'compromised'|'unknown';
export type AttributionState='known'|'mixed'|'unknown'|'not_applicable';
export type DecisionState='actionable'|'inconclusive'|'blocked'|'informational';
export type ValueState='observed'|'partial'|'unavailable'|'not_configured'|'definition_pending';
export type MetricId='meta_ad_spend'|'cakto_new_paid_subscriptions'|'cakto_confirmed_gross_revenue'|'cakto_refunds_chargebacks'|'campaign_attribution_coverage';
export type Period={startInclusive:string;endExclusive:string;timezone:string};
export type SourceQuality={sourceId:string;coverage:CoverageState;freshness:FreshnessState;integrity:IntegrityState;
  coveredPeriod:Period|null;lastUpdatedAt:string|null;coveragePercent:number|null;rejectedCount:number|null;duplicateCount:number|null;reasonCodes:string[]};
export type MetricObservation={metricId:MetricId;value:number|null;unit:string;state:ValueState;sourceIds:string[];period:Period;noteCodes:string[]};
export type Sample={eligible:number|null;observed:number|null;excluded:number|null;unknownAttribution:number|null;
  state:'adequate'|'small'|'unknown';policyId:string|null;policyState:'approved'|'pending'|'not_applicable'};
export type Attribution={state:AttributionState;eligibleCount:number|null;knownCount:number|null;unknownCount:number|null;coveragePercent:number|null;noteCodes:string[]};
export type AnalyticsSnapshot={contractVersion:'e7.v1';snapshotId:string;generatedAt:string;period:Period;metricContractRef:'Beacon-E4';
  sources:SourceQuality[];metrics:MetricObservation[];attribution:Attribution;sample:Sample;qualityNotes:string[];
  pendingDimensions:{dimensionId:'renewal'|'cancellation'|'retention';value:null;state:'definition_pending'}[]};
export type Recommendation={id:string;snapshotId:string;rank:1|2|3;decisionState:DecisionState;period:Period;sample:Sample;
  evidenceMetricIds:MetricId[];sourceIds:string[];attributionState:AttributionState;title:string;hypothesis:string;suggestedAction:string;
  expectedSignal:string;priorityReason:string;humanDecision:{outcome:'accept_for_draft'|'reject'|'defer';decidedAt:string;noteCode:string|null}|null;
  adjustmentRequestId:string|null;limitationCodes:string[];effect:'none_until_explicit_human_decision';externalMutation:false};
export type Experiment={id:string;status:'draft'|'ready_for_review'|'running'|'completed'|'inconclusive'|'cancelled';objective:string;
  audienceDescription:string;channelAndDestination:string;hypothesis:string;primaryChange:string;controlVersionRef:string|null;
  variantVersionRef:string|null;primaryMetricId:MetricId;guardrailMetricIds:MetricId[];plannedPeriod:Period|null;dueAt:string|null;
  successTarget:{value:number|null;unit:string;state:'defined'|'pending'};
  budgetCap:{amount:number|null;currency:string|null;state:'not_applicable'|'pending_authorization'};
  samplePolicyId:string|null;samplePolicyState:'approved'|'pending';
  decision:{outcome:'keep'|'discard'|'iterate'|'inconclusive';rationale:string;evidenceMetricIds:MetricId[];decidedAt:string}|null;
  learning:string|null;externalMutation:false};
export type ExperimentSummary=Pick<Experiment,'id'|'status'|'primaryMetricId'|'decision'|'learning'>&{limitationCodes:string[]};
export type WeeklyReport={contractVersion:'e7.v1';reportId:string;revision:number;snapshotId:string;generatedAt:string;period:Period;
  periodState:'complete'|'partial';metricContractRef:'Beacon-E4';metrics:MetricObservation[];sources:SourceQuality[];attribution:Attribution;
  sample:Sample;recommendations:Recommendation[];omittedCandidateCount:number;experiments:ExperimentSummary[];qualityNotes:string[];nextActions:string[]};
export type CsvRecord={reportId:string;revision:number;snapshotId:string;periodStart:string;periodEndExclusive:string;timezone:string;
  section:'metric'|'source'|'attribution'|'recommendation'|'experiment'|'quality';itemId:string|null;field:string;value:string;
  valueState:ValueState;unit:string|null;sourceIds:string[];noteCodes:string[]};

export const METRIC_IDS:readonly MetricId[]=['meta_ad_spend','cakto_new_paid_subscriptions','cakto_confirmed_gross_revenue','cakto_refunds_chargebacks','campaign_attribution_coverage'];
const ZONE='America/Sao_Paulo',DAY=86400000;
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
function freeze<T>(x:T):T {if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
const calendar=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function meiaNoiteSaoPaulo(dia:string):string {
  if(!/^\d{4}-\d\d-\d\d$/.test(dia)||new Date(dia+'T00:00:00Z').toISOString().slice(0,10)!==dia)throw new Error('periodo-invalido');
  const target=Date.parse(dia+'T00:00:00Z');let utc=target;
  const f=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){
    const p=Object.fromEntries(f.formatToParts(utc).map(x=>[x.type,x.value]));
    utc+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  return new Date(utc).toISOString();
}
export function semanaAnalitica(agora:Date,atual=false):Period {
  const day=Date.parse(calendar(agora)+'T00:00:00Z'),weekday=(new Date(day).getUTCDay()+6)%7;
  const start=day-weekday*DAY-(atual?0:7*DAY),end=start+7*DAY;
  return {startInclusive:meiaNoiteSaoPaulo(new Date(start).toISOString().slice(0,10)),
    endExclusive:meiaNoiteSaoPaulo(new Date(end).toISOString().slice(0,10)),timezone:ZONE};
}
function period(p:Period):void {
  if(p.timezone!==ZONE||![p.startInclusive,p.endExclusive].every(x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x)))
    ||Date.parse(p.startInclusive)>=Date.parse(p.endExclusive))throw new Error('periodo-invalido');
}
function copiarPeriodo(p:Period):Period {period(p);return {startInclusive:p.startInclusive,endExclusive:p.endExclusive,timezone:p.timezone};}
function code(s:string):boolean{return /^[a-z0-9_-]{1,100}$/.test(s);}
function safeText(s:string,max=400):string {
  if(typeof s!=='string'||!s.trim()||s.length>max||/https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d[ ().+-]*){9,}/i.test(s))throw new Error('texto-nao-sanitizado');
  return s.trim();
}
function count(n:number|null):boolean{return n===null||(Number.isSafeInteger(n)&&n>=0);}

export async function criarSnapshotAnalitico(input:Omit<AnalyticsSnapshot,'contractVersion'|'snapshotId'|'metricContractRef'|'pendingDimensions'>):Promise<AnalyticsSnapshot> {
  period(input.period);
  if(!Number.isFinite(Date.parse(input.generatedAt))||input.sources.length>10||input.metrics.length>METRIC_IDS.length)throw new Error('contrato-invalido');
  const sources=input.sources.map(x=>{
    if(!['meta_insights','cakto_ledger','own_measurement'].includes(x.sourceId)
      ||!['complete','partial','unavailable','not_configured'].includes(x.coverage)
      ||!['current','delayed','unknown'].includes(x.freshness)
      ||!['clean','has_rejected','has_duplicates','compromised','unknown'].includes(x.integrity)
      ||!x.reasonCodes.every(code)||!count(x.rejectedCount)||!count(x.duplicateCount)
      ||(x.coveragePercent!==null&&(!Number.isFinite(x.coveragePercent)||x.coveragePercent<0||x.coveragePercent>100))
      ||(x.lastUpdatedAt!==null&&!Number.isFinite(Date.parse(x.lastUpdatedAt))))throw new Error('fonte-invalida');
    if(x.coveredPeriod)period(x.coveredPeriod);
    return {sourceId:x.sourceId,coverage:x.coverage,freshness:x.freshness,integrity:x.integrity,coveredPeriod:x.coveredPeriod?copiarPeriodo(x.coveredPeriod):null,
      lastUpdatedAt:x.lastUpdatedAt,coveragePercent:x.coveragePercent,rejectedCount:x.rejectedCount,duplicateCount:x.duplicateCount,reasonCodes:[...x.reasonCodes]};
  });
  if(new Set(sources.map(x=>x.sourceId)).size!==sources.length)throw new Error('fonte-duplicada');
  const metrics=input.metrics.map(x=>{
    period(x.period);
    if(!METRIC_IDS.includes(x.metricId)||!['observed','partial','unavailable','not_configured','definition_pending'].includes(x.state)
      ||!x.noteCodes.every(code)||!x.sourceIds.length||x.sourceIds.some(id=>!sources.some(s=>s.sourceId===id))
      ||(x.value!==null&&(!Number.isFinite(x.value)||x.value<0
        ||(x.metricId==='campaign_attribution_coverage'?x.value>100:!Number.isSafeInteger(x.value))))
      ||Date.parse(x.period.startInclusive)!==Date.parse(input.period.startInclusive)||Date.parse(x.period.endExclusive)!==Date.parse(input.period.endExclusive))throw new Error('metrica-invalida');
    let state=x.state;
    if(state==='observed'){
      const required=sources.filter(s=>x.sourceIds.includes(s.sourceId));
      if(required.some(s=>s.coverage!=='complete'||!s.coveredPeriod||Date.parse(s.coveredPeriod.startInclusive)>Date.parse(x.period.startInclusive)||Date.parse(s.coveredPeriod.endExclusive)<Date.parse(x.period.endExclusive)))state='partial';
      if(x.value===null)state='unavailable';
    }
    return {metricId:x.metricId,value:state==='observed'?x.value:null,unit:safeText(x.unit,40),state,sourceIds:[...x.sourceIds],period:copiarPeriodo(x.period),noteCodes:[...x.noteCodes]};
  });
  if(new Set(metrics.map(x=>x.metricId)).size!==metrics.length)throw new Error('metrica-duplicada');
  const a=input.attribution,s=input.sample;
  if(!['known','mixed','unknown','not_applicable'].includes(a.state)||![a.eligibleCount,a.knownCount,a.unknownCount,s.eligible,s.observed,s.excluded,s.unknownAttribution].every(count)
    ||!a.noteCodes.every(code)||!input.qualityNotes.every(code)||!['adequate','small','unknown'].includes(s.state)
    ||!['approved','pending','not_applicable'].includes(s.policyState)||(s.policyId!==null&&!code(s.policyId))
    ||(a.coveragePercent!==null&&(!Number.isFinite(a.coveragePercent)||a.coveragePercent<0||a.coveragePercent>100)))throw new Error('qualidade-invalida');
  if(a.eligibleCount!==null&&a.knownCount!==null&&a.unknownCount!==null&&a.knownCount+a.unknownCount>a.eligibleCount)throw new Error('atribuicao-invalida');
  if(s.state==='adequate'&&(s.policyState!=='approved'||!s.policyId||s.eligible===null||s.observed===null))throw new Error('amostra-sem-evidencia');
  const attribution={state:a.state,eligibleCount:a.eligibleCount,knownCount:a.knownCount,unknownCount:a.unknownCount,
    coveragePercent:a.coveragePercent,noteCodes:[...a.noteCodes]};
  const sample={eligible:s.eligible,observed:s.observed,excluded:s.excluded,unknownAttribution:s.unknownAttribution,state:s.state,policyId:s.policyId,policyState:s.policyState};
  const base={contractVersion:'e7.v1' as const,generatedAt:new Date(input.generatedAt).toISOString(),period:copiarPeriodo(input.period),metricContractRef:'Beacon-E4' as const,
    sources,metrics,attribution,sample,qualityNotes:[...input.qualityNotes],
    pendingDimensions:(['renewal','cancellation','retention'] as const).map(d=>({dimensionId:d,value:null,state:'definition_pending' as const}))};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(base)));
  const snapshotId='e7-'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  return freeze({...base,snapshotId});
}

export type RecommendationCandidate={id:string;kind:'quality'|'opportunity'|'information';
  area:'new_paid_subscriptions'|'retention'|'renewal'|'cancellation'|'refunds'|'other';evidenceMetricIds:MetricId[];
  title:string;hypothesis:string;suggestedAction:string;expectedSignal:string;ruleApproved:boolean};
export function recomendar(snapshot:AnalyticsSnapshot,candidates:RecommendationCandidate[]) {
  if(candidates.length>100||new Set(candidates.map(x=>x.id)).size!==candidates.length)throw new Error('candidatos-invalidos');
  const ranked=candidates.filter(c=>c.evidenceMetricIds.length>0&&c.evidenceMetricIds.every(id=>snapshot.metrics.some(m=>m.metricId===id))).map(c=>{
    if(!code(c.id)||!['quality','opportunity','information'].includes(c.kind)
      ||!['new_paid_subscriptions','retention','renewal','cancellation','refunds','other'].includes(c.area))throw new Error('candidato-invalido');
    const evidence=snapshot.metrics.filter(x=>c.evidenceMetricIds.includes(x.metricId));
    const ids=[...new Set(evidence.flatMap(x=>x.sourceIds))];
    const sources=snapshot.sources.filter(x=>ids.includes(x.sourceId));
    const limits:string[]=[];
    if(evidence.some(x=>x.state==='definition_pending')||['retention','renewal','cancellation'].includes(c.area))limits.push('definition_pending');
    if(sources.some(x=>x.integrity==='compromised'))limits.push('integrity_compromised');
    if(sources.some(x=>x.coverage!=='complete')||evidence.some(x=>x.state!=='observed'))limits.push('source_incomplete');
    if(sources.some(x=>x.freshness!=='current'))limits.push('freshness_unproven');
    if(sources.some(x=>x.integrity!=='clean'))limits.push('integrity_unproven');
    if(snapshot.sample.policyState!=='approved'||!snapshot.sample.policyId)limits.push('sample_policy_pending');
    if(snapshot.sample.state!=='adequate')limits.push('sample_insufficient');
    if(c.area!=='other'&&['unknown','mixed'].includes(snapshot.attribution.state))limits.push('attribution_unknown');
    if(c.kind==='opportunity'&&!c.ruleApproved)limits.push('decision_rule_pending');
    const decisionState:DecisionState=limits.some(x=>['definition_pending','integrity_compromised','decision_rule_pending'].includes(x))?'blocked'
      :c.kind==='information'?'informational':limits.length?'inconclusive':'actionable';
    const severity=sources.some(x=>x.integrity==='compromised')?0:sources.some(x=>['unavailable','not_configured'].includes(x.coverage))?1
      :sources.some(x=>x.coverage==='partial'||x.freshness==='delayed')?2:3;
    const group=c.kind==='quality'?0:c.kind==='opportunity'&&decisionState==='actionable'?1:c.kind==='opportunity'?2:3;
    const area=['new_paid_subscriptions','retention','renewal','cancellation','refunds','other'].indexOf(c.area);
    return {group,severity,area,c,rec:{id:c.id,snapshotId:snapshot.snapshotId,rank:1 as 1|2|3,decisionState,period:copy(snapshot.period),sample:copy(snapshot.sample),
      evidenceMetricIds:[...c.evidenceMetricIds],sourceIds:ids,attributionState:snapshot.attribution.state,title:safeText(c.title),hypothesis:safeText(c.hypothesis),
      suggestedAction:safeText(c.suggestedAction),expectedSignal:safeText(c.expectedSignal),
      priorityReason:c.kind==='quality'?'Qualidade da evidência antes de decisões de desempenho.':decisionState==='actionable'?'Oportunidade com regra e evidência aprovadas.':'Limitações impedem uma conclusão de desempenho.',
      humanDecision:null,adjustmentRequestId:null,limitationCodes:limits,effect:'none_until_explicit_human_decision' as const,externalMutation:false as const}};
  });
  ranked.sort((a,b)=>a.group-b.group||(a.group===0?a.severity-b.severity:a.area-b.area)||(a.c.id<b.c.id?-1:a.c.id>b.c.id?1:0));
  return freeze({recommendations:ranked.slice(0,3).map((x,i)=>({...x.rec,rank:(i+1) as 1|2|3})),omittedCandidateCount:Math.max(0,ranked.length-3)});
}

export function relatorioSemanal(snapshot:AnalyticsSnapshot,selection:ReturnType<typeof recomendar>,agora:Date,atual=false,experiments:Experiment[]=[],revision=1):WeeklyReport {
  const expected=semanaAnalitica(agora,atual);
  if(Date.parse(snapshot.period.startInclusive)!==Date.parse(expected.startInclusive)||Date.parse(snapshot.period.endExclusive)!==Date.parse(expected.endExclusive)
    ||!Number.isSafeInteger(revision)||revision<1||selection.recommendations.length>3
    ||selection.recommendations.some(r=>r.snapshotId!==snapshot.snapshotId||r.externalMutation!==false))throw new Error('relatorio-invalido');
  const summaries=experiments.map(e=>{
    if(e.externalMutation!==false||!code(e.id)||!METRIC_IDS.includes(e.primaryMetricId)
      ||!['draft','ready_for_review','completed','inconclusive','cancelled'].includes(e.status))throw new Error('experimento-fora-do-escopo');
    const limitationCodes:string[]=[];
    if(e.samplePolicyState!=='approved')limitationCodes.push('sample_policy_pending');
    if(e.successTarget.state!=='defined')limitationCodes.push('success_target_pending');
    if(e.status==='ready_for_review'){
      for(const texto of [e.objective,e.audienceDescription,e.channelAndDestination,e.hypothesis,e.primaryChange])safeText(texto);
      if(!e.controlVersionRef||!e.variantVersionRef||!e.plannedPeriod||!e.dueAt||!Number.isFinite(Date.parse(e.dueAt))||!e.guardrailMetricIds.length
        ||e.guardrailMetricIds.some(id=>!METRIC_IDS.includes(id))||!e.samplePolicyId||limitationCodes.length
        ||e.successTarget.value===null||!Number.isFinite(e.successTarget.value)||e.successTarget.value<0
        ||!['not_applicable','pending_authorization'].includes(e.budgetCap.state)
        ||(e.budgetCap.amount!==null&&(!Number.isFinite(e.budgetCap.amount)||e.budgetCap.amount<0)))throw new Error('experimento-incompleto');
      period(e.plannedPeriod);safeText(e.successTarget.unit,40);safeText(e.controlVersionRef);safeText(e.variantVersionRef);
    }
    if(e.status==='completed'&&!e.decision)throw new Error('experimento-sem-decisao');
    if(e.decision&&(!['keep','discard','iterate','inconclusive'].includes(e.decision.outcome)
      ||!Number.isFinite(Date.parse(e.decision.decidedAt))||!e.decision.evidenceMetricIds.every(id=>METRIC_IDS.includes(id))))throw new Error('decisao-invalida');
    return {id:e.id,status:e.status,primaryMetricId:e.primaryMetricId,decision:e.decision?{outcome:e.decision.outcome,rationale:safeText(e.decision.rationale),
      evidenceMetricIds:[...e.decision.evidenceMetricIds],decidedAt:e.decision.decidedAt}:null,
      learning:e.learning===null?null:safeText(e.learning),limitationCodes};
  });
  return freeze({contractVersion:'e7.v1',reportId:'weekly-'+snapshot.snapshotId+'-'+revision,revision,snapshotId:snapshot.snapshotId,
    generatedAt:snapshot.generatedAt,period:copy(snapshot.period),periodState:atual?'partial':'complete',metricContractRef:'Beacon-E4',
    metrics:copy(snapshot.metrics),sources:copy(snapshot.sources),attribution:copy(snapshot.attribution),sample:copy(snapshot.sample),
    recommendations:copy(selection.recommendations),omittedCandidateCount:selection.omittedCandidateCount,experiments:summaries,
    qualityNotes:copy(snapshot.qualityNotes),nextActions:selection.recommendations.map(r=>r.suggestedAction)});
}
