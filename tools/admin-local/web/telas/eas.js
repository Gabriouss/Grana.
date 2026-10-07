// EAS e builds: saldo da semana (regra 22), cota do mês, builds recentes e o preparo de build (regra 5).
// O painel roda só o build:preparar. O eas build continua com o autor (regra 4).

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'EAS e builds', 'Toda atualização do app é uma build nova. Teto de 3 por semana e 15 por mês, somando as duas máquinas.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  let saldoAtual = null;
  const preparo = h('div', { class: 'secao-corpo' });

  raiz.appendChild(ctx.bloco('Saldo e builds recentes', '/api/eas/builds', (d) => {
    saldoAtual = normalizarSaldo(d.saldo);
    desenharPreparo(ctx, preparo, saldoAtual);
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

function desenharPreparo(ctx, raiz, saldo) {
  const { h } = ctx;
  while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
  const sem = saldo?.semana;
  const mes = saldo?.mes;
  const esgotada = sem && sem.usadas >= (sem.teto ?? 3);
  raiz.appendChild(h('p', { class: 'nota-explicativa', texto: 'O painel roda o npm run build:preparar, que sobe a versão e confere a nota do "O que mudou". Ele não dispara a build: no fim aparece o comando eas build pronto para você colar no terminal.' }));
  if (sem) {
    raiz.appendChild(ctx.alerta(esgotada ? 'critico' : 'info', esgotada
      ? `Esta semana já teve ${sem.usadas} de ${sem.teto ?? 3} builds. O preparo será recusado pelo script.`
      : `Esta seria a build ${sem.usadas + 1} de ${sem.teto ?? 3} desta semana${mes ? ` e ${mes.usadas + 1} de ${mes.cota ?? 15} do mês` : ''}.`));
  } else {
    raiz.appendChild(ctx.alerta('atencao', 'Saldo da semana ainda não lido. O script confere de novo antes de preparar.'));
  }
  const saida = h('div', { class: 'resultado-preparo' });
  const botao = h('button', { class: 'botao botao-primario', type: 'button', texto: 'Preparar build', disabled: !!esgotada,
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
    texto: 'Isto altera o app.json desta máquina e conta como uma build da semana, mesmo que você não dispare depois.',
    detalhes: [
      `Tipo: ${valores.tipo === 'minor' ? 'novidade' : 'correção'}`,
      `Nota: ${valores.mensagem}`,
      sem ? `Saldo depois: ${sem.usadas + 1} de ${sem.teto ?? 3} na semana` : 'Saldo da semana não lido',
    ],
    frase: 'PREPARAR BUILD', rotuloBotao: 'Preparar', perigo: true,
  });
  if (!ok) return;
  botao.disabled = true;
  botao.textContent = 'Preparando…';
  while (saida.firstChild) saida.removeChild(saida.firstChild);
  const andamento = ctx.alerta('info', 'Preparando a build. Pode levar até 2 minutos; não feche nem recarregue esta página.');
  andamento.setAttribute('role', 'status');
  saida.appendChild(andamento);
  let liberar = true;
  try {
    const r = await ctx.acao('/api/eas/preparar-build', { tipo: valores.tipo, mensagem: valores.mensagem, confirmacao: 'PREPARAR BUILD' });
    const d = r.dados || {};
    andamento.remove();
    saida.appendChild(ctx.alerta(d.simulado ? 'info' : 'info', d.simulado ? 'Preparo simulado: nada foi alterado.' : 'Preparo feito. Falta só disparar a build no terminal.'));
    if (d.saida) saida.appendChild(h('pre', { class: 'saida', tabindex: '0' }, h('code', { texto: d.saida })));
    if (d.comando) {
      saida.appendChild(h('div', { class: 'comando-pronto' },
        h('p', { texto: 'Comando para colar no terminal:' }),
        h('pre', { class: 'saida mono', tabindex: '0' }, h('code', { texto: d.comando })),
        h('button', { class: 'botao', type: 'button', texto: 'Copiar comando', onclick: () => ctx.copiar(d.comando, 'Comando copiado.') })));
    }
  } catch (err) {
    andamento.remove();
    if (err.codigo === 'resultado-desconhecido') {
      // não sabemos se o app.json subiu: nada de convidar a repetir na hora
      liberar = false;
      saida.appendChild(ctx.alerta('critico', 'Resultado desconhecido: o servidor não respondeu a tempo e o preparo pode ter acontecido. Confira em EAS e builds (e a versão no app.json) antes de repetir.'));
      saida.appendChild(h('button', { class: 'botao', type: 'button', texto: 'Conferir EAS e builds', onclick: () => ctx.recarregar() }));
    } else {
      saida.appendChild(ctx.alerta(err.codigo === 'bloqueado' || /BLOQUEADO/.test(err.message) ? 'critico' : 'atencao', `O preparo não foi feito: ${err.message}`));
    }
  } finally {
    botao.textContent = 'Preparar build';
    botao.disabled = !liberar;
  }
}
