const fs = require('node:fs');
const path = require('node:path');

const runtime = process.env.GRANA_NODE_MODULES || 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const { chromium } = require(runtime + 'playwright');
const sharp = require(runtime + 'sharp');

const root = process.cwd();
const sourceDir = path.join(root, 'docs/marketing/funil-criativos-flat-2026-09/revisao-04');
const out = path.join(root, 'docs/marketing/funil-criativos-flat-2026-09/revisao-05');
const assetDir = path.join(sourceDir, 'assets');

const uri = (file, mime) => 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const logo = uri(path.join(root, 'design-system/marca/logotipo-gradiente.svg'), 'image/svg+xml');
const symbol = uri(path.join(root, 'design-system/marca/simbolo-menta-sem-ponto.svg'), 'image/svg+xml');
const font = uri(path.join(root, 'assets/fonts/NeueMachina-Regular.otf'), 'font/otf');

const cards = [
  {
    id: 'E01', day: 1,
    title: 'O salário caiu.', subtitle: 'Quanto dele já tem destino?',
    caption: 'O saldo subiu. Mas o aluguel, a fatura e as contas continuam chegando. O Grana. ajuda a acompanhar esses compromissos e consultar o Livre para Gastar com base no que você registrou. Demonstração com dados fictícios.',
    screen: path.join(assetDir, 'celular-2.png'), screenMime: 'image/png', layout: 'mobile-left',
    prompt: 'Criativo estático de feed 1080x1440 para o Grana., fundo flat azul-petróleo, logo oficial em gradiente, mockup realista do celular com tela real da Home do Grana. grande à esquerda, H1 “O salário caiu.” à direita e H2 “Quanto dele já tem destino?” abaixo. Hierarquia produto > H1 > H2 > fundo. Arco menta discreto e poucos elementos geométricos. Não usar fotografia, pessoa, botão, texto inventado na interface, logotipo redesenhado ou tela gerada por IA. Preservar o mockup original e deixar a nota “Demonstração com dados fictícios.” pequena no rodapé.'
  },
  {
    id: 'E02', day: 4,
    title: 'O café, o delivery,\na corrida.', subtitle: 'Separados parecem pouco.\nJuntos, fazem parte do mês.',
    caption: 'Um gasto isolado não conta a história inteira. O Grana. ajuda a registrar os pequenos gastos e enxergar como eles entram no mês. Demonstração com dados fictícios.',
    screen: path.join(assetDir, 'celular-1.png'), screenMime: 'image/png', layout: 'mobile-right',
    prompt: 'Criativo estático de feed 1080x1440 para o Grana., fundo flat azul-petróleo, logo oficial em gradiente no alto, mockup realista do celular com tela real de Lançamentos do Grana. grande à direita, H1 “O café, o delivery, a corrida.” no alto à esquerda e H2 “Separados parecem pouco. Juntos, fazem parte do mês.” abaixo. Três pontos menta como sistema visual. Hierarquia produto > H1 > H2 > fundo. Não usar fotografia, pessoa, botão, logotipo redesenhado ou tela gerada por IA. Preservar o mockup original e deixar a nota “Demonstração com dados fictícios.” pequena no rodapé.'
  },
  {
    id: 'E05', day: 15,
    title: 'O mês que vem\njá começou.', subtitle: 'Nas parcelas deste mês.',
    caption: 'Uma compra parcelada não termina no dia da compra. O Grana. ajuda a acompanhar o que continua comprometendo os próximos meses. Demonstração com dados fictícios.',
    screen: path.join(assetDir, 'notebook-1.png'), screenMime: 'image/png', layout: 'desktop-bottom',
    prompt: 'Criativo estático de feed 1080x1440 para o Grana., fundo flat azul-petróleo, logo oficial em gradiente, mockup ultra-realista do notebook com tela real da área de cartões do Grana. ocupando a faixa inferior, H1 “O mês que vem já começou.” no alto à esquerda e H2 “Nas parcelas deste mês.” abaixo. Usar um arco geométrico menta como elemento de apoio e bastante respiro. Hierarquia produto > H1 > H2 > fundo. Não usar fotografia, pessoa, botão, logotipo redesenhado ou tela gerada por IA. Preservar o mockup original e deixar a nota “Demonstração com dados fictícios.” pequena no rodapé.'
  },
  {
    id: 'E06', day: 18,
    title: 'Organize no\ncomputador.', subtitle: 'Acompanhe no celular, com a mesma conta.',
    caption: 'O Grana. acompanha a sua rotina em mais de uma tela: organize com visão ampla no computador e consulte o mês quando estiver fora. Demonstração com dados fictícios.',
    screen: path.join(assetDir, 'notebook-2.png'), screenMime: 'image/png', layout: 'desktop-top',
    prompt: 'Criativo estático de feed 1080x1440 para o Grana., fundo flat azul-petróleo, logo oficial em gradiente, mockup ultra-realista do notebook com tela real da versão web do Grana. ocupando a parte central e inferior, H1 “Organize no computador.” no alto à esquerda e H2 “Acompanhe no celular, com a mesma conta.” abaixo. Símbolo do Grana. em baixa opacidade como textura geométrica. Hierarquia produto > H1 > H2 > fundo. Não usar fotografia, pessoa, botão, logotipo redesenhado ou tela gerada por IA. Preservar o mockup original e deixar a nota “Demonstração com dados fictícios.” pequena no rodapé.'
  }
];

