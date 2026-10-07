// Calendário de publicações: mês em grade (desktop) e agenda em lista (estreito; o CSS escolhe qual mostrar).
// Só peça aprovada recebe data. Aprovar não inventa data: aprovado sem data fica na coluna própria.
// Arrastar da coluna para o dia abre o mesmo formulário do botão "Escolher data".

import { CANAIS, rotuloCanal } from './_pecas.js';

const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export async function montar(raiz, ctx) {
  const { h } = ctx;
  const hoje = new Date();
  const mes = /^\d{4}-\d{2}$/.test(ctx.params.mes || '') ? ctx.params.mes : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const [ano, m] = mes.split('-').map(Number);
  const irPara = (delta) => {
    const d = new Date(ano, m - 1 + delta, 1);
    ctx.navegar(`#/marketing/calendario?mes=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  ctx.cabecalho(raiz, 'Calendário', 'Cada peça aprovada vai para o dia em que deve ser publicada. Marcar data não publica nada.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Mês anterior', onclick: () => irPara(-1) }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Hoje', onclick: () => ctx.navegar('#/marketing/calendario') }),
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Próximo mês', onclick: () => irPara(1) }),
  ]);
  const corpo = h('div', { class: 'tela-corpo' });
  raiz.appendChild(corpo);
  ctx.estado.carregando(corpo, 'Lendo o calendário…');

  let d;
  try {
    d = (await ctx.api(`/api/marketing/calendario?mes=${mes}`)).dados || {};
  } catch (err) {
    if (!ctx.obsoleta()) ctx.estado.erro(corpo, err, () => ctx.recarregar());
    return;
  }
  if (ctx.obsoleta()) return;
  while (corpo.firstChild) corpo.removeChild(corpo.firstChild);

  const itens = (d.itens || []).map((i) => ({ ...i, peca: i.peca || { id: i.id, versao: i.versao, titulo: i.titulo, tipo: i.tipo } }));
  const semData = d.aprovadosSemData || d.semData || [];
  const canais = (d.canais && d.canais.length ? d.canais : CANAIS.map((c) => c.valor));

  for (const a of d.avisos || []) corpo.appendChild(ctx.alerta('info', a));
  if (d.diaD) corpo.appendChild(ctx.alerta('info', `Dia D declarado: ${ctx.formatar.data(d.diaD)}.`));

  const planejar = (peca, dataInicial) => escolherData(ctx, peca, dataInicial, canais);

  // --- grade do mês
  const titulo = h('h2', { class: 'secao-titulo', texto: `${MESES[m - 1]} de ${ano}` });
  const grade = h('div', { class: 'calendario', role: 'grid', 'aria-label': `Calendário de ${MESES[m - 1]} de ${ano}` });
  grade.appendChild(h('div', { class: 'cal-cabecalho', role: 'row' }, DIAS_SEMANA.map((x) => h('span', { class: 'cal-dia-semana', role: 'columnheader', texto: x }))));
  const primeiro = new Date(ano, m - 1, 1);
  const inicio = new Date(primeiro);
  inicio.setDate(1 - ((primeiro.getDay() + 6) % 7)); // semana começa na segunda
  const hojeIso = ctx.formatar.isoLocal(hoje);
  const porDia = new Map();
  for (const i of itens) { if (!porDia.has(i.data)) porDia.set(i.data, []); porDia.get(i.data).push(i); }

  let linha;
  for (let k = 0; k < 42; k++) {
    if (k % 7 === 0) { linha = h('div', { class: 'cal-semana', role: 'row' }); grade.appendChild(linha); }
    const dia = new Date(inicio);
    dia.setDate(inicio.getDate() + k);
    const iso = ctx.formatar.isoLocal(dia);
    const fora = dia.getMonth() !== m - 1;
    const celula = h('div', {
      class: `cal-dia${fora ? ' cal-fora-mes' : ''}${iso === hojeIso ? ' cal-hoje' : ''}`, role: 'gridcell',
      'aria-label': `${dia.getDate()} de ${MESES[dia.getMonth()]}${porDia.has(iso) ? `, ${porDia.get(iso).length} publicação` : ''}`,
      dados: { data: iso },
    }, h('span', { class: 'cal-num', texto: String(dia.getDate()) }),
    (porDia.get(iso) || []).map((i) => itemCalendario(ctx, i, () => planejar(i.peca, i.data))));
    // alvo de arrastar
    celula.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-grana-peca')) { e.preventDefault(); celula.classList.add('cal-alvo'); } });
    celula.addEventListener('dragleave', () => celula.classList.remove('cal-alvo'));
    celula.addEventListener('drop', (e) => {
      e.preventDefault();
      celula.classList.remove('cal-alvo');
      const id = e.dataTransfer.getData('text/x-grana-peca');
      const peca = semData.find((p) => p.id === id) || itens.find((i) => i.peca.id === id)?.peca;
      if (peca) planejar(peca, iso);
    });
    linha.appendChild(celula);
    if (k >= 34 && dia.getMonth() !== m - 1 && (k + 1) % 7 === 0) break; // não desenha a 6ª semana vazia
  }

  // --- agenda (lista) para tela estreita
  const agenda = h('ol', { class: 'agenda', 'aria-label': `Publicações de ${MESES[m - 1]}` });
  if (!itens.length) agenda.appendChild(h('li', { class: 'agenda-vazia', texto: 'Nenhuma publicação marcada neste mês.' }));
  for (const i of itens) {
    agenda.appendChild(h('li', { class: 'agenda-item' },
      h('span', { class: 'agenda-data', texto: `${ctx.formatar.data(i.data)}${i.hora ? ` às ${i.hora}` : ''}` }),
      h('span', { class: 'agenda-titulo', texto: i.peca.titulo || i.peca.id }),
      h('span', { class: 'agenda-canal', texto: rotuloCanal(i.canal) }),
      h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Mudar data', onclick: () => planejar(i.peca, i.data) })));
  }

  // --- coluna "Aprovados sem data"
  const coluna = h('aside', { class: 'cal-sem-data', 'aria-labelledby': 'cal-sem-data-titulo' },
    h('h2', { class: 'secao-titulo', id: 'cal-sem-data-titulo', texto: 'Aprovados sem data' }),
    semData.length
      ? h('ul', { class: 'lista-sem-data' }, semData.map((p) => {
        const li = h('li', { class: 'cal-item', draggable: 'true', dados: { id: p.id } },
          p.capa?.url && p.capa.tipo === 'imagem' ? h('img', { class: 'cal-item-capa', src: ctx.urlArquivo(p.capa.url), alt: '', loading: 'lazy' }) : null,
          h('span', { class: 'cal-item-titulo', texto: p.titulo || p.id }),
          h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Escolher data', onclick: () => planejar(p) }));
        li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-grana-peca', p.id); e.dataTransfer.effectAllowed = 'move'; });
        return li;
      }))
      : h('p', { class: 'texto-fraco', texto: 'Nenhuma peça aprovada esperando data. Peça aprovada aparece aqui até você marcar o dia.' }),
    semData.length ? h('p', { class: 'campo-ajuda', texto: 'Arraste para um dia ou use "Escolher data".' }) : null);

  corpo.appendChild(h('div', { class: 'calendario-layout' },
    h('section', { class: 'secao calendario-mes' }, titulo, grade, agenda),
    coluna));

  if ((d.desatualizados || []).length) {
    corpo.appendChild(ctx.secao('Planejamentos que perderam a validade',
      ctx.tabela([
        { titulo: 'Peça', valor: (x) => x.titulo || x.id, classe: 'mono' },
        { titulo: 'Data marcada', valor: (x) => ctx.formatar.data(x.data) },
        { titulo: 'Motivo', valor: (x) => x.motivo },
      ], d.desatualizados, { legenda: 'Planejamentos inválidos' })));
  }

  if ((d.referenciaFunil || []).length) {
    corpo.appendChild(ctx.secao('Ordem do funil (FUNIL.md)',
      h('p', { class: 'nota-explicativa', texto: d.diaD ? 'Datas calculadas a partir do dia D, em dias úteis.' : 'Posições relativas ao dia D, em dias úteis. Viram datas quando o dia D for declarado. São códigos editoriais, não peças do acervo.' }),
      ctx.tabela([
        { titulo: 'Posição', valor: (r) => r.ordem, classe: 'mono' },
        { titulo: 'Data', valor: (r) => (r.dataCalculada ? ctx.formatar.data(r.dataCalculada) : 'depois do dia D') },
        { titulo: 'Peça', valor: (r) => r.peca, classe: 'mono' },
        { titulo: 'Situação', valor: (r) => r.situacao },
      ], d.referenciaFunil, { legenda: 'Calendário relativo do funil' })));
  }
}

function itemCalendario(ctx, i, aoClicar) {
  const { h } = ctx;
  const el = h('button', { class: 'cal-item', type: 'button', draggable: 'true', title: `${i.peca.titulo || i.peca.id}, ${rotuloCanal(i.canal)}`, onclick: aoClicar },
    i.hora ? h('span', { class: 'cal-item-hora', texto: i.hora }) : null,
    h('span', { class: 'cal-item-titulo', texto: i.peca.titulo || i.peca.id }),
    h('span', { class: 'cal-item-canal', texto: rotuloCanal(i.canal) }));
  el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-grana-peca', i.peca.id); e.dataTransfer.effectAllowed = 'move'; });
  return el;
}

async function escolherData(ctx, peca, dataInicial, canais) {
  const v = await ctx.formulario({
    titulo: 'Data de publicação',
    texto: `${peca.titulo || peca.id}. Isto só marca no calendário do painel. Ninguém publica nada por aqui.`,
    campos: [
      { nome: 'data', rotulo: 'Dia', tipo: 'date', obrigatorio: true, valor: dataInicial || '' },
      { nome: 'hora', rotulo: 'Horário (opcional)', tipo: 'time', valor: '' },
      { nome: 'canal', rotulo: 'Onde', tipo: 'select', valor: peca.tipo === 'video' ? 'reels' : 'instagram-feed',
        opcoes: canais.map((c) => ({ valor: c, rotulo: rotuloCanal(c) })) },
      { nome: 'observacao', rotulo: 'Observação (opcional)', tipo: 'textarea', linhas: 2, ajuda: 'Este texto fica gravado em docs/marketing/painel e vai para o GitHub público no próximo commit.' },
    ],
    rotuloBotao: 'Marcar data',
  });
  if (!v) return;
  try {
    const r = await ctx.acao('/api/marketing/calendario', {
      id: peca.id, versao: peca.versao, data: v.data, hora: v.hora || undefined, canal: v.canal, observacao: v.observacao || undefined,
    });
    ctx.aviso(`Marcado para ${ctx.formatar.data(v.data)}.`, 'ok');
    for (const a of r.dados?.avisos || []) ctx.aviso(a, 'info');
    ctx.navegar(`#/marketing/calendario?mes=${v.data.slice(0, 7)}`);
  } catch (err) {
    ctx.aviso(err.codigo === 'versao-mudou'
      ? 'A peça mudou depois do aceite. Ela precisa de novo aceite antes de ganhar data.'
      : `A data não foi marcada: ${err.message}`, 'erro');
  }
}
