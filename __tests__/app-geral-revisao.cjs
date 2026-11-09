'use strict';
// Regressões R8A: executa a CLI e o scanner reais, sem push nem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process');
const api = require('../scripts/verificar-app-geral.cjs');
const catalogo = api.carregarCatalogo();
const temporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-8a-revisao-'));
const cliPath = path.resolve(__dirname, '../scripts/verificar-app-geral.cjs');
const token = 'ghp_' + 'A'.repeat(36);
const zero = '0'.repeat(40);
const url = 'https://example.invalid/grana.git';
let passou = 0, falhou = 0, sequencia = 0;
function git(dir, ...args) {
  return cp.execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
function escrever(dir, nome, conteudo) {
  const arq = path.join(dir, nome); fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, conteudo);
}
function repo() {
  const dir = path.join(temporaria, 'repo-' + ++sequencia); fs.mkdirSync(dir);
  git(dir, '-c', 'init.defaultBranch=principal', 'init', '-q');
  git(dir, 'config', 'user.name', 'Fixture'); git(dir, 'config', 'user.email', 'fixture@invalid.test');
  git(dir, 'config', 'core.hooksPath', path.join(temporaria, 'sem-hooks'));
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'remote', 'add', 'origin', url);
  git(dir, 'config', 'remote.origin.pushurl', 'BLOQUEADO-fixture');
  git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/principal');
  escrever(dir, 'app/index.ts', '// geral');
  commit(dir); return dir;
}
function commit(dir) { git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'fixture'); return git(dir, 'rev-parse', 'HEAD'); }
function cli(dir, args, input = '') {
  return cp.spawnSync(process.execPath, [cliPath, ...args, '--raiz', dir], {
    input, encoding: 'utf8', windowsHide: true, env: { ...process.env, GITHUB_ACTIONS: '', EAS_BUILD_PROFILE: '' },
  });
}
function envio(dir, local, base, ref = 'refs/heads/principal', destino = 'origin', segundo) {
  return cli(dir, ['--pre-push', destino, ...(segundo ? [segundo] : [])], `refs/heads/principal ${local} ${ref} ${base}\n`);
}
function semConteudo(r) {
  assert.ok(!(r.stdout + r.stderr).includes(token), 'a saída não revela o token');
}
function caso(nome, fn) {
  try { fn(); passou++; console.log('OK ' + nome); }
  catch (e) { falhou++; console.error('FALHOU ' + nome + ': ' + (e.code || e.name)); }
}
try {
  for (const encoding of ['utf16le', 'utf16be']) for (const nome of ['log.txt', 'notas.md', 'app/fonte.ts']) {
    caso(`R8A-1 segredo histórico ${encoding} em ${nome}`, () => {
      const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
      let bytes = Buffer.from('// ' + token, 'utf16le');
      if (encoding === 'utf16be') bytes = bytes.swap16();
      escrever(dir, nome, Buffer.concat([Buffer.from(encoding === 'utf16le' ? [255, 254] : [254, 255]), bytes]));
      commit(dir); escrever(dir, nome, '// removido'); const fim = commit(dir);
      const r = cli(dir, ['--intervalo', base, fim]);
      assert.equal(r.status, 1); assert.match(r.stderr, /segredo:token-github/); semConteudo(r);
    });
  }
  caso('R8A-1 valores locais também são comparados após decodificar', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    escrever(dir, 'log.txt', Buffer.concat([Buffer.from([255, 254]), Buffer.from('valor-ficticio-8a-local', 'utf16le')]));
    const fim = commit(dir); escrever(dir, '.env', 'PRIVADO_FIXTURE=valor-ficticio-8a-local\n');
    const r = cli(dir, ['--intervalo', base, fim]);
    assert.equal(r.status, 1); assert.match(r.stderr, /segredo:valor-do-env:PRIVADO_FIXTURE/);
    assert.ok(!(r.stdout + r.stderr).includes('valor-ficticio-8a-local'));
  });
  caso('R8A-1 binário real é dispensado; código ilegível falha fechado', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    escrever(dir, 'arquivo.bin', Buffer.from([0, 1, 2])); const fim = commit(dir);
    assert.equal(cli(dir, ['--intervalo', base, fim]).status, 0);
    escrever(dir, 'app/ilegivel.ts', Buffer.from([0, 1, 2])); const invalido = commit(dir);
    assert.equal(cli(dir, ['--intervalo', base, invalido]).status, 2);
  });
  caso('R8A-2 push por nome e pela URL de fetch, com pushurl bloqueada', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    for (const args of [['origin'], [url], ['origin', url], [url, url]]) {
      const r = envio(dir, base, base, undefined, ...args); assert.equal(r.status, 0);
    }
    assert.equal(git(dir, 'config', '--get', 'remote.origin.pushurl'), 'BLOQUEADO-fixture', 'nenhuma configuração alterada');
  });
  caso('R8A-2 URL reconhecida continua barrando marcador e segredo', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    escrever(dir, 'app/index.ts', catalogo.identificadores[0]); const fim = commit(dir);
    const r = envio(dir, fim, base, undefined, url); assert.equal(r.status, 1); assert.match(r.stderr, /identificador-exclusivo/);
    escrever(dir, 'app/index.ts', '// ' + token); const segredo = commit(dir);
    const s = envio(dir, segredo, fim, undefined, url); assert.equal(s.status, 1); semConteudo(s);
  });
  caso('R8A-2 URL desconhecida, ambígua e default ausente falham fechado', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    assert.equal(envio(dir, base, base, undefined, 'https://example.invalid/outro.git').status, 2);
    assert.equal(envio(dir, base, base, undefined, 'origin', 'https://example.invalid/outro.git').status, 2);
    git(dir, 'remote', 'add', 'espelho', url);
    assert.equal(envio(dir, base, base, undefined, url).status, 2);
    git(dir, 'remote', 'remove', 'espelho'); git(dir, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');
    assert.equal(envio(dir, base, base, undefined, url).status, 2);
  });
  caso('R8A-3 arquivo rastreado apagado sem git rm não é lido', () => {
    const dir = repo(); fs.unlinkSync(path.join(dir, 'app/index.ts'));
    assert.equal(cli(dir, ['--arvore']).status, 0);
  });
  caso('R8A-4 erros controlados distinguem causa, sem ecoar URL ou erro JSON', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    const r = envio(dir, base, base, undefined, 'https://example.invalid/' + token);
    assert.equal(r.status, 2); assert.match(r.stderr, /Remoto.*(?:desconhecido|inválido)/i); semConteudo(r);
    escrever(dir, 'eas.json', '{' + token);
    const json = cli(dir, ['--arvore']); assert.equal(json.status, 2); semConteudo(json);
    assert.ok(!json.stderr.includes('SyntaxError'), 'não imprime erro nativo do parser JSON');
  });
  caso('R8A-6 cron legítimo em URL passa; diretório exclusivo continua barrado', () => {
    for (const texto of ["fetch(base + '/functions/v1/grana-avisos-assinatura')", "cron('grana-avisos-assinatura')"]) {
      assert.equal(api.verificarArquivo('scripts/cron.ts', Buffer.from(texto), catalogo).length, 0);
    }
    assert.ok(api.verificarArquivo('app/fonte.ts', Buffer.from("import '../modules/grana-avisos/novo'"), catalogo).length);
  });
  caso('R8A-7 outras refs aceitam marcadores, mas barram segredos inclusive removidos', () => {
    const dir = repo(), base = git(dir, 'rev-parse', 'HEAD');
    escrever(dir, 'app/index.ts', catalogo.identificadores[0]); const marcador = commit(dir);
    assert.equal(envio(dir, marcador, base, 'refs/heads/experimento').status, 0);
    escrever(dir, 'log.txt', '// ' + token); commit(dir); escrever(dir, 'log.txt', '// removido'); const fim = commit(dir);
    for (const ref of ['refs/heads/experimento', 'refs/tags/fixture']) {
      const r = envio(dir, fim, base, ref); assert.equal(r.status, 1); assert.match(r.stderr, /segredo:token-github/); semConteudo(r);
    }
    const multi = cli(dir, ['--pre-push', 'origin'], `refs/heads/principal ${base} refs/heads/principal ${base}\nrefs/heads/experimento ${fim} refs/heads/experimento ${zero}\n`);
    assert.equal(multi.status, 1); semConteudo(multi);
    assert.equal(envio(dir, zero, base, 'refs/heads/experimento').status, 0, 'exclusão fora da padrão não envia conteúdo');
    assert.equal(envio(dir, 'invalido', base, 'refs/heads/experimento').status, 2, 'não dispensa validação das refs não padrão');
  });
  caso('R8A-8 somente catálogo e fixtures estão dispensados dos marcadores', () => {
    const buf = Buffer.from('const exemplo = ' + catalogo.identificadores[0]);
    assert.ok(api.verificarArquivo('scripts/verificar-app-geral.cjs', buf, catalogo).length);
    for (const nome of ['scripts/marcadores-app-de-teste.json', '__tests__/app-geral.cjs', '__tests__/app-geral-revisao.cjs']) {
      assert.equal(api.verificarArquivo(nome, buf, catalogo).length, 0);
    }
  });
  console.log(`app-geral-revisao: ${passou} cenários aprovados, ${falhou} falhas; sem hook, push ou rede.`);
  process.exitCode = falhou ? 1 : 0;
} finally {
  const alvo = path.resolve(temporaria);
  if (path.dirname(alvo) !== path.resolve(os.tmpdir()) || !path.basename(alvo).startsWith('grana-8a-revisao-')) throw Error('Raiz temporária inválida');
  fs.rmSync(alvo, { recursive: true, force: true });
}
