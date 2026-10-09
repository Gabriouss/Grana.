// EAS e builds: saldo da semana (regra 22), cota do mês, builds recentes e o preparo de build (regra 5).
// O autor confirma separadamente preparo/publicação e disparo (regra 4).
import { montarReciboBuild } from './build-painel.js';

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'EAS e builds', 'Toda atualização do app é uma build nova. Teto de 3 por semana e 15 por mês, somando as duas máquinas.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  let saldoAtual = null;
  const preparo = h('div', { class: 'secao-corpo' });
  const recibo = h('div', { class: 'secao-corpo' });

  raiz.appendChild(ctx.bloco('Saldo e builds recentes', '/api/eas/builds', (d) => {
    saldoAtual = normalizarSaldo(d.saldo);
    desenharPreparo(ctx, preparo, saldoAtual, d.preparoPersistido);
    montarReciboBuild(ctx, recibo, d.preparoPersistido, ctx.obsoleta);
    const sem = saldoAtual?.semana;
    const mes = saldoAtual?.mes;
    const builds = d.builds || d.itens || [];
    const esgotada = sem && sem.usadas >= (sem.teto ?? 3);
    return [
      h('div', { class: 'grade-cartoes' },
        ctx.cartao({ titulo: 'Esta semana', valor: sem ? `${sem.usadas} de ${sem.teto ?? 3}` : 'sem dado',
          detalhe: sem ? (esgotada ? 'Teto da semana atingido. Só com liberação de emergência pedida por você no terminal.' : `Restam ${(sem.teto ?? 3) - sem.usadas}. A semana vai de segunda a domingo${sem.zeraEm ? `; zera em ${ctx.formatar.data(sem.zeraEm)}` : ''}.`) : 'Saldo não calculado.',
          status: esgotada ? 'alerta' : undefined }),
        ctx.cartao({ titulo: 'Este mês', valor: mes ? `${mes.usadas} de ${mes.cota ?? 15}` : 'sem dado',
          detalhe: mes ? `Restam ${(mes.cota ?? 15) - mes.usadas} na cota do EAS.` : 'Contagem do mês não lida.',
          status: mes && mes.usadas >= (mes.cota ?? 15) ? 'erro' : undefined })),
      d.saldo?.fonte ? h('p', { class: 'nota-explicativa', texto: d.saldo.fonte }) : null,
      d.saldo?.contagemIncompleta ? ctx.alerta('atencao', 'O git fetch falhou: a contagem da semana pode estar incompleta.') : null,
      d.status === 'parcial' && d.motivo ? ctx.alerta('info', d.motivo) : null,
      builds.length ? ctx.tabela([
        { titulo: 'Quando', valor: (b) => ctx.formatar.dataHora(b.criadoEm) },
        { titulo: 'Versão', valor: (b) => b.versao, classe: 'mono' },
        { titulo: 'Perfil', valor: (b) => b.perfil },
        { titulo: 'Estado', valor: (b) => seloBuild(ctx, b.estado || b.status) },
        { titulo: 'Commit', valor: (b) => (b.commit ? String(b.commit.hash || b.commit).slice(0, 7) : null), classe: 'mono' },
        { titulo: 'Nota', valor: (b) => (b.mensagem && b.mensagem.length > 90 ? `${b.mensagem.slice(0, 90)}…` : b.mensagem) },
        { titulo: 'Links', valor: (b) => [
          (b.apk || b.artefato) ? h('a', { href: b.apk || b.artefato, target: '_blank', rel: 'noopener noreferrer', texto: 'APK' }) : null,
          b.pagina ? [' ', h('a', { href: b.pagina, target: '_blank', rel: 'noopener noreferrer', texto: 'EAS' })] : null] },
      ], builds, { legenda: 'Builds recentes no EAS' }) : ctx.estado.bloco.vazio(d.buildsStatus === 'ausente' ? 'A CLI do EAS não está logada neste computador, então a lista de builds não foi lida. O saldo acima vem do git.' : 'Nenhuma build recente.'),
    ];
  }, { integracao: 'eas' }));

  raiz.appendChild(h('section', { class: 'secao' }, h('h2', { class: 'secao-titulo', texto: 'Preparar uma build' }), preparo));
  raiz.appendChild(h('section', { class: 'secao' }, h('h2', { class: 'secao-titulo', texto: 'Recibo do preparo e do disparo' }), recibo));
  desenharPreparo(ctx, preparo, null);
}

function normalizarSaldo(s) {
  if (!s) return null;
  const sem = s.semana ? { ...s.semana, usadas: s.semana.usadas ?? s.semana.feitos } : undefined;
  const mes = s.mes ? { ...s.mes, usadas: s.mes.usadas ?? s.mes.preparos } : undefined;
  return { ...s, semana: sem, mes };
}

function seloBuild(ctx, e) {
  const m = { FINISHED: ['ok', 'Pronta'], ERRORED: ['erro', 'Falhou'], CANCELED: ['neutro', 'Cancelada'], IN_PROGRESS: ['alerta', 'Gerando'], IN_QUEUE: ['alerta', 'Na fila'], NEW: ['alerta', 'Nova'] };
  const [s, t] = m[e] || ['neutro', e || 'sem estado'];
  return ctx.selo(s, t);
}

