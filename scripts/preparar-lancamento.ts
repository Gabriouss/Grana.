/**
 * Passo único e obrigatório antes de qualquer `eas build` de release.
 *
 *   npm run build:preparar -- "Corrige tela branca após desbloqueio por digital"
 *   npm run build:preparar -- --minor "Adiciona cofrinhos com meta"
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * As duas causas reais de "ninguém foi avisado da atualização" até hoje
 * foram sempre humanas, nunca do mecanismo em si (webhook, RPC e app já
 * testados e corretos): alguém esquecer de subir `expo.version` no
 * `app.json` antes de buildar (aconteceu entre 1.1.1 e 1.2.0 — várias
 * builds seguidas com a mesma versão, todas silenciosamente ignoradas pelo
 * `eas-build-webhook`), ou publicar uma nota mal escrita (1.4.1 foi ao ar
 * com "apos" sem acento). Os dois já tinham guarda-corpo separados
 * (`checar-nota.ts` e a lembrança em prosa no AGENTS.md) — separados porque
 * dependiam de alguém lembrar de rodar os dois passos, na ordem certa,
 * toda vez. Isto funde os dois num comando só: rodar isto É o passo, não
 * "lembrar de rodar os dois passos".
 *
 * NUNCA dispara `eas build` sozinho — só prepara e imprime o comando
 * pronto. Builds continuam exigindo pedido explícito na sessão (regra 4 do
 * AGENTS.md); isto não muda.
 *
 * Ordem importa: a nota é validada ANTES de qualquer escrita em disco. Uma
 * nota reprovada não pode custar uma versão gasta à toa.
 *
 * Antes até da nota, confere que o `.env` fica fora do pacote que o EAS manda
 * para o servidor (ver `env-fora-da-build.ts`): a 1.10.2 levou os segredos da
 * máquina que buildou, e uma build preparada aqui não pode repetir isso.
 */
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { validarNotaRelease } from '../lib/notas-release';
import { variaveisNoPacoteDaBuild } from './env-fora-da-build';
import { situacaoDoTeto } from './teto-de-builds';

const APP_JSON = join(__dirname, '..', 'app.json');

// `--` sobra no argv quando o comando é invocado direto (sem passar pelo
// `npm run ... --`, que já consome o separador sozinho) — filtrado aqui pra
// não virar parte "válida" da mensagem por engano.
const args = process.argv.slice(2).filter((a) => a !== '--');
const grau: 'patch' | 'minor' | 'major' = args.includes('--major')
  ? 'major'
  : args.includes('--minor')
    ? 'minor'
    : 'patch';
/* Só com pedido explícito do autor na sessão (regra 22 do AGENTS.md). */
const emergencia = args.includes('--emergencia');
const mensagem = args.filter((a) => a !== '--major' && a !== '--minor' && a !== '--emergencia').join(' ').trim();

if (!mensagem.trim()) {
  console.error('Uso: npm run build:preparar -- ["--minor" | "--major"] ["--emergencia"] "<mensagem do build>"');
  process.exit(2);
}

const pacote = variaveisNoPacoteDaBuild(join(__dirname, '..'));
if (pacote.vaoNoPacote.length > 0) {
  console.error('BLOQUEADO — estes arquivos de variáveis iriam para o servidor do EAS:\n');
  for (const nome of pacote.vaoNoPacote) console.error('  ' + nome);
  console.error('\nRegras lidas de: ' + pacote.fonte + '. Com .easignore presente, o EAS não lê o .gitignore');
  console.error('e copia a pasta de trabalho inteira — foi assim que a build 1.10.2 levou os segredos da');
  console.error('Cakto, do GitHub, do Supabase e da Vercel. Rode "git pull" (a correção é o commit 4ce2242)');
  console.error('ou acrescente ao .easignore as linhas ".env", ".env.*" e "!.env.example".');
  console.error('Nenhum arquivo foi alterado. Ver o alerta no topo do AGENTS.md e a regra 15.');
  process.exit(1);
}

/* Teto de 3 builds por semana, de segunda a domingo (regra 22 do AGENTS.md).
   O livro-caixa é o histórico do git: cada preparo sobe "version" no
   app.json, e o histórico é o mesmo nas duas máquinas.

   O padrão do `-G` não usa aspas nem barra invertida, de propósito: no Windows
   os dois se perdem a caminho do git e a busca volta VAZIA, sem erro — o que
   liberaria toda build em silêncio. Foi o que aconteceu na primeira versão
   desta contagem, em 01/10/2026. */
