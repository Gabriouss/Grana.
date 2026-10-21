// AUD-05 (21/10/2026): no celular, a barra superior fica na altura natural mesmo em tela curta. A casca é
// grade com min-height de 100vh; com linhas auto, a sobra de uma tela curta (Feedbacks em erro, relatório
// indisponível) era repartida e a barra chegava a 231px. Painel real (index.html + app.js + estilo.css) no
// Chromium, com a fronteira /api dublada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'tools/admin-local/web');
function playwright() {
  const bases = [ROOT, process.env.PLAYWRIGHT_DIR];
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache/_npx');
  if (fs.existsSync(cache)) for (const pasta of fs.readdirSync(cache)) bases.push(path.join(cache, pasta, 'node_modules'));
  for (const base of bases.filter(Boolean)) try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* tenta o próximo */ }
  throw Error('Playwright indisponível. A prova de navegador não pode ser declarada verde.');
}
const envelope = (dados, status = 200) => ({ status, contentType: 'application/json',
  body: JSON.stringify({ ok: status === 200, dados, atualizadoEm: new Date().toISOString(), erro: { codigo: 'qa', mensagem: 'Falha simulada.' } }) });

(async () => {
  const browser = await playwright().chromium.launch({ headless: true });
  let medidas = 0;
  try {
    for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const erros = []; page.on('pageerror', (e) => erros.push(e.message));
      await page.route('**/*', (route) => {
        const p = new URL(route.request().url()).pathname;
        if (!p.startsWith('/api/')) {
          const arq = p.startsWith('/design-system/') ? path.join(ROOT, p) : path.join(WEB, p === '/' ? 'index.html' : p);
          return fs.existsSync(arq) && fs.statSync(arq).isFile() ? route.fulfill({ path: arq }) : route.fulfill({ status: 404, body: '' });
        }
        if (p === '/api/saude') return route.fulfill(envelope({ painel: 'grana-admin' }));
        if (p === '/api/sessao') return route.fulfill(envelope({ etapa: 'ok', restanteSeg: 3600, csrfToken: 'qa-sem-credencial' }));
        if (p === '/api/marketing/notificacoes') return route.fulfill(envelope({ status: 'indisponivel', fonte: 'indisponivel', naoLidas: null }));
        return route.fulfill(envelope(null, 503)); // Feedbacks e o resto: leitura falhou, tela curta
      });
      await page.goto('http://127.0.0.1:4396/#/marketing/feedbacks');
      await page.locator('#tela .estado-erro').waitFor({ timeout: 15000 });
      const m = await page.evaluate(() => {
        const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { topo: b.top, base: b.bottom, h: b.height }; };
        const barra = document.querySelector('.barra-topo');
        return { barra: r('.barra-topo'), conteudo: r('.conteudo'), casca: r('.casca'), menu: r('.botao-menu'),
          visivel: getComputedStyle(barra).display !== 'none', fixa: getComputedStyle(barra).position, alturaTela: innerHeight };
      });
      const rotulo = `${width}x${height}`;
      if (width < 900) {
        // Altura natural: o botão Menu (44px) mais o padding da barra, nunca a sobra da tela.
        assert.ok(m.visivel && m.fixa === 'sticky', `${rotulo}: barra visível e presa ao topo`);
        assert.ok(m.barra.h <= m.menu.h + 24, `${rotulo}: barra na altura natural (${m.barra.h}px, botão ${m.menu.h}px)`);
        assert.ok(Math.abs(m.conteudo.topo - m.barra.base) <= 1, `${rotulo}: conteúdo começa logo abaixo da barra`);
        assert.ok(m.conteudo.base >= m.alturaTela - 1, `${rotulo}: conteúdo leva o espaço livre até o fim da tela`);
      } else {
        assert.ok(!m.visivel, `${rotulo}: no desktop a barra do celular não aparece`);
        assert.ok(m.casca.h >= m.alturaTela - 1, `${rotulo}: casca ocupa a tela`);
      }
      assert.deepEqual(erros, [], `${rotulo}: sem erro de página`);
      medidas++;
      await page.close();
    }
    console.log(`admin-casca-barra-topo-dom: barra superior na altura natural em tela curta, em ${medidas} larguras OK`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
