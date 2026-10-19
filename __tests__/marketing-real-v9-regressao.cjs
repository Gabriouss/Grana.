'use strict';
// R0: caminho do v9 (lote db37d937), antes de qualquer melhoria v2.
// Node, captura, contrato, SQL, executor e Graph são os módulos reais.
// Só transporte Supabase/Storage/Graph é dublado. Sem .env ou rede externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Jimp = require('jimp-compact');
const Module = require('node:module');
const ts = require('typescript');
const { criarPublicacoesReais } = require('../tools/admin-local/adaptadores/marketing-backend.cjs');
const { criarPublicacoes } = require('../tools/admin-local/marketing/publicacoes.cjs');
const { criarEstado } = require('../tools/admin-local/marketing/publicacoes-reais-estado.cjs');
const { criarCapturador } = require('../tools/admin-local/marketing/snapshot-local.cjs');
// Mesmo loader dos testes do executor: imports locais reais, imports npm só de tipos.
const cache = new Map();
function carregar(relativo) {
  const abs = path.resolve(__dirname, '..', relativo);
  if (cache.has(abs)) return cache.get(abs).exports;
  const m = new Module(abs, module);
  cache.set(abs, m);
  m.require = id => id.startsWith('npm:') ? {} : carregar(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(abs), id)));
  m._compile(ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, abs);
  return m.exports;
}
const { criarExecutorReal } = carregar('supabase/functions/_shared/marketing-real-executor.ts');
const sha = (alg, bytes) => crypto.createHash(alg).update(bytes).digest('hex');
const json = v => JSON.parse(JSON.stringify(v));
const browser = { Date, Intl, URLSearchParams };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../tools/admin-local/web/telas/_publicacoes-reais.js'), 'utf8')
  .replace(/^export /gm, ''), browser);
const ARGS = {
  snapshot_iniciar: ['p_admin', 'p_pedido'], snapshot_finalizar: ['p_admin', 'p_snapshot', 'p_revisao', 'p_verificacao'],
  previa: ['p_admin', 'p_pedido'], confirmar: ['p_admin', 'p_previa', 'p_hash', 'p_revisao', 'p_idempotencia'],
  consultar: ['p_admin', 'p_filtro'], claim: ['p_worker', 'p_limite'],
  admitir: ['p_worker', 'p_job', 'p_lease', 'p_revisao'], recibo: ['p_worker', 'p_job', 'p_lease', 'p_revisao', 'p_resultado'],
  renovacao_iniciar: ['p_worker'], renovacao_registrar: ['p_worker', 'p_renovacao', 'p_lease', 'p_resultado'],
};

