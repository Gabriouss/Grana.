// Relatório semanal de TESTE (formato e7.v1). Números e textos fictícios, para ver a tela enquanto o agregador
// não existe. A tela marca "Dados de teste" sempre que usa isto; nunca é gravado nem enviado.
const PERIODO = { startInclusive: '2026-10-05T00:00:00-03:00', endExclusive: '2026-10-12T00:00:00-03:00', timezone: 'America/Sao_Paulo' };
const AMOSTRA_PEQUENA = { eligible: 6, observed: 6, excluded: 0, unknownAttribution: 0, state: 'small', policyId: 'fixture-only-min-20', policyState: 'approved' };
const AMOSTRA_DESCONHECIDA = { eligible: null, observed: 12, excluded: 0, unknownAttribution: 12, state: 'unknown', policyId: null, policyState: 'pending' };

export const RELATORIO_DE_TESTE = {
  contractVersion: 'e7.v1', reportId: 'fixture-report-001', revision: 2, snapshotId: 'fixture-origin-001', generatedAt: '2026-10-12T09:30:00-03:00',
  period: PERIODO, periodState: 'complete', metricContractRef: 'Beacon-E4',
  metrics: [
    { metricId: 'meta_ad_spend', value: null, unit: 'BRL', state: 'not_configured', sourceIds: ['meta_insights'], period: PERIODO, noteCodes: ['source_not_configured'] },
    { metricId: 'cakto_new_paid_subscriptions', value: 12, unit: 'assinaturas', state: 'partial', sourceIds: ['cakto_ledger'], period: PERIODO, noteCodes: ['ledger_completeness_unproven'] },
    { metricId: 'cakto_confirmed_gross_revenue', value: null, unit: 'BRL', state: 'unavailable', sourceIds: ['cakto_ledger'], period: PERIODO, noteCodes: ['source_unavailable'] },
    { metricId: 'cakto_refunds_chargebacks', value: 0, unit: 'BRL', state: 'observed', sourceIds: ['cakto_ledger'], period: PERIODO, noteCodes: [] },
    { metricId: 'campaign_attribution_coverage', value: null, unit: '%', state: 'definition_pending', sourceIds: [], period: PERIODO, noteCodes: [] },
  ],
  sources: [
    { sourceId: 'meta_insights', coverage: 'not_configured', freshness: 'unknown', integrity: 'unknown', coveredPeriod: null, lastUpdatedAt: null, coveragePercent: null, rejectedCount: null, duplicateCount: null, reasonCodes: ['source_not_configured'] },
    { sourceId: 'cakto_ledger', coverage: 'partial', freshness: 'delayed', integrity: 'has_duplicates', coveredPeriod: null, lastUpdatedAt: '2026-10-11T22:10:00-03:00', coveragePercent: null, rejectedCount: 0, duplicateCount: 2, reasonCodes: ['ledger_completeness_unproven'] },
  ],
  attribution: { state: 'unknown', eligibleCount: null, knownCount: 0, unknownCount: 12, coveragePercent: null, noteCodes: ['consent_link_unproven', 'count_scope_observed_only'] },
  sample: AMOSTRA_DESCONHECIDA,
  recommendations: [
    { id: 'fixture-review-attribution', snapshotId: 'fixture-origin-001', rank: 1, decisionState: 'inconclusive', period: PERIODO, sample: AMOSTRA_DESCONHECIDA,
      evidenceMetricIds: ['campaign_attribution_coverage'], sourceIds: ['cakto_ledger'], attributionState: 'unknown',
      title: 'A origem das compras observadas é desconhecida', hypothesis: 'A cobertura pode mudar após comprovar a integridade do ledger e o vínculo de consentimento.',
      suggestedAction: 'Revisar internamente a cobertura e o mapeamento permitido antes de comparar campanhas.', expectedSignal: 'Cobertura reconciliada por fonte, com desconhecidos separados.',
      priorityReason: 'A origem está inconclusiva e afeta a decisão de aquisição.', humanDecision: null, adjustmentRequestId: null, limitationCodes: ['source_partial', 'consent_link_unproven'],
      effect: 'none_until_explicit_human_decision', externalMutation: false },
    { id: 'fixture-small-sample', snapshotId: 'fixture-origin-001', rank: 2, decisionState: 'inconclusive', period: PERIODO, sample: AMOSTRA_PEQUENA,
      evidenceMetricIds: ['cakto_new_paid_subscriptions'], sourceIds: ['cakto_ledger'], attributionState: 'unknown',
      title: 'Poucas assinaturas para comparar mensagens', hypothesis: 'Uma chamada mais direta pode melhorar a compreensão da proposta.',
      suggestedAction: 'Aguardar dados suficientes ou encerrar como inconclusivo.', expectedSignal: 'Amostra acima da política aprovada.',
      priorityReason: 'Resultado dependente de comparação com amostra abaixo da política.', humanDecision: null, adjustmentRequestId: null, limitationCodes: ['sample_below_fixture_policy'],
      effect: 'none_until_explicit_human_decision', externalMutation: false },
    { id: 'fixture-info-refunds', snapshotId: 'fixture-origin-001', rank: 3, decisionState: 'informational', period: PERIODO, sample: AMOSTRA_PEQUENA,
      evidenceMetricIds: ['cakto_refunds_chargebacks'], sourceIds: ['cakto_ledger'], attributionState: 'not_applicable',
      title: 'Nenhuma reversão registrada na semana', hypothesis: 'Se a cobertura do ledger se confirmar completa, o zero pode ser um zero observado.',
      suggestedAction: 'Acompanhar na próxima semana.', expectedSignal: 'Reversões continuam separadas da receita bruta.',
      priorityReason: 'Item informativo, sem decisão associada.', humanDecision: null, adjustmentRequestId: null, limitationCodes: [],
      effect: 'none_until_explicit_human_decision', externalMutation: false },
  ],
  omittedCandidateCount: 1,
  experiments: [
    { id: 'fixture-experiment-001', status: 'draft', primaryMetricId: 'cakto_new_paid_subscriptions', decision: null, learning: null, limitationCodes: ['sample_policy_pending'] },
    { id: 'fixture-experiment-002', status: 'completed', primaryMetricId: 'cakto_new_paid_subscriptions',
      decision: { outcome: 'inconclusive', rationale: 'Amostra insuficiente para decidir entre as duas versões.', evidenceMetricIds: ['cakto_new_paid_subscriptions'], decidedAt: '2026-10-09T18:00:00-03:00' },
      learning: 'Repetir com prazo maior.', limitationCodes: [] },
  ],
  qualityNotes: ['source_not_configured', 'source_partial'],
  nextActions: ['Revisar a cobertura do ledger antes de comparar campanhas.', 'Definir a política de amostra com o responsável.'],
};
