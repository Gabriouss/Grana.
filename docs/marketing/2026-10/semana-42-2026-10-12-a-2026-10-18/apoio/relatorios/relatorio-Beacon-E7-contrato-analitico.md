# Beacon: contrato analítico E7

- **Data:** 16/10/2026
- **Responsável:** Beacon (Marketing/Growth)
- **Estado:** especificação proposta, pronta para integração com fixtures; sem dados de produção.
- **Destinatários:** Harbor (agregação), Prism (dashboard), Lumen (telas e exportações).
- **Base:** E7 do plano Compass e critérios M7 7.1–7.6.
- **Métricas:** consumir as definições existentes em [relatorio-Beacon-metricas-meta.md](relatorio-Beacon-metricas-meta.md), commit `f5e5fef`. Este documento não redefine suas fórmulas, períodos padrão, moedas ou semântica pendente.

## Limites e decisões de contrato

1. O snapshot analítico é a única entrada das recomendações, do relatório semanal e dos exportadores. Os três formatos usam a mesma versão imutável do snapshot.
2. Uma ausência ou uma cobertura incompleta produz valor `null`, nunca zero. Zero só é valor observado quando a fonte comprova cobertura integral do período, conforme E4.
3. Meta e Cakto mantêm cobertura separada. Atribuição sem vínculo aprovado é **desconhecida**, nunca orgânica. Não unir eventos com e-mail, telefone, ID de usuário, pedido ou identificador de navegador.
4. Amostra insuficiente, coleta comprometida, definição pendente ou fonte necessária indisponível deixam a recomendação **inconclusiva** ou **bloqueada**. Não se convertem em julgamento de desempenho.
5. A lista principal contém no máximo três recomendações, inclusive as inconclusivas. Não há score opaco nem promoção de candidatos sem evidência.
6. Recomendações e experimentos são registros para decisão humana. Neste escopo não alteram campanha, orçamento, consentimento, conteúdo publicado, integração, nem enviam dados ou mensagens a terceiros.
7. Um aceite explícito pode criar um pedido interno rastreável de ajuste; a peça corrigida volta para revisão. Concluir o pedido não aceita nem publica a peça.
8. Não inferir lucro a partir de gasto e receita bruta. Não inferir instalação a partir de clique ou download.

## IDs de métrica usados por E7

São aliases estáveis para ligar o esquema E7 aos nomes exibidos em E4. Não criam fórmula nem alteram semântica:

| metricId E7 | Definição referenciada em E4 |
|---|---|
| **meta_ad_spend** | Investimento em anúncios |
| **cakto_new_paid_subscriptions** | Novas assinaturas pagas |
| **cakto_confirmed_gross_revenue** | Receita confirmada bruta |
| **cakto_refunds_chargebacks** | Reembolsos e chargebacks |
| **campaign_attribution_coverage** | Cobertura de atribuição de campanha |
### Dimensões pendentes do critério M7 7.6

M7 pede comparação de origem com primeira compra, renovação, cancelamento, reembolso e retenção/continuidade. E4 fornece definições para primeira compra, reversões e cobertura de atribuição; não fixa métricas independentes para renovação, cancelamento e retenção/continuidade. Até uma definição aprovada, essas dimensões aparecem como null com estado definition_pending, sem recomendação de desempenho. Não inferir continuidade nem causalidade de campanha.

## Esquema comum

