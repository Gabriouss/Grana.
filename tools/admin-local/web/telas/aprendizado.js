// Aprendizado e relatórios (Entrega 7): relatório semanal (contrato e7.v1), até três recomendações e experimentos.
// Especificação: docs/admin/meta-painel-prism/e7-aprendizado-relatorios.md. Contrato: relatorio-Beacon-E7-contrato-analitico.md.
//
// Só leitura e exportação. Recomendação e experimento são hipóteses para o autor decidir: nada aqui publica, gasta,
// muda campanha ou envia dado a terceiro. Tela, CSV e PDF mostram o MESMO objeto (mesmo snapshotId e revisão).
// Regra de valor: null é "sem valor", nunca zero; zero só aparece quando o relatório o traz como observado.
// Sem fonte real, o servidor responde "indisponível" e a tela diz isso; os dados de teste são um botão explícito.

import { RELATORIO_DE_TESTE } from './_relatorio-fixture.js';

const FONTES = { meta_insights: 'Meta Ads (insights)', cakto_ledger: 'Cakto (livro de cobrança)' };
const METRICAS = {
  meta_ad_spend: 'Investimento em anúncios',
  cakto_new_paid_subscriptions: 'Novas assinaturas pagas',
  cakto_confirmed_gross_revenue: 'Receita bruta confirmada',
  cakto_refunds_chargebacks: 'Reembolsos e chargebacks',
  campaign_attribution_coverage: 'Cobertura de atribuição de campanha',
};
const VALOR = { observed: ['ok', 'Observado'], partial: ['alerta', 'Parcial'], unavailable: ['neutro', 'Indisponível'], not_configured: ['alerta', 'Não configurado'], definition_pending: ['neutro', 'Aguardando definição'] };
const COBERTURA = { complete: ['ok', 'Completa'], partial: ['alerta', 'Parcial'], unavailable: ['neutro', 'Indisponível'], not_configured: ['alerta', 'Não configurada'] };
const FRESCOR = { current: 'Atualizada', delayed: 'Atrasada', unknown: 'Atualização desconhecida' };
const INTEGRIDADE = { clean: 'Íntegra', has_rejected: 'Com rejeitados', has_duplicates: 'Com duplicados', compromised: 'Comprometida', unknown: 'Integridade desconhecida' };
const ATRIBUICAO = { known: 'Origem identificada', mixed: 'Origem mista', unknown: 'Origem desconhecida', not_applicable: 'Origem não se aplica' };
const DECISAO = { actionable: ['ok', 'Pronta para revisão'], inconclusive: ['alerta', 'Inconclusiva, ação suspensa'], blocked: ['erro', 'Bloqueada'], informational: ['neutro', 'Informativa'] };
const AMOSTRA = { adequate: 'Amostra adequada', small: 'Amostra pequena', unknown: 'Amostra desconhecida' };
const POLITICA = { approved: 'política aprovada', pending: 'política de amostra pendente', not_applicable: 'sem política' };
const EXPERIMENTO = { draft: 'Rascunho', ready_for_review: 'Pronto para revisão', running: 'Em andamento', completed: 'Concluído', inconclusive: 'Inconclusivo', cancelled: 'Cancelado' };
const DESFECHO = { keep: 'Manter', discard: 'Descartar', iterate: 'Iterar', inconclusive: 'Inconclusivo' };
const CODIGOS = {
  source_not_configured: 'Fonte não configurada.',
  source_unavailable: 'Fonte indisponível.',
  source_partial: 'Fonte com cobertura parcial.',
  ledger_completeness_unproven: 'A completude do livro de cobrança ainda não foi comprovada.',
  consent_link_unproven: 'O vínculo com o consentimento ainda não foi comprovado.',
  count_scope_observed_only: 'A contagem cobre só o que foi observado.',
  sample_below_fixture_policy: 'Amostra abaixo da política de teste.',
  sample_policy_pending: 'A política de amostra está pendente.',
};
const texto = (codigo) => CODIGOS[codigo] || `Código sem tradução: ${codigo}`;
const par = (tabela, k, padrao) => tabela[k] || padrao;
const nomeFonte = (id) => FONTES[id] || id;
const nomeMetrica = (id) => METRICAS[id] || id;
const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR') : null);

