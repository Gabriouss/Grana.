'use strict';
// Executa o verificador real, sem rede e sem dependências de npm nos pacotes EAS.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const cp = require('node:child_process');
const api = require('../scripts/verificar-app-geral.cjs');
const catalogo = api.carregarCatalogo();
const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-app-geral-'));
let n = 0;
function igual(a, b, motivo) { assert.deepEqual(a, b, motivo); n++; }
function pasta(nome) { const p = path.join(raiz, nome); fs.mkdirSync(p, { recursive: true }); return p; }
function escrever(dir, nome, texto) { const p = path.join(dir, nome); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, texto); }
function git(dir, ...args) { return cp.execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim(); }
function cli(args, env = {}, input = '') {
  return cp.spawnSync(process.execPath, [path.resolve('scripts/verificar-app-geral.cjs'), ...args], {
    env: { ...process.env, GITHUB_ACTIONS: '', EAS_BUILD_PROFILE: '', ...env }, input, encoding: 'utf8', windowsHide: true,
  });
}
try {
  const limpa = pasta('limpa');
  escrever(limpa, 'app/index.tsx', 'export const label = "playground replay Pix CSV";');
  escrever(limpa, 'modules/grana-voice-widget/index.ts', 'export const voz = true;');
  escrever(limpa, 'supabase/aviso.sql', "select 'grana-avisos-assinatura';");
  escrever(limpa, 'context.md', catalogo.identificadores.join(' '));
  igual(api.varrerArvore(limpa).length, 0, 'árvore geral limpa e voz permitidas');
  escrever(limpa, 'scripts/gerar.py', catalogo.identificadores[0]);
  assert.ok(api.varrerArvore(limpa).length); n++; fs.unlinkSync(path.join(limpa, 'scripts/gerar.py'));
  for (const caminho of catalogo.caminhos) {
    const dir = pasta('path-' + n); escrever(dir, caminho, '// fixture');
    assert.ok(api.varrerArvore(dir).some(a => a.regra === 'caminho-exclusivo')); n++;
  }
  for (const prefixo of catalogo.prefixos) {
    const dir = pasta('prefixo-' + n); escrever(dir, prefixo + 'novo.ts', '// fixture');
    igual(api.varrerArvore(dir)[0].regra, 'caminho-exclusivo');
  }
  for (const id of catalogo.identificadores) {
    const dir = pasta('id-' + n); escrever(dir, 'app/fonte.ts', `const x = ${id};`);
    assert.ok(api.varrerArvore(dir).some(a => a.regra === 'identificador-exclusivo')); n++;
    escrever(dir, 'app/fonte.ts', `const prefixo${id}Sufixo = true;`);
    igual(api.varrerArvore(dir).length, 0, 'limites lexicais');
  }
  for (const texto of catalogo.fragmentos) {
    const dir = pasta('fragmento-' + n); escrever(dir, 'app/fonte.ts', `const x = '${texto}';`);
    assert.ok(api.varrerArvore(dir).length); n++;
  }
  for (const config of [{ build: { play: {} } }, { build: { preview: { env: { EXPO_PUBLIC_CANAL: '' } } } }]) {
    escrever(limpa, 'eas.json', JSON.stringify(config));
    assert.ok(api.varrerArvore(limpa).some(a => a.regra === 'config-exclusiva')); n++;
  }
  escrever(limpa, 'eas.json', '{"build":{"preview":{"env":{"ROTULO":"play"}}}}');
  igual(api.varrerArvore(limpa).length, 0);
  escrever(limpa, 'eas.json', '{'); assert.throws(() => api.varrerArvore(limpa)); n++;
  fs.unlinkSync(path.join(limpa, 'eas.json'));
  const suporte = pasta('suporte');
  escrever(suporte, 'scripts/marcadores-app-de-teste.json', JSON.stringify(catalogo));
  igual(api.varrerArvore(suporte).length, 0);
  escrever(suporte, 'app/catalogo.json', JSON.stringify(catalogo));
  assert.ok(api.varrerArvore(suporte).length); n++;
  for (const alteracao of [{ ...catalogo, caminhos: [] }, { ...catalogo, versao: 99 }, { ...catalogo, caminhos: ['../escape'] }]) {
    const arq = path.join(raiz, 'invalido.json'); fs.writeFileSync(arq, JSON.stringify(alteracao));
    assert.throws(() => api.carregarCatalogo(arq)); n++;
  }
  assert.throws(() => api.carregarCatalogo(path.join(raiz, 'ausente.json'))); n++;
  for (const perfil of ['preview', 'production']) igual(cli(['--eas', '--raiz', limpa], { EAS_BUILD_PROFILE: perfil }).status, 0);
  const contaminada = pasta('contaminada'); escrever(contaminada, 'app/fonte.ts', catalogo.identificadores[0]);
  for (const perfil of ['preview', 'production']) igual(cli(['--eas', '--raiz', contaminada], { EAS_BUILD_PROFILE: perfil }).status, 1);
  for (const perfil of ['development', 'play']) igual(cli(['--eas', '--raiz', contaminada], { EAS_BUILD_PROFILE: perfil }).status, 0);
  for (const perfil of ['', 'desconhecido']) igual(cli(['--eas', '--raiz', limpa], { EAS_BUILD_PROFILE: perfil }).status, 2);
  // Pacote anterior ao npm install: só o verificador, catálogo e código.
  const pacote = pasta('pacote');
  for (const nome of ['scripts/verificar-app-geral.cjs', 'scripts/marcadores-app-de-teste.json']) escrever(pacote, nome, fs.readFileSync(nome));
  escrever(pacote, 'app/index.ts', '// limpo');
  igual(cp.spawnSync(process.execPath, [path.join(pacote, 'scripts/verificar-app-geral.cjs'), '--eas', '--raiz', pacote], {
    env: { ...process.env, EAS_BUILD_PROFILE: 'preview' }, encoding: 'utf8', windowsHide: true,
  }).status, 0, 'Node built-in somente, sem git/node_modules');
  igual(cp.spawnSync(process.execPath, [path.join(pacote, 'scripts/verificar-app-geral.cjs'), '--eas'], {
    cwd: contaminada, env: { ...process.env, EAS_BUILD_PROFILE: 'preview' }, encoding: 'utf8', windowsHide: true,
  }).status, 0, 'raiz padrão é a instalação do guarda, independente do cwd');
  fs.unlinkSync(path.join(pacote, 'scripts/marcadores-app-de-teste.json'));
  igual(cp.spawnSync(process.execPath, [path.join(pacote, 'scripts/verificar-app-geral.cjs'), '--eas', '--raiz', pacote], {
    env: { ...process.env, EAS_BUILD_PROFILE: 'preview' }, encoding: 'utf8', windowsHide: true,
  }).status, 2, 'catálogo ausente reprova');
  const evento = path.join(raiz, 'evento.json'); escrever(raiz, 'evento.json', JSON.stringify({ repository: { default_branch: 'principal' } }));
  igual(api.ehMainNoCi(limpa, { GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: evento, GITHUB_REF: 'refs/heads/principal' }), true);
  igual(api.ehMainNoCi(limpa, { GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: evento, GITHUB_REF: 'refs/heads/experimento' }), false);
  igual(api.ehMainNoCi(limpa, { GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: evento, GITHUB_BASE_REF: 'principal', GITHUB_REF: 'refs/pull/1/merge' }), true);
  igual(api.ehMainNoCi(limpa, { GITHUB_ACTIONS: 'true' }), true, 'metadado ausente protege');
  igual(api.ehMainNoCi(limpa, {}), true, 'sem git protege');
  // Repositório descartável fora do projeto; nenhum push ou branch do projeto.
  const repo = pasta('git'); git(repo, '-c', 'init.defaultBranch=principal', 'init', '-q');
  git(repo, 'config', 'user.name', 'Fixture'); git(repo, 'config', 'user.email', 'fixture@invalid.test');
  git(repo, 'config', 'core.hooksPath', path.join(raiz, 'sem-hooks'));
  git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/principal');
  escrever(repo, 'app/index.ts', '// geral'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  igual(api.ehMainNoCi(repo, {}), true);
  git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/outro');
  igual(api.ehMainNoCi(repo, {}), false, 'não usa presença de marcadores para classificar clone');
  git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/principal');
  escrever(repo, 'app/index.ts', catalogo.identificadores[0]); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'marcador');
  const sujo = git(repo, 'rev-parse', 'HEAD');
  escrever(repo, 'app/index.ts', '// limpo de novo'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'remove');
  const limpo = git(repo, 'rev-parse', 'HEAD');
  assert.ok(api.varrerIntervalo(repo, base, limpo).some(a => a.regra === 'identificador-exclusivo')); n++;
  igual(api.varrerCommit(repo, base).length, 0, 'SHA real, sem examinar HEAD contaminado');
  assert.ok(api.varrerCommit(repo, sujo).length); n++;
  // A ref e o SHA enviados chegam como stdin real, sem executar push algum.
  const zero = '0'.repeat(40);
  const prepush = (local, remoto = base, ref = 'refs/heads/principal') => cli(['--pre-push', 'origin', '--raiz', repo], {}, `refs/heads/principal ${local} ${ref} ${remoto}\n`);
  igual(prepush(base).status, 0, 'corte limpo diferente de HEAD passa');
  igual(prepush(sujo).status, 1, 'SHA enviado contaminado reprova');
  igual(prepush(limpo).status, 1, 'marcador introduzido e removido não escapa');
  igual(prepush(base, zero).status, 0, 'primeiro push limpo inspeciona raiz');
  igual(prepush(sujo, zero).status, 1, 'primeiro push inspeciona histórico inteiro');
  igual(prepush(zero).status, 2, 'exclusão do main reprova');
  igual(prepush(sujo, base, 'refs/heads/experimento').status, 0, 'destino não protegido');
  escrever(repo, '.gitignore', 'ignorado/\n');
  escrever(repo, 'ignorado/modulo.ts', catalogo.identificadores[0]);
  igual(cli(['--eas', '--raiz', repo], { EAS_BUILD_PROFILE: 'preview' }).status, 1,
    'EAS com .git percorre inclusive arquivos ignorados pelo Git');
  const arvore = git(repo, 'rev-parse', limpo + '^{tree}');
  const merge = cp.execFileSync('git', ['commit-tree', arvore, '-p', base, '-p', limpo], {
    cwd: repo, encoding: 'utf8', input: 'merge fixture\n', windowsHide: true,
  }).trim();
  assert.ok(api.varrerIntervalo(repo, base, merge).some(a => a.regra === 'merge-no-main')); n++;
  const exp = path.join(raiz, 'fora'); fs.mkdirSync(exp);
  let linkCriado = false;
  try { fs.symlinkSync(exp, path.join(limpa, 'link'), process.platform === 'win32' ? 'junction' : 'dir'); linkCriado = true; }
  catch (e) { if (e.code !== 'EPERM') throw e; }
  if (linkCriado) { assert.throws(() => api.varrerArvore(limpa)); n++; fs.unlinkSync(path.join(limpa, 'link')); }
  escrever(limpa, 'app/utf16.ts', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(catalogo.identificadores[0], 'utf16le')]));
  assert.ok(api.varrerArvore(limpa).length); n++; fs.unlinkSync(path.join(limpa, 'app/utf16.ts'));
  igual(cli(['--ci', '--raiz', contaminada], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: evento, GITHUB_REF: 'refs/heads/principal' }).status, 1);
  igual(cli(['--ci', '--raiz', contaminada], { GITHUB_ACTIONS: 'true', GITHUB_EVENT_PATH: evento, GITHUB_REF: 'refs/heads/experimento' }).status, 0);
  const segredo = 'ghp_' + 'A'.repeat(36);
  escrever(repo, 'app/index.ts', `// ${segredo}`); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'historico');
  escrever(repo, 'app/index.ts', '// removido'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'limpo');
  assert.ok(api.varrerIntervalo(repo, limpo, git(repo, 'rev-parse', 'HEAD')).some(a => a.regra === 'segredo:token-github')); n++;
  escrever(repo, '.env', 'PRIVADO_FIXTURE=valor-ficticio-apenas-local\n');
  escrever(repo, 'app/index.ts', '// valor-ficticio-apenas-local'); git(repo, 'add', 'app/index.ts'); git(repo, 'commit', '-qm', 'valor-local');
  assert.ok(api.varrerIntervalo(repo, base, git(repo, 'rev-parse', 'HEAD')).some(a => a.regra === 'segredo:valor-do-env:PRIVADO_FIXTURE')); n++;
  git(repo, 'commit', '--allow-empty', '-qm', '(cherry picked from commit fixture)');
  assert.ok(api.varrerIntervalo(repo, base, git(repo, 'rev-parse', 'HEAD')).some(a => a.regra === 'cherry-pick-no-main')); n++;
  const saida = cli(['--intervalo', base, git(repo, 'rev-parse', 'HEAD'), '--raiz', repo]);
  igual(saida.status, 1); assert.ok(!(saida.stdout + saida.stderr).includes(segredo)); n++;
  assert.throws(() => api.varrerIntervalo(repo, 'inexistente', base)); n++;
  console.log(`app-geral: ${n} verificações do módulo real; árvore, EAS, CI e histórico; nenhum hook ativado.`);
} finally {
  const alvo = path.resolve(raiz);
  if (path.dirname(alvo) !== path.resolve(os.tmpdir()) || !path.basename(alvo).startsWith('grana-app-geral-')) throw Error('Raiz temporária inválida');
  fs.rmSync(alvo, { recursive: true, force: true });
}
