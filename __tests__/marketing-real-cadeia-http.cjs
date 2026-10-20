'use strict';
// Cadeia SQL real → módulo remoto → adaptador → Node → HTTP autenticado → consumidor.
// Fixture independente do R0 v9, que permanece byte a byte intacto.
// Transportes Supabase/Storage/Graph dublados; somente HTTP loopback, sem .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Jimp = require('jimp-compact');
const Module = require('node:module');
const ts = require('typescript');
const { criarHttpPublicacoes } = require('./helpers/marketing-real-http.cjs');
// config.cjs lê .env ao carregar. Isola a configuração ANTES de importar o backend.
const configId = require.resolve('../tools/admin-local/config.cjs');
require.cache[configId] = { id: configId, filename: configId, loaded: true, exports: {
  RAIZ: path.resolve(__dirname, '..'), RAIZ_DADOS: os.tmpdir(), SIMULAR: false,
  ler: () => null, tem: () => false, ocultar: String, registrarSegredo: () => {},
} };
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
  comando: ['p_admin', 'p_pedido'],
  snapshot_iniciar: ['p_admin', 'p_pedido'], snapshot_finalizar: ['p_admin', 'p_snapshot', 'p_revisao', 'p_verificacao'],
  previa: ['p_admin', 'p_pedido'], confirmar: ['p_admin', 'p_previa', 'p_hash', 'p_revisao', 'p_idempotencia'],
  consultar: ['p_admin', 'p_filtro'], claim: ['p_worker', 'p_limite'],
  admitir: ['p_worker', 'p_job', 'p_lease', 'p_revisao'], recibo: ['p_worker', 'p_job', 'p_lease', 'p_revisao', 'p_resultado'],
  renovacao_iniciar: ['p_worker'], renovacao_registrar: ['p_worker', 'p_renovacao', 'p_lease', 'p_resultado'],
};

