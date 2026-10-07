// Acesso ao painel: pareamento (#par= do lançador), senha, código TOTP, aviso e saída por inatividade, Sair.
// Quem decide é o servidor. Esta tela só mostra a etapa que ele indicar.
// Senha e código vivem só no campo e na variável do envio: nunca em storage, URL ou console.
// Contrato: E:/Grana-temporarios/2026-10-07-admin-panel/INTERFACE-login-anvil-keel.md

export const ROTAS_SESSAO = {
  sessao: '/api/sessao',
  parear: '/api/parear',
  senha: '/api/login',
  totp: '/api/login/totp',
  sair: '/api/sair',
  renovar: '/api/sessao/renovar',
};

// 401 que pedem login (o 'nao-pareado' é tela de bloqueio, tratada no app.js)
export const CODIGOS_LOGIN = ['nao-autenticado', 'totp-pendente', 'sessao-expirada', 'inatividade'];

const MENSAGEM_ENTRADA = {
  'sessao-expirada': 'Sua sessão expirou. Entre de novo.',
  inatividade: 'Sessão encerrada por inatividade. Entre de novo.',
  saiu: 'Você saiu do painel.',
};
const AVISO_ANTES_SEG = 60;
const TEXTO_SEM_CONTA = 'A conta admin ainda não foi criada. Feche o painel e abra pelo atalho Grana. Admin: ele pede para criar senha e autenticador no terminal.';