function desenharPreparo(ctx, raiz, saldo, persistido) {
  const { h } = ctx;
  while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
  const sem = saldo?.semana;
  const mes = saldo?.mes;
  const esgotada = sem && sem.usadas >= (sem.teto ?? 3);
  const pendente = persistido && ['preparando', 'preparado', 'disparando', 'desconhecido', 'push-falhou', 'commit-falhou'].includes(persistido.estado);
  if (pendente) raiz.appendChild(ctx.alerta('atencao', 'Há um preparo pendente. Continue pelo recibo abaixo antes de preparar outra versão.'));
  raiz.appendChild(h('p', { class: 'nota-explicativa', texto: 'Preparar valida a nota, sobe a versão e publica o preparo no GitHub. Disparar é uma etapa separada: exige sua confirmação e envia a nota inteira ao EAS.' }));
  if (sem) {
    raiz.appendChild(ctx.alerta(esgotada ? 'critico' : 'info', esgotada
      ? `Esta semana já teve ${sem.usadas} de ${sem.teto ?? 3} builds. O preparo será recusado pelo script.`
      : `Esta seria a build ${sem.usadas + 1} de ${sem.teto ?? 3} desta semana${mes ? ` e ${mes.usadas + 1} de ${mes.cota ?? 15} do mês` : ''}.`));
  } else {
    raiz.appendChild(ctx.alerta('atencao', 'Saldo da semana ainda não lido. O script confere de novo antes de preparar.'));
  }
  const saida = h('div', { class: 'resultado-preparo' });
  const botao = h('button', { class: 'botao botao-primario', type: 'button', texto: 'Preparar build', disabled: !!esgotada || !!pendente,
    onclick: () => preparar(ctx, saldo, saida, botao) });
  raiz.appendChild(h('div', { class: 'bloco-acao' }, botao));
  raiz.appendChild(saida);
}

async function preparar(ctx, saldo, saida, botao) {
  const { h } = ctx;
  const valores = await ctx.formulario({
    titulo: 'Preparar build',
    texto: 'A nota vai literalmente para o pop-up "O que mudou no Grana." de quem atualizar. Escreva com acento e sem travessão.',
    campos: [
      { nome: 'tipo', rotulo: 'Tamanho da versão', tipo: 'select', valor: 'patch', opcoes: [
        { valor: 'patch', rotulo: 'Correção (sobe o último número)' },
        { valor: 'minor', rotulo: 'Novidade (sobe o número do meio)' }] },
      { nome: 'mensagem', rotulo: 'Nota da versão', tipo: 'textarea', obrigatorio: true, linhas: 4 },
    ],
    rotuloBotao: 'Continuar',
  });
  if (!valores) return;
  const sem = saldo?.semana;
  const ok = await ctx.confirmar({
    titulo: 'Confirmar o preparo',
    texto: 'Isto altera e publica o app.json desta máquina. O preparo conta na semana mesmo que você não dispare depois. Nenhum build é disparado nesta etapa.',
    detalhes: [
      `Tipo: ${valores.tipo === 'minor' ? 'novidade' : 'correção'}`,
      `Nota: ${valores.mensagem}`,
      sem ? `Saldo depois: ${sem.usadas + 1} de ${sem.teto ?? 3} na semana` : 'Saldo da semana não lido',
    ],
    rotuloBotao: 'Preparar', perigo: true,
  });
  if (!ok) return;
  botao.disabled = true;
  botao.textContent = 'Preparando…';
  while (saida.firstChild) saida.removeChild(saida.firstChild);
  const andamento = ctx.alerta('info', 'Validando a nota, preparando e publicando a versão. Pode levar até 8 minutos; não feche nem recarregue esta página.');
  andamento.setAttribute('role', 'status');
  saida.appendChild(andamento);
  let liberar = true;
  try {
    const r = await ctx.acao('/api/eas/preparar-build', { tipo: valores.tipo, mensagem: valores.mensagem, confirmacao: true });
    const d = r.dados || {};
    if (d.preparoPersistido && !d.simulado) liberar = false;
    andamento.remove();
    saida.appendChild(ctx.alerta('info', d.simulado ? 'Preparo simulado: nada foi alterado.' : 'Preparo publicado. Confira a nota e confirme o disparo abaixo.'));
    const recibo = h('div', {});
    saida.appendChild(recibo);
    montarReciboBuild(ctx, recibo, d.preparoPersistido, ctx.obsoleta);
    if (d.saida) saida.appendChild(h('pre', { class: 'saida', tabindex: '0' }, h('code', { texto: d.saida })));
  } catch (err) {
    andamento.remove();
    if (['resultado-desconhecido', 'preparo-nao-publicado', 'preparo-pendente'].includes(err.codigo)) {
      // não sabemos se o app.json subiu: nada de convidar a repetir na hora
      liberar = false;
      saida.appendChild(ctx.alerta('critico', err.codigo === 'resultado-desconhecido'
        ? 'Resultado desconhecido: a ação pode continuar no servidor e o preparo pode ter acontecido. Reabra EAS e builds para consultar o recibo antes de repetir.'
        : 'Existe um preparo pendente. Confira o recibo em EAS e builds e retome sua publicação; não prepare outra versão.'));
      saida.appendChild(h('button', { class: 'botao', type: 'button', texto: 'Conferir EAS e builds', onclick: () => ctx.recarregar() }));
    } else {
      saida.appendChild(ctx.alerta(err.codigo === 'bloqueado' || /BLOQUEADO/.test(err.message) ? 'critico' : 'atencao', `O preparo não foi feito: ${err.message}`));
    }
  } finally {
    botao.textContent = 'Preparar build';
    botao.disabled = !liberar;
  }
}
