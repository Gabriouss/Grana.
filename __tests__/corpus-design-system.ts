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

/* `lib` entrou em 08/09/2026. A auditoria daquele dia achou as duas piores
   violações de marca do projeto justamente ali — saída de dinheiro em vermelho
   no PDF exportado e fonte do sistema — porque a varredura parava em `app` e
   `components`. Regra de design que só vale onde o teste olha não é regra.

   Dois arquivos declaram família de fonte por direito e ficam de fora da
   checagem de literal (não das outras):
   - `lib/theme.ts` é a FONTE dos tokens; é onde o nome da fonte deve aparecer.
   - `lib/pdf-report-html.ts` monta HTML para impressão, onde a pilha CSS
     precisa terminar numa fonte de sistema: no nativo o expo-print roda em
     WebView isolado, sem acesso aos assets, e embutir a Neue Machina em base64
     custaria ~155 KB de bundle por um recurso pontual. A escolha está
     argumentada no próprio arquivo. */
const PODEM_DECLARAR_FONTE = new Set(['lib/theme.ts', 'lib/pdf-report-html.ts']);

const FONTES = ['app', 'components', 'lib']
  .flatMap((d) => arquivos(d))
  .map((caminho) => ({ caminho: caminho.replace(/\\/g, '/'), src: readFileSync(caminho, 'utf8') }));

/* Comentários fora: este arquivo e os que explicam as regras CITAM as grafias
   proibidas de propósito, e acusá-las seria acusar a documentação. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/* ── The Only-Font Rule ─────────────────────────────────────────────────── */