// deps: { h, ler(caminho), enviar(caminho, corpo), enviarSemCsrf(caminho, corpo), definirCsrf(token),
//         esconderPainel(), mostrarPainel(), aoEntrar(), aviso(), bloquear(motivo) }
export function criarAcesso(deps) {
  const { h } = deps;
  let tela = null; // elemento da tela de acesso aberta, ou null
  let etapaAtual = null;
  let inatividadeSeg = null;
  let expiraEm = null; // limite absoluto da sessão admin (ms), vindo do servidor
  let ultimaAtividade = Date.now();
  let relogio = null;
  let caixaAviso = null;
  let legado = false; // servidor sem login (antes da blindagem): o painel segue como antes

  function fecharTela() {
    if (tela) { tela.remove(); tela = null; }
  }

  function moldura(titulo, texto, mensagem, conteudo) {
    fecharTela();
    deps.esconderPainel();
    const idTitulo = 'acesso-titulo';
    tela = h('div', { class: 'acesso', role: 'main', 'aria-labelledby': idTitulo },
      h('div', { class: 'acesso-caixa' },
        h('img', { class: 'acesso-marca', src: '/design-system/marca/logotipo-gradiente.svg', alt: 'Grana.', width: '132', height: '37' }),
        h('p', { class: 'acesso-selo', texto: 'Administração local' }),
        h('h1', { class: 'acesso-titulo', id: idTitulo, tabindex: '-1', texto: titulo }),
        texto ? h('p', { class: 'acesso-texto', texto }) : null,
        mensagem ? h('p', { class: 'acesso-mensagem', role: 'status', texto: mensagem }) : null,
        conteudo,
        h('p', { class: 'acesso-rodape', texto: 'Só neste computador. Depois de alguns erros seguidos, o acesso fica bloqueado por um tempo.' })));
    document.body.appendChild(tela);
    return tela;
  }

  function linhaErro() {
    return h('p', { class: 'acesso-erro', role: 'alert', hidden: true });
  }

  function mostrarErro(el, err, campo, botao) {
    el.hidden = false;
    if (err && err.codigo === 'bloqueado') {
      let seg = Math.max(1, Number(err.tentarEmSeg) || 60);
      campo.disabled = true;
      botao.disabled = true;
      const tick = () => {
        if (!el.isConnected) return;
        if (seg <= 0) { el.textContent = 'Pode tentar de novo.'; campo.disabled = false; botao.disabled = false; campo.focus(); return; }
        const min = Math.floor(seg / 60);
        el.textContent = `Muitas tentativas. Tente de novo em ${min ? `${min} min ` : ''}${seg % 60} s.`;
        seg -= 1;
        setTimeout(tick, 1000);
      };
      tick();
      return;
    }
    el.textContent = err && err.codigo === 'credencial-invalida'
      ? 'Senha ou código incorreto.'
      : (err && err.message) || 'Não deu para entrar agora.';
  }

  function telaSenha(mensagem) {
    etapaAtual = 'senha';
    const erro = linhaErro();
    const campo = h('input', { id: 'acesso-senha', type: 'password', autocomplete: 'current-password', required: true, spellcheck: 'false', autocapitalize: 'off' });
    const mostrar = h('button', { class: 'botao botao-fantasma', type: 'button', 'aria-pressed': 'false', 'aria-controls': 'acesso-senha', texto: 'Mostrar senha' });
    mostrar.addEventListener('click', () => {
      const ver = campo.type === 'password';
      campo.type = ver ? 'text' : 'password';
      mostrar.setAttribute('aria-pressed', String(ver));
      mostrar.textContent = ver ? 'Esconder senha' : 'Mostrar senha';
    });
    const botao = h('button', { class: 'botao botao-primario', type: 'submit', texto: 'Entrar' });
    const form = h('form', { class: 'acesso-form', novalidate: true },
      h('div', { class: 'campo' }, h('label', { for: 'acesso-senha', texto: 'Senha' }), campo),
      h('div', { class: 'bloco-acao' }, mostrar),
      erro,
      h('div', { class: 'bloco-acao' }, botao));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!campo.value) { mostrarErro(erro, { message: 'Digite a senha.' }, campo, botao); campo.focus(); return; }
      let senha = campo.value;
      campo.value = '';
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      try {
        const r = await deps.enviar(ROTAS_SESSAO.senha, { senha });
        senha = null;
        seguir(r.dados || {});
      } catch (err) {
        senha = null;
        if (err.codigo === 'login-nao-configurado') { telaSemConta(); return; }
        mostrarErro(erro, err, campo, botao);
        if (err.codigo !== 'bloqueado') { botao.disabled = false; campo.focus(); }
      } finally {
        botao.removeAttribute('aria-busy');
      }
    });
    moldura('Entrar no painel', 'Digite a senha da conta de administração.', mensagem, form);
    campo.focus();
  }

  function telaCodigo(mensagem) {
    etapaAtual = 'totp';
    const erro = linhaErro();
    const campo = h('input', {
      id: 'acesso-codigo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6',
      pattern: '[0-9]{6}', required: true, spellcheck: 'false', 'aria-describedby': 'acesso-codigo-ajuda', class: 'mono',
    });
    const botao = h('button', { class: 'botao botao-primario', type: 'submit', texto: 'Confirmar' });
    let enviando = false;
    const enviar = async () => {
      const codigo = campo.value.replace(/\D/g, '');
      if (codigo.length !== 6) { mostrarErro(erro, { message: 'O código tem 6 números.' }, campo, botao); return; }
      if (enviando) return;
      enviando = true;
      campo.value = '';
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      try {
        const r = await deps.enviar(ROTAS_SESSAO.totp, { codigo });
        seguir(r.dados || {});
      } catch (err) {
        // O servidor só julga senha e código juntos, aqui. Errou qualquer um: a sessão volta para a senha.
        if (err.codigo === 'credencial-invalida') { telaSenha('Senha ou código incorreto.'); return; }
        if (err.codigo === 'login-nao-configurado') { telaSemConta(); return; }
        if (CODIGOS_LOGIN.includes(err.codigo) && err.codigo !== 'totp-pendente') { telaSenha(MENSAGEM_ENTRADA[err.codigo]); return; }
        mostrarErro(erro, err, campo, botao);
        if (err.codigo !== 'bloqueado') { botao.disabled = false; campo.focus(); }
      } finally {
        enviando = false;
        botao.removeAttribute('aria-busy');
      }
    };
    campo.addEventListener('input', () => {
      campo.value = campo.value.replace(/\D/g, '').slice(0, 6);
      if (campo.value.length === 6) enviar();
    });
    const form = h('form', { class: 'acesso-form', novalidate: true },
      h('div', { class: 'campo' },
        h('label', { for: 'acesso-codigo', texto: 'Código de 6 números' }),
        campo,
        h('p', { class: 'campo-ajuda', id: 'acesso-codigo-ajuda', texto: 'Abra o aplicativo autenticador e digite o código do Grana. Admin. Ele muda a cada 30 segundos.' })),
      h('p', { class: 'acesso-dica', texto: 'Perdeu o autenticador? Refaça o cadastro no terminal deste computador.' }),
      erro,
      h('div', { class: 'bloco-acao' },
        botao,
        h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Começar de novo', onclick: () => sair(null) })));
    form.addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
    moldura('Confirme que é você', 'Falta o segundo passo.', mensagem, form);
    campo.focus();
  }

  function telaSemConta() {
    etapaAtual = 'sem-conta';
    clearInterval(relogio);
    moldura('Conta admin não criada', null, null, h('p', { class: 'acesso-texto', role: 'alert', texto: TEXTO_SEM_CONTA }));
    tela.querySelector('h1').focus();
  }

  function lerTempos(d) {
    if (typeof d.inatividadeSeg === 'number') inatividadeSeg = d.inatividadeSeg;
    if (d.expiraEm) { const t = new Date(d.expiraEm).getTime(); expiraEm = Number.isNaN(t) ? null : t; }
  }

  function seguir(d) {
    lerTempos(d);
    if (d.loginConfigurado === false) return telaSemConta();
    if (d.csrfToken) deps.definirCsrf(d.csrfToken);
    if (typeof d.inatividadeSeg === 'number') inatividadeSeg = d.inatividadeSeg;
    if (d.etapa === 'totp') return telaCodigo();
    if (d.etapa === 'senha') return telaSenha();
    if (d.etapa === 'ok') return entrar();
    return telaSenha();
  }

  function entrar() {
    etapaAtual = 'ok';
    fecharTela();
    registrarAtividade();
    ligarRelogio();
    deps.mostrarPainel();
    deps.aoEntrar();
  }

  // -- inatividade
  function registrarAtividade() {
    ultimaAtividade = Date.now();
    if (caixaAviso) { caixaAviso.remove(); caixaAviso = null; }
  }

  function ligarRelogio() {
    clearInterval(relogio);
    if (!inatividadeSeg && !expiraEm) return;
    relogio = setInterval(() => {
      if (etapaAtual !== 'ok') return;
      if (expiraEm && Date.now() >= expiraEm) { clearInterval(relogio); telaSenha(MENSAGEM_ENTRADA['sessao-expirada']); return; }
      if (!inatividadeSeg) return;
      const restante = Math.round(inatividadeSeg - (Date.now() - ultimaAtividade) / 1000);
      if (restante <= 0) { encerrarPorInatividade(); return; }
      if (restante <= AVISO_ANTES_SEG) avisarInatividade(restante);
    }, 1000);
  }

  function avisarInatividade(restante) {
    const texto = `Sem uso há algum tempo. A sessão encerra em ${restante} s.`;
    if (caixaAviso) { caixaAviso.querySelector('.aviso-inatividade-texto').textContent = texto; return; }
    caixaAviso = h('div', { class: 'aviso-inatividade', role: 'alertdialog', 'aria-labelledby': 'aviso-inatividade-texto' },
      h('p', { class: 'aviso-inatividade-texto', id: 'aviso-inatividade-texto', texto }),
      h('button', { class: 'botao botao-primario', type: 'button', texto: 'Continuar conectado',
        onclick: async () => {
          try {
            const r = await deps.enviar(ROTAS_SESSAO.renovar, {});
            const d = r.dados || {};
            if (d.etapa && d.etapa !== 'ok') { seguir(d); return; }
            if (typeof d.inatividadeSeg === 'number') inatividadeSeg = d.inatividadeSeg;
            registrarAtividade();
            if (typeof d.restanteSeg === 'number' && inatividadeSeg) ultimaAtividade = Date.now() - (inatividadeSeg - d.restanteSeg) * 1000;
            deps.aviso('Sessão renovada.', 'ok');
          } catch (err) {
            // 401 de sessão já trocou a tela pelo app.js; outro erro fica visível
            if (!CODIGOS_LOGIN.includes(err.codigo)) deps.aviso(`Não deu para renovar a sessão: ${err.message}`, 'erro');
          }
        } }));
    document.body.appendChild(caixaAviso);
    caixaAviso.querySelector('button').focus();
  }

  function encerrarPorInatividade() {
    clearInterval(relogio);
    registrarAtividade();
    // o servidor também encerra; avisar é só cortesia, sem esperar
    deps.enviar(ROTAS_SESSAO.sair, {}).catch(() => {});
    telaSenha(MENSAGEM_ENTRADA.inatividade);
  }

  async function sair(mensagem = MENSAGEM_ENTRADA.saiu) {
    clearInterval(relogio);
    registrarAtividade();
    try {
      await deps.enviar(ROTAS_SESSAO.sair, {});
    } catch (err) {
      if (!CODIGOS_LOGIN.includes(err.codigo)) deps.aviso(`O servidor não confirmou a saída: ${err.message}. Feche esta aba para garantir.`, 'erro');
    }
    deps.definirCsrf(null);
    telaSenha(mensagem);
  }

  // Lê o #par= do lançador uma vez, apaga da barra e troca pelo pareamento.
  function codigoDePareamento() {
    const m = /(?:^#|[#&?])par=([A-Za-z0-9_-]{6,128})/.exec(location.hash);
    if (!m) return null;
    const semCodigo = location.hash.replace(/([#&?])par=[A-Za-z0-9_-]+&?/, '$1').replace(/[#&?]$/, '');
    history.replaceState(null, '', `${location.pathname}${location.search}${semCodigo || '#/visao-geral'}`);
    return m[1];
  }

  return {
    ROTAS_SESSAO,
    get ativo() { return etapaAtual !== null && etapaAtual !== 'ok' && !legado; },
    get entrou() { return etapaAtual === 'ok'; },
    exigirSemConta: () => telaSemConta(),
    get legado() { return legado; },
    registrarAtividade,
    sair: () => sair(),

    // Devolve true quando o painel pode desenhar (sessão ok ou servidor sem login).
    async verificar() {
      const par = codigoDePareamento();
      if (par) {
        try {
          const r = await deps.enviarSemCsrf(ROTAS_SESSAO.parear, { codigo: par });
          if (r.dados?.csrfToken) deps.definirCsrf(r.dados.csrfToken);
        } catch (err) {
          if (err.codigo === 'rota-inexistente') { legado = true; return true; }
          // código inválido, vencido ou bloqueado: tela cheia de não pareado, com o motivo do servidor no aviso
          deps.bloquear('nao-pareado');
          if (err.codigo !== 'nao-pareado') deps.aviso(`O pareamento falhou: ${err.message}`, 'erro');
          return false;
        }
      }
      let d;
      try {
        d = (await deps.ler(ROTAS_SESSAO.sessao)).dados || {};
      } catch (err) {
        if (err.codigo === 'rota-inexistente') { legado = true; return true; }
        return false; // nao-pareado e 401 de login já trocaram a tela
      }
      // Camadas em ordem: sem pareamento, nada mais importa (nem dizer se a conta existe).
      if (d.etapa === 'nao-pareado') { deps.bloquear('nao-pareado'); return false; }
      if (d.loginConfigurado === false) { telaSemConta(); return false; }
      // servidor antigo: /api/sessao sem etapa = só CSRF, sem login
      if (!d.etapa) { legado = true; if (d.csrfToken) deps.definirCsrf(d.csrfToken); return true; }
      if (d.csrfToken) deps.definirCsrf(d.csrfToken);
      lerTempos(d);
      if (d.etapa === 'ok') {
        etapaAtual = 'ok';
        if (typeof d.restanteSeg === 'number' && inatividadeSeg) ultimaAtividade = Date.now() - (inatividadeSeg - d.restanteSeg) * 1000;
        ligarRelogio();
        return true;
      }
      seguir(d);
      return false;
    },

    // Chamado pelo app.js quando um pedido volta 401 de login.
    exigir(codigo) {
      if (legado) return;
      clearInterval(relogio);
      if (codigo === 'totp-pendente') { if (etapaAtual !== 'totp') telaCodigo(); return; }
      if (etapaAtual === 'senha' && tela) return;
      telaSenha(MENSAGEM_ENTRADA[codigo]);
    },

    // Ação destrutiva com sessão velha (403 reautenticar): pede o código de novo, uma vez.
    async reautenticar() {
      return new Promise((resolver) => {
        let ok = false;
        const erro = linhaErro();
        const campo = h('input', { id: 'reaut-codigo', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', class: 'mono' });
        const botao = h('button', { class: 'botao botao-primario', type: 'submit', texto: 'Confirmar' });
        const form = h('form', { class: 'modal-form', novalidate: true },
          h('div', { class: 'campo' }, h('label', { for: 'reaut-codigo', texto: 'Código de 6 números' }), campo),
          erro,
          h('div', { class: 'modal-acoes' },
            h('button', { class: 'botao botao-fantasma', type: 'button', texto: 'Cancelar', onclick: () => dlg.close() }),
            botao));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const codigo = campo.value.replace(/\D/g, '');
          campo.value = '';
          if (codigo.length !== 6) { mostrarErro(erro, { message: 'O código tem 6 números.' }, campo, botao); return; }
          botao.disabled = true;
          try {
            const r = await deps.enviar(ROTAS_SESSAO.totp, { codigo, reautenticar: true });
            if (r.dados?.csrfToken) deps.definirCsrf(r.dados.csrfToken);
            ok = true;
            dlg.close();
          } catch (err) {
            // aqui a sessão continua ok: credencial-invalida é só código errado
            mostrarErro(erro, err, campo, botao);
            if (err.codigo !== 'bloqueado') { botao.disabled = false; campo.focus(); }
          }
        });
        const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'reaut-titulo' },
          h('h2', { class: 'modal-titulo', id: 'reaut-titulo', texto: 'Confirme de novo' }),
          h('p', { class: 'modal-texto', texto: 'Esta ação mexe em produção e o seu último código tem mais de 5 minutos. Digite o código do autenticador para continuar.' }),
          form);
        document.body.appendChild(dlg);
        dlg.addEventListener('close', () => { dlg.remove(); resolver(ok); });
        dlg.showModal();
        campo.focus();
      });
    },
  };
}
