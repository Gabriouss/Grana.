const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');

function carregar(arquivo, dependencias = {}, globais = {}) {
  const exports = {};
  const module = { exports };
  const fonte = fs.readFileSync(path.join(root, arquivo), 'utf8');
  const js = ts.transpileModule(fonte, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
  }).outputText;

  vm.runInNewContext(
    js,
    {
      exports,
      module,
      require(id) {
        if (id in dependencias) return dependencias[id];
        throw new Error(`Import não simulado: ${id}`);
      },
      ...globais,
    },
    { filename: arquivo }
  );

  return module.exports;
}

const {
  COLUNAS_CSV_RELATORIO_SEMANAL,
  escaparCelulaCsv,
  protegerInjecaoFormulaCsv,
  relatorioSemanalParaCsv,
  relatorioSemanalParaRegistrosCsv,
} = carregar('lib/admin-relatorio-csv.ts');

function parsearCsvRfc4180(csv) {
  const linhas = [];
  let linhaAtual = [];
  let campoAtual = '';
  let entreAspas = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (entreAspas) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          campoAtual += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campoAtual += ch;
      }
    } else if (ch === '"') {
      entreAspas = true;
    } else if (ch === ',') {
      linhaAtual.push(campoAtual);
      campoAtual = '';
    } else if (ch === '\n') {
      linhaAtual.push(campoAtual);
      linhas.push(linhaAtual);
      linhaAtual = [];
      campoAtual = '';
    } else if (ch === '\r') {
      // ignora CR fora de aspas quando seguido de LF
    } else {
      campoAtual += ch;
    }
  }
  linhaAtual.push(campoAtual);
  linhas.push(linhaAtual);
  return linhas;
}

