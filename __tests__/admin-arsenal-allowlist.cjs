'use strict';
// Módulos reais em VM; config/auditoria dublados, sem .env, rede ou escrita nos originais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Writable } = require('node:stream');

const repo = path.resolve(__dirname, '..');
const fontes = {
  seguranca: fs.readFileSync(path.join(repo, 'tools/admin-local/seguranca.cjs'), 'utf8'),
  adaptador: fs.readFileSync(path.join(repo, 'tools/admin-local/adaptadores/design-system.cjs'), 'utf8'),
  rotas: fs.readFileSync(path.join(repo, 'tools/admin-local/rotas.cjs'), 'utf8'),
  servidor: fs.readFileSync(path.join(repo, 'tools/admin-local/server.cjs'), 'utf8'),
};
const icones = 'docs/marketing/arsenal/icones';
const prancha = 'docs/mascote/granabo-prancha-w3.png';
const blender = 'docs/mascote/blender/granabo.blend';
const temporaria = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-admin-arsenal-'));
const temporariaReal = fs.realpathSync(temporaria);
let grupos = 0;

function carregar(raizDados) {
  const config = { RAIZ: repo, RAIZ_DADOS: raizDados, PORTA: 4317, SIMULAR: false, ocultar: (v) => String(v) };
  function modulo(fonte, diretorio, dependencias) {
    const m = { exports: {} };
    vm.runInNewContext(fonte, {
      module: m, exports: m.exports, __dirname: diretorio,
      process: { env: {} }, Buffer, Date, console,
      require(id) {
        if (Object.hasOwn(dependencias, id)) return dependencias[id];
        if (['fs', 'os', 'path', 'crypto'].includes(id)) return require(id);
        throw new Error('Import não dublado: ' + id);
      },
    }, { filename: path.join(diretorio, 'modulo-real.cjs') });
    return m.exports;
  }
  const seguranca = modulo(fontes.seguranca, path.join(repo, 'tools/admin-local'), {
    './config.cjs': config, './auditoria.cjs': { registrar() {} },
  });
  const adaptador = modulo(fontes.adaptador, path.join(repo, 'tools/admin-local/adaptadores'), {
    '../config.cjs': config, '../seguranca.cjs': seguranca,
  });
  return { seguranca, adaptador };
}

function servidorReal(raizDados, seguranca, adaptador) {
  const config = { RAIZ: repo, RAIZ_DADOS: raizDados, PORTA: 4317, SIMULAR: false, ocultar: (v) => String(v) };
  const conta = { estado: 'ok', geracao: 'geracao-fixture' };
  const auth = { situacaoConta: () => conta, protegerPasta: () => true };
  const auditoria = { registrar() {}, definirFiltro() {} };
  const rotas = { exports: {} };
  vm.runInNewContext(fontes.rotas, {
    module: rotas, exports: rotas.exports, __dirname: path.join(repo, 'tools/admin-local'),
    Date, Buffer, URL, console,
    require(id) {
      if (id === './config.cjs') return config;
      if (id === './seguranca.cjs') return seguranca;
      if (id === './autenticacao.cjs') return auth;
      if (id === './auditoria.cjs') return auditoria;
      if (id === './adaptadores/design-system.cjs') return adaptador;
      if (id === 'path') return path;
      throw new Error('Import de rota não dublado: ' + id);
    },
  }, { filename: 'rotas-reais.cjs' });
  let handler, leituras = 0;
  const http = {
    createServer(fn) {
      handler = fn;
      return { on() {}, listen() {} }; // Sem socket, callback de boot ou vigia real.
    },
  };
  const fsServidor = { ...fs,
    createReadStream(arquivo, opcoes) {
      const rel = path.relative(fs.realpathSync(raizDados), fs.realpathSync(arquivo));
      assert.ok(rel && !rel.startsWith('..') && !path.isAbsolute(rel), 'stream só da fixture');
      leituras++;
      return fs.createReadStream(arquivo, opcoes);
    },
    appendFileSync() { throw new Error('Servidor de teste não escreve log'); },
    writeFileSync() { throw new Error('Servidor de teste não escreve disco'); },
  };
  vm.runInNewContext(fontes.servidor, {
    process: { env: {}, pid: 1, on() {}, exit() { throw new Error('Saída inesperada'); } },
    console: { log() {}, error() {} }, Date, Buffer, URL,
    setInterval() { throw new Error('Servidor de teste não inicia timers'); },
    require(id) {
      if (id === 'http') return http;
      if (id === 'fs') return fsServidor;
      if (id === 'path') return path;
      if (id === './config.cjs') return config;
      if (id === './seguranca.cjs') return seguranca;
      if (id === './autenticacao.cjs') return auth;
      if (id === './auditoria.cjs') return auditoria;
      if (id === './rotas.cjs') return rotas.exports;
      throw new Error('Import de servidor não dublado: ' + id);
    },
  }, { filename: 'servidor-real.cjs' });
  assert.equal(typeof handler, 'function');
  return {
    conta,
    leituras: () => leituras,
    cookie(etapa) {
      const agora = Date.now();
      return 'grana_admin=' + seguranca.criarSessao({
        etapa, geracao: 'geracao-fixture', loginEm: agora, atividadeEm: agora, senhaEm: agora, totpEm: agora,
      });
    },
    async pedir(method, url, headers = {}) {
      const cabecalhos = {}, partes = [];
      const res = new Writable({ write(chunk, _encoding, done) { partes.push(Buffer.from(chunk)); done(); } });
      res.setHeader = (nome, valor) => { cabecalhos[nome.toLowerCase()] = valor; };
      res.writeHead = (status, extras = {}) => {
        res.statusCode = status;
        Object.entries(extras).forEach(([n, v]) => res.setHeader(n, v));
      };
      const fim = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Resposta de fixture não terminou')), 3000);
        res.on('finish', () => { clearTimeout(timer); resolve(); });
        res.on('error', (e) => { clearTimeout(timer); reject(e); });
      });
      handler({ method, url, headers: { host: '127.0.0.1:4317', ...headers },
        rawHeaders: ['Host', '127.0.0.1:4317'], socket: { remoteAddress: '127.0.0.1', destroy() { throw new Error('Socket destruído'); } },
      }, res);
      await fim;
      return { status: res.statusCode, headers: cabecalhos, body: Buffer.concat(partes).toString('utf8') };
    },
  };
}

