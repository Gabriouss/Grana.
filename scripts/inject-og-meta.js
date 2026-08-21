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
//
// Pelo mesmo motivo, injeta também um rodapé estático com a razão social:
// a Verificação de Empresa da Meta rejeitou o domínio porque não achou o
// nome do titular na página — e não ia achar mesmo, porque o app inteiro
// é uma SPA. O HTML puro que sai do export é só um <div id="root"></div>
// vazio; tudo o resto nasce depois, quando o JavaScript roda no navegador.
// O rastreador da Meta não executa JavaScript, então ele nunca chegava a
// ver nada — não importava onde dentro do app esse texto estivesse.
//
// O rodapé fica como IRMÃO de #root (nunca dentro), pra o React/Expo Router
// nunca tocar nele. Continua no documento pra sempre — só não aparece pra
// quem usa o app de verdade, porque o próprio reset do Expo Web deixa o
// body com `overflow:hidden` e o #root ocupando 100% da altura por cima.
// Não é conteúdo escondido de propósito (sem display:none) — é o raspador
// que não roda CSS, então enxerga o texto igual a qualquer leitor de tela.
const fs = require('fs');
const path = require('path');

const URL_SITE = 'https://granaponto.com.br';
const TITULO = 'Grana.';
const DESCRICAO = 'Controle financeiro pessoal: lançamentos, cartões, orçamento e gráficos, sincronizados entre celular e computador.';
const RAZAO_SOCIAL = 'Gabriel de Souza Magalhães';

const rodapeIdentificacao = `
    <footer style="font: 12px sans-serif; color: #7fa9a0; padding: 8px 16px;">
      Grana. (${URL_SITE.replace('https://', '')}) é um produto de ${RAZAO_SOCIAL}.
    </footer>
  </body>`;

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

if (!html.includes('</body>')) {
  console.error('[inject-og-meta] dist/index.html sem </body> — export mudou de formato?');
  process.exit(1);
}

html = html.replace('<html lang="en">', '<html lang="pt-BR">');
html = html.replace('</head>', metaTags);
html = html.replace('</body>', rodapeIdentificacao);

fs.writeFileSync(indexPath, html);
console.log('[inject-og-meta] meta tags Open Graph e rodapé de identificação injetados em dist/index.html');
