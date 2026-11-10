'use strict';
/*
 * O pacote legado do Granabô (`scripts/pacote-granabo-legado.cjs`) serve o
 * APK 1.10.12 sem mudar o comportamento dele, e acrescenta só a regra que
 * proíbe recomendar empréstimo ou investimento (decisões do autor de
 * 09/11/2026: "Sim, sem recomendação de empréstimo ou investimento. Isso é
 * proibido por lei e normas", e, às 21:10, o app de hoje "vai permanecer da
 * forma como está").
 *
 * O que fica preso aqui, sempre com os módulos reais:
 * 1. os dez compartilhados e o index.ts sem veto são os bytes da produção
 *    (`cca3afba`): o Livre, a cota, as categorias e a descrição de hoje;
 * 2. o Livre da regra 20, as categorias de entrada (T7) e a 1c deste
 *    repositório NÃO entram no pacote;
 * 3. o teste real do veto (`granabo-sem-recomendacao.cjs`, handler real em vm)
 *    passa no pacote com veto e CAI no pacote sem veto: vermelho antes do verde;
 * 4. o portão de acesso do handler de produção continua igual no pacote
 *    (`granabo-recusa-conta-bloqueada.cjs`).
 *
 * Fora do test:ci: precisa do commit de produção no histórico local, que um
 * clone raso do CI não tem. Roda na conferência antes de cada deploy.
 * Uso: node __tests__/granabo-pacote-legado.cjs [--repo <raiz>]
 */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');

const iRepo = process.argv.indexOf('--repo');
const RAIZ = iRepo > 0 ? path.resolve(process.argv[iRepo + 1]) : path.resolve(__dirname, '..');
const { montar, BASE, MODULOS, FUNCAO } = require(path.join(__dirname, '..', 'scripts', 'pacote-granabo-legado.cjs'));

const doGit = (rev, arquivo) => cp.execFileSync('git', ['-C', RAIZ, 'show', rev + ':' + arquivo], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const ler = (pasta, arquivo) => fs.readFileSync(path.join(pasta, arquivo));
const rodar = (teste, cwd) => cp.spawnSync(process.execPath, [path.join(RAIZ, '__tests__', teste)], { cwd, encoding: 'utf8', windowsHide: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'granabo-pacote-'));
try {
  const com = path.join(tmp, 'com-veto'), sem = path.join(tmp, 'sem-veto');
  montar(com, { raiz: RAIZ });
  montar(sem, { comVeto: false, raiz: RAIZ });

  /* 1. Produção byte a byte, menos o index.ts com veto. */
  for (const m of MODULOS) {
    const producao = doGit(BASE, m);
    assert.ok(ler(sem, m).equals(producao), 'pacote sem veto difere da produção em ' + m);
    if (m !== FUNCAO) assert.ok(ler(com, m).equals(producao), 'pacote com veto mudou ' + m);
  }
  const indexCom = ler(com, FUNCAO).toString('utf8');
  assert.ok(indexCom.includes('Recomendação financeira:'), 'o pacote com veto não tem a regra');
  assert.ok(!ler(sem, FUNCAO).toString('utf8').includes('Recomendação financeira:'), 'o pacote sem veto já tem a regra');

  /* 2. O que o APK 1.10.12 não conhece fica fora: Livre da regra 20, T7 e a descrição com barra. */
  for (const m of ['supabase/functions/_shared/livre-para-gastar.ts', 'supabase/functions/_shared/interpretar-lancamento.ts']) {
    assert.ok(!ler(com, m).equals(doGit('HEAD', m)), m + ' do repositório (mudança que o APK de hoje não conhece) entrou no pacote');
  }
  assert.ok(!indexCom.includes('sobra_do_mes'), 'a sobra confirmada da regra 20 entrou no pacote');
  assert.ok(!indexCom.includes('mes_inicio') && !ler(com, 'supabase/functions/_shared/ai-quota.ts').toString('utf8').includes('mes_inicio'), 'a 1c entrou no pacote');

  /* 3. Vermelho antes do verde no teste real do veto. */
  const verde = rodar('granabo-sem-recomendacao.cjs', com);
  assert.equal(verde.status, 0, 'o teste do veto falhou no pacote com veto:\n' + verde.stdout + verde.stderr);
  assert.match(verde.stdout, /OK Granabô sem recomendação/);
  const vermelho = rodar('granabo-sem-recomendacao.cjs', sem);
  assert.notEqual(vermelho.status, 0, 'o teste do veto passou sem o veto: ele não discrimina');
  assert.match(vermelho.stdout + vermelho.stderr, /regra de recomendação financeira ausente no prompt real/);

  /* 4. O portão de acesso do handler de produção continua igual no pacote. O caso 5 dessa suíte lê o
     supabase/schema.sql do repositório (a porta de trás do banco), que não faz parte do pacote: ele vai
     só para a pasta temporária deste teste, nunca para a pasta que o Supremo publica. */
  fs.writeFileSync(path.join(com, 'supabase', 'schema.sql'), doGit('HEAD', 'supabase/schema.sql'));
  const portao = rodar('granabo-recusa-conta-bloqueada.cjs', com);
  assert.equal(portao.status, 0, 'o portão de acesso mudou no pacote:\n' + portao.stdout + portao.stderr);

  console.log('OK pacote legado do Granabô: produção byte a byte mais só o veto; o teste do veto cai sem ele e passa com ele.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
