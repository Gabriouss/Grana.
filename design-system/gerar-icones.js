/*
 * Gera os PNGs de ícone e splash do app a partir dos vetores canônicos de
 * marca/. Escreve direto em ../assets/.
 *
 * Uso:  node gerar-icones.js
 *
 * Rasteriza com o Chrome headless — é o único rasterizador vetorial presente
 * na máquina, e tem a vantagem de renderizar o SVG exatamente como o navegador
 * das previews, sem uma segunda implementação de gradiente pra divergir.
 *
 * ── A zona segura do ícone adaptativo ────────────────────────────────────────
 *
 * O ícone adaptativo do Android tem 108 dp, dos quais o launcher mostra só os
 * 72 dp centrais; o que é garantido em QUALQUER máscara é o círculo de 66 dp
 * de diâmetro. Em 1024 px isso dá um círculo de 626 px.
 *
 * O detalhe que engana: o símbolo do Grana tem o ponto no canto inferior
 * direito, então o círculo que circunscreve a peça é 1,354x maior que metade
 * da caixa dela — não 1x, como seria numa peça redonda. Encaixar o símbolo no
 * QUADRADO de 675 px (os 66% do lado) projeta um círculo de 914 px, e o ponto
 * é cortado por qualquer máscara redonda. Como o ponto faz parte do símbolo,
 * isso descaracteriza a marca.
 *
 * Daí a caixa de 462 px: 626 / 1,354. É o maior símbolo que sobrevive inteiro
 * a uma máscara circular.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = __dirname;
const MARCA = path.join(RAIZ, 'marca');
const ASSETS = path.join(RAIZ, '..', 'assets');
const TMP = path.join(RAIZ, '.tmp-icones');

/* Escuro único dos assets do app: o mesmo de theme.paper e do
   adaptiveIcon.backgroundColor em app.json. Os vetores de marca trazem
   #09384a (ícone) e #08384b (logotipo), que são o escuro das peças de
   identidade — contexto diferente, valor diferente, de propósito. */
const ESCURO = '#052229';

/* Geometria do símbolo, lida de simbolo-gradiente.svg. */
const CAIXA_SVG = 459.56;
const PONTO_CX = 426.09;
const PONTO_R = 33.47;

const CIRCULO_SEGURO = Math.round((1024 * 66) / 108); // 626 px
const FATOR = (Math.hypot(PONTO_CX - CAIXA_SVG / 2, PONTO_CX - CAIXA_SVG / 2) + PONTO_R) / (CAIXA_SVG / 2);
const CAIXA_SIMBOLO = Math.floor(CIRCULO_SEGURO / FATOR); // 462 px

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const CHROME = CHROMES.find((p) => fs.existsSync(p));
if (!CHROME) {
  throw new Error('Chrome não encontrado. Procurei em:\n  ' + CHROMES.join('\n  '));
}

function svg(nome) {
  return fs.readFileSync(path.join(MARCA, nome), 'utf8').replace(/<\?xml[^>]*\?>/, '');
}

/* Fixa largura/altura no <svg> raiz mantendo o viewBox: o gradiente segue
   ancorado nas coordenadas originais (userSpaceOnUse), que é o que faz a rampa
   atravessar a peça inteira em vez de reiniciar por elemento. */
function dimensionar(markup, w, h) {
  return markup.replace(/<svg /, `<svg width="${w}" height="${h}" `);
}

function pagina({ w, h, fundo, conteudo }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden}
body{background:${fundo};display:flex;align-items:center;justify-content:center}
svg{display:block}
</style></head><body>${conteudo}</body></html>`;
}

const alturaLogotipo = (larg) => Math.round((larg * 459.56) / 1778.3);

const iconeMestre = svg('icone-fundo-escuro.svg')
  .replace(/fill:\s*#09384a/i, `fill: ${ESCURO}`)
  // Full-bleed quadrado: o iOS aplica a própria máscara, e cantos já
  // arredondados no arquivo viram arredondamento duplo com cantos pretos.
  .replace(/rx="149\.22"\s*ry="149\.22"/, 'rx="0" ry="0"');

const ALVOS = [
  {
    arquivo: 'android-icon-foreground.png',
    w: 1024,
    h: 1024,
    fundo: 'transparent',
    conteudo: dimensionar(svg('simbolo-gradiente.svg'), CAIXA_SIMBOLO, CAIXA_SIMBOLO),
  },
  { arquivo: 'android-icon-background.png', w: 1024, h: 1024, fundo: ESCURO, conteudo: '' },
  {
    // Silhueta branca sobre transparente: o launcher aplica a cor do tema.
    arquivo: 'android-icon-monochrome.png',
    w: 1024,
    h: 1024,
    fundo: 'transparent',
    conteudo: dimensionar(svg('simbolo-branco.svg'), CAIXA_SIMBOLO, CAIXA_SIMBOLO),
  },
  { arquivo: 'icon.png', w: 1024, h: 1024, fundo: ESCURO, conteudo: dimensionar(iconeMestre, 1024, 1024) },
  {
    // Logotipo completo, a 70% da largura do quadro.
    arquivo: 'splash-icon.png',
    w: 1024,
    h: 1024,
    fundo: 'transparent',
    conteudo: dimensionar(svg('logotipo-gradiente.svg'), 717, alturaLogotipo(717)),
  },
  {
    // Rasterizado direto no tamanho final, sem reamostragem — é o que mantém
    // a nitidez num alvo tão pequeno.
    arquivo: 'favicon.png',
    w: 48,
    h: 48,
    fundo: 'transparent',
    conteudo: dimensionar(svg('simbolo-gradiente.svg'), 44, 44),
  },
];

fs.mkdirSync(TMP, { recursive: true });

console.log(`símbolo em caixa de ${CAIXA_SIMBOLO} px (círculo seguro de ${CIRCULO_SEGURO} px)\n`);

for (const alvo of ALVOS) {
  const htmlPath = path.join(TMP, alvo.arquivo.replace('.png', '.html'));
  const pngPath = path.join(ASSETS, alvo.arquivo);
  fs.writeFileSync(htmlPath, pagina(alvo));
  if (fs.existsSync(pngPath)) fs.rmSync(pngPath);
  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${alvo.w},${alvo.h}`,
    `--screenshot=${pngPath}`,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  const kb = (fs.statSync(pngPath).size / 1024).toFixed(0);
  console.log(`  ${alvo.arquivo.padEnd(32)} ${alvo.w}x${alvo.h}  ${kb.padStart(4)} KB`);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${ALVOS.length} asset(s) escritos em assets/.`);
