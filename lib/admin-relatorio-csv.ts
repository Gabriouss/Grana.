export type CoverageState = 'complete' | 'partial' | 'unavailable' | 'not_configured';
export type FreshnessState = 'current' | 'delayed' | 'unknown';
export type IntegrityState = 'clean' | 'has_rejected' | 'has_duplicates' | 'compromised' | 'unknown';
export type AttributionState = 'known' | 'mixed' | 'unknown' | 'not_applicable';
export type DecisionState = 'actionable' | 'inconclusive' | 'blocked' | 'informational';
export type ValueState =
  | 'observed'
  | 'partial'
  | 'unavailable'
  | 'not_configured'
  | 'definition_pending';

export type Period = {
  startInclusive: string;
  endExclusive: string;
  timezone: string;
};

export type SourceQuality = {
  sourceId: string;
  coverage: CoverageState;
  freshness?: FreshnessState;
  integrity?: IntegrityState;
  coveredPeriod?: Period | null;
  lastUpdatedAt?: string | null;
  coveragePercent?: number | null;
  rejectedCount?: number | null;
  duplicateCount?: number | null;
  reasonCodes?: string[];
};

export type MetricObservation = {
  metricId: string;
  value: number | null;
  unit?: string;
  state: ValueState;
  sourceIds?: string[];
  period?: Period;
  noteCodes?: string[];
};

export type Sample = {
  eligible: number | null;
  observed: number | null;
  excluded: number | null;
  unknownAttribution: number | null;
  state: 'adequate' | 'small' | 'unknown';
  policyId: string | null;
  policyState: 'approved' | 'pending' | 'not_applicable';
};

export type AttributionSummary = {
  state: AttributionState;
  eligibleCount: number | null;
  knownCount: number | null;
  unknownCount: number | null;
  coveragePercent: number | null;
  noteCodes: string[];
};

export type Recommendation = {
  id: string;
  snapshotId: string;
  rank: 1 | 2 | 3;
  decisionState: DecisionState;
  period: Period;
  sample: Sample;
  evidenceMetricIds: string[];
  sourceIds: string[];
  attributionState: AttributionState;
  title: string;
  hypothesis: string;
  suggestedAction: string;
  expectedSignal: string;
  priorityReason: string;
  humanDecision: {
    outcome: 'accept_for_draft' | 'reject' | 'defer';
    decidedAt: string;
    noteCode: string | null;
  } | null;
  adjustmentRequestId: string | null;
  limitationCodes: string[];
  effect: 'none_until_explicit_human_decision';
  externalMutation: false;
};

export type ExperimentDecision = {
  outcome: 'keep' | 'discard' | 'iterate' | 'inconclusive';
  rationale: string;
  evidenceMetricIds: string[];
  decidedAt: string;
};

export type ExperimentSummary = {
  id: string;
  status: 'draft' | 'ready_for_review' | 'running' | 'completed' | 'inconclusive' | 'cancelled';
  primaryMetricId: string;
  decision: ExperimentDecision | null;
  learning: string | null;
  limitationCodes?: string[];
};

export type WeeklyReport = {
  contractVersion: 'e7.v1';
  reportId: string;
  revision: number;
  snapshotId: string;
  generatedAt: string;
  period: Period;
  periodState: 'complete' | 'partial';
  metricContractRef: 'Beacon-E4';
  metrics: MetricObservation[];
  sources: SourceQuality[];
  attribution: AttributionSummary;
  sample: Sample;
  recommendations: Recommendation[];
  omittedCandidateCount: number;
  experiments: ExperimentSummary[];
  qualityNotes: string[];
  nextActions: string[];
};

export type WeeklyReportInput = {
  contractVersion?: 'e7.v1';
  reportId?: string;
  revision?: number;
  snapshotId?: string;
  generatedAt?: string;
  period: Period;
  periodState?: 'complete' | 'partial';
  metricContractRef?: 'Beacon-E4';
  metrics?: MetricObservation[];
  sources?: SourceQuality[];
  attribution?: AttributionSummary | null;
  sample?: Sample | null;
  recommendations?: Recommendation[];
  omittedCandidateCount?: number | null;
  experiments?: ExperimentSummary[];
  qualityNotes?: string[];
  nextActions?: string[];
};

