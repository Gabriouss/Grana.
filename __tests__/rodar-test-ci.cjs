/* Runner do `npm run test:ci` (scripts/rodar-test-ci.cjs, 21/11/2026).
 *
 * A cadeia de ~9 KB com `&&` no package.json era cortada no Windows. O
 * runner precisa manter a semântica do `&&`: ordem da lista, parada no
 * primeiro erro e o código de saída dele. E a lista real só pode citar
 * arquivos de teste que existem.
 * Rode com: node __tests__/rodar-test-ci.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const raiz = process.env.RAIZ_DO_MODULO || path.join(__dirname, '..');
const runner = path.join(raiz, 'scripts/rodar-test-ci.cjs');
assert.ok(fs.existsSync(runner), 'scripts/rodar-test-ci.cjs existe');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'test-ci-'));
const marca = (n) => path.join(tmp, `marca-${n}`);
const toca = (n) => `node -e "require('fs').writeFileSync(process.argv[1], '')" "${marca(n)}"`;
const rodar = (linhas) => {
  const lista = path.join(tmp, 'lista');
  fs.writeFileSync(lista, linhas.join('\r\n'));
  return spawnSync(process.execPath, [runner, '--lista', lista], { encoding: 'utf8' });
};

// Ordem, comentários e sucesso.
let r = rodar(['# comentário', toca(1), '', toca(2)]);
assert.equal(r.status, 0, 'tudo passou: sai 0');
assert.ok(fs.existsSync(marca(1)) && fs.existsSync(marca(2)), 'rodou as duas linhas');
assert.ok(r.stdout.indexOf('1/2') < r.stdout.indexOf('2/2'), 'na ordem da lista');

// Para no primeiro erro, com o código dele.
r = rodar([toca(3), 'node -e "process.exit(3)"', toca(4)]);
assert.equal(r.status, 3, 'sai com o código do comando que falhou');
assert.ok(fs.existsSync(marca(3)) && !fs.existsSync(marca(4)), 'não roda nada depois da falha');
assert.match(r.stderr, /parou em 2\/3/, 'diz onde parou');

// Lista vazia não passa por engano.
r = rodar(['# só comentário', '']);
assert.notEqual(r.status, 0, 'lista vazia falha');

// A lista real: todo arquivo citado existe.
const { lerLista } = require(runner);
const reais = lerLista(path.join(raiz, 'scripts/test-ci.lista'));
assert.ok(reais.length > 100, 'lista real carregada');
const faltando = reais.flatMap((c) => c.match(/__tests__\/[\w.-]+\.(?:cjs|ts|mjs|js)|scripts\/[\w.-]+\.(?:mjs|cjs)/g) || [])
  .filter((f) => !fs.existsSync(path.join(raiz, f)));
assert.deepEqual(faltando, [], 'todo arquivo citado na lista existe');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`rodar-test-ci: ok (${reais.length} comandos na lista)`);
