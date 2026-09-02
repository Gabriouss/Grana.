/**
 * Verifica a mensagem que vai virar a nota de versão do pop-up, ANTES de
 * gastar cota de build.
 *
 *   npm run notas:check "Corrige tela branca após desbloqueio por digital"
 *
 * Aprovado, imprime o comando de build já com a mensagem no lugar certo.
 * Reprovado, sai com código 1 e diz palavra por palavra o que está errado.
 *
 * Rodar isto é mais barato que descobrir o erro depois: a nota só aparece
 * quando alguém atualiza o app, e a essa altura o texto já está no banco e
 * já foi lido por gente de verdade.
 */
import { validarNotaRelease } from '../lib/notas-release';

const mensagem = process.argv.slice(2).join(' ');

if (!mensagem.trim()) {
  console.error('Uso: npm run notas:check "<mensagem do build>"');
  process.exit(2);
}

const problemas = validarNotaRelease(mensagem);

if (problemas.length === 0) {
  console.log('OK — nota aprovada:\n');
  console.log('  ' + mensagem.split('\n').join('\n  '));
  console.log('\nPode buildar (lembre de subir expo.version no app.json antes):\n');
  console.log('  eas build --profile preview --platform android --message ' + JSON.stringify(mensagem));
  process.exit(0);
}

console.error('REPROVADA — ' + problemas.length + (problemas.length === 1 ? ' problema' : ' problemas') + ':\n');
for (const p of problemas) {
  console.error('  [' + p.tipo + '] ' + p.explicacao);
}
console.error('\nA nota vai pro pop-up "O que mudou no Grana." exatamente como escrita,');
console.error('na cara de todo mundo que atualizar. Corrija e rode de novo.');
process.exit(1);
