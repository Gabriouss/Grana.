'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..'), raizMod = path.join(repo, 'tools/admin-local/marketing');
const mods = new Map(), chamadas = [];
let pedidos = [];
function load(nome) {
  if (mods.has(nome)) return mods.get(nome).exports;
  const m = { exports: {} }; mods.set(nome, m);
  if (nome === 'ajustes-fila.cjs') {
    const negar = () => { throw new Error('EFEITO EXTERNO PROIBIDO'); };
    const imports = { fs: new Proxy({}, { get: () => negar }), path,
      os: { homedir: () => '/fixture' }, crypto: { randomUUID: negar }, child_process: { execFile: negar },
      '../config.cjs': {}, './ajustes-remoto.cjs': { remotoDoEnv: () => ({ remoto: null }) } };
    vm.runInNewContext(fs.readFileSync(path.join(raizMod, nome), 'utf8'), {
      module: m, exports: m.exports, process: { pid: 123, env: Object.freeze({}) }, Date, structuredClone,
      console, setInterval: negar, fetch: negar,
      require: (id) => { assert(Object.hasOwn(imports, id), 'IMPORT PROIBIDO ' + id); return imports[id]; },
    }, { filename: nome });
    return m.exports;
  }
  vm.runInNewContext(fs.readFileSync(path.join(raizMod, nome), 'utf8'), {
    module: m, exports: m.exports, Buffer, Date, Intl, console, structuredClone,
    process: { pid: process.pid, env: new Proxy({}, { get() { throw new Error('ENV PROIBIDO'); } }) },
    fetch() { chamadas.push('Meta'); throw new Error('REDE PROIBIDA'); },
    require: (id) => {
      if (id === './ajustes-fila.cjs') return { ...load('ajustes-fila.cjs'), fila: { listar: () => pedidos } };
      if (id.startsWith('./')) return load(id.slice(2));
      if (['fs', 'path', 'crypto', 'node:fs', 'node:path', 'node:crypto', 'node:os'].includes(id)) return require(id);
      throw new Error('IMPORT PROIBIDO ' + id);
    },
  }, { filename: nome });
  return m.exports;
}
const c = load('catalogo.cjs'), cr = load('cronograma.cjs'), ap = load('aprovacoes.cjs');
const cal = load('calendario.cjs'), promo = load('promocao.cjs'), en = load('meta-ensaio.cjs');
let grupos = 0;
async function fixture(fn, padaria = false, nomes = ['E01.jpg']) {
  const base = path.resolve(os.tmpdir()), dir = fs.mkdtempSync(path.join(base, 'grana-cronograma-'));
  const semana = padaria ? 'docs/marketing/2026-09/semana-39-2026-09-21-a-2026-09-27' : 'docs/marketing/2026-10/semana-41-2026-10-05-a-2026-10-11';
  const rel = padaria ? semana + '/para-aprovacao/pecas/reels/grana-reels-v8-pop.mp4' : semana + '/para-aprovacao/pecas/' + nomes[0];
  const media = path.dirname(path.join(dir, rel)); fs.mkdirSync(media, { recursive: true });
  // O fixture recria o v8-pop em para-aprovacao (onde o aceite real de 07/10 foi dado);
  // os bytes saem de historico, para onde ele foi em 14/10 (revisão superada, regra 25).
  if (padaria) fs.copyFileSync(path.join(repo, rel.replace('/para-aprovacao/', '/historico/')), path.join(dir, rel));
  else for (const nome of nomes) fs.writeFileSync(path.join(media, nome), 'fixture ' + nome);
  const painel = path.join(dir, 'docs/marketing/painel'); fs.mkdirSync(painel, { recursive: true });
  if (padaria) {
    const real = JSON.parse(fs.readFileSync(path.join(repo, 'docs/marketing/painel/aprovacoes.json'), 'utf8'));
    const aceite = real.aprovacoes.find((a) => a.id === '44f4151757801600' && a.versao === 'bc01c04e92badb8c64de75c15d46eb13e7a920cb');
    assert(aceite); assert.equal(aceite.aprovadoEm, '2026-10-07T10:31:32-03:00');
    const { id, versao, caminho, aprovadoEm, evidencia, escopo } = aceite;
    fs.writeFileSync(path.join(painel, 'aprovacoes.json'), JSON.stringify({ formato: 1, aprovacoes: [{ id, versao, caminho, aprovadoEm, evidencia, escopo }] }));
  }
  const indice = path.join(dir, semana, 'INDICE.md');
  const link = nomes.length > 1 ? 'para-aprovacao/pecas/' : rel.slice(semana.length + 1);
  fs.writeFileSync(indice, '# Semana\n\n| Peça | Cronograma ID |\n| --- | --- |\n| [Peça](' + link + ') | |\n');
  const p = c.montarCatalogo(dir).find((p) => p.tipo !== 'texto'); assert(p);
  const manifesto = { formato: 1, manifestoId: 'campanha-teste', versao: 1, fuso: 'America/Sao_Paulo', diaD: null,
    datasComAviso: [{ data: '2026-10-12', motivo: 'Feriado nacional: Nossa Senhora Aparecida' }],
    itens: [{ id: padaria ? 'reels-widget-padaria' : 'peca-teste', codigo: padaria ? 'R-P' : 'E01',
      dataPrevista: padaria ? { modo: 'diaD', diasUteis: 4 } : { modo: 'diaD', diasUteis: 4, hora: '19:00', canal: 'instagram-feed' } }], removidos: [] };
  const h = { dir, rel, p, indice, painel, manifesto,
    iniciar: async () => { await cr.salvarManifesto(dir, { manifesto, versaoEsperada: 0 }); await cr.registrarVinculo(dir, p.id, { versao: p.versao, versaoEsperada: 1, manifestoId: manifesto.manifestoId, itemId: manifesto.itens[0].id }); },
    aprovar: () => ap.aprovar(dir, p.id, { versao: p.versao, confirmacao: true }),
    promover: () => promo.promover(dir, p.id, { versao: p.versao, confirmacao: true }),
    declararD: async (diaD = '2026-10-09') => { const m = cr.ler(dir); return cr.salvarManifesto(dir, { manifesto: { ...m, versao: m.versao + 1, diaD }, versaoEsperada: m.versao, confirmacao: true }); },
    raw: () => JSON.parse(fs.readFileSync(path.join(painel, 'calendario.json'), 'utf8')),
  };
  try { await fn(h); } finally { assert.equal(path.dirname(path.resolve(dir)), base); assert(path.basename(dir).startsWith('grana-cronograma-')); fs.rmSync(dir, { recursive: true, force: true }); }
}
const filtro = process.argv.find((a) => a.startsWith('--filtro='))?.slice('--filtro='.length);
async function test(nome, fn, padaria, nomes) {
  if (filtro && !nome.includes(filtro)) return;
  if (padaria && process.argv.includes('--sintetico')) { console.log('SKIP fixture real: ' + nome); return; }
  await fixture(fn, padaria, nomes); grupos++; console.log('OK ' + nome);
}
(async () => {
  await test('F3 aprovar -> promover -> vincular -> planejada com indice, Meta em ensaio', async (h) => {
    fs.writeFileSync(h.indice, '# Semana\n');
    await h.aprovar(); const promocao = await h.promover();
    const p = c.obterPeca(h.dir, promocao.promocao.id); assert.equal(p.estado, 'aprovados');
    await cr.salvarManifesto(h.dir, { manifesto: h.manifesto, versaoEsperada: 0 }); await h.declararD();
    const m = cr.ler(h.dir);
    await cr.registrarVinculo(h.dir, p.id, { versao: p.versao, versaoEsperada: m.versao, manifestoId: m.manifestoId, itemId: 'peca-teste' });
    const dto = cal.obterCalendario(h.dir, '2026-10'); assert.equal(dto.itens.length, 1);
    assert.equal(dto.itens[0].peca.id, p.id); assert.equal(dto.itens[0].estadoCronograma, 'planejado');
    assert(fs.readFileSync(h.indice, 'utf8').includes('](aprovados/pecas/E01.jpg)'));
    assert(fs.readFileSync(h.indice, 'utf8').includes('campanha-teste#peca-teste@2'));
    assert.equal(en.ensaiar(h.dir).realHabilitado, false); assert.equal(en.ensaiar(h.dir).chamadasMeta, 0);
  });
  await test('ITEM-C bootstrap CRLF, duas peças, retry sem escrita/sincronização e CAS', async (h) => {
    const antes = '# Semana\r\n\r\n| Legado | Prova |\r\n| --- | --- |\r\n| texto | preservado |\r\n';
    fs.writeFileSync(h.indice, antes);
    fs.writeFileSync(path.join(path.dirname(path.join(h.dir, h.rel)), 'E02.jpg'), 'segunda');
    await cr.salvarManifesto(h.dir, { manifesto: { ...h.manifesto, itens: [...h.manifesto.itens, { id: 'segunda', dataPrevista: { modo: 'diaD', diasUteis: 0 } }] }, versaoEsperada: 0 });
    const pedido = { versao: h.p.versao, versaoEsperada: 1, manifestoId: h.manifesto.manifestoId, itemId: 'peca-teste' };
    await cr.registrarVinculo(h.dir, h.p.id, pedido);
    const texto = fs.readFileSync(h.indice, 'utf8');
    assert(texto.startsWith(antes)); assert(!/(?<!\r)\n/.test(texto));
    assert.equal(texto.split('grana-cronograma-vinculos:v1:inicio').length, 2);
    const calendario = fs.readFileSync(path.join(h.painel, 'calendario.json'));
    const sincronizar = cr.sincronizar, write = fs.writeFileSync;
    let sincronizacoes = 0, escritasIndice = 0;
    cr.sincronizar = () => { sincronizacoes++; throw new Error('RETRY NÃO PODE SINCRONIZAR'); };
    fs.writeFileSync = (p, ...args) => { if (typeof p === 'string' && p.startsWith(h.indice)) escritasIndice++; return write(p, ...args); };
    try { await cr.registrarVinculo(h.dir, h.p.id, pedido); }
    finally { cr.sincronizar = sincronizar; fs.writeFileSync = write; }
    assert.equal(sincronizacoes, 0); assert.equal(escritasIndice, 0);
    assert.equal(fs.readFileSync(h.indice, 'utf8'), texto);
    assert(fs.readFileSync(path.join(h.painel, 'calendario.json')).equals(calendario));
    const segunda = c.montarCatalogo(h.dir).find((p) => p.caminho.endsWith('E02.jpg'));
    await cr.registrarVinculo(h.dir, segunda.id, { ...pedido, versao: segunda.versao, itemId: 'segunda' });
    assert.equal(fs.readFileSync(h.indice, 'utf8').split('grana-cronograma-vinculos:v1:inicio').length, 2);
    assert.equal(cr.vinculo(h.dir, segunda).itemId, 'segunda');
    const snapshot = fs.readFileSync(h.indice);
    await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, { ...pedido, versaoEsperada: 0 }), (e) => e.codigo === 'cronograma-conflito');
    assert(fs.readFileSync(h.indice).equals(snapshot));
  });
  await test('ITEM-C índice ausente, links encoded e célula legada sem reformatar', async (h) => {
    fs.unlinkSync(h.indice);
    await h.iniciar(); assert.equal(cr.vinculo(h.dir, h.p).itemId, 'peca-teste');
    const nome = 'Café (novo).jpg', rel = h.rel.replace('E01.jpg', nome);
    fs.writeFileSync(path.join(h.dir, rel), 'encoded');
    const p = c.montarCatalogo(h.dir).find((p) => p.caminho === rel);
    const m = cr.ler(h.dir); await cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2, itens: [...m.itens, { id: 'encoded', dataPrevista: { modo: 'diaD', diasUteis: 0 } }] }, versaoEsperada: 1 });
    const original = '# Legado\r\n| Peça | Extra | Cronograma ID |\r\n| --- | --- | --- |\r\n| [x](para-aprovacao/pecas/Caf%C3%A9%20%28novo%29.jpg) |  INTATO  |   |\r\n';
    fs.writeFileSync(h.indice, original);
    await cr.registrarVinculo(h.dir, p.id, { versao: p.versao, versaoEsperada: 2, manifestoId: m.manifestoId, itemId: 'encoded' });
    assert.equal(fs.readFileSync(h.indice, 'utf8'), original.replace('|   |\r\n', '|   campanha-teste#encoded@2|\r\n'));
    assert.equal(cr.vinculo(h.dir, p).itemId, 'encoded');
    fs.writeFileSync(h.indice, '# Novo\n');
    await cr.registrarVinculo(h.dir, p.id, { versao: p.versao, versaoEsperada: 2, manifestoId: m.manifestoId, itemId: 'encoded' });
    assert(fs.readFileSync(h.indice, 'utf8').includes('Caf%C3%A9%20%28novo%29.jpg'));
    assert.equal(cr.vinculo(h.dir, p).itemId, 'encoded');
    await ap.aprovar(h.dir, p.id, { versao: p.versao, confirmacao: true });
    await promo.promover(h.dir, p.id, { versao: p.versao, confirmacao: true });
    const destino = c.montarCatalogo(h.dir).find((v) => v.caminho === rel.replace('/para-aprovacao/', '/aprovados/'));
    assert(destino); assert(!fs.existsSync(path.join(h.dir, rel)));
    const vinculoDestino = cr.vinculo(h.dir, destino);
    assert(vinculoDestino, 'promoção perdeu o vínculo encoded');
    assert.equal(vinculoDestino.itemId, 'encoded');
    assert.equal(fs.readFileSync(h.indice, 'utf8').split('campanha-teste#encoded@2').length, 2);
  });
  await test('ITEM-C carrossel com pasta encoded mantém token e links legados na promoção', async (h) => {
    const pasta = path.join(path.dirname(path.join(h.dir, h.rel)), 'Café novo');
    fs.mkdirSync(pasta);
    for (const n of ['E02-01.jpg', 'E02-02.jpg']) fs.writeFileSync(path.join(pasta, n), n);
    const p = c.montarCatalogo(h.dir).find((p) => p.tipo === 'carrossel'); assert(p);
    fs.writeFileSync(h.indice, '# Índice\r\n- [Legado](para-aprovacao/pecas/Café novo/)\r\n- [Sem barra](para-aprovacao/pecas/Café novo)\r\n');
    await cr.salvarManifesto(h.dir, { manifesto: h.manifesto, versaoEsperada: 0 });
    await cr.registrarVinculo(h.dir, p.id, { versao: p.versao, versaoEsperada: 1, manifestoId: h.manifesto.manifestoId, itemId: 'peca-teste' });
    await ap.aprovar(h.dir, p.id, { versao: p.versao, confirmacao: true });
    await promo.promover(h.dir, p.id, { versao: p.versao, confirmacao: true });
    const destino = c.montarCatalogo(h.dir).find((p) => p.tipo === 'carrossel' && p.estado === 'aprovados'); assert(destino);
    assert.equal(cr.vinculo(h.dir, destino).itemId, 'peca-teste');
    const texto = fs.readFileSync(h.indice, 'utf8');
    assert(texto.includes('](aprovados/pecas/Caf%C3%A9%20novo/)'));
    assert(texto.includes('[Legado](aprovados/pecas/Café novo/)'));
    assert(texto.includes('[Sem barra](aprovados/pecas/Café novo)'));
    assert.equal(texto.split('campanha-teste#peca-teste@1').length, 2);
    assert(!fs.existsSync(path.join(pasta, 'E02-01.jpg')));
    assert(!fs.existsSync(path.join(pasta, 'E02-02.jpg')));
  });
  await test('ITEM-C ambiguidades e token/versão inválidos sem escrita de dados', async (h) => {
    await h.iniciar();
    const header = '| Peça | Cronograma ID |\n| --- | --- |\n';
    const linha = '| [x](para-aprovacao/pecas/E01.jpg) | |\n';
    const inicio = '<!-- grana-cronograma-vinculos:v1:inicio -->\n', fim = '<!-- grana-cronograma-vinculos:v1:fim -->\n';
    const casos = [header + linha + linha, inicio + header + linha, fim + inicio + header + linha,
      inicio + header + linha + fim + inicio + header + fim, inicio + header + 'prosa\n' + fim,
      '| Peça | Cronograma ID | Cronograma ID |\n| --- | --- | --- |\n',
      header + '| [outra](para-aprovacao/pecas/E02.jpg) | |\n',
      header + '| [x](para-aprovacao/pecas/%2e%2e/E01.jpg) | |\n',
      header + '| [x](para-aprovacao%2fpecas/E01.jpg) | |\n',
      inicio + '\n' + header + '\n' + linha + '\nprosa\n' + fim,
      '| Peça | Cronograma ID |\n\n' + linha];
    const pedido = { versao: h.p.versao, versaoEsperada: 1, manifestoId: h.manifesto.manifestoId, itemId: 'peca-teste' };
    for (const texto of casos) {
      fs.writeFileSync(h.indice, texto);
      const arquivos = [h.indice, path.join(h.painel, 'cronograma.json'), path.join(h.painel, 'calendario.json'), path.join(h.dir, h.rel)];
      const antes = arquivos.map((p) => fs.readFileSync(p));
      await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, pedido), (e) => e.codigo === 'linha-cronograma-ausente');
      arquivos.forEach((p, i) => assert(fs.readFileSync(p).equals(antes[i])));
    }
    fs.writeFileSync(h.indice, header + linha.replace('| |', '| outro#item@1 |'));
    const antes = fs.readFileSync(h.indice);
    await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, pedido), (e) => e.codigo === 'vinculo-existente');
    await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, { ...pedido, versao: 'errada' }), (e) => e.codigo === 'vinculo-invalido');
    assert(fs.readFileSync(h.indice).equals(antes));
  });
  await test('ITEM-C exemplos fenced ignorados, headers independentes e corrida criação exclusiva', async (h) => {
    await cr.salvarManifesto(h.dir, { manifesto: h.manifesto, versaoEsperada: 0 });
    const exemplo = '```md\n<!-- grana-cronograma-vinculos:v1:inicio -->\n| Peça | Cronograma ID |\n| --- | --- |\n<!-- grana-cronograma-vinculos:v1:fim -->\n```\n';
    fs.writeFileSync(h.indice, exemplo);
    const pedido = { versao: h.p.versao, versaoEsperada: 1, manifestoId: h.manifesto.manifestoId, itemId: 'peca-teste' };
    await cr.registrarVinculo(h.dir, h.p.id, pedido);
    assert(fs.readFileSync(h.indice, 'utf8').startsWith(exemplo));
    fs.appendFileSync(h.indice, '\n| Outra | Cronograma ID |\n| --- | --- |\n| [outro](para-aprovacao/pecas/outro.jpg) | |\n');
    await cr.registrarVinculo(h.dir, h.p.id, pedido);
    fs.unlinkSync(h.indice);
    const link = fs.linkSync;
    fs.linkSync = (de, para) => { if (para === h.indice) fs.writeFileSync(para, 'CONCORRENTE'); return link(de, para); };
    try { await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, pedido), (e) => e.code === 'EEXIST'); }
    finally { fs.linkSync = link; }
    assert.equal(fs.readFileSync(h.indice, 'utf8'), 'CONCORRENTE');
    assert(!fs.readdirSync(path.dirname(h.indice)).some((n) => n.endsWith('.tmp')));
  });
  await test('ITEM-C dois processos reais: timeout, quatro writers e release não remove dono alheio', async (h) => {
    const { fork } = require('node:child_process');
    const worker = `const fs=require('fs'); const c=require(process.argv[2]);
      c.serializar(process.argv[1], async()=>{fs.writeFileSync(process.argv[1]+'/efeito.txt','dono');process.send({tipo:'dentro'});await new Promise(r=>process.once('message',r));})
      .then(()=>process.send({tipo:'fim'})).catch(e=>process.send({tipo:'erro',codigo:e.codigo}));`;
    const iniciar = () => {
      const child = fork('-e', [worker, h.dir, path.join(raizMod, 'catalogo.cjs')], { silent: true });
      const mensagens = [], esperas = [];
      child.on('message', (m) => { const resolve = esperas.shift(); if (resolve) resolve(m); else mensagens.push(m); });
      return { child, next: () => mensagens.length ? Promise.resolve(mensagens.shift()) : new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('worker excedeu prazo')); }, 10000);
        esperas.push((m) => { clearTimeout(timer); resolve(m); });
      }) };
    };
    const dono = iniciar();
    try {
      assert.equal((await dono.next()).tipo, 'dentro');
      const arquivo = path.join(h.dir, '.grana-admin-writer.lock'), bytes = fs.readFileSync(arquivo);
      const segundo = iniciar();
      try { assert.equal((await segundo.next()).codigo, 'marketing-trava-ocupada'); }
      finally { segundo.child.kill(); }
      assert(fs.readFileSync(arquivo).equals(bytes));
      // Módulos reais no VM também recusam antes de validar/produzir efeitos de negócio.
      const AtomicsOriginal = Atomics.wait;
      Atomics.wait = () => 'timed-out';
      try {
        for (const fn of [() => cr.registrarVinculo(h.dir, h.p.id), () => cr.salvarManifesto(h.dir),
          () => ap.aprovar(h.dir, h.p.id), () => promo.promover(h.dir, h.p.id),
          () => load('historico.cjs').recusar(h.dir, h.p.id), () => cal.planejar(h.dir), () => load('trafego.cjs').salvarCampanha(h.dir)]) {
          await assert.rejects(fn(), (e) => e.codigo === 'marketing-trava-ocupada');
          assert(fs.readFileSync(arquivo).equals(bytes));
        }
      } finally { Atomics.wait = AtomicsOriginal; }
      const alheio = JSON.stringify({ token: 'outro', host: os.hostname(), pid: process.pid });
      fs.writeFileSync(arquivo, alheio); dono.child.send('liberar');
      assert.equal((await dono.next()).codigo, 'marketing-trava-perdida');
      assert.equal(fs.readFileSync(arquivo, 'utf8'), alheio);
      fs.unlinkSync(arquivo); // Somente residual fictício criado por este teste.
      await c.serializar(h.dir, () => {}); assert(!fs.existsSync(arquivo));
      await assert.rejects(c.serializar(h.dir, () => { throw new Error('falha controlada'); }), /falha controlada/);
      assert(!fs.existsSync(arquivo));
    } finally { dono.child.kill(); }
  });
  await test('ITEM-C staging alheio EEXIST preservado e falha de escrita própria limpa somente seu tmp', async (h) => {
    await h.iniciar(); fs.writeFileSync(h.indice, '# Índice intacto\r\n');
    const crypto = require('node:crypto'), uuid = crypto.randomUUID;
    const tmp = h.indice + '.fixture-colisao.tmp';
    const pedido = { versao: h.p.versao, versaoEsperada: 1, manifestoId: h.manifesto.manifestoId, itemId: 'peca-teste' };
    const antes = [h.indice, path.join(h.painel, 'cronograma.json'), path.join(h.painel, 'calendario.json')].map((p) => fs.readFileSync(p));
    crypto.randomUUID = () => 'fixture-colisao';
    try {
      fs.writeFileSync(tmp, 'STAGING DE OUTRO DONO');
      await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, pedido), (e) => e.code === 'EEXIST');
      assert.equal(fs.readFileSync(tmp, 'utf8'), 'STAGING DE OUTRO DONO');
      fs.unlinkSync(tmp);
      const open = fs.openSync, write = fs.writeFileSync; let fdProprio;
      fs.openSync = (p, ...args) => { const fd = open(p, ...args); if (p === tmp) fdProprio = fd; return fd; };
      fs.writeFileSync = (p, ...args) => { if (p === fdProprio) throw Object.assign(new Error('falha própria'), { code: 'EIO' }); return write(p, ...args); };
      try { await assert.rejects(cr.registrarVinculo(h.dir, h.p.id, pedido), (e) => e.code === 'EIO'); }
      finally { fs.openSync = open; fs.writeFileSync = write; }
      assert(!fs.existsSync(tmp));
      [h.indice, path.join(h.painel, 'cronograma.json'), path.join(h.painel, 'calendario.json')].forEach((p, i) => assert(fs.readFileSync(p).equals(antes[i])));
    } finally { crypto.randomUUID = uuid; }
  });
  await test('PADARIA aceite real07/10: aguardando D -> D+4 úteis automaticamente, sem fabricar aceite', async (h) => {
    assert.equal(h.p.id, '44f4151757801600'); assert.equal(h.p.versao, 'bc01c04e92badb8c64de75c15d46eb13e7a920cb');
    const aceiteAntes = fs.readFileSync(path.join(h.painel, 'aprovacoes.json'), 'utf8');
    await h.iniciar(); const r = await h.aprovar(); assert.equal(r.jaExistia, true);
    let dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.aguardandoDiaD.length, 1); assert.equal(dto.aguardandoDiaD[0].estado, 'aguardando dia D'); assert.equal(dto.aguardandoDiaD[0].data, null);
    assert.equal(dto.itens.length, 0); assert.equal(fs.readFileSync(path.join(h.painel, 'aprovacoes.json'), 'utf8'), aceiteAntes);
    await h.declararD(); dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.aguardandoDiaD.length, 0); assert.equal(dto.itens.length, 1); assert.equal(dto.itens[0].data, '2026-10-15');
    assert.equal(dto.itens[0].canal, null); assert.equal(dto.itens[0].hora, null); assert.equal(dto.itens[0].origem.itemId, 'reels-widget-padaria');
    assert(dto.avisos.some((s) => s.includes('horário pendente') && s.includes('canal pendente')));
    const reciboAntes = en.ensaiar(h.dir).itens[0].recibo;
    const promoted = await h.promover(); dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.itens.length, 1); assert.equal(dto.itens[0].peca.id, promoted.promocao.id);
    assert.equal(dto.itens[0].data, '2026-10-15'); assert.equal(cr.vinculo(h.dir, c.obterPeca(h.dir, promoted.promocao.id)).itemId, 'reels-widget-padaria');
    assert.equal(h.raw().planejados.filter((r) => r.estado !== 'desatualizado').length, 1);
    const ensaio = en.ensaiar(h.dir); assert.equal(ensaio.itens.length, 1); assert.equal(ensaio.itens[0].recibo, reciboAntes); assert.equal(ensaio.itens[0].evidenciaEm, '2026-10-07T10:31:32-03:00'); assert.equal(ensaio.chamadasMeta, 0);
    assert.equal(ensaio.itens[0].estado, 'bloqueado'); assert(ensaio.itens[0].bloqueios.includes('data-ou-hora-invalida')); assert(ensaio.itens[0].bloqueios.includes('canal-invalido'));
  }, true);
  await test('criar vínculo -> aprovar cria registro automaticamente -> promover -> ensaio', async (h) => {
    await h.iniciar(); assert.equal(h.raw().planejados.length, 0);
    await h.aprovar(); assert.equal(h.raw().planejados.length, 1); assert.equal(h.raw().planejados[0].estado, 'aguardando dia D');
    await h.declararD('2099-01-01'); await h.promover(); const r = en.ensaiar(h.dir); assert.equal(r.itens[0].estado, 'ensaio'); assert.equal(r.realHabilitado, false);
  });
  await test('override manual sobrevive revisão, D e promoção; mostra ambas datas', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-22', hora: '20:00', canal: 'instagram-feed' });
    await h.declararD('2026-10-12'); await h.promover();
    const r = cal.obterCalendario(h.dir, '2026-10').itens[0]; assert.equal(r.data, '2026-10-22'); assert.equal(r.dataPrevista.dataResolvida, '2026-10-16'); assert(r.substituicaoManual);
  });
  await test('D só com confirmação e CAS; fim de semana D+0 e D+4', async (h) => {
    await h.iniciar(); const m = cr.ler(h.dir);
    await assert.rejects(cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2, diaD: '2026-10-03' }, versaoEsperada: 1 }), (e) => e.codigo === 'confirmacao-dia-d');
    await h.declararD('2026-10-03'); assert.equal(cal.somarDiasUteis('2026-10-03', 0), '2026-10-05'); assert.equal(cal.somarDiasUteis('2026-10-03', 4), '2026-10-09');
    await assert.rejects(cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2 }, versaoEsperada: 1 }), (e) => e.codigo === 'cronograma-conflito');
    assert.equal(cr.ler(h.dir).recibos.length, 1);
  });
  await test('conteúdo muda: calendário desatualizado e ensaio recusa', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD(); fs.writeFileSync(path.join(h.dir, h.rel), 'nova versão sem aceite');
    const r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens.length, 0); assert.equal(r.desatualizados.length, 1);
    assert.equal(r.desatualizados[0].estadoCronograma, 'desatualizado'); assert(r.desatualizados[0].proximoPasso.includes('versão atual'));
    assert(en.ensaiar(h.dir).itens[0].bloqueios.includes('versao-ou-caminho-mudou'));
  });
  await test('item removido mantém aviso e proíbe reciclagem', async (h) => {
    await h.iniciar(); await h.aprovar(); const m = cr.ler(h.dir);
    await cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 2, itens: [], removidos: ['peca-teste'] }, versaoEsperada: 1 });
    const r = cal.obterCalendario(h.dir, '2026-10'); assert(r.avisos.some((s) => s.includes('sem data no cronograma'))); assert.equal(r.itens.length, 0);
    assert.throws(() => cr.validar({ ...m, removidos: ['peca-teste'] }), (e) => e.codigo === 'cronograma-invalido');
    await assert.rejects(cr.salvarManifesto(h.dir, { manifesto: { ...m, versao: 3 }, versaoEsperada: 2 }), (e) => e.codigo === 'id-aposentado');
  });
  await test('legado sem vínculo preserva data manual e aviso; nenhum manifesto inventado', async (h) => {
    await h.aprovar(); await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-22', canal: 'stories' });
    await cr.salvarManifesto(h.dir, { manifesto: h.manifesto, versaoEsperada: 0 });
    let r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens[0].data, '2026-10-22'); assert(r.avisos.some((s) => s.includes('vínculo de cronograma pendente')));
    await cr.registrarVinculo(h.dir, h.p.id, { versao: h.p.versao, versaoEsperada: 1, manifestoId: 'campanha-teste', itemId: 'peca-teste' });
    r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens[0].substituicaoManual.data, '2026-10-22');
  });
  await test('carrossel: token de pasta preservado após promoção', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD(); const r = await h.promover();
    assert.equal(cr.vinculo(h.dir, c.obterPeca(h.dir, r.promocao.id)).itemId, 'peca-teste'); assert.equal(cal.obterCalendario(h.dir, '2026-10').itens.length, 1);
  }, false, ['E01-01.jpg', 'E01-02.jpg']);
  await test('validação discrimina modos/data/hora; não fabrica previsões', async (h) => {
    for (const d of [{ modo: 'absoluta', data: '2026-02-31', hora: '19:00', canal: 'reels' }, { modo: 'diaD', diasUteis: 4, data: '2026-10-15', hora: '19:00', canal: 'reels' }, { modo: 'diaD', diasUteis: 4, hora: '9:00', canal: 'reels' }]) assert.throws(() => cr.validar({ ...h.manifesto, itens: [{ id: 'peca-teste', dataPrevista: d }] }));
  });
  await test('token inválido, manifesto ausente e duplicata ativa são avisos visíveis', async (h) => {
    await h.iniciar(); await h.aprovar();
    const original = fs.readFileSync(h.indice, 'utf8');
    fs.writeFileSync(h.indice, original.replace('campanha-teste#peca-teste@1', 'campanha-errada#peca-teste@1'));
    assert(cal.obterCalendario(h.dir, '2026-10').avisos.some((s) => s.includes('vínculo inválido')));
    let dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.suspensos[0].estadoCronograma, 'vínculo inválido'); assert(dto.suspensos[0].proximoPasso.includes('item válido'));
    assert.equal(dto.aprovadosSemData[0].estadoCronograma, 'vínculo inválido');
    fs.writeFileSync(h.indice, original); const segunda = path.join(path.dirname(path.join(h.dir, h.rel)), 'outra.jpg'); fs.writeFileSync(segunda, 'segunda peça');
    const outra = c.montarCatalogo(h.dir).find((p) => p.caminho.endsWith('/outra.jpg'));
    fs.appendFileSync(h.indice, '\n| Peça | Cronograma ID |\n| --- | --- |\n| [Outra](para-aprovacao/pecas/outra.jpg) | campanha-teste#peca-teste@1 |\n');
    assert(cal.obterCalendario(h.dir, '2026-10').avisos.some((s) => s.includes('vínculo duplicado')));
    dto = cal.obterCalendario(h.dir, '2026-10');
    assert.equal(dto.suspensos[0].estadoCronograma, 'vínculo duplicado'); assert(dto.suspensos[0].proximoPasso.includes('outro item'));
    await assert.rejects(cr.registrarVinculo(h.dir, outra.id, { versao: outra.versao, versaoEsperada: 1, manifestoId: 'campanha-teste', itemId: 'peca-teste' }), (e) => e.codigo === 'vinculo-duplicado');
  });
  await test('migração preserva referências legadas e recibo da data manual', async (h) => {
    await h.aprovar(); await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-22', canal: 'stories' });
    const arq = path.join(h.painel, 'calendario.json'), legado = h.raw(); legado.referenciaFunil = [{ codigo: 'R-P', diasUteis: 4 }]; fs.writeFileSync(arq, JSON.stringify(legado));
    await h.iniciar(); assert.equal(h.raw().referenciaFunilLegado[0].codigo, 'R-P'); assert.equal(h.raw().planejados[0].registroLegado.data, '2026-10-22');
  });
  await test('rotas reais: sessão completa/CSRF antes de gravar cronograma; D exige frase', async (h) => {
    const { EventEmitter } = require('node:events'); let etapa = 'totp', csrf = true, escritos = 0;
    const m = { exports: {} }, routesRoot = path.dirname(raizMod);
    vm.runInNewContext(fs.readFileSync(path.join(routesRoot, 'rotas.cjs'), 'utf8'), { module: m, exports: m.exports, __dirname: routesRoot, Buffer, Date, console,
      require: (id) => {
        if (id === 'path') return path;
        if (id === './config.cjs') return { RAIZ_DADOS: h.dir, SIMULAR: false, ocultar: (v) => v };
        if (id === './seguranca.cjs') return { checarApi: () => null, dentroDoLimite: () => true, sessaoDe: () => ({ id: 'fixture', s: { etapa, geracao: 'g' } }), checarCabecalhos: () => csrf ? null : { status: 403, codigo: 'csrf', mensagem: 'CSRF inválido.' } };
        if (id === './autenticacao.cjs') return { situacaoConta: () => ({ estado: 'ok', geracao: 'g' }) };
        if (id === './auditoria.cjs') return { registrar() {} };
        if (id === path.join(raizMod, 'cronograma.cjs')) return { ...cr, salvarManifesto(...a) { escritos++; return cr.salvarManifesto(...a); } };
        throw new Error('IMPORT PROIBIDO ' + id);
      },
    });
    async function post(body) {
      const req = new EventEmitter(); req.method = 'POST'; req.headers = { 'x-grana-admin': '1' }; let status, saida;
      const promise = m.exports.tratarApi(req, { writeHead(s) { status = s; }, end(s) { saida = JSON.parse(s); } }, new URL('http://127.0.0.1:4317/api/marketing/cronograma'));
      req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); await promise; return { status, saida };
    }
    const body = { manifesto: h.manifesto, versaoEsperada: 0 };
    assert.equal((await post(body)).status, 401); assert.equal(escritos, 0);
    etapa = 'ok'; csrf = false; assert.equal((await post(body)).status, 403); assert.equal(escritos, 0);
    csrf = true; assert.equal((await post(body)).status, 200); assert.equal(escritos, 1);
    assert.equal((await post({ manifesto: { ...h.manifesto, versao: 2, diaD: '2026-10-09' }, versaoEsperada: 1 })).status, 409); assert.equal(cr.ler(h.dir).diaD, null);
  });
  await test('índice falha na promoção: origem e vínculo preservados; retomada repara sem duplicar', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    const fn = promo.criarPromocao({ ...fs, readFileSync(abs, ...a) { if (abs === h.indice) throw new Error('DISCO'); return fs.readFileSync(abs, ...a); } }, () => {});
    const r = await fn(h.dir, h.p.id, { versao: h.p.versao, confirmacao: true });
    assert(r.avisos.some((s) => s.includes('índice'))); assert(fs.existsSync(path.join(h.dir, h.rel))); assert.equal(cr.vinculo(h.dir, h.p).itemId, 'peca-teste');
    const again = await h.promover(); assert.equal(again.jaExistia, true); assert(!fs.existsSync(path.join(h.dir, h.rel))); assert.equal(cal.obterCalendario(h.dir, '2026-10').itens.length, 1);
  });
  await test('B1/A1: calendário falha depois de promoção/aceite; resultado confirmado e aviso próprio', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    const save = cr.sincronizar; cr.sincronizar = () => { throw new Error('DETALHE INTERNO'); };
    try {
      const a = await h.aprovar(); assert.equal(a.jaExistia, true); assert(a.avisos.some((s) => s.includes('Aceite preservado; calendário pendente')));
      const r = await h.promover(); assert.equal(r.jaExistia, false); assert(r.avisos.some((s) => s.includes('Promoção registrada; calendário pendente')));
      assert(!fs.existsSync(path.join(h.dir, h.rel))); assert(!JSON.stringify(r).includes('originais foram preservados')); assert(!JSON.stringify(r).includes('DETALHE INTERNO'));
      const novamente = await h.promover(); assert.equal(novamente.jaExistia, true); assert(novamente.avisos.some((s) => s.includes('calendário pendente')));
      assert.equal(JSON.parse(fs.readFileSync(path.join(h.painel, 'aprovacoes.json'), 'utf8')).aprovacoes.length, 2);
    } finally { cr.sincronizar = save; }
  });
  await test('A2: manifesto inválido suspende previsões, preserva operacional e permite planejar com recibo', async (h) => {
    await h.iniciar(); await h.aprovar(); await h.declararD();
    const antes = h.raw(), arq = path.join(h.painel, 'cronograma.json'); fs.writeFileSync(arq, '{quebrado');
    const r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens.length, 0); assert.equal(r.suspensos.length, 1); assert(r.avisos.some((s) => s.includes('previsões suspensas')));
    assert.equal(h.raw().planejados[0].data, antes.planejados[0].data); assert(en.ensaiar(h.dir).itens[0].bloqueios.includes('cronograma-nao-resolvido'));
    const manual = await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-23', canal: 'stories' });
    assert(manual.avisos.some((s) => s.includes('calendário pendente'))); assert.equal(h.raw().planejados[0].substituicaoManual.data, '2026-10-23');
  });
  await test('datasComAviso versionadas: feriado avisa sem bloquear cálculo; valores inválidos recusados', async (h) => {
    await h.iniciar(); await h.aprovar(); const m = cr.ler(h.dir); m.versao = 2; m.diaD = '2026-10-06';
    await cr.salvarManifesto(h.dir, { manifesto: m, versaoEsperada: 1, confirmacao: true });
    const r = cal.obterCalendario(h.dir, '2026-10'); assert.equal(r.itens[0].data, '2026-10-12'); assert(r.avisos.some((s) => s.includes('Feriado nacional')));
    assert.throws(() => cr.validar({ ...m, datasComAviso: [{ data: '2026-02-31', motivo: 'aviso' }] }));
  });
  await test('promocao-terminais: pedido novo bloqueia sem mutacao; aceito permite', async (h) => {
    await h.iniciar(); await h.aprovar(); pedidos = [{ pecaId: h.p.id, versaoAlvo: h.p.versao, estado: 'novo' }];
    try {
      const antes = [h.rel, path.relative(h.dir, h.indice), 'docs/marketing/painel/aprovacoes.json', 'docs/marketing/painel/cronograma.json', 'docs/marketing/painel/calendario.json']
        .map((rel) => [rel, fs.readFileSync(path.join(h.dir, rel), 'utf8')]);
      const filaAntes = JSON.stringify(pedidos), efeitos = [];
      const io = { ...fs };
      for (const metodo of ['copyFileSync', 'unlinkSync', 'mkdirSync', 'writeFileSync', 'renameSync']) io[metodo] = (...args) => { efeitos.push(metodo); return fs[metodo](...args); };
      await assert.rejects(promo.criarPromocao(io)(h.dir, h.p.id, { versao: h.p.versao, confirmacao: true }), (e) => e.codigo === 'ajuste-aberto');
      assert.deepEqual(efeitos, [], 'pedido novo nao copia, apaga nem escreve');
      for (const [rel, conteudo] of antes) assert.equal(fs.readFileSync(path.join(h.dir, rel), 'utf8'), conteudo, rel);
      assert.equal(fs.existsSync(path.join(h.dir, h.rel.replace('/para-aprovacao/', '/aprovados/'))), false);
      assert.equal(JSON.stringify(pedidos), filaAntes, 'fila nao muda no bloqueio');
      pedidos[0].estado = 'aceito'; await h.promover(); assert(!fs.existsSync(path.join(h.dir, h.rel))); assert.equal(pedidos[0].estado, 'aceito');
    } finally { pedidos = []; }
  });
  for (const estado of ['encerrado', 'recusado-pelo-autor']) for (const origem of ['fila', 'legado']) {
    await test(`promocao-terminais: ${estado} em ${origem} permite sem alterar pedido`, async (h) => {
      await h.iniciar(); await h.aprovar();
      const arq = path.join(h.painel, 'aprovacoes.json');
      if (origem === 'fila') pedidos = [{ pecaId: h.p.id, versaoAlvo: h.p.versao, estado }];
      else {
        const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
        dados.ajustes = [{ id: h.p.id, versao: h.p.versao, estado }];
        fs.writeFileSync(arq, JSON.stringify(dados));
      }
      const filaAntes = JSON.stringify(pedidos), ajustesAntes = JSON.stringify(JSON.parse(fs.readFileSync(arq, 'utf8')).ajustes);
      try {
        const r = await h.promover(); assert.equal(r.jaExistia, false);
        assert(!fs.existsSync(path.join(h.dir, h.rel)));
        assert(fs.existsSync(path.join(h.dir, r.promocao.caminho)));
        const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
        assert.equal(dados.aprovacoes.length, 2); assert.equal(dados.aprovacoes[1].origem.id, h.p.id);
        assert.equal(JSON.stringify(dados.ajustes), ajustesAntes); assert.equal(JSON.stringify(pedidos), filaAntes);
        assert(fs.readFileSync(h.indice, 'utf8').includes(`<!-- promocao:${r.promocao.id}:${h.p.versao} -->`));
      } finally { pedidos = []; }
    });
  }
  await test('recibo real de primeira entrada é persistido uma vez; GET e promoção não inventam outro', async (h) => {
    await h.iniciar(); await h.aprovar();
    const arq = path.join(h.painel, 'calendario.json'), antes = fs.readFileSync(arq, 'utf8');
    let r = cal.obterCalendario(h.dir, '2026-10').aguardandoDiaD[0];
    assert.equal(r.recibo.tipo, 'entrada-automatica'); assert(r.recibo.id); assert(Number.isFinite(Date.parse(r.recibo.em))); assert.equal(r.recibos.length, 1);
    assert.equal(r.reciboAceite.tipo, 'aceite-autor'); assert.equal(r.reciboAceite.versaoPeca, r.peca.versao);
    const aceiteOriginal = JSON.stringify(r.reciboAceite);
    assert.ok(!antes.includes('aceite-autor'), 'recibo do aceite nao e gravado no calendario');
    const id = r.recibo.id; cal.obterCalendario(h.dir, '2026-10'); assert.equal(fs.readFileSync(arq, 'utf8'), antes);
    await h.aprovar(); await h.declararD(); await h.promover(); r = cal.obterCalendario(h.dir, '2026-10').itens[0];
    assert.equal(r.recibo.id, id); assert.equal(r.recibos.filter((v) => v.tipo === 'entrada-automatica').length, 1);
    assert.equal(JSON.stringify(r.reciboAceite), aceiteOriginal, 'promocao espelha registro exato sem novo aceite');
    await cal.planejar(h.dir, { id: r.peca.id, versao: r.peca.versao, data: '2026-10-22', hora: '20:00', canal: 'stories' });
    r = cal.obterCalendario(h.dir, '2026-10').itens[0]; assert.equal(r.previsaoResolvida.data, '2026-10-15'); assert.equal(r.data, '2026-10-22'); assert.equal(r.previsaoResolvida.canal, 'instagram-feed'); assert.equal(r.canal, 'stories'); assert.equal(r.recibo.id, id);
  });
  await test('F4 remarcação manual sem vínculo preserva datas e migração/promoção conserva recibos', async (h) => {
    await h.aprovar();
    await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-20', hora: '19:00', canal: 'reels' });
    const arq = path.join(h.painel, 'calendario.json'), primeira = h.raw().planejados[0].recibos[0];
    assert.equal(primeira.data, '2026-10-20');
    await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-21', hora: '20:00', canal: 'stories' });
    let plano = h.raw().planejados[0];
    assert.equal(plano.recibos.length, 2);
    assert.deepEqual(plano.recibos[0], primeira, 'recibo original imutável');
    const manuais = structuredClone(plano.recibos);
    assert.deepEqual(Array.from(c.obterPeca(h.dir, h.p.id).trilha.eventos.filter((e) => e.tipo === 'data'), (e) => e.data), ['2026-10-20', '2026-10-21']);
    const bytes = fs.readFileSync(arq); cal.obterCalendario(h.dir, '2026-10'); c.obterPeca(h.dir, h.p.id);
    assert(fs.readFileSync(arq).equals(bytes), 'GET não grava recibo');
    await h.iniciar(); await h.declararD(); const promovida = await h.promover();
    plano = h.raw().planejados.find((r) => r.id === promovida.promocao.id);
    assert.deepEqual(plano.recibos.slice(0, 2), manuais, 'vínculo e promoção preservam os dois recibos exatos');
    const datas = c.obterPeca(h.dir, promovida.promocao.id).trilha.eventos.filter((e) => e.tipo === 'data');
    assert(datas.some((e) => e.data === '2026-10-20' && e.em === primeira.em));
    assert(datas.some((e) => e.data === '2026-10-21' && e.canal === 'stories'));
    assert.equal(cal.obterCalendario(h.dir, '2026-10').itens[0].data, '2026-10-21');
    assert.equal(en.ensaiar(h.dir).chamadasMeta, 0);
  });
  await test('F4 legado manual sem recibos preserva planejadoEm existente ao remarcar', async (h) => {
    await h.aprovar();
    const arq = path.join(h.painel, 'calendario.json'), em = '2026-10-10T10:00:00-03:00';
    fs.writeFileSync(arq, JSON.stringify({ formato: 1, planejados: [{ id: h.p.id, caminho: h.p.caminho, versao: h.p.versao,
      data: '2026-10-20', hora: '19:00', canal: 'reels', planejadoEm: em }] }));
    await cal.planejar(h.dir, { id: h.p.id, versao: h.p.versao, data: '2026-10-21', canal: 'stories' });
    const eventos = c.obterPeca(h.dir, h.p.id).trilha.eventos.filter((e) => e.tipo === 'data');
    assert.deepEqual(Array.from(eventos, (e) => e.data), ['2026-10-20', '2026-10-21']);
    assert.equal(eventos[0].em, em, 'sem inventar data de evento legado');
    const antes = fs.readFileSync(arq);
    await assert.rejects(cal.planejar(h.dir, { id: h.p.id, versao: 'f'.repeat(40), data: '2026-10-22', canal: 'stories' }), (e) => e.codigo === 'versao-mudou');
    assert(fs.readFileSync(arq).equals(antes), 'recusa não grava recibo');
  });
  assert.deepEqual(chamadas, []); console.log(`admin-cronograma: ${grupos} grupos passaram, módulos reais, zero rede/Meta`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