const dataHora = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'data indisponível'; };
const dia = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' }) : 'data indisponível'; };
// Fim exclusivo vira "até o dia anterior" para a pessoa; o contrato guarda o instante exato.
export function rotuloPeriodo(p) {
  if (!p) return 'período indisponível';
  const fim = new Date(new Date(p.endExclusive).getTime() - 1);
  return `${dia(p.startInclusive)} a ${dia(fim.toISOString())} (${p.timezone})`;
}

export function valorDaMetrica(m) {
  const n = num(m.value);
  if (n === null) return 'Sem valor';
  return `${n}${m.unit ? ` ${m.unit}` : ''}`;
}

export function amostraTexto(s) {
  if (!s) return 'Amostra não informada';
  const partes = [par(AMOSTRA, s.state, AMOSTRA.unknown)];
  if (s.observed !== null && s.observed !== undefined) partes.push(`${num(s.observed)} observado${s.observed === 1 ? '' : 's'}`);
  if (s.eligible !== null && s.eligible !== undefined) partes.push(`de ${num(s.eligible)} elegíveis`);
  else partes.push('elegíveis desconhecidos');
  if (s.unknownAttribution) partes.push(`${num(s.unknownAttribution)} com origem desconhecida`);
  partes.push(par(POLITICA, s.policyState, POLITICA.pending));
  return partes.join(', ');
}