const RAIZ = join(__dirname, '..');
try {
  execFileSync('git', ['fetch', 'origin', '--quiet'], { cwd: RAIZ, stdio: 'ignore', timeout: 30_000 });
} catch {
  console.error('AVISO — não consegui consultar o GitHub. A contagem de builds da semana usa só o que');
  console.error('já está nesta máquina, e pode faltar o que a outra máquina preparou.\n');
}
let datasDosPreparos: string[];
try {
  datasDosPreparos = execFileSync(
    'git',
    ['log', 'HEAD', 'origin/main', '--since=21 days ago', '--format=%cI', '-G', '.version.: *.[0-9]+[.][0-9]+[.][0-9]+.', '--', 'app.json'],
    { cwd: RAIZ, encoding: 'utf8' }
  ).split('\n').filter(Boolean);
} catch (erro) {
  /* Sem contagem não há como afirmar que cabe. Recusar é o lado seguro: a
     cota é justamente o que o teto existe para proteger. */
  console.error('BLOQUEADO — não consegui ler o histórico do git para contar as builds da semana.');
  console.error(String((erro as Error)?.message ?? erro));
  console.error('Nenhum arquivo foi alterado.');
  process.exit(1);
}
const teto = situacaoDoTeto(datasDosPreparos, new Date());
if (!teto.podePreparar && !emergencia) {
  console.error(`BLOQUEADO — esta semana já teve ${teto.feitos} builds, e o teto é ${teto.teto} (segunda a domingo).\n`);
  for (const iso of teto.daSemana) console.error('  ' + new Date(iso).toLocaleString('pt-BR'));
  console.error(`\nO teto zera na segunda, ${teto.zeraEm.toLocaleDateString('pt-BR')}. A cota do EAS é de 15 por mês nas duas`);
  console.error('máquinas juntas, e o teto guarda a reserva do fim do mês. Se o autor pedir esta build mesmo');
  console.error('assim, NESTA sessão, repita o comando com --emergencia. Nenhum arquivo foi alterado.');
  process.exit(1);
}
if (!teto.podePreparar && emergencia) {
  console.error(`ATENÇÃO — fora do teto: esta será a build ${teto.feitos + 1} da semana (teto ${teto.teto}), liberada por --emergencia.\n`);
}

const problemas = validarNotaRelease(mensagem);
if (problemas.length > 0) {
  console.error('REPROVADA — ' + problemas.length + (problemas.length === 1 ? ' problema' : ' problemas') + ':\n');
  for (const p of problemas) {
    console.error('  [' + p.tipo + '] ' + p.explicacao);
  }
  console.error('\nA nota vai pro pop-up "O que mudou no Grana." exatamente como escrita,');
  console.error('na cara de todo mundo que atualizar. Nenhum arquivo foi alterado. Corrija e rode de novo.');
  process.exit(1);
}

const bruto = readFileSync(APP_JSON, 'utf8');
const combinacao = bruto.match(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"/);
if (!combinacao) {
  console.error('Não encontrei "version": "x.y.z" em app.json — corrija o formato antes de rodar isto.');
  process.exit(1);
}

const [linhaCompleta, major, minor, patch] = combinacao;
let [n1, n2, n3] = [Number(major), Number(minor), Number(patch)];
if (grau === 'major') { n1 += 1; n2 = 0; n3 = 0; }
else if (grau === 'minor') { n2 += 1; n3 = 0; }
else { n3 += 1; }
const versaoNova = `${n1}.${n2}.${n3}`;
const versaoAntiga = `${major}.${minor}.${patch}`;

writeFileSync(APP_JSON, bruto.replace(linhaCompleta, linhaCompleta.replace(`"${versaoAntiga}"`, `"${versaoNova}"`)));

console.log(`OK — app.json: ${versaoAntiga} → ${versaoNova}`);
console.log(`Build ${teto.feitos + 1} de ${teto.teto} desta semana (o teto zera na segunda, ${teto.zeraEm.toLocaleDateString('pt-BR')}).`);
console.log('\nNota aprovada:\n');
console.log('  ' + mensagem.split('\n').join('\n  '));
console.log('\nPode buildar:\n');
console.log('  eas build --profile preview --platform android --message ' + JSON.stringify(mensagem));
