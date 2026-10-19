// E5 real no navegador, com a fronteira remota dublada (nada de rede real, Meta ou Supabase).
// Roda a tela real (_publicacoes-reais-ui.js) em 390, 768 e 1440px: sem overflow, prévia só com
// mídia/legenda conferidas por hash, e a chave de idempotência sobrevive a timeout (achado C3).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'tools/admin-local/web');
const OUT = process.env.QA_SAIDA || path.join(require('os').tmpdir(), 'grana-pub-real');
fs.mkdirSync(OUT, { recursive: true });

function carregarPlaywright() {
  for (const base of [ROOT, process.env.PLAYWRIGHT_DIR].filter(Boolean)) {
    try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* tenta o próximo */ }
  }
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache)) {
      try { return createRequire(path.join(cache, d, 'node_modules', 'x.js'))('playwright'); } catch { /* segue */ }
    }
  }
  return null;
}
const pw = carregarPlaywright();
if (!pw) { console.log('admin-publicacoes-reais-dom: playwright indisponivel, pulado'); process.exit(0); }

function gerarPng(w, h) {
  const zlib = require('zlib');
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, dados) => { const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const corpo = Buffer.concat([Buffer.from(tipo), dados]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo)); return Buffer.concat([len, corpo, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x2a)]);
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(cru)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = gerarPng(240, 300);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const LEGENDA = 'Livre para gastar do mês, sem susto.';
const uuid = () => crypto.randomUUID();
const PECA = { id: 'a1b2c3d4e5f60718', titulo: 'Carrossel Livre para gastar', versao: 'c'.repeat(40), tipo: 'Carrossel', aprovada: true, bloqueios: [] };
const cap = (formato, estado = 'disponivel', motivos = []) => ({ formato, estado, revisao: 1, motivos });
const CONTAS = [
  { contaId: 'ig-1', rede: 'instagram', rotulo: '@grana.app', revisao: 3, conexao: 'verificada', pausada: false,
    capacidades: [cap('feed'), cap('carrossel'), cap('reels', 'nao-verificado', ['capacidade-nao-comprovada']), cap('stories', 'nao-suportado', ['formato-nao-suportado'])] },
  { contaId: 'fb-1', rede: 'facebook', rotulo: 'Grana. (Página)', revisao: 2, conexao: 'verificada', pausada: false,
    capacidades: [cap('feed'), cap('carrossel', 'nao-verificado', ['capacidade-nao-comprovada']), cap('reels', 'nao-verificado', ['capacidade-nao-comprovada']), cap('stories', 'nao-suportado', ['formato-nao-suportado'])] },
];
const LOTE = uuid();
const job = (contaId, rede, estado, extra = {}) => ({
  jobId: uuid(), loteId: LOTE, snapshotId: uuid(), revisao: 1, estado, atualizadoEm: '2026-10-18T12:00:00.000Z',
  destino: { contaId, rede, formato: 'feed', publicarEm: '2026-10-20T15:00:00.000Z', fuso: 'America/Sao_Paulo' },
  recibos: [{ reciboId: uuid(), operacao: 'agendar', estado: 'confirmado', iniciadoEm: '2026-10-18T12:00:00.000Z' }], ...extra,
});

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  let falhas = 0;
  const ok = (c, m) => { if (!c) { falhas++; console.error('FALHOU:', m); } else console.log('ok:', m); };

  for (const width of [390, 768, 1024, 1280, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const posts = [];
    let confirmarTentativas = 0; let leituraParcial = false; let catalogoDesatualizado = false; let leiturasCatalogo = 0;
    const jobs = [job('ig-1', 'instagram', 'agendado-na-meta'), job('fb-1', 'facebook', 'precisa-conferir')];
    const envelope = (dados, status = 200) => ({ status, contentType: 'application/json',
      body: JSON.stringify({ ok: status === 200, dados, atualizadoEm: new Date().toISOString(), erro: { codigo: 'qa', mensagem: 'QA' } }) });
    const real = (d) => ({ contractVersion: 'e5.real.v1', modo: 'real', ...d });
    page.on('pageerror', (e) => { falhas++; console.error('ERRO DE PÁGINA:', e.message); });

    await page.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const p = url.pathname;
      if (!p.startsWith('/api/')) {
        const arq = p.startsWith('/design-system/') ? path.join(ROOT, p) : path.join(WEB, p === '/' ? 'index.html' : p);
        return fs.existsSync(arq) && fs.statSync(arq).isFile() ? route.fulfill({ path: arq }) : route.fulfill({ status: 404, body: '' });
      }
      if (p === '/api/saude') return route.fulfill(envelope({ painel: 'grana-admin' }));
      if (p === '/api/sessao') return route.fulfill(envelope({ etapa: 'ok', restanteSeg: 3600, csrfToken: 'qa-sem-credencial' }));
      if (p === '/api/marketing/notificacoes') return route.fulfill(envelope({ status: 'indisponivel', fonte: 'indisponivel', naoLidas: null }));
      if (p === '/api/marketing/feed') return route.fulfill(envelope({ pecas: [{ id: PECA.id, data: '2026-10-20', hora: '12:00' }] }));
      if (p === '/api/marketing/cronograma') return route.fulfill(envelope(null));
      if (p === '/api/marketing/calendario/meta-publicados') return route.fulfill(envelope({ mes: '2026-10', completo: false, consultadoEm: new Date().toISOString(),
        redes: { instagram: { status: 'disponivel', completo: true }, facebook: { status: 'indisponivel', completo: false, motivo: 'token expirado' } },
        posts: [{ rede: 'instagram', formato: 'reel', data: '2026-10-15', publicadoEm: '2026-10-15T15:00:00Z', legenda: 'Post solto no dia', miniatura: null, link: 'https://www.instagram.com/p/abc/', chave: 'a'.repeat(16), vinculo: null }] }));
      if (p === '/api/marketing/calendario/ensaio') return route.fulfill(envelope({ modo: 'ensaio', realHabilitado: false, chamadasMeta: 0, itens: [] }));
      if (p === '/api/marketing/calendario') return route.fulfill(envelope({ itens: [{ peca: PECA, data: '2026-10-20', canal: 'instagram-feed' }, { peca: { id: 'd'.repeat(16), versao: 'a'.repeat(40), titulo: 'Post com destinos confirmados' }, data: '2026-10-19' }], aprovadosSemData: [],
        reais: { status: leituraParcial ? 'parcial' : 'disponivel', completo: !leituraParcial, proximoCursor: leituraParcial ? 'cursor-qa' : null, itens: jobs.map((j) => ({ ...j, confirmadoEm: '2026-10-18T12:00:00Z', peca: { pecaId: 'd'.repeat(16), versao: 'a'.repeat(40) } })) } }));
      if (p === '/api/marketing/publicacoes/capacidades') {
        return route.fulfill(envelope(real({ contas: CONTAS, controles: { revisao: 2, pausaGlobal: false, pausaFacebook: false, pausaInstagram: false, habilitado: true } })));
      }
      if (p === '/api/marketing/publicacoes/catalogo') { leiturasCatalogo++; const pecas = catalogoDesatualizado ? [] : [PECA]; catalogoDesatualizado = false; return route.fulfill(envelope({ pecas, total: pecas.length })); }
      if (p === '/api/marketing/publicacoes/midia') return route.fulfill({ status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' }, body: PNG });
      if (p === '/api/marketing/publicacoes/detalhe') return route.fulfill(envelope(real({ loteId: LOTE, jobs })));
      if (p === '/api/marketing/publicacoes' && req.method() === 'GET') return route.fulfill(envelope(real({ jobs, proximoCursor: null, limitado: false })));
      if (p === '/api/marketing/publicacoes' && req.method() === 'POST') {
        const body = req.postDataJSON();
        posts.push(body);
        if (body.acao === 'prever') {
          return route.fulfill(envelope(real({
            previaId: uuid(), previaHash: 'f'.repeat(64), revisao: 4, expiraEm: new Date(Date.now() + 600000).toISOString(), podeConfirmar: true,
            snapshot: { snapshotId: uuid(), estado: 'pronto', pecaId: PECA.id, versao: PECA.versao, legenda: LEGENDA, legendaSha256: sha(Buffer.from(LEGENDA)),
              midias: [{ ordem: 0, tipo: 'imagem', mime: 'image/png', sha256: sha(PNG) }], capa: null, motivos: [] },
            destinos: body.destinos.map((d) => ({ ...d, estado: 'pronto', motivos: [], publicarEm: body.agendarPara })),
          })));
        }
        if (body.acao === 'confirmar') {
          confirmarTentativas++;
          if (confirmarTentativas === 1) return route.abort('failed'); // resposta perdida: resultado incerto
          return route.fulfill(envelope(real({ loteId: LOTE, idempotencia: body.idempotencia, replay: true, jobs })));
        }
        return route.fulfill(envelope(real({ jobs })));
      }
      return route.fulfill(envelope({}, 503));
    });

    await page.goto('http://127.0.0.1:4399/#/marketing/publicacoes?mes=2026-10');
    await page.waitForLoadState('networkidle');
    await page.getByRole('heading', { name: 'Calendário', exact: true }).waitFor({ timeout: 15000 });
    ok(page.url().includes('visao=lista'), `${width}px: rota antiga redireciona para lista do calendário`);
    await page.screenshot({ path: path.join(OUT, `calendario-lista-${width}.png`), fullPage: true });
    // na grade (largura >= 900) os cartões são compactos: as ações ficam na janela do dia
    const abrirDia20 = async () => { if (width >= 900) await page.locator('.cal-dia[data-data="2026-10-20"] .cal-num-botao').click(); };
    await page.getByRole('button', { name: 'Calendário', exact: true }).click();
    await abrirDia20();
    await page.getByRole('button', { name: 'Agendar de verdade', exact: true }).waitFor();
    await page.screenshot({ path: path.join(OUT, `calendario-mes-${width}.png`), fullPage: true });
    // rodada 2: mês e dias com inicial maiúscula, células do mês todas do mesmo tamanho, post publicado solto no dia
    if (width >= 900) {
      const cab = await page.locator('.cal-dia-semana').allInnerTexts();
      ok(cab.join(',') === 'Seg,Ter,Qua,Qui,Sex,Sáb,Dom', `${width}px: dias da semana com inicial maiúscula (${cab.join(',')})`);
      const alturas = await page.locator('.cal-dia').evaluateAll((l) => [...new Set(l.map((c) => Math.round(c.getBoundingClientRect().height)))]);
      ok(alturas.length === 1, `${width}px: todas as células do mês têm a mesma altura (${alturas})`);
    }
    ok(await page.locator('.cal-item-meta', { hasText: 'Instagram · Reels' }).count() >= 1, `${width}px: post publicado na Meta aparece solto no dia`);
    ok(await page.locator('.cal-unico-status .alerta', { hasText: 'Facebook (token expirado)' }).count() === 1, `${width}px: leitura da Meta indisponível vira aviso, não "nada publicado"`);
    // F1 (Lynx): sem leitura real completa o botão some e o aviso toma o lugar, para não abrir um segundo agendamento
    const AVISO = 'Pode já ter agendamento real. Veja em Ambos.';
    const abrirCalendario = async (hash) => {
      await page.goto(`http://127.0.0.1:4399/#/marketing/calendario?mes=2026-10${hash}`);
      await page.reload();
      await page.getByRole('heading', { name: 'Outubro de 2026', exact: true }).waitFor({ timeout: 15000 });
      await page.locator('.cal-unico-item:visible').first().waitFor({ timeout: 15000 });
      await abrirDia20();
    };
    await abrirCalendario('&camada=planejado');
    ok(await page.getByRole('button', { name: 'Agendar de verdade', exact: true }).evaluateAll((bs) => bs.every((b) => b.disabled)), `${width}px: camada Planejado impede Agendar de verdade`);
    ok(await page.locator('.cal-aviso-real:visible', { hasText: AVISO }).count() >= 1, `${width}px: camada Planejado mostra o aviso de possível agendamento real`);
    leituraParcial = true;
    await abrirCalendario('&camada=ambos');
    ok(await page.getByRole('button', { name: 'Agendar de verdade', exact: true }).evaluateAll((bs) => bs.every((b) => b.disabled)), `${width}px: leitura parcial impede Agendar de verdade`);
    ok(await page.locator('.cal-aviso-real:visible', { hasText: AVISO }).count() >= 1, `${width}px: leitura parcial mostra o aviso de possível agendamento real`);
    leituraParcial = false;
    catalogoDesatualizado = true;
    await abrirCalendario('&camada=ambos');
    await page.getByRole('button', { name: 'Agendar de verdade', exact: true }).waitFor();
    ok(await page.locator('.cal-aviso-real', { hasText: AVISO }).count() === 0, `${width}px: leitura completa sem job ativo volta a oferecer o botão, sem aviso`);
    const leiturasAntesDeAbrir = leiturasCatalogo;
    await page.getByRole('button', { name: 'Agendar de verdade', exact: true }).click();
    await page.locator('.pub-real-compositor .pub-real-peca').first().waitFor({ timeout: 15000 });
    ok(leiturasCatalogo > leiturasAntesDeAbrir, `${width}px: catálogo desatualizado é relido ao abrir compositor`);
    ok(!await page.locator('.pub-real-compositor').innerText().then((t) => t.includes(PECA.versao)), `${width}px: compositor não mostra hash ao autor`);
    const semOverflow = () => page.evaluate('document.documentElement.scrollWidth <= innerWidth');
    ok(await semOverflow(), `${width}px: sem overflow horizontal na fila real`);

    // formatos sem capacidade comprovada não são selecionáveis
    const bloqueados = await page.locator('.pub-real-formato input:disabled').count();
    ok(bloqueados === 5, `${width}px: 5 formatos sem capacidade comprovada ficam desabilitados (achou ${bloqueados})`);

    await page.getByLabel('Instagram @grana.app, Feed').check();
    await page.getByLabel('Facebook Grana. (Página), Feed').check();
    await page.locator('[name="agendarParaLocal"]').fill('2026-12-01T10:30');
    const resumo = await page.locator('.pub-real-horario-resumo').innerText();
    // 19/10: o autor lê quando o Grana. começa a preparar e quando publica (horário de Brasília), sem ISO/UTC na cara.
    ok(/começa a preparar em .*01\/12.*10:00 e publica em .*01\/12.*10:30/.test(resumo) && !/UTC|Z\b/.test(resumo), `${width}px: horário diz quando prepara e publica (${resumo.slice(0, 90)}...)`);
    ok(await page.getByText('Use o horário de Brasília', { exact: false }).count() >= 1, `${width}px: fuso explicado ao autor`);
    await page.screenshot({ path: path.join(OUT, `real-compositor-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: 'Gerar prévia dos destinos' }).click();
    await page.locator('.pub-real-previa-destino').first().waitFor({ timeout: 15000 });
    ok(await page.locator('.pub-real-previa-destino').count() === 2, `${width}px: uma prévia por destino`);
    if (process.env.DEPURA && !(await semOverflow())) console.log(await page.evaluate(() => [...document.querySelectorAll('.pub-real-previa *, .pub-real-previews *')].filter((n) => n.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((n) => n.tagName + '.' + n.className + ' ' + Math.round(n.getBoundingClientRect().right))));
    ok(await semOverflow(), `${width}px: sem overflow com a prévia aberta`);
    const corpoTexto = await page.locator('main, .tela, body').first().innerText();
    ok(!/\[object |null|undefined/.test(corpoTexto), `${width}px: nenhum [object/null/undefined vaza para a tela`);
    // a decodificacao do blob e assincrona: espera com prazo explicito e falha dizendo quais imagens nao decodificaram
    await page.waitForFunction(() => {
      const l = [...document.querySelectorAll('.pub-real-previa-destino img')];
      return l.length >= 2 && l.every((i) => i.complete && i.naturalWidth > 0);
    }, null, { timeout: 10000 }).catch(async () => {
      const estado = await page.locator('.pub-real-previa-destino img').evaluateAll((l) => l.map((i, n) => `#${n} complete=${i.complete} naturalWidth=${i.naturalWidth} src=${String(i.src).slice(0, 40)}`));
      throw new Error(`${width}px: imagens da prévia não decodificaram em 10s: ${JSON.stringify(estado)}`);
    });
    const imgs = await page.locator('.pub-real-previa-destino img').evaluateAll((l) => l.map((i) => [i.complete, i.naturalWidth]));
    if (process.env.DEPURA) console.log(await page.locator('.pub-real-previa-destino img').evaluateAll((l) => l.map((i) => i.outerHTML.slice(0, 220))));
    ok(imgs.length >= 2 && imgs.every(([c, w]) => c && w > 0), `${width}px: mídia da prévia decodificada (${JSON.stringify(imgs)})`);
    const botaoConfirmar = page.getByRole('button', { name: 'Confirmar agendamento real' });
    ok(await botaoConfirmar.isDisabled(), `${width}px: confirmar bloqueado até revisar os destinos`);
    await page.screenshot({ path: path.join(OUT, `real-previa-${width}.png`), fullPage: true });
    await page.getByLabel('Revisei a mídia, a legenda e cada destino acima.').check();
    ok(await botaoConfirmar.isEnabled(), `${width}px: confirmar liberado só depois da revisão`);

    // 1ª tentativa perde a resposta; a repetição tem de usar a MESMA chave idempotente (C3)
    await botaoConfirmar.click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Autorizar agendamento real' }).click();
    await page.locator('.pub-real-consulta-pendente').waitFor({ timeout: 15000 });
    ok(posts.filter((b) => b.acao === 'confirmar').length === 1, `${width}px: timeout não dispara reenvio automático`);
    await botaoConfirmar.click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Autorizar agendamento real' }).click();
    // R9: fecha a janela, avisa "Agendado: Instagram e Facebook, ..." e leva ao mês da publicação (dezembro).
    await page.waitForFunction(() => [...document.querySelectorAll('.avisos .aviso')].some((a) => /^Agendado: Instagram e Facebook, em .*01\/12.*10:30\. Acompanhe/.test(a.textContent)), null, { timeout: 15000 });
    await page.waitForFunction(() => location.hash.includes('mes=2026-12'), null, { timeout: 15000 });
    ok(await page.locator('.pub-real-compositor:visible').count() === 0, `${width}px: compositor fecha depois de confirmar`);
    const conf = posts.filter((b) => b.acao === 'confirmar');
    ok(conf.length === 2 && conf[0].idempotencia === conf[1].idempotencia && /^[0-9a-f-]{36}$/.test(conf[0].idempotencia),
      `${width}px: repetição após timeout reutiliza a mesma chave idempotente`);
    ok(conf.every((b) => b.confirmacao === true && b.revisaoEsperada === 4 && b.previaHash === 'f'.repeat(64)), `${width}px: confirmar leva hash, revisão e confirmação`);
    ok(!JSON.stringify(posts).match(/token|segredo|https?:\/\/[^"]*supabase/i), `${width}px: nenhum segredo/URL privada nos pedidos`);

    await page.screenshot({ path: path.join(OUT, `real-fila-${width}.png`), fullPage: true });
    ok(await semOverflow(), `${width}px: sem overflow depois de confirmar`);
    await page.close();
  }
  await browser.close();
  if (falhas) { console.error(`admin-publicacoes-reais-dom: ${falhas} falha(s)`); process.exit(1); }
  console.log(`admin-publicacoes-reais-dom: tudo certo; prints em ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
