'use strict';
// Hook real somente em remotos bare descartáveis; nenhuma publicação externa.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const cp = require('node:child_process');
const temporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-8a-rodada3-'));
const cliPath = path.resolve(__dirname, '../scripts/verificar-app-geral.cjs');
const api = require(cliPath), catalogo = api.carregarCatalogo();
let passou = 0, falhou = 0, sequencia = 0;
const zero = '0'.repeat(40);
function git(dir, ...args) {
  return cp.execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function pasta(nome) { const dir = path.join(temporaria, nome + ++sequencia); fs.mkdirSync(dir); return dir; }
function repo() {
  const dir = pasta('repo'); git(dir, '-c', 'init.defaultBranch=principal', 'init', '-q');
  git(dir, 'config', 'user.name', 'Fixture'); git(dir, 'config', 'user.email', 'fixture@invalid.test');
  git(dir, 'config', 'commit.gpgsign', 'false'); git(dir, 'config', 'core.hooksPath', path.join(dir, 'sem-hooks'));
  git(dir, 'remote', 'add', 'origin', 'https://example.invalid/fetch.git');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/principal');
  fs.writeFileSync(path.join(dir, 'app.ts'), '// geral'); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'base');
  return dir;
}
function commitObjeto(dir, tree, pais, mensagem = 'fixture') {
  return cp.execFileSync('git', ['commit-tree', tree, ...pais.flatMap(p => ['-p', p])], {
    cwd: dir, encoding: 'utf8', input: mensagem + '\n', windowsHide: true,
  }).trim();
}
function cli(dir, base, fim) {
  return cp.spawnSync(process.execPath, [cliPath, '--pre-push', 'origin', '--raiz', dir], {
    cwd: dir, input: `refs/heads/principal ${fim} refs/heads/principal ${base}\n`, encoding: 'utf8', windowsHide: true,
  });
}
function caso(nome, fn) {
  try { fn(); passou++; console.log('OK ' + nome); }
  catch (e) { falhou++; console.error('FALHOU ' + nome + ': ' + (e.code || e.name)); }
}
const sh = texto => "'" + texto.replaceAll("'", "'\\''") + "'";
function instalarHook(dir) {
  const hooks = path.join(dir, '.git/hooks'); fs.mkdirSync(hooks, { recursive: true });
  const chamado = path.join(dir, '.git/hook-chamado');
  fs.writeFileSync(path.join(hooks, 'pre-push'), '#!/bin/sh\n' +
    `printf 'chamado\\n' >> ${sh(chamado.replaceAll('\\', '/'))}\n` +
    `exec ${sh(process.execPath.replaceAll('\\', '/'))} ${sh(cliPath.replaceAll('\\', '/'))} --pre-push "$1" "$2" --raiz ${sh(dir.replaceAll('\\', '/'))}\n`);
  fs.chmodSync(path.join(hooks, 'pre-push'), 0o755); git(dir, 'config', 'core.hooksPath', hooks);
  return chamado;
}
function bare() {
  const dir = pasta('bare'); git(dir, '-c', 'init.defaultBranch=principal', 'init', '--bare', '-q');
  return { dir, url: pathToFileURL(dir).href };
}
try {
  caso('R8A2-1 hook real aceita pushurl diferente de fetch e múltiplas pushurls', () => {
    const dir = repo(), a = bare(), b = bare(), base = git(dir, 'rev-parse', 'HEAD'), chamado = instalarHook(dir);
    git(dir, 'config', '--add', 'remote.origin.pushurl', a.url);
    git(dir, 'config', '--add', 'remote.origin.pushurl', b.url);
    const r = cp.spawnSync('git', ['push', 'origin', `${base}:refs/heads/principal`], { cwd: dir, encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, 'push local deve passar pelo hook');
    assert.equal(fs.readFileSync(chamado, 'utf8').trim().split('\n').length, 2, 'Git chamou o hook para cada URL de push');
    for (const destino of [a, b]) assert.equal(git(destino.dir, 'rev-parse', 'refs/heads/principal'), base);
  });
  caso('R8A2-1 hook real preserva o bloqueio de segredos', () => {
    const dir = repo(), destino = bare(), chamado = instalarHook(dir);
    git(dir, 'config', 'remote.origin.pushurl', destino.url);
    const segredo = 'ghp_' + 'A'.repeat(36);
    fs.writeFileSync(path.join(dir, 'log.txt'), '// ' + segredo); git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'fixture');
    const r = cp.spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/principal'], { cwd: dir, encoding: 'utf8', windowsHide: true });
    assert.notEqual(r.status, 0); assert.ok(fs.existsSync(chamado));
    assert.match(r.stderr, /segredo:token-github/); assert.ok(!(r.stdout + r.stderr).includes(segredo));
    assert.equal(git(destino.dir, 'for-each-ref', '--format=%(refname)', 'refs/heads'), '', 'nada foi publicado no remoto local');
  });
  caso('R8A-5 merge de sincronização aceita pais adicionais ancestrais do topo remoto', () => {
    const dir = repo(), raiz = git(dir, 'rev-parse', 'HEAD'), tree = git(dir, 'rev-parse', 'HEAD^{tree}');
    const local = commitObjeto(dir, tree, [raiz], 'local'), remoto = commitObjeto(dir, tree, [raiz], 'remoto');
    const merge = commitObjeto(dir, tree, [local, remoto]);
    assert.equal(cli(dir, remoto, merge).status, 0, 'merge que um pull de duas máquinas produziria');
    const topoRemoto = commitObjeto(dir, tree, [remoto]);
    const outroLocal = commitObjeto(dir, tree, [local]);
    const mergeAntigo = commitObjeto(dir, tree, [outroLocal, topoRemoto, remoto]);
    assert.equal(cli(dir, topoRemoto, mergeAntigo).status, 0, 'todos os pais adicionais pertencem ao remoto, inclusive ancestrais');
  });
  caso('R8A-5 merge de outra linha ou octopus com um pai externo é bloqueado e orienta', () => {
    const dir = repo(), raiz = git(dir, 'rev-parse', 'HEAD'), tree = git(dir, 'rev-parse', 'HEAD^{tree}');
    const remoto = commitObjeto(dir, tree, [raiz], 'remoto'), outro = commitObjeto(dir, tree, [raiz], 'outra linha');
    const merge = commitObjeto(dir, tree, [remoto, raiz, outro]);
    const r = cli(dir, remoto, merge); assert.equal(r.status, 1); assert.match(r.stderr, /merge-no-main/);
    assert.match(r.stderr, /git fetch/); assert.match(r.stderr, /revisão/);
  });
  caso('R8A-5 topo remoto ausente pede fetch e falha fechado', () => {
    const dir = repo(), fim = git(dir, 'rev-parse', 'HEAD');
    const r = cli(dir, 'a'.repeat(40), fim); assert.equal(r.status, 2); assert.match(r.stderr, /git fetch/);
  });
  caso('R8A-5 sincronização não dispensa marcadores nem segredos dos pais', () => {
    const dir = repo(), raiz = git(dir, 'rev-parse', 'HEAD'), tree = git(dir, 'rev-parse', 'HEAD^{tree}');
    const remoto = commitObjeto(dir, tree, [raiz], 'remoto');
    fs.writeFileSync(path.join(dir, 'app.ts'), catalogo.identificadores[0]); git(dir, 'add', '.');
    const contaminada = git(dir, 'write-tree'), local = commitObjeto(dir, contaminada, [raiz]);
    const merge = commitObjeto(dir, tree, [local, remoto]);
    const r = cli(dir, remoto, merge); assert.equal(r.status, 1); assert.match(r.stderr, /identificador-exclusivo/);
    const segredo = 'ghp_' + 'A'.repeat(36), comSegredo = commitObjeto(dir, tree, [raiz], segredo);
    const segundoMerge = commitObjeto(dir, tree, [comSegredo, remoto]);
    const s = cli(dir, remoto, segundoMerge); assert.equal(s.status, 1); assert.match(s.stderr, /segredo:token-github/);
    assert.ok(!(s.stdout + s.stderr).includes(segredo));
  });
  caso('R8A-5 cherry-pick continua bloqueado com orientação', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD'), tree = git(dir, 'rev-parse', 'HEAD^{tree}');
    const fim = commitObjeto(dir, tree, [base], '(cherry picked from commit fixture)');
    const r = cli(dir, base, fim); assert.equal(r.status, 1); assert.match(r.stderr, /cherry-pick-no-main/);
    assert.match(r.stderr, /revisão/);
    assert.equal(cli(dir, zero, fim).status, 1, 'primeiro push também preserva essa política');
  });
  caso('CI executa as três suítes 8A sem ligar a guarda', () => {
    const comandos = require('../package.json').scripts['test:ci'].split(' && ');
    for (const arq of ['app-geral', 'app-geral-revisao', 'app-geral-rodada3']) {
      assert.ok(comandos.includes(`node __tests__/${arq}.cjs`), 'falta suíte ' + arq + ' no test:ci');
    }
    assert.ok(!comandos.some(c => /node scripts\/verificar-app-geral\.cjs/.test(c)), 'não liga inspeção automática da árvore');
  });
  console.log(`app-geral-rodada3: ${passou} cenários aprovados, ${falhou} falhas; hook real só em remotos descartáveis locais.`);
  process.exitCode = falhou ? 1 : 0;
} finally {
  const alvo = path.resolve(temporaria);
  if (path.dirname(alvo) !== path.resolve(os.tmpdir()) || !path.basename(alvo).startsWith('grana-8a-rodada3-')) throw Error('Raiz temporária inválida');
  fs.rmSync(alvo, { recursive: true, force: true });
}
