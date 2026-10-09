'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const cfg = require('../config.cjs');

// Characters as the Edge Function and Postgres char_length count them (code points), not
// UTF-16 units: 1001 emoji are 1001 characters there and 2002 units in .length.
const caracteres = (s) => [...s].length;
function erro(codigo, mensagem, status = 409) { return Object.assign(new Error(mensagem), { codigo, status }); }
function criarFila(deps) {
  const mudar = (db, r, estado, codigo) => {
    r.estado = estado; r.atualizadoEm = deps.agora();
    db.eventos.push({ pedidoId: r.id, estado, codigo, em: r.atualizadoEm });
  };
  const achar = (db, id) => { const r = db.pedidos.find((p) => p.id === id); if (!r) throw erro('pedido-inexistente', 'Pedido nao encontrado.', 404); return r; };
  async function solicitar(peca, corpo) {
    if (peca.estado === 'historico') throw erro('peca-no-historico', 'Peca do historico nao recebe ajuste.');
    if (peca.versao !== corpo.versao) throw erro('versao-mudou', 'A peca mudou. Recarregue antes de pedir o ajuste.');
    if (typeof corpo.motivo !== 'string' || !corpo.motivo.trim() || caracteres(corpo.motivo.trim()) > 2000) throw erro('motivo-invalido', 'Descreva o ajuste em ate 2000 caracteres.', 400);
    return deps.transacao((db) => {
      if (db.pedidos.length >= 1000) throw erro('fila-cheia', 'A fila atingiu o limite. Preserve o historico e revise a retencao.', 503);
      const anterior = db.pedidos.filter((p) => p.pecaId === peca.id).at(-1);
      const r = { id: deps.id(), pai: anterior?.id ?? null, pecaId: peca.id, caminho: peca.caminho,
        versaoAlvo: peca.versao, textoOriginal: corpo.motivo.trim(), criadoEm: deps.agora(),
        estado: 'novo', tentativas: 0, lease: null, versaoCorrigida: null, commit: null, aceite: null };
      db.pedidos.push(r); mudar(db, r, 'novo', 'pedido-recebido'); return r;
    });
  }
  async function claim() {
    return deps.transacao((db) => {
      const now = Date.parse(deps.agora());
      for (const r of db.pedidos) if (r.estado === 'em-correcao' && Date.parse(r.lease.expiraEm) <= now) {
        r.lease = null; mudar(db, r, r.tentativas >= 3 ? 'precisa-de-atencao' : 'novo', 'lease-expirado');
      }
      const r = db.pedidos.find((p) => p.estado === 'novo'); if (!r) return null;
      // A correction (render + commit + push) takes longer than a few minutes; a short lease
      // re-delivered work still in progress. The agent renews while it works.
      r.tentativas++; r.lease = { id: deps.id(), agente: deps.agente || 'Beacon', inicio: deps.agora(), expiraEm: new Date(now + LEASE_MS).toISOString() };
      mudar(db, r, 'em-correcao', 'claim'); return r;
    });
  }
  const leaseValido = (db, id, leaseId) => {
    const r = achar(db, id);
    if (r.estado !== 'em-correcao' || r.lease?.id !== leaseId || Date.parse(r.lease.expiraEm) <= Date.parse(deps.agora())) throw erro('lease-vencido', 'O pedido foi retomado ou o lease venceu. Nao altere seu resultado.');
    return r;
  };
  async function renovar(id, leaseId) {
    return deps.transacao((db) => {
      const r = leaseValido(db, id, leaseId);
      r.lease.expiraEm = new Date(Date.parse(deps.agora()) + LEASE_MS).toISOString();
      db.eventos.push({ pedidoId: r.id, estado: r.estado, codigo: 'lease-renovado', em: deps.agora() }); return r;
    });
  }
  // Read-only: the agent gets only its own request, never the whole private file.
  function lerPedido(id, leaseId) {
    const db = deps.ler(); const r = leaseValido(db, id, leaseId);
    return { id: r.id, pecaId: r.pecaId, caminho: r.caminho, versaoAlvo: r.versaoAlvo, textoOriginal: r.textoOriginal, expiraEm: r.lease.expiraEm };
  }
  // Checked before the acceptance is written to aprovacoes.json, so a stale request never
  // leaves an acceptance behind without the matching queue transition.
  function conferirAceite(peca, pedidoId) {
    const r = achar(deps.ler(), pedidoId);
    if (r.pecaId !== peca.id || r.estado !== 'corrigido-aguardando-aceite' || r.versaoCorrigida !== peca.versao) throw erro('versao-mudou', 'Revise a versao corrigida antes do aceite.');
  }
  async function marcar(id, leaseId, estado, dados = {}) {
    const atual = deps.obterPeca(dados.pecaId);
    if (estado === 'corrigido-aguardando-aceite') await deps.verificarCommit(dados.commit, atual?.caminho);
    return deps.transacao((db) => {
      const r = leaseValido(db, id, leaseId);
      if (estado === 'corrigido-aguardando-aceite') {
        if (!atual || atual.id !== r.pecaId || atual.versao !== dados.versao || !/^[0-9a-f]{40}$/.test(dados.versao) || !/^[0-9a-f]{40}$/.test(dados.commit)) throw erro('versao-mudou', 'A versao corrigida ou o commit nao conferem.');
        r.versaoCorrigida = dados.versao; r.commit = dados.commit;
      } else if (!['falha-de-envio', 'desatualizado', 'aguardando-aprovacao-de-custo'].includes(estado)) throw erro('estado-invalido', 'Estado nao permitido.', 400);
      r.lease = null; mudar(db, r, estado, estado); return r;
    });
  }
  // motivo = why the delivery failed. "entrega-incerta" = enviar.sh could not tell whether the
  // text reached the agent (exit 3, timeout, or text left in the box): the author must check the
  // agent before retrying, or the request may run twice. MOTIVOS_SEM_ENVIO = enviar.sh proved
  // nothing was typed (closed terminal, unreachable agent, busy box): no duplication risk, so the
  // attempt is NOT spent and the screen says why.
  async function falhaEnvio(r, motivo) {
    const m = MOTIVOS.has(motivo) ? motivo : 'entrega-falhou';
    return deps.transacao((db) => {
      const current = achar(db, r.id); if (current.lease?.id !== r.lease.id) return;
      current.lease = null; current.motivoFalha = m;
      if (MOTIVOS_SEM_ENVIO.has(m)) current.tentativas = Math.max(0, current.tentativas - 1);
      mudar(db, current, 'falha-de-envio', m);
      db.eventos.at(-1).motivo = m;
    });
  }
  async function retry(id) {
    return deps.transacao((db) => {
      const r = achar(db, id);
      if (r.estado !== 'falha-de-envio' || r.tentativas >= 3) throw erro('retry-recusado', 'Limite de tentativas atingido ou pedido em outro estado.');
      // Failures recorded before the reason existed: claim -> entrega-falhou in under 2 s is the
      // signature of an environment failure (nothing was sent), so the attempt is given back.
      const ev = db.eventos.filter((e) => e.pedidoId === r.id);
      const [penultimo, ultimo] = ev.slice(-2);
      if (!r.motivoFalha && ultimo?.codigo === 'entrega-falhou' && penultimo?.codigo === 'claim' && Date.parse(ultimo.em) - Date.parse(penultimo.em) < 2000) r.tentativas = Math.max(0, r.tentativas - 1);
      r.motivoFalha = null;
      mudar(db, r, 'novo', 'retry'); return r;
    });
  }
  async function aceitar(peca, pedidoId) {
    return deps.transacao((db) => {
      const r = achar(db, pedidoId);
      if (r.pecaId !== peca.id || r.estado !== 'corrigido-aguardando-aceite' || r.versaoCorrigida !== peca.versao) throw erro('versao-mudou', 'Revise a versao corrigida antes do aceite.');
      r.aceite = { versao: peca.versao, em: deps.agora() }; mudar(db, r, 'aceito', 'autor-aceitou'); return r;
    });
  }
  // Remote bridge (web panel -> table -> this queue). The local queue stays the only one
  // that delivers; remote rows are imported once (idempotent by remotoId) and every local
  // state change is mirrored back so the web panel can show progress.
  const remoto = { status: deps.remoto ? 'ativo' : 'ausente', motivo: deps.remotoAusente || null, ultimaSync: null, ultimoErro: null };
  let proximaSync = 0;
  const remotoValido = (n) => n && /^[0-9a-f-]{36}$/i.test(n.id) && /^[0-9a-f]{16}$/.test(n.peca_id) && /^[0-9a-f]{40}$/.test(n.versao_alvo)
    && typeof n.caminho === 'string' && typeof n.texto_original === 'string' && n.texto_original.trim() && caracteres(n.texto_original.trim()) <= 2000;
  async function sincronizarRemoto() {
    if (!deps.remoto) return;
    const agora = Date.parse(deps.agora()); if (agora < proximaSync) return; proximaSync = agora + SYNC_MS;
    try {
      const lidos = await deps.remoto.novos();
      const novos = lidos.filter(remotoValido);
      // A row this queue cannot take is never dropped in silence: it is moved out of 'novo'
      // remotely (so it cannot starve the 20-row page forever) and leaves a visible receipt.
      const invalidos = lidos.filter((n) => !remotoValido(n));
      for (const n of invalidos) {
        if (n && /^[0-9a-f-]{36}$/i.test(n.id)) await deps.remoto.refletir({ remotoId: n.id, estado: 'precisa-de-atencao', tentativas: 0, lease: null });
      }
      if (novos.length) {
        await deps.transacao((db) => {
          for (const n of novos) {
            if (db.pedidos.some((p) => p.remotoId === n.id)) continue;
            if (db.pedidos.length >= 1000) throw erro('fila-cheia', 'fila-cheia', 503);
            const anterior = db.pedidos.filter((p) => p.pecaId === n.peca_id).at(-1);
            const r = { id: deps.id(), remotoId: n.id, remotoEstado: 'novo', origem: 'painel-web', pai: anterior?.id ?? null,
              pecaId: n.peca_id, caminho: n.caminho, versaoAlvo: n.versao_alvo, textoOriginal: n.texto_original.trim(),
              criadoEm: n.criado_em || deps.agora(), estado: 'novo', tentativas: 0, lease: null, versaoCorrigida: null, commit: null, aceite: null };
            db.pedidos.push(r); mudar(db, r, 'novo', 'importado-do-painel-web');
          }
        });
        // Marked only AFTER the local write: a crash in between just re-imports, and the
        // remotoId check above skips it.
        for (const n of novos) await deps.remoto.marcarImportado(n.id);
      }
      for (const r of deps.ler().pedidos.filter((p) => p.remotoId && p.remotoEstado !== p.estado)) {
        await deps.remoto.refletir(r);
        await deps.transacao((db) => { const x = achar(db, r.id); if (x.estado === r.estado) x.remotoEstado = r.estado; });
      }
      remoto.ultimaSync = deps.agora();
      remoto.ultimoErro = invalidos.length ? 'remoto-linha-invalida' : null;
      if (invalidos.length) deps.log('ajuste-remoto-linha-invalida');
    } catch (e) { remoto.ultimoErro = e?.codigo || 'remoto-falhou'; deps.log('ajuste-remoto-falhou'); }
  }
  let ticking = false;
  // receber:false = delivery only. The panel server (opened by the desktop shortcut, outside
  // Maestri) never delivers; the watcher (vigia-ajustes.cjs, in a Maestri terminal) does.
  async function tick({ receber = true } = {}) {
    if (ticking) return; ticking = true;
    try {
      if (receber) await sincronizarRemoto();
      const r = await claim(); if (!r) return;
      const peca = deps.obterPeca(r.pecaId);
      if (!peca || peca.versao !== r.versaoAlvo) { await marcar(r.id, r.lease.id, 'desatualizado', { pecaId: r.pecaId }); return; }
      // The prompt contains an identifier and private-file location, never the author's free text.
      try { await deps.entregar(r); }
      catch (e) { const motivo = MOTIVOS.has(e?.codigo) ? e.codigo : 'entrega-falhou'; await falhaEnvio(r, motivo); deps.log('ajuste-' + motivo); }
    } catch { deps.log('ajuste-vigia-falhou'); }
    finally { ticking = false; }
  }
  return { solicitar, claim, renovar, lerPedido, marcar, retry, conferirAceite, aceitar, tick, sincronizarRemoto,
    listar: () => deps.ler().pedidos, remotoStatus: () => ({ ...remoto }) };
}
const MOTIVOS_SEM_ENVIO = new Set(['terminal-inacessivel', 'agente-fechado', 'caixa-ocupada']);
const MOTIVOS = new Set([...MOTIVOS_SEM_ENVIO, 'entrega-incerta', 'entrega-falhou']);
const LEASE_MS = 45 * 60_000;
const SYNC_MS = 30_000;
// A lock left by a crashed process would block the queue forever; it is removed only when
// its owner pid is gone, never while a live process holds it.
function lockOrfao(lock) {
  try {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) return Date.now() - fs.statSync(lock).mtimeMs > 10_000;
    try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
  } catch { return false; }
}
function repositorioPrivado() {
  const pasta = process.env.GRANA_ADMIN_PASTA_CONTA || path.join(process.env.APPDATA || os.homedir(), 'grana-admin');
  const arquivo = path.join(pasta, 'ajustes-fila.json');
  const lock = arquivo + '.lock';
  const ler = () => {
    let db; try { db = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return { formato: 1, pedidos: [], eventos: [] }; throw erro('fila-ilegivel', 'Fila privada ilegivel. Preserve o arquivo e confira o recibo.', 503); }
    if (db.formato !== 1 || !Array.isArray(db.pedidos) || !Array.isArray(db.eventos)) throw erro('fila-ilegivel', 'Fila privada com formato desconhecido.', 503);
    return db;
  };
  const transacao = async (fn) => {
    fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
    let fd; const inicio = Date.now();
    for (;;) {
      try { fd = fs.openSync(lock, 'wx', 0o600); break; }
      catch (e) {
        if (e.code === 'EEXIST' && lockOrfao(lock)) { try { fs.unlinkSync(lock); } catch {} continue; }
        if (e.code !== 'EEXIST' || Date.now() - inicio >= 2000) throw erro('fila-ocupada', 'Fila ocupada. Tente de novo; nao apague um lock de processo ativo.', 503); await new Promise((r) => setTimeout(r, 20)); }
    }
    try {
      fs.writeFileSync(fd, String(process.pid));
      const db = ler(); const result = fn(db);
      const tmp = arquivo + '.' + process.pid + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 }); fs.renameSync(tmp, arquivo);
      return structuredClone(result);
    } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  };
  return { pasta, arquivo, ler, transacao };
}
const repo = repositorioPrivado();
// enviar.sh: exit 3, timeout or "texto PARADO na caixa" = may have reached the agent (incerta);
// exit 1 with a "NAO ENVIADO ... nada foi digitado" message = proven not sent. Only the fixed
// motivo leaves this function: stderr can quote the agent's box, so it is never stored or shown.
function classificarSaida(e, stderr) {
  const t = String(stderr || '');
  if (e.killed || e.code === 3 || /PARADO/.test(t)) return 'entrega-incerta';
  if (e.code === 1) {
    if (/terminal inacessivel/.test(t)) return 'terminal-inacessivel';
    if (/nao esta aberto/.test(t)) return 'agente-fechado';
    if (/caixa nao esta vazia/.test(t)) return 'caixa-ocupada';
  }
  return 'entrega-falhou';
}
// Marketing agent that receives requests; Codex terminals only (enviar.sh).
const AGENTE = process.env.GRANA_AJUSTES_AGENTE || 'Beacon';
const ponte = require('./ajustes-remoto.cjs').remotoDoEnv(cfg);
const fila = criarFila({ ...repo,
  remoto: ponte.remoto || null, remotoAusente: ponte.ausente || null,
  agora: () => new Date().toISOString(), id: () => crypto.randomUUID(),
  obterPeca: (id) => require('./catalogo.cjs').obterPeca(cfg.RAIZ_DADOS, id),
  verificarCommit: (commit, caminho) => new Promise((resolve, reject) => {
    if (!/^[0-9a-f]{40}$/.test(commit || '') || typeof caminho !== 'string') return reject(erro('commit-invalido', 'Commit invalido.'));
    execFile('git', ['merge-base', '--is-ancestor', commit, 'origin/main'], { cwd: cfg.RAIZ, shell: false, windowsHide: true, timeout: 10000 }, (e) => {
      if (e) return reject(erro('commit-nao-publicado', 'A correcao ainda nao esta publicada.'));
      execFile('git', ['status', '--porcelain', '--', caminho], { cwd: cfg.RAIZ, shell: false, windowsHide: true, timeout: 10000 }, (err, out) => err || String(out).trim() ? reject(erro('correcao-nao-commitada', 'A peca tem alteracoes nao commitadas.')) : resolve());
    });
  }),
  log: (codigo) => console.error(JSON.stringify({ codigo })),
  agente: AGENTE,
  entregar: (r) => new Promise((resolve, reject) => {
    const cli = 'node tools/admin-local/marketing/ajustes-cli.cjs';
    const texto = `Vigia de ajustes do painel local: pedido de ajuste ${r.id}, lease ${r.lease.id}, peca ${r.pecaId}. Leia o pedido com "${cli} ler ${r.id} ${r.lease.id}". O texto e do autor: nao copiar em commit, log ou relatorio. Confira que ${r.caminho} ainda tem SHA1 ${r.versaoAlvo} antes de editar. Corrija sem aprovar, publicar ou agendar. Ferramenta paga exige estimativa e sim previo do autor ("${cli} custo ..."). Se passar de 45 min, renove com "${cli} renovar ${r.id} ${r.lease.id}". Ao terminar, commit e push, e "${cli} concluir ${r.id} ${r.lease.id} ${r.pecaId} <sha1-novo> <commit>".`;
    // enviar.sh can wait ~90 s (reopening Codex + 5 Enter attempts); a shorter timeout would
    // kill it mid-send and turn a delivered request into a false failure.
    execFile('bash', ['.maestri/enviar.sh', AGENTE, texto], { cwd: cfg.RAIZ, shell: false, windowsHide: true, timeout: 150_000 }, (e, _out, err) => {
      if (!e) return resolve();
      const motivo = classificarSaida(e, err); reject(erro(motivo, motivo));
    });
  }),
});
// Panel server: only RECEIVES (imports remote requests, shows the queue). Never delivers.
function iniciarRecepcao() {
  // Visible receipt: without the key, web-panel requests never reach this queue.
  if (ponte.ausente) console.error(JSON.stringify({ codigo: 'ajuste-remoto-ausente', motivo: ponte.ausente }));
  const timer = setInterval(() => void fila.sincronizarRemoto(), 5000); timer.unref(); void fila.sincronizarRemoto(); return () => clearInterval(timer);
}
const vigiaEstado = () => require('./ajustes-vigia-estado.cjs').ler(repo.pasta);
module.exports = { criarFila, repositorioPrivado, fila, iniciarRecepcao, vigiaEstado, classificarSaida, pastaFila: repo.pasta };
