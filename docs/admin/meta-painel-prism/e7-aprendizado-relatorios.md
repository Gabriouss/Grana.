# Contrato visual: aprendizado e relatórios (E7)

**Destino:** painel local tools/admin-local. A tela já existe em tools/admin-local/web/telas/aprendizado.js e usa #/marketing/aprendizado. Handoff para Forge/UI; Harbor agrega; Beacon define análises; Argon mantém CSV.

**Estado:** consumir o contrato Beacon E7 e7.v1, commit bd3c163. E4 em ac38cc4 continua sendo a fonte das definições métricas; esta tela não altera fórmulas ou a janela E4.

**Prancha:** [e7-aprendizado-relatorios.html](./e7-aprendizado-relatorios.html). Dados fictícios; sem ação externa.

## Encaixe no painel local

- Rota e menu existentes: #/marketing/aprendizado, no grupo Marketing depois de Resultados de marketing e antes de Acervo. API Node: GET /api/marketing/aprendizado e POST /api/marketing/aprendizado/csv.
- Preservar casca de index.html, roteador app.js e padrões de estilo.css. Reutilizar tela-cabecalho, secao, cartao, grade-cartoes, selo, estado-ausente, estado-erro, botao e tabela-rolagem.
- E7 usa semana completa: segunda 00:00 até segunda seguinte 00:00 em America/Sao_Paulo, fim exclusivo. Não substituir a janela de 30 dias do painel E4.
- Tela e CSV recebem o mesmo WeeklyReport; PDF imprime a mesma tela. Mostrar reportId, revision e snapshotId da revisão apresentada.
- Usar --paper, --paper-raised, --paper-selected, --ink, --ink-soft, --ink-faint, --rule, --rule-strong, --up, --atencao, --danger, --t-*, --s-*, --r-* e --alvo. Estado da fonte em texto além de cor; tabela densa fica em região nomeada e focável.

## Contrato de leitura

WeeklyReport e7.v1 tem reportId, revision, snapshotId, generatedAt, period, periodState, metricContractRef, metrics, sources, attribution, sample, recommendations (zero a três), omittedCandidateCount, experiments, qualityNotes e nextActions.

- Mostrar período/fuso, geração, referência E4, IDs de relatório/revisão/fotografia e se a semana é parcial.
- Fonte: cobertura, frescor, integridade, período coberto, última atualização, rejeitados/duplicados, códigos de motivo.
- Métrica: valor, unidade, estado, fontes e notas. null é "Sem valor", nunca zero. Zero só quando o contrato permite observação com cobertura completa.
- Atribuição: preservar estado, contagens conhecidas/desconhecidas e denominador se disponível. Origem desconhecida nunca vira orgânica.
- Amostra: elegíveis, observados, excluídos, desconhecidos, estado, policyId e policyState. Null permanece desconhecido; política pendente impede conclusões dependentes.
- Recomendação: exibir rank/justificativa, estado, período, amostra, métricas de evidência, fontes, estado de atribuição, hipótese, ação sugerida, sinal esperado, limitações e decisão humana. Respeitar rank Beacon sem criar score, ordenação ou critério na UI.
- actionable só quando fontes necessárias estão completas, integridade suficiente, amostra aceita por política aprovada e semântica da métrica aprovada. Fonte parcial/atrasada/indisponível, atribuição desconhecida relevante, amostra pequena ou política pendente deixam a decisão afetada inconclusiva ou bloqueada.
- Nenhuma recomendação ou experimento altera campanha, verba, consentimento, conteúdo publicado ou integração.

O WeeklyReport expõe ExperimentSummary: id, status, primaryMetricId, decision, learning e limitationCodes. A tela só pode mostrar esses campos. O tipo Experiment completo tem mais propriedades de planejamento, mas elas não vêm no resumo semanal; não inventar público, mudança, versões, guardrails, meta, custo ou prazo. Se esses detalhes forem necessários, Beacon/Harbor devem ampliar o DTO.

## Estados e exportação

Ausência de fonte mostra indisponibilidade e motivo; nenhum valor estimado. Cobertura parcial, frescor atrasado, integridade com rejeições/duplicados ou comprometida ficam junto às métricas afetadas. null permanece sem valor em tela, PDF e CSV. Atribuição desconhecida continua separada, sem distribuição ou junção de identidade.

PDF deriva do WeeklyReport apresentado. CSV usa lib/admin-relatorio-csv.ts; manter reportId/revision/snapshotId/período e o mesmo estado dos valores. Falha de exportação recebe aviso e não simula download. Exportar somente agregados e texto sanitizado, sem eventos individuais, PII, URL privada, credenciais, feedback ou identificador de pessoa.

## Handoff e achados concretos

- **Forge/UI:** preservar tela e rota local existentes, conferir visual e teclado; não criar página web ou fórmula paralela.
- **Harbor:** preservar cobertura, frescor, integridade, amostra, atribuição e IDs de revisão; não preencher ausência com zero.
- **Beacon:** mudanças em ranking ou semântica precisam de revisão do contrato, nunca de regra nova na UI.
- **Inconsistência observada na fixture:** a fonte Cakto declara coverage=partial, mas refunds/chargebacks aparece com value=0 e state=observed. Beacon/E4 só permite zero observado com cobertura completa. Não usar a combinação como exemplo válido até corrigirem ou justificarem a fixture.
- **Risco de foco em E3:** feedbacks.js desabilita Gerir enquanto abre ctx.formulario e o app.js tenta devolver foco antes de reabilitar o botão. Confirmar a volta do foco no navegador.
- QA em 16/10: a raiz do painel respondeu HTTP 200 com “Painel não pareado” e /api/health respondeu 403; sem browser pareado, visual e teclado integrados de E7 permanecem sem validação. O protótipo estático foi conferido em 320/390/768/1440, sem overflow. Leitor de tela não usado.