function styleFor(card) {
  if (card.layout === 'mobile-left') return { shape: '<div class="arc arc-left"></div>', device: 'left:24px;top:294px;width:520px;transform:rotate(-5deg)', copy: 'left:590px;top:470px;width:410px', eyebrow: 'COMECE PELO PRÓXIMO GASTO' };
  if (card.layout === 'mobile-right') return { shape: '<div class="dot-grid"><i></i><i></i><i></i></div>', device: 'right:14px;top:302px;width:520px;transform:rotate(5deg)', copy: 'left:72px;top:310px;width:510px', eyebrow: 'O MÊS APARECE NOS DETALHES' };
  if (card.layout === 'desktop-bottom') return { shape: '<div class="arc arc-right"></div>', device: 'left:12px;top:500px;width:1058px;transform:rotate(-2deg)', copy: 'left:72px;top:196px;width:830px', eyebrow: 'COMPROMISSOS FUTUROS' };
  return { shape: '<img class="symbol" src="' + symbol + '">', device: 'left:12px;top:548px;width:1058px;transform:rotate(-2deg)', copy: 'left:72px;top:196px;width:830px', eyebrow: 'WEB + MOBILE' };
}

function makeHtml(card) {
  const visual = styleFor(card);
  const screen = uri(card.screen, card.screenMime);
  const title = esc(card.title).replaceAll('\n', '<br>');
  const subtitle = esc(card.subtitle).replaceAll('\n', '<br>');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>' +
    '@font-face{font-family:Neue;src:url(' + font + ');font-weight:400}' +
    '*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1440px;overflow:hidden}' +
    'body{position:relative;background:#052229;color:#effffa;font-family:Neue,Arial,sans-serif}' +
    '.logo{position:absolute;left:72px;top:64px;width:232px;height:auto;z-index:8}' +
    '.eyebrow{position:absolute;right:72px;top:76px;color:#a6d9ce;font-size:15px;letter-spacing:2px;z-index:8}' +
    '.copy{position:absolute;z-index:7}h1{margin:0;color:#effffa;font-size:68px;line-height:1.07;letter-spacing:-2.6px;font-weight:400}' +
    'h2{margin:29px 0 0;color:#aefee3;font-size:30px;line-height:1.35;letter-spacing:-.6px;font-weight:400}' +
    '.device{position:absolute;height:auto;z-index:5;filter:drop-shadow(0 28px 30px rgba(0,0,0,.3))}' +
    '.arc{position:absolute;z-index:1;border:2px solid rgba(174,254,227,.55);background:rgba(9,56,62,.7)}' +
    '.arc-left{left:-188px;top:310px;width:640px;height:830px;border-radius:0 420px 420px 0;border-left:0}' +
    '.arc-right{right:-280px;top:82px;width:740px;height:740px;border-radius:50%;background:rgba(11,55,62,.8);border-color:rgba(174,254,227,.3)}' +
    '.dot-grid{position:absolute;left:72px;bottom:220px;display:flex;gap:15px;z-index:2}.dot-grid i{display:block;width:23px;height:23px;background:#aefee3;border-radius:50%}.dot-grid i:nth-child(2){background:#15cbb0}.dot-grid i:nth-child(3){background:#f1c643}' +
    '.symbol{position:absolute;right:-160px;top:104px;width:690px;opacity:.075;z-index:1}' +
    '.footer{position:absolute;left:72px;bottom:62px;color:#7daea9;font-size:14px;letter-spacing:.2px;z-index:8}' +
    '</style></head><body>' + visual.shape + '<img class="logo" src="' + logo + '"><div class="eyebrow">' + visual.eyebrow + '</div>' +
    '<div class="copy" style="' + visual.copy + '"><h1>' + title + '</h1><h2>' + subtitle + '</h2></div>' +
    '<img class="device" src="' + screen + '" style="' + visual.device + '"><div class="footer">Demonstração com dados fictícios.</div>' +
    '</body></html>';
}

