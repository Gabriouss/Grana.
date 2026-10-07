'use strict';
// Git local, só leitura (dono: Keel). Nunca faz fetch, pull, commit ou push:
// "à frente/atrás" compara com a referência origin/main que já está na máquina.

const { execFileSync } = require('child_process');
const { RAIZ } = require('../config.cjs');

function git(args, prazo = 10_000) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', timeout: prazo, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tentar(args, padrao = null) {
  try { return git(args); } catch { return padrao; }
}

function ultimoCommit(caminho) {
  const args = ['log', '-1', '--format=%H%x1f%h%x1f%cI%x1f%an%x1f%s'];
  if (caminho) args.push('--', caminho);
  const linha = tentar(args);
  if (!linha) return null;
  const [hash, curto, data, autor, assunto] = linha.split('\x1f');
  return { hash, curto, data, autor, assunto };
}

function estado() {
  const branch = tentar(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) return { status: 'erro', erro: { codigo: 'git-indisponivel', mensagem: 'Não consegui ler o repositório git.' } };
  let aFrente = null, atras = null;
  const contagem = tentar(['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
  if (contagem) [aFrente, atras] = contagem.split(/\s+/).map(Number);
  const sujos = (tentar(['status', '--porcelain'], '') || '').split('\n').filter(Boolean);
  const referenciaRemota = tentar(['log', '-1', '--format=%cI', 'origin/main']);
  return {
    status: 'ok',
    branch,
    ultimoCommit: ultimoCommit(),
    origemMain: { aFrente, atras, ultimoCommitEm: referenciaRemota, observacao: 'Comparado com a cópia local de origin/main; o painel não faz git fetch.' },
    alteracoesNaoCommitadas: sujos.length,
    worktrees: (tentar(['worktree', 'list', '--porcelain'], '') || '').split('\n').filter((l) => l.startsWith('worktree ')).length,
    stashes: (tentar(['stash', 'list'], '') || '').split('\n').filter(Boolean).length,
  };
}

/** Datas (%cI) dos commits que subiram "version" do app.json — mesmo critério do build:preparar. */
function datasDosPreparos(dias = 40) {
  const saida = tentar(['log', 'HEAD', 'origin/main', `--since=${dias} days ago`, '--format=%cI', '-G', '.version.: *.[0-9]+[.][0-9]+[.][0-9]+.', '--', 'app.json']);
  if (saida === null) return null;
  return [...new Set(saida.split('\n').filter(Boolean))];
}

module.exports = { estado, ultimoCommit, datasDosPreparos };
