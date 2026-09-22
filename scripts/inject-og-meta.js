// Complementa o HTML do export SPA com metadados que precisam existir antes
// do JavaScript rodar. A mesma fonte (`landing-meta.json`) alimenta a rota e
// este arquivo para impedir descrições divergentes entre navegador e crawler.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const meta = require('../landing-meta.json');

const vercelPath = path.join(__dirname, '..', 'vercel.json');
const imagemAbsoluta = `${meta.siteUrl}${meta.ogImage}`;

const META_POR_ROTA = {
  '/': meta,
  '/assinar': {
    title: 'Assinar o Grana. | Controle financeiro sem planilha',
    description: 'Assine o Grana. para registrar gastos por voz, Pix ou nota fiscal e saber quanto sobra para gastar hoje.',
    ogTitle: 'Assinar o Grana. | Controle financeiro sem planilha',
    ogDescription: 'Registre seus gastos em segundos e acompanhe quanto pode gastar hoje, sem conectar sua conta bancária.',
  },
  '/baixar': {
    title: 'Baixar o Grana. para Android',
    description: 'Baixe o aplicativo Android do Grana. e registre seus gastos por voz, texto ou foto.',
    ogTitle: 'Baixar o Grana. para Android',
    ogDescription: 'Leve o controle financeiro para o bolso: registre gastos por voz, texto ou foto.',
  },
  '/termos': {
    title: 'Termos de serviço | Grana.',
    description: 'Leia os termos de serviço do Grana., aplicativo de registro de finanças pessoais.',
    ogTitle: 'Termos de serviço | Grana.',
    ogDescription: 'Termos de serviço do Grana.',
  },
  '/privacidade': {
    title: 'Política de privacidade | Grana.',
    description: 'Leia a política de privacidade do Grana. e entenda como seus dados são tratados.',
    ogTitle: 'Política de privacidade | Grana.',
    ogDescription: 'Política de privacidade do Grana.',
  },
  '/exclusao-de-dados': {
    title: 'Exclusão de dados | Grana.',
    description: 'Veja como solicitar a exclusão dos seus dados e da sua conta do Grana.',
    ogTitle: 'Exclusão de dados | Grana.',
    ogDescription: 'Instruções para exclusão de dados e conta do Grana.',
  },
};

const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Grana.',
  url: `${meta.siteUrl}/`,
  description: meta.description,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web, Android, iOS',
  offers: [
    {
      '@type': 'Offer',
      name: 'Plano Mensal',
      price: '9.90',
      priceCurrency: 'BRL',
    },
    {
      '@type': 'Offer',
      name: 'Plano Anual',
      price: '97.90',
      priceCurrency: 'BRL',
    },
  ],
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

function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caractere]);
}

function listarHtml(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(diretorio, entrada.name);
    return entrada.isDirectory() ? listarHtml(caminho) : entrada.name.endsWith('.html') ? [caminho] : [];
  });
}

function rotaDoArquivo(caminho) {
  const relativo = path.relative(path.join(__dirname, '..', 'dist'), caminho).replaceAll(path.sep, '/');
  if (relativo === 'index.html') return '/';
  return `/${relativo.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/(?:^|\/)\([^/]+\)(?=\/|$)/g, '')}` || '/';
}

function gerarMetaTags(rota) {
  const atual = META_POR_ROTA[rota] ?? meta;
  const url = `${meta.siteUrl}${rota === '/' ? '/' : rota}`;
  const schema = rota === '/' ? `<script type="application/ld+json">${jsonLd}</script>` : '';
  return `
    <title>${escaparHtml(atual.title)}</title>
    <meta name="description" content="${escaparHtml(atual.description)}" />
    <meta name="theme-color" content="${meta.themeColor}" />
    <meta name="color-scheme" content="dark" />
    <meta name="facebook-domain-verification" content="tmjp4xpzl7euabyjjdk0hfrvcgsi2i" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg?v=grana-gradiente-20260830" />
    <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png?v=grana-gradiente-20260830" />
    <link rel="apple-touch-icon" href="/favicon.png?v=grana-gradiente-20260830" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Grana." />
    <meta property="og:title" content="${escaparHtml(atual.ogTitle)}" />
    <meta property="og:description" content="${escaparHtml(atual.ogDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${imagemAbsoluta}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escaparHtml(atual.ogTitle)}" />
    <meta name="twitter:description" content="${escaparHtml(atual.ogDescription)}" />
    <meta name="twitter:image" content="${imagemAbsoluta}" />
    ${schema}
  `;
}

function gerarFallback(rota) {
  const atual = META_POR_ROTA[rota] ?? meta;
  return `
    <noscript>
      <main style="max-width:720px;margin:48px auto;padding:24px;font:16px sans-serif;color:#effffa;background:#052229">
        <h1>${escaparHtml(atual.title)}</h1>
        <p>${escaparHtml(atual.description)}</p>
        <p>Ative o JavaScript para continuar.</p>
      </main>
    </noscript>
  `;
}

for (const caminho of listarHtml(path.join(__dirname, '..', 'dist'))) {
  const rota = rotaDoArquivo(caminho);
  let html = fs.readFileSync(caminho, 'utf8');
  if (!html.includes('</head>') || !html.includes('</body>')) {
    console.error(`[inject-og-meta] HTML inválido em ${rota}: faltam </head> ou </body>.`);
    process.exit(1);
  }

  html = html.replace(/<html([^>]*?)\slang=(['"])[^'"]*\2/i, '<html$1 lang="pt-BR"');
  if (!/<html[^>]*\slang=/i.test(html)) html = html.replace(/<html/i, '<html lang="pt-BR"');

  html = html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<link[^>]+rel=(['"])canonical\1[^>]*>/gi, '')
    .replace(/<script[^>]+type=(['"])application\/ld\+json\1[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]+rel=(['"])(?:shortcut icon|alternate icon|apple-touch-icon|icon)\1[^>]*>/gi, '')
    .replace(/<meta[^>]+(?:name|property)=(['"])(?:description|theme-color|color-scheme|facebook-domain-verification|og:type|og:site_name|og:title|og:description|og:url|og:image|og:image:width|og:image:height|twitter:card|twitter:title|twitter:description|twitter:image)\1[^>]*>/gi, '')
    .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
    .replace('</head>', `${gerarMetaTags(rota)}</head>`)
    .replace('</body>', `${gerarFallback(rota)}</body>`);

  const atual = META_POR_ROTA[rota] ?? meta;
  for (const esperado of [`<title>${escaparHtml(atual.title)}</title>`, `href="${meta.siteUrl}${rota === '/' ? '/' : rota}"`]) {
    if (!html.includes(esperado)) {
      console.error(`[inject-og-meta] falha ao injetar em ${rota}: ${esperado}`);
      process.exit(1);
    }
  }
  if (!/<html\s+lang="pt-BR"/i.test(html)) {
    console.error(`[inject-og-meta] idioma ausente em ${rota}.`);
    process.exit(1);
  }
  if (rota === '/' && !html.includes('application/ld+json')) {
    console.error('[inject-og-meta] JSON-LD ausente na home.');
    process.exit(1);
  }
  fs.writeFileSync(caminho, html);
}

console.log(`[inject-og-meta] SEO, canonical, JSON-LD e fallback injetados em ${listarHtml(path.join(__dirname, '..', 'dist')).length} rotas.`);
