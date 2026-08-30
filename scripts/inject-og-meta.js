// Complementa o HTML do export SPA com metadados que precisam existir antes
// do JavaScript rodar. A mesma fonte (`landing-meta.json`) alimenta a rota e
// este arquivo para impedir descrições divergentes entre navegador e crawler.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const meta = require('../landing-meta.json');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const vercelPath = path.join(__dirname, '..', 'vercel.json');
const imagemAbsoluta = `${meta.siteUrl}${meta.ogImage}`;

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Grana.',
  url: `${meta.siteUrl}/`,
  description: meta.description,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web, Android, iOS',
  provider: {
    '@type': 'Organization',
    name: 'Grana.',
  },
}).replace(/</g, '\\u003c');

const jsonLdHash = crypto.createHash('sha256').update(jsonLd).digest('base64');
const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
const csp = vercel.headers?.flatMap((item) => item.headers ?? []).find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
if (!csp.includes(`'sha256-${jsonLdHash}'`)) {
  console.error(`[inject-og-meta] CSP sem o hash atual do JSON-LD: sha256-${jsonLdHash}`);
  process.exit(1);
}

const metaTags = `
    <title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    <meta name="theme-color" content="${meta.themeColor}" />
    <meta name="color-scheme" content="dark" />
    <meta name="facebook-domain-verification" content="tmjp4xpzl7euabyjjdk0hfrvcgsi2i" />
    <link rel="canonical" href="${meta.siteUrl}/" />
    <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=grana-gradiente-20260830" />
    <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png?v=grana-gradiente-20260830" />
    <link rel="apple-touch-icon" href="/favicon.png?v=grana-gradiente-20260830" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Grana." />
    <meta property="og:title" content="${meta.ogTitle}" />
    <meta property="og:description" content="${meta.ogDescription}" />
    <meta property="og:url" content="${meta.siteUrl}/" />
    <meta property="og:image" content="${imagemAbsoluta}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.ogTitle}" />
    <meta name="twitter:description" content="${meta.ogDescription}" />
    <meta name="twitter:image" content="${imagemAbsoluta}" />
    <script type="application/ld+json">${jsonLd}</script>
  `;

const fallbackSemJavaScript = `
    <noscript>
      <main style="max-width:720px;margin:48px auto;padding:24px;font:16px sans-serif;color:#effffa;background:#052229">
        <h1>Grana.</h1>
        <p>${meta.description}</p>
        <p>Ative o JavaScript para criar sua conta ou entrar no aplicativo.</p>
      </main>
    </noscript>
  `;

let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('</head>') || !html.includes('</body>')) {
  console.error('[inject-og-meta] o HTML exportado não contém </head> e </body>.');
  process.exit(1);
}

html = html.replace(/<html([^>]*?)\slang=(['"])[^'"]*\2/i, '<html$1 lang="pt-BR"');
if (!/<html[^>]*\slang=/i.test(html)) html = html.replace(/<html/i, '<html lang="pt-BR"');

html = html
  .replace(/<title>[\s\S]*?<\/title>/gi, '')
  .replace(/<link[^>]+rel=(['"])canonical\1[^>]*>/gi, '')
  /* O Expo emite o seu próprio <link rel="icon" href="/favicon.ico">, e sem
     remover isto a página ficava declarando DOIS ícones primários. O Chrome
     prefere o que traz type="image/svg+xml", o Safari e o histórico de
     favoritos costumam ficar com o .ico — então o mesmo site aparecia com
     dois ícones diferentes dependendo de onde era visto. O SVG oficial fica
     primeiro, com o PNG oficial como fallback para navegadores antigos. A
     remoção acontece ANTES da injeção logo abaixo, então não apaga as tags
     que este script escreve. */
  .replace(/<link[^>]+rel=(['"])(?:shortcut icon|alternate icon|apple-touch-icon|icon)\1[^>]*>/gi, '')
  .replace(/<meta[^>]+(?:name|property)=(['"])(?:description|theme-color|color-scheme|facebook-domain-verification|og:type|og:site_name|og:title|og:description|og:url|og:image|og:image:width|og:image:height|twitter:card|twitter:title|twitter:description|twitter:image)\1[^>]*>/gi, '')
  .replace('</head>', `${metaTags}</head>`)
  .replace('</body>', `${fallbackSemJavaScript}</body>`);

for (const esperado of [`<title>${meta.title}</title>`, `href="${meta.siteUrl}/"`, 'application/ld+json', '<html lang="pt-BR"']) {
  if (!html.includes(esperado)) {
    console.error(`[inject-og-meta] falha ao injetar: ${esperado}`);
    process.exit(1);
  }
}

fs.writeFileSync(indexPath, html);
console.log('[inject-og-meta] SEO, JSON-LD e fallback sem JavaScript injetados.');