const normalizar = (v) => JSON.parse(JSON.stringify(v));
function grupo(nome, fn) {
  fn(); grupos++; console.log('OK ' + nome);
}
async function grupoAsync(nome, fn) {
  await fn(); grupos++; console.log('OK ' + nome);
}
function raiz(nome) {
  const dir = path.join(temporaria, nome);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function gravar(dir, relativo) {
  const arquivo = path.join(dir, ...relativo.split('/'));
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, 'fixture pública de arquivo');
  return arquivo;
}
function conferirAsset(seguranca, asset) {
  const url = '/' + asset.caminho.split('/').map(encodeURIComponent).join('/');
  assert.equal(asset.url, url);
  assert.equal(asset.nome, path.posix.basename(asset.caminho));
  assert.equal(asset.publico, false, asset.caminho);
  assert.equal(asset.mime, asset.caminho === blender ? 'application/octet-stream' : 'image/png');
  assert.equal(asset.extras['X-Content-Type-Options'], 'nosniff');
  assert.equal(fs.lstatSync(asset.arquivo).isFile(), true);
  const resolvido = seguranca.resolverEstatico(url);
  assert.ok(resolvido, url);
  assert.deepEqual(normalizar(resolvido), normalizar(asset));
  if (asset.caminho === blender) {
    assert.equal(resolvido.extras['Content-Disposition'], 'attachment; filename="granabo.blend"');
  }
}
function conferirAdaptador(adaptador, esperado) {
  const dados = normalizar(adaptador.originais());
  const assets = [...dados.icones, dados.prancha, dados.blender].filter(Boolean);
  assert.deepEqual(assets.map((a) => a.caminho).sort(), [...esperado].sort());
  for (const a of assets) {
    assert.deepEqual(Object.keys(a).sort(), ['caminho', 'mime', 'nome', 'somenteLeitura', 'url']);
    assert.equal(a.somenteLeitura, true);
    assert.equal(a.url, '/' + a.caminho.split('/').map(encodeURIComponent).join('/'));
    assert.equal(a.mime, a.caminho === blender ? 'application/octet-stream' : 'image/png');
    assert.equal(a.arquivo, undefined, 'adaptador não expõe caminho físico');
  }
}

