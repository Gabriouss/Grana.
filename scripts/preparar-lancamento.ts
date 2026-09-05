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
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { validarNotaRelease } from '../lib/notas-release';

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
const mensagem = args.filter((a) => a !== '--major' && a !== '--minor').join(' ').trim();

if (!mensagem.trim()) {
  console.error('Uso: npm run build:preparar -- ["--minor" | "--major"] "<mensagem do build>"');
  process.exit(2);
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
console.log('\nNota aprovada:\n');
console.log('  ' + mensagem.split('\n').join('\n  '));
console.log('\nPode buildar:\n');
console.log('  eas build --profile preview --platform android --message ' + JSON.stringify(mensagem));
