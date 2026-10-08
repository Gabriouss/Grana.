const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const cfg = require('../config.cjs');

const crypto = require('crypto');
const hashApp = (texto) => crypto.createHash('sha256').update(texto.replace(/\r\n/g, '\n').trimEnd()).digest('hex');
const fail = (codigo, mensagem, status = 409) => ({ ok: false, status, codigo, mensagem });
// Registry lives outside repository/EAS/Drive; no provider credential is persisted.
function arquivoEstado() {
  return path.join(process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin'), 'build-preparo.json');
}
function criarAcoesBuild(deps) {
  let ocupado = false;
  const log = (evento, erro) => deps.log?.(evento, ['git-lock', 'git-push-recusado', 'git-rede', 'git-sem-alteracao'].includes(erro?.message) ? erro.message : 'falha');
  const salvar = (estado) => deps.salvar(estado);
  async function exclusivo(fn) {
    if (ocupado) return fail('build-em-andamento', 'Ja existe uma acao de build em andamento. Confira o recibo antes de repetir.');
    ocupado = true;
    try { return await fn(); }
    catch (e) { log('build-falhou', e); return fail('build-falhou', 'A acao nao terminou. Confira o recibo e o git antes de repetir.', 503); }
    finally { ocupado = false; }
  }
  async function publicar(estado) {
    await deps.git(['fetch', 'origin']);
    const saida = (await deps.git(['log', '--format=%H', 'origin/main..HEAD'])).trim();
    const commits = saida.split(/\s+/).filter(Boolean);
    if (commits.some((hash) => hash !== estado.commit)) throw new Error('outro-commit');
    await deps.git(['push', 'origin', 'HEAD:main']);
    await deps.git(['fetch', 'origin']);
    await deps.git(['merge-base', '--is-ancestor', estado.commit, 'origin/main']);
    estado.estado = 'preparado'; salvar(estado);
  }
  async function preparar(pedido) {
    return exclusivo(async () => {
      if (pedido.confirmacao !== 'PREPARAR BUILD') return fail('confirmacao-invalida', 'Digite PREPARAR BUILD.', 400);
      const atual = deps.ler();
      if (atual && ['preparando', 'preparado', 'disparando', 'desconhecido', 'push-falhou', 'commit-falhou'].includes(atual.estado)) return fail('preparo-pendente', 'Ha um preparo com resultado pendente. Confira seu recibo antes de preparar outra versao.');
      if (deps.simular) return { ok: true, dados: { simulado: true, aviso: 'Ensaio: nao prepara, nao commita, nao publica e nao dispara.' } };
      // Fail before bump if the remote is newer or the shared index contains work.
      await deps.git(['fetch', 'origin']);
      const atras = await deps.git(['rev-list', '--count', 'HEAD..origin/main']);
      if (Number(atras.trim()) !== 0) return fail('git-atrasado', 'O repositorio esta atras do remoto. Sincronize antes de preparar.');
      const index = await deps.git(['diff', '--cached', '--name-only']);
      if (index.trim()) return fail('git-index-ocupado', 'Existe trabalho no stage de outro agente. Aguarde o commit dele.');
      const r = await deps.preparar(pedido);
      if (!r.ok) return r;
      const estado = { id: deps.id(), versao: deps.versao(), nota: pedido.mensagem.replace(/\r\n/g, '\n').trim(), estado: 'preparando', appSha: deps.appSha(), criadoEm: deps.agora() };
      salvar(estado);
      try {
        await deps.git(['add', '--', 'app.json']);
        await deps.git(['commit', '--only', '-m', `chore: prepara build preview ${estado.versao}`, '--', 'app.json']);
        estado.commit = (await deps.git(['log', '-1', '--format=%H', '--', 'app.json'])).trim();
        estado.estado = 'push-falhou'; salvar(estado);
        await publicar(estado);
      } catch (e) {
        log('preparo-nao-publicado', e);
        estado.estado = estado.commit ? 'push-falhou' : 'commit-falhou'; salvar(estado);
        return fail('preparo-nao-publicado', 'O preparo alterou app.json, mas nao foi publicado. Confira o recibo; nao dispare nem prepare de novo.', 503);
      }
      return { ok: true, dados: { ...r.dados, preparoPersistido: estado, aviso: 'Preparo commitado e publicado. O disparo exige DISPARAR BUILD.' } };
    });
  }
  async function retomar(pedido) {
    return exclusivo(async () => {
      if (pedido.confirmacao !== 'PUBLICAR PREPARO') return fail('confirmacao-invalida', 'Digite PUBLICAR PREPARO.', 400);
      const e = deps.ler();
      if (!e || e.id !== pedido.preparoId || !['push-falhou', 'commit-falhou', 'preparando'].includes(e.estado)) return fail('preparo-invalido', 'Nao ha commit de preparo para retomar. Confira o git.');
      try {
        if (!e.commit) {
          if (deps.versao() !== e.versao || deps.appSha() !== e.appSha) return fail('preparo-alterado', 'app.json mudou depois do preparo. Nao vou commitar outra mudanca.');
          const staged = (await deps.git(['diff', '--cached', '--name-only'])).trim().split(/\r?\n/).filter(Boolean);
          if (staged.some((f) => f !== 'app.json')) return fail('git-index-ocupado', 'Existe stage de outro agente.');
          const head = await deps.git(['show', 'HEAD:app.json']);
          if (hashApp(head) !== e.appSha) {
            await deps.git(['add', '--', 'app.json']);
            await deps.git(['commit', '--only', '-m', `chore: prepara build preview ${e.versao}`, '--', 'app.json']);
          }
          e.commit = (await deps.git(['log', '-1', '--format=%H', '--', 'app.json'])).trim();
          e.estado = 'push-falhou'; salvar(e);
        }
        await publicar(e); return { ok: true, dados: { preparoPersistido: e } }; }
      catch (e) { log('retomar-falhou', e); return fail('preparo-nao-publicado', 'Push recusado ou outro commit local pendente. Nada foi disparado.', 503); }
    });
  }
  async function disparar(pedido) {
    return exclusivo(async () => {
      if (pedido.confirmacao !== 'DISPARAR BUILD') return fail('confirmacao-invalida', 'Digite DISPARAR BUILD.', 400);
      const e = deps.ler();
      if (!e || e.id !== pedido.preparoId || e.estado !== 'preparado') return fail('preparo-invalido', 'O preparo nao esta pronto para disparar ou ja foi enviado.');
      if (deps.simular) return { ok: true, dados: { simulado: true, preparoPersistido: e } };
      const cli = deps.cli();
      if (!cli) return fail('eas-ausente', 'A CLI do EAS nao esta disponivel.', 503);
      await deps.git(['fetch', 'origin']);
      await deps.git(['merge-base', '--is-ancestor', e.commit, 'origin/main']);
      const naoPublicados = (await deps.git(['log', '--format=%H', 'origin/main..HEAD'])).trim();
      if (naoPublicados) return fail('commits-nao-publicados', 'HEAD tem commits nao publicados: ' + naoPublicados.split(/\s+/).slice(0, 20).join(', ') + '. Nada foi disparado.');
      if (Number((await deps.git(['rev-list', '--count', 'HEAD..origin/main'])).trim()) !== 0) return fail('git-atrasado', 'HEAD esta atras do remoto. Nada foi disparado.');
      const remoto = JSON.parse(await deps.git(['show', 'origin/main:app.json']));
      if (remoto.expo.version !== e.versao || deps.versao() !== e.versao) return fail('versao-divergente', 'A versao mudou depois do preparo. Nada foi disparado.');
      const sujo = await deps.git(['status', '--porcelain']);
      if (sujo.trim()) return fail('git-sujo', 'Ha alteracoes locais fora do preparo: ' + sujo.trim().split(/\r?\n/).slice(0, 20).join('; ') + '. Nada foi disparado.');
      if (!deps.pacoteSeguro()) return fail('pacote-inseguro', 'BLOQUEADO: arquivo sensivel iria no pacote do EAS.');
      e.estado = 'disparando'; salvar(e); // durable BEFORE outbound call; restart must not resend.
      let r;
      try { r = await deps.eas(cli, ['build', '--profile', 'preview', '--platform', 'android', '--non-interactive', '--no-wait', '--message', e.nota]); }
      catch (erro) { log('eas-desconhecido', erro); e.estado = 'desconhecido'; salvar(e); return fail('resultado-desconhecido', 'O EAS pode ter recebido o pedido. Confira as builds; nao repita o disparo.', 503); }
      e.estado = r.codigo === 0 ? 'enviado' : 'desconhecido'; e.enviadoEm = deps.agora(); salvar(e);
      if (r.codigo !== 0) return fail('resultado-desconhecido', 'A CLI falhou e o pedido pode ter sido recebido. Confira EAS e builds antes de qualquer nova tentativa.', 503);
      return { ok: true, dados: { preparoPersistido: e, aviso: 'Pedido enviado ao EAS. Aguarde o anuncio para conferir a nota.' } };
    });
  }
  async function verificar(pedido) {
    const e = deps.ler();
    if (!e || e.id !== pedido.preparoId || !['enviado', 'desconhecido'].includes(e.estado)) return fail('preparo-invalido', 'Nao ha build enviada para conferir.');
    let r;
    try { r = await deps.release(); } catch (erro) { log('nota-indisponivel', erro); return fail('nota-indisponivel', 'Nao foi possivel conferir app_release. Tente de novo.', 503); }
    if (r.status !== 'ok') return fail('nota-indisponivel', 'Nao foi possivel conferir app_release. Tente de novo.', 503);
    if (!r.linha || r.linha.version !== e.versao) return { ok: true, dados: { estado: 'aguardando-anuncio', versao: e.versao } };
    if (e.estado !== 'enviado') { e.estado = 'enviado'; salvar(e); }
    return { ok: true, dados: { estado: r.linha.notes === e.nota ? 'nota-confirmada' : 'nota-divergente', versao: e.versao, notaAprovada: e.nota, notaAnunciada: r.linha.notes } };
  }
  async function resolver(pedido) {
    return exclusivo(async () => {
      if (pedido.confirmacao !== 'CONFERI NO EAS: NAO SAIU') return fail('confirmacao-invalida', 'Digite CONFERI NO EAS: NAO SAIU.', 400);
      const e = deps.ler();
      if (!e || e.id !== pedido.preparoId || !['desconhecido', 'disparando'].includes(e.estado)) return fail('preparo-invalido', 'Nao ha disparo desconhecido para resolver.');
      e.estado = 'preparado'; e.conferidoNaoSaiuEm = deps.agora(); salvar(e);
      return { ok: true, dados: { preparoPersistido: e, aviso: 'Conferencia manual registrada. Nenhum build foi disparado. Nao confirme sem conferir EAS e builds.' } };
    });
  }
  async function regravar(pedido) {
    return exclusivo(async () => {
      if (pedido.confirmacao !== 'REGRAVAR NOTA') return fail('confirmacao-invalida', 'Digite REGRAVAR NOTA.', 400);
      const antes = await verificar(pedido);
      if (!antes.ok || antes.dados.estado === 'aguardando-anuncio') return antes;
      if (antes.dados.estado === 'nota-confirmada') return antes;
      if (deps.simular) return { ok: true, dados: { simulado: true } };
      const e = deps.ler();
      await deps.regravar(e.versao, antes.dados.notaAnunciada, e.nota);
      return verificar(pedido);
    });
  }
  return { preparar, disparar, retomar, verificar, resolver, regravar, estado: () => deps.ler() };
}

function persistencia() {
  const file = arquivoEstado();
  return {
    ler() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error('registro-ilegivel'); } },
    salvar(e) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(e, null, 2), { mode: 0o600 }); fs.renameSync(tmp, file); },
  };
}
function gitReal(args) {
  return new Promise((resolve, reject) => execFile('git', args, { cwd: cfg.RAIZ, timeout: 30000, windowsHide: true, shell: false }, (e, out, stderr) => {
    if (!e) return resolve(String(out));
    const codigo = /index.lock|another git process/i.test(stderr || '') ? 'git-lock' : /non-fast-forward|fetch first|rejected/i.test(stderr || '') ? 'git-push-recusado' : /could not resolve|unable to access|could not read/i.test(stderr || '') ? 'git-rede' : /nothing to commit/i.test(stderr || '') ? 'git-sem-alteracao' : 'git-falhou';
    reject(new Error(codigo));
  }));
}
module.exports = { criarAcoesBuild, persistencia, gitReal, hashApp };
