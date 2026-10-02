/*
 * `scripts/preparar-lancamento.ts` REAL, num sandbox com `child_process`, `fs`,
 * `process` e `Date` controlados. Zero build, zero preparo, zero escrita real.
 *
 *   node __tests__/preparo-build-falhas.cjs
 *
 * Lacuna 4 do relatorio de 01/10/2026: o corpus-teto-de-builds.ts cobre a
 * conta e o script num repo descartavel, mas nao `--emergencia` aceito e
 * recusado com a mensagem exata, nem o `git fetch` sem rede, nem a nota
 * reprovada que nao pode contar preparo. Aqui o script roda por inteiro e o
 * teste afirma QUAIS chamadas aconteceram (git, escrita em disco), nao so o
 * texto que saiu.
 *
 * O corpus-teto-de-builds.ts continua valendo: ele usa git de verdade e este
 * usa dubles. Um nao substitui o outro.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
let aprovadas = 0;
const ok = (r) => { aprovadas++; console.log('  ok  ' + r); };

const compilar = (arq) => ts.transpileModule(fs.readFileSync(path.join(root, arq), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function modulo(arq, deps) {
  const m = { exports: {} };
  vm.runInNewContext(compilar(arq), {
    exports: m.exports, module: m, console, require: (id) => { if (id in deps) return deps[id]; throw new Error('import nao simulado em ' + arq + ': ' + id); },
  });
  return m.exports;
}
const notas = modulo('lib/notas-release.ts', {});
const teto = modulo('scripts/teto-de-builds.ts', {});
const SCRIPT = compilar('scripts/preparar-lancamento.ts');

/* Sexta, 02/10/2026, 12:00 locais. A semana vai de 28/09 a 04/10. */
const AGORA = new Date(2026, 9, 2, 12, 0, 0).getTime();
const local = (d, h = 10) => new Date(2026, 8, d, h, 0, 0).toISOString();
const SEMANA = [local(28), local(29), local(30)];          // 3 preparos nesta semana
const SEMANA_PASSADA = [local(21), local(22), local(23), local(24)];
const APP_JSON = '{\n  "expo": {\n    "version": "1.10.5"\n  }\n}\n';
const NOTA_BOA = 'Corrige tela branca após desbloqueio por digital';
const NOTA_RUIM = 'Corrige tela branca apos desbloqueio por digital';

class SaiuDoScript extends Error { constructor(c) { super('exit ' + c); this.codigo = c; } }

function rodar({ argv, datas, fetchFalha = false, logFalha = false }) {
  const e = { stdout: [], stderr: [], escritas: [], comandos: [] };
  class DataFixa extends Date {
    constructor(...a) { if (a.length === 0) super(AGORA); else super(...a); }
    static now() { return AGORA; }
  }
  const sandbox = {
    exports: {}, __dirname: path.join(root, 'scripts'), Date: DataFixa, JSON, String, Number, Array, Error, Promise, RegExp, Math, Object,
    console: { log: (...a) => e.stdout.push(a.join(' ')), error: (...a) => e.stderr.push(a.join(' ')), warn: (...a) => e.stderr.push(a.join(' ')) },
    process: { argv: ['node', 'preparar-lancamento.ts', ...argv], exit: (c) => { throw new SaiuDoScript(c); } },
    require: (id) => {
      if (id === 'child_process') {
        return { execFileSync: (cmd, args) => {
          e.comandos.push([cmd, ...args]);
          if (cmd !== 'git') throw new Error('o script chamou algo que nao e git: ' + cmd);
          if (args[0] === 'fetch') { if (fetchFalha) throw new Error('sem rede'); return ''; }
          if (args[0] === 'log') { if (logFalha) throw new Error('git quebrou'); return datas.join('\n') + (datas.length ? '\n' : ''); }
          throw new Error('git inesperado: ' + args[0]);
        } };
      }
      if (id === 'fs') return { readFileSync: () => APP_JSON, writeFileSync: (arq, conteudo) => e.escritas.push([arq, conteudo]) };
      if (id === 'path') return path;
      if (id === '../lib/notas-release') return notas;
      if (id === './teto-de-builds') return teto;
      if (id === './env-fora-da-build') return { variaveisNoPacoteDaBuild: () => ({ vaoNoPacote: [], pastasNoPacote: [], fonte: '.easignore' }) };
      throw new Error('import nao simulado: ' + id);
    },
  };
  try { vm.runInNewContext(SCRIPT, sandbox, { filename: 'preparar-lancamento.ts' }); e.saida = 0; }
  catch (x) { if (x instanceof SaiuDoScript) e.saida = x.codigo; else throw x; }
  e.err = e.stderr.join('\n'); e.out = e.stdout.join('\n');
  return e;
}
const soGit = (e) => e.comandos.every((c) => c[0] === 'git' && ['fetch', 'log'].includes(c[1]));

// 1. Semana cheia, sem --emergencia: recusa, zero escrita, so git de leitura.
{
  const e = rodar({ argv: [NOTA_BOA], datas: SEMANA });
  assert.equal(e.saida, 1);
  assert.ok(e.err.includes('BLOQUEADO — esta semana já teve 3 builds, e o teto é 3 (segunda a domingo).'), e.err);
  assert.ok(e.err.includes('Nenhum arquivo foi alterado.'));
  assert.equal(e.escritas.length, 0, 'nada escrito no app.json');
  assert.ok(soGit(e), 'so git fetch/log: nenhum eas, nenhum commit');
  ok('semana cheia sem --emergencia: BLOQUEADO com a mensagem exata, zero escrita, so git de leitura');
}

