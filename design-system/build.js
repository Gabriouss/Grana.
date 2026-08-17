/*
 * Gerador do Grana Design System.
 *
 * Três tarefas:
 *  1. Lê as duas Neue Machina de assets/fonts do app (SOMENTE LEITURA — este
 *     projeto documenta o app, nunca o modifica) e emite
 *     fonts/neue-machina.css com as fontes embutidas em base64.
 *  2. Injeta esse CSS no lugar do marcador <!--@FONTS@--> de cada arquivo em
 *     previews/, gravando o resultado auto-contido em dist/.
 *  3. Faz o mesmo com pagina/design-system.src.html, gerando
 *     pagina/design-system.html — a página única de referência.
 *
 * Cada preview precisa ser auto-contida porque o painel Design System
 * renderiza um card por arquivo, isoladamente: um CSS compartilhado por link
 * relativo não sobreviveria a esse isolamento.
 *
 * Uso:  node build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PREVIEWS = path.join(ROOT, 'previews');
const DIST = path.join(ROOT, 'dist');
const PAGINA = path.join(ROOT, 'pagina');

/* Aceita as duas posições possíveis: dentro do app (design-system/ na raiz do
   grana-app) ou como pasta irmã dele. Assim mover o projeto não quebra o build. */
const CANDIDATOS = [
  path.join(ROOT, '..', 'assets', 'fonts'),
  path.join(ROOT, '..', 'grana-app', 'assets', 'fonts'),
];
const APP_FONTS = CANDIDATOS.find((p) => fs.existsSync(p));

if (!APP_FONTS) {
  throw new Error(
    'Não encontrei assets/fonts do app. Procurei em:\n  ' + CANDIDATOS.join('\n  ')
  );
}

function fontFace(family, file, weight) {
  const b64 = fs.readFileSync(path.join(APP_FONTS, file)).toString('base64');
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/otf;base64,${b64}) format('opentype');}`;
}

const fontCss =
  '/* Neue Machina — embutida em base64 a partir de assets/fonts do app. */\n' +
  fontFace('Neue Machina', 'NeueMachina-Light.otf', 300) +
  '\n' +
  fontFace('Neue Machina', 'NeueMachina-Regular.otf', 400) +
  '\n';

fs.mkdirSync(path.join(ROOT, 'fonts'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'fonts', 'neue-machina.css'), fontCss);

function injetar(srcPath, destPath, limiteKB) {
  const src = fs.readFileSync(srcPath, 'utf8');
  const nome = path.basename(srcPath);
  if (!src.includes('<!--@FONTS@-->')) {
    throw new Error(`${nome} não tem o marcador <!--@FONTS@--> — sairia sem a fonte.`);
  }
  const out = src.replace('<!--@FONTS@-->', `<style>${fontCss}</style>`);
  fs.writeFileSync(destPath, out);
  const kb = Number((Buffer.byteLength(out) / 1024).toFixed(0));
  if (limiteKB && kb > limiteKB) {
    throw new Error(`${nome} ficou com ${kb} KB — acima do limite de ${limiteKB} KB.`);
  }
  return kb;
}

console.log(`fontes: ${path.relative(ROOT, APP_FONTS)}\n`);

console.log('previews (limite 256 KB por arquivo):');
fs.mkdirSync(DIST, { recursive: true });
const previews = fs.readdirSync(PREVIEWS).filter((f) => f.endsWith('.html'));
for (const f of previews) {
  const kb = injetar(path.join(PREVIEWS, f), path.join(DIST, f), 256);
  console.log(`  ${f.padEnd(30)} ${String(kb).padStart(4)} KB`);
}

console.log('\npágina:');
const kbPagina = injetar(
  path.join(PAGINA, 'design-system.src.html'),
  path.join(PAGINA, 'design-system.html')
);
console.log(`  design-system.html             ${String(kbPagina).padStart(4)} KB`);

console.log(`\n${previews.length} preview(s) em dist/ e a página em pagina/.`);
