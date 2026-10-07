// Supabase: projeto, contagens agregadas, Edge Functions (checagem da regra 11), migrations e app_release.
// Só leitura. Deploy de função e aplicação de migration ficam fora do painel nesta fase.

export async function montar(raiz, ctx) {
  const { h } = ctx;
  ctx.cabecalho(raiz, 'Supabase', 'Banco, contas e Edge Functions. Só leitura.', [
    h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Atualizar', onclick: () => ctx.recarregar() }),
  ]);

  raiz.appendChild(ctx.bloco('Projeto e contas', '/api/supabase/resumo', (d) => {
    const porStatus = d.assinaturas?.porStatus || {};
    const linhasAss = Array.isArray(porStatus) ? porStatus.map((x) => [x.status, x.total]) : Object.entries(porStatus);
    const estadoProjeto = d.projeto?.estado || d.projeto?.status;
    const cartoes = [
      ctx.cartao({ titulo: 'Projeto', valor: estadoProjeto ? rotuloProjeto(estadoProjeto) : 'sem dado',
        detalhe: [d.projeto?.ref && `ref ${d.projeto.ref}`, d.projeto?.regiao, d.projeto?.postgres && `Postgres ${d.projeto.postgres}`].filter(Boolean).join(', ') || undefined,
        status: estadoProjeto === 'ACTIVE_HEALTHY' ? 'ok' : estadoProjeto ? 'alerta' : undefined }),
      typeof d.assinaturas?.ativas === 'number' ? ctx.cartao({ titulo: 'Assinaturas ativas', valor: ctx.formatar.numero(d.assinaturas.ativas),
        detalhe: 'Inclui cortesias. Número agregado, sem dado pessoal.' }) : null,
      ctx.cartao({ titulo: 'Contas', valor: ctx.formatar.numero(d.usuarios?.total),
        detalhe: [typeof d.usuarios?.ultimos7 === 'number' && `${d.usuarios.ultimos7} nos últimos 7 dias`,
          typeof d.usuarios?.ultimos30 === 'number' && `${d.usuarios.ultimos30} nos últimos 30`].filter(Boolean).join(', ') || undefined }),
      ctx.cartao({ titulo: 'Push tokens', valor: ctx.formatar.numero(d.pushTokens?.total ?? d.pushTokens),
        detalhe: (d.pushTokens?.total ?? d.pushTokens) === 0 ? 'Vazio: nenhuma notificação push chega a ninguém.' : 'Aparelhos que podem receber push.',
        status: (d.pushTokens?.total ?? d.pushTokens) === 0 ? 'alerta' : undefined }),
    ];
    return [
      h('div', { class: 'grade-cartoes' }, cartoes.filter(Boolean)),
      linhasAss.length ? ctx.tabela([
        { titulo: 'Assinatura', valor: ([s]) => rotuloAssinatura(s) },
        { titulo: 'Quantidade', valor: ([, n]) => ctx.formatar.numero(n), classe: 'num' },
      ], linhasAss, { legenda: 'Assinaturas por status' }) : null,
      Array.isArray(d.ultimosCadastros) && d.ultimosCadastros.length ? ctx.tabela([
        { titulo: 'Cadastro', valor: (l) => ctx.formatar.dataHora(l.data) },
        { titulo: 'E-mail (mascarado)', valor: (l) => l.email, classe: 'mono' },
      ], d.ultimosCadastros, { legenda: 'Últimos cadastros' }) : null,
    ];
  }, { integracao: 'supabase' }));

  raiz.appendChild(ctx.bloco('Edge Functions', '/api/supabase/funcoes', (d) => {
    const funcoes = d.funcoes || d.itens || [];
    if (!funcoes.length) return null;
    const maisNova = (f) => f.producaoMaisNova === true || f.comparacao === 'producao-mais-nova-que-o-repositorio';
    const maisNovas = funcoes.filter(maisNova);
    const jwtErrado = funcoes.filter((f) => f.slug === 'whatsapp-webhook' && f.verify_jwt === true);
    const conferida = (f) => f.comparacao === 'publicada-depois-com-codigo-conferido';
    const recibosVencidos = maisNovas.filter((f) => f.recibo && f.recibo.estado === 'invalido');
    return [
      maisNovas.length ? ctx.alerta('atencao',
        `${maisNovas.length === 1 ? 'Uma função está' : `${maisNovas.length} funções estão`} no ar com data mais nova que o último commit do repositório: ${maisNovas.map((f) => f.slug).join(', ')}. Publicar a partir do repositório pode apagar código que só existe em produção (regra 11). O alerta só sai com uma conferência de conteúdo registrada para esta publicação.`) : null,
      recibosVencidos.map((f) => ctx.alerta('atencao', `${f.slug}: a conferência registrada deixou de valer. ${f.recibo.motivo} Confira de novo antes de qualquer publicação.`)),
      jwtErrado.length ? ctx.alerta('critico', 'O whatsapp-webhook está com verify_jwt ligado. A Meta não manda JWT, então toda mensagem é recusada.') : null,
      ctx.tabela([
        { titulo: 'Função', valor: (f) => f.slug, classe: 'mono' },
        { titulo: 'Versão', valor: (f) => f.version, classe: 'num' },
        { titulo: 'No ar desde', valor: (f) => ctx.formatar.dataHora(f.updated_at) },
        // o commit que decide a situação: o mais novo entre a pasta da função e os arquivos que ela importa
        { titulo: 'Último commit que entra no pacote', valor: (f) => {
          const c = f.commitDeReferencia || f.ultimoCommitLocal;
          if (!c) return 'sem commit no repositório';
          const texto = `${c.curto || String(c.hash || '').slice(0, 7)} · ${ctx.formatar.dataHora(c.data)}`;
          return f.arquivoDeReferencia
            ? h('span', null, texto, h('br'), h('span', { class: 'texto-fraco mono', texto: `via ${f.arquivoDeReferencia}` }))
            : texto;
        } },
        { titulo: 'verify_jwt', valor: (f) => (f.verify_jwt === true ? 'ligado' : f.verify_jwt === false ? 'desligado' : 'sem dado') },
        { titulo: 'Situação', valor: (f) => {
          if (f.status && f.status !== 'ACTIVE') return ctx.selo('alerta', f.status);
          if (maisNova(f)) return ctx.selo('alerta', 'No ar mais nova que o repositório');
          if (conferida(f)) {
            const r = f.recibo && f.recibo.recibo;
            return h('span', null, ctx.selo('ok', 'Publicada depois, código conferido igual'),
              r && r.conferidoEm ? h('span', { class: 'texto-fraco', texto: ` em ${ctx.formatar.dataHora(r.conferidoEm)}` }) : null);
          }
          if (f.comparacao === 'repositorio-mais-novo-que-a-producao') return ctx.selo('neutro', 'Repositório tem mudança não publicada');
          return ctx.selo('ok', 'Em dia');
        } },
      ], funcoes, { legenda: 'Edge Functions publicadas' }),
      h('p', { class: 'nota-explicativa', texto: 'Publicar Edge Function não tem botão aqui de propósito. A regra 11 pede baixar o que está no ar, comparar com o repositório, rodar deno check e preservar o verify_jwt de cada função, um passo que um botão esconderia. A versão da função também sobe sozinha quando um segredo muda; por isso a comparação usa a data, não o número.' }),
    ];
  }, { integracao: 'supabase', textoVazio: 'Nenhuma Edge Function encontrada.' }));

  raiz.appendChild(ctx.bloco('Migrations no repositório', '/api/supabase/migrations', (d) => {
    const lista = d.migrations || d.itens || [];
    if (!lista.length) return null;
    return [
      h('p', { class: 'nota-explicativa', texto: 'Esta lista é do repositório. O projeto não tem tabela de controle de migrations, então o painel não sabe quais foram aplicadas em produção.' }),
      ctx.tabela([
        { titulo: 'Arquivo', valor: (m) => m.nome, classe: 'mono' },
        { titulo: 'O que faz', valor: (m) => m.descricao },
        { titulo: 'Data', valor: (m) => ctx.formatar.data(m.data) },
      ], ordenarMigrations(lista), { legenda: 'Migrations, da mais nova para a mais antiga' }),
    ];
  }, { integracao: 'supabase', textoVazio: 'Nenhuma migration na pasta supabase/migrations.' }));

  raiz.appendChild(ctx.bloco('Versão anunciada (app_release)', '/api/supabase/app-release', (d) => {
    const rel = d.release || d.linha || d;
    const campos = Object.entries(rel).filter(([k, v]) => k !== 'status' && v !== null && typeof v !== 'object');
    if (!campos.length) return null;
    return h('dl', { class: 'lista-chave-valor' }, campos.map(([k, v]) => [
      h('dt', { texto: k }),
      h('dd', { class: /url|link/i.test(k) ? 'mono' : undefined, texto: /(_at|Em|data)$/i.test(k) && v ? ctx.formatar.dataHora(v) : String(v) }),
    ]));
  }, { integracao: 'supabase', textoVazio: 'A tabela app_release não tem linha.' }));
}

function ordenarMigrations(lista) {
  return [...lista].sort((a, b) => String(b.nome).localeCompare(String(a.nome)));
}

function rotuloProjeto(s) {
  return { ACTIVE_HEALTHY: 'Saudável', INACTIVE: 'Pausado', COMING_UP: 'Subindo', PAUSING: 'Pausando', RESTORING: 'Restaurando' }[s] || s;
}

function rotuloAssinatura(s) {
  return { active: 'Ativa', trialing: 'Em teste', canceled: 'Cancelada', past_due: 'Atrasada', courtesy: 'Cortesia', expired: 'Expirada', refunded: 'Reembolsada' }[s] || s;
}