// 2. Semana cheia COM --emergencia: libera, avisa que e a 4a, sobe a versao e so IMPRIME o eas build.
{
  const e = rodar({ argv: ['--emergencia', NOTA_BOA], datas: SEMANA });
  assert.equal(e.saida, 0);
  assert.ok(e.err.includes('ATENÇÃO — fora do teto: esta será a build 4 da semana (teto 3), liberada por --emergencia.'), e.err);
  assert.equal(e.escritas.length, 1);
  assert.ok(e.escritas[0][0].endsWith('app.json'));
  assert.ok(e.escritas[0][1].includes('"version": "1.10.6"'), 'patch sobe 1.10.5 -> 1.10.6');
  assert.ok(e.out.includes('Build 4 de 3 desta semana'));
  assert.ok(e.out.includes('eas build --profile preview --platform android --message'), 'imprime o comando');
  assert.ok(soGit(e), 'imprimir nao e disparar: nenhum comando eas foi executado');
  ok('--emergencia em semana cheia: aviso exato, versao sobe uma vez, o eas build so e impresso');
}

// 3. Semana com 2 preparos: esta e a 3 de 3, sem aviso de emergencia.
{
  const e = rodar({ argv: [NOTA_BOA], datas: SEMANA.slice(0, 2) });
  assert.equal(e.saida, 0);
  assert.ok(e.out.includes('Build 3 de 3 desta semana'));
  assert.ok(!e.err.includes('ATENÇÃO'));
  assert.equal(e.escritas.length, 1);
  ok('semana com 2: a 3a passa como "Build 3 de 3", sem aviso de emergencia');
}

// 4. Preparos de semana passada nao contam.
{
  const e = rodar({ argv: [NOTA_BOA], datas: SEMANA_PASSADA });
  assert.equal(e.saida, 0);
  assert.ok(e.out.includes('Build 1 de 3 desta semana'));
  ok('quatro preparos da semana passada nao contam nesta semana');
}

// 5. Sem rede: o fetch falha, o aviso sai, a contagem usa o que ha local e o fluxo segue.
{
  const e = rodar({ argv: [NOTA_BOA], datas: SEMANA.slice(0, 1), fetchFalha: true });
  assert.ok(e.err.includes('AVISO — não consegui consultar o GitHub.'), e.err);
  assert.ok(e.err.includes('pode faltar o que a outra máquina preparou'));
  assert.equal(e.saida, 0);
  assert.ok(e.out.includes('Build 2 de 3 desta semana'), 'a contagem local ainda vale');
  ok('git fetch sem rede: avisa que a contagem pode estar incompleta e segue com a contagem local');
}
// 5b. Sem rede E semana cheia local: continua recusando (o aviso nao e licenca).
{
  const e = rodar({ argv: [NOTA_BOA], datas: SEMANA, fetchFalha: true });
  assert.equal(e.saida, 1);
  assert.ok(e.err.includes('AVISO') && e.err.includes('BLOQUEADO'));
  assert.equal(e.escritas.length, 0);
  ok('sem rede com 3 preparos locais: avisa e recusa, sem escrever');
}

// 6. Log do git quebrado: recusa (sem contagem nao ha como afirmar que cabe).
{
  const e = rodar({ argv: [NOTA_BOA], datas: [], logFalha: true });
  assert.equal(e.saida, 1);
  assert.ok(e.err.includes('BLOQUEADO — não consegui ler o histórico do git para contar as builds da semana.'));
  assert.equal(e.escritas.length, 0);
  ok('historico ilegivel: BLOQUEADO, zero escrita (nao libera em silencio)');
}

// 7. Nota reprovada: nao escreve, nao conta, mesmo com --emergencia e semana cheia.
for (const [rotulo, argv, datas] of [
  ['semana vazia', [NOTA_RUIM], []],
  ['semana cheia com --emergencia', ['--emergencia', NOTA_RUIM], SEMANA],
]) {
  const e = rodar({ argv, datas });
  assert.equal(e.saida, 1, rotulo);
  assert.ok(e.err.includes('REPROVADA'), rotulo + ': ' + e.err);
  assert.ok(e.err.includes('Nenhum arquivo foi alterado.'));
  assert.equal(e.escritas.length, 0, rotulo + ': nota reprovada nao pode gastar versao');
  assert.ok(soGit(e));
  ok('nota reprovada (' + rotulo + '): REPROVADA, zero escrita, nenhuma versao gasta');
}

// 8. Sem mensagem: uso e saida 2, antes de qualquer git.
{
  const e = rodar({ argv: ['--emergencia'], datas: SEMANA });
  assert.equal(e.saida, 2);
  assert.ok(e.err.includes('Uso: npm run build:preparar'));
  assert.equal(e.comandos.length, 0, 'sem mensagem, nem git foi chamado');
  assert.equal(e.escritas.length, 0);
  ok('so --emergencia, sem mensagem: uso e saida 2, nada executado');
}

console.log('\n' + aprovadas + '/' + aprovadas + ' checagens de preparo-build-falhas passaram\n');