export type CsvSection =
  | 'metric'
  | 'source'
  | 'attribution'
  | 'recommendation'
  | 'experiment'
  | 'quality';

export type CsvRecord = {
  reportId: string;
  revision: number;
  snapshotId: string;
  periodStart: string;
  periodEndExclusive: string;
  timezone: string;
  section: CsvSection;
  itemId: string | null;
  field: string;
  value: string;
  valueState: ValueState;
  unit: string | null;
  sourceIds: string[];
  noteCodes: string[];
};

export const COLUNAS_CSV_RELATORIO_SEMANAL = [
  'reportId',
  'revision',
  'snapshotId',
  'periodStart',
  'periodEndExclusive',
  'timezone',
  'section',
  'itemId',
  'field',
  'value',
  'value_state',
  'unit',
  'sourceIds',
  'noteCodes',
] as const;

const PADRAO_URL_COMPLETA = /\b(?:https?|ftp|file|s3|ws|wss):\/\/[^\s,;)"']+/gi;
const PADRAO_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PADRAO_BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi;
const PADRAO_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const PADRAO_TOKEN = /\b(?:sbp_|sk_live_|sk_test_|pk_live_|pk_test_|ghp_|gho_|EAA[A-Za-z0-9])[A-Za-z0-9_-]{8,}\b/g;
const PADRAO_INJECAO_FORMULA = /^(?:[=+\-@]|[\t\r]|[\s]*[=+\-@])/;

function sanitizarTextoSeguranca(bruto: string): string {
  return bruto
    .replace(PADRAO_URL_COMPLETA, '[url_omitida]')
    .replace(PADRAO_BEARER, '[segredo_omitido]')
    .replace(PADRAO_JWT, '[segredo_omitido]')
    .replace(PADRAO_TOKEN, '[segredo_omitido]')
    .replace(PADRAO_EMAIL, '[pii_omitido]');
}

export function protegerInjecaoFormulaCsv(texto: string): string {
  if (texto.length === 0) return '';
  if (PADRAO_INJECAO_FORMULA.test(texto)) {
    return `'${texto}`;
  }
  return texto;
}

function limparTexto(valor: string | null | undefined): string {
  if (typeof valor !== 'string' || valor.length === 0) return '';
  return protegerInjecaoFormulaCsv(sanitizarTextoSeguranca(valor));
}

function limparListaCodigos(lista: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(lista)) return [];
  const resultado: string[] = [];
  for (const item of lista) {
    if (typeof item === 'string' && item.trim().length > 0) {
      resultado.push(sanitizarTextoSeguranca(item.trim()));
    }
  }
  return resultado;
}