function criarRelatorioBase() {
  return {
    contractVersion: 'e7.v1',
    reportId: 'rep-2026-w41',
    revision: 2,
    snapshotId: 'fixture-origin-001',
    generatedAt: '2026-10-12T08:00:00-03:00',
    period: {
      startInclusive: '2026-10-05T00:00:00-03:00',
      endExclusive: '2026-10-12T00:00:00-03:00',
      timezone: 'America/Sao_Paulo',
    },
    periodState: 'complete',
    metricContractRef: 'Beacon-E4',
    metrics: [
      {
        metricId: 'meta_ad_spend',
        value: null,
        unit: 'centavos_brl',
        state: 'not_configured',
        sourceIds: ['meta_insights'],
        period: {
          startInclusive: '2026-10-05T00:00:00-03:00',
          endExclusive: '2026-10-12T00:00:00-03:00',
          timezone: 'America/Sao_Paulo',
        },
        noteCodes: ['meta_not_configured'],
      },
      {
        metricId: 'cakto_new_paid_subscriptions',
        value: 12,
        unit: 'count',
        state: 'observed',
        sourceIds: ['cakto_ledger'],
        period: {
          startInclusive: '2026-10-05T00:00:00-03:00',
          endExclusive: '2026-10-12T00:00:00-03:00',
          timezone: 'America/Sao_Paulo',
        },
        noteCodes: [],
      },
      {
        metricId: 'cakto_refunds_chargebacks',
        value: 0,
        unit: 'count',
        state: 'observed',
        sourceIds: ['cakto_ledger'],
        period: {
          startInclusive: '2026-10-05T00:00:00-03:00',
          endExclusive: '2026-10-12T00:00:00-03:00',
          timezone: 'America/Sao_Paulo',
        },
        noteCodes: ['full_coverage_verified'],
      },
      {
        metricId: 'campaign_attribution_coverage',
        value: null,
        unit: 'percent',
        state: 'unavailable',
        sourceIds: ['cakto_ledger'],
        period: {
          startInclusive: '2026-10-05T00:00:00-03:00',
          endExclusive: '2026-10-12T00:00:00-03:00',
          timezone: 'America/Sao_Paulo',
        },
        noteCodes: ['consent_link_unproven'],
      },
    ],
    sources: [
      {
        sourceId: 'cakto_ledger',
        coverage: 'partial',
        freshness: 'unknown',
        integrity: 'unknown',
        coveredPeriod: null,
        lastUpdatedAt: null,
        coveragePercent: null,
        rejectedCount: null,
        duplicateCount: 0,
        reasonCodes: ['ledger_completeness_unproven'],
      },
    ],
    attribution: {
      state: 'unknown',
      eligibleCount: null,
      knownCount: 0,
      unknownCount: 12,
      coveragePercent: null,
      noteCodes: ['consent_link_unproven', 'count_scope_observed_only'],
    },
    sample: {
      eligible: null,
      observed: 12,
      excluded: 0,
      unknownAttribution: 12,
      state: 'unknown',
      policyId: null,
      policyState: 'pending',
    },
    recommendations: [
      {
        id: 'fixture-review-attribution',
        snapshotId: 'fixture-origin-001',
        rank: 1,
        decisionState: 'inconclusive',
        period: {
          startInclusive: '2026-10-05T00:00:00-03:00',
          endExclusive: '2026-10-12T00:00:00-03:00',
          timezone: 'America/Sao_Paulo',
        },
        sample: {
          eligible: null,
          observed: 12,
          excluded: 0,
          unknownAttribution: 12,
          state: 'unknown',
          policyId: null,
          policyState: 'pending',
        },
        evidenceMetricIds: ['campaign_attribution_coverage'],
        sourceIds: ['cakto_ledger'],
        attributionState: 'unknown',
        title: 'A origem das compras, "observadas", é desconhecida\nRevisar antes de comparar',
        hypothesis: '=SUM(A1:A2) hipótese com sinal no início',
        suggestedAction: '+Revisar internamente a cobertura, sem publicar',
        expectedSignal: '-Sinal esperado com hífen inicial',
        priorityReason: '@prioridade com arroba inicial',
        humanDecision: null,
        adjustmentRequestId: null,
        limitationCodes: ['source_partial', 'consent_link_unproven'],
        effect: 'none_until_explicit_human_decision',
        externalMutation: false,
      },
    ],
    omittedCandidateCount: 0,
    experiments: [
      {
        id: 'fixture-experiment-001',
        status: 'draft',
        primaryMetricId: 'cakto_new_paid_subscriptions',
        decision: null,
        learning: null,
        limitationCodes: ['sample_policy_pending'],
      },
    ],
    qualityNotes: ['source_partial', 'consent_link_unproven'],
    nextActions: ['Conferir integridade do livro-razão, sem acionar provedor externo'],
  };
}

// 1. Cabeçalho e presença de snapshotId / revisão em cada linha
{
  const relatorio = criarRelatorioBase();
  const csv = relatorioSemanalParaCsv(relatorio);
  const matriz = parsearCsvRfc4180(csv);

  assert.deepEqual(matriz[0], [...COLUNAS_CSV_RELATORIO_SEMANAL]);
  assert.ok(matriz.length > 10);

  for (let i = 1; i < matriz.length; i++) {
    const linha = matriz[i];
    assert.equal(linha.length, COLUNAS_CSV_RELATORIO_SEMANAL.length, `Linha ${i} com colunas erradas`);
    assert.equal(linha[0], 'rep-2026-w41');
    assert.equal(linha[1], '2');
    assert.equal(linha[2], 'fixture-origin-001');
    assert.equal(linha[3], '2026-10-05T00:00:00-03:00');
    assert.equal(linha[4], '2026-10-12T00:00:00-03:00');
    assert.equal(linha[5], 'America/Sao_Paulo');
  }
}