Pseudotipo versionado para o adaptador de Harbor. A propriedade metricId usa os aliases E7 acima; a descrição e a fórmula continuam sendo as definições existentes em E4.

    type CoverageState = "complete" | "partial" | "unavailable" | "not_configured";
    type FreshnessState = "current" | "delayed" | "unknown";
    type IntegrityState = "clean" | "has_rejected" | "has_duplicates" | "compromised" | "unknown";
    type AttributionState = "known" | "mixed" | "unknown" | "not_applicable";
    type DecisionState = "actionable" | "inconclusive" | "blocked" | "informational";

    type Period = {
      startInclusive: string;       // ISO-8601 com offset explícito
      endExclusive: string;         // ISO-8601 com offset explícito
      timezone: string;
    };

    type SourceQuality = {
      sourceId: string;             // ex.: "meta_insights", "cakto_ledger"
      coverage: CoverageState;
      freshness: FreshnessState;
      integrity: IntegrityState;
      coveredPeriod: Period | null;
      lastUpdatedAt: string | null;
      coveragePercent: number | null; // null se denominador/cobertura não forem conhecidos
      rejectedCount: number | null;
      duplicateCount: number | null;
      reasonCodes: string[];        // códigos sanitizados, sem conteúdo de evento
    };

    type MetricObservation = {
      metricId: string;             // definido pelo contrato E4
      value: number | null;
      unit: string;
      state: "observed" | "partial" | "unavailable" | "not_configured" | "definition_pending";
      sourceIds: string[];
      period: Period;
      noteCodes: string[];
    };

    type Sample = {
      eligible: number | null;
      observed: number | null;
      excluded: number | null;
      unknownAttribution: number | null;
      state: "adequate" | "small" | "unknown";
      policyId: string | null;
      policyState: "approved" | "pending" | "not_applicable";
    };

    type AnalyticsSnapshot = {
      contractVersion: "e7.v1";
      snapshotId: string;
      generatedAt: string;
      period: Period;
      metricContractRef: "Beacon-E4";
      sources: SourceQuality[];
      metrics: MetricObservation[];
      attribution: {
        state: AttributionState;
        eligibleCount: number | null;
        knownCount: number | null;
        unknownCount: number | null;
        coveragePercent: number | null;
        noteCodes: string[];
      };
      sample: Sample;
      qualityNotes: string[];       // códigos; texto visível traduzido na UI
    };

### Recomendação

Cada recomendação aponta para as observações que a sustentam. Campos de texto não substituem a evidência nem eliminam uma limitação.

    type Recommendation = {
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
      humanDecision: { outcome: "accept_for_draft" | "reject" | "defer"; decidedAt: string; noteCode: string | null } | null;
      adjustmentRequestId: string | null;
      limitationCodes: string[];
      effect: "none_until_explicit_human_decision";
      externalMutation: false;
    };

Regras de seleção e estado:

- O array retornado tem zero a três itens. Ordenar por integridade da evidência que possa invalidar decisões (comprometida, indisponível, parcial/atrasada), depois por oportunidade acionável aprovada. Para oportunidades, priorizar novas assinaturas pagas, depois retenção, renovação, cancelamento e reembolso; itens informativos vêm por último. Desempatar pelo ID estável. Explicar a razão do ranking em texto. Não atribuir score de impacto sem uma regra aprovada.
- Só marcar `actionable` se todas as fontes necessárias estiverem completas, a integridade for suficiente, a amostra cumprir uma política aprovada e a semântica da métrica estiver aprovada.
- Se a política mínima de amostra ainda não estiver aprovada, resultado dependente de comparação fica `inconclusive`. O sistema não inventa o limite. `policyId` e `policyState` acompanham o resultado.
- Se a fonte estiver ausente, parcial ou atrasada e for necessária à conclusão, suspender a recomendação afetada ou marcá-la `inconclusive`. Mostrar o motivo e o último horário conhecido.
- Se a origem for desconhecida ou mista, mostrar contagem e denominador quando disponíveis. Não distribuir as origens desconhecidas proporcionalmente entre campanhas.
- Candidatos descartados pela regra de limite podem ser contados como `omittedCandidateCount`, sem exibir uma segunda lista que burle o máximo de três prioridades.
- Ação é sugestão. O caminho de conversão, se implementado, é recomendação → decisão explícita do administrador → pedido interno versionado → nova versão da peça → revisão/aceite. Nenhum passo chama a Meta ou publica automaticamente.

### Experimento

Experimento é um plano e um registro de decisão. Este contrato não inicia tráfego, distribuição, publicação nem gasto.

    type Experiment = {
      id: string;
      status: "draft" | "ready_for_review" | "running" | "completed" | "inconclusive" | "cancelled";
      objective: string;
      audienceDescription: string;
      channelAndDestination: string;
      hypothesis: string;
      primaryChange: string;         // exatamente uma variável principal
      controlVersionRef: string | null;
      variantVersionRef: string | null;
      primaryMetricId: string;
      guardrailMetricIds: string[];
      plannedPeriod: Period | null;
      dueAt: string | null;
      successTarget: { value: number | null; unit: string; state: "defined" | "pending" };
      budgetCap: { amount: number | null; currency: string | null; state: "not_applicable" | "pending_authorization" };
      samplePolicyId: string | null;
      samplePolicyState: "approved" | "pending";
      decision: {
        outcome: "keep" | "discard" | "iterate" | "inconclusive";
        rationale: string;
        evidenceMetricIds: string[];
        decidedAt: string;
      } | null;
      learning: string | null;
      externalMutation: false;
    };

