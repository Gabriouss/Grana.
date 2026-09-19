/* Duas decisões do autor sobre o Perfil, de 19/09/2026, depois da auditoria
 * no emulador (achados A41 e A43):
 *
 * 1. "Os atalhos grana:// não servem para os usuários, oculte da tela do
 *    perfil." A linha "Atalhos rápidos" e o guia de endereços saem. Os
 *    endereços continuam funcionando: widgets e notificações abrem o app
 *    por eles (lib/deep-links.ts).
 * 2. "Refazer diagnóstico deve abrir apenas o diagnóstico." O Perfil abre o
 *    OnboardingModal em `modo="diagnostico"`: só as quatro perguntas, sem
 *    nome e foto e sem a escolha do painel, que nunca é gravado. O primeiro
 *    acesso, aberto pela Início, continua completo.
 *
 * Checagem do fonte, e não execução: as duas peças são componentes com
 * hooks, e o repositório não tem renderizador de teste. Os comentários saem
 * antes da checagem, para o histórico escrito neles não contar como código. */
const fs = require('fs');
const path = require('path');

let passou = 0;
let falhou = 0;
function checar(nome, condicao) {
  if (condicao) {
    passou++;
    console.log(`  ok  ${nome}`);
  } else {
    falhou++;
    console.error(`  FALHOU  ${nome}`);
  }
}

const raiz = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = (fonte) =>
  fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/* ── 1. Atalhos grana:// fora do Perfil ─────────────────────────────────── */
const perfil = semComentarios(ler('app/(app)/perfil.tsx'));
checar('o Perfil não tem mais a linha "Atalhos rápidos"', !perfil.includes('Atalhos rápidos'));
checar('o Perfil não mostra endereço grana://', !perfil.includes('grana://'));
checar('o guia saiu junto (sem estado nem cópia para a área de transferência)',
  !/atalhosOpen|expo-clipboard|Clipboard\./.test(perfil));
checar('os endereços continuam existindo para widgets e notificações',
  ler('lib/deep-links.ts').includes('grana://add-tx'));

/* ── 2. Refazer diagnóstico abre só o diagnóstico ──────────────────────── */
checar('o Perfil abre o diagnóstico no modo só diagnóstico',
  /<OnboardingModal[\s\S]*?modo="diagnostico"[\s\S]*?\/>/.test(perfil));

const inicio = semComentarios(ler('app/(app)/index.tsx'));
const onboardingDaInicio = (inicio.match(/<OnboardingModal[\s\S]*?\/>/) || [''])[0];
checar('a Início segue abrindo o primeiro acesso completo', onboardingDaInicio.length > 0 && !onboardingDaInicio.includes('modo='));

const modal = semComentarios(ler('components/OnboardingModal.tsx'));
checar('no modo diagnóstico a primeira etapa é a primeira pergunta',
  /const primeiraEtapa = soDiagnostico \? 1 : PRIMEIRA_ETAPA;/.test(modal));
checar('no modo diagnóstico a última pergunta é a da renda',
  /const ultimaPergunta = soDiagnostico \? 4 : 5;/.test(modal));
checar('a pergunta da renda leva direto ao resultado no modo diagnóstico',
  /step === 4\) \{[\s\S]*?if \(soDiagnostico\) \{\s*finalizar\(/.test(modal));
checar('o modo diagnóstico nunca grava o layout da Início',
  /const podeGravarLayout = !soDiagnostico && \(!initial \|\| presetTocado\);/.test(modal));
checar('a numeração das etapas vem da conta, não de número fixo',
  !/\d de \{TOTAL_ETAPAS\}/.test(modal) && modal.includes('rotuloEtapa(1)'));
checar('abrir o modal volta para a primeira etapa do modo', /setStep\(primeiraEtapa\);/.test(modal));
checar('cancelar o diagnóstico não regrava o nome', /if \(!soDiagnostico\) void salvarIdentidade\(\);/.test(modal));
checar('voltar do resultado leva à última pergunta, não a uma etapa vazia',
  /if \(step === 7\) setStep\(ultimaPergunta\);/.test(modal));
checar('a renda salva volta com centavos', /formatMoney\(initial\.rendaMensal\)/.test(modal));

console.log(`\n${passou}/${passou + falhou} checagens das decisões do Perfil passaram — ${falhou} falhas`);
if (falhou > 0) process.exit(1);
