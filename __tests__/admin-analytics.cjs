'use strict';
const assert = require('node:assert/strict');
const { carregar } = require('../tools/admin-local/adaptadores/_contratos-marketing.cjs');
const lib = carregar('lib/admin-analytics.ts');
const { snapshotDeMeta } = carregar('supabase/functions/_shared/admin-analytics.ts');
let provas = 0;
const eq = (a,b) => {assert.deepEqual(a,b);provas++;};
const ok = v => {assert.ok(v);provas++;};
const throws = f => {assert.throws(f);provas++;};
const agora = new Date('2026-10-16T15:00:00Z');
const clonar = v => JSON.parse(JSON.stringify(v));
const dto = {periodos:{fuso:'America/Sao_Paulo',atual:{desde:'2026-10-05',ateExclusivo:'2026-10-12',parcial:false}},
  meta:{estado:'completo',moeda:'BRL',fuso:'America/Sao_Paulo',atualizadoEm:agora.toISOString(),atual:{estado:'completo',investimentoCentavos:0}}};
(async () => {
  const s = await snapshotDeMeta(dto,agora);
  eq(s.metrics[0].value,0); eq(s.metrics[0].state,'observed');
  eq(s.metrics.slice(1).map(m=>m.value),[null,null,null,null]);
  eq(s.attribution.state,'unknown'); eq(s.sample.policyState,'pending');
  eq(s.pendingDimensions.map(d=>d.state),['definition_pending','definition_pending','definition_pending']);
  ok(Object.isFrozen(s.metrics[0]));
  throws(()=>{s.metrics[0].value=99;});
  eq((await snapshotDeMeta(dto,agora)).snapshotId,s.snapshotId);
  const p = clonar(dto);p.meta.atual.estado='parcial';p.meta.atual.investimentoCentavos=999;
  eq((await snapshotDeMeta(p,agora)).metrics[0].value,null);
  const input = clonar(s);
  input.period.extra='nao-exportar'; input.metrics[0].period.extra='nao-exportar';
  input.sources[0].coveredPeriod.extra='nao-exportar';
  const fechado=await lib.criarSnapshotAnalitico(input);
  ok(!JSON.stringify(fechado).includes('nao-exportar'));
  const ruim=clonar(s);ruim.metrics[0].value=0.5;
  await assert.rejects(()=>lib.criarSnapshotAnalitico(ruim));provas++;
  ruim.metrics[0].value=0;ruim.sample.state='adequate';
  await assert.rejects(()=>lib.criarSnapshotAnalitico(ruim));provas++;
  const candidate=(id,kind='opportunity',area='other')=>({id,kind,area,evidenceMetricIds:['meta_ad_spend'],title:'Revisar fonte',
    hypothesis:'Conferir cobertura antes de decidir.',suggestedAction:'Revisar internamente.',expectedSignal:'Cobertura comprovada.',ruleApproved:true});
  eq(lib.recomendar(s,[]).recommendations,[]);
  const ranked=lib.recomendar(s,[candidate('d'),candidate('b'),candidate('c'),candidate('a','quality')]);
  eq(ranked.recommendations.map(r=>r.id),['a','b','c']);eq(ranked.omittedCandidateCount,1);
  eq(ranked.recommendations.map(r=>r.decisionState),['inconclusive','inconclusive','inconclusive']);
  ok(ranked.recommendations.every(r=>r.externalMutation===false&&r.humanDecision===null));
  eq(lib.recomendar(s,[candidate('retencao','opportunity','retention')]).recommendations[0].decisionState,'blocked');
  throws(()=>lib.recomendar(s,[{...candidate('x'),title:'https://nao-exportar.invalid'}]));
  const report=lib.relatorioSemanal(s,ranked,agora);
  eq(report.snapshotId,s.snapshotId);eq(report.metrics,s.metrics);eq(report.sources,s.sources);
  eq(report.period,lib.semanaAnalitica(agora));
  eq(report.periodState,'complete');
  throws(()=>lib.relatorioSemanal(s,ranked,agora,true));
  const mensal=clonar(s);mensal.period.startInclusive='2026-09-16T03:00:00.000Z';
  throws(()=>lib.relatorioSemanal(mensal,ranked,agora));
  const experimento={id:'exp_teste',status:'ready_for_review',objective:'Conferir mensagem',audienceDescription:'Visitantes consentidos',
    channelAndDestination:'Ambiente de teste',hypothesis:'Mensagem clara melhora entendimento',primaryChange:'Titulo',controlVersionRef:'versao-a',variantVersionRef:'versao-b',
    primaryMetricId:'meta_ad_spend',guardrailMetricIds:['meta_ad_spend'],plannedPeriod:s.period,dueAt:agora.toISOString(),
    successTarget:{value:10,unit:'BRL_centavos',state:'defined'},budgetCap:{amount:100,currency:'BRL',state:'pending_authorization'},
    samplePolicyId:'politica_teste',samplePolicyState:'approved',decision:null,learning:null,externalMutation:false};
  eq(lib.relatorioSemanal(s,ranked,agora,false,[experimento]).experiments[0].status,'ready_for_review');
  throws(()=>lib.relatorioSemanal(s,ranked,agora,false,[{...experimento,status:'running'}]));
  throws(()=>lib.relatorioSemanal(s,ranked,agora,false,[{...experimento,objective:''}]));
  throws(()=>lib.relatorioSemanal(s,ranked,agora,false,[{...experimento,successTarget:{value:null,unit:'n',state:'defined'}}]));
  eq(lib.semanaAnalitica(new Date('2026-10-12T02:59:59Z')).endExclusive,'2026-10-05T03:00:00.000Z');
  eq(lib.semanaAnalitica(new Date('2026-10-12T03:00:00Z')).endExclusive,'2026-10-12T03:00:00.000Z');
  // A ligação assíncrona serve o MESMO objeto ao leitor e ao exportador real.
  const semanal = require('../tools/admin-local/marketing/relatorio-semanal.cjs');
  semanal._definirFonte(async()=>report);
  const leitura = await semanal.lerRelatorio();
  eq(leitura.relatorio,report);
  const csv=await semanal.exportarCsv(null,{relatorio:report});
  ok(csv.conteudo.includes(s.snapshotId));
  ok(!csv.conteudo.includes('undefined'));
  semanal._definirFonte(async()=>null);
  eq((await semanal.lerRelatorio()).status,'indisponivel');
  console.log(`admin-analytics: ${provas} provas OK`);
})().catch(e=>{console.error(e);process.exitCode=1;});