Validação: para passar a `ready_for_review`, exigir objetivo, público, destino, hipótese, mudança única, duas referências de versão, métrica primária aprovada, meta de sucesso, estado explícito do teto de custo, guardrails, prazo e política de amostra. Não marcar `running` sem autorização separada que defina canal e execução. Para concluir, exigir resultado ou motivo explícito de inconclusividade e decisão registrada. Campanha paga, alteração na Meta, publicação ou gasto permanecem fora deste contrato.

Exemplo sintético de experimento ainda em rascunho. A política de amostra e a meta permanecem pendentes, então não pode iniciar nem produzir conclusão:

    {
      "id": "fixture-experiment-001",
      "status": "draft",
      "objective": "Avaliar uma hipótese de mensagem em protótipo interno.",
      "audienceDescription": "Grupo voluntário de revisão, sem lista ou identificadores pessoais.",
      "channelAndDestination": "Protótipo local do relatório, sem publicação.",
      "hypothesis": "Uma chamada mais direta pode melhorar a compreensão da proposta.",
      "primaryChange": "Texto da chamada; nenhuma outra variável muda.",
      "controlVersionRef": "fixture-copy-control-v1",
      "variantVersionRef": "fixture-copy-variant-v1",
      "primaryMetricId": "cakto_new_paid_subscriptions",
      "guardrailMetricIds": ["cakto_refunds_chargebacks"],
      "plannedPeriod": {
        "startInclusive": "2026-10-19T00:00:00-03:00",
        "endExclusive": "2026-10-26T00:00:00-03:00",
        "timezone": "America/Sao_Paulo"
      },
      "dueAt": "2026-10-30T18:00:00-03:00",
      "successTarget": {"value": null, "unit": "assinaturas", "state": "pending"},
      "budgetCap": {"amount": null, "currency": null, "state": "not_applicable"},
      "samplePolicyId": null,
      "samplePolicyState": "pending",
      "decision": null,
      "learning": null,
      "externalMutation": false
    }

### Tipo do relatório semanal

    type ExperimentSummary = {
      id: string;
      status: Experiment["status"];
      primaryMetricId: string;
      decision: Experiment["decision"];
      learning: string | null;
      limitationCodes: string[];
    };

    type WeeklyReport = {
      contractVersion: "e7.v1";
      reportId: string;
      revision: number;
      snapshotId: string;
      generatedAt: string;
      period: Period;
      periodState: "complete" | "partial";
      metricContractRef: "Beacon-E4";
      metrics: MetricObservation[];
      sources: SourceQuality[];
      attribution: AnalyticsSnapshot["attribution"];
      sample: Sample;
      recommendations: Recommendation[]; // máximo 3
      omittedCandidateCount: number;
      experiments: ExperimentSummary[];
      qualityNotes: string[];
      nextActions: string[];              // ações internas, sem chamada externa
    };

    type CsvRecord = {
      reportId: string;
      revision: number;
      snapshotId: string;
      periodStart: string;
      periodEndExclusive: string;
      timezone: string;
      section: "metric" | "source" | "attribution" | "recommendation" | "experiment" | "quality";
      itemId: string | null;
      field: string;
      value: string;                      // vazio quando valueState não é observed
      valueState: "observed" | "partial" | "unavailable" | "not_configured" | "definition_pending";
      unit: string | null;
      sourceIds: string[];
      noteCodes: string[];
    };

## Relatório semanal e exportações

