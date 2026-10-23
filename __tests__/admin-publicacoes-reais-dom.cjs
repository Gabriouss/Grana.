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
const PECA = { id: 'a1b2c3d4e5f60718', titulo: 'Imagem Livre para gastar', versao: 'c'.repeat(40), tipo: 'imagem',
  midias: [{ tipo: 'imagem', mime: 'image/jpeg' }], aprovada: true, bloqueios: [] };
const cap = (formato, estado = 'disponivel', motivos = []) => ({ formato, estado, revisao: 1, motivos });
const CONTAS = [
  { contaId: 'ig-1', rede: 'instagram', rotulo: '@grana.app', revisao: 3, conexao: 'verificada', pausada: false,
    capacidades: [cap('feed'), cap('carrossel'), cap('reels', 'nao-verificado', ['capacidade-nao-comprovada']), cap('stories')] },
  { contaId: 'fb-1', rede: 'facebook', rotulo: 'Grana. (Página)', revisao: 2, conexao: 'verificada', pausada: false,
    capacidades: [cap('feed'), cap('carrossel', 'nao-verificado', ['capacidade-nao-comprovada']), cap('reels', 'nao-verificado', ['capacidade-nao-comprovada']), cap('stories')] },
];
const LOTE = uuid();
const AGORA_FIXTURE = Date.parse('2026-10-19T12:00:00-03:00');
const job = (contaId, rede, estado, extra = {}) => ({
  jobId: uuid(), loteId: LOTE, snapshotId: uuid(), revisao: 1, estado, atualizadoEm: '2026-10-18T12:00:00.000Z',
  destino: { contaId, rede, formato: 'feed', publicarEm: '2026-10-20T15:00:00.000Z', fuso: 'America/Sao_Paulo' },
  recibos: [{ reciboId: uuid(), operacao: 'agendar', estado: 'confirmado', iniciadoEm: '2026-10-18T12:00:00.000Z' }], ...extra,
});

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  let falhas = 0;
  const ok = (c, m) => { if (!c) { falhas++; console.error('FALHOU:', m); } else console.log('ok:', m); };

  for (const width of (process.env.QA_LARGURAS ? process.env.QA_LARGURAS.split(',').map(Number) : [390, 768, 1024, 1280, 1440])) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    // O calendário sintético de20/10 não expira com o relógio da máquina.
    // Mantém timers reais; apenas Date/Date.now representam a data da fixture.
    await page.addInitScript(() => {
      const Original = Date, agora = Original.parse('2026-10-19T12:00:00-03:00');
      globalThis.Date = class extends Original {
        constructor(...args) { super(...(args.length ? args : [agora])); }
        static now() { return agora; }
      };
    });
    const posts = [];
    let confirmarTentativas = 0; let leituraParcial = false; let catalogoDesatualizado = false; let leiturasCatalogo = 0;
    const jobs = [job('ig-1', 'instagram', 'agendado-na-meta'), job('fb-1', 'facebook', 'precisa-conferir')];
    const reagendavel = job('ig-1', 'instagram', 'precisa-conferir', { codigoErro: 'lease-vencida', reagendamento: { permitido: true, motivos: [] } });
    const publicado = job('fb-1', 'facebook', 'publicado', { permalink: 'https://www.facebook.com/qa', reagendamento: { permitido: true } });
    jobs.push(reagendavel, publicado);
    const editorial = job('ig-1', 'instagram', 'programado-no-painel', { pausado: true, motivoSuspensao: 'revisao-editorial',
      reagendamento: { permitido: true, motivos: [] } }); // metadado contraditório não contorna suspensão
    jobs.push(editorial);
    let perderReagendamento = false, consultasReagendamento = 0;
    let falhaEditorial = false, falhaPerfil = false;
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
      if (p === '/api/marketing/feed') return route.fulfill(envelope({ pecas: [{ ...PECA, legenda: LEGENDA, data: '2026-10-20', hora: '12:00' }] }, falhaEditorial ? 503 : 200));
      if (p === '/api/marketing/feed-real') return route.fulfill(envelope({ status: 'disponivel', perfil: { usuario: 'granaponto', posts: 1 }, vinculadas: [],
        posts: [{ formato: 'imagem', legenda: 'Publicação comprovada', link: 'https://www.instagram.com/p/qa/', chave: 'e'.repeat(16), data: '2026-10-19' }] }, falhaPerfil ? 503 : 200));
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
      if (p === '/api/marketing/publicacoes/detalhe') {
        if (perderReagendamento && url.searchParams.has('idempotencia')) {
          consultasReagendamento++;
          return route.fulfill(envelope(real({ loteId: LOTE, jobs: consultasReagendamento === 1 ? [] : jobs })));
        }
        return route.fulfill(envelope(real({ loteId: LOTE, jobs })));
      }
      if (p === '/api/marketing/publicacoes' && req.method() === 'GET') return route.fulfill(envelope(real({ jobs, proximoCursor: null, limitado: false })));
      if (p === '/api/marketing/publicacoes' && req.method() === 'POST') {
        const body = req.postDataJSON();
        posts.push(body);
        if (body.acao === 'prever') {
          return route.fulfill(envelope(real({
            previaId: uuid(), previaHash: 'f'.repeat(64), revisao: 4, expiraEm: new Date(AGORA_FIXTURE + 600000).toISOString(), podeConfirmar: true,
            snapshot: { snapshotId: body.jobId ? reagendavel.snapshotId : uuid(), estado: 'pronto', pecaId: body.jobId ? 'd'.repeat(16) : PECA.id, versao: body.jobId ? 'a'.repeat(40) : PECA.versao, legenda: LEGENDA, legendaSha256: sha(Buffer.from(LEGENDA)),
              midias: [{ ordem: 0, tipo: 'imagem', mime: 'image/png', sha256: sha(PNG) }], capa: null, motivos: [] },
            destinos: body.destinos.map((d) => ({ ...d, estado: 'pronto', motivos: [], publicarEm: body.agendarPara })),
          })));
        }
        if (body.acao === 'reagendar') {
          if (perderReagendamento) return route.abort('failed');
          return route.fulfill(envelope(real({ jobs })));
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
    ok(await page.locator('.cal-operacao').evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('.cal-unico-filtros')) & Node.DOCUMENT_POSITION_PRECEDING)), `${width}px: acompanhamento vem depois da grade`);
    ok(page.url().includes('visao=lista'), `${width}px: rota antiga redireciona para lista do calendário`);
    const cardEditorial = page.locator('.pub-real-job.estado-suspenso-para-revisao');
    ok(await cardEditorial.locator('.pub-real-estado').innerText() === 'Suspenso para revisão', `${width}px: A2 mostra suspensão editorial em vez de agendado`);
    ok(await cardEditorial.locator('[role="alert"]').innerText().then((t) => /aceite anterior foi suspenso/.test(t) && /Revise e aprove/.test(t)), `${width}px: A2 tem causa e próximo passo visíveis`);
    ok(await cardEditorial.getByRole('button', { name: /Reagendar/ }).count() === 0, `${width}px: A2 não oferece reagendar apesar do metadado contraditório`);
    ok(await page.locator('.cal-operacao-secao', { hasText: 'Precisam de atenção' }).innerText().then((t) => t.includes('Suspenso para revisão')), `${width}px: A2 aparece no resumo de atenção abaixo da grade`);
    await page.screenshot({ path: path.join(OUT, `calendario-lista-${width}.png`), fullPage: true });
    const privado = page.locator('.pub-real-job').filter({ hasText: 'Preparo interrompido antes da publicação' }).first();
    ok(await privado.getByRole('button', { name: 'Reagendar Instagram', exact: true }).count() === 1, `${width}px: preparo privado oferece reagendamento por rede`);
    ok(await page.locator('.pub-real-job.estado-publicado').getByRole('button', { name: /Reagendar/ }).count() === 0, `${width}px: publicado nunca oferece repetição, mesmo com metadado contraditório`);
    ok(await page.locator('.pub-real-job.estado-precisa-conferir').filter({ hasText: 'Grana. (Página)' }).getByRole('button', { name: /Reagendar/ }).count() === 0, `${width}px: Facebook incerto não oferece reagendar`);
    const abrirReagendamento = async () => {
      await privado.getByRole('button', { name: 'Reagendar Instagram', exact: true }).click();
      await page.locator('dialog[open] input[type="datetime-local"]').fill('2026-12-01T10:30');
      await page.getByRole('button', { name: 'Gerar nova prévia', exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).waitFor();
    };
    await abrirReagendamento();
    ok(posts.filter((p) => p.acao === 'reagendar').length === 0, `${width}px: gerar prévia não troca o agendamento`);
    const novaPrevia = posts.at(-1);
    ok(novaPrevia.acao === 'prever' && novaPrevia.jobId === reagendavel.jobId && novaPrevia.destinos.length === 1 && novaPrevia.destinos[0].rede === 'instagram' && !novaPrevia.pecaId,
      `${width}px: nova prévia vinculada somente ao Instagram alvo sem recapturar peça`);
    await page.screenshot({ path: path.join(OUT, `reagendamento-previa-${width}.png`), fullPage: true });
    await page.waitForFunction(() => [...document.querySelectorAll('.pub-real-previa-destino img')].every((img) => img.complete && img.naturalWidth > 0));
    await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(OUT, `reagendamento-confirmacao-${width}.png`) });
    ok(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), `${width}px: prévia de reagendamento sem overflow`);
    await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.cal-unico-painel[open]'));
    const troca = posts.find((p) => p.acao === 'reagendar');
    ok(troca && troca.confirmacao === true && troca.previaHash === 'f'.repeat(64) && troca.revisaoEsperada === 1 && troca.jobId === reagendavel.jobId,
      `${width}px: troca leva prévia/hash/revisão e confirmação explícita`);
    // Resposta perdida: não reenvia; consulta vazia continua bloqueada até recibo disponível.
    perderReagendamento = true;
    await page.goto('http://127.0.0.1:4399/#/marketing/calendario?mes=2026-10&visao=lista');
    await page.reload();
    await privado.getByRole('button', { name: 'Reagendar Instagram', exact: true }).waitFor();
    await abrirReagendamento();
    await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).click();
    await page.locator('.pub-real-consulta-pendente').waitFor();
    ok(await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).isDisabled(), `${width}px: resposta incerta bloqueia nova troca`);
    await page.getByRole('button', { name: 'Consultar resultado pendente', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.publicacoes-recibo-painel')].some((p) => p.textContent.includes('ainda não tem recibo')));
    ok(await page.getByRole('button', { name: 'Confirmar reagendamento', exact: true }).isDisabled(), `${width}px: consulta sem recibo mantém bloqueio`);
    ok(posts.filter((p) => p.acao === 'reagendar').length === 2 && posts.filter((p) => p.acao === 'confirmar').length === 0,
      `${width}px: nenhum reenvio nem confirmação genérica no reagendamento incerto`);
    await page.getByRole('button', { name: 'Consultar resultado pendente', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.cal-unico-painel[open]'));
    perderReagendamento = false;
    jobs.splice(2); // restaura os dados-base da suíte existente
    // na grade (largura >= 900) os cartões são compactos: as ações ficam na janela do dia
    const abrirDia20 = async () => { if (width >= 900) await page.locator('.cal-dia[data-data="2026-10-20"] .cal-num-botao').click(); };
    await page.getByRole('button', { name: 'Calendário', exact: true }).click();
    await page.getByRole('button', { name: 'Calendário', exact: true }).and(page.locator('[aria-pressed="true"]')).waitFor();
    if (width >= 900) {
      await page.locator('button.cal-icone:visible').first().waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.cal-num-botao')].some((el) => el.getBoundingClientRect().width >= 44));
      const alvos = await page.locator('button.cal-icone, .cal-num-botao, .cal-mais').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width).map((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
      ok(alvos.length > 0 && alvos.every(([w,h]) => w >= 43.99 && h >= 43.99), `${width}px: ícones e dias acionáveis têm alvo mínimo de 44px (${JSON.stringify(alvos)})`);
    }
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
      await page.locator('.cal-unico-item:visible, .cal-icone:visible').first().waitFor({ timeout: 15000 });
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
    ok(bloqueados === 4, `${width}px: capacidades e mídia única bloqueiam 4 formatos incompatíveis (achou ${bloqueados})`);
    // Stories (autor, 23/10): cartão ao lado de Feed/Carrossel/Reels, selecionável nas duas redes quando a capacidade está disponível.
    ok(await page.getByLabel('Instagram @grana.app, Stories', { exact: true }).isEnabled(), `${width}px: Stories do Instagram selecionável`);
    ok(await page.getByLabel('Facebook Grana. (Página), Stories', { exact: true }).isEnabled(), `${width}px: Stories do Facebook selecionável`);
    ok(!/ainda não publica Stories no Facebook/.test(await page.locator('.pub-real-compositor').innerText()), `${width}px: recusa antiga de Stories no Facebook sumiu`);

    await page.getByLabel('Instagram @grana.app, Feed').check();
    await page.getByLabel('Facebook Grana. (Página), Feed').check();
    ok(await page.getByLabel('Facebook Grana. (Página), Feed').evaluate((el) => el === document.activeElement), `${width}px: seleção preserva foco do teclado`);
    await page.locator('[name="agendarParaLocal"]').fill('2026-12-01T10:30');
    const resumo = await page.locator('.pub-real-horario-resumo').innerText();
    // 19/10: o autor lê quando o Grana. começa a preparar e quando publica (horário de Brasília), sem ISO/UTC na cara.
    ok(/começa a preparar em .*01\/12.*10:15 e publica em .*01\/12.*10:30/.test(resumo) && !/UTC|Z\b/.test(resumo), `${width}px: horário diz quando prepara e publica (${resumo.slice(0, 90)}...)`);
    ok(await page.getByText('Use o horário de Brasília', { exact: false }).count() >= 1, `${width}px: fuso explicado ao autor`);
    await page.screenshot({ path: path.join(OUT, `real-compositor-${width}.png`), fullPage: true });

    await page.getByRole('button', { name: 'Gerar prévia dos destinos' }).click();
    await page.locator('.pub-real-previa-destino').first().waitFor({ timeout: 15000 });
    ok(await page.locator('.pub-real-previa-destino').count() === 2, `${width}px: uma prévia por destino`);
    // AUD-15/16: o cabeçalho de cada cartão diz a rede do próprio destino, e a prévia inline não tem Fechar sem ação.
    const redesDaPrevia = await page.locator('.pub-real-previa-destino').evaluateAll((cs) => cs.map((c) => [
      c.querySelector('.feed-post-topo small')?.textContent || '', (c.querySelector('.pub-real-previa-horario')?.textContent || '').split(' · ')[0]]));
    ok(new Set(redesDaPrevia.map(([, rede]) => rede)).size === 2 && redesDaPrevia.every(([topo, rede]) => topo.startsWith(`Prévia estimada do ${rede} ·`)),
      `${width}px: cabeçalho da prévia diz a rede do destino (${JSON.stringify(redesDaPrevia)})`);
    ok(await page.locator('.pub-real-previa-destino .feed-fechar').count() === 0, `${width}px: prévia inline sem botão Fechar sem ação`);
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
    const botaoConfirmar = page.getByRole('button', { name: 'Agendar', exact: true });
    ok(await page.locator('[name="confirmacaoVisual"]').count() === 0, `${width}px: prévia sem checkbox de confirmação repetida`);
    ok(await botaoConfirmar.isEnabled(), `${width}px: prévia válida libera a confirmação final`);
    await page.evaluate(() => { window.qaDateNow = Date.now; Date.now = () => window.qaDateNow() + 11 * 60000; });
    await botaoConfirmar.click();
    ok(posts.filter((b) => b.acao === 'confirmar').length === 0, `${width}px: prévia expirada não autoriza pedido, mesmo antes do próximo tique`);
    await page.evaluate(() => { Date.now = window.qaDateNow; });
    await page.screenshot({ path: path.join(OUT, `real-previa-${width}.png`), fullPage: true });

    // Resposta perdida: conserva a chave e consulta, sem reenviar a confirmação.
    await botaoConfirmar.click();
    await page.locator('.pub-real-consulta-pendente').waitFor({ timeout: 15000 });
    ok(await page.getByRole('button', { name: 'Autorizar agendamento real' }).count() === 0, `${width}px: nenhum segundo modal de autorização`);
    ok(await page.locator('.pub-real-consulta-pendente details').getAttribute('open') === null, `${width}px: chave de consulta fica em detalhes recolhidos`);
    ok(posts.filter((b) => b.acao === 'confirmar').length === 1, `${width}px: timeout não dispara reenvio automático`);
    ok(await botaoConfirmar.isDisabled(), `${width}px: confirmação fica bloqueada enquanto consulta está pendente`);
    await botaoConfirmar.evaluate(el => el.click());
    await page.getByRole('button', { name: 'Consultar resultado pendente', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.avisos .aviso')].some((a) => /Resultado conferido pela chave idempotente/.test(a.textContent)), null, { timeout: 15000 });
    ok(await page.locator('.pub-real-compositor:visible').count() === 0, `${width}px: consulta positiva encerra compositor`);
    const conf = posts.filter((b) => b.acao === 'confirmar');
    ok(conf.length === 1 && /^[0-9a-f-]{36}$/.test(conf[0].idempotencia),
      `${width}px: resposta perdida gera uma confirmação e recuperação por consulta`);
    ok(conf.every((b) => b.confirmacao === true && b.revisaoEsperada === 4 && b.previaHash === 'f'.repeat(64)), `${width}px: confirmar leva hash, revisão e confirmação`);
    ok(!JSON.stringify(posts).match(/token|segredo|https?:\/\/[^"]*supabase/i), `${width}px: nenhum segredo/URL privada nos pedidos`);

    await page.screenshot({ path: path.join(OUT, `real-fila-${width}.png`), fullPage: true });
    ok(await semOverflow(), `${width}px: sem overflow depois de confirmar`);
    falhaEditorial = true;
    await page.goto('http://127.0.0.1:4399/#/marketing/feed');
    await page.getByRole('heading', { name: '@granaponto', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Atualizar próximas peças' }).waitFor();
    ok(await page.locator('[aria-label="Publicações do perfil"] > li').count() === 1, `${width}px: falha editorial preserva publicação comprovada`);
    falhaEditorial = false; falhaPerfil = true;
    await page.reload();
    await page.getByRole('heading', { name: 'Próximas, ainda não publicadas' }).waitFor();
    await page.locator('.feed-proximas-grade .feed-celula').first().waitFor();
    ok(await page.locator('.feed-real [role="alert"]').count() === 1, `${width}px: falha no perfil não impede próximas peças e deixa aviso`);
    await page.close();
  }
  await browser.close();
  if (falhas) { console.error(`admin-publicacoes-reais-dom: ${falhas} falha(s)`); process.exit(1); }
  console.log(`admin-publicacoes-reais-dom: tudo certo; prints em ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