// 2. Escape de aspas, vírgula e quebra de linha dentro do campo
{
  assert.equal(escaparCelulaCsv('texto simples'), 'texto simples');
  assert.equal(escaparCelulaCsv('com, virgula'), '"com, virgula"');
  assert.equal(escaparCelulaCsv('com "aspas" duplas'), '"com ""aspas"" duplas"');
  assert.equal(escaparCelulaCsv('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
  assert.equal(escaparCelulaCsv('linha 1\r\nlinha 2'), '"linha 1\r\nlinha 2"');

  const relatorio = criarRelatorioBase();
  const csv = relatorioSemanalParaCsv(relatorio);
  const matriz = parsearCsvRfc4180(csv);
  const linhaTitulo = matriz.find(
    (l) => l[6] === 'recommendation' && l[7] === 'fixture-review-attribution' && l[8] === 'title'
  );
  assert.ok(linhaTitulo, 'Linha de título da recomendação encontrada após parse RFC 4180');
  assert.equal(
    linhaTitulo[9],
    'A origem das compras, "observadas", é desconhecida\nRevisar antes de comparar'
  );
}

// 3. Null vira vazio + value_state explícito; zero real continua "0"
{
  const relatorio = criarRelatorioBase();
  const registros = relatorioSemanalParaRegistrosCsv(relatorio);

  const spend = registros.find((r) => r.section === 'metric' && r.itemId === 'meta_ad_spend');
  assert.ok(spend);
  assert.equal(spend.value, '');
  assert.equal(spend.valueState, 'not_configured');

  const cobCampanha = registros.find(
    (r) => r.section === 'metric' && r.itemId === 'campaign_attribution_coverage'
  );
  assert.ok(cobCampanha);
  assert.equal(cobCampanha.value, '');
  assert.equal(cobCampanha.valueState, 'unavailable');

  const reembolsos = registros.find(
    (r) => r.section === 'metric' && r.itemId === 'cakto_refunds_chargebacks'
  );
  assert.ok(reembolsos);
  assert.equal(reembolsos.value, '0');
  assert.equal(reembolsos.valueState, 'observed');

  // Mesmo se o chamador passar value=0 mas state='unavailable', o valor exportado deve ser vazio
  const relatorioInconsistente = criarRelatorioBase();
  relatorioInconsistente.metrics = [
    {
      metricId: 'meta_ad_spend',
      value: 0,
      unit: 'centavos_brl',
      state: 'unavailable',
      sourceIds: ['meta_insights'],
      period: relatorioInconsistente.period,
      noteCodes: [],
    },
  ];
  const regInconsistente = relatorioSemanalParaRegistrosCsv(relatorioInconsistente).find(
    (r) => r.section === 'metric' && r.itemId === 'meta_ad_spend'
  );
  assert.equal(regInconsistente.value, '');
  assert.equal(regInconsistente.valueState, 'unavailable');
}

// 4. Atribuição desconhecida em campos próprios (nunca reclassificada como orgânica)
{
  const relatorio = criarRelatorioBase();
  const registros = relatorioSemanalParaRegistrosCsv(relatorio);
  const attr = registros.filter((r) => r.section === 'attribution');

  const estado = attr.find((r) => r.field === 'state');
  const elegiveis = attr.find((r) => r.field === 'eligible_count');
  const conhecidos = attr.find((r) => r.field === 'known_count');
  const desconhecidos = attr.find((r) => r.field === 'unknown_count');
  const cobertura = attr.find((r) => r.field === 'coverage_percent');

  assert.equal(estado.value, 'unknown');
  assert.equal(estado.valueState, 'observed');
  assert.equal(elegiveis.value, '');
  assert.equal(elegiveis.valueState, 'unavailable');
  assert.equal(conhecidos.value, '0');
  assert.equal(conhecidos.valueState, 'observed');
  assert.equal(desconhecidos.value, '12');
  assert.equal(desconhecidos.valueState, 'observed');
  assert.equal(cobertura.value, '');
  assert.equal(cobertura.valueState, 'unavailable');
  assert.ok(!JSON.stringify(attr).toLowerCase().includes('organic'));
}

// 5. Proteção contra injeção de fórmula em planilha (=, +, -, @, tab/espaço antes de fórmula)
{
  assert.equal(protegerInjecaoFormulaCsv('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(protegerInjecaoFormulaCsv('+cmd|"/c calc"!A0'), "'+cmd|\"/c calc\"!A0");
  assert.equal(protegerInjecaoFormulaCsv('-2+3'), "'-2+3");
  assert.equal(protegerInjecaoFormulaCsv('@SUM(1,2)'), "'@SUM(1,2)");
  assert.equal(protegerInjecaoFormulaCsv('  =1+1'), "'  =1+1");
  assert.equal(protegerInjecaoFormulaCsv('\t=1+1'), "'\t=1+1");

  const relatorio = criarRelatorioBase();
  const registros = relatorioSemanalParaRegistrosCsv(relatorio);
  const rec = registros.filter(
    (r) => r.section === 'recommendation' && r.itemId === 'fixture-review-attribution'
  );
  assert.equal(rec.find((r) => r.field === 'hypothesis').value, "'=SUM(A1:A2) hipótese com sinal no início");
  assert.equal(
    rec.find((r) => r.field === 'suggested_action').value,
    "'+Revisar internamente a cobertura, sem publicar"
  );
  assert.equal(
    rec.find((r) => r.field === 'expected_signal').value,
    "'-Sinal esperado com hífen inicial"
  );
  assert.equal(
    rec.find((r) => r.field === 'priority_reason').value,
    "'@prioridade com arroba inicial"
  );
}

// 6. Relatório "indisponível" (fontes ausentes/não configuradas, recomendações vazias) ainda exporta
{
  const relatorioIndisponivel = {
    period: {
      startInclusive: '2026-10-05T00:00:00-03:00',
      endExclusive: '2026-10-12T00:00:00-03:00',
      timezone: 'America/Sao_Paulo',
    },
    sources: [
      { sourceId: 'meta_insights', coverage: 'not_configured' },
      { sourceId: 'cakto_ledger', coverage: 'unavailable' },
    ],
    metrics: [
      { metricId: 'meta_ad_spend', value: null, state: 'not_configured' },
      { metricId: 'cakto_new_paid_subscriptions', value: null, state: 'unavailable' },
    ],
    recommendations: [],
    qualityNotes: ['source_not_configured', 'source_unavailable'],
  };

  const csv = relatorioSemanalParaCsv(relatorioIndisponivel);
  const matriz = parsearCsvRfc4180(csv);
  assert.ok(matriz.length >= 6);

  const linhaMeta = matriz.find((l) => l[6] === 'metric' && l[7] === 'meta_ad_spend');
  assert.ok(linhaMeta);
  assert.equal(linhaMeta[9], '');
  assert.equal(linhaMeta[10], 'not_configured');

  const linhaCakto = matriz.find(
    (l) => l[6] === 'metric' && l[7] === 'cakto_new_paid_subscriptions'
  );
  assert.ok(linhaCakto);
  assert.equal(linhaCakto[9], '');
  assert.equal(linhaCakto[10], 'unavailable');
}

// 7. Determinismo (mesma entrada = mesma saída) e omissão de PII, URL completa, token e campos extras
{
  const relatorio1 = criarRelatorioBase();
  relatorio1.extraPii = 'cliente@exemplo.com';
  relatorio1.secretToken = 'Bearer segredo-super-confidencial-123456';
  relatorio1.nextActions = [
    'Revisar página https://grana.app/checkout?email=pessoa@dominio.com&token=sbp_1234567890abcdef com Bearer tokenSecreto123',
  ];

  const relatorio2 = JSON.parse(JSON.stringify(relatorio1));
  const saida1 = relatorioSemanalParaCsv(relatorio1);
  const saida2 = relatorioSemanalParaCsv(relatorio2);

  assert.equal(saida1, saida2, 'Mesma entrada produz exatamente a mesma saída');
  assert.ok(!saida1.includes('cliente@exemplo.com'), 'Campo fora do contrato não é exportado');
  assert.ok(!saida1.includes('pessoa@dominio.com'), 'E-mail em texto livre é sanitizado');
  assert.ok(!saida1.includes('https://grana.app'), 'URL completa é omitida');
  assert.ok(!saida1.includes('sbp_1234567890abcdef'), 'Token é omitido');
  assert.ok(!saida1.includes('tokenSecreto123'), 'Bearer token é omitido');
}

console.log('OK');
