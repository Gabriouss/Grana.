// Resultados de marketing (E4): gasto Meta, novas assinaturas, receita bruta e reversões, cada uma com
// fonte, intervalo e cobertura. Só leitura: nada aqui cria campanha, mexe em orçamento ou publica.
// Especificação: docs/admin/meta-painel-prism/metricas-meta.md. Contrato: admin-meta do Harbor.
//
// Regra de valor: null é "não disponível", nunca zero. Zero só aparece quando o servidor o manda.
// Totais Cakto seguem null/Parcial até existir prova de completude do ledger.
// O servidor local devolve o DTO; o navegador não fala com Meta, Cakto nem Supabase.

import { SIMULADO } from '../simulado.js';

const ESTADOS = {
  'nao-configurado': ['alerta', 'Não configurado'],
  completo: ['ok', 'Completo'],
  parcial: ['alerta', 'Parcial'],
  indisponivel: ['neutro', 'Indisponível'],
};
export const seloDoEstado = (e) => ESTADOS[e] || ['neutro', 'Indisponível'];

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const dm = (iso) => { const [, m, d] = String(iso).split('-').map(Number); return `${d} ${MESES[m - 1]}`; };
// Rótulo civil inclusivo ("16 set. a 15 out. 2026") a partir do intervalo do contrato.
export function rotuloIntervalo(p) {
  if (!p || !p.desde || !p.ateInclusivo) return 'intervalo indisponível';
  const ano = String(p.ateInclusivo).slice(0, 4);
  return p.desde === p.ateInclusivo ? `${dm(p.desde)} ${ano}` : `${dm(p.desde)} a ${dm(p.ateInclusivo)} ${ano}`;
}

