/**
 * Guardas mecânicas das Named Rules do `DESIGN.md`.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * A Only-Font Rule ("Neue Machina é a única fonte do produto, em qualquer
 * papel, em qualquer plataforma") já foi quebrada e corrigida DUAS vezes:
 *
 *  1. Uma rodada trocou o corpo do app inteiro pela fonte do sistema achando
 *     que era exigência de Dynamic Type. Revertida a pedido do autor.
 *  2. `demoFlag` em `app/(app)/index.tsx` usava `monospace` nos badges
 *     "exemplo"/"oculto" do cabeçalho da Início. Corrigido, e então PERDIDO:
 *     um `git checkout --` para desfazer outro script levou a correção junto,
 *     e o relatório de auditoria saiu afirmando que estava resolvido.
 *
 * O segundo caso é o motivo deste arquivo. Uma regra que depende de alguém
 * lembrar não é uma regra — é uma intenção. Estas são absolutas no DESIGN.md,
 * então dá pra verificar por máquina, e uma reversão silenciosa passa a
 * quebrar o `npm run test:parser` em vez de chegar na tela do usuário.
 *
 * O que NÃO está aqui é tão deliberado quanto o que está: nada de heurística
 * sobre "este estilo parece dinheiro, logo precisa de tabular-nums". Regra que
 * acusa código correto é regra que alguém desliga.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

let passaram = 0;
let falhas = 0;

function checar(descricao: string, condicao: boolean, detalhe = '') {
  if (condicao) passaram++;
  else {
    falhas++;
    console.log('FALHOU   ' + descricao + (detalhe ? '\n         ' + detalhe : ''));
  }
}

/** Todos os .ts/.tsx sob os diretórios dados, menos o próprio theme. */
function arquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, out);
    else if (/\.tsx?$/.test(nome)) out.push(caminho);
  }
  return out;
}

const FONTES = ['app', 'components']
  .flatMap((d) => arquivos(d))
  .map((caminho) => ({ caminho, src: readFileSync(caminho, 'utf8') }));

/* Comentários fora: este arquivo e os que explicam as regras CITAM as grafias
   proibidas de propósito, e acusá-las seria acusar a documentação. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/* ── The Only-Font Rule ─────────────────────────────────────────────────── */

for (const { caminho, src } of FONTES) {
  const codigo = semComentarios(src);
  /* Aceita `fonts.algo` e `{fonts.algo}`; recusa qualquer literal de string. */
  const literais = [...codigo.matchAll(/fontFamily[:=]\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  checar(
    'Only-Font: ' + caminho + ' sem fontFamily literal',
    literais.length === 0,
    literais.length ? 'encontrado: ' + literais.join(', ') + ' — use fonts.regular/fonts.light de lib/theme.ts' : ''
  );
}

/* ── Sem peso sintético ─────────────────────────────────────────────────── */

for (const { caminho, src } of FONTES) {
  const codigo = semComentarios(src);
  /* Só existem Light e Regular como arquivo; o nativo ignora `fontWeight` e a
     web sintetiza um falso negrito que não é a marca. */
  const usos = [...codigo.matchAll(/fontWeight\s*[:=]/g)].length;
  checar('Sem fontWeight: ' + caminho, usos === 0, usos ? usos + ' uso(s) de fontWeight' : '');
}

/* ── Fonte do sistema nunca vaza ────────────────────────────────────────── */

const PROIBIDAS = /(^|[\s'"(,])(System|system-ui|-apple-system|BlinkMacSystemFont|Roboto|San Francisco|SF Pro|Helvetica|Arial|sans-serif|serif|monospace)([\s'",);]|$)/;
for (const { caminho, src } of FONTES) {
  const codigo = semComentarios(src);
  const linhasRuins = codigo
    .split('\n')
    .map((linha, i) => ({ linha, n: i + 1 }))
    .filter(({ linha }) => /font(Family|-family)/i.test(linha) && PROIBIDAS.test(linha));
  checar(
    'Sem fonte de sistema: ' + caminho,
    linhasRuins.length === 0,
    linhasRuins.map(({ linha, n }) => 'L' + n + ': ' + linha.trim()).join('\n         ')
  );
}

/* ── lib/theme.ts declara exatamente os dois pesos que existem ──────────── */

const theme = readFileSync('lib/theme.ts', 'utf8');
const familias = [...theme.matchAll(/'(NeueMachina-[A-Za-z]+)'/g)].map((m) => m[1]);
const unicas = [...new Set(familias)].sort();
checar(
  'theme declara só NeueMachina-Light e -Regular',
  unicas.length === 2 && unicas[0] === 'NeueMachina-Light' && unicas[1] === 'NeueMachina-Regular',
  'declaradas: ' + unicas.join(', ')
);

/* ── Os arquivos de fonte existem de verdade ────────────────────────────── */

for (const familia of unicas) {
  let existe = true;
  try {
    statSync(join('assets/fonts', familia + '.otf'));
  } catch {
    try {
      statSync(join('assets/fonts', familia + '.ttf'));
    } catch {
      existe = false;
    }
  }
  checar('arquivo da fonte ' + familia + ' existe em assets/fonts', existe);
}

console.log(
  '\n' + passaram + '/' + (passaram + falhas) + ' guardas do design system passaram — ' + falhas + ' falhas'
);
if (falhas > 0) process.exit(1);
