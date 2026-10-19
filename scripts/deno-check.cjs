'use strict';
// `deno check` com o Deno do PATH (CI) ou, na falta dele, o mesmo 2.9.6 da CI via npx.
const { spawnSync } = require('node:child_process');
const VERSAO = '2.9.6', alvos = process.argv.slice(2);
if (!alvos.length) { console.error('Uso: deno-check.cjs arquivo.ts...'); process.exit(2); }
const run = (cmd, args, stdio = 'inherit') => spawnSync(cmd, args, { stdio, shell: process.platform === 'win32' });
let r = run('deno', ['--version'], 'ignore');
const noPath = !r.error && r.status === 0;
r = noPath ? run('deno', ['check', ...alvos]) : run('npx', ['--yes', `deno@${VERSAO}`, 'check', ...alvos]);
process.exit(r.status ?? 1);
