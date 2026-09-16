/**
 * O `.env` fica fora do pacote que o EAS manda para o servidor de build.
 *
 * Caso de origem: o `.easignore` nasceu em 01/09/2026 (`00de222`) sem a linha
 * do `.env`, e a build 1.10.2 levou os segredos da máquina que a disparou. O
 * primeiro bloco usa o `.easignore` daquele commit, lido do próprio git.
 *
 * O último bloco roda o `preparar-lancamento.ts` de verdade, numa cópia
 * temporária do projeto, e confere que ele recusa sem tocar no `app.json`.
 */
import { execFileSync, spawnSync } from 'child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ficaForaDoPacote, NOMES_DE_VARIAVEIS, variaveisNoPacoteDaBuild } from '../scripts/env-fora-da-build';

const RAIZ = join(__dirname, '..');
let passaram = 0;
let falhas = 0;
function checar(descricao: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) {
    passaram++;
  } else {
    falhas++;
    console.log(`FALHOU   ${descricao} — obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
  }
}

/* ── 1. O repositório de hoje passa; o .easignore de 01/09 não ──────────── */
checar('o projeto atual não manda arquivo de variáveis', variaveisNoPacoteDaBuild(RAIZ), { fonte: '.easignore', vaoNoPacote: [] });

const easignoreDe0109 = execFileSync('git', ['show', '00de222:.easignore'], { cwd: RAIZ, encoding: 'utf8' });
checar('com o .easignore de 01/09, o .env ia no pacote', ficaForaDoPacote('.env', easignoreDe0109), false);

/* ── 2. Formas de escrever a regra ─────────────────────────────────────── */
const REGRAS: [string, string, boolean][] = [
  ['.env', '.env', true],
  ['/.env', '.env', true],
  ['**/.env', '.env', true],
  ['.env*', '.env', true],
  ['*.env', '.env', true],
  ['.env\n.env.*\n!.env.example', '.env.local', true],
  ['.env\n.env.*\n!.env.example', '.env.example', false],
  ['.env.*', '.env', false], // o "." depois de env é obrigatório
  ['.env/', '.env', false], // só pasta
  ['config/.env', '.env', false], // aponta para dentro de uma pasta
  ['# .env', '.env', false], // comentário
  ['.env\n!.env', '.env', false], // a última regra decide
  ['!.env\n.env', '.env', true],
  ['.env*.local', '.env.local', true],
  ['.env*.local', '.env', false], // é o que o .gitignore tem, e não cobre o .env
  ['.en[vw]', '.env', true],
  // O eas-cli (biblioteca `ignore`) não nega classe: "[!v]" e "[^v]" casam com "v".
  ['.en[!v]', '.env', true],
  ['.en[^v]', '.env', true],
  ['.en[!v]', '.env.local', false],
  ['.en?', '.env', true],
  ['.env   ', '.env', true], // espaço no fim não conta
  ['', '.env', false],
];
for (const [regras, nome, fora] of REGRAS) {
  checar(`regras ${JSON.stringify(regras)} → ${nome} ${fora ? 'fora' : 'no pacote'}`, ficaForaDoPacote(nome, regras), fora);
}

/* ── 3. Mesmo resultado da biblioteca que o eas-cli usa ─────────────────── */
let ignore: ((opcoes?: object) => { add(r: string): { ignores(p: string): boolean } }) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ignore = require('ignore');
} catch {
  console.log('aviso: pacote "ignore" ausente — comparação com o eas-cli pulada');
}
if (ignore) {
  const nomes = [...NOMES_DE_VARIAVEIS, '.env.example', '.env.minha'];
  for (const [regras] of REGRAS) {
    for (const nome of nomes) {
      checar(`igual ao "ignore": ${JSON.stringify(regras)} / ${nome}`, ficaForaDoPacote(nome, regras), ignore().add(regras).ignores(nome));
    }
  }
  const atual = readFileSync(join(RAIZ, '.easignore'), 'utf8');
  for (const nome of nomes) {
    checar(`igual ao "ignore" no .easignore atual: ${nome}`, ficaForaDoPacote(nome, atual), ignore().add(atual).ignores(nome));
  }
}

/* ── 4. De onde vêm as regras, e arquivos que existem de fato ──────────── */
const pasta = mkdtempSync(join(tmpdir(), 'grana-env-'));
try {
  checar('sem regra nenhuma, tudo vai', variaveisNoPacoteDaBuild(pasta), { fonte: 'nenhuma', vaoNoPacote: NOMES_DE_VARIAVEIS });

  writeFileSync(join(pasta, '.gitignore'), '.env\n.env*.local\n');
  writeFileSync(join(pasta, '.env'), 'X=1\n');
  writeFileSync(join(pasta, '.env.example'), 'X=\n');
  checar('sem .easignore, vale o .gitignore — e ele não cobre .env.production', variaveisNoPacoteDaBuild(pasta), {
    fonte: '.gitignore',
    vaoNoPacote: ['.env.development', '.env.production', '.env.test'],
  });

  writeFileSync(join(pasta, '.easignore'), '.agents/\n');
  checar('com .easignore, o .gitignore deixa de valer', variaveisNoPacoteDaBuild(pasta).vaoNoPacote.includes('.env'), true);

  writeFileSync(join(pasta, '.easignore'), '.env\n.env.*\n!.env.example\n');
  writeFileSync(join(pasta, '.env.minha'), 'X=1\n');
  checar('regra completa: nada vai, e .env.example nunca é acusado', variaveisNoPacoteDaBuild(pasta).vaoNoPacote, []);

  writeFileSync(join(pasta, '.easignore'), '.env\n');
  checar('arquivo que existe e não tem regra é acusado', variaveisNoPacoteDaBuild(pasta).vaoNoPacote.includes('.env.minha'), true);
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

/* ── 5. O preparar-lancamento de verdade recusa, sem tocar no app.json ─── */
const projeto = mkdtempSync(join(tmpdir(), 'grana-preparar-'));
try {
  mkdirSync(join(projeto, 'scripts'));
  mkdirSync(join(projeto, 'lib'));
  for (const arquivo of ['scripts/preparar-lancamento.ts', 'scripts/env-fora-da-build.ts', 'lib/notas-release.ts']) {
    copyFileSync(join(RAIZ, arquivo), join(projeto, arquivo));
  }
  const APP = '{\n  "expo": {\n    "version": "1.0.0"\n  }\n}\n';
  writeFileSync(join(projeto, 'app.json'), APP);
  writeFileSync(join(projeto, '.env'), 'SEGREDO=de-mentira\n');
  writeFileSync(join(projeto, '.easignore'), easignoreDe0109);

  // Um comando só, com aspas: no Windows o npx é um .cmd e precisa de shell.
  const script = join(projeto, 'scripts', 'preparar-lancamento.ts');
  const rodar = () => spawnSync(`npx --yes tsx "${script}" "Melhora a navegação entre as telas"`, {
    cwd: projeto, encoding: 'utf8', shell: true,
  });

  const recusa = rodar();
  checar('com o .easignore de 01/09, o preparo sai com erro', recusa.status, 1);
  checar('e diz por quê', /BLOQUEADO[\s\S]*\.env[\s\S]*4ce2242/.test(recusa.stderr), true);
  checar('e não sobe a versão', readFileSync(join(projeto, 'app.json'), 'utf8'), APP);

  writeFileSync(join(projeto, '.easignore'), readFileSync(join(RAIZ, '.easignore'), 'utf8'));
  const aceita = rodar();
  checar('com o .easignore atual, o preparo passa', aceita.status, 0);
  checar('e sobe a versão', /"version": "1\.0\.1"/.test(readFileSync(join(projeto, 'app.json'), 'utf8')), true);
} finally {
  rmSync(projeto, { recursive: true, force: true });
}

console.log(`\n${passaram}/${passaram + falhas} checagens do .env fora da build passaram — ${falhas} falhas`);
if (falhas > 0) process.exit(1);
