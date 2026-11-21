#!/usr/bin/env node
/*
 * Roda a suíte do `npm run test:ci`, um comando por linha de
 * `scripts/test-ci.lista`, na ordem, parando no primeiro que falhar e saindo
 * com o código dele.
 *
 * Por que existe (21/11/2026): o `test:ci` era uma cadeia de ~9 KB de
 * comandos unidos por `&&` dentro do `package.json`, e no Windows o
 * `npm run` cortava a linha: a suíte não rodava inteira. A lista tem a mesma
 * sequência, com os mesmos argumentos, e cada linha roda pelo shell como
 * rodava na cadeia.
 *
 *   node scripts/rodar-test-ci.cjs             roda a lista
 *   node scripts/rodar-test-ci.cjs --listar    só imprime os comandos
 *   node scripts/rodar-test-ci.cjs --lista X   usa outro arquivo (teste do runner)
 *
 * Para incluir uma suíte no CI, acrescente uma linha na lista (não no
 * package.json). Linhas vazias e as que começam com # são ignoradas.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');

function lerLista(arquivo) {
  return fs.readFileSync(arquivo, 'utf8')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith('#'));
}

function main(argv) {
  const i = argv.indexOf('--lista');
  const arquivo = i >= 0 ? path.resolve(argv[i + 1]) : path.join(__dirname, 'test-ci.lista');
  const comandos = lerLista(arquivo);
  if (!comandos.length) {
    console.error(`test:ci: a lista ${arquivo} está vazia`);
    return 1;
  }
  if (argv.includes('--listar')) {
    for (const c of comandos) console.log(c);
    return 0;
  }
  for (const [n, comando] of comandos.entries()) {
    console.log(`\n[test:ci ${n + 1}/${comandos.length}] ${comando}`);
    const r = spawnSync(comando, { cwd: RAIZ, shell: true, stdio: 'inherit' });
    const codigo = r.error ? 1 : (r.status ?? 1);
    if (codigo !== 0) {
      const motivo = r.error ? r.error.message : r.signal ? `sinal ${r.signal}` : `saída ${codigo}`;
      console.error(`\ntest:ci parou em ${n + 1}/${comandos.length}: ${comando} (${motivo})`);
      return codigo;
    }
  }
  console.log(`\ntest:ci: ${comandos.length} comandos passaram.`);
  return 0;
}

module.exports = { lerLista };

if (require.main === module) process.exit(main(process.argv.slice(2)));
