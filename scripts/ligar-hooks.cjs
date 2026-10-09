'use strict';
// A pasta .git/hooks não vai para o GitHub: cada clone precisa apontar o git
// para .githooks uma vez. Roda no `prepare` do npm; fora de um clone git
// (build da Vercel, pacote do EAS) não faz nada e nunca derruba a instalação.
const { execFileSync } = require('node:child_process');
try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  console.log('[ligar-hooks] core.hooksPath = .githooks');
} catch {
  // sem git ou fora de um repositório: nada a ligar
}