const reais = (centavos) => (typeof centavos === 'number' && Number.isFinite(centavos)
  ? (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);
const inteiro = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR') : null);

// null vira texto, nunca zero. `base` null ou <= 0 não gera percentual.
export function textoVariacao(atual, base, pctServidor) {
  if (typeof pctServidor === 'number' && Number.isFinite(pctServidor)) return `${pctServidor > 0 ? '+' : ''}${pctServidor.toFixed(1).replace('.', ',')}% sobre o período anterior`;
  if (atual === null || atual === undefined || base === null || base === undefined) return 'sem base de comparação';
  if (base <= 0) return 'sem base de comparação';
  return null;
}

// As quatro medidas da página. Cada uma diz de onde vem e por que pode estar indisponível.
export function montarMedidas(d) {
  const meta = d.meta || {};
  const cakto = d.cakto || {};
  const caktoAnt = cakto.anterior || {};
  const atualizada = (iso) => (iso ? `Atualizada: ${new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Sem atualização');
  const [, rotMeta] = seloDoEstado(meta.estado);
  const [, rotCakto] = seloDoEstado(cakto.estado);
  const ant = meta.anterior || {};
  return [
    { id: 'investimento', titulo: 'Investimento em anúncios', fonte: 'Meta Ads', intervalo: rotuloIntervalo(d.periodos && d.periodos.atual),
      valor: reais(meta.investimentoCentavos),
      anterior: reais(ant.investimentoCentavos), variacao: textoVariacao(meta.investimentoCentavos, ant.investimentoCentavos, meta.variacaoPercentual),
      indisponivel: meta.estado === 'nao-configurado' ? 'Meta: não configurado' : `Meta: ${rotMeta.toLowerCase()}`,
      rodape: atualizada(meta.atualizadoEm) },
    { id: 'assinaturas', titulo: 'Novas assinaturas pagas', fonte: 'Cakto', intervalo: rotuloIntervalo(d.periodos && d.periodos.atual),
      valor: inteiro(cakto.novasAssinaturas), anterior: inteiro(caktoAnt.novasAssinaturas),
      variacao: textoVariacao(cakto.novasAssinaturas, caktoAnt.novasAssinaturas, null),
      indisponivel: `Cakto: ${rotCakto.toLowerCase()}, sem prova de completude`, rodape: atualizada(cakto.atualizadoEm || null),
      nota: 'Primeiras cobranças aprovadas, contadas por assinatura (não por pessoa). Estornadas ficam de fora.' },
    { id: 'receita', titulo: 'Receita bruta confirmada', fonte: 'Cakto', intervalo: rotuloIntervalo(d.periodos && d.periodos.atual),
      valor: reais(cakto.receitaConfirmadaCentavos), anterior: reais(caktoAnt.receitaConfirmadaCentavos),
      variacao: textoVariacao(cakto.receitaConfirmadaCentavos, caktoAnt.receitaConfirmadaCentavos, null),
      indisponivel: `Cakto: ${rotCakto.toLowerCase()}, sem prova de completude`, rodape: atualizada(cakto.atualizadoEm || null),
      nota: 'Antes de reversões. Não é lucro nem repasse líquido.' },
    { id: 'reversoes', titulo: 'Reembolsos e chargebacks', fonte: 'Cakto', intervalo: rotuloIntervalo(d.periodos && d.periodos.atual),
      valor: reais(cakto.reembolsosCentavos), anterior: reais(caktoAnt.reembolsosCentavos), variacao: null,
      indisponivel: `Cakto: ${rotCakto.toLowerCase()}, sem prova de completude`, rodape: atualizada(cakto.atualizadoEm || null),
      nota: 'Reversões no intervalo em que ocorreram, também quando a venda foi antes.' },
  ];
}

const NS = 'http://www.w3.org/2000/svg';
// A largura do desenho acompanha a do contêiner (texto do eixo sempre em 12 px reais, nunca encolhido).
function grafico(h, serie, largura) {
  const W = Math.max(240, Math.round(largura)), H = 220, ML = 32, MR = 24, MT = 12, MB = 28;
  const todos = [...serie.atual, ...serie.anterior].filter((v) => typeof v === 'number');
  const max = Math.max(1, ...todos);
  const x = (i) => ML + (i * (W - ML - MR)) / Math.max(1, serie.rotulos.length - 1);
  const y = (v) => MT + (H - MT - MB) * (1 - v / max);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'resultados-grafico');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${serie.titulo}. Linha sólida: período atual. Linha tracejada: período anterior. Os valores estão na tabela abaixo.`);
  const add = (tag, attrs, texto) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (texto !== undefined) e.textContent = texto; svg.appendChild(e); return e; };
  for (let g = 0; g <= 4; g++) { const v = Math.round((max * g) / 4); add('line', { x1: ML, x2: W - MR, y1: y(v), y2: y(v), class: 'resultados-grade' }); add('text', { x: ML - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'resultados-eixo' }, String(v)); }
  serie.rotulos.forEach((r, i) => add('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'resultados-eixo' }, r));
  for (const [chave, classe] of [['anterior', 'resultados-linha-anterior'], ['atual', 'resultados-linha-atual']]) {
    // lacuna é lacuna: valor nulo quebra a linha, nunca vira ponto zero
    let d = '', abrir = true;
    serie[chave].forEach((v, i) => { if (typeof v !== 'number') { abrir = true; return; } d += `${abrir ? 'M' : 'L'}${x(i)} ${y(v)} `; abrir = false; });
    if (d) add('path', { d: d.trim(), class: classe, fill: 'none' });
  }
  serie.atual.forEach((v, i) => { if (typeof v === 'number') add('circle', { cx: x(i), cy: y(v), r: 4, class: 'resultados-ponto' }); });
  return svg;
}

export async function montar(raiz, ctx) {
  const { h } = ctx;
  let demo = false;
  let ultima = null;
  let incluirHoje = false;

  const cab = ctx.cabecalho(raiz, 'Resultados de marketing', 'Investimento, assinantes e receita confirmada, com origem e cobertura visíveis.', []);
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);

  async function carregar() {
    ctx.estado.carregando(corpo, 'Lendo os resultados…');
    let d;
    try {
      d = demo ? (await SIMULADO.ler('/api/marketing/resultados')).dados
        : (await ctx.api(`/api/marketing/resultados${incluirHoje ? '?incluirHoje=1' : ''}`)).dados;
    } catch (err) {
      if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => carregar());
      return;
    }
    if (ctx.obsoleta()) return;
    desenhar(d || {});
  }

  function desenhar(d) {
    ultima = d;
    while (corpo.firstChild) corpo.removeChild(corpo.firstChild);
    const emDemo = d.demonstracao === true;
    const meta = d.meta || {};
    const [seloMeta, rotuloMeta] = seloDoEstado(meta.estado);

    const acoes = cab.querySelector('.tela-acoes') || cab.appendChild(h('div', { class: 'tela-acoes' }));
    acoes.replaceChildren(...[
      emDemo ? h('span', { class: 'selo selo-alerta', texto: 'Dados de demonstração' }) : null,
      h('button', { class: 'botao', type: 'button', texto: demo ? 'Voltar aos dados reais' : 'Ver exemplo com dados fictícios', onclick: () => { demo = !demo; void carregar(); } })].filter(Boolean));

    if (emDemo) corpo.appendChild(ctx.alerta('atencao', 'Prévia com dados fictícios. Valores e carimbos são exemplos locais, sem leitura de provedores. Em produção, totais Cakto e atribuição ficam indisponíveis enquanto a cobertura e o vínculo de consentimento não forem comprovados.'));

    // período, comparação e fuso (os limites vêm do contrato: início inclusivo, fim exclusivo)
    const p = d.periodos || {};
    corpo.appendChild(h('section', { class: 'resultados-periodo', 'aria-label': 'Período da leitura' },
      h('dl', { class: 'resultados-periodo-lista' },
        h('div', {}, h('dt', { texto: 'Período' }), h('dd', { texto: `30 dias completos · ${rotuloIntervalo(p.atual)}` })),
        h('div', {}, h('dt', { texto: 'Comparação' }), h('dd', { texto: `30 dias anteriores · ${rotuloIntervalo(p.anterior)}` })),
        h('div', {}, h('dt', { texto: 'Fuso' }), h('dd', { texto: `${p.fuso || 'America/Sao_Paulo'} · confirmar o fuso da conta Meta` }))),
      h('label', { class: 'resultados-hoje' },
        h('input', { type: 'checkbox', checked: incluirHoje, disabled: demo, onchange: (e) => { incluirHoje = e.target.checked; void carregar(); } }),
        h('span', { texto: 'Incluir hoje (parcial, fora da comparação)' })),
      d.incluirHoje && p.hoje ? h('p', { class: 'campo-ajuda', texto: `Hoje, ${rotuloIntervalo(p.hoje)}: série parcial, separada do comparativo.` }) : null));

    // conta Meta, separada de cobertura Cakto e atribuição
    corpo.appendChild(h('section', { class: `resultados-conta${meta.estado === 'nao-configurado' || meta.estado === 'indisponivel' ? ' resultados-conta-atencao' : ''}`, 'aria-labelledby': 'resultados-conta-titulo' },
      h('div', { class: 'resultados-conta-topo' }, h('h2', { id: 'resultados-conta-titulo', class: 'secao-titulo', texto: 'Conta Meta' }), ctx.selo(seloMeta, rotuloMeta)),
      h('p', { texto: meta.estado === 'nao-configurado'
        ? `Conexão de leitura aguardando configuração${Array.isArray(meta.faltantes) && meta.faltantes.length ? `. Falta: ${meta.faltantes.join(', ')}` : ''}. Nenhuma solicitação foi enviada à Meta.`
        : meta.estado === 'indisponivel'
          ? `Leitura indisponível${meta.motivo === 'leitura-nao-ligada-ao-painel-local' ? ': o painel local ainda não está ligado à leitura da Meta' : ''}. Nenhum valor foi estimado.`
          : meta.estado === 'parcial' ? 'Leitura parcial: soma parcial não aparece como total.' : 'Leitura completa dos dois períodos.' }),
      h('a', { class: 'botao', href: '#resultados-confiabilidade', 'data-ancora': '1', texto: 'Ver fontes e pendências' })));

    // as quatro medidas
    const grade = h('div', { class: 'grade-cartoes resultados-medidas', role: 'group', 'aria-label': 'Medidas do período' });
    for (const m of montarMedidas(d)) {
      grade.appendChild(h('article', { class: 'cartao resultados-medida' },
        h('div', { class: 'cartao-topo' }, h('h2', { class: 'cartao-titulo', texto: m.titulo }), h('span', { class: 'resultados-fonte', texto: `${m.fonte}${emDemo ? ' · fixture' : ''}` })),
        m.valor === null
          ? h('p', { class: 'cartao-valor resultados-sem-valor', texto: 'Não disponível' })
          : h('p', { class: 'cartao-valor', texto: m.valor }),
        h('p', { class: 'cartao-detalhe', texto: m.intervalo }),
        m.valor === null ? h('p', { class: 'cartao-detalhe', texto: m.indisponivel }) : null,
        m.valor !== null && (m.anterior !== null || m.variacao)
          ? h('p', { class: 'cartao-detalhe', texto: `Anterior: ${m.anterior === null ? 'sem base de comparação' : m.anterior}${m.variacao && m.anterior !== null ? ` · ${m.variacao}` : ''}` }) : null,
        m.nota ? h('p', { class: 'cartao-detalhe', texto: m.nota }) : null,
        h('p', { class: 'cartao-detalhe', texto: m.rodape })));
    }
    corpo.appendChild(grade);

    // série (só quando o servidor manda a série; o contrato de hoje entrega totais) e tabela equivalente
    if (d.serie && Array.isArray(d.serie.rotulos)) {
      const s = d.serie;
      corpo.appendChild(h('section', { class: 'cartao resultados-serie', 'aria-labelledby': 'resultados-serie-titulo' },
        h('h2', { id: 'resultados-serie-titulo', class: 'cartao-titulo', texto: s.titulo }),
        h('p', { class: 'cartao-detalhe', texto: s.descricao }),
        h('p', { class: 'resultados-legenda' },
          h('span', { class: 'resultados-legenda-atual', texto: rotuloIntervalo(p.atual) }), h('span', { class: 'resultados-legenda-anterior', texto: rotuloIntervalo(p.anterior) })),
        grafico(h, s, Math.min(corpo.clientWidth - 40, 760)),
        h('details', { class: 'secao-recolhida' }, h('summary', { class: 'secao-recolhida-titulo', texto: 'Ver os pontos do gráfico em tabela' }),
          ctx.tabela([
            { titulo: 'Bloco', valor: (l) => l.rotulo }, { titulo: rotuloIntervalo(p.atual), valor: (l) => (l.atual === null ? 'lacuna' : String(l.atual)) },
            { titulo: rotuloIntervalo(p.anterior), valor: (l) => (l.anterior === null ? 'lacuna' : String(l.anterior)) },
          ], s.rotulos.map((rotulo, i) => ({ rotulo, atual: s.atual[i] ?? null, anterior: s.anterior[i] ?? null })), { legenda: `${s.titulo}, valores por bloco` }))));
    } else {
      corpo.appendChild(h('p', { class: 'campo-ajuda', texto: 'A série diária ainda não vem do servidor: o contrato atual entrega totais por período. Quando a série existir, ela aparece aqui com tabela equivalente.' }));
    }

    // confiabilidade por fonte
    const [seloCakto, rotCakto] = seloDoEstado((d.cakto || {}).estado);
    const medicao = d.medicaoPropria || {};
    const [seloAtr, rotAtr] = seloDoEstado(medicao.estado === 'nao-configurado' ? 'indisponivel' : medicao.estado);
    const fontes = [
      { fonte: 'Meta Ads', estado: [seloMeta, rotuloMeta], texto: meta.estado === 'nao-configurado' ? 'Conexão ainda não configurada. Sem leitura real.' : meta.estado === 'indisponivel' ? 'Sem leitura. Nenhum valor estimado.' : 'Insights e campanhas, só leitura.' },
      { fonte: 'Cakto', estado: [seloCakto, rotCakto], texto: 'O ledger não comprova completude por período. Totais reais permanecem indisponíveis.' },
      { fonte: 'Atribuição', estado: [seloAtr, rotAtr], texto: 'Não há vínculo comprovado com consentimento. Campanhas não são inferidas: origem fica desconhecida, nunca "orgânica".' },
    ];
    corpo.appendChild(h('section', { id: 'resultados-confiabilidade', class: 'secao', tabindex: '-1', 'aria-labelledby': 'resultados-conf-titulo' },
      h('h2', { id: 'resultados-conf-titulo', class: 'secao-titulo', texto: 'Confiabilidade desta leitura' }),
      h('p', { class: 'campo-ajuda', texto: 'O estado de cada origem acompanha os números.' }),
      ctx.tabela([
        { titulo: 'Origem', valor: (l) => l.fonte }, { titulo: 'Estado', valor: (l) => ctx.selo(l.estado[0], l.estado[1]) }, { titulo: 'O que isso quer dizer', valor: (l) => l.texto },
      ], fontes, { legenda: 'Fontes e cobertura' }),
      h('ul', { class: 'resultados-passos' },
        h('li', {}, h('strong', { texto: 'Configurar a leitura da Meta' }), h('span', { texto: 'A integração fica visível enquanto a conta não estiver pronta.' })),
        h('li', {}, h('strong', { texto: 'Conferir a cobertura da Cakto' }), h('span', { texto: 'Amostra incompleta não representa o total do período.' })),
        h('li', {}, h('strong', { texto: 'Decidir a regra de estorno' }), h('span', { texto: 'Sem ela, não há métrica líquida de assinaturas nem custo por assinatura.' })))));
  }

  // O gráfico é desenhado na largura de agora; ao redimensionar, redesenha (sem nova leitura).
  let largura = corpo.clientWidth; let t = null;
  const aoRedimensionar = () => { clearTimeout(t); t = setTimeout(() => { if (ultima && Math.abs(corpo.clientWidth - largura) > 8) { largura = corpo.clientWidth; desenhar(ultima); } }, 150); };
  window.addEventListener('resize', aoRedimensionar);
  await carregar();
  return () => { clearTimeout(t); window.removeEventListener('resize', aoRedimensionar); };
}