export async function montar(raiz, ctx) {
  const { h } = ctx;
  let teste = false;
  let relatorio = null;
  const corpo = h('div', { class: 'tela-corpo aprendizado' });
  const recibo = h('p', { class: 'so-leitor', role: 'status', 'aria-live': 'polite' });

  ctx.cabecalho(raiz, 'Aprendizado e relatórios', 'Relatório semanal, recomendações e experimentos. São hipóteses para você decidir: nada aqui publica, gasta ou muda campanha.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => carregar() }),
  ]);
  raiz.appendChild(corpo);
  raiz.appendChild(recibo);

  async function carregar() {
    if (teste) { relatorio = RELATORIO_DE_TESTE; desenhar(); return; }
    ctx.estado.carregando(corpo, 'Lendo o relatório semanal…');
    let d;
    try { d = (await ctx.api('/api/marketing/aprendizado')).dados; }
    catch (err) { if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => carregar()); return; }
    if (ctx.obsoleta()) return;
    relatorio = d && d.relatorio ? d.relatorio : null;
    if (!relatorio) { indisponivel((d && d.motivo) || 'O relatório semanal não está disponível.'); return; }
    desenhar();
  }

  function indisponivel(motivo) {
    corpo.replaceChildren(
      h('div', { class: 'estado-ausente' },
        h('p', { texto: 'Relatório semanal indisponível' }),
        h('p', { class: 'texto-fraco', texto: motivo }),
        h('p', { class: 'texto-fraco', texto: 'Indisponível não é zero: nenhuma métrica foi calculada.' }),
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Ver com dados de teste', onclick: () => { teste = true; carregar(); } })));
  }

  function selo(tabela, chave) { const [nivel, rotulo] = tabela[chave] || ['neutro', String(chave)]; return ctx.selo(nivel, rotulo); }

  function cartaoRecomendacao(r) {
    return h('article', { class: 'cartao aprendizado-recomendacao', 'aria-label': `Recomendação ${r.rank}: ${r.title}` },
      h('div', { class: 'aprendizado-linha' }, h('strong', { texto: `${r.rank}. ${r.title}` }), selo(DECISAO, r.decisionState)),
      h('p', { class: 'texto-fraco', texto: `${rotuloPeriodo(r.period)} · ${par(ATRIBUICAO, r.attributionState, ATRIBUICAO.unknown)}` }),
      h('dl', { class: 'aprendizado-fatos' },
        h('dt', { texto: 'Amostra' }), h('dd', { texto: amostraTexto(r.sample) }),
        h('dt', { texto: 'Evidência e fonte' }), h('dd', { texto: `${(r.evidenceMetricIds || []).map(nomeMetrica).join(', ') || 'sem métrica citada'} · ${(r.sourceIds || []).map(nomeFonte).join(', ') || 'sem fonte citada'}` }),
        h('dt', { texto: 'Hipótese' }), h('dd', { texto: r.hypothesis }),
        h('dt', { texto: 'Ação sugerida' }), h('dd', { texto: r.suggestedAction }),
        h('dt', { texto: 'Sinal esperado' }), h('dd', { texto: r.expectedSignal }),
        h('dt', { texto: 'Por que nesta posição' }), h('dd', { texto: r.priorityReason })),
      (r.limitationCodes || []).length ? h('ul', { class: 'aprendizado-limites', 'aria-label': 'Limitações' }, r.limitationCodes.map((c) => h('li', { texto: texto(c) }))) : null,
      h('p', { class: 'texto-fraco', texto: r.humanDecision ? `Decisão registrada em ${dataHora(r.humanDecision.decidedAt)}.` : 'Sem decisão registrada. Nenhum efeito acontece sem decisão explícita sua.' }));
  }

  function desenhar() {
    const r = relatorio;
    const partes = [];
    if (teste) partes.push(ctx.alerta('atencao', 'Dados de teste: números e textos fictícios para ver a tela. Não são resultado de campanha.'));
    if (r.periodState === 'partial') partes.push(ctx.alerta('atencao', 'Semana parcial: não compare com semanas completas.'));
    partes.push(h('div', { class: 'aprendizado-cabecalho' },
      h('p', { texto: `Semana de ${rotuloPeriodo(r.period)}` }),
      h('p', { class: 'texto-fraco', texto: `Relatório ${r.reportId}, revisão ${r.revision} · fotografia ${r.snapshotId} · gerado em ${dataHora(r.generatedAt)} · definições ${r.metricContractRef}` }),
      h('div', { class: 'aprendizado-acoes' },
        h('button', { class: 'botao botao-primario', type: 'button', texto: 'Exportar CSV', onclick: (e) => exportar(e.currentTarget) }),
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Salvar como PDF', onclick: imprimir }),
        teste ? h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Sair dos dados de teste', onclick: () => { teste = false; carregar(); } }) : null)));

    partes.push(ctx.secao('Fontes e cobertura', ctx.tabela([
      { titulo: 'Fonte', valor: (s) => nomeFonte(s.sourceId) },
      { titulo: 'Cobertura', valor: (s) => selo(COBERTURA, s.coverage) },
      { titulo: 'Atualização', valor: (s) => `${par(FRESCOR, s.freshness, FRESCOR.unknown)}${s.lastUpdatedAt ? `, ${dataHora(s.lastUpdatedAt)}` : ''}` },
      { titulo: 'Integridade', valor: (s) => `${par(INTEGRIDADE, s.integrity, INTEGRIDADE.unknown)}${s.duplicateCount ? `, ${num(s.duplicateCount)} duplicados` : ''}${s.rejectedCount ? `, ${num(s.rejectedCount)} rejeitados` : ''}` },
      { titulo: 'Motivos', valor: (s) => (s.reasonCodes || []).map(texto).join(' ') || 'sem ressalva' },
    ], r.sources || [], { legenda: 'Qualidade de cada fonte no período' })));

    partes.push(ctx.secao('Métricas da semana', ctx.tabela([
      { titulo: 'Métrica', valor: (m) => nomeMetrica(m.metricId) },
      { titulo: 'Valor', valor: (m) => valorDaMetrica(m), classe: 'num' },
      { titulo: 'Estado', valor: (m) => selo(VALOR, m.state) },
      { titulo: 'Fonte', valor: (m) => (m.sourceIds || []).map(nomeFonte).join(', ') || 'sem fonte' },
      { titulo: 'Notas', valor: (m) => (m.noteCodes || []).map(texto).join(' ') || 'sem nota' },
    ], r.metrics || [], { legenda: 'Métricas com estado explícito; sem valor não é zero' }),
    h('p', { class: 'texto-fraco', texto: 'Receita é bruta, antes das reversões, e não é lucro. Gasto e receita não viram retorno nesta tela.' })));

    const a = r.attribution;
    if (a) {
      partes.push(ctx.secao('Origem das compras', h('p', { texto: `${par(ATRIBUICAO, a.state, ATRIBUICAO.unknown)}. Identificadas: ${num(a.knownCount) ?? 'desconhecido'}, desconhecidas: ${num(a.unknownCount) ?? 'desconhecido'}, elegíveis: ${num(a.eligibleCount) ?? 'desconhecido'}.` }),
        h('p', { class: 'texto-fraco', texto: `${(a.noteCodes || []).map(texto).join(' ')} Origem desconhecida nunca é tratada como orgânica.` })));
    }

    const recs = (r.recommendations || []).slice(0, 3);
    partes.push(ctx.secao('Recomendações', recs.length
      ? h('div', { class: 'aprendizado-recomendacoes' }, recs.map(cartaoRecomendacao))
      : h('p', { texto: 'Nenhuma recomendação nesta semana. Sem evidência suficiente, a lista fica vazia em vez de inventar uma.' }),
    r.omittedCandidateCount ? h('p', { class: 'texto-fraco', texto: `${num(r.omittedCandidateCount)} candidata${r.omittedCandidateCount === 1 ? '' : 's'} ficou${r.omittedCandidateCount === 1 ? '' : 'ram'} de fora pelo limite de três.` }) : null));

    partes.push(ctx.secao('Experimentos', (r.experiments || []).length ? ctx.tabela([
      { titulo: 'Experimento', valor: (x) => x.id },
      { titulo: 'Estado', valor: (x) => par(EXPERIMENTO, x.status, x.status) },
      { titulo: 'Métrica principal', valor: (x) => nomeMetrica(x.primaryMetricId) },
      { titulo: 'Decisão', valor: (x) => (x.decision ? `${par(DESFECHO, x.decision.outcome, x.decision.outcome)}: ${x.decision.rationale}` : 'Sem decisão') },
      { titulo: 'Aprendizado', valor: (x) => x.learning || 'ainda não registrado' },
      { titulo: 'Limitações', valor: (x) => (x.limitationCodes || []).map(texto).join(' ') || 'sem ressalva' },
    ], r.experiments, { legenda: 'Experimentos da semana: um plano e uma decisão, sem tráfego nem gasto' }) : h('p', { texto: 'Nenhum experimento nesta semana.' })));

    const notas = r.qualityNotes || [];
    if (notas.length) partes.push(ctx.secao('Limitações da leitura', h('ul', {}, notas.map((c) => h('li', { texto: texto(c) })))));
    const proximas = r.nextActions || [];
    if (proximas.length) partes.push(ctx.secao('Próximas ações internas', h('ul', {}, proximas.map((t) => h('li', { texto: t })))));
    corpo.replaceChildren(...partes);
  }

  async function exportar(botao) {
    if (botao.disabled || ctx.obsoleta()) return;
    botao.disabled = true;
    try {
      const r = await ctx.acao('/api/marketing/aprendizado/csv', { relatorio });
      const d = r.dados || r;
      if (typeof d.conteudo !== 'string' || typeof d.nome !== 'string') throw Object.assign(new Error('formato'), { codigo: 'csv-formato' });
      // BOM para o Excel abrir acentos; o conteúdo continua UTF-8 puro.
      const arquivo = new Blob(['﻿', d.conteudo], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(arquivo);
      const a = h('a', { href: url, download: d.nome });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      recibo.textContent = `CSV gerado: ${d.nome}.`;
      ctx.aviso(`CSV gerado: ${d.nome}.`, 'ok');
    } catch (err) {
      console.warn('[aprendizado-csv]', err.codigo || 'falha');
      // Falha não simula download: o recibo diz que nada foi baixado.
      recibo.textContent = 'O CSV não foi gerado. Nada foi baixado.';
      if (!ctx.obsoleta()) ctx.aviso('O CSV não foi gerado. Nada foi baixado.', 'erro');
    } finally { if (!ctx.obsoleta()) botao.disabled = false; }
  }

  function imprimir() {
    // O PDF vem do diálogo de impressão do navegador: é a mesma tela, então os números não divergem.
    document.body.classList.add('imprimindo-relatorio');
    const fim = () => { document.body.classList.remove('imprimindo-relatorio'); window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    recibo.textContent = 'Abrindo a impressão. Escolha "Salvar como PDF" no destino.';
    window.print();
  }

  await carregar();
}