async function main() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-v9-r0-'));
  const admin = crypto.randomUUID(), ig = crypto.randomUUID(), fb = crypto.randomUUID();
  const secret = 'fixture-executor-'.repeat(3), token = 'fixture-meta-sem-valor-real';
  const env = { ADMIN_MARKETING_USER_ID: admin, MARKETING_REAL_EXECUTOR_ATIVO: 'true',
    MARKETING_REAL_EXECUTOR_SECRET: secret, META_GRAPH_API_VERSION: 'v23.0',
    SUPABASE_URL: 'https://proj.supabase.co', MARKETING_IG_TOKEN: token, MARKETING_FB_TOKEN: token };
  const objetos = new Map(), eventos = [], chamadas = [], inesperadas = [];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
      alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    // As quatro migrations presentes no caminho v4; não aplica a migration de preparo ainda não publicada.
    for (const f of ['20261015190000_admin_marketing_fundacao.sql', '20261016140000_admin_marketing_operacoes.sql',
      '20261018001000_admin_marketing_real.sql', '20261018230000_admin_marketing_renovacao.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', f), 'utf8'));
    }
    await db.exec('set role service_role');
    await db.query(`insert into public.admin_marketing_real_contas
      (id,rede,remoto_id,rotulo,credencial_ref,conexao,valida_ate,pausada,capacidades)
      values($1,'instagram','123','IG fixture','MARKETING_IG_TOKEN','verificada',now()+interval '1 day',false,$3),
      ($2,'facebook','456','FB fixture','MARKETING_FB_TOKEN','verificada',now()+interval '1 day',false,$3)`,
    [ig, fb, [{ formato: 'carrossel', estado: 'disponivel', revisao: 1, motivos: [] }]]);
    await db.exec('reset role');
    await db.query(`update public.admin_marketing_controles set habilitado=true,pausa_global=false,
      pausa_instagram=false,pausa_facebook=false,recuperacao_pendente=false,
      capacidade_validada_em=now(),margem_validada_ate=now()+interval '1 day'`);
    await db.exec('set role service_role');
    const cliente = {
      rpc(nome, args) {
        return { abortSignal: async signal => {
          signal?.throwIfAborted();
          const acao = nome.replace('admin_marketing_real_', '');
          assert.ok(ARGS[acao], 'RPC conhecida: ' + nome);
          eventos.push({ acao, args: json(args) });
          try {
            const r = await db.query(`select public.${nome}(${ARGS[acao].map((_, i) => '$' + (i + 1)).join(',')}) as r`,
              ARGS[acao].map(k => args[k]));
            return { data: r.rows[0].r, error: null };
          } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
        } };
      },
      from(tabela) {
        assert.equal(tabela, 'admin_marketing_real_snapshots');
        let id;
        const q = { select: () => q, eq: (_, v) => { id = v; return q; }, abortSignal: () => q,
          single: () => q.maybeSingle(), maybeSingle: async () => ({ error: null,
            data: (await db.query('select * from public.admin_marketing_real_snapshots where id=$1', [id])).rows[0] }) };
        return q;
      },
      storage: { from(bucket) {
        assert.equal(bucket, 'marketing-remoto');
        return {
          createSignedUploadUrl: async (objeto, options) => {
            assert.equal(options.upsert, false);
            return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/upload/sign/${bucket}/${objeto}?token=fixture` }, error: null };
          },
          createSignedUrl: async objeto => {
            assert.ok(objetos.has(objeto), 'Graph recebe objeto enviado e verificado');
            return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${objeto}?token=fixture` }, error: null };
          },
          download: async objeto => {
            assert.ok(objetos.has(objeto));
            eventos.push({ acao: 'download', objeto });
            return { data: new Blob([objetos.get(objeto)]), error: null };
          },
        };
      } },
    };
    const arquivos = [], originais = [];
    const rel = 'docs/marketing/2026-10/semana-42/aprovados/carrossel-v9/';
    fs.mkdirSync(path.join(raiz, rel), { recursive: true });
    const cores = [0xff0000ff, 0x00ff00ff, 0x0000ffff, 0xffff00ff, 0xff00ffff];
    for (let i = 0; i < 5; i++) {
      const imagem = await new Promise((resolve, reject) => new Jimp(1080, 1440, cores[i], (e, im) => e ? reject(e) : resolve(im)));
      const bytes = await imagem.getBufferAsync('image/png');
      originais.push(bytes);
      const url = '/' + rel + i + '.png';
      fs.writeFileSync(path.join(raiz, url.slice(1)), bytes);
      arquivos.push({ url, tipo: 'imagem', sha1: sha('sha1', bytes) });
    }
    const peca = { id: 'a'.repeat(16), versao: 'b'.repeat(40), titulo: 'Carrossel v9 fixture',
      caminho: rel, tipo: 'carrossel', aprovada: true, legenda: 'Legenda aprovada do carrossel.', arquivos,
      aceite: { id: 'a'.repeat(16), versao: 'b'.repeat(40), caminho: rel,
        aprovadoEm: new Date(Date.now() - 60000).toISOString(), evidencia: 'aceite pelo autor no painel local' } };
    const obterPeca = () => structuredClone(peca);
    const estado = criarEstado({ pasta: path.join(raiz, 'estado') });
    const backend = criarPublicacoesReais({ env: n => env[n], remoto: () => null, cliente: () => cliente,
      relogio: () => new Date(), log: l => eventos.push({ acao: 'log', l }), estado,
      capturar: criarCapturador({ obterPeca, pastaTemporaria: raiz }), rede: async (input, init) => {
        const u = new URL(input);
        assert.equal(u.origin, 'https://proj.supabase.co'); assert.equal(init.method, 'PUT');
        assert.equal(init.redirect, 'error'); assert.equal(init.headers['content-type'], 'image/jpeg');
        const objeto = decodeURIComponent(u.pathname.split('/upload/sign/marketing-remoto/')[1]);
        assert.ok(objeto); assert.equal(objetos.has(objeto), false, 'não sobrescreve snapshot');
        objetos.set(objeto, Buffer.from(init.body)); eventos.push({ acao: 'upload', objeto });
        return new Response(null, { status: 200 });
      } });
    const api = criarPublicacoes({ remoto: backend, estado, obterPeca });
    const client = browser.criarClientePublicacoes({ acao: async (url, corpo) => {
      assert.equal(url, '/api/marketing/publicacoes');
      return json({ ok: true, dados: await api.executar(raiz, json(corpo)) });
    } });
    const contas = json((await api.contas()).contas);
    const horarioLocal = new Date(Date.now() + 7200000 - 3 * 3600000).toISOString().slice(0, 16);
    const previa = await client.prever({ peca, horarioLocal, contas,
      destinos: [{ contaId: ig, rede: 'instagram', formato: 'carrossel' }, { contaId: fb, rede: 'facebook', formato: 'carrossel' }] });
    assert.equal(browser.previaConfirmavel(previa), true, 'prévia SQL aceita pelo consumidor real');
    assert.equal(previa.revisao, 1); assert.equal(previa.snapshot.revisao, 2);
    assert.equal(previa.snapshot.versao, peca.versao);
    assert.equal(objetos.size, 5);
    assert.equal(eventos.filter(e => e.acao === 'confirmar').length, 0);
    const snap = (await db.query('select * from public.admin_marketing_real_snapshots')).rows[0];
    assert.deepEqual(snap.dados.midias.map(m => m.ordem), [0, 1, 2, 3, 4]);
    for (let i = 0; i < 5; i++) {
      const m = snap.dados.midias[i], jpeg = objetos.get(m.objeto);
      assert.equal(m.mime, 'image/jpeg'); assert.equal(m.sha256, sha('sha256', jpeg));
      assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
      assert.deepEqual([m.largura, m.altura], [1080, 1440]);
      const decoded = await Jimp.read(jpeg);
      assert.deepEqual([decoded.bitmap.width, decoded.bitmap.height], [1080, 1440]);
      const pixel = Jimp.intToRGBA(decoded.getPixelColor(540, 720)), expected = Jimp.intToRGBA(cores[i]);
      for (const c of ['r', 'g', 'b']) assert.ok(Math.abs(pixel[c] - expected[c]) <= 3);
      assert.deepEqual(fs.readFileSync(path.join(raiz, arquivos[i].url.slice(1))), originais[i]);
    }
    const ordem = eventos.map(e => e.acao);
    assert.ok(ordem.lastIndexOf('upload') < ordem.indexOf('snapshot_finalizar'));
    assert.ok(ordem.lastIndexOf('download') < ordem.indexOf('snapshot_finalizar'));
    assert.ok(ordem.indexOf('snapshot_finalizar') < ordem.indexOf('previa'));
    const lote = await client.confirmar(previa, crypto.randomUUID());
    assert.ok(lote.loteId);
    const jobs = () => db.query('select g.*,c.rede from public.admin_marketing_agendamentos g join public.admin_marketing_real_contas c on c.id=g.conta_id order by c.rede');
    assert.deepEqual((await jobs()).rows.map(j => [j.rede, j.estado]),
      [['facebook', 'programado-no-painel'], ['instagram', 'programado-no-painel']]);
    // Replay no caminho real não cria outro lote/job.
    assert.equal((await api.executar(raiz, { acao: 'confirmar', previaId: previa.previaId, previaHash: previa.previaHash,
      revisaoEsperada: previa.revisao, idempotencia: crypto.randomUUID(), confirmacao: true })).loteId, lote.loteId);
    assert.equal((await jobs()).rows.length, 2);
    await db.exec('reset role');
    await db.query(`update public.admin_marketing_autorizacoes set confirmado_em=now()-interval '2 minutes',publicar_em=now()-interval '1 minute'`);
    await db.exec('set role service_role');
    const rede = async (input, init) => {
      const u = new URL(input), params = Object.fromEntries(init.method === 'POST' ? new URLSearchParams(init.body) : u.searchParams);
      const caminho = u.pathname.replace('/v23.0/', '');
      assert.equal(u.origin, 'https://graph.facebook.com'); assert.equal(init.headers.Authorization, 'Bearer ' + token);
      assert.ok(init.signal instanceof AbortSignal); assert.equal(init.redirect, 'error');
      chamadas.push({ metodo: init.method, caminho, params });
      if (init.method === 'POST') {
        const r = await db.query(`select v.efeito_admitido_em from public.admin_marketing_envios v
          join public.admin_marketing_agendamentos g on g.id=v.agendamento_id
          join public.admin_marketing_real_contas c on c.id=g.conta_id
          where c.remoto_id=$1 and v.estado='iniciado'`, [caminho.split('/')[0]]);
        assert.ok(r.rows[0]?.efeito_admitido_em, 'admissão gravada antes do transporte');
      }
      const post = init.method === 'POST';
      if (post && caminho === '123/media' && params.is_carousel_item === 'true') {
        const n = chamadas.filter(c => c.caminho === '123/media' && c.params.is_carousel_item === 'true').length;
        assert.equal(params.image_url, `https://proj.supabase.co/storage/v1/object/sign/marketing-remoto/${snap.dados.midias[n - 1].objeto}?token=fixture`);
        return Response.json({ id: String(9000 + n) });
      }
      if (post && caminho === '123/media') {
        assert.deepEqual(params, { media_type: 'CAROUSEL', children: '9001,9002,9003,9004,9005', caption: peca.legenda });
        return Response.json({ id: '9006' });
      }
      if (!post && /^900[1-6]$/.test(caminho)) return Response.json({ status_code: 'FINISHED' });
      if (post && caminho === '123/media_publish') {
        assert.deepEqual(params, { creation_id: '9006' }); return Response.json({ id: '9100' });
      }
      if (post && caminho === '456/photos') {
        const n = chamadas.filter(c => c.caminho === '456/photos').length;
        assert.deepEqual(params, { url: `https://proj.supabase.co/storage/v1/object/sign/marketing-remoto/${snap.dados.midias[n - 1].objeto}?token=fixture`, published: 'false' });
        return Response.json({ id: String(8000 + n) });
      }
      if (post && caminho === '456/feed') {
        assert.deepEqual(params, { message: peca.legenda, attached_media: JSON.stringify([1, 2, 3, 4, 5].map(n => ({ media_fbid: String(8000 + n) }))) });
        return Response.json({ id: '456_8100' });
      }
      if (!post && caminho === '9100') return Response.json({ id: '9100', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/v9fixture/' });
      if (!post && caminho === '456_8100') return Response.json({ id: '456_8100', is_published: true, permalink_url: 'https://www.facebook.com/456/posts/8100' });
      inesperadas.push([init.method, caminho]); throw new Error('Graph inesperada');
    };
    const logs = [];
    const executor = criarExecutorReal({ env: n => env[n], cliente: () => cliente, rede, log: l => logs.push(l) });
    for (let tick = 0; tick < 16; tick++) {
      // Simula o minuto entre cron ticks; mantém a quota real de 12 admissões/minuto.
      await db.exec('reset role');
      await db.query(`update public.admin_marketing_envios set iniciado_em=now()-interval '2 minutes'`);
      await db.exec('set role service_role');
      await db.query('update public.admin_marketing_agendamentos set proxima_verificacao_em=now()');
      const response = await executor(new Request('https://fixture.invalid', { method: 'POST',
        headers: { 'x-marketing-real-secret': secret }, body: '{}' }));
      assert.equal(response.status, 200); assert.equal((await response.json()).incertos, 0);
      if ((await jobs()).rows.every(j => j.estado === 'publicado')) break;
    }
    assert.deepEqual(inesperadas, []);
    assert.deepEqual((await jobs()).rows.map(j => [j.rede, j.estado, j.remoto_id]),
      [['facebook', 'publicado', '456_8100'], ['instagram', 'publicado', '9100']]);
    // Gabarito dos recibos Keel: IG seis ciclos privados, um publicar e um readback;
    // FB cinco fotos privadas, um feed e um readback. Não impõe ordem entre redes concorrentes.
    assert.deepEqual(chamadas.filter(c => c.caminho.startsWith('123/') || /^9\d+$/.test(c.caminho)).map(c => c.metodo + ' ' + c.caminho),
      [1, 2, 3, 4, 5, 6].flatMap(n => ['POST 123/media', `GET ${9000 + n}`]).concat(['POST 123/media_publish', 'GET 9100']));
    assert.deepEqual(chamadas.filter(c => c.caminho.startsWith('456')).map(c => c.metodo + ' ' + c.caminho),
      [...Array(5).fill('POST 456/photos'), 'POST 456/feed', 'GET 456_8100']);
    const recibos = (await db.query(`select c.rede,v.operacao,v.estado from public.admin_marketing_envios v
      join public.admin_marketing_agendamentos g on g.id=v.agendamento_id join public.admin_marketing_real_contas c on c.id=g.conta_id`)).rows;
    assert.equal(recibos.length, 21);
    assert.ok(recibos.every(r => r.estado === 'confirmado'));
    for (const rede of ['instagram', 'facebook']) {
      assert.equal(recibos.filter(r => r.rede === rede && r.operacao === 'publicar').length, 1);
      assert.equal(recibos.filter(r => r.rede === rede && r.operacao === 'verificar-publicacao').length, 1);
    }
    const detalhe = await api.detalhe({ loteId: lote.loteId });
    assert.deepEqual(detalhe.jobs.map(j => j.permalink).sort(),
      ['https://www.facebook.com/456/posts/8100', 'https://www.instagram.com/p/v9fixture/'].sort());
    const antes = chamadas.length;
    const terminal = await executor(new Request('https://fixture.invalid', { method: 'POST', headers: { 'x-marketing-real-secret': secret }, body: '{}' }));
    assert.equal((await terminal.json()).processados, 0); assert.equal(chamadas.length, antes);
    assert.ok(!JSON.stringify({ logs, detalhe }).includes(token));
    assert.equal(fs.readdirSync(raiz).some(n => n.startsWith('grana-snapshot-')), false);
    console.log('marketing-real-v9-regressao: OK — 5 PNG → JPEG 1080×1440; prévia/confirmar/replay; IG+FB; 21 chamadas Graph e 21 recibos; publicado só após readback.');
  } finally {
    await db.close();
    assert.equal(path.dirname(path.resolve(raiz)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(raiz).startsWith('grana-v9-r0-'));
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
