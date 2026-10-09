// As ações só começam depois do clique e da confirmação do autor.
export function montarReciboBuild(ctx, raiz, inicial, obsoleta = () => false) {
  const { h } = ctx;
  let preparo = inicial, ocupado = false, mensagem = null, nota = null;
  const rotulos = {
    preparando: 'Preparo ainda em andamento', preparado: 'Preparo publicado, pronto para disparar',
    'push-falhou': 'Preparo ainda não publicado', 'commit-falhou': 'Preparo ainda não commitado', disparando: 'Disparo sem resultado confirmado',
    desconhecido: 'Resultado do disparo desconhecido', enviado: 'Pedido enviado ao EAS',
  };
  function desenhar() {
    if (obsoleta()) return;
    raiz.replaceChildren();
    if (!preparo) return;
    raiz.appendChild(h('h3', { texto: `Build ${preparo.versao}` }));
    raiz.appendChild(ctx.alerta(mensagem?.tipo || 'info', mensagem?.texto || rotulos[preparo.estado] || 'Confira o estado da build.'));
    raiz.appendChild(h('p', { class: 'campo-ajuda', texto: `Referência do preparo: ${preparo.id}` }));
    raiz.appendChild(h('pre', { class: 'saida', tabindex: '0' }, h('code', { texto: preparo.nota })));
    const acoes = h('div', { class: 'bloco-acao' });
    const botao = (texto, fn) => acoes.appendChild(h('button', { type: 'button', class: 'botao', texto, disabled: ocupado, onclick: fn }));
    if (['push-falhou', 'commit-falhou', 'preparando'].includes(preparo.estado)) botao('Publicar este preparo', () => executar('publicar-preparo', 'Publicar preparo', 'Retoma o mesmo preparo e publica seu commit. A versão não sobe novamente e a build ainda não será disparada.'));
    if (preparo.estado === 'preparado') botao('Disparar build', () => executar('disparar-build', 'Disparar build Android', 'Envia esta versão e a nota inteira ao EAS. Esta ação consome uma build da cota.'));
    if (['enviado', 'desconhecido', 'disparando'].includes(preparo.estado)) {
      botao('Conferir nota anunciada', () => executar('verificar-nota'));
    }
    if (['desconhecido', 'disparando'].includes(preparo.estado)) {
      raiz.appendChild(ctx.alerta('atencao', 'Confira EAS e builds antes de qualquer novo disparo. Um pedido sem resposta pode ter sido recebido.'));
      botao('Registrar que não saiu no EAS', () => executar('resolver-disparo', 'Registrar conferência manual', 'Só confirme depois de verificar no EAS que esta build não foi recebida. O registro libera um novo disparo; não dispara agora.'));
    }
    if (nota?.estado === 'nota-divergente') {
      raiz.appendChild(ctx.alerta('atencao', 'A nota anunciada difere da nota aprovada. Confira as duas versões abaixo.'));
      raiz.appendChild(h('h4', { texto: 'Nota aprovada' }));
      raiz.appendChild(h('pre', { class: 'saida', tabindex: '0', texto: nota.notaAprovada }));
      raiz.appendChild(h('h4', { texto: 'Nota anunciada' }));
      raiz.appendChild(h('pre', { class: 'saida', tabindex: '0', texto: nota.notaAnunciada }));
      botao('Regravar nota aprovada', () => executar('regravar-nota', 'Regravar nota da versão', 'Grava a nota aprovada nesta versão anunciada. Não gera outra build.'));
    }
    raiz.appendChild(acoes);
  }
  async function executar(rota, titulo, texto) {
    if (ocupado || obsoleta()) return;
    ocupado = true; desenhar();
    try {
      if (titulo && !await ctx.confirmar({ titulo, texto, detalhes: [`Versão: ${preparo.versao}`, `Nota: ${preparo.nota}`], rotuloBotao: titulo, perigo: true })) return;
      if (obsoleta()) return;
      mensagem = { tipo: 'info', texto: 'Aguardando o recibo do servidor…' }; desenhar();
      const resposta = await ctx.acao(`/api/eas/${rota}`, { preparoId: preparo.id, confirmacao: true });
      if (obsoleta()) return;
      const d = resposta.dados || {};
      if (d.preparoPersistido) preparo = d.preparoPersistido;
      else if (['nota-confirmada', 'nota-divergente'].includes(d.estado)) preparo = { ...preparo, estado: 'enviado' };
      nota = d.estado ? d : null;
      mensagem = { tipo: 'info', texto: d.simulado ? 'Ensaio concluído. Nenhuma ação real foi executada.' : d.aviso || (d.estado === 'nota-confirmada' ? 'A nota anunciada confere com a aprovada.' : d.estado === 'aguardando-anuncio' ? 'A versão ainda não foi anunciada. Aguarde e confira novamente.' : 'Conferência concluída.') };
    } catch (err) {
      if (obsoleta()) return;
      if (rota === 'disparar-build') {
        const recusas = ['confirmacao-invalida', 'preparo-invalido', 'versao-divergente', 'commits-nao-publicados', 'pacote-inseguro', 'eas-ausente'];
        if (!recusas.includes(err.codigo) && !String(err.codigo || '').startsWith('git-')) {
          preparo = { ...preparo, estado: 'desconhecido' };
        }
      }
      mensagem = { tipo: 'atencao', texto: `${err.message} Confira o estado no servidor antes de repetir.` };
      // Não repete ação automaticamente nem transforma erro em sucesso.
      console.warn('[painel-build]', err.codigo || 'falha');
    } finally { ocupado = false; desenhar(); }
  }
  desenhar();
}