- Semana no fuso `America/Sao_Paulo`, iniciando segunda-feira 00:00 local e terminando na segunda seguinte 00:00, com início inclusivo e fim exclusivo. O padrão é a última semana completa. A semana corrente, se solicitada, recebe estado **parcial** e fica fora de comparação de semanas completas.
- Esta granularidade não substitui a janela E4 de 30 dias completos contra 30 anteriores. O relatório semanal agrega os mesmos IDs e semânticas de E4 para sua própria semana; não altera a janela padrão do painel.
- O relatório contém ID/revisão do snapshot, período e fuso, horário de geração, referência E4, métricas observadas/null, qualidade e cobertura por fonte, atribuição desconhecida, até três recomendações, experimentos e decisões, limitações e próximas ações internas.
- PDF, CSV e tela renderizam o mesmo objeto `WeeklyReport` e o mesmo `snapshotId`. Não recalcular fórmulas em cada exportador. Se a coleta mudar, gerar nova revisão com novo ID/horário.
- PDF mostra período, fuso, unidade/moeda, estado das fontes, definições e notas de qualidade. CSV é UTF-8, delimitado por vírgula e com escape CSV; uma linha por campo/métrica/recomendação/experimento. Campo numérico indisponível fica vazio com `value_state` explícito, nunca zero. Atribuição desconhecida e seus totais ocupam campos próprios.
- Exportar agregados e texto sanitizado somente. Excluir eventos individuais, PII, URL completa, tokens, segredos, conteúdo de feedback e identificadores pessoais. A geração do arquivo não envia, publica nem compartilha o relatório.

## Exemplos sintéticos

Todos os números abaixo são fixtures didáticas, não são dados de produção nem limiares aprovados.

### Atribuição desconhecida e fonte parcial

Trecho sintético de WeeklyReport. O exemplo omite apenas campos de envelope não relevantes à demonstração.

    {
      "contractVersion": "e7.v1",
      "snapshotId": "fixture-origin-001",
      "period": {
        "startInclusive": "2026-10-05T00:00:00-03:00",
        "endExclusive": "2026-10-12T00:00:00-03:00",
        "timezone": "America/Sao_Paulo"
      },
      "sample": {
        "eligible": null, "observed": 12, "excluded": 0,
        "unknownAttribution": 12, "state": "unknown",
        "policyId": null, "policyState": "pending"
      },
      "sources": [{
        "sourceId": "cakto_ledger", "coverage": "partial",
        "freshness": "unknown", "integrity": "unknown",
        "coveredPeriod": null, "lastUpdatedAt": null,
        "coveragePercent": null, "rejectedCount": null,
        "duplicateCount": null, "reasonCodes": ["ledger_completeness_unproven"]
      }],
      "attribution": {
        "state": "unknown", "eligibleCount": null,
        "knownCount": 0, "unknownCount": 12,
        "coveragePercent": null, "noteCodes": ["consent_link_unproven", "count_scope_observed_only"]
      },
      "recommendations": [{
        "id": "fixture-review-attribution",
        "snapshotId": "fixture-origin-001", "rank": 1,
        "decisionState": "inconclusive",
        "period": {
          "startInclusive": "2026-10-05T00:00:00-03:00",
          "endExclusive": "2026-10-12T00:00:00-03:00",
          "timezone": "America/Sao_Paulo"
        },
        "priorityReason": "A origem está inconclusiva e afeta a decisão de aquisição.",
        "sample": {
          "eligible": null, "observed": 12, "excluded": 0,
          "unknownAttribution": 12, "state": "unknown",
          "policyId": null, "policyState": "pending"
        },
        "evidenceMetricIds": ["campaign_attribution_coverage"],
        "sourceIds": ["cakto_ledger"],
        "attributionState": "unknown",
        "title": "A origem das compras observadas é desconhecida",
        "hypothesis": "A cobertura pode mudar após comprovar a integridade do ledger e o vínculo de consentimento.",
        "suggestedAction": "Revisar internamente a cobertura e o mapeamento permitido antes de comparar campanhas.",
        "expectedSignal": "Cobertura reconciliada por fonte, com desconhecidos separados.",
        "limitationCodes": ["source_partial", "consent_link_unproven"],
        "humanDecision": null, "adjustmentRequestId": null,
        "effect": "none_until_explicit_human_decision",
        "externalMutation": false
      }]
    }

Resultado esperado: o cartão explica a limitação e não recomenda redistribuir orçamento ou chamar a origem de orgânica.

Os exemplos a seguir são trechos de fixture; campos de envelope não relevantes ao caso foram omitidos.

### Amostra pequena

    {
      "id": "fixture-small-sample",
      "decisionState": "inconclusive",
      "sample": {
        "eligible": 6, "observed": 6, "excluded": 0,
        "unknownAttribution": 0, "state": "small",
        "policyId": "fixture-only-min-20",
        "policyState": "approved"
      },
      "limitationCodes": ["sample_below_fixture_policy"],
      "suggestedAction": "Aguardar dados suficientes ou encerrar como inconclusivo.",
      "externalMutation": false
    }

