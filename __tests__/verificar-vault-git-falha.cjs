'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'scripts', 'verificar-vault.mjs');
const temporario = fs.mkdtempSync(path.join(os.tmpdir(), 'verificar-vault-git-'));
const gitFalso = path.join(temporario, process.platform === 'win32' ? 'git.cmd' : 'git');

try {
  if (process.platform === 'win32') {
    fs.writeFileSync(gitFalso, '@echo off\r\nexit /b 1\r\n');
  } else {
    fs.writeFileSync(gitFalso, '#!/bin/sh\nexit 1\n');
    fs.chmodSync(gitFalso, 0o755);
  }

  const env = { ...process.env };
  env.GRANA_VERIFICAR_VAULT_GIT = gitFalso;

  const resultado = spawnSync(process.execPath, [script, temporario], {
    cwd: repo,
    env,
    encoding: 'utf8',
  });

  assert.equal(resultado.error, undefined, `não iniciou o verificador: ${resultado.error?.message}`);
  assert.notEqual(resultado.status, 0, 'o verificador não pode continuar sem conseguir rodar o git');
  const saida = `${resultado.stdout ?? ''}${resultado.stderr ?? ''}`;
  assert.match(saida, /não consegui rodar o git:/, 'a mensagem precisa identificar a falha do git');
  assert.match(saida, /resultado não é confiável/, 'a mensagem precisa impedir interpretação benigna');
  console.log('verificar-vault-git-falha: ok');
} finally {
  fs.rmSync(temporario, { recursive: true, force: true });
}