(async () => { try {
  const normal = carregar(repo);
  grupo('root normal lista 145 PNGs diretos e os dois caminhos exatos do mascote', () => {
    const assets = normal.seguranca.listarAssetsDesignSystem();
    assert.equal(assets.filter((a) => a.caminho.startsWith(icones + '/')).length, 145);
    assert.equal(assets.length, 147);
    assert.deepEqual(normalizar(assets.filter((a) => a.caminho.startsWith('docs/mascote/')).map((a) => a.caminho)).sort(), [blender, prancha].sort());
    assets.forEach((a) => conferirAsset(normal.seguranca, a));
    conferirAdaptador(normal.adaptador, assets.map((a) => a.caminho));
  });

  const isolada = raiz('isolada');
  const permitidos = [icones + '/a.png', icones + '/ícone claro.png', icones + '/MAIUSCULO.PNG', prancha, blender];
  permitidos.forEach((p) => gravar(isolada, p));
  const recusadosExistentes = [
    icones + '/sub/nested.png', icones + '/.oculto.png', icones + '/extra.svg',
    'docs/marketing/arsenal/outro.png', 'docs/mascote/granabo-prancha-w4.png',
    'docs/mascote/outro.png', 'docs/mascote/blender/outro.blend',
  ];
  recusadosExistentes.forEach((p) => gravar(isolada, p));
  fs.mkdirSync(path.join(isolada, icones, 'diretorio.png'));
  const local = carregar(isolada);

  grupo('RAIZ_DADOS isolada não cai nos 145 originais de RAIZ; adaptador filtra metadados', () => {
    const assets = local.seguranca.listarAssetsDesignSystem();
    assert.equal(assets.length, 5);
    assert.deepEqual(normalizar(assets.map((a) => a.caminho)).sort(), [...permitidos].sort());
    conferirAdaptador(local.adaptador, permitidos);
  });
  grupo('URL codificada, MIME, arquivos regulares e publico:false em cada asset', () => {
    local.seguranca.listarAssetsDesignSystem().forEach((a) => conferirAsset(local.seguranca, a));
    assert.ok(local.seguranca.listarAssetsDesignSystem().some((a) => a.url.includes('%C3%ADcone%20claro.png')));
  });
  grupo('blend tem octet-stream, attachment granabo.blend e nosniff', () => {
    const a = local.seguranca.resolverEstatico('/' + blender);
    assert.ok(a); assert.equal(a.mime, 'application/octet-stream'); assert.equal(a.publico, false);
    assert.equal(a.extras['Content-Disposition'], 'attachment; filename="granabo.blend"');
    assert.equal(a.extras['X-Content-Type-Options'], 'nosniff');
  });
  grupo('arquivos existentes fora da allowlist e PNGs aninhados são recusados', () => {
    for (const p of recusadosExistentes) assert.equal(local.seguranca.resolverEstatico('/' + p), null, p);
    assert.equal(local.seguranca.resolverEstatico('/' + icones + '/diretorio.png'), null);
  });
  grupo('inexistentes e diretórios não são arquivos permitidos', () => {
    for (const p of ['/docs/mascote', '/docs/mascote/', '/docs/mascote/blender/', '/' + icones + '/', '/' + icones + '/inexistente.png', '/docs/mascote/blender/inexistente.blend']) {
      assert.equal(local.seguranca.resolverEstatico(p), null, p);
    }
  });
  grupo('traversal, ocultos, barras, ADS, codificação inválida e segmentos Windows recusados', () => {
    for (const p of [
      '/' + icones + '/../icones/a.png', '/' + icones + '/%2e%2e/icones/a.png',
      '/' + icones + '/.oculto.png', '/' + icones + '/%2eoculto.png',
      '/' + icones + '/sub/../a.png', '/' + icones + '/%5ca.png', '/' + icones + '//a.png',
      '/' + icones + '/a.png:stream', '/' + icones + '/a.png.', '/' + icones + '/a.png%20',
      '/' + icones + '/CON.png', '/' + icones + '/x%00.png', '/' + icones + '/%ZZ.png',
      '/docs/mascote/.hidden/granabo-prancha-w3.png', '/docs/mascote/%2e%2e/mascote/granabo-prancha-w3.png',
      '/docs/mascote/blender/%2e/granabo.blend',
    ]) assert.equal(local.seguranca.resolverEstatico(p), null, p);
  });
  grupo('mascote com nome exato mas diretório é recusado pelo regular-file check', () => {
    const dir = raiz('mascote-diretorios');
    fs.mkdirSync(path.join(dir, prancha), { recursive: true });
    fs.mkdirSync(path.join(dir, blender), { recursive: true });
    const m = carregar(dir);
    assert.equal(m.seguranca.listarAssetsDesignSystem().length, 0);
    assert.equal(m.seguranca.resolverEstatico('/' + prancha), null);
    assert.equal(m.seguranca.resolverEstatico('/' + blender), null);
    conferirAdaptador(m.adaptador, []);
  });
  grupo('root de dados vazio não faz fallback para originais reais', () => {
    const m = carregar(raiz('vazia'));
    assert.equal(m.seguranca.listarAssetsDesignSystem().length, 0);
    assert.equal(m.seguranca.resolverEstatico('/' + prancha), null);
    assert.equal(m.seguranca.resolverEstatico('/' + blender), null);
    conferirAdaptador(m.adaptador, []);
  });

  // Junções reais no Windows (não exigem symlink de arquivo privilegiado).
  // Em outros sistemas, os mesmos casos usam symlink de diretório real.
  const tipoLink = process.platform === 'win32' ? 'junction' : 'dir';
  const fora = raiz('fora-da-raiz-dados');
  gravar(fora, 'icones/escapou.png'); gravar(fora, 'blender/granabo.blend');
  gravar(fora, prancha); gravar(fora, blender); gravar(fora, icones + '/escapou.png');
  grupo('symlink/junção da pasta de ícones para fora de RAIZ_DADOS não enumera nem resolve', () => {
    const dir = raiz('link-icones');
    fs.mkdirSync(path.join(dir, 'docs/marketing/arsenal'), { recursive: true });
    fs.symlinkSync(path.join(fora, 'icones'), path.join(dir, icones), tipoLink);
    assert.equal(fs.lstatSync(path.join(dir, icones)).isSymbolicLink(), true);
    const m = carregar(dir);
    assert.equal(m.seguranca.listarAssetsDesignSystem().length, 0);
    assert.equal(m.seguranca.resolverEstatico('/' + icones + '/escapou.png'), null);
    conferirAdaptador(m.adaptador, []);
  });
  grupo('symlink/junção intermediária do blender externo não afeta a prancha legítima', () => {
    const dir = raiz('link-blender'); gravar(dir, prancha);
    fs.symlinkSync(path.join(fora, 'blender'), path.join(dir, 'docs/mascote/blender'), tipoLink);
    const m = carregar(dir);
    assert.equal(m.seguranca.resolverEstatico('/' + blender), null);
    assert.ok(m.seguranca.resolverEstatico('/' + prancha));
    conferirAdaptador(m.adaptador, [prancha]);
  });
  grupo('symlink/junção no segmento docs recusa todos os originais externos', () => {
    const dir = raiz('link-docs');
    fs.symlinkSync(path.join(fora, 'docs'), path.join(dir, 'docs'), tipoLink);
    const m = carregar(dir);
    assert.equal(m.seguranca.listarAssetsDesignSystem().length, 0);
    for (const p of [prancha, blender, icones + '/escapou.png']) assert.equal(m.seguranca.resolverEstatico('/' + p), null);
    conferirAdaptador(m.adaptador, []);
  });
  const servidor = servidorReal(isolada, local.seguranca, local.adaptador);
  for (const method of ['GET', 'HEAD']) {
    await grupoAsync(`${method} dos originais exige sessão completa: sem cookie, senha e TOTP recusados`, async () => {
      for (const etapa of [null, 'senha', 'totp']) {
        const cookie = etapa ? servidor.cookie(etapa) : undefined;
        for (const p of [prancha, blender, icones + '/a.png']) {
          const antes = servidor.leituras();
          const r = await servidor.pedir(method, '/' + p, cookie ? { cookie } : {});
          assert.equal(r.status, 401, `${method} ${etapa} ${p}`);
          assert.equal(servidor.leituras(), antes, 'recusa não abre stream');
          assert.ok(!r.body.includes('fixture pública de arquivo'));
        }
      }
    });
    await grupoAsync(`${method} autorizado preserva MIME/extras, cache privado e corpo correto`, async () => {
      const cookie = servidor.cookie('ok');
      for (const p of permitidos) {
        const antes = servidor.leituras();
        const r = await servidor.pedir(method, '/' + p.split('/').map(encodeURIComponent).join('/'), { cookie });
        assert.equal(r.status, 200);
        assert.equal(r.headers['content-type'], p === blender ? 'application/octet-stream' : 'image/png');
        assert.equal(r.headers['x-content-type-options'], 'nosniff');
        assert.equal(r.headers['cache-control'], 'private, no-store');
        assert.equal(Number(r.headers['content-length']), fs.statSync(path.join(isolada, p)).size);
        if (p === blender) assert.equal(r.headers['content-disposition'], 'attachment; filename="granabo.blend"');
        assert.equal(r.body, method === 'HEAD' ? '' : 'fixture pública de arquivo');
        assert.equal(servidor.leituras() - antes, method === 'HEAD' ? 0 : 1);
      }
    });
    await grupoAsync(`${method} com conta revogada ou geração trocada é recusado sem stream`, async () => {
      for (const estado of [{ estado: 'ausente', geracao: 'geracao-fixture' }, { estado: 'ok', geracao: 'outra-geracao' }]) {
        const cookie = servidor.cookie('ok'); Object.assign(servidor.conta, estado);
        const antes = servidor.leituras();
        const r = await servidor.pedir(method, '/' + blender, { cookie });
        assert.equal(r.status, 401); assert.equal(servidor.leituras(), antes);
        assert.ok(r.headers['set-cookie'], 'revogação expira cookie');
        Object.assign(servidor.conta, { estado: 'ok', geracao: 'geracao-fixture' });
      }
    });
    await grupoAsync(`${method} da API design-system só retorna DTO sem caminho físico após login completo`, async () => {
      for (const etapa of [null, 'senha', 'totp', 'ok']) {
        const cookie = etapa ? servidor.cookie(etapa) : undefined;
        const r = await servidor.pedir(method, '/api/design-system', { 'x-grana-admin': '1', ...(cookie ? { cookie } : {}) });
        assert.equal(r.status, etapa === 'ok' ? 200 : 401);
        const corpo = JSON.parse(r.body);
        if (etapa !== 'ok') { assert.equal(corpo.ok, false); assert.equal(corpo.dados, undefined); continue; }
        assert.equal(corpo.ok, true);
        const dto = corpo.dados.originais;
        assert.equal(dto.icones.length, 3);
        const recebidos = [...dto.icones, dto.prancha, dto.blender];
        assert.deepEqual(recebidos.map((a) => a.caminho).sort(), [...permitidos].sort());
        for (const a of recebidos) {
          assert.deepEqual(Object.keys(a).sort(), ['caminho', 'mime', 'nome', 'somenteLeitura', 'url']);
          assert.equal(a.somenteLeitura, true);
        }
        assert.ok(!JSON.stringify(dto).includes(isolada));
        assert.ok(!JSON.stringify(dto).includes(repo));
      }
    });
  }
  await grupoAsync('origem externa e método POST recusam assets; HEAD com Range não abre stream', async () => {
    const cookie = servidor.cookie('ok');
    assert.equal((await servidor.pedir('GET', '/' + blender, { cookie, origin: 'https://externo.invalid' })).status, 403);
    assert.equal((await servidor.pedir('POST', '/' + blender, { cookie })).status, 405);
    const antes = servidor.leituras();
    const r = await servidor.pedir('HEAD', '/' + blender, { cookie, range: 'bytes=0-3' });
    assert.equal(r.status, 206); assert.equal(r.body, ''); assert.equal(servidor.leituras(), antes);
    assert.equal(r.headers['content-type'], 'application/octet-stream');
    assert.equal(r.headers['content-disposition'], 'attachment; filename="granabo.blend"');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
  });
  console.log(`admin-arsenal-allowlist: ${grupos} grupos verdes; 145 PNGs reais, fronteiras temporárias com ${tipoLink}, zero env/rede/escrita nos originais`);
} finally {
  // Só remove a raiz temporária criada acima, após confirmar caminho absoluto
  // e realpath. As junções ficam dentro dela; seus alvos também são fixtures.
  assert.equal(path.dirname(path.resolve(temporaria)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporaria).startsWith('grana-admin-arsenal-'));
  assert.equal(fs.realpathSync(temporaria), temporariaReal);
  fs.rmSync(temporaria, { recursive: true, force: true });
} })().catch((e) => { console.error(e); process.exitCode = 1; });
