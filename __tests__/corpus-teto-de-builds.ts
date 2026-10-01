/*
 * Teto de 3 builds por semana, de segunda a domingo.
 *
 * Decisão do autor em 01/10/2026: a cota do EAS é de 15 builds por mês, nas
 * duas máquinas juntas, e as semanas de 31/08 e de 07/09 gastaram oito e nove
 * preparos cada. O teto guarda a reserva do fim do mês.
 *
 * Duas partes:
 *
 * 1. a conta da semana, pura, com datas LOCAIS (o teste não depende do fuso de
 *    quem roda);
 * 2. o script real `scripts/preparar-lancamento.ts`, rodado contra um
 *    repositório git descartável: é ele que recusa a quarta build, e é ele
 *    que não pode escrever no app.json quando recusa.
 */
import { execFileSync, spawnSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fimDaSemana, inicioDaSemana, situacaoDoTeto, TETO_DE_BUILDS_POR_SEMANA } from '../scripts/teto-de-builds';

let total = 0;
let falhas = 0;
function checar<T>(rotulo: string, obtido: T, esperado: T) {
  total++;
  if (JSON.stringify(obtido) !== JSON.stringify(esperado)) {
    falhas++;
    console.log(`FALHA  [${rotulo}] = ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
}

/* Data local a partir de ano, mês (1 a 12), dia e hora. */
const local = (a: number, m: number, d: number, h = 12, min = 0) => new Date(a, m - 1, d, h, min);
const dia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ── 1. A semana vai de segunda a domingo ──────────────────────────────── */
checar('o teto é 3', TETO_DE_BUILDS_POR_SEMANA, 3);
// 01/10/2026 é quinta; a semana abriu na segunda 28/09.
checar('quinta pertence à semana que abriu na segunda', dia(inicioDaSemana(local(2026, 10, 1))), '2026-09-28');
checar('segunda às 00:00 já é a semana nova', dia(inicioDaSemana(local(2026, 9, 28, 0, 0))), '2026-09-28');
checar('domingo às 23:59 ainda é a semana que abriu na segunda anterior', dia(inicioDaSemana(local(2026, 10, 4, 23, 59))), '2026-09-28');
checar('a segunda seguinte abre outra semana', dia(inicioDaSemana(local(2026, 10, 5, 0, 0))), '2026-10-05');
checar('o teto zera na segunda seguinte', dia(fimDaSemana(local(2026, 10, 1))), '2026-10-05');
checar('virada de mês e de ano no meio da semana', dia(inicioDaSemana(local(2027, 1, 2))), '2026-12-28');

/* ── 2. A conta ─────────────────────────────────────────────────────────── */
const agora = local(2026, 10, 1, 15); // quinta
const iso = (d: Date) => d.toISOString();
{
  const s = situacaoDoTeto([], agora);
  checar('semana sem build: pode preparar', [s.feitos, s.podePreparar], [0, true]);
}
{
  const s = situacaoDoTeto([iso(local(2026, 9, 28, 9)), iso(local(2026, 9, 30, 9))], agora);
  checar('duas na semana: ainda cabe a terceira', [s.feitos, s.podePreparar], [2, true]);
}
{
  const s = situacaoDoTeto([iso(local(2026, 9, 28, 9)), iso(local(2026, 9, 29, 9)), iso(local(2026, 9, 30, 9))], agora);
  checar('três na semana: a quarta não cabe', [s.feitos, s.podePreparar], [3, false]);
}
{
  /* O caso que a janela móvel resolveria diferente, e que o autor escolheu
     assim: build de DOMINGO passado não conta na semana que abriu na segunda. */
  const s = situacaoDoTeto([iso(local(2026, 9, 27, 23, 50)), iso(local(2026, 9, 26, 10)), iso(local(2026, 9, 25, 10))], agora);
  checar('builds da semana passada, inclusive de domingo à noite, não contam', [s.feitos, s.podePreparar], [0, true]);
}
{
  const s = situacaoDoTeto([iso(local(2026, 9, 28, 0, 1))], agora);
  checar('build de segunda à 00:01 já conta nesta semana', s.feitos, 1);
}
{
  const s = situacaoDoTeto(['isto não é data', '', iso(local(2026, 9, 29, 9))], agora);
  checar('data ilegível é ignorada, não contada', s.feitos, 1);
}
{
  const s = situacaoDoTeto([iso(local(2026, 9, 30, 9)), iso(local(2026, 9, 28, 9))], agora);
  checar('devolve as da semana em ordem', s.daSemana.map((d) => dia(new Date(d))), ['2026-09-28', '2026-09-30']);
}

/* ── 3. O script real, num repositório descartável ─────────────────────── */
{
  const RAIZ = join(__dirname, '..');
  const pasta = mkdtempSync(join(tmpdir(), 'grana-teto-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: pasta, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const preparar = (...args: string[]) =>
    spawnSync('npx', ['--yes', 'tsx', 'scripts/preparar-lancamento.ts', ...args], { cwd: pasta, encoding: 'utf8', shell: true });
  const versao = () => /"version"\s*:\s*"([\d.]+)"/.exec(readFileSync(join(pasta, 'app.json'), 'utf8'))![1];
  const NOTA = '"Corrige a exclusão de lançamentos que se repetem todo mês."';

  try {
    /* Só o que o script importa. O `.easignore` certo evita o outro bloqueio. */
    mkdirSync(join(pasta, 'scripts'));
    mkdirSync(join(pasta, 'lib'));
    for (const f of ['scripts/preparar-lancamento.ts', 'scripts/teto-de-builds.ts', 'scripts/env-fora-da-build.ts', 'lib/notas-release.ts']) {
      cpSync(join(RAIZ, f), join(pasta, f));
    }
    writeFileSync(join(pasta, '.easignore'), '.env\n.env.*\n!.env.example\nFeedbacks/\nScreenshots/\n');
    writeFileSync(join(pasta, 'app.json'), '{\n  "expo": {\n    "version": "1.0.0"\n  }\n}\n');
    git('init', '-q', '-b', 'master');
    git('config', 'user.email', 'teste@exemplo.com');
    git('config', 'user.name', 'Teste');
    git('add', '-A');
    /* O commit que CRIA o app.json também "muda a versão" aos olhos do -G. No
       repositório real isso aconteceu há meses; aqui ele é datado de 60 dias
       atrás para não nascer contando como a primeira build da semana. */
    const passado = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    execFileSync('git', ['commit', '-q', '-m', 'base'], {
      cwd: pasta,
      stdio: 'ignore',
      env: { ...process.env, GIT_COMMITTER_DATE: passado, GIT_AUTHOR_DATE: passado },
    });
    /* O script lê HEAD e origin/main; aqui os dois são a mesma linha. */
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    /* Três preparos, cada um commitado como o fluxo real faz. */
    for (let i = 1; i <= 3; i++) {
      const r = preparar(NOTA);
      checar(`preparo ${i} da semana passa`, r.status, 0);
      checar(`e avisa que é a build ${i} de 3`, r.stdout.includes(`Build ${i} de 3 desta semana`), true);
      git('commit', '-q', '-am', `prepara build ${i}`);
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    }
    checar('três preparos subiram a versão três vezes', versao(), '1.0.3');

    const quarta = preparar(NOTA);
    checar('a quarta build da semana é recusada', quarta.status, 1);
    checar('com o motivo na tela', /BLOQUEADO — esta semana já teve 3 builds/.test(quarta.stderr), true);
    checar('e SEM escrever no app.json', versao(), '1.0.3');
    checar('a recusa ensina a saída de emergência', quarta.stderr.includes('--emergencia'), true);

    const liberada = preparar('--emergencia', NOTA);
    checar('com --emergencia a build sai', liberada.status, 0);
    checar('avisando alto que está fora do teto', /fora do teto/.test(liberada.stderr), true);
    checar('e a versão sobe', versao(), '1.0.4');
    checar('a flag não vaza para a nota da build', liberada.stdout.includes('--emergencia'), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

console.log(`\n${total - falhas}/${total} checagens do teto de builds passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
