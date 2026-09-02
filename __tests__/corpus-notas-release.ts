/**
 * Corpus da guarda ortográfica das notas de versão (`lib/notas-release.ts`).
 *
 * O caso que originou tudo está na primeira linha de REPROVADAS: foi
 * exatamente o texto que a 1.4.1 publicou no pop-up de novidades.
 *
 * A metade que mais importa é a APROVADAS. Um verificador de acento que
 * acusa palavra certa é pior que não ter verificador nenhum: trava build por
 * frase correta, some a confiança, alguém desliga a checagem — e aí volta a
 * passar erro de verdade. Por isso a lista de aprovadas carrega de propósito
 * as palavras que quase casam com as regras ("categoria" e "padaria" quase
 * caem na regra de "-ario"; "faria" e "seria" são verbos) e as já corretas.
 */
import { validarNotaRelease, notaEhPublicavel } from '../lib/notas-release';

let passaram = 0;
let falhas = 0;

function checar(descricao: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passaram++;
  } else {
    falhas++;
    console.log('FALHOU   ' + descricao + (detalhe ? ' — ' + detalhe : ''));
  }
}

/* ── Devem REPROVAR ────────────────────────────────────────────────────── */

const REPROVADAS: [string, string][] = [
  ['Corrige tela branca apos desbloqueio por digital', 'apos'],
  ['Nova versao do importador', 'versao'],
  ['Corrige botao de opcoes', 'botao'],
  ['Melhora a navegacao entre telas', 'navegacao'],
  ['Cartoes com limite errado', 'cartoes'],
  ['Agora da pra ver o historico completo', 'historico'],
  ['Grafico de gastos por categoria', 'grafico'],
  ['Importacao de extrato ate 10 mil linhas', 'importacao'],
  ['Saldo disponivel na tela inicial', 'disponivel'],
  ['Relatorio mensal do usuario', 'relatorio'],
  ['Corrige a referencia de fatura', 'referencia'],
  ['Ajusta a importancia do alerta', 'importancia'],
  ['Lista de niveis do desafio', 'niveis'],
  ['Ja da pra editar o mes anterior', 'ja'],
  ['Tambem corrige o limite do cartao', 'tambem'],
];

for (const [texto, esperada] of REPROVADAS) {
  const problemas = validarNotaRelease(texto);
  checar(
    'reprova "' + texto + '"',
    problemas.length > 0,
    'não acusou nada'
  );
  checar(
    'acusa a palavra "' + esperada + '"',
    problemas.some((p) => p.trecho.toLowerCase() === esperada),
    'acusou: ' + problemas.map((p) => p.trecho).join(', ')
  );
  checar('notaEhPublicavel = false para "' + texto + '"', !notaEhPublicavel(texto));
}

/* ── Devem APROVAR ─────────────────────────────────────────────────────── */

const APROVADAS = [
  'Corrige tela branca após desbloqueio por digital',
  'Nova versão do importador de extrato',
  'Corrige o botão de opções e os cartões salvos',
  'Melhora a navegação entre as telas',
  'Agora dá pra ver o histórico completo e os gráficos',
  'Importação de extrato até 10 mil linhas',
  'Saldo disponível na tela inicial',
  'Relatório mensal do usuário',
  'Corrige a referência da fatura e a importância do alerta',
  'Boletos, faturas e desafios em uma tela só',
  'Categoria nova para transporte',
  'Suporte a mais de um cartão por conta',
  'Compras parceladas agora somam na fatura certa',
  'R$ 1.000,00 de limite aparece corretamente',
  'Lançamento por voz ficou mais rápido',
];

for (const texto of APROVADAS) {
  const problemas = validarNotaRelease(texto);
  checar(
    'aprova "' + texto + '"',
    problemas.length === 0,
    'acusou indevidamente: ' + problemas.map((p) => p.trecho + '->' + p.sugestao).join(', ')
  );
}

/* ── Palavras certas que quase casam com as regras ─────────────────────── */

const NAO_PODEM_SER_ACUSADAS = [
  'categoria', 'categorias', 'padaria', 'faria', 'seria', 'diria',
  'historia', 'economia', 'moradia', 'garantia',
  'ao', 'aos', 'meses', 'casa', 'saldo', 'fatura', 'boleto',
  'após', 'versão', 'opções', 'histórico', 'disponível', 'referência',
];

for (const palavra of NAO_PODEM_SER_ACUSADAS) {
  const problemas = validarNotaRelease('Texto com ' + palavra + ' no meio');
  const acusou = problemas.some((p) => p.trecho.toLowerCase() === palavra.toLowerCase());
  checar('não acusa "' + palavra + '"', !acusou, 'sugeriu ' + problemas.map((p) => p.sugestao).join(', '));
}

/* Não existe regra de sufixo para "-oria", de propósito: ela pegaria
   "categoria", "moradia" e "garantia", que estão certas sem acento. As
   palavras dessa terminação que são inequívocas entram uma a uma no
   dicionário — "memoria" está lá, porque sem acento não é palavra nenhuma.
   "historia" fica de fora do dicionário porque é forma do verbo historiar:
   rara, mas existe, e a regra é não acusar o que tem leitura válida. */

/* ── Mensagem de commit vazando pro pop-up ─────────────────────────────── */

const COMMITS: string[] = [
  'fix: estabiliza navegacao apos biometria',
  'feat: importação de extrato em larga escala',
  'chore(deps): bump expo',
  'docs: registra build android 1.4.1',
  'refactor!: reescreve o parser',
];

for (const texto of COMMITS) {
  const problemas = validarNotaRelease(texto);
  checar(
    'acusa commit técnico em "' + texto + '"',
    problemas.some((p) => p.tipo === 'commit-tecnico'),
    'tipos: ' + problemas.map((p) => p.tipo).join(', ')
  );
}

/* Este é o ponto do verificador: "feat: importação de extrato em larga
   escala" está ortograficamente PERFEITO e mesmo assim não pode ir pro
   pop-up — é changelog técnico, não recado pra quem usa o app. Sem a regra
   de prefixo, um build sem `--message` passaria batido justamente quando o
   commit está bem escrito. */

/* ── Nota vazia ────────────────────────────────────────────────────────── */

checar('reprova nota vazia', validarNotaRelease('').length === 1);
checar('reprova nota só com espaço', validarNotaRelease('   \n  ').length === 1);
checar('tipo da nota vazia é "vazia"', validarNotaRelease('')[0].tipo === 'vazia');

/* ── Repetição não vira ruído ──────────────────────────────────────────── */

const repetida = validarNotaRelease('versao nova, versao melhor, versao final');
checar('palavra repetida vira um problema só', repetida.length === 1, 'veio ' + repetida.length);

/* ── Sugestão preserva o plural ────────────────────────────────────────── */

const plural = validarNotaRelease('Corrige os graficos da tela');
checar(
  'sugere "gráficos" e não "gráfico"',
  plural.some((p) => p.sugestao === 'gráficos'),
  plural.map((p) => p.sugestao).join(', ')
);

/* ── Multilinha (o pop-up quebra em bullets por \n) ────────────────────── */

const multi = validarNotaRelease('Corrige o saldo\nMelhora a importacao\nNovo grafico');
checar('acha erro em qualquer linha', multi.length === 2, 'achou ' + multi.length);

console.log('\n' + passaram + '/' + (passaram + falhas) + ' checagens de notas de release passaram — ' + falhas + ' falhas');
if (falhas > 0) process.exit(1);