for (const { caminho, src } of FONTES) {
  if (PODEM_DECLARAR_FONTE.has(caminho)) continue;
  const codigo = semComentarios(src);
  /* Aceita `fonts.algo` e `{fonts.algo}`; recusa qualquer literal de string. */
  const literais = [...codigo.matchAll(/fontFamily[:=]\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  checar(
    'Only-Font: ' + caminho + ' sem fontFamily literal',
    literais.length === 0,
    literais.length ? 'encontrado: ' + literais.join(', ') + ' — use fonts.regular/fonts.light de lib/theme.ts' : ''
  );
}

/* ── The Only-Font Rule, segunda metade: fonte AUSENTE ──────────────────────
   A checagem acima pega quem escreve a fonte errada. Ela não pegava quem não
   escreve fonte nenhuma — e o resultado é o mesmo, porque o React Native cai
   na fonte do sistema. Foi assim que `VozesSalvasLocalmente` passou meses com
   os três textos fora da marca, com o corpus verde.

   Heurística: todo objeto de estilo que define `fontSize` também precisa dizer
   em que família ele sai. Espalhar um token (`...textStyles.body`) satisfaz,
   porque o token já carrega `fontFamily`. */
function objetoQueContem(codigo: string, indice: number): string {
  let inicio = indice;
  let nivel = 0;
  while (inicio > 0) {
    const c = codigo[--inicio];
    if (c === '}') nivel++;
    else if (c === '{') {
      if (nivel === 0) break;
      nivel--;
    }
  }
  let fim = indice;
  nivel = 0;
  while (fim < codigo.length) {
    const c = codigo[fim++];
    if (c === '{') nivel++;
    else if (c === '}') {
      if (nivel === 0) break;
      nivel--;
    }
  }
  return codigo.slice(inicio, fim);
}

/* Um estilo SEM família não é violação quando ele é sobreposição: em
   `[styles.secaoTitulo, ehCompacto && styles.secaoTituloCompacto]` só o
   primeiro precisa declarar a fonte, e o segundo ajusta tamanho. Acusar esses
   transformaria o guarda em ruído — e guarda ruidoso é pior que nenhum, porque
   alguém desliga. Então só acusa o estilo que aparece ao menos uma vez SOZINHO
   na expressão de `style`. */
function usadoSozinho(codigo: string, nome: string): boolean {
  for (const m of codigo.matchAll(new RegExp('styles\\.' + nome + '\\b', 'g'))) {
    /* O marcador é o ATRIBUTO `style=`/`style:`, não a palavra "style" solta —
       ela é prefixo de `styles.`, e procurá-la casava com a própria ocorrência,
       fazendo todo estilo parecer usado sozinho. */
    const janela = codigo.slice(Math.max(0, m.index! - 400), m.index!);
    const marcadores = [...janela.matchAll(/\bstyle\s*[=:]/g)];
    if (!marcadores.length) continue;
    const inicio = Math.max(0, m.index! - 400) + marcadores[marcadores.length - 1].index!;
    /* Do atributo até fechar a expressão dele, contando irmãos. */
    let nivel = 0;
    let fim = inicio;
    for (; fim < codigo.length; fim++) {
      const c = codigo[fim];
      if (c === '{' || c === '[') nivel++;
      else if (c === '}' || c === ']') {
        nivel--;
        if (nivel <= 0) break;
      }
    }
    const expressao = codigo.slice(inicio, fim + 1);
    if ((expressao.match(/styles\./g) ?? []).length === 1) return true;
  }
  return false;
}

for (const { caminho, src } of FONTES) {
  if (PODEM_DECLARAR_FONTE.has(caminho)) continue;
  const codigo = semComentarios(src);
  const semFamilia: string[] = [];
  for (const m of codigo.matchAll(/\bfontSize\s*:/g)) {
    const bloco = objetoQueContem(codigo, m.index!);
    if (/fontFamily|\.\.\.\s*textStyles\./.test(bloco)) continue;
    const nome = /(\w+)\s*:\s*\{[^{]*$/.exec(codigo.slice(0, m.index!))?.[1];
    /* Objeto anônimo (estilo inline) fica de fora: não dá para rastrear uso, e
       o palpite erraria mais do que acertaria. */
    if (!nome) continue;
    if (usadoSozinho(codigo, nome)) semFamilia.push(nome);
  }
  checar(
    'Only-Font: ' + caminho + ' sem estilo de texto órfão de fontFamily',
    semFamilia.length === 0,
    semFamilia.length
      ? semFamilia.join(', ') + ' — define fontSize sozinho e sem família; cai na fonte do sistema'
      : ''
  );
}

/* ── Ícone vem do caminho profundo, nunca do barril ─────────────────────────
   `import { Ionicons } from '@expo/vector-icons'` puxa o barril inteiro: 19
   famílias de ícone, e o build web publicava 3,89 MB de `.ttf` para um app que
   usa só Ionicons. Trocar pelos 57 imports profundos derrubou para 0,37 MB num
   único arquivo — medido em `expo export`, não estimado. O guarda existe porque
   o barril é o import que o editor sugere sozinho ao completar `Ionicons`. */
for (const { caminho, src } of FONTES) {
  const codigo = semComentarios(src);
  const barril = /from\s+'@expo\/vector-icons'/.test(codigo)
    || /import\('@expo\/vector-icons'\)/.test(codigo);
  checar(
    'Ícones: ' + caminho + ' importa do caminho profundo',
    !barril,
    barril ? "use `import Ionicons from '@expo/vector-icons/Ionicons'` — o barril traz as 19 famílias" : ''
  );
}

/* ── Sombra vem do catálogo, nunca escrita à mão ────────────────────────────
   O `DESIGN.md` proíbe sombra ad hoc desde 02/09/2026 e mesmo assim a
   auditoria de 08/09 achou três receitas novas — uma delas na barra de abas,
   com valor DIFERENTE do que o próprio documento afirmava. Regra que mora só
   em markdown não é verificada por ninguém.

   Agora as receitas são `sombras` em `lib/theme.ts`, e este guarda recusa
   qualquer literal fora de lá. `'none'` passa: desligar sombra não é inventar
   receita. */
for (const { caminho, src } of FONTES) {
  if (caminho === 'lib/theme.ts') continue;
  const codigo = semComentarios(src);
  const literais = [...codigo.matchAll(/boxShadow\s*:\s*'([^']+)'/g)]
    .map((m) => m[1])
    .filter((v) => v.trim() !== 'none');
  checar(
    'Sombra do catálogo: ' + caminho,
    literais.length === 0,
    literais.length
      ? literais.join(' | ') + ' — importe de `sombras` (lib/theme.ts); receita nova se declara lá'
      : ''
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

/* ---- Janela de ação nunca ancora na borda de baixo ----
 *
 * Regra dada pelo autor em 12/09/2026, olhando duas telas: a janela de
 * Editar/Excluir de um lançamento, em que "Excluir" ficava por baixo da barra
 * de gestos do Android, e a de Gerenciar categorias. Toda janela de ação do
 * app flutua centralizada, em qualquer largura.
 *
 * Quem centraliza é `useSheetFlutuante` (lib/breakpoints.ts), direto ou por
 * dentro de `components/Sheet.tsx`. A guarda então é: arquivo que desenha um
 * fundo escurecido colando o painel embaixo precisa passar por um dos dois,
 * senão ficou de fora da varredura. */
{
  const centralizadores = ['useSheetFlutuante', "from './Sheet'", "from '@/components/Sheet'", '<Sheet'];
  const scrimAncorado = /[Ss]crim\w*:\s*\{[^}]*justifyContent:\s*'flex-end'/;
  for (const caminho of [...arquivos('components'), ...arquivos('app')]) {
    const src = semComentarios(readFileSync(caminho, 'utf8'));
    if (!scrimAncorado.test(src)) continue;
    checar(
      'janela de ação flutua, não ancora embaixo: ' + caminho,
      centralizadores.some((marca) => src.includes(marca)),
      'o fundo escurecido cola o painel na borda de baixo e o arquivo não usa useSheetFlutuante nem Sheet'
    );
  }
}

console.log(
  '\n' + passaram + '/' + (passaram + falhas) + ' guardas do design system passaram — ' + falhas + ' falhas'
);
if (falhas > 0) process.exit(1);
