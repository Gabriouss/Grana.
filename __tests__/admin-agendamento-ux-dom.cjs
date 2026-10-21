// 19/10/2026: agendamento real à prova de autor cansado. Navegador real com o compositor e o
// Calendário reais; só a fronteira HTTP é dublada (nada de rede, Meta ou Supabase) e o relógio é
// controlado. Prova: horário em cima da hora bloqueia sem POST; erro vira frase com código à parte;
// prévia vence e "Gerar outra prévia" refaz o mesmo pedido; pausa aparece antes da prévia; depois
// de confirmar, a janela fecha, o aviso diz o que foi agendado e o estado real é relido a cada
// 30 s até ficar final, avisando "não confirmamos" sem nunca reenviar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'tools/admin-local/web');
const OUT = process.env.QA_SAIDA || path.join(require('os').tmpdir(), 'grana-agendamento-ux');
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
if (!pw) { console.log('admin-agendamento-ux-dom: playwright indisponivel, pulado'); process.exit(0); }

function gerarPng(w, h) {
  const zlib = require('zlib');
  const tabela = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabela[n] = c >>> 0; }
  const crc = (buf) => { let r = 0xffffffff; for (const b of buf) r = tabela[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, dados) => { const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const corpo = Buffer.concat([Buffer.from(tipo), dados]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo)); return Buffer.concat([len, corpo, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x2a)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)))), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = gerarPng(240, 300);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const LEGENDA = 'Legenda fictícia de teste.';
const T0 = Date.parse('2026-10-19T03:00:00.000Z'); // 19/10 00:00 em São Paulo
const iso = (min) => new Date(T0 + min * 60000).toISOString();
// O catálogo real manda as mídias da peça; sem elas o compositor não oferece formato (0e153a10).
const PECA = { id: 'a1b2c3d4e5f60718', titulo: 'Carrossel AUDIT', versao: 'c'.repeat(40), tipo: 'carrossel', aprovada: true, bloqueios: [],
  midias: [{ tipo: 'imagem', mime: 'image/jpeg' }, { tipo: 'imagem', mime: 'image/jpeg' }] };