export function escaparCelulaCsv(valor: string): string {
  if (valor.length === 0) return '';
  if (/[",\r\n]/.test(valor) || /^\s|\s$/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

function formatarNumeroObservado(
  valor: number | null | undefined,
  estado: ValueState = 'observed',
  estadoQuandoNulo: ValueState = 'unavailable'
): { value: string; valueState: ValueState } {
  if (estado !== 'observed') {
    return { value: '', valueState: estado };
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return { value: '', valueState: estadoQuandoNulo };
  }
  return {
    value: Object.is(valor, -0) ? '0' : String(valor),
    valueState: 'observed',
  };
}

function formatarTextoObservado(
  valor: string | null | undefined,
  estadoQuandoVazio: ValueState = 'unavailable'
): { value: string; valueState: ValueState } {
  if (typeof valor !== 'string' || valor.length === 0) {
    return { value: '', valueState: estadoQuandoVazio };
  }
  return {
    value: limparTexto(valor),
    valueState: 'observed',
  };
}

function estadoFallbackDeCobertura(cobertura: CoverageState | undefined): ValueState {
  if (cobertura === 'not_configured') return 'not_configured';
  if (cobertura === 'partial') return 'partial';
  return 'unavailable';
}

export function relatorioSemanalParaRegistrosCsv(relatorio: WeeklyReportInput): CsvRecord[] {
  if (!relatorio || typeof relatorio !== 'object') {
    throw new Error('Relatório semanal inválido para exportação CSV.');
  }
  if (relatorio.contractVersion !== undefined && relatorio.contractVersion !== 'e7.v1') {
    throw new Error(`Versão de contrato incompatível: ${String(relatorio.contractVersion)}`);
  }
  if (!relatorio.period || typeof relatorio.period !== 'object') {
    throw new Error('Período obrigatório ausente no relatório semanal.');
  }

  const reportId = limparTexto(relatorio.reportId ?? 'sem-id');
  const revision =
    typeof relatorio.revision === 'number' && Number.isFinite(relatorio.revision)
      ? Math.trunc(relatorio.revision)
      : 1;
  const snapshotId = limparTexto(relatorio.snapshotId ?? 'sem-snapshot');
  const periodStart = limparTexto(relatorio.period.startInclusive ?? '');
  const periodEndExclusive = limparTexto(relatorio.period.endExclusive ?? '');
  const timezone = limparTexto(relatorio.period.timezone ?? '');
  const qualityNotes = limparListaCodigos(relatorio.qualityNotes);

  const registros: CsvRecord[] = [];

  const adicionar = (
    parcial: Omit<
      CsvRecord,
      'reportId' | 'revision' | 'snapshotId' | 'periodStart' | 'periodEndExclusive' | 'timezone'
    > & {
      periodStart?: string;
      periodEndExclusive?: string;
      timezone?: string;
    }
  ) => {
    const valorFinal = parcial.valueState === 'observed' ? parcial.value : '';
    registros.push({
      reportId,
      revision,
      snapshotId,
      periodStart: parcial.periodStart ?? periodStart,
      periodEndExclusive: parcial.periodEndExclusive ?? periodEndExclusive,
      timezone: parcial.timezone ?? timezone,
      section: parcial.section,
      itemId: parcial.itemId !== null ? limparTexto(parcial.itemId) : null,
      field: limparTexto(parcial.field),
      value: valorFinal,
      valueState: parcial.valueState,
      unit: parcial.unit !== null ? limparTexto(parcial.unit) : null,
      sourceIds: limparListaCodigos(parcial.sourceIds),
      noteCodes: limparListaCodigos(parcial.noteCodes),
    });
  };

  // 1. Seção quality (metadados do snapshot, amostra, notas de qualidade e próximas ações internas)
  adicionar({
    section: 'quality',
    itemId: null,
    field: 'contract_version',
    value: 'e7.v1',
    valueState: 'observed',
    unit: null,
    sourceIds: [],
    noteCodes: qualityNotes,
  });

  adicionar({
    section: 'quality',
    itemId: null,
    field: 'metric_contract_ref',
    value: limparTexto(relatorio.metricContractRef ?? 'Beacon-E4'),
    valueState: 'observed',
    unit: null,
    sourceIds: [],
    noteCodes: [],
  });

  const geradoEm = formatarTextoObservado(relatorio.generatedAt, 'unavailable');
  adicionar({
    section: 'quality',
    itemId: null,
    field: 'generated_at',
    value: geradoEm.value,
    valueState: geradoEm.valueState,
    unit: null,
    sourceIds: [],
    noteCodes: [],
  });

  const estadoPeriodo = formatarTextoObservado(relatorio.periodState, 'unavailable');
  adicionar({
    section: 'quality',
    itemId: null,
    field: 'period_state',
    value: estadoPeriodo.value,
    valueState: estadoPeriodo.valueState,
    unit: null,
    sourceIds: [],
    noteCodes: [],
  });

  const candidatosOmitidos = formatarNumeroObservado(
    relatorio.omittedCandidateCount,
    'observed',
    'unavailable'
  );
  adicionar({
    section: 'quality',
    itemId: null,
    field: 'omitted_candidate_count',
    value: candidatosOmitidos.value,
    valueState: candidatosOmitidos.valueState,
    unit: 'count',
    sourceIds: [],
    noteCodes: [],
  });

  if (relatorio.sample) {
    const sample = relatorio.sample;
    adicionar({
      section: 'quality',
      itemId: 'sample',
      field: 'sample.state',
      value: limparTexto(sample.state),
      valueState: 'observed',
      unit: null,
      sourceIds: [],
      noteCodes: [],
    });

    const camposAmostra: Array<[string, number | null | undefined]> = [
      ['sample.eligible', sample.eligible],
      ['sample.observed', sample.observed],
      ['sample.excluded', sample.excluded],
      ['sample.unknown_attribution', sample.unknownAttribution],
    ];
    for (const [campo, numero] of camposAmostra) {
      const formatado = formatarNumeroObservado(numero, 'observed', 'unavailable');
      adicionar({
        section: 'quality',
        itemId: 'sample',
        field: campo,
        value: formatado.value,
        valueState: formatado.valueState,
        unit: 'count',
        sourceIds: [],
        noteCodes: [],
      });
    }

    const estadoPoliticaNula: ValueState =
      sample.policyState === 'pending' ? 'definition_pending' : 'unavailable';
    const policyId = formatarTextoObservado(sample.policyId, estadoPoliticaNula);
    adicionar({
      section: 'quality',
      itemId: 'sample',
      field: 'sample.policy_id',
      value: policyId.value,
      valueState: policyId.valueState,
      unit: null,
      sourceIds: [],
      noteCodes: [],
    });

    adicionar({
      section: 'quality',
      itemId: 'sample',
      field: 'sample.policy_state',
      value: limparTexto(sample.policyState),
      valueState: 'observed',
      unit: null,
      sourceIds: [],
      noteCodes: [],
    });
  }

  adicionar({
    section: 'quality',
    itemId: null,
    field: 'quality_notes',
    value: limparTexto(qualityNotes.join(';')),
    valueState: 'observed',
    unit: null,
    sourceIds: [],
    noteCodes: qualityNotes,
  });

  const acoes = Array.isArray(relatorio.nextActions) ? relatorio.nextActions : [];
  for (let i = 0; i < acoes.length; i++) {
    const acao = formatarTextoObservado(acoes[i], 'unavailable');
    adicionar({
      section: 'quality',
      itemId: `next_action_${i + 1}`,
      field: 'next_action',
      value: acao.value,
      valueState: acao.valueState,
      unit: null,
      sourceIds: [],
      noteCodes: [],
    });
  }

  // 2. Seção source (qualidade e cobertura por fonte)
  const fontes = Array.isArray(relatorio.sources) ? relatorio.sources : [];
  for (const fonte of fontes) {
    const sourceId = fonte.sourceId;
    const fallback = estadoFallbackDeCobertura(fonte.coverage);
    const reasonCodes = fonte.reasonCodes ?? [];

    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'coverage',
      value: limparTexto(fonte.coverage),
      valueState: 'observed',
      unit: null,
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });

    const freshness = formatarTextoObservado(fonte.freshness, fallback);
    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'freshness',
      value: freshness.value,
      valueState: freshness.valueState,
      unit: null,
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });

    const integrity = formatarTextoObservado(fonte.integrity, fallback);
    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'integrity',
      value: integrity.value,
      valueState: integrity.valueState,
      unit: null,
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });

    const lastUpdated = formatarTextoObservado(fonte.lastUpdatedAt, fallback);
    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'last_updated_at',
      value: lastUpdated.value,
      valueState: lastUpdated.valueState,
      unit: null,
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });

    const cobPerc = formatarNumeroObservado(fonte.coveragePercent, 'observed', fallback);
    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'coverage_percent',
      value: cobPerc.value,
      valueState: cobPerc.valueState,
      unit: 'percent',
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });

    const rejeitados = formatarNumeroObservado(fonte.rejectedCount, 'observed', fallback);
    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'rejected_count',
      value: rejeitados.value,
      valueState: rejeitados.valueState,
      unit: 'count',
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });

    const duplicados = formatarNumeroObservado(fonte.duplicateCount, 'observed', fallback);
    adicionar({
      section: 'source',
      itemId: sourceId,
      field: 'duplicate_count',
      value: duplicados.value,
      valueState: duplicados.valueState,
      unit: 'count',
      sourceIds: [sourceId],
      noteCodes: reasonCodes,
    });
  }

  // 3. Seção metric (uma linha por métrica observada ou indisponível)
  const metricas = Array.isArray(relatorio.metrics) ? relatorio.metrics : [];
  for (const metrica of metricas) {
    const estadoMetrica: ValueState = metrica.state ?? 'unavailable';
    const formatado = formatarNumeroObservado(metrica.value, estadoMetrica, 'unavailable');
    adicionar({
      periodStart: metrica.period?.startInclusive
        ? limparTexto(metrica.period.startInclusive)
        : periodStart,
      periodEndExclusive: metrica.period?.endExclusive
        ? limparTexto(metrica.period.endExclusive)
        : periodEndExclusive,
      timezone: metrica.period?.timezone ? limparTexto(metrica.period.timezone) : timezone,
      section: 'metric',
      itemId: metrica.metricId,
      field: 'value',
      value: formatado.value,
      valueState: formatado.valueState,
      unit: metrica.unit ?? null,
      sourceIds: metrica.sourceIds ?? [],
      noteCodes: metrica.noteCodes ?? [],
    });
  }

  // 4. Seção attribution (atribuição desconhecida e seus totais em campos próprios)
  if (relatorio.attribution) {
    const attr = relatorio.attribution;
    const notes = attr.noteCodes ?? [];

    adicionar({
      section: 'attribution',
      itemId: 'attribution',
      field: 'state',
      value: limparTexto(attr.state),
      valueState: 'observed',
      unit: null,
      sourceIds: [],
      noteCodes: notes,
    });

    const elegiveis = formatarNumeroObservado(attr.eligibleCount, 'observed', 'unavailable');
    adicionar({
      section: 'attribution',
      itemId: 'attribution',
      field: 'eligible_count',
      value: elegiveis.value,
      valueState: elegiveis.valueState,
      unit: 'count',
      sourceIds: [],
      noteCodes: notes,
    });

    const conhecidos = formatarNumeroObservado(attr.knownCount, 'observed', 'unavailable');
    adicionar({
      section: 'attribution',
      itemId: 'attribution',
      field: 'known_count',
      value: conhecidos.value,
      valueState: conhecidos.valueState,
      unit: 'count',
      sourceIds: [],
      noteCodes: notes,
    });

    const desconhecidos = formatarNumeroObservado(attr.unknownCount, 'observed', 'unavailable');
    adicionar({
      section: 'attribution',
      itemId: 'attribution',
      field: 'unknown_count',
      value: desconhecidos.value,
      valueState: desconhecidos.valueState,
      unit: 'count',
      sourceIds: [],
      noteCodes: notes,
    });

    const cobAtrib = formatarNumeroObservado(attr.coveragePercent, 'observed', 'unavailable');
    adicionar({
      section: 'attribution',
      itemId: 'attribution',
      field: 'coverage_percent',
      value: cobAtrib.value,
      valueState: cobAtrib.valueState,
      unit: 'percent',
      sourceIds: [],
      noteCodes: notes,
    });
  }

  // 5. Seção recommendation (máximo de 3 recomendações pela regra 5 do contrato)
  const recomendacoes = Array.isArray(relatorio.recommendations)
    ? relatorio.recommendations.slice(0, 3)
    : [];
  for (const rec of recomendacoes) {
    const recPeriodStart = rec.period?.startInclusive
      ? limparTexto(rec.period.startInclusive)
      : periodStart;
    const recPeriodEnd = rec.period?.endExclusive
      ? limparTexto(rec.period.endExclusive)
      : periodEndExclusive;
    const recTimezone = rec.period?.timezone ? limparTexto(rec.period.timezone) : timezone;
    const recSources = rec.sourceIds ?? [];
    const recNotes = rec.limitationCodes ?? [];

    const adicionarRec = (
      field: string,
      value: string,
      valueState: ValueState,
      unit: string | null = null
    ) => {
      adicionar({
        periodStart: recPeriodStart,
        periodEndExclusive: recPeriodEnd,
        timezone: recTimezone,
        section: 'recommendation',
        itemId: rec.id,
        field,
        value,
        valueState,
        unit,
        sourceIds: recSources,
        noteCodes: recNotes,
      });
    };

    const rankFmt = formatarNumeroObservado(rec.rank, 'observed', 'unavailable');
    adicionarRec('rank', rankFmt.value, rankFmt.valueState, 'rank');
    adicionarRec('decision_state', limparTexto(rec.decisionState), 'observed');
    adicionarRec('attribution_state', limparTexto(rec.attributionState), 'observed');
    adicionarRec('title', limparTexto(rec.title), 'observed');
    adicionarRec('hypothesis', limparTexto(rec.hypothesis), 'observed');
    adicionarRec('suggested_action', limparTexto(rec.suggestedAction), 'observed');
    adicionarRec('expected_signal', limparTexto(rec.expectedSignal), 'observed');
    adicionarRec('priority_reason', limparTexto(rec.priorityReason), 'observed');
    adicionarRec(
      'evidence_metric_ids',
      limparTexto(limparListaCodigos(rec.evidenceMetricIds).join(';')),
      'observed'
    );

    if (rec.sample) {
      adicionarRec('sample.state', limparTexto(rec.sample.state), 'observed');
      const recSampleCampos: Array<[string, number | null | undefined]> = [
        ['sample.eligible', rec.sample.eligible],
        ['sample.observed', rec.sample.observed],
        ['sample.excluded', rec.sample.excluded],
        ['sample.unknown_attribution', rec.sample.unknownAttribution],
      ];
      for (const [campo, valorNum] of recSampleCampos) {
        const fmt = formatarNumeroObservado(valorNum, 'observed', 'unavailable');
        adicionarRec(campo, fmt.value, fmt.valueState, 'count');
      }
      const estadoPolRec: ValueState =
        rec.sample.policyState === 'pending' ? 'definition_pending' : 'unavailable';
      const polId = formatarTextoObservado(rec.sample.policyId, estadoPolRec);
      adicionarRec('sample.policy_id', polId.value, polId.valueState);
      adicionarRec('sample.policy_state', limparTexto(rec.sample.policyState), 'observed');
    }

    const humanOutcome = formatarTextoObservado(rec.humanDecision?.outcome ?? null, 'unavailable');
    adicionarRec('human_decision', humanOutcome.value, humanOutcome.valueState);

    const adjId = formatarTextoObservado(rec.adjustmentRequestId, 'unavailable');
    adicionarRec('adjustment_request_id', adjId.value, adjId.valueState);
  }

  // 6. Seção experiment (experimentos e decisões)
  const experimentos = Array.isArray(relatorio.experiments) ? relatorio.experiments : [];
  for (const exp of experimentos) {
    const expNotes = exp.limitationCodes ?? [];

    const adicionarExp = (
      field: string,
      value: string,
      valueState: ValueState,
      unit: string | null = null
    ) => {
      adicionar({
        section: 'experiment',
        itemId: exp.id,
        field,
        value,
        valueState,
        unit,
        sourceIds: [],
        noteCodes: expNotes,
      });
    };

    adicionarExp('status', limparTexto(exp.status), 'observed');
    adicionarExp('primary_metric_id', limparTexto(exp.primaryMetricId), 'observed');

    const outcome = formatarTextoObservado(exp.decision?.outcome ?? null, 'unavailable');
    adicionarExp('decision.outcome', outcome.value, outcome.valueState);

    const rationale = formatarTextoObservado(exp.decision?.rationale ?? null, 'unavailable');
    adicionarExp('decision.rationale', rationale.value, rationale.valueState);

    const decidedAt = formatarTextoObservado(exp.decision?.decidedAt ?? null, 'unavailable');
    adicionarExp('decision.decided_at', decidedAt.value, decidedAt.valueState);

    const learning = formatarTextoObservado(exp.learning, 'unavailable');
    adicionarExp('learning', learning.value, learning.valueState);
  }

  return registros;
}

export function relatorioSemanalParaCsv(relatorio: WeeklyReportInput): string {
  const registros = relatorioSemanalParaRegistrosCsv(relatorio);
  const linhas: string[] = [COLUNAS_CSV_RELATORIO_SEMANAL.join(',')];

  for (const reg of registros) {
    const celulas = [
      escaparCelulaCsv(reg.reportId),
      escaparCelulaCsv(String(reg.revision)),
      escaparCelulaCsv(reg.snapshotId),
      escaparCelulaCsv(reg.periodStart),
      escaparCelulaCsv(reg.periodEndExclusive),
      escaparCelulaCsv(reg.timezone),
      escaparCelulaCsv(reg.section),
      escaparCelulaCsv(reg.itemId ?? ''),
      escaparCelulaCsv(reg.field),
      escaparCelulaCsv(reg.value),
      escaparCelulaCsv(reg.valueState),
      escaparCelulaCsv(reg.unit ?? ''),
      escaparCelulaCsv(reg.sourceIds.join(';')),
      escaparCelulaCsv(reg.noteCodes.join(';')),
    ];
    linhas.push(celulas.join(','));
  }

  return linhas.join('\n');
}
