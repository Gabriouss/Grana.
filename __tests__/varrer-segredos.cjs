// Travas 2 e 3: o scanner real contra amostras FALSAS, montadas em tempo de
// execução para o próprio arquivo não carregar nada com formato de token.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const script = path.join(__dirname, '..', 'scripts', 'varrer-segredos.cjs');
const { varrerTexto, varrerDiretorio, lerEnv } = require(script);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'fixturefixturefixture', role, iat: 1, exp: 2 })}.${'s'.repeat(43)}`;
const A = 'a'.repeat(40);
const amostras = {
  'token-supabase-pessoal': 'sbp' + '_' + A,
  'chave-secreta-supabase': 'sb_' + 'secret_' + A,
  'token-github': 'gh' + 'p_' + A,
  'token-github-fino': 'github' + '_pat_' + A + A,
  'chave-secreta-sk': 'sk' + '_live_' + A,
  'token-vercel': 'vercel' + '_' + A,
  'token-expo': 'expo' + '_' + A,
  'chave-privada-pem': '-----BEGIN ' + 'PRIVATE KEY-----',
  'deploy-hook-vercel': 'https://api.vercel' + '.com/v1/integrations/deploy/prj_FIXTURE/abcDEF123',
  'chave-aws': 'AKIA' + 'ABCDEFGHIJKLMNOP',
  'token-slack': 'xox' + 'b-1234567890-fixture',
  'chave-groq': 'gs' + 'k_' + A,
  'chave-google': 'AI' + 'za' + 'B'.repeat(35),
};
const regras = (t, valores = []) => varrerTexto(t, 'f.js', valores).filter((a) => !a.aviso).map((a) => a.regra);

for (const [regra, amostra] of Object.entries(amostras)) {
  assert.deepEqual(regras(`const x="${amostra}";`), [regra], regra);
}
// JWT: anon passa; qualquer outro papel reprova; prefixo sozinho não basta.
assert.deepEqual(regras(`k="${jwt('anon')}"`), []);
assert.deepEqual(regras(`k="${jwt('service_role')}"`), ['jwt-papel-service_role']);
assert.deepEqual(regras(`k="${jwt('authenticated')}"`), ['jwt-papel-authenticated']);
assert.deepEqual(regras(`k="${jwt(undefined)}"`), ['jwt-papel-sem-papel']);
// A chave do Firebase só é aceita no google-services.json versionado.
assert.deepEqual(varrerTexto(amostras['chave-google'], 'google-services.json', []), []);
assert.equal(varrerTexto(amostras['chave-google'], 'app/x.ts', []).length, 1);
// Texto comum que cita os prefixos não reprova.
assert.deepEqual(regras('tokens sbp_, ghp_ e github_pat_ nunca entram; sk_ idem. eyJ sozinho também não.'), []);

// Por valor: literal, JSON escapado, URL e base64; EXPO_PUBLIC_ e valor curto ficam fora; e-mail vira aviso.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'varrer-'));
const segredo = 'valor"muito&secreto/123';
const envFile = path.join(tmp, 'env');
fs.writeFileSync(envFile, `EXPO_PUBLIC_X=publico-publico\nCURTO=abc\nMEU_SEGREDO='${segredo}'\nE2E_TEST_EMAIL=contato@example.invalid\n`);
const valores = lerEnv(envFile);
assert.deepEqual(valores.map((v) => v.nome), ['MEU_SEGREDO', 'E2E_TEST_EMAIL']);
for (const forma of [segredo, JSON.stringify(segredo).slice(1, -1), encodeURIComponent(segredo), Buffer.from(segredo).toString('base64')]) {
  assert.deepEqual(regras(`x=${forma};`, valores), ['valor-do-env:MEU_SEGREDO']);
}
assert.deepEqual(regras('publico-publico abc', valores), []);
const email = varrerTexto('mailto:contato@example.invalid', 'f.js', valores);
assert.equal(email.length, 1);
assert.equal(email[0].aviso, true);

// Diretório (export): código de saída e saída SEM o valor.
const dist = path.join(tmp, 'dist');
fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), `<script>window.k="${jwt('anon')}"</script>`);
fs.writeFileSync(path.join(dist, 'js', 'app.js'), 'console.log(1)');
fs.writeFileSync(path.join(dist, 'logo.png'), amostras['token-github']); // binário é ignorado
let r = spawnSync(process.execPath, [script, dist], { encoding: 'utf8' });
assert.equal(r.status, 0, r.stdout + r.stderr);
fs.writeFileSync(path.join(dist, 'js', 'app.js'), `fetch(u,{headers:{apikey:"${jwt('service_role')}"}});const t="${amostras['token-supabase-pessoal']}";const s="${segredo}"`);
r = spawnSync(process.execPath, [script, dist, '--valores', '--env-file', envFile], { encoding: 'utf8' });
assert.equal(r.status, 1);
const saida = r.stdout + r.stderr;
for (const esperado of ['jwt-papel-service_role', 'token-supabase-pessoal', 'valor-do-env:MEU_SEGREDO', 'js/app.js', 'BLOQUEADO']) assert.ok(saida.includes(esperado), esperado);
for (const proibido of [segredo, amostras['token-supabase-pessoal'], jwt('service_role')]) assert.ok(!saida.includes(proibido), 'a saída não pode conter o valor');
assert.deepEqual(varrerDiretorio(dist, []).map((a) => a.arquivo), ['js/app.js', 'js/app.js']);
assert.equal(spawnSync(process.execPath, [script, path.join(tmp, 'nao-existe')], { encoding: 'utf8' }).status, 2);
fs.mkdirSync(path.join(tmp, 'vazio'));
assert.equal(spawnSync(process.execPath, [script, path.join(tmp, 'vazio')], { encoding: 'utf8' }).status, 2, 'export vazio não passa como ok');

// Hook real num repositório TEMPORÁRIO (fora do projeto): commit limpo passa,
// commit com token, com valor do .env ou com JWT de outro papel é recusado.
const repo = path.join(tmp, 'repo');
fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(repo, '.githooks'));
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
fs.copyFileSync(script, path.join(repo, 'scripts', 'varrer-segredos.cjs'));
for (const hook of ['pre-commit', 'commit-msg']) {
  fs.copyFileSync(path.join(__dirname, '..', '.githooks', hook), path.join(repo, '.githooks', hook));
  fs.chmodSync(path.join(repo, '.githooks', hook), 0o755);
}
fs.writeFileSync(path.join(repo, '.env'), `MEU_SEGREDO='${segredo}'\n`);
fs.writeFileSync(path.join(repo, '.gitignore'), '.env\n');
git('init', '-q');
git('config', 'user.email', 't@example.invalid');
git('config', 'user.name', 't');
git('config', 'core.hooksPath', '.githooks');
git('add', '.githooks/pre-commit', '.githooks/commit-msg', 'scripts/varrer-segredos.cjs', '.gitignore');
git('update-index', '--chmod=+x', '.githooks/pre-commit', '.githooks/commit-msg');
git('commit', '-q', '-m', 'base');
const tentar = (nome, conteudo) => {
  fs.writeFileSync(path.join(repo, nome), conteudo);
  git('add', nome);
  const c = spawnSync('git', ['commit', '-q', '-m', nome], { cwd: repo, encoding: 'utf8' });
  if (c.status !== 0) git('reset', '-q', 'HEAD', '--', nome);
  return c;
};
assert.equal(tentar('limpo.md', `chave anon publica: ${jwt('anon')}\n`).status, 0, 'commit limpo passa');
let c = tentar('token.md', `token: ${amostras['token-github']}\n`);
assert.notEqual(c.status, 0, 'commit com token é recusado');
assert.ok((c.stdout + c.stderr).includes('token-github'));
assert.ok(!(c.stdout + c.stderr).includes(amostras['token-github']));
c = tentar('valor.md', `x=${segredo}\n`);
assert.notEqual(c.status, 0, 'commit com valor do .env é recusado');
assert.ok(!(c.stdout + c.stderr).includes(segredo));
c = tentar('papel.md', jwt('service_role') + '\n');
assert.notEqual(c.status, 0, 'commit com JWT de service_role é recusado');
// Mensagem do commit: arquivo limpo, mas token ou valor do .env na MENSAGEM é recusado.
const comMensagem = (nome, mensagem) => {
  fs.writeFileSync(path.join(repo, nome), 'limpo\n');
  git('add', nome);
  const m = spawnSync('git', ['commit', '-q', '-m', mensagem], { cwd: repo, encoding: 'utf8' });
  if (m.status !== 0) git('reset', '-q', 'HEAD', '--', nome);
  return m;
};
c = comMensagem('m1.md', `troca do token ${amostras['token-supabase-pessoal']}`);
assert.notEqual(c.status, 0, 'token na mensagem é recusado');
assert.ok((c.stdout + c.stderr).includes('mensagem do commit'));
assert.ok(!(c.stdout + c.stderr).includes(amostras['token-supabase-pessoal']));
assert.notEqual(comMensagem('m2.md', `senha ${segredo}`).status, 0, 'valor do .env na mensagem é recusado');
assert.equal(git('log', '--oneline').trim().split('\n').length, 2, 'só a base e o commit limpo existem');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('varrer-segredos: 13 formatos de token, JWT por papel, valor do .env em 4 formas, export e hooks pre-commit e commit-msg reais OK; saída sem valor');