async function qaPage(page) {
  return page.evaluate(() => {
    const copy = document.querySelector('.copy').getBoundingClientRect();
    const device = document.querySelector('.device').getBoundingClientRect();
    const footer = document.querySelector('.footer').getBoundingClientRect();
    const images = [...document.images].map((img) => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight }));
    return { fontLoaded: document.fonts.check('30px Neue'), copyInside: copy.left >= 0 && copy.top >= 0 && copy.right <= 1080 && copy.bottom <= 1440, deviceInside: device.left > -120 && device.right < 1200 && device.top > -120 && device.bottom < 1500, footerInside: footer.left >= 0 && footer.right <= 1080 && footer.bottom <= 1440, images };
  });
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const result = [];
  try {
    for (const card of cards) {
      const html = makeHtml(card);
      const htmlPath = path.join(out, card.id + '.html');
      const pngPath = path.join(out, card.id + '-feed-1080x1440.png');
      fs.writeFileSync(htmlPath, html);
      const page = await browser.newPage({ viewport: { width: 1080, height: 1440 }, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.locator('img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
      const qa = await qaPage(page);
      if (!qa.fontLoaded || !qa.copyInside || !qa.deviceInside || !qa.footerInside || qa.images.some((image) => !image.complete || !image.width)) throw new Error(card.id + ' falhou QA: ' + JSON.stringify(qa));
      await page.screenshot({ path: pngPath, type: 'png' });
      await page.close();
      result.push({ id: card.id, day: card.day, format: 'feed', size: '1080x1440', file: path.basename(pngPath), sourceScreen: path.relative(root, card.screen), copy: { h1: card.title.replaceAll('\n', ' '), h2: card.subtitle.replaceAll('\n', ' ') }, caption: card.caption, prompt: card.prompt, qa });
      console.log(card.id + ' OK');
    }
  } finally { await browser.close(); }

  await sharp({ create: { width: 2160, height: 720, channels: 3, background: '#052229' } }).composite(await Promise.all(cards.map(async (card, index) => ({ input: await sharp(path.join(out, card.id + '-feed-1080x1440.png')).resize(540, 720).toBuffer(), left: index * 540, top: 0 })))).png().toFile(path.join(out, 'previa-feed-1080x1440.png'));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Lote inicial dos estáticos do novo calendário. E03 e E04 aguardam capturas reais de Pix e QR Code.', cards: result }, null, 2));
  fs.writeFileSync(path.join(out, 'prompts.md'), '# Prompts e conteúdo — lote inicial\n\n' + result.map((item) => '## ' + item.id + ' — Dia ' + item.day + '\n\n**Arquivo:** `' + item.file + '`  \n**H1:** ' + item.copy.h1 + '  \n**H2:** ' + item.copy.h2 + '  \n**Legenda:** ' + item.caption + '\n\n**Prompt copiável:**\n\n> ' + item.prompt + '\n').join('\n'));
  console.log('Prévia e manifest OK');
}

main().catch((error) => { console.error(error); process.exit(1); });
