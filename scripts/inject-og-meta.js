// Roda depois de `expo export --platform web` (ver vercel.json).
//
// O export web deste projeto usa o modo "single" (SPA): um index.html só,
// gerado pelo bundler do Expo, sem passar por app/+html.tsx — aquele arquivo
// só é lido no modo "static". Não trocamos o modo de export pra não mudar
// como as rotas são servidas; em vez disso, este script injeta as meta tags
// direto no index.html já pronto.
//
// Sem og:image, WhatsApp/Facebook/etc. caem no favicon (48×48) esticado até
// o tamanho do card de prévia — pixelizado. og:image PRECISA ser URL
// absoluta: um raspador de link não carrega a página pra resolver caminho
// relativo.
const fs = require('fs');
const path = require('path');

const URL_SITE = 'https://granaponto.com.br';
const TITULO = 'Grana.';
const DESCRICAO = 'Controle financeiro pessoal: lançamentos, cartões, orçamento e gráficos, sincronizados entre celular e computador.';

const metaTags = `
    <meta name="description" content="${DESCRICAO}" />
    <meta name="facebook-domain-verification" content="tmjp4xpzl7euabyjjdk0hfrvcgsi2i" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${TITULO}" />
    <meta property="og:title" content="${TITULO}" />
    <meta property="og:description" content="${DESCRICAO}" />
    <meta property="og:url" content="${URL_SITE}" />
    <meta property="og:image" content="${URL_SITE}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITULO}" />
    <meta name="twitter:description" content="${DESCRICAO}" />
    <meta name="twitter:image" content="${URL_SITE}/og-image.png" />
  </head>`;

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes('</head>')) {
  console.error('[inject-og-meta] dist/index.html sem </head> — export mudou de formato?');
  process.exit(1);
}

html = html.replace('<html lang="en">', '<html lang="pt-BR">');
html = html.replace('</head>', metaTags);

fs.writeFileSync(indexPath, html);
console.log('[inject-og-meta] meta tags Open Graph injetadas em dist/index.html');
