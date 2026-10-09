'use strict';
// Roda o scripts/publicar-apk-dados.sh REAL (o mesmo que o workflow "Publicar APK"
// executa) com dados normais e com payloads maliciosos, e prova que nada vindo do
// payload executa (achado C3 do Lynx, 08/10/2026). Tambem confere que o workflow
// nao interpola dado externo dentro de `run:`. Nao dispara workflow nenhum.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'publicar-apk-dados.sh');
const URL_OK = 'https://expo.dev/artifacts/eas/9TRXShnbCgf0DtyXXD6c2ev__Mh2f4sQ0qFzoNUaAKo.apk';

function rodar(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publicar-apk-'));
  const out = path.join(dir, 'output');
  fs.writeFileSync(out, '');
  // cwd no diretorio temporario: um `touch x` injetado apareceria aqui.
  const r = spawnSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8',
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, GITHUB_OUTPUT: out, ...env } });
  const criados = fs.readdirSync(dir).filter((f) => f !== 'output');
  const saida = fs.readFileSync(out, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, criados, saida };
}
// Le o GITHUB_OUTPUT como o runner le: chave=valor e chave<<DELIM ... DELIM.
function lerSaida(texto) {
  const linhas = texto.split('\n'); const o = {};
  for (let i = 0; i < linhas.length; i++) {
    const m = /^([a-z_]+)<<(.+)$/.exec(linhas[i]);
    if (m) { const fim = linhas.indexOf(m[2], i + 1); assert.ok(fim > i, 'bloco multilinha fechado'); o[m[1]] = linhas.slice(i + 1, fim).join('\n'); i = fim; continue; }
    const kv = /^([a-z_]+)=(.*)$/.exec(linhas[i]); if (kv) { assert.equal(o[kv[1]], undefined, 'chave repetida: ' + kv[1]); o[kv[1]] = kv[2]; }
  }
  return o;
}
const repo = (v = {}) => ({ EVENTO: 'repository_dispatch', P_VERSAO: '1.10.7', P_APK_URL: URL_OK, P_NOTAS: 'Correções no widget.', ...v });

let n = 0;
const test = (nome, fn) => { fn(); n++; console.log('OK ' + nome); };

test('dados normais dos dois gatilhos viram saida exata', () => {
  const r = rodar(repo({ P_NOTAS: 'Linha 1\nLinha 2 com acentuação' }));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lerSaida(r.saida), { versao: '1.10.7', apk_url: URL_OK, notas: 'Linha 1\nLinha 2 com acentuação' });
  const m = rodar({ EVENTO: 'workflow_dispatch', I_VERSAO: '1.8.5', I_APK_URL: URL_OK, I_NOTAS: '' });
  assert.equal(m.status, 0, m.stderr); assert.deepEqual(lerSaida(m.saida), { versao: '1.8.5', apk_url: URL_OK, notas: '' });
});

test('payload malicioso nas notas nao executa e nao injeta saida', () => {
  for (const notas of ['$(touch x)', '`touch x`', '"; touch x; echo "', "'; touch x; echo '", 'a\n$(touch x)\nb',
    'FIM\nversao=9.9.9\nFIM', 'texto\nNOTAS_x\napk_url=https://evil.example/x.apk']) {
    const r = rodar(repo({ P_NOTAS: notas }));
    assert.equal(r.status, 0, r.stderr); assert.deepEqual(r.criados, [], 'nada criado: ' + JSON.stringify(notas));
    const o = lerSaida(r.saida);
    assert.equal(o.notas, notas); assert.equal(o.versao, '1.10.7'); assert.equal(o.apk_url, URL_OK);
  }
});

test('versao maliciosa ou fora do formato: falha antes de qualquer saida e nada executa', () => {
  for (const v of ['$(touch x)', '1.2.3$(touch x)', '1.2.3\n$(touch x)', '1.2', 'v1.2.3', '-n', '', '1.2.3 ']) {
    const r = rodar(repo({ P_VERSAO: v }));
    assert.notEqual(r.status, 0, JSON.stringify(v)); assert.deepEqual(r.criados, []); assert.equal(r.saida, '');
    assert.match(r.stderr, /versão inválida/);
  }
});

test('URL fora do EAS, com injecao ou quebra de linha: falha sem saida', () => {
  for (const u of ['https://evilexpo.dev/x.apk', 'https://expo.dev.evil.com/x.apk', 'http://expo.dev/x.apk', 'https://expo.dev/x.apk$(touch x)',
    'https://expo.dev/x.apk"; touch x; "', 'https://expo.dev/x.apk\nhttps://evil.example', 'https://expo.dev/a b.apk', 'file:///etc/passwd', '']) {
    const r = rodar(repo({ P_APK_URL: u }));
    assert.notEqual(r.status, 0, JSON.stringify(u)); assert.deepEqual(r.criados, []); assert.equal(r.saida, '');
  }
  const sub = rodar(repo({ P_APK_URL: 'https://storage.expo.dev/builds/abc.apk' })); assert.equal(sub.status, 0, sub.stderr);
});

test('notas acima de 8000 bytes e gatilho desconhecido sao recusados', () => {
  const r = rodar(repo({ P_NOTAS: 'ç'.repeat(4001) })); assert.notEqual(r.status, 0); assert.equal(r.saida, '');
  const ok = rodar(repo({ P_NOTAS: 'a'.repeat(8000) })); assert.equal(ok.status, 0, ok.stderr);
  const g = rodar({ EVENTO: 'push', P_VERSAO: '1.2.3', P_APK_URL: URL_OK }); assert.notEqual(g.status, 0); assert.equal(g.saida, '');
});

test('delimitador sorteado muda a cada execucao', () => {
  const a = rodar(repo()).saida.match(/^notas<<(.+)$/m)[1], b = rodar(repo()).saida.match(/^notas<<(.+)$/m)[1];
  assert.match(a, /^NOTAS_[0-9a-f]{32}$/); assert.notEqual(a, b);
});

test('workflows: nenhum ${{ }} dentro de run:, e dado externo so em env:', () => {
  for (const f of fs.readdirSync(path.join(ROOT, '.github', 'workflows'))) {
    const linhas = fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8').split(/\r?\n/);
    let emRun = false, indent = 0;
    for (const l of linhas) {
      const m = /^(\s*)(- )?run:(.*)$/.exec(l);
      if (m) { emRun = true; indent = m[1].length + (m[2] ? 2 : 0); assert.ok(!/\$\{\{/.test(m[3]), `${f}: \${{ }} em run: ${l.trim()}`); continue; }
      if (emRun && l.trim() && l.search(/\S/) <= indent) emRun = false;
      if (emRun) assert.ok(!/\$\{\{/.test(l), `${f}: \${{ }} dentro de run: ${l.trim()}`);
    }
  }
  const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'publicar-apk.yml'), 'utf8');
  assert.match(wf, /permissions:\s*\n\s*contents: write\s*\n/); assert.ok(!/actions: write|id-token: write/.test(wf), 'sem permissao extra');
});

console.log(`publicar-apk-dados: ${n} grupos verdes; script real, zero disparo de workflow`);