O limite 20 existe apenas para demonstrar a validação do fixture; não é política do produto. Sem uma política aprovada pelo responsável, marcar `policyState: pending` e manter a conclusão inconclusiva.

### Fonte ausente

    {
      "period": {
        "startInclusive": "2026-10-05T00:00:00-03:00",
        "endExclusive": "2026-10-12T00:00:00-03:00",
        "timezone": "America/Sao_Paulo"
      },
      "sources": [
        {"sourceId": "meta_insights", "coverage": "not_configured"},
        {"sourceId": "cakto_ledger", "coverage": "unavailable"}
      ],
      "metrics": [
        {"metricId": "meta_ad_spend", "value": null, "state": "not_configured"},
        {"metricId": "cakto_new_paid_subscriptions", "value": null, "state": "unavailable"}
      ],
      "recommendations": [],
      "qualityNotes": ["source_not_configured", "source_unavailable"]
    }

Não substituir a lista vazia por recomendação de desempenho. O relatório semanal ainda pode ser exportado como indisponível, preservando esses estados.

## Handoff por responsável

### Harbor: agregação

- Emitir o `AnalyticsSnapshot` versionado e sanitizado usando os IDs de métrica E4 existentes.
- Preservar cobertura, atualização, integridade, motivos de ausência, contagens de rejeição/duplicação e origem desconhecida sem expor linhas individuais.
- Gerar zero a três recomendações com `rank`, evidências e `decisionState`. Sem cobertura completa ou política aprovada, suspender a inferência dependente.
- Não chamar endpoint de escrita nem mover dados para a Meta. Usar apenas GET já previsto e fixtures.

### Prism: dashboard

- Mostrar até três prioridades, posição explicável, período, amostra/política, evidência/fonte e hipótese/ação.
- Estados visíveis e distintos: completa, parcial, indisponível, não configurada, atrasada, integridade comprometida; para origem: identificada, mista, desconhecida.
- Diferenciar ausência de zero e sinalizar inconclusivo/bloqueado junto ao motivo. Mostrar desconhecidos com contagem e denominador, quando houver.
- Não apresentar recomendação inconclusiva como ordem nem introduzir score de desempenho não definido.

### Lumen: telas e exportação

- Renderizar o mesmo `WeeklyReport` em tela, PDF e CSV, guardando o ID/revisão do snapshot em cada saída.
- Incluir estado da fonte, período/fuso, limitações, origem desconhecida e próximas ações internas em todas as saídas.
- CSV exporta vazio + estado explícito para null. PDF e CSV omitem PII/segredos e mantêm os mesmos valores da tela.
- Ações da tela podem abrir somente fluxo de revisão/rascunho. Sem enviar, publicar, gastar ou alterar configuração externa.

## Critérios de aceite E7

- [ ] Agregador, recomendador, tela, PDF e CSV reconhecem `e7.v1` e referenciam o contrato E4 sem duplicá-lo.
- [ ] Lista principal nunca excede três itens, cada um com período, amostra, evidências rastreáveis, hipótese, ação e limitações.
- [ ] Fixtures provam amostra pequena, fonte parcial/ausente, origem desconhecida, dado atrasado, duplicação/rejeição e reembolso sem apagar cobrança original.
- [ ] Fonte ausente/incompleta produz null e estado visível; zero exige cobertura completa.
- [ ] Baixa confiabilidade afeta somente as recomendações dependentes, marcadas inconclusivas/bloqueadas.
- [ ] Semana atual parcial não é comparada como completa; semana, PDF e CSV compartilham IDs, números e definições.
- [ ] Exportações não contêm PII, eventos individuais ou segredos.
- [ ] Criar ou concluir experimento/recomendação não faz escrita paga, publicação, envio a terceiro ou alteração externa.

**Verificação desta entrega:** revisão documental da ordem, do recorte Compass, dos critérios M7 e do contrato E4. Sem alteração de código, sem testes de produto, sem leitura de produção e sem chamadas a Meta/Cakto. O limite mínimo de amostra e a semântica de estorno/atribuição continuam dependentes das aprovações e evidências já apontadas no contrato E4.