const cap = (formato) => ({ formato, estado: 'disponivel', revisao: 1, motivos: [] });
const CONTAS = [
  { contaId: 'ig-1', rede: 'instagram', rotulo: '@grana.audit', revisao: 3, conexao: 'verificada', pausada: false, capacidades: ['feed', 'carrossel'].map(cap) },
  { contaId: 'fb-1', rede: 'facebook', rotulo: 'Grana. AUDIT', revisao: 2, conexao: 'verificada', pausada: false, capacidades: ['feed', 'carrossel'].map(cap) },
];
const LOTE = crypto.randomUUID(), SNAP = crypto.randomUUID();
const IDS = { instagram: crypto.randomUUID(), facebook: crypto.randomUUID() };
// Linha do tempo dos jobs após a confirmação, uma fase por leitura do Calendário.
const FASES = [
  { instagram: 'programado-no-painel', facebook: 'programado-no-painel' },
  { instagram: 'agendado-na-meta', facebook: 'precisa-conferir' },
  { instagram: 'publicado', facebook: 'precisa-conferir' },
];

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  let falhas = 0;
  const ok = (c, m) => { if (!c) { falhas++; console.error('FALHOU:', m); } else console.log('ok:', m); };

  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    await page.clock.install({ time: T0 });
    const posts = [];
    let confirmado = false, fase = 0, leiturasCalendario = 0, prever = 0;
    const agendarPara = iso(60); // 01:00 em São Paulo
    const job = (rede, estado) => ({
      jobId: IDS[rede], loteId: LOTE, snapshotId: SNAP, revisao: 1 + FASES.findIndex((f) => f[rede] === estado), estado,
      atualizadoEm: iso(1), confirmadoEm: iso(1), codigoErro: estado === 'precisa-conferir' ? 'resultado-desconhecido' : null,
      permalink: estado === 'publicado' ? 'https://www.instagram.com/p/AUDIT/' : null,
      destino: { contaId: rede === 'instagram' ? 'ig-1' : 'fb-1', rede, formato: 'carrossel', publicarEm: agendarPara, fuso: 'America/Sao_Paulo' },
      peca: { pecaId: PECA.id, versao: PECA.versao }, recibos: [],
    });
    const jobsAgora = () => (confirmado ? ['instagram', 'facebook'].map((r) => job(r, FASES[Math.min(fase, FASES.length - 1)][r])) : []);
    const envelope = (dados, status = 200, codigo = 'qa') => ({ status, contentType: 'application/json',
      body: JSON.stringify({ ok: status === 200, dados, atualizadoEm: new Date(T0).toISOString(), erro: { codigo, mensagem: 'Mensagem crua do servidor' } }) });
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
      if (p === '/api/marketing/feed') return route.fulfill(envelope({ pecas: [{ id: PECA.id, data: '2026-10-20' }] }));
      if (p === '/api/marketing/cronograma') return route.fulfill(envelope(null));
      if (p === '/api/marketing/calendario/meta-publicados') return route.fulfill(envelope({ mes: '2026-10', completo: true, redes: {}, posts: [] }));
      if (p === '/api/marketing/calendario/ensaio') return route.fulfill(envelope({ modo: 'ensaio', realHabilitado: false, chamadasMeta: 0, itens: [] }));
      if (p === '/api/marketing/calendario') {
        if (confirmado) { leiturasCalendario++; if (leiturasCalendario > 1) fase++; }
        return route.fulfill(envelope({ itens: [{ peca: PECA, data: '2026-10-20', canal: 'instagram-feed' }], aprovadosSemData: [],
          reais: { status: 'disponivel', completo: true, proximoCursor: null, itens: jobsAgora() } }));
      }
      if (p === '/api/marketing/publicacoes/capacidades') {
        return route.fulfill(envelope(real({ contas: CONTAS, controles: { revisao: 2, pausaGlobal: true, pausaFacebook: false, pausaInstagram: false, habilitado: true } })));
      }
      if (p === '/api/marketing/publicacoes/catalogo') return route.fulfill(envelope({ pecas: [PECA], total: 1 }));
      if (p === '/api/marketing/publicacoes/midia') return route.fulfill({ status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' }, body: PNG });
      if (p === '/api/marketing/publicacoes' && req.method() === 'GET') return route.fulfill(envelope(real({ jobs: jobsAgora(), proximoCursor: null, limitado: false })));
      if (p === '/api/marketing/publicacoes' && req.method() === 'POST') {
        const body = req.postDataJSON();
        posts.push(body);
        if (body.acao === 'prever') {
          prever++;
          const agora = await page.evaluate(() => Date.now()); // a prévia vale 10 min no relógio da página
          if (prever === 1) return route.fulfill(envelope(null, 409, 'operacao-pausada'));
          return route.fulfill(envelope(real({
            previaId: crypto.randomUUID(), previaHash: 'f'.repeat(64), revisao: 4, expiraEm: new Date(agora + 10 * 60000).toISOString(), podeConfirmar: true,
            snapshot: { snapshotId: SNAP, estado: 'pronto', pecaId: PECA.id, versao: PECA.versao, legenda: LEGENDA, legendaSha256: sha(Buffer.from(LEGENDA)),
              midias: [{ ordem: 0, tipo: 'imagem', mime: 'image/png', sha256: sha(PNG) }], capa: null, motivos: [] },
            destinos: body.destinos.map((d) => ({ ...d, estado: 'pronto', motivos: [], publicarEm: body.agendarPara })),
          }, prever)));
        }
        if (body.acao === 'confirmar') {
          confirmado = true;
          return route.fulfill(envelope(real({ loteId: LOTE, idempotencia: body.idempotencia, replay: false, jobs: jobsAgora() })));
        }
        return route.fulfill(envelope({}, 503, 'inesperado'));
      }
      return route.fulfill(envelope({}, 503));
    });
    await page.goto('http://127.0.0.1:4399/#/marketing/calendario?mes=2026-10&camada=ambos');
    await page.getByRole('heading', { name: 'Outubro de 2026', exact: true }).waitFor({ timeout: 15000 });
    await page.locator('.cal-unico-item:visible, .cal-icone:visible').first().waitFor({ timeout: 15000 });
    if (width >= 900) await page.locator('.cal-dia[data-data="2026-10-20"] .cal-num-botao').click();
    await page.getByRole('button', { name: 'Agendar de verdade', exact: true }).first().click();
    const comp = page.locator('.pub-real-compositor');
    await comp.getByText('1 · Peça aprovada vigente').waitFor({ timeout: 15000 });

    // 5. Pausa visível no topo do compositor, antes da prévia, com Retomar ali mesmo.
    ok(await comp.locator('.pub-real-pausa-estado', { hasText: 'Pausa geral está ligada' }).count() === 1, `${width}px: pausa geral aparece antes da prévia`);
    ok(await comp.getByRole('button', { name: 'Retomar tudo' }).count() === 1, `${width}px: Retomar ao lado do aviso de pausa`);

    // 1. Antecedência: em cima da hora bloqueia, com texto e sem POST; o padrão sugerido já é válido.
    await comp.getByLabel('Instagram @grana.audit, Carrossel').check();
    await comp.getByLabel('Facebook Grana. AUDIT, Carrossel').check();
    const hora = comp.locator('[name="agendarParaLocal"]');
    ok(await hora.inputValue() === '2026-10-20T09:00', `${width}px: data editorial futura vira o horário inicial (${await hora.inputValue()})`);
    await hora.fill('2026-10-19T00:10');
    const resumo = comp.locator('.pub-real-horario-resumo');
    ok(/Muito em cima da hora: o Grana\. precisa de 30 min .* marque a partir das 00:3[05]\./.test(await resumo.innerText()), `${width}px: em cima da hora explica e sugere (${await resumo.innerText()})`);
    ok(await comp.getByRole('button', { name: 'Gerar prévia dos destinos' }).isDisabled(), `${width}px: em cima da hora não gera prévia`);
    await hora.fill('2026-10-18T23:00');
    ok(/^Esse horário já passou\. Marque a partir das 00:3[05]\.$/.test(await resumo.innerText()), `${width}px: horário passado bloqueia com texto`);
    ok(posts.length === 0, `${width}px: nenhum POST com horário ruim`);
    await hora.fill('2026-10-19T01:00');
    ok(/O Grana\. começa a preparar às 00:30 e publica às 01:00\./.test(await resumo.innerText()), `${width}px: horário bom diz quando prepara e publica`);

    // 3. Erro do servidor vira frase com ação; o código fica à parte.
    await comp.getByRole('button', { name: 'Gerar prévia dos destinos' }).click();
    const previa = page.locator('.pub-real-previa');
    await previa.getByText('A pausa está ligada. Clique em Retomar no topo desta janela').waitFor({ timeout: 15000 });
    const tecnico = previa.locator('details', { hasText: 'Código: operacao-pausada' });
    ok(await tecnico.count() === 1 && await tecnico.getAttribute('open') === null, `${width}px: código fica em Detalhes técnicos recolhidos depois da frase`);
    ok(!/Mensagem crua do servidor|HTTP 409/.test(await previa.innerText()), `${width}px: sem mensagem crua nem HTTP para o autor`);
    await page.screenshot({ path: path.join(OUT, `erro-pausa-${width}.png`), fullPage: true });

    // 2. Prévia com prazo; vencida, Confirmar trava e "Gerar outra prévia" refaz o MESMO pedido.
    await previa.getByRole('button', { name: 'Gerar outra prévia' }).click();
    await previa.locator('.pub-real-previa-destino').first().waitFor({ timeout: 15000 });
    ok(/A prévia vale por mais (9|10) min\./.test(await previa.locator('.pub-real-prazo').innerText()), `${width}px: contagem regressiva da prévia`);
    await page.clock.runFor(10 * 60000 + 6000);
    await previa.getByText('A prévia venceu.').waitFor({ timeout: 15000 });
    ok(await previa.getByRole('button', { name: 'Agendar', exact: true }).isDisabled(), `${width}px: prévia vencida trava Agendar`);
    await page.screenshot({ path: path.join(OUT, `previa-vencida-${width}.png`), fullPage: true });
    await previa.getByRole('button', { name: 'Gerar outra prévia' }).click();
    await previa.getByText(/A prévia vale por mais (9|10) min\./).waitFor({ timeout: 15000 });
    const previas = posts.filter((b) => b.acao === 'prever');
    ok(previas.length === 3 && previas.every((b) => JSON.stringify([b.destinos, b.agendarPara, b.versao]) === JSON.stringify([previas[0].destinos, previas[0].agendarPara, previas[0].versao])),
      `${width}px: gerar outra prévia repete a mesma seleção e horário`);

    // 4. Confirmar fecha a janela, avisa e leva ao Calendário; depois relê a cada 30 s até ficar final.
    await previa.getByRole('button', { name: 'Agendar', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.avisos .aviso')].some((a) => /^Agendado: Instagram e Facebook, hoje às 01:00\. Acompanhe/.test(a.textContent)), null, { timeout: 15000 });
    ok(await page.locator('.pub-real-compositor:visible').count() === 0, `${width}px: compositor fecha depois de confirmar`);
    const leiturasDepoisConfirmar = leiturasCalendario;
    await page.screenshot({ path: path.join(OUT, `agendado-${width}.png`), fullPage: true });

    await page.clock.runFor(30000);
    await page.waitForFunction(() => [...document.querySelectorAll('.avisos .aviso-erro')].some((a) => a.textContent.includes('Facebook: Precisa conferir: não confirmamos se saiu.') && a.textContent.includes('Abra o Facebook antes de tentar de novo')), null, { timeout: 15000 });
    ok(leiturasCalendario === leiturasDepoisConfirmar + 1, `${width}px: uma releitura a cada 30 s (${leiturasDepoisConfirmar} -> ${leiturasCalendario})`);
    const avisoFb = await page.locator('.avisos .aviso-erro').last().innerText();
    ok(!/tente de novo agora|reenvi|repita o envio/i.test(avisoFb), `${width}px: atenção não sugere repetir o envio`);
    await page.clock.runFor(30000);
    await page.waitForFunction(() => [...document.querySelectorAll('.avisos .aviso')].some((a) => a.textContent.startsWith('Instagram: publicado.')), null, { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, `publicado-${width}.png`), fullPage: true });
    const leiturasFinais = leiturasCalendario;
    await page.clock.runFor(120000);
    ok(leiturasCalendario === leiturasFinais, `${width}px: releitura para quando todos os destinos chegam a estado final`);
    ok(posts.filter((b) => b.acao === 'confirmar').length === 1 && posts.length === 4, `${width}px: nenhum POST além de 3 prévias e 1 confirmação (${posts.map((b) => b.acao)})`);
    await page.close();
  }
  await browser.close();
  if (falhas) { console.error(`admin-agendamento-ux-dom: ${falhas} falha(s)`); process.exit(1); }
  console.log(`admin-agendamento-ux-dom: antecedência, frases, prazo da prévia, pausa e acompanhamento até final OK; prints em ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