async function testarRecuperacao({ db, cliente, client, http, peca, contas, ig, fb, secret, env, eventos, objetos }) {
  const rpc = async (nome, args) => {
    const r = await cliente.rpc('admin_marketing_real_' + nome, args).abortSignal(new AbortController().signal);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const consulta = async id => (await client.consultar({ jobId: id })).jobs[0];
  const local = horas => new Date(Date.now() + horas * 3600000 - 3 * 3600000).toISOString().slice(0, 16);
  const pv = await client.prever({ peca, contas, horarioLocal: local(4),
    destinos: [{ contaId: ig, rede: 'instagram', formato: 'carrossel' }, { contaId: fb, rede: 'facebook', formato: 'carrossel' }] });
  const lote = await client.confirmar(pv, crypto.randomUUID());
  const ids = lote.jobs.map(j => j.jobId);
  const jobIg = lote.jobs.find(j => j.destino.rede === 'instagram').jobId;
  const jobFb = lote.jobs.find(j => j.destino.rede === 'facebook').jobId;
  await db.exec('reset role');
  await db.query(`update public.admin_marketing_autorizacoes set confirmado_em=now()-interval '2 minutes',publicar_em=now()-interval '1 minute'
    where id in (select autorizacao_id from public.admin_marketing_agendamentos where id=any($1))`, [ids]);
  await db.exec('set role service_role');
  const graph = [];
  let proximoId = 20000;
  const executor = criarExecutorReal({ env: n => env[n], cliente: () => cliente, log: () => {}, rede: async (input, init) => {
    const u = new URL(input), caminho = u.pathname.replace('/v23.0/', '');
    assert.equal(u.origin, 'https://graph.facebook.com');
    const post = init.method === 'POST';
    const params = Object.fromEntries(post ? new URLSearchParams(init.body) : u.searchParams);
    graph.push({ metodo: init.method, caminho, params });
    if (post) {
      const admitido = await db.query(`select 1 from public.admin_marketing_envios v
        join public.admin_marketing_agendamentos g on g.id=v.agendamento_id
        join public.admin_marketing_real_contas c on c.id=g.conta_id
        where c.remoto_id=$1 and v.estado='iniciado' and v.efeito_admitido_em is not null`, [caminho.split('/')[0]]);
      assert.equal(admitido.rows.length, 1, 'efeito admitido no SQL antes de todo POST simulado');
    }
    if (post && ['123/media', '456/photos'].includes(caminho)) return Response.json({ id: String(++proximoId) });
    if (post && caminho === '456/feed') return Response.json({ id: '456_29000' });
    if (post && caminho === '123/media_publish') throw new Error('resposta-perdida-simulada');
    if (!post && caminho === '456_29000') return Response.json({ id: caminho, is_published: true,
      permalink_url: 'https://www.facebook.com/456/posts/29000' });
    if (!post && /^2\d+$/.test(caminho)) return Response.json({ status_code: 'FINISHED' });
    throw new Error('Graph inesperada na recuperação: ' + caminho);
  } });
  async function tick() {
    await db.exec('reset role');
    await db.query(`update public.admin_marketing_envios set iniciado_em=now()-interval '2 minutes'
      where agendamento_id in (select id from public.admin_marketing_agendamentos where estado not in ('publicado','cancelado'))`);
    await db.exec('set role service_role');
    await db.query(`update public.admin_marketing_agendamentos set proxima_verificacao_em=now() where estado not in ('publicado','cancelado')`);
    const r = await executor(new Request('https://fixture.invalid', { method: 'POST',
      headers: { 'x-marketing-real-secret': secret }, body: '{}' }));
    assert.equal(r.status, 200); return r.json();
  }
  await tick();
  assert.ok((await consulta(jobIg)).recibos.every(r => r.operacao === 'preparar'));
  await db.query(`update public.admin_marketing_agendamentos set pausado=true where id=$1`, [jobIg]);
  for (let n = 0; n < 10 && (await consulta(jobFb)).estado !== 'publicado'; n++) await tick();
  const facebook = await consulta(jobFb);
  assert.equal(facebook.estado, 'publicado');
  assert.equal(browser.reagendamentoPermitido(facebook), false);
  assert.equal(facebook.permalink, 'https://www.facebook.com/456/posts/29000');
  const facebookSql = (await db.query('select * from public.admin_marketing_agendamentos where id=$1', [jobFb])).rows[0];
  const facebookRecibos = (await db.query('select * from public.admin_marketing_envios where agendamento_id=$1 order by id', [jobFb])).rows;
  const postsFb = () => graph.filter(c => c.metodo === 'POST' && c.caminho.startsWith('456/')).length;
  const fbAntes = postsFb();

  // Crash durante um segundo preparo privado já admitido. Nenhum publicar existiu.
  await db.query(`update public.admin_marketing_agendamentos set pausado=false,proxima_verificacao_em=now() where id=$1`, [jobIg]);
  const worker = crypto.randomUUID();
  const [lease] = await rpc('claim', { p_worker: worker, p_limite: 1 });
  assert.equal(lease.jobId, jobIg); assert.equal(lease.etapa, 'preparar');
  assert.equal(await rpc('admitir', { p_worker: worker, p_job: jobIg, p_lease: lease.leaseId, p_revisao: lease.revisao }), true);
  await db.exec('reset role');
  await db.query(`update public.admin_marketing_agendamentos set lease_expira_em=now()-interval '1 second' where id=$1`, [jobIg]);
  await db.query(`update public.admin_marketing_controles set pausa_global=true`);
  await db.exec('set role service_role');
  assert.deepEqual(await rpc('claim', { p_worker: worker, p_limite: 1 }), []);
  const interrompido = (await db.query('select * from public.admin_marketing_agendamentos where id=$1', [jobIg])).rows[0];
  assert.equal(interrompido.estado, 'precisa-conferir'); assert.equal(interrompido.etapa_interrompida, 'preparar');
  assert.equal(interrompido.etapa, 'preparar'); assert.equal(interrompido.lease_id, null);
  const recibosAntigos = (await db.query('select * from public.admin_marketing_envios where agendamento_id=$1 order by id', [jobIg])).rows;
  assert.ok(recibosAntigos.every(r => ['preparar', 'consultar-preparo'].includes(r.operacao)));
  assert.ok(recibosAntigos.some(r => r.estado === 'incerto' && r.efeito_admitido_em));
  await db.exec('reset role');
  await db.query(`update public.admin_marketing_controles set pausa_global=false`);
  await db.exec('set role service_role');
  await db.query(`update public.admin_marketing_agendamentos set pausado=true where id=$1`, [jobIg]);
  const antigo = await consulta(jobIg), objetosAntes = objetos.size, eventosAntes = eventos.length;
  const horarioLocal = local(6), destino = { contaId: ig, rede: 'instagram', formato: 'carrossel' };
  assert.equal(browser.reagendamentoPermitido(antigo), true, 'servidor autoriza preparo privado, sem inferir histórico truncado');
  const nova = await client.prever({ job: antigo, contas, destinos: [destino], horarioLocal });
  assert.equal(browser.previaConfirmavel(nova), true);
  assert.equal(nova.snapshot.snapshotId, antigo.snapshotId);
  assert.equal(nova.destinos.length, 1); assert.equal(nova.destinos[0].rede, 'instagram');
  assert.equal(objetos.size, objetosAntes);
  assert.ok(eventos.slice(eventosAntes).every(e => ['previa', 'consultar'].includes(e.acao)), 'reagendamento não recaptura/importa/enviam mídias');
  const comando = { jobId: jobIg, revisaoEsperada: antigo.revisao, idempotencia: crypto.randomUUID(),
    confirmacao: true, previaId: nova.previaId, previaHash: nova.previaHash,
    agendarPara: nova.destinos[0].publicarEm, fuso: 'America/Sao_Paulo' };
  const quantidade = async () => (await db.query('select count(*)::int n from public.admin_marketing_agendamentos')).rows[0].n;
  const quantidadeAntes = await quantidade();
  await assert.rejects(client.confirmar(nova, crypto.randomUUID()), { codigo: 'estado-incompativel', status: 409 });
  await assert.rejects(client.comando('reagendar', { ...comando, previaHash: '0'.repeat(64) }), { codigo: 'revisao-divergente', status: 409 });
  assert.equal(await quantidade(), quantidadeAntes);
  // P2: HTTP conclui de verdade, mas sua resposta se perde antes de chegar ao cliente.
  // A recuperação usa apenas GET pela chave enviada, sem replay do comando.
  let respostaDescartada = false;
  const clientSemResposta = browser.criarClientePublicacoes({ ...http.ctx, acao: async (...args) => {
    await http.ctx.acao(...args);
    respostaDescartada = true;
    throw Object.assign(new Error('resposta-reagendamento-perdida'), { codigo: 'resposta-perdida' });
  } });
  const eventosAntesDoComando = eventos.length;
  await assert.rejects(clientSemResposta.comando('reagendar', comando), { codigo: 'resposta-perdida' });
  assert.equal(respostaDescartada, true, 'P2 resposta HTTP real descartada só após conclusão');
  assert.equal(await quantidade(), quantidadeAntes + 1, 'P2 servidor já criou sucessor apesar da resposta perdida');
  const banco = async () => {
    const dados = {};
    for (const { tablename } of (await db.query(`select tablename from pg_tables where schemaname='public' order by tablename`)).rows)
      dados[tablename] = (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') d from public.${tablename} t`)).rows[0].d;
    return dados;
  };
  const consultarChave = async idempotencia => {
    await db.exec('begin read only');
    try { return await client.consultar({ idempotencia }); }
    finally { await db.exec('rollback'); }
  };
  let dadosAntes = await banco(), graphAntes = graph.length;
  const result = await consultarChave(comando.idempotencia);
  assert.deepEqual(await banco(), dadosAntes, 'P2 GET pela chave não muda tabelas públicas');
  assert.equal(graph.length, graphAntes, 'P2 recuperar resposta não chama Graph');
  assert.equal(eventos.slice(eventosAntesDoComando).filter(e => e.acao === 'comando').length, 1,
    'P2 consulta da chave não reenvia o comando');
  assert.ok(eventos.slice(eventosAntesDoComando).filter(e => e.acao === 'consultar').some(e =>
    e.args.p_filtro.idempotencia === comando.idempotencia), 'P2 chave real atravessa HTTP/adaptador/remoto/SQL');
  assert.equal(result.jobs.length, 1);
  const sucessor = await consulta(result.jobs[0].jobId);
  assert.notEqual(sucessor.jobId, jobIg); assert.equal(sucessor.estado, 'programado-no-painel');
  assert.equal(sucessor.loteId, lote.loteId); assert.equal(sucessor.snapshotId, antigo.snapshotId);
  assert.equal(sucessor.destino.rede, 'instagram'); assert.equal(sucessor.recibos.length, 0);
  const linha = (await db.query('select * from public.admin_marketing_agendamentos where id=$1', [sucessor.jobId])).rows[0];
  assert.equal(linha.substitui_id, jobIg); assert.deepEqual(linha.processamento, {});
  assert.equal(linha.remoto_id, null); assert.equal(linha.lease_id, null); assert.equal(linha.pausado, true);
  assert.equal((await consulta(jobIg)).estado, 'cancelado');
  assert.deepEqual((await db.query('select * from public.admin_marketing_envios where agendamento_id=$1 order by id', [jobIg])).rows, recibosAntigos);
  assert.equal(await quantidade(), quantidadeAntes + 1);
  assert.equal((await client.comando('reagendar', comando)).jobs[0].jobId, sucessor.jobId, 'replay com mesma chave não cria outro sucessor');
  const antesTick = graph.length; await tick(); assert.equal(graph.length, antesTick, 'sucessor pausado e anterior cancelado não enviam');

  // O sucessor começa do zero; perde-se a resposta de seu único media_publish.
  await db.exec('reset role');
  await db.query(`update public.admin_marketing_autorizacoes set confirmado_em=now()-interval '2 minutes',publicar_em=now()-interval '1 minute' where id=$1`, [linha.autorizacao_id]);
  await db.exec('set role service_role');
  await db.query(`update public.admin_marketing_agendamentos set pausado=false where id=$1`, [sucessor.jobId]);
  for (let n = 0; n < 18 && (await consulta(sucessor.jobId)).estado !== 'precisa-conferir'; n++) await tick();
  let incerto = await consulta(sucessor.jobId);
  assert.equal(incerto.estado, 'precisa-conferir');
  assert.equal(incerto.recibos.filter(r => r.operacao === 'publicar').length, 1);
  assert.equal(incerto.recibos.find(r => r.operacao === 'publicar').estado, 'incerto');
  assert.equal(browser.reagendamentoPermitido(incerto), false);
  await assert.rejects(client.prever({ job: incerto, contas, destinos: [destino], horarioLocal }), { codigo: 'estado-incompativel' });
  const publicacoesIg = () => graph.filter(c => c.caminho === '123/media_publish').length;
  assert.equal(publicacoesIg(), 1);
  await assert.rejects(http.ctx.acao('/api/marketing/publicacoes', { acao: 'prever', jobId: incerto.jobId,
    destinos: [destino], agendarPara: nova.destinos[0].publicarEm, fuso: 'America/Sao_Paulo' }), { codigo: 'estado-incompativel', status: 409 });
  await assert.rejects(client.comando('reagendar', { ...comando, jobId: incerto.jobId,
    revisaoEsperada: incerto.revisao, idempotencia: crypto.randomUUID() }), { codigo: 'estado-incompativel', status: 409 });
  await client.comando('reconciliar', { jobId: incerto.jobId, revisaoEsperada: incerto.revisao,
    idempotencia: crypto.randomUUID(), confirmacao: true });
  await tick(); await tick();
  incerto = await consulta(sucessor.jobId);
  assert.equal(incerto.estado, 'precisa-conferir'); assert.equal(publicacoesIg(), 1);
  // A chave original continua apontando para o alvo, agora em estado diferente do recibo.
  dadosAntes = await banco(); graphAntes = graph.length;
  const atual = await consultarChave(comando.idempotencia);
  assert.equal(atual.loteId, lote.loteId);
  assert.deepEqual(json(atual.jobs), json([incerto]), 'P2 chave devolve somente o sucessor no estado atual');
  assert.equal((await db.query('select resultado from public.admin_marketing_real_comandos where admin_id=$1 and idempotencia=$2',
    [env.ADMIN_MARKETING_USER_ID, comando.idempotencia])).rows[0].resultado.jobs[0].estado, 'programado-no-painel');
  const dono = env.ADMIN_MARKETING_USER_ID;
  try {
    env.ADMIN_MARKETING_USER_ID = crypto.randomUUID();
    await assert.rejects(consultarChave(comando.idempotencia), { codigo: 'lote-inexistente', status: 404 });
    assert.deepEqual(json((await client.consultar({ jobId: sucessor.jobId })).jobs), [], 'P2 job alheio não vaza');
    assert.deepEqual(json((await client.consultar({ loteId: lote.loteId })).jobs), [], 'P2 lote alheio não vaza');
    assert.deepEqual(json((await client.listar()).jobs), [], 'P2 lista não expõe jobs de outro ator');
  } finally { env.ADMIN_MARKETING_USER_ID = dono; }
  await assert.rejects(consultarChave(crypto.randomUUID()), { codigo: 'lote-inexistente', status: 404 });
  assert.deepEqual(await banco(), dadosAntes, 'P2 consultas atuais/negativas não fazem mutação');
  assert.equal(graph.length, graphAntes, 'P2 consultas atuais/negativas não fazem Graph nem POST');
  assert.equal(await quantidade(), quantidadeAntes + 1);
  assert.equal(postsFb(), fbAntes, 'zero novo POST Facebook depois de publicado');
  assert.deepEqual((await db.query('select * from public.admin_marketing_agendamentos where id=$1', [jobFb])).rows[0], facebookSql);
  assert.deepEqual((await db.query('select * from public.admin_marketing_envios where agendamento_id=$1 order by id', [jobFb])).rows, facebookRecibos);
  assert.deepEqual(json(await consulta(jobFb)), json(facebook));
  assert.ok((await client.listar()).jobs.every(j => browser.validarJob(j)));
  console.log('  recuperação v1/P2: comando com resposta HTTP perdida → GET pela chave → sucessor e estado atual; owner/zero mutação; publicação incerta 1 POST; Facebook intacto.');
}

async function main() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grana-cadeia-'));
  let http;
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
      '20261018001000_admin_marketing_real.sql', '20261018230000_admin_marketing_renovacao.sql',
      '20261020120000_admin_marketing_real_recuperacao_v1.sql']) {
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
    const antesHttp = eventos.length;
    http = await criarHttpPublicacoes(api, raiz);
    assert.equal(eventos.length, antesHttp, 'autenticação e negativas não chegam à RPC');
    const client = browser.criarClientePublicacoes(http.ctx);
    const contas = (await client.capacidades()).contas;
    if (process.argv.includes('--p2')) {
      await testarRecuperacao({ db, cliente, client, http, peca, contas, ig, fb, secret, env, eventos, objetos });
      console.log('marketing-real-cadeia-http P2: OK — SQL/remoto/adaptador/HTTP autenticado/consumidor; R0 v9 não executado nem alterado.');
      return;
    }
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
    // H1 cd14e3d: recibos reais de consultar-preparo/verificar-publicacao chegam
    // a lista e detalhe finais, sem afrouxar a allowlist do consumidor.
    const final = await client.consultar({ loteId: lote.loteId });
    assert.equal(final.jobs.length, 2);
    assert.ok(final.jobs.every(j => j.estado === 'publicado' && browser.validarJob(j)));
    assert.ok(final.jobs.some(j => j.recibos.some(r => r.operacao === 'consultar-preparo')));
    assert.ok(final.jobs.every(j => j.recibos.some(r => r.operacao === 'verificar-publicacao')));
    assert.deepEqual(json(final.jobs), json(detalhe.jobs));
    const lista = await client.listar();
    assert.deepEqual(lista.jobs.map(j => j.jobId).sort(), final.jobs.map(j => j.jobId).sort());
    const desconhecido = structuredClone(final.jobs[0]);
    desconhecido.recibos[0].operacao = 'operacao-desconhecida';
    assert.equal(browser.validarJob(desconhecido), false);
    assert.deepEqual(detalhe.jobs.map(j => j.permalink).sort(),
      ['https://www.facebook.com/456/posts/8100', 'https://www.instagram.com/p/v9fixture/'].sort());
    const antes = chamadas.length;
    const terminal = await executor(new Request('https://fixture.invalid', { method: 'POST', headers: { 'x-marketing-real-secret': secret }, body: '{}' }));
    assert.equal((await terminal.json()).processados, 0); assert.equal(chamadas.length, antes);
    assert.ok(!JSON.stringify({ logs, detalhe }).includes(token));
    assert.equal(fs.readdirSync(raiz).some(n => n.startsWith('grana-snapshot-')), false);
    await testarRecuperacao({ db, cliente, client, http, peca, contas, ig, fb, secret, env, eventos, objetos });
    console.log('marketing-real-cadeia-http: OK — SQL/remoto/adaptador/HTTP senha+TOTP+CSRF/consumidor; H1 lista+detalhe; 21 chamadas/recibos simulados.');
  } finally {
    if (http) await http.fechar();
    await db.close();
    assert.equal(path.dirname(path.resolve(raiz)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(raiz).startsWith('grana-cadeia-'));
    fs.rmSync(raiz, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
